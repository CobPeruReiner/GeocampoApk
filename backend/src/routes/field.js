const { Router } = require("express");
const fs = require("fs/promises");
const path = require("path");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const {
  safeIdentifier,
  firstValue,
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

async function account(portfolio, identifier) {
  const table = safeIdentifier(portfolio.table_name);
  const [rows] = await pool.execute(
    `SELECT * FROM ${table} WHERE IDENTIFICADOR = ? LIMIT 1`,
    [identifier],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('La cuenta no está disponible en la cartera seleccionada.'), { status: 404 });
  }
  return rows[0];
}

function historyCategory(id, value) {
  const category = String(value || '').trim().toUpperCase();
  if (Number(id) === 5 || category.includes('DIRECTO')) return { code: 'CD', name: 'Contacto directo' };
  if (Number(id) === 11 || category.includes('INDIRECTO')) return { code: 'CI', name: 'Contacto indirecto' };
  if (Number(id) === 10 || category.includes('NO CONTACTO')) return { code: 'NC', name: 'No contacto' };
  return { code: 'OTROS', name: value || 'Sin categoría' };
}

function formatManagement(row, source) {
  const field = source === 'CAMPO';
  const createdAt = row.created_at || row.fecha_raw;
  return {
    id: Number(row.id),
    source,
    source_label: field ? 'Campo' : 'Call',
    created_at: createdAt,
    time: row.time || '',
    identifier: row.identifier || '',
    // Same fallback used by ruta_asesor_api.php: a historical management
    // must still identify its effect when the catalog record was retired.
    effect: row.effect || (row.effect_id ? String(row.effect_id) : ''),
    effect_id: Number(row.effect_id || 0) || null,
    reason: row.reason || '',
    contact: row.contact || '',
    observation: row.observation || '',
    phone: row.phone || '',
    floors: row.floors || '',
    door: row.door || '',
    facade: row.facade || '',
    promise_date: row.promise_date || null,
    promise_amount: row.promise_amount || null,
    latitud: row.latitud === null || row.latitud === undefined ? null : Number(row.latitud),
    longitud: row.longitud === null || row.longitud === undefined ? null : Number(row.longitud),
    gps_status: row.gps_status || '',
    category: historyCategory(row.category_id, row.category),
    evidence_count: field ? [row.image1, row.image2, row.image3].filter(Boolean).length : 0,
    evidence: field
      ? [row.image1, row.image2, row.image3]
        .map((name, index) => name ? { slot: index + 1, name: String(name) } : null)
        .filter(Boolean)
      : [],
  };
}

function evidenceDirectory() {
  const backendRoot = path.resolve(__dirname, "..", "..");
  return process.env.GEOCAMPO_PHOTOS_DIR
    ? path.resolve(backendRoot, process.env.GEOCAMPO_PHOTOS_DIR)
    : path.join(backendRoot, "storage", "evidence");
}

async function findEvidenceFile(portfolio, name, createdAt) {
  const safeName = path.basename(String(name || ""));
  if (!safeName || safeName !== name) return null;
  const root = evidenceDirectory();
  const portfolioDirectory = String(portfolio.table_name).replace(/^C_/, "");
  const date = createdAt instanceof Date
    ? createdAt.toISOString().slice(0, 10)
    : String(createdAt || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!date) return null;
  const file = path.join(root, portfolioDirectory, date, safeName);
  try { return (await fs.stat(file)).isFile() ? file : null; }
  catch { return null; }
}

