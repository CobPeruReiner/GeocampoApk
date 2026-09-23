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
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = attachRealtime(server);
app.set('io', io);
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let completed = false;
  res.on('finish', () => {
    completed = true;
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  res.on('close', () => {
    if (!completed) {
      logger.info('http_request_aborted', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        durationMs: Date.now() - startedAt,
      });
    }
  });
  next();
});
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
app.use((error, req, res, _next) => {
  logger.error('http_request_error', error, {
    method: req.method,
    path: req.originalUrl,
    status: error.status || 500,
  });
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
  logger.info('server_started', { port }),
);

process.on('uncaughtExceptionMonitor', (error, origin) => {
  logger.error('uncaught_exception', error, { origin });
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', reason);
});
