const { Router } = require("express");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const { portfolioForSupervisor, safeIdentifier } = require('../utils/field');

const router = Router();
router.use(requireAuth);

function requireSupervisor(req, res, next) {
  if (!req.user.isSupervisor) return res.status(403).json({ message: "Esta vista es exclusiva para supervisión." });
  return next();
}
router.use(requireSupervisor);

// La hoja semanal es propiedad del gestor. Supervisión puede consultar rutas y
// asignar/reasignar cuentas, pero nunca crear ni alterar la ruta de un asesor.
router.use('/advisors/:advisorId/route', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
    return res.status(405).json({ message: 'La ruta semanal solo puede ser creada o actualizada por el gestor asignado.' });
  }
  return next();
});

function dateValue(value) {
  const date = String(value || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('Fecha inválida.'), { status: 400 });
  return date;
}
function weekRange(date) {
  const reference = new Date(`${date}T12:00:00`); const day = reference.getDay() || 7;
  const start = new Date(reference); start.setDate(reference.getDate() - day + 1);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const format = (value) => value.toISOString().slice(0, 10);
  return { referenceDate: date, startDate: format(start), endDate: format(end) };
}
async function advisorForPortfolio(idAdvisor, idCartera) {
  const [sets] = await pool.query('CALL GetAsesoresByCartera2(?)', [idCartera]);
  const advisors = Array.isArray(sets?.[0]) ? sets[0] : [];
  if (!advisors.some((item) => Number(item.IDPERSONAL) === Number(idAdvisor))) {
    throw Object.assign(new Error('El asesor no pertenece a la cartera seleccionada.'), { status: 403 });
  }
  const [rows] = await pool.execute("SELECT IDPERSONAL AS id, TRIM(CONCAT(COALESCE(NOMBRES,''), ' ', COALESCE(APELLIDOS,''))) AS name FROM personal WHERE IDPERSONAL = ? LIMIT 1", [idAdvisor]);
  if (!rows[0]) throw Object.assign(new Error('No encontramos al asesor seleccionado.'), { status: 404 });
  return { id: Number(rows[0].id), name: rows[0].name || 'Asesor sin nombre' };
}
async function catalogId(connection, table, idColumn, code) {
  const [rows] = await connection.execute(`SELECT ${idColumn} AS id FROM ${table} WHERE codigo = ? AND activo = 1 LIMIT 1`, [code]);
  if (!rows[0]) throw new Error(`Falta el catálogo ${code} para guardar la ruta.`);
  return Number(rows[0].id);
}
async function activeRoute(connection, advisorId, week) {
  const [rows] = await connection.execute(
    `SELECT hr.id_hoja_ruta, hr.id_estado_ruta FROM geocampo_hoja_ruta hr
    INNER JOIN geocampo_estado_ruta er ON er.id_estado_ruta = hr.id_estado_ruta
    WHERE hr.id_asesor = ? AND COALESCE(hr.tipo_ruta, 'DIARIA') = 'SEMANAL'
      AND hr.fecha_inicio_semana = ? AND hr.fecha_fin_semana = ? AND er.codigo IN ('CREADA', 'EN_PROCESO')
    ORDER BY hr.id_hoja_ruta DESC LIMIT 1`,
    [advisorId, week.startDate, week.endDate],
  );
  return rows[0] || null;
}