async function managementHistory(portfolio, identifier) {
  const [fieldRows] = await pool.execute(
    `SELECT g.ID AS id, g.FECHA AS created_at, COALESCE(g.HoraRegistro, TIME(g.FECHA)) AS time,
      g.IDENTIFICADOR AS identifier, g.IDEFECTO AS effect_id, e.EFECTO AS effect,
      e.IDCATEGORIA AS category_id, cat.CATEGORIA AS category, m.MOTIVO AS reason,
      c.CONTACTO AS contact, g.OBSERVACION AS observation, g.NOMCONTACTO AS phone,
      g.PISOS AS floors, g.PUERTA AS door, g.FACHADA AS facade, g.FECHA_PROMESA AS promise_date,
      g.MONTO_PROMESA AS promise_amount, g.latitud, g.longitud,
      gps.NOMBRE_GEOCAMPO_ESTADO_GPS AS gps_status, g.imagen1 AS image1, g.imagen2 AS image2, g.imagen3 AS image3
    FROM GEOCAMPO g
    LEFT JOIN efecto e ON e.IDEFECTO = g.IDEFECTO
    LEFT JOIN categoria cat ON cat.IDCATEGORIA = e.IDCATEGORIA
    LEFT JOIN motivo m ON m.IDMOTIVO = g.IDMOTIVO
    LEFT JOIN contacto c ON c.IDCONTACTO = g.IDCONTACTO
    LEFT JOIN GEOCAMPO_ESTADO_GPS gps ON gps.ID_GEOCAMPO_ESTADO_GPS = g.ID_GEOCAMPO_ESTADO_GPS
    WHERE g.IDENTIFICADOR = ? AND g.IDCARTERA = ?
    ORDER BY g.FECHA DESC, g.ID DESC`,
    [identifier, portfolio.id_cartera],
  );
  const [callRows] = await pool.execute(
    `SELECT gt.id AS id, gt.fecha_tmk AS created_at, TIME(gt.fecha_tmk) AS time,
      gt.IDENTIFICADOR AS identifier, gt.IDEFECTO AS effect_id, e.EFECTO AS effect,
      e.IDCATEGORIA AS category_id, cat.CATEGORIA AS category, m.MOTIVO AS reason,
      c.CONTACTO AS contact, gt.OBSERVACION AS observation, gt.IDTELEFONO AS phone,
      gt.PISOS AS floors, gt.PUERTA AS door, gt.FACHADA AS facade, gt.fecha_promesa AS promise_date,
      gt.monto_promesa AS promise_amount, NULL AS latitud, NULL AS longitud,
      NULL AS gps_status, NULL AS image1, NULL AS image2, NULL AS image3
    FROM gestion_tmk gt
    LEFT JOIN efecto e ON e.IDEFECTO = gt.IDEFECTO
    LEFT JOIN categoria cat ON cat.IDCATEGORIA = e.IDCATEGORIA
    LEFT JOIN motivo m ON m.IDMOTIVO = gt.IDMOTIVO
    LEFT JOIN contacto c ON c.IDCONTACTO = gt.IDCONTACTO
    WHERE gt.IDENTIFICADOR = ? AND (gt.ID_CARTERA = ? OR gt.id_table = ?)
    ORDER BY gt.fecha_tmk DESC, gt.id DESC`,
    [identifier, portfolio.id_cartera, portfolio.id_table],
  );
  const items = [...fieldRows.map((row) => formatManagement(row, 'CAMPO')), ...callRows.map((row) => formatManagement(row, 'CALL'))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id);
  const summary = { CAMPO: { total: 0, CD: 0, CI: 0, NC: 0, OTROS: 0 }, CALL: { total: 0, CD: 0, CI: 0, NC: 0, OTROS: 0 } };
  for (const item of items) {
    summary[item.source].total += 1;
    summary[item.source][item.category.code] = (summary[item.source][item.category.code] || 0) + 1;
  }
  return { items, summary };
}

