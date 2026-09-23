const { pool } = require('../config/database');

function safeIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) throw new Error('Nombre de tabla no válido.');
  return `\`${value}\``;
}

function firstValue(record, names) {
  const indexed = Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [key.toUpperCase(), value]));
  for (const name of names) if (indexed[name] !== undefined && indexed[name] !== null) return indexed[name];
  return null;
}

async function portfoliosForUser(userId) {
  const [rows] = await pool.execute(`
    SELECT tl.id AS id_table, tl.id_cartera, tl.nombre AS table_name, c.cartera AS name, c.tipo AS portfolio_type
    FROM asignacion_tabla at
    INNER JOIN tabla_log tl ON tl.id = at.id_tabla
    INNER JOIN cartera c ON c.id = tl.id_cartera
    WHERE at.id_usuario = ? AND tl.estado = 0 AND c.estado = 1
    ORDER BY c.cartera`, [userId]);
  return rows;
}

// ruta_supervisor2.php obtiene sus carteras mediante este mismo procedimiento.
// Se conserva un fallback a la asignación directa para no bloquear roles que no
// estén cubiertos por el procedimiento.
async function portfoliosForSupervisor(userId) {
  const [procedureSets] = await pool.query('CALL GetAsignacion2(?)', [userId]);
  const procedureRows = Array.isArray(procedureSets) && Array.isArray(procedureSets[0]) ? procedureSets[0] : [];
  const tableIds = [...new Set(procedureRows.map((row) => Number(firstValue(row, ['ID_TABLA', 'ID_TABLE']))).filter(Number.isInteger))];
  if (!tableIds.length) return portfoliosForUser(userId);
  const placeholders = tableIds.map(() => '?').join(',');
  const [rows] = await pool.execute(`
    SELECT tl.id AS id_table, tl.id_cartera, tl.nombre AS table_name, c.cartera AS name, c.tipo AS portfolio_type
    FROM tabla_log tl INNER JOIN cartera c ON c.id = tl.id_cartera
    WHERE tl.id IN (${placeholders}) AND tl.estado = 0 AND c.estado = 1`, tableIds);
  const byId = new Map(rows.map((row) => [Number(row.id_table), row]));
  const ordered = tableIds.map((id) => byId.get(id)).filter(Boolean);
  return ordered.length ? ordered : portfoliosForUser(userId);
}

async function portfolioForUser(userId, requestedTable) {
  const portfolios = await portfoliosForUser(userId);
  if (!portfolios.length) throw Object.assign(new Error('No tienes carteras de campo asignadas.'), { status: 403 });
  const selected = requestedTable ? portfolios.find((item) => Number(item.id_table) === Number(requestedTable)) : portfolios[0];
  if (!selected) throw Object.assign(new Error('La cartera solicitada no está asignada a tu usuario.'), { status: 403 });
  safeIdentifier(selected.table_name);
  return selected;
}

async function portfolioForSupervisor(userId, requestedTable) {
  const portfolios = await portfoliosForSupervisor(userId);
  if (!portfolios.length) throw Object.assign(new Error('No tienes carteras disponibles para supervisar.'), { status: 403 });
  const selected = requestedTable ? portfolios.find((item) => Number(item.id_table) === Number(requestedTable)) : portfolios[0];
  if (!selected) throw Object.assign(new Error('La cartera solicitada no está disponible para tu supervisión.'), { status: 403 });
  safeIdentifier(selected.table_name);
  return selected;
}

async function guiColumns(idTable) {
  const [rows] = await pool.execute(`
    SELECT campo AS field, COALESCE(NULLIF(alias, ''), campo) AS header, COALESCE(type, 'TEXT') AS type,
      COALESCE(width, 130) AS width, COALESCE(color, '') AS color, COALESCE(orden, 0) AS position
    FROM gui_table WHERE id_table = ? AND campo IS NOT NULL ORDER BY orden, id`, [idTable]);
  return rows.filter((row) => /^[A-Za-z0-9_]+$/.test(row.field || ''));
}

function formatClient(record, portfolio, fields) {
  const identifier = firstValue(record, ['IDENTIFICADOR', 'ID']);
  return {
    id: String(identifier ?? ''),
    identifier: String(identifier ?? ''),
    document: firstValue(record, ['DOCUMENTO', 'DNI']),
    name: firstValue(record, ['NOMBRE', 'CLIENTE', 'NOMBRES']) || 'Sin nombre',
    account: firstValue(record, ['NUMEROCUENTA', 'CUENTA']),
    portfolio: { idTable: portfolio.id_table, idCartera: portfolio.id_cartera, name: portfolio.name },
    debt: firstValue(record, ['DEUDATOTAL', 'SALDO', 'MONTOACOBRAR']),
    campaign: firstValue(record, ['MONTOCAMPANA', 'CAMPANA']),
    fields: fields.map((field) => ({ ...field, value: record[field.field] ?? record[field.field.toUpperCase()] ?? '' })),
  };
}

module.exports = { safeIdentifier, firstValue, portfoliosForUser, portfoliosForSupervisor, portfolioForUser, portfolioForSupervisor, guiColumns, formatClient };
