const { Router } = require("express");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");

const router = Router();
router.use(requireAuth);

function requireSupervisor(req, res, next) {
  if (!req.user.isSupervisor) return res.status(403).json({ message: "Esta vista es exclusiva para supervisión." });
  return next();
}
router.use(requireSupervisor);

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

module.exports = router;