async function assignmentForAccount(portfolio, userId, identifier) {
  const table = safeIdentifier(portfolio.table_name);
  const [rows] = await pool.execute(
    `SELECT ga.id_asignacion, ga.id_cuenta_campo, c.IDENTIFICADOR
    FROM geocampo_asignacion ga
    INNER JOIN ${table} c ON c.id = ga.id_cuenta_campo
    WHERE ga.id_asesor = ? AND ga.id_table = ? AND ga.id_cartera = ? AND ga.activo = 1 AND c.IDENTIFICADOR = ?
    ORDER BY ga.id_asignacion DESC LIMIT 1`,
    [userId, portfolio.id_table, portfolio.id_cartera, identifier],
  );
  if (!rows[0]) throw Object.assign(new Error('Esta cuenta no tiene una asignación activa para tu usuario.'), { status: 404 });
  const client = await account(portfolio, identifier);
  const document = firstValue(client, ['DOCUMENTO', 'DNI']);
  if (!document) return rows[0];
  // The legacy application maps F CONFIANZA CAMPO (table 1893) to source 10
  // and FINANCIERA EFECTIVA CAMPO to source 11. `cliente.id` is not the
  // source value, so using it here hid valid addresses on mobile.
  const directionSource = Number(portfolio.id_table) === 1893 || /CONFIANZA/i.test(String(portfolio.table_name || portfolio.name || '')) ? 10 : 11;
  const [directions] = await pool.execute(
    `SELECT COALESCE(d.DIRECCION_DEPURADA, d.DIRECCION, '') AS address, COALESCE(d.DISTRITO, '') AS district,
      COALESCE(d.DEPARTAMENTO, '') AS department, COALESCE(d.PROVINCIA, '') AS province
    FROM direcciones d WHERE d.DOC = ? AND d.IDESTADO = 1
      AND d.FUENTE = ?
    ORDER BY d.FECHA_ACTUALIZACION DESC, d.IDDIRECCION DESC LIMIT 1`,
    [String(document), directionSource],
  );
  return { ...rows[0], ...(directions[0] || {}) };
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
    const portfolio = await portfolioForUser(req.user.id, req.body.idTable);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ message: "Coordenadas inválidas." });
    await pool.execute(
      `INSERT INTO geocampo_ubicacion_actual (id_personal, latitud, longitud, precision_metros, jornada_activa)
       VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE latitud = VALUES(latitud), longitud = VALUES(longitud), precision_metros = VALUES(precision_metros), jornada_activa = VALUES(jornada_activa), actualizado_en = CURRENT_TIMESTAMP`,
      [req.user.id, latitude, longitude, Number.isFinite(accuracy) ? accuracy : null, active],
    );
    const event = active ? 'location:update' : 'location:inactive';
    req.app.get('io')?.to(`supervisor:${portfolio.id_cartera}`).emit(event, {
      advisorId: req.user.id,
      idCartera: portfolio.id_cartera,
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      updatedAt: new Date().toISOString(),
    });
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
        ga.id_asignacion AS assignment_id, hrd.id_detalle AS route_detail_id, hrd.orden_visita AS visit_order, hrd.fecha_agendada AS scheduled_at,
        hrd.fecha_visita AS visited_at, COALESCE(ev.codigo, 'PENDIENTE') AS status_code,
        COALESCE(ev.descripcion, 'Pendiente') AS status_description, COALESCE(visits.total, 0) AS management_count,
        dc.latitud AS latitude, dc.longitud AS longitude,
        COALESCE(dc.direccion_corregida, dc.direccion_search, '') AS address
      FROM geocampo_hoja_ruta hr
      INNER JOIN geocampo_hoja_ruta_detalle hrd ON hrd.id_hoja_ruta = hr.id_hoja_ruta
      INNER JOIN geocampo_asignacion ga ON ga.id_asignacion = hrd.id_asignacion AND ga.activo = 1 AND ga.id_asesor = hr.id_asesor
      INNER JOIN ${table} tb ON tb.id = ga.id_cuenta_campo
      LEFT JOIN geocampo_direccion_corregida dc ON dc.id_direccion_corregida = (
        SELECT latest.id_direccion_corregida FROM geocampo_direccion_corregida latest
        WHERE latest.id_asignacion = ga.id_asignacion
        ORDER BY latest.id_direccion_corregida DESC LIMIT 1
      )
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
    // Una asignación y una parada de ruta no son lo mismo. La web solo lista
    // las paradas de la hoja semanal; exponemos las asignaciones sin programar
    // por separado para que el asesor no pierda visibilidad de ellas.
    const [unplannedRows] = await pool.execute(
      `SELECT tb.id AS account_id, tb.IDENTIFICADOR AS identifier,
        COALESCE(tb.DOCUMENTO, tb.IDENTIFICADOR) AS document, COALESCE(tb.NOMBRE, '') AS name,
        COALESCE(tb.NUMEROCUENTA, '') AS account, ga.id_asignacion AS assignment_id,
        COALESCE(visits.total, 0) AS management_count,
        dc.latitud AS latitude, dc.longitud AS longitude,
        COALESCE(dc.direccion_corregida, dc.direccion_search, '') AS address
      FROM geocampo_asignacion ga
      INNER JOIN ${table} tb ON tb.id = ga.id_cuenta_campo
      LEFT JOIN geocampo_direccion_corregida dc ON dc.id_direccion_corregida = (
        SELECT latest.id_direccion_corregida FROM geocampo_direccion_corregida latest
        WHERE latest.id_asignacion = ga.id_asignacion
        ORDER BY latest.id_direccion_corregida DESC LIMIT 1
      )
      LEFT JOIN (SELECT IDENTIFICADOR, COUNT(*) AS total FROM GEOCAMPO WHERE IDCARTERA = ? GROUP BY IDENTIFICADOR) visits ON visits.IDENTIFICADOR = tb.IDENTIFICADOR
      WHERE ga.id_asesor = ? AND ga.id_table = ? AND ga.id_cartera = ? AND ga.activo = 1
        AND COALESCE(tb.ESTADO, 'ACTIVO') = 'ACTIVO'
        AND NOT EXISTS (
          SELECT 1 FROM geocampo_hoja_ruta hr
          INNER JOIN geocampo_hoja_ruta_detalle hrd ON hrd.id_hoja_ruta = hr.id_hoja_ruta
          WHERE hrd.id_asignacion = ga.id_asignacion AND hr.id_asesor = ?
            AND COALESCE(hr.tipo_ruta, 'DIARIA') = 'SEMANAL'
            AND ((hr.id_periodo IS NULL AND hr.fecha_inicio_semana = ? AND hr.fecha_fin_semana = ?)
              OR hr.id_periodo IN (SELECT id_periodo FROM geocampo_periodo WHERE activo = 1 AND ? BETWEEN fecha_inicio AND fecha_fin))
        )
      ORDER BY ga.fecha_asignacion DESC, ga.id_asignacion DESC LIMIT ?`,
      [portfolio.id_cartera, req.user.id, portfolio.id_table, portfolio.id_cartera, req.user.id, week.startDate, week.endDate, week.referenceDate, limit],
    );
    const unplanned = unplannedRows.map((row) => ({
      ...row,
      route_detail_id: 0,
      state: visitState('SIN_PROGRAMAR', 'Sin programar'),
      portfolio: { idTable: portfolio.id_table, idCartera: portfolio.id_cartera, name: portfolio.name },
    }));
    res.json({
      portfolio,
      week,
      summary: {
        total: Number(summaryRows[0]?.total || 0),
        completed: Number(summaryRows[0]?.completed || 0),
        unplanned: unplanned.length,
      },
      items,
      unplanned,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/route', async (req, res, next) => {
  let connection;
  try {
    const portfolio = await portfolioForUser(req.user.id, req.body.idTable);
    const week = weekRange(dateValue(req.body.date));
    const assignmentIds = [...new Set((Array.isArray(req.body.assignmentIds) ? req.body.assignmentIds : [])
      .map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (!assignmentIds.length) return res.status(400).json({ message: 'Selecciona al menos una cuenta para crear tu ruta semanal.' });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const placeholders = assignmentIds.map(() => '?').join(',');
    const [owned] = await connection.execute(
      `SELECT id_asignacion FROM geocampo_asignacion
       WHERE id_asesor = ? AND id_table = ? AND id_cartera = ? AND activo = 1
         AND id_asignacion IN (${placeholders})`,
      [req.user.id, portfolio.id_table, portfolio.id_cartera, ...assignmentIds],
    );
    if (owned.length !== assignmentIds.length) {
      throw Object.assign(new Error('Una o más cuentas ya no están asignadas a tu usuario. Actualiza la lista e inténtalo nuevamente.'), { status: 409 });
    }
    const catalog = async (table, column, code) => {
      const [rows] = await connection.execute(`SELECT ${column} AS id FROM ${table} WHERE codigo = ? AND activo = 1 LIMIT 1`, [code]);
      if (!rows[0]) throw new Error(`No está disponible el catálogo ${code}.`);
      return Number(rows[0].id);
    };
    const [periods] = await connection.execute('SELECT id_periodo, nombre FROM geocampo_periodo WHERE activo = 1 AND ? BETWEEN fecha_inicio AND fecha_fin ORDER BY fecha_inicio DESC LIMIT 1', [week.referenceDate]);
    const criterion = await catalog('geocampo_criterio_ruta', 'id_criterio_ruta', 'PERSONALIZADO');
    const routeState = await catalog('geocampo_estado_ruta', 'id_estado_ruta', 'CREADA');
    const scheduled = await catalog('geocampo_estado_visita', 'id_estado_visita', 'AGENDADO');
    const cancelled = await catalog('geocampo_estado_visita', 'id_estado_visita', 'CANCELADO');
    const assignmentState = await catalog('geocampo_estado_asignacion', 'id_estado_asignacion', 'AGENDADO');
    const [routes] = await connection.execute(
      `SELECT hr.id_hoja_ruta FROM geocampo_hoja_ruta hr
       INNER JOIN geocampo_estado_ruta er ON er.id_estado_ruta = hr.id_estado_ruta
       WHERE hr.id_asesor = ? AND COALESCE(hr.tipo_ruta, 'DIARIA') = 'SEMANAL'
         AND hr.fecha_inicio_semana = ? AND hr.fecha_fin_semana = ? AND er.codigo IN ('CREADA', 'EN_PROCESO')
       ORDER BY hr.id_hoja_ruta DESC LIMIT 1`, [req.user.id, week.startDate, week.endDate]);
    const routeName = `Ruta semanal ${week.startDate} al ${week.endDate} - ${periods[0]?.nombre || week.referenceDate}`;
    let routeId = Number(routes[0]?.id_hoja_ruta || 0);
    const action = routeId ? 'updated' : 'created';
    if (routeId) {
      await connection.execute('UPDATE geocampo_hoja_ruta SET nombre_ruta = ?, id_criterio_ruta = ?, id_periodo = ?, fecha_actualizacion = NOW(), id_usuario_actualizacion = ? WHERE id_hoja_ruta = ?', [routeName, criterion, periods[0]?.id_periodo || null, req.user.id, routeId]);
    } else {
      const [created] = await connection.execute("INSERT INTO geocampo_hoja_ruta (id_asesor, id_periodo, nombre_ruta, id_criterio_ruta, id_estado_ruta, tipo_ruta, fecha_ruta, fecha_inicio_semana, fecha_fin_semana, fecha_creacion, fecha_actualizacion, id_usuario_actualizacion) VALUES (?, ?, ?, ?, ?, 'SEMANAL', ?, ?, ?, NOW(), NOW(), ?)", [req.user.id, periods[0]?.id_periodo || null, routeName, criterion, routeState, week.startDate, week.startDate, week.endDate, req.user.id]);
      routeId = Number(created.insertId);
    }
    const [existing] = await connection.execute('SELECT d.id_detalle, d.id_asignacion, ev.codigo AS status FROM geocampo_hoja_ruta_detalle d LEFT JOIN geocampo_estado_visita ev ON ev.id_estado_visita = d.id_estado_visita WHERE d.id_hoja_ruta = ?', [routeId]);
    const selected = new Set(assignmentIds); const byAssignment = new Map(existing.map((row) => [Number(row.id_asignacion), row]));
    for (const detail of existing) if (!selected.has(Number(detail.id_asignacion)) && detail.status !== 'VISITADO') await connection.execute('UPDATE geocampo_hoja_ruta_detalle SET id_estado_visita = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?', [cancelled, detail.id_detalle]);
    for (const [index, assignmentId] of assignmentIds.entries()) {
      const order = index + 1; const detail = byAssignment.get(assignmentId);
      if (detail) {
        if (detail.status === 'VISITADO') await connection.execute('UPDATE geocampo_hoja_ruta_detalle SET orden_visita = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?', [order, detail.id_detalle]);
        else await connection.execute('UPDATE geocampo_hoja_ruta_detalle SET orden_visita = ?, fecha_agendada = ?, id_estado_visita = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?', [order, `${week.startDate} 09:00:00`, scheduled, detail.id_detalle]);
      } else await connection.execute('INSERT INTO geocampo_hoja_ruta_detalle (id_hoja_ruta, id_asignacion, es_reprogramado, orden_visita, id_estado_visita, fecha_agendada, bloqueado, fecha_registro, fecha_actualizacion) VALUES (?, ?, 0, ?, ?, ?, 0, NOW(), NOW())', [routeId, assignmentId, order, scheduled, `${week.startDate} 09:00:00`]);
      await connection.execute('UPDATE geocampo_asignacion SET id_estado_asignacion = ?, fecha_actualizacion = NOW() WHERE id_asignacion = ? AND id_asesor = ? AND activo = 1', [assignmentState, assignmentId, req.user.id]);
    }
    await connection.execute('INSERT INTO geocampo_hoja_ruta_historial (id_hoja_ruta, tipo_evento, valor_nuevo, observacion, id_usuario, fecha_evento) VALUES (?, ?, ?, ?, ?, NOW())', [routeId, action === 'created' ? 'CREACION_RUTA' : 'ACTUALIZACION_ORDEN', String(assignmentIds.length), 'Ruta semanal guardada desde la aplicación móvil por el gestor.', req.user.id]);
    await connection.commit();
    res.status(201).json({ message: action === 'created' ? 'Tu ruta semanal fue creada.' : 'Tu ruta semanal fue actualizada.', routeId, action, stops: assignmentIds.length });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally { connection?.release(); }
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
    await account(portfolio, req.params.identifier);
    res.json({ portfolio, ...(await managementHistory(portfolio, req.params.identifier)) });
  } catch (error) {
    next(error);
  }
});

router.get("/clients/:identifier/address-correction", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const assignment = await assignmentForAccount(portfolio, req.user.id, req.params.identifier);
    const [corrections] = await pool.execute(
      `SELECT dc.id_direccion_corregida, dc.direccion_original, dc.direccion_search, dc.direccion_corregida,
        dc.distrito_original, dc.distrito_corregido, dc.ubigeo_original, dc.ubigeo_corregido,
        dc.latitud, dc.longitud, dc.validado, dc.fecha_registro, dc.fecha_validacion,
        source.codigo AS source
      FROM geocampo_direccion_corregida dc
      LEFT JOIN geocampo_fuente_correccion_direccion source ON source.id_fuente_correccion = dc.id_fuente_correccion
      WHERE dc.id_asignacion = ? ORDER BY dc.id_direccion_corregida DESC LIMIT 1`,
      [assignment.id_asignacion],
    );
    res.json({ portfolio, assignment, correction: corrections[0] || null });
  } catch (error) { next(error); }
});