async function plannerData(portfolio, advisorId, date) {
  const advisor = await advisorForPortfolio(advisorId, portfolio.id_cartera);
  const week = weekRange(dateValue(date));
  const route = await activeRoute(pool, advisor.id, week);
  const table = safeIdentifier(portfolio.table_name);
  const [rows] = await pool.execute(
    `SELECT ga.id_asignacion AS assignment_id, c.IDENTIFICADOR AS identifier,
      COALESCE(c.DOCUMENTO, c.IDENTIFICADOR) AS document, COALESCE(c.NOMBRE, '') AS name,
      COALESCE(c.NUMEROCUENTA, '') AS account, COALESCE(c.DEUDATOTAL, c.MONTOACOBRAR, 0) AS amount,
      dc.direccion_original AS original_address, COALESCE(dc.direccion_corregida, dc.direccion_search, '') AS suggested_address,
      dc.distrito_corregido AS district, dc.latitud AS latitude, dc.longitud AS longitude,
      hrd.id_detalle AS route_detail_id, hrd.orden_visita AS visit_order, ev.codigo AS visit_status
    FROM geocampo_asignacion ga
    INNER JOIN ${table} c ON c.id = ga.id_cuenta_campo
    LEFT JOIN geocampo_direccion_corregida dc ON dc.id_direccion_corregida = (
      SELECT dc2.id_direccion_corregida FROM geocampo_direccion_corregida dc2
      WHERE dc2.id_asignacion = ga.id_asignacion AND dc2.id_cuenta_campo = ga.id_cuenta_campo
        AND dc2.id_table = ga.id_table AND dc2.id_cartera = ga.id_cartera
      ORDER BY dc2.id_direccion_corregida DESC LIMIT 1)
    LEFT JOIN geocampo_hoja_ruta_detalle hrd ON hrd.id_hoja_ruta = ? AND hrd.id_asignacion = ga.id_asignacion
    LEFT JOIN geocampo_estado_visita ev ON ev.id_estado_visita = hrd.id_estado_visita
    WHERE ga.id_asesor = ? AND ga.id_table = ? AND ga.id_cartera = ? AND ga.activo = 1
      AND COALESCE(c.ESTADO, 'ACTIVO') = 'ACTIVO'
    ORDER BY CASE WHEN hrd.orden_visita IS NULL THEN 1 ELSE 0 END, hrd.orden_visita, ga.fecha_asignacion DESC, ga.id_asignacion DESC`,
    [route?.id_hoja_ruta || 0, advisor.id, portfolio.id_table, portfolio.id_cartera],
  );
  return {
    advisor, portfolio, week, route: route ? { id: Number(route.id_hoja_ruta) } : null,
    items: rows.map((row) => ({ ...row, assignment_id: Number(row.assignment_id), route_detail_id: row.route_detail_id ? Number(row.route_detail_id) : null, visit_order: row.visit_order ? Number(row.visit_order) : null, latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude), selected: Boolean(row.route_detail_id) && row.visit_status !== 'CANCELADO', locked: row.visit_status === 'VISITADO' })),
  };
}

async function liveLocationTableExists() {
  const [rows] = await pool.query("SHOW TABLES LIKE 'geocampo_ubicacion_actual'");
  return rows.length > 0;
}

router.get("/advisors", async (req, res, next) => {
  try {
    const idCartera = Number(req.query.idCartera);
    if (!Number.isInteger(idCartera) || idCartera <= 0) return res.status(400).json({ message: "Cartera inválida." });
    const [procedureSets] = await pool.query('CALL GetAsesoresByCartera2(?)', [idCartera]);
    const procedureRows = Array.isArray(procedureSets) && Array.isArray(procedureSets[0]) ? procedureSets[0] : [];
    const advisorIds = [...new Set(procedureRows.map((row) => Number(row.IDPERSONAL)).filter(Number.isInteger))];
    if (!advisorIds.length) return res.json({ items: [] });
    const placeholders = advisorIds.map(() => '?').join(',');
    const hasLiveLocation = await liveLocationTableExists();
    const liveLatitude = hasLiveLocation ? 'u.latitud,' : '';
    const liveLongitude = hasLiveLocation ? 'u.longitud,' : '';
    const liveUpdatedAt = hasLiveLocation ? 'u.actualizado_en AS live_updated_at, u.jornada_activa' : 'NULL AS live_updated_at, 0 AS jornada_activa';
    const liveJoin = hasLiveLocation ? 'LEFT JOIN geocampo_ubicacion_actual u ON u.id_personal = p.IDPERSONAL AND u.jornada_activa = 1 AND u.actualizado_en >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)' : '';
    const liveGroup = hasLiveLocation ? ', u.latitud, u.longitud, u.actualizado_en, u.jornada_activa' : '';
    const [rows] = await pool.execute(
      `SELECT p.IDPERSONAL AS id, TRIM(CONCAT(COALESCE(p.NOMBRES,''), ' ', COALESCE(p.APELLIDOS,''))) AS name,
        COUNT(DISTINCT ga.id_asignacion) AS assigned,
        COUNT(DISTINCT CASE WHEN g.FECHA >= CURDATE() THEN g.ID END) AS managed_today,
        MAX(g.FECHA) AS last_management_at,
        COALESCE(${liveLatitude} SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN g.latitud IS NOT NULL AND g.longitud IS NOT NULL AND g.latitud <> 0 AND g.longitud <> 0 THEN g.latitud END ORDER BY g.FECHA DESC), ',', 1)) AS latitude,
        COALESCE(${liveLongitude} SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN g.latitud IS NOT NULL AND g.longitud IS NOT NULL AND g.latitud <> 0 AND g.longitud <> 0 THEN g.longitud END ORDER BY g.FECHA DESC), ',', 1)) AS longitude,
        ${liveUpdatedAt}
      FROM personal p
      LEFT JOIN geocampo_asignacion ga ON ga.id_asesor = p.IDPERSONAL AND ga.id_cartera = ? AND ga.activo = 1
      LEFT JOIN GEOCAMPO g ON g.IDPERSONAL = p.IDPERSONAL AND g.IDCARTERA = ? AND g.FECHA >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ${liveJoin}
      WHERE p.IDPERSONAL IN (${placeholders})
      GROUP BY p.IDPERSONAL, p.NOMBRES, p.APELLIDOS${liveGroup} ORDER BY name`,
      [idCartera, idCartera, ...advisorIds],
    );
    res.json({ items: rows.map((row) => ({ ...row, id: Number(row.id), assigned: Number(row.assigned || 0), managed_today: Number(row.managed_today || 0), latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude), live: Boolean(row.live_updated_at), location_source: row.latitude === null ? null : row.live_updated_at ? "Ubicación en jornada" : "Última gestión registrada" })) });
  } catch (error) { next(error); }
});

