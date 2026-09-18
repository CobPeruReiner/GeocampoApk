const { Router } = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");

const router = Router();
const SUPERVISOR_ROLES = new Set([1, 8, 15, 16, 17, 18, 19, 20, 21, 22]);
const SUPERVISOR_IDS = new Set([14, 17, 21, 22, 25, 38, 73, 78, 173, 186, 203, 207, 259, 297, 352, 413, 647, 788, 793, 1391, 1449, 1798]);
const LIMA = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Lima",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function withinBusinessHours() {
  const pieces = Object.fromEntries(
    LIMA.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  const minutes = Number(pieces.hour) * 60 + Number(pieces.minute);
  return ["Sat", "Sun"].includes(pieces.weekday)
    ? minutes >= 420 && minutes <= 780
    : minutes >= 420 && minutes <= 1200;
}

router.post("/login", async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!username || !password)
      return res
        .status(400)
        .json({ message: "Usuario y contraseña son requeridos." });
    const [rows] = await pool.execute(
      `
      SELECT IDPERSONAL, USUARIO, CARGO, PASSWORD, NOMBRES, APELLIDOS, DOC, id_cartera, TIPO_PERSONAL, IDESTADO
      FROM personal WHERE USUARIO = ? LIMIT 1`,
      [username],
    );
    const user = rows[0];
    const md5 = crypto.createHash("md5").update(password).digest("hex");
    const stored = String(user?.PASSWORD || "");
    const valid =
      user &&
      (stored.startsWith("$2")
        ? await bcrypt.compare(password, stored)
        : stored.length === md5.length &&
          crypto.timingSafeEqual(Buffer.from(md5), Buffer.from(stored)));
    if (!valid)
      return res.status(401).json({ message: "Credenciales incorrectas." });
    if (![1, 2].includes(Number(user.IDESTADO)))
      return res.status(403).json({ message: "Usuario inactivo." });
    const exceptions = new Set([1235, 1391, 25, 1390, 647, 17, 1706]);
    if (!withinBusinessHours() && !exceptions.has(Number(user.IDPERSONAL)))
      return res
        .status(403)
        .json({ message: "Acceso bloqueado fuera de horario." });
    const apiToken = crypto.randomBytes(16).toString("hex");
    await pool.execute(
      "UPDATE personal SET api_token = ? WHERE IDPERSONAL = ?",
      [apiToken, user.IDPERSONAL],
    );
    const profile = {
      id: Number(user.IDPERSONAL),
      username: user.USUARIO,
      name: [user.NOMBRES, user.APELLIDOS].filter(Boolean).join(" "),
      document: user.DOC,
      role: user.CARGO,
      portfolioId: user.id_cartera,
      type: user.TIPO_PERSONAL,
      status: Number(user.IDESTADO),
      isSupervisor: SUPERVISOR_ROLES.has(Number(user.CARGO)) || SUPERVISOR_IDS.has(Number(user.IDPERSONAL)),
    };
    const token = jwt.sign(profile, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });
    return res.json({ token, profile });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ profile: req.user }));
module.exports = router;