router.post("/clients/:identifier/address-correction", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.body.idTable);
    const assignment = await assignmentForAccount(portfolio, req.user.id, req.params.identifier);
    const correctedAddress = String(req.body.correctedAddress || '').trim();
    const searchAddress = String(req.body.searchAddress || '').trim();
    const correctedDistrict = String(req.body.correctedDistrict || '').trim();
    if (!correctedAddress && !searchAddress) {
      throw Object.assign(new Error('Ingresa la dirección corregida o una dirección encontrada.'), { status: 400 });
    }
    const latitude = req.body.latitude === undefined || req.body.latitude === null || req.body.latitude === '' ? null : Number(req.body.latitude);
    const longitude = req.body.longitude === undefined || req.body.longitude === null || req.body.longitude === '' ? null : Number(req.body.longitude);
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
      throw Object.assign(new Error('La ubicación de la dirección no es válida.'), { status: 400 });
    }
    const sourceCode = correctedAddress ? 'ASESOR' : 'SEARCH';
    const [sources] = await pool.execute(
      'SELECT id_fuente_correccion FROM geocampo_fuente_correccion_direccion WHERE codigo = ? AND activo = 1 LIMIT 1',
      [sourceCode],
    );
    if (!sources[0]) throw new Error('No está disponible el catálogo para registrar la corrección.');
    const valid = latitude !== null ? 1 : 0;
    const [result] = await pool.execute(
      `INSERT INTO geocampo_direccion_corregida (
        id_asignacion, id_cuenta_campo, id_table, id_cartera, direccion_original, direccion_search,
        direccion_corregida, distrito_original, distrito_corregido, latitud, longitud,
        id_fuente_correccion, validado, id_usuario_registro, fecha_registro, fecha_validacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), CASE WHEN ? = 1 THEN NOW() ELSE NULL END)`,
      [assignment.id_asignacion, assignment.id_cuenta_campo, portfolio.id_table, portfolio.id_cartera,
        assignment.address || '', searchAddress, correctedAddress, assignment.district || '', correctedDistrict,
        latitude, longitude, sources[0].id_fuente_correccion, valid, req.user.id, valid],
    );
    res.status(201).json({
      message: valid ? 'Dirección corregida y validada con tu ubicación.' : 'Dirección corregida. Puedes validarla con GPS cuando estés en el domicilio.',
      id: result.insertId,
    });
  } catch (error) { next(error); }
});