router.get('/advisors/:advisorId/route', async (req, res, next) => {
  try {
    const advisorId = Number(req.params.advisorId);
    if (!Number.isInteger(advisorId) || advisorId <= 0) return res.status(400).json({ message: 'Asesor inválido.' });
    const portfolio = await portfolioForSupervisor(req.user.id, req.query.idTable);
    res.json(await plannerData(portfolio, advisorId, req.query.date));
  } catch (error) { next(error); }
});

router.post('/advisors/:advisorId/route', async (req, res, next) => {
  let connection;
  try {
    const advisorId = Number(req.params.advisorId);
    if (!Number.isInteger(advisorId) || advisorId <= 0) return res.status(400).json({ message: 'Asesor inválido.' });
    const portfolio = await portfolioForSupervisor(req.user.id, req.body.idTable);
    const advisor = await advisorForPortfolio(advisorId, portfolio.id_cartera);
    const week = weekRange(dateValue(req.body.date));
    const requested = [...new Set((Array.isArray(req.body.assignmentIds) ? req.body.assignmentIds : []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
    if (!requested.length) return res.status(400).json({ message: 'Selecciona al menos una cuenta para crear la ruta.' });
    connection = await pool.getConnection(); await connection.beginTransaction();
    const placeholders = requested.map(() => '?').join(',');
    const [validRows] = await connection.execute(
      `SELECT id_asignacion FROM geocampo_asignacion WHERE id_asesor = ? AND id_table = ? AND id_cartera = ? AND activo = 1 AND id_asignacion IN (${placeholders})`,
      [advisor.id, portfolio.id_table, portfolio.id_cartera, ...requested],
    );
    const validIds = validRows.map((row) => Number(row.id_asignacion));
    if (validIds.length !== requested.length) throw Object.assign(new Error('Una o más cuentas ya no pertenecen al asesor o dejaron de estar activas. Actualiza la vista e inténtalo nuevamente.'), { status: 409 });
    const [periods] = await connection.execute('SELECT id_periodo, nombre FROM geocampo_periodo WHERE activo = 1 AND ? BETWEEN fecha_inicio AND fecha_fin ORDER BY fecha_inicio DESC LIMIT 1', [week.referenceDate]);
    const idCriterion = await catalogId(connection, 'geocampo_criterio_ruta', 'id_criterio_ruta', 'PERSONALIZADO');
    const idRouteState = await catalogId(connection, 'geocampo_estado_ruta', 'id_estado_ruta', 'CREADA');
    const idScheduled = await catalogId(connection, 'geocampo_estado_visita', 'id_estado_visita', 'AGENDADO');
    const idCancelled = await catalogId(connection, 'geocampo_estado_visita', 'id_estado_visita', 'CANCELADO');
    const idAssignmentState = await catalogId(connection, 'geocampo_estado_asignacion', 'id_estado_asignacion', 'AGENDADO');
    let route = await activeRoute(connection, advisor.id, week); const routeName = `Ruta semanal ${week.startDate} al ${week.endDate} - ${periods[0]?.nombre || week.referenceDate} - Asesor ${advisor.id}`;
    let action = 'updated';
    if (route) {
      await connection.execute('UPDATE geocampo_hoja_ruta SET nombre_ruta = ?, id_criterio_ruta = ?, id_periodo = ?, fecha_ruta = ?, fecha_actualizacion = NOW(), id_usuario_actualizacion = ? WHERE id_hoja_ruta = ?', [routeName, idCriterion, periods[0]?.id_periodo || null, week.startDate, req.user.id, route.id_hoja_ruta]);
    } else {
      const [created] = await connection.execute('INSERT INTO geocampo_hoja_ruta (id_asesor, id_supervisor, id_periodo, nombre_ruta, id_criterio_ruta, id_estado_ruta, tipo_ruta, fecha_ruta, fecha_inicio_semana, fecha_fin_semana, fecha_creacion, fecha_actualizacion, id_usuario_actualizacion) VALUES (?, ?, ?, ?, ?, ?, \'SEMANAL\', ?, ?, ?, NOW(), NOW(), ?)', [advisor.id, req.user.id, periods[0]?.id_periodo || null, routeName, idCriterion, idRouteState, week.startDate, week.startDate, week.endDate, req.user.id]);
      route = { id_hoja_ruta: created.insertId }; action = 'created';
    }
    const [existing] = await connection.execute(`SELECT d.id_detalle, d.id_asignacion, ev.codigo AS status FROM geocampo_hoja_ruta_detalle d LEFT JOIN geocampo_estado_visita ev ON ev.id_estado_visita = d.id_estado_visita WHERE d.id_hoja_ruta = ?`, [route.id_hoja_ruta]);
    const byAssignment = new Map(existing.map((row) => [Number(row.id_asignacion), row])); const selected = new Set(requested);
    for (const detail of existing) {
      if (!selected.has(Number(detail.id_asignacion)) && detail.status !== 'VISITADO') await connection.execute('UPDATE geocampo_hoja_ruta_detalle SET id_estado_visita = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?', [idCancelled, detail.id_detalle]);
    }
    for (const [index, assignmentId] of requested.entries()) {
      const order = index + 1; const detail = byAssignment.get(assignmentId);
      if (detail) {
        const status = detail.status === 'VISITADO' ? undefined : idScheduled;
        if (status) await connection.execute('UPDATE geocampo_hoja_ruta_detalle SET orden_visita = ?, fecha_agendada = ?, id_estado_visita = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?', [order, `${week.startDate} 09:00:00`, status, detail.id_detalle]);
        else await connection.execute('UPDATE geocampo_hoja_ruta_detalle SET orden_visita = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?', [order, detail.id_detalle]);
      } else {
        await connection.execute('INSERT INTO geocampo_hoja_ruta_detalle (id_hoja_ruta, id_asignacion, es_reprogramado, orden_visita, id_estado_visita, fecha_agendada, bloqueado, fecha_registro, fecha_actualizacion) VALUES (?, ?, 0, ?, ?, ?, 0, NOW(), NOW())', [route.id_hoja_ruta, assignmentId, order, idScheduled, `${week.startDate} 09:00:00`]);
      }
      await connection.execute('UPDATE geocampo_asignacion SET id_estado_asignacion = ?, fecha_actualizacion = NOW() WHERE id_asignacion = ? AND activo = 1', [idAssignmentState, assignmentId]);
    }
    await connection.execute('INSERT INTO geocampo_hoja_ruta_historial (id_hoja_ruta, tipo_evento, valor_nuevo, observacion, id_usuario, fecha_evento) VALUES (?, ?, ?, ?, ?, NOW())', [route.id_hoja_ruta, action === 'created' ? 'CREACION_RUTA' : 'ACTUALIZACION_ORDEN', String(requested.length), action === 'created' ? 'Ruta semanal creada desde la aplicación móvil.' : 'Ruta semanal actualizada desde la aplicación móvil.', req.user.id]);
    await connection.commit();
    res.status(201).json({ message: action === 'created' ? 'Hoja de ruta semanal creada.' : 'Hoja de ruta semanal actualizada.', routeId: Number(route.id_hoja_ruta), action, stops: requested.length });
  } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
});

module.exports = router;
