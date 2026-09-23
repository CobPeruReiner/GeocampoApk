const { Router } = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const {
  portfolioForUser,
  safeIdentifier,
  firstValue,
} = require("../utils/field");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, done) =>
    done(null, /^image\/(jpeg|png)$/i.test(file.mimetype)),
});
router.use(requireAuth);

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const number = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw fail(`Selecciona ${label}.`);
  return parsed;
};
const optionalNumber = (value) =>
  value === undefined || value === null || value === ""
    ? 0
    : number(value, "una opción válida");
const location = (body) => {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = Number(body.accuracy);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    throw fail("Activa tu ubicación antes de guardar la gestión.");
  if (!Number.isFinite(accuracy) || accuracy <= 0)
    throw fail(
      "Esperamos una ubicación GPS válida. Inténtalo nuevamente en unos segundos.",
    );
  return { latitude, longitude, accuracy };
};

async function account(portfolio, identifier) {
  const table = safeIdentifier(portfolio.table_name);
  const [rows] = await pool.execute(
    `SELECT * FROM ${table} WHERE IDENTIFICADOR = ? LIMIT 1`,
    [identifier],
  );
  if (!rows[0])
    throw fail("La cuenta no está disponible en la cartera seleccionada.", 404);
  return rows[0];
}
async function catalogForAction(idAction) {
  const [effects] = await pool.execute(
    "SELECT IDEFECTO AS id, EFECTO AS name, COALESCE(promesa, 0) AS promise FROM efecto WHERE idaccion = ? AND idestado = 1 ORDER BY EFECTO",
    [idAction],
  );
  return effects.map((item) => ({ ...item, promise: Boolean(item.promise) }));
}
async function addresses(portfolio, document) {
  if (!document) return [];
  const [rows] = await pool.execute(
    `SELECT MAX(d.IDDIRECCION) AS id, d.DIRECCION_DEPURADA AS address,
      MAX(NULLIF(d.DEPARTAMENTO, '')) AS department,
      MAX(NULLIF(d.PROVINCIA, '')) AS province,
      MAX(NULLIF(d.DISTRITO, '')) AS district,
      MAX(NULLIF(d.REF_DEPURADA, '')) AS reference
    FROM direcciones d WHERE d.FUENTE = (SELECT id FROM cliente WHERE id = (SELECT idcliente FROM cartera WHERE id = (SELECT id_cartera FROM tabla_log WHERE nombre = ?)) AND estado = 1)
    AND d.DOC = ? AND d.DIRECCION_DEPURADA IS NOT NULL AND d.IDESTADO = 1 GROUP BY d.DOC, d.FUENTE, d.DIRECCION_DEPURADA`,
    [portfolio.table_name, String(document)],
  );
  return rows;
}