router.get("/managements/:source/:id", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const source = String(req.params.source || '').toUpperCase();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !['CAMPO', 'CALL'].includes(source)) throw Object.assign(new Error('Gestión no válida.'), { status: 400 });
    const field = source === 'CAMPO';
    const [rows] = await pool.execute(
      field
        ? `SELECT g.ID AS id, g.FECHA AS created_at, COALESCE(g.HoraRegistro, TIME(g.FECHA)) AS time, g.IDENTIFICADOR AS identifier,
          g.IDEFECTO AS effect_id, e.EFECTO AS effect, e.IDCATEGORIA AS category_id, cat.CATEGORIA AS category,
          m.MOTIVO AS reason, c.CONTACTO AS contact, g.OBSERVACION AS observation, g.NOMCONTACTO AS phone,
          g.PISOS AS floors, g.PUERTA AS door, g.FACHADA AS facade, g.FECHA_PROMESA AS promise_date,
          g.MONTO_PROMESA AS promise_amount, g.latitud, g.longitud, gps.NOMBRE_GEOCAMPO_ESTADO_GPS AS gps_status,
          g.imagen1 AS image1, g.imagen2 AS image2, g.imagen3 AS image3
        FROM GEOCAMPO g LEFT JOIN efecto e ON e.IDEFECTO = g.IDEFECTO LEFT JOIN categoria cat ON cat.IDCATEGORIA = e.IDCATEGORIA
        LEFT JOIN motivo m ON m.IDMOTIVO = g.IDMOTIVO LEFT JOIN contacto c ON c.IDCONTACTO = g.IDCONTACTO
        LEFT JOIN GEOCAMPO_ESTADO_GPS gps ON gps.ID_GEOCAMPO_ESTADO_GPS = g.ID_GEOCAMPO_ESTADO_GPS
        WHERE g.ID = ? AND g.IDCARTERA = ? LIMIT 1`
        : `SELECT gt.id AS id, gt.fecha_tmk AS created_at, TIME(gt.fecha_tmk) AS time, gt.IDENTIFICADOR AS identifier,
          gt.IDEFECTO AS effect_id, e.EFECTO AS effect, e.IDCATEGORIA AS category_id, cat.CATEGORIA AS category,
          m.MOTIVO AS reason, c.CONTACTO AS contact, gt.OBSERVACION AS observation, gt.IDTELEFONO AS phone,
          gt.PISOS AS floors, gt.PUERTA AS door, gt.FACHADA AS facade, gt.fecha_promesa AS promise_date,
          gt.monto_promesa AS promise_amount, NULL AS latitud, NULL AS longitud, NULL AS gps_status,
          NULL AS image1, NULL AS image2, NULL AS image3
        FROM gestion_tmk gt LEFT JOIN efecto e ON e.IDEFECTO = gt.IDEFECTO LEFT JOIN categoria cat ON cat.IDCATEGORIA = e.IDCATEGORIA
        LEFT JOIN motivo m ON m.IDMOTIVO = gt.IDMOTIVO LEFT JOIN contacto c ON c.IDCONTACTO = gt.IDCONTACTO
        WHERE gt.id = ? AND (gt.ID_CARTERA = ? OR gt.id_table = ?) LIMIT 1`,
      field ? [id, portfolio.id_cartera] : [id, portfolio.id_cartera, portfolio.id_table],
    );
    if (!rows[0]) return res.status(404).json({ message: 'No encontramos esta gestión en la cartera seleccionada.' });
    await account(portfolio, rows[0].identifier);
    const item = formatManagement(rows[0], source);
    item.evidence = item.evidence.map((evidence) => ({
      ...evidence,
      url: `/field/managements/${source}/${id}/evidence/${evidence.slot}?idTable=${portfolio.id_table}`,
    }));
    res.json({ portfolio, item });
  } catch (error) { next(error); }
});

