const { Router } = require("express");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const {
  safeIdentifier,
  portfolioForUser,
  portfoliosForUser,
  portfoliosForSupervisor,
  guiColumns,
  formatClient,
} = require("../utils/field");

const router = Router();
router.use(requireAuth);

function dateValue(input) {
  if (!input) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input))
    throw Object.assign(new Error("Fecha inválida."), { status: 400 });
  return input;
}
function weekRange(date) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay() || 7;
  const monday = new Date(value);
  monday.setDate(value.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const serialize = (item) => item.toISOString().slice(0, 10);
  return {
    referenceDate: date,
    startDate: serialize(monday),
    endDate: serialize(sunday),
  };
}
function visitState(code, description) {
  const normalized = String(code || "PENDIENTE").toUpperCase();
  return {
    code: normalized,
    description: description || "Pendiente",
    completed: ["VISITADO", "GESTIONADO", "CERRADO"].includes(normalized),
  };
}

router.get("/initial", async (req, res, next) => {
  try {
    const portfolios = req.user.isSupervisor
      ? await portfoliosForSupervisor(req.user.id)
      : await portfoliosForUser(req.user.id);
    res.json({
      profile: req.user,
      portfolios,
      week: weekRange(dateValue(req.query.date)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/location", async (req, res, next) => {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const accuracy = req.body.accuracy === null || req.body.accuracy === undefined ? null : Number(req.body.accuracy);
    const active = req.body.active !== false ? 1 : 0;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ message: "Coordenadas inválidas." });
    await pool.execute(
      `INSERT INTO geocampo_ubicacion_actual (id_personal, latitud, longitud, precision_metros, jornada_activa)
       VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE latitud = VALUES(latitud), longitud = VALUES(longitud), precision_metros = VALUES(precision_metros), jornada_activa = VALUES(jornada_activa), actualizado_en = CURRENT_TIMESTAMP`,
      [req.user.id, latitude, longitude, Number.isFinite(accuracy) ? accuracy : null, active],
    );
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/route", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const table = safeIdentifier(portfolio.table_name);
    const week = weekRange(dateValue(req.query.date));
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const filters = [
      "hr.id_asesor = ?",
      "COALESCE(hr.tipo_ruta, 'DIARIA') = 'SEMANAL'",
      "COALESCE(tb.ESTADO, 'ACTIVO') = 'ACTIVO'",
      "((hr.id_periodo IS NULL AND hr.fecha_inicio_semana = ? AND hr.fecha_fin_semana = ?) OR hr.id_periodo IN (SELECT id_periodo FROM geocampo_periodo WHERE activo = 1 AND ? BETWEEN fecha_inicio AND fecha_fin))",
    ];
    const params = [
      req.user.id,
      week.startDate,
      week.endDate,
      week.referenceDate,
    ];
    if (query) {
      filters.push(
        "(tb.IDENTIFICADOR LIKE ? OR COALESCE(tb.DOCUMENTO, '') LIKE ? OR COALESCE(tb.NOMBRE, '') LIKE ? OR COALESCE(tb.NUMEROCUENTA, '') LIKE ?)",
      );
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    const where = filters.join(" AND ");
    const [summaryRows] = await pool.execute(
      `
      SELECT COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(ev.codigo, 'PENDIENTE') IN ('VISITADO','GESTIONADO','CERRADO') THEN 1 ELSE 0 END) AS completed
      FROM geocampo_hoja_ruta hr
      INNER JOIN geocampo_hoja_ruta_detalle hrd ON hrd.id_hoja_ruta = hr.id_hoja_ruta
      INNER JOIN geocampo_asignacion ga ON ga.id_asignacion = hrd.id_asignacion AND ga.activo = 1 AND ga.id_asesor = hr.id_asesor
      INNER JOIN ${table} tb ON tb.id = ga.id_cuenta_campo
      LEFT JOIN geocampo_estado_visita ev ON ev.id_estado_visita = hrd.id_estado_visita
      WHERE ${where}`,
      params,
    );
    const [rows] = await pool.execute(
      `
      SELECT tb.id AS account_id, tb.IDENTIFICADOR AS identifier, COALESCE(tb.DOCUMENTO, tb.IDENTIFICADOR) AS document,
        COALESCE(tb.NOMBRE, '') AS name, COALESCE(tb.NUMEROCUENTA, '') AS account,
        hrd.id_detalle AS route_detail_id, hrd.orden_visita AS visit_order, hrd.fecha_agendada AS scheduled_at,
        hrd.fecha_visita AS visited_at, COALESCE(ev.codigo, 'PENDIENTE') AS status_code,
        COALESCE(ev.descripcion, 'Pendiente') AS status_description, COALESCE(visits.total, 0) AS management_count
      FROM geocampo_hoja_ruta hr
      INNER JOIN geocampo_hoja_ruta_detalle hrd ON hrd.id_hoja_ruta = hr.id_hoja_ruta
      INNER JOIN geocampo_asignacion ga ON ga.id_asignacion = hrd.id_asignacion AND ga.activo = 1 AND ga.id_asesor = hr.id_asesor
      INNER JOIN ${table} tb ON tb.id = ga.id_cuenta_campo
      LEFT JOIN geocampo_estado_visita ev ON ev.id_estado_visita = hrd.id_estado_visita
      LEFT JOIN (SELECT IDENTIFICADOR, COUNT(*) AS total FROM GEOCAMPO WHERE IDCARTERA = ? GROUP BY IDENTIFICADOR) visits ON visits.IDENTIFICADOR = tb.IDENTIFICADOR
      WHERE ${where}
      ORDER BY DATE(hrd.fecha_agendada), hrd.orden_visita, hrd.id_detalle LIMIT ?`,
      [portfolio.id_cartera, ...params, limit],
    );
    const items = rows.map((row) => ({
      ...row,
      state: visitState(row.status_code, row.status_description),
      portfolio: {
        idTable: portfolio.id_table,
        idCartera: portfolio.id_cartera,
        name: portfolio.name,
      },
    }));
    res.json({
      portfolio,
      week,
      summary: {
        total: Number(summaryRows[0]?.total || 0),
        completed: Number(summaryRows[0]?.completed || 0),
      },
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/clients", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const table = safeIdentifier(portfolio.table_name);
    const fields = await guiColumns(portfolio.id_table);
    const query = String(req.query.q || "").trim();
    if (query.length < 2) return res.json({ portfolio, items: [] });
    const pattern = `%${query}%`;
    const [rows] = await pool.execute(
      `SELECT * FROM ${table} WHERE IDENTIFICADOR LIKE ? OR COALESCE(DOCUMENTO, '') LIKE ? OR COALESCE(NOMBRE, '') LIKE ? LIMIT 50`,
      [pattern, pattern, pattern],
    );
    res.json({
      portfolio,
      items: rows.map((row) => formatClient(row, portfolio, fields)),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/clients/:identifier", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const fields = await guiColumns(portfolio.id_table);
    const table = safeIdentifier(portfolio.table_name);
    const [rows] = await pool.execute(
      `SELECT * FROM ${table} WHERE IDENTIFICADOR = ? LIMIT 1`,
      [req.params.identifier],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ message: "Cliente no encontrado en la cartera asignada." });
    res.json({ item: formatClient(rows[0], portfolio, fields) });
  } catch (error) {
    next(error);
  }
});

router.get("/clients/:identifier/history", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const [rows] = await pool.execute(
      `
      SELECT g.ID AS id, g.FECHA AS created_at, COALESCE(g.HoraRegistro, TIME(g.FECHA)) AS time,
        e.EFECTO AS effect, m.MOTIVO AS reason, g.OBSERVACION AS observation,
        g.FECHA_PROMESA AS promise_date, g.MONTO_PROMESA AS promise_amount, g.latitud, g.longitud
      FROM GEOCAMPO g
      LEFT JOIN efecto e ON e.IDEFECTO = g.IDEFECTO
      LEFT JOIN motivo m ON m.IDMOTIVO = g.IDMOTIVO
      WHERE g.IDENTIFICADOR = ? AND g.IDCARTERA = ?
      ORDER BY g.FECHA DESC, g.ID DESC LIMIT 100`,
      [req.params.identifier, portfolio.id_cartera],
    );
    res.json({ portfolio, items: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
