require("dotenv").config();
const express = require("express");
const http = require('http');
const cors = require("cors");
const { pool } = require("./config/database");
const authRoutes = require("./routes/auth");
const fieldRoutes = require("./routes/field");
const supervisorRoutes = require("./routes/supervisor");
const managementRoutes = require('./routes/management');
const { attachRealtime } = require('./realtime');

const app = express();
const server = http.createServer(app);
const io = attachRealtime(server);
app.set('io', io);
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/field", fieldRoutes);
app.use("/api/supervisor", supervisorRoutes);
app.use('/api/management', managementRoutes);
app.use((error, _req, res, _next) => {
  console.error(error);
  res
    .status(error.status || 500)
    .json({
      message: error.status
        ? error.message
        : "No fue posible procesar la solicitud.",
    });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () =>
  console.log(`GeoCampo API listening on ${port}`),
);