router.get("/managements/:source/:id/evidence/:slot", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const source = String(req.params.source || '').toUpperCase();
    const id = Number(req.params.id);
    const slot = Number(req.params.slot);
    if (source !== 'CAMPO' || !Number.isInteger(id) || id <= 0 || ![1, 2, 3].includes(slot)) {
      throw Object.assign(new Error('Evidencia no válida.'), { status: 400 });
    }
    const column = `imagen${slot}`;
    const [rows] = await pool.execute(
      `SELECT g.IDENTIFICADOR AS identifier, g.FECHA AS created_at, g.${column} AS name
       FROM GEOCAMPO g WHERE g.ID = ? AND g.IDCARTERA = ? LIMIT 1`,
      [id, portfolio.id_cartera],
    );
    if (!rows[0]?.name) return res.status(404).json({ message: 'La evidencia no está disponible.' });
    await account(portfolio, rows[0].identifier);
    const file = await findEvidenceFile(portfolio, String(rows[0].name), rows[0].created_at);
    if (!file) return res.status(404).json({ message: 'No encontramos el archivo de esta evidencia.' });
    res.set('Cache-Control', 'private, max-age=3600');
    res.type('jpeg').sendFile(file);
  } catch (error) { next(error); }
});

router.get("/history", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const endDate = dateValue(req.query.to);
    const startDate = dateValue(req.query.from || new Date(Date.parse(`${endDate}T12:00:00`) - 6 * 86400000).toISOString().slice(0, 10));
    if (startDate > endDate) {
      throw Object.assign(new Error("El rango de fechas no es válido."), { status: 400 });
    }
    const [rows] = await pool.execute(
      `
      SELECT g.ID AS id, g.FECHA AS created_at,
        COALESCE(g.HoraRegistro, TIME(g.FECHA)) AS time, g.IDENTIFICADOR AS identifier,
        g.IDEFECTO AS effect_id, e.EFECTO AS effect, e.IDCATEGORIA AS category_id, cat.CATEGORIA AS category,
        m.MOTIVO AS reason, c.CONTACTO AS contact, g.OBSERVACION AS observation,
        g.NOMCONTACTO AS phone, g.PISOS AS floors, g.PUERTA AS door, g.FACHADA AS facade,
        g.FECHA_PROMESA AS promise_date, g.MONTO_PROMESA AS promise_amount, g.latitud, g.longitud,
        gps.NOMBRE_GEOCAMPO_ESTADO_GPS AS gps_status
      FROM GEOCAMPO g
      LEFT JOIN efecto e ON e.IDEFECTO = g.IDEFECTO
      LEFT JOIN categoria cat ON cat.IDCATEGORIA = e.IDCATEGORIA
      LEFT JOIN motivo m ON m.IDMOTIVO = g.IDMOTIVO
      LEFT JOIN contacto c ON c.IDCONTACTO = g.IDCONTACTO
      LEFT JOIN GEOCAMPO_ESTADO_GPS gps ON gps.ID_GEOCAMPO_ESTADO_GPS = g.ID_GEOCAMPO_ESTADO_GPS
      WHERE g.IDPERSONAL = ? AND g.IDCARTERA = ? AND DATE(g.FECHA) BETWEEN ? AND ?
      ORDER BY g.FECHA DESC, g.ID DESC LIMIT 100`,
      [req.user.id, portfolio.id_cartera, startDate, endDate],
    );
    res.json({ portfolio, range: { startDate, endDate }, items: rows.map((row) => formatManagement(row, 'CAMPO')) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