router.get("/:identifier/options", async (req, res, next) => {
  try {
    const portfolio = await portfolioForUser(req.user.id, req.query.idTable);
    const client = await account(portfolio, req.params.identifier);
    let actionsQuery =
      "SELECT IDACCION AS id, ACCION AS name FROM accion WHERE idcartera = ? AND tipo = 2 AND idestado = 1";
    const params = [portfolio.id_cartera];
    if (portfolio.table_name === "C_SANTANDER_CAMPO")
      actionsQuery += " AND accion = 'HACER VISITA'";
    if (portfolio.table_name === "C_FINANCIERA_CONFIANZA_CAMPO")
      actionsQuery += " AND accion = 'VISITA A TITULAR EN DOMICILIO'";
    actionsQuery += " ORDER BY ACCION";
    const [actions] = await pool.execute(actionsQuery, params);
    const document = firstValue(client, ["DOCUMENTO", "DNI"]);
    res.json({
      portfolio,
      client: { identifier: req.params.identifier, document },
      actions,
      addresses: await addresses(portfolio, document),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/catalog/effects/:actionId", async (req, res, next) => {
  try {
    res.json({
      items: await catalogForAction(number(req.params.actionId, "una acción")),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/catalog/motives/:effectId", async (req, res, next) => {
  try {
    const [items] = await pool.execute(
      "SELECT IDMOTIVO AS id, MOTIVO AS name FROM motivo WHERE IDEFECTO = ? AND IDESTADO = 1 ORDER BY MOTIVO",
      [number(req.params.effectId, "un efecto")],
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});
router.get("/catalog/contacts/:effectId", async (req, res, next) => {
  try {
    const [items] = await pool.execute(
      "SELECT IDCONTACTO AS id, CONTACTO AS name FROM contacto WHERE IDEFECTO = ? AND IDESTADO = 1 ORDER BY CONTACTO",
      [number(req.params.effectId, "un efecto")],
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

function escapeXml(value) {
  return String(value || '').replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
}

function compactText(value, length = 105) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

async function reverseGeocode({ latitude, longitude }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const response = await fetch(url, { headers: { 'User-Agent': 'GeoCampoMobile/1.0 (field-evidence)' }, signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    const address = payload?.address || {};
    const street = [address.road, address.house_number].filter(Boolean).join(' ') || String(payload?.display_name || '').split(',').slice(0, 2).join(',').trim();
    return {
      department: address.state || address.region || address.state_district || '',
      province: address.province || address.county || address.city || address.town || '',
      district: address.suburb || address.city_district || address.neighbourhood || address.village || '',
      street,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function imageStamp({ latitude, longitude, accuracy }, location) {
  const moment = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date());
  const place = location || {};
  const lines = [
    'GEOCAMPO · Evidencia de visita',
    `Departamento: ${place.department || 'No disponible'} · Provincia: ${place.province || 'No disponible'}`,
    `Distrito: ${place.district || 'No disponible'}`,
    `Dirección GPS: ${place.street || 'No disponible'}`,
    `Fecha y hora: ${moment} · Precisión: ±${Math.round(accuracy)} m`,
    `Coordenadas: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  ].map((line) => compactText(line));
  const lineHeight = 36;
  const height = 34 + lines.length * lineHeight;
  const text = lines.map((line, index) => `<text x="38" y="${42 + (index + 1) * lineHeight}" fill="white" font-family="Arial, sans-serif" font-size="${index === 0 ? 30 : 25}" font-weight="${index === 0 ? 700 : 500}">${escapeXml(line)}</text>`).join('');
  return Buffer.from(
    `<svg width="1600" height="${height}"><rect width="100%" height="100%" fill="rgba(0,0,0,.72)"/>${text}</svg>`,
  );
}
async function removeEvidence(paths) {
  await Promise.all((paths || []).map((file) => fs.unlink(file).catch(() => undefined)));
}

async function persistEvidence(files, portfolio, identifier, gps, fallbackLocation) {
  if (!files?.length)
    throw fail("Agrega al menos una foto tomada durante la visita.");
  const backendRoot = path.resolve(__dirname, "..", "..");
  const root = process.env.GEOCAMPO_PHOTOS_DIR
    ? path.resolve(backendRoot, process.env.GEOCAMPO_PHOTOS_DIR)
    : path.join(backendRoot, "storage", "evidence");
  const folder = path.join(
    root,
    String(portfolio.table_name).replace(/^C_/, ""),
    new Date().toISOString().slice(0, 10),
  );
  await fs.mkdir(folder, { recursive: true });
  const safeIdentifier =
    String(identifier).replace(/[^A-Za-z0-9_-]/g, "") || "cuenta";
  const reverseLocation = await reverseGeocode(gps);
  const stamp = imageStamp(gps, {
    department: reverseLocation?.department || fallbackLocation?.department || '',
    province: reverseLocation?.province || fallbackLocation?.province || '',
    district: reverseLocation?.district || fallbackLocation?.district || '',
    street: reverseLocation?.street || fallbackLocation?.address || '',
  });
  const saved = [];
  const savedPaths = [];
  try {
    for (const [index, file] of files.entries()) {
      const name = `Imagen${index + 1}${safeIdentifier}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
      const destination = path.join(folder, name);
      await sharp(file.buffer)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .composite([{ input: stamp, gravity: "south" }])
        .jpeg({ quality: 82 })
        .toFile(destination);
      saved.push(name);
      savedPaths.push(destination);
    }
  } catch (error) {
    await removeEvidence(savedPaths);
    throw error;
  }
  return { names: saved, paths: savedPaths };
}
async function validateDependentOption(table, column, id, effectId, label) {
  if (!id) {
    const [available] = await pool.execute(
      `SELECT 1 FROM ${table} WHERE IDEFECTO = ? AND IDESTADO = 1 LIMIT 1`,
      [effectId],
    );
    if (available[0]) throw fail(`Selecciona un ${label} para continuar.`);
    return;
  }
  const [rows] = await pool.execute(
    `SELECT 1 FROM ${table} WHERE ${column} = ? AND IDEFECTO = ? AND IDESTADO = 1 LIMIT 1`,
    [id, effectId],
  );
  if (!rows[0])
    throw fail(
      `El ${label} seleccionado ya no está disponible para el efecto elegido.`,
    );
}
async function updateRoute(
  connection,
  portfolio,
  userId,
  identifier,
  gps,
  observation,
) {
  const [states] = await connection.execute(
    "SELECT id_estado_visita FROM geocampo_estado_visita WHERE codigo = 'VISITADO' AND activo = 1 LIMIT 1",
  );
  if (!states[0]) return;
  const table = safeIdentifier(portfolio.table_name);
  const [details] = await connection.execute(
    `SELECT hrd.id_detalle, hrd.id_asignacion FROM geocampo_hoja_ruta_detalle hrd INNER JOIN geocampo_hoja_ruta hr ON hr.id_hoja_ruta = hrd.id_hoja_ruta INNER JOIN geocampo_estado_ruta er ON er.id_estado_ruta = hr.id_estado_ruta INNER JOIN geocampo_asignacion ga ON ga.id_asignacion = hrd.id_asignacion AND ga.activo = 1 INNER JOIN ${table} c ON c.id = ga.id_cuenta_campo WHERE ga.id_asesor = ? AND ga.id_table = ? AND ga.id_cartera = ? AND c.IDENTIFICADOR = ? AND er.codigo IN ('CREADA', 'EN_PROCESO') AND ((hr.fecha_inicio_semana IS NOT NULL AND CURDATE() BETWEEN hr.fecha_inicio_semana AND hr.fecha_fin_semana) OR (hr.fecha_inicio_semana IS NULL AND CURDATE() BETWEEN DATE_SUB(hr.fecha_ruta, INTERVAL WEEKDAY(hr.fecha_ruta) DAY) AND DATE_ADD(DATE_SUB(hr.fecha_ruta, INTERVAL WEEKDAY(hr.fecha_ruta) DAY), INTERVAL 6 DAY))) ORDER BY hrd.orden_visita IS NULL, hrd.orden_visita, hrd.id_detalle DESC LIMIT 1`,
    [userId, portfolio.id_table, portfolio.id_cartera, identifier],
  );
  if (!details[0]) return;
  await connection.execute(
    "UPDATE geocampo_hoja_ruta_detalle SET id_estado_visita = ?, fecha_visita = NOW(), resultado_visita = ?, observacion = ?, latitud = ?, longitud = ?, fecha_actualizacion = NOW() WHERE id_detalle = ?",
    [
      states[0].id_estado_visita,
      "VISITADO",
      observation || "",
      gps.latitude,
      gps.longitude,
      details[0].id_detalle,
    ],
  );
  const [assignmentStates] = await connection.execute(
    "SELECT id_estado_asignacion FROM geocampo_estado_asignacion WHERE codigo = 'VISITADO' AND activo = 1 LIMIT 1",
  );
  if (assignmentStates[0])
    await connection.execute(
      "UPDATE geocampo_asignacion SET id_estado_asignacion = ?, fecha_actualizacion = NOW() WHERE id_asignacion = ?",
      [assignmentStates[0].id_estado_asignacion, details[0].id_asignacion],
    );
}

router.post(
  "/:identifier",
  upload.array("evidence", 3),
  async (req, res, next) => {
    let connection;
    let evidence;
    try {
      const portfolio = await portfolioForUser(req.user.id, req.body.idTable);
      const client = await account(portfolio, req.params.identifier);
      const actionId = number(req.body.actionId, "una acción");
      const effectId = number(req.body.effectId, "un efecto");
      const gps = location(req.body);
      const visitTime = String(req.body.visitTime || "");
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(visitTime) ||
        visitTime < "07:00" ||
        visitTime > "20:00"
      )
        throw fail("Registra una hora de visita entre las 07:00 y las 20:00.");
      const effects = await catalogForAction(actionId);
      const effect = effects.find((item) => Number(item.id) === effectId);
      if (!effect)
        throw fail(
          "El efecto seleccionado no corresponde a la acción elegida.",
        );
      const motiveId = optionalNumber(req.body.motiveId);
      const contactId = optionalNumber(req.body.contactId);
      const addressId = optionalNumber(req.body.addressId);
      await validateDependentOption(
        "motivo",
        "IDMOTIVO",
        motiveId,
        effectId,
        "motivo",
      );
      await validateDependentOption(
        "contacto",
        "IDCONTACTO",
        contactId,
        effectId,
        "contacto",
      );
      const document = firstValue(client, ["DOCUMENTO", "DNI"]);
      const validAddresses = await addresses(portfolio, document);
      if (
        validAddresses.length &&
        !validAddresses.some((item) => Number(item.id) === addressId)
      )
        throw fail("Selecciona una dirección válida para esta cuenta.");
      const selectedAddress = validAddresses.find((item) => Number(item.id) === addressId);
      if (effect.promise) {
        const promiseDate = String(req.body.promiseDate || "");
        const promiseAmount = Number(req.body.promiseAmount);
        const today = new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Lima",
        });
        const lastDay = `${today.slice(0, 8)}${new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate().toString().padStart(2, "0")}`;
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(promiseDate) ||
          promiseDate < today ||
          promiseDate > lastDay ||
          !Number.isFinite(promiseAmount) ||
          promiseAmount < 0
        )
          throw fail("Completa una promesa válida dentro del mes en curso.");
      }
      evidence = await persistEvidence(
        req.files,
        portfolio,
        req.params.identifier,
        gps,
        selectedAddress,
      );
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [resultSets] = await connection.query(
        "CALL SP_InsertarGEOCAMPO_PRUEBA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          req.params.identifier,
          portfolio.table_name,
          effectId,
          motiveId,
          contactId,
          String(req.body.observation || ""),
          addressId,
          req.user.id,
          String(req.body.phone || ""),
          String(req.body.floors || ""),
          String(req.body.door || ""),
          String(req.body.facade || ""),
          effect.promise ? req.body.promiseDate : null,
          effect.promise ? Number(req.body.promiseAmount) : null,
          portfolio.id_cartera,
          gps.latitude,
          gps.longitude,
          "GPS ACTIVADO",
          evidence.names[0] || null,
          evidence.names[1] || null,
          evidence.names[2] || null,
          `${visitTime}:00`,
          gps.accuracy,
          gps.accuracy > 100
            ? 4
            : gps.accuracy > 60
              ? 3
              : gps.accuracy > 25
                ? 2
                : 1,
          0,
        ],
      );
      await updateRoute(
        connection,
        portfolio,
        req.user.id,
        req.params.identifier,
        gps,
        String(req.body.observation || ""),
      );
      await connection.commit();
      res
        .status(201)
        .json({
          message: "Gestión registrada y ruta actualizada.",
          id: resultSets?.[0]?.[0]?.id || null,
        });
    } catch (error) {
      if (connection) await connection.rollback();
      if (evidence) await removeEvidence(evidence.paths);
      if (error?.code === 'ER_NO_SUCH_USER') {
        return next(Object.assign(new Error('El servicio de registro está temporalmente no disponible. Comunícate con soporte.'), { status: 503 }));
      }
      next(error);
    } finally {
      connection?.release();
    }
  },
);
module.exports = router;
