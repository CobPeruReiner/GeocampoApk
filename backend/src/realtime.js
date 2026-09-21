const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { portfoliosForSupervisor } = require('./utils/field');

function attachRealtime(server) {
  const io = new Server(server, { cors: { origin: true, credentials: false } });
  io.use((socket, next) => {
    try {
      socket.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      next();
    } catch { next(new Error('Sesión no válida.')); }
  });
  io.on('connection', async (socket) => {
    if (!socket.user.isSupervisor) return;
    try {
      const portfolios = await portfoliosForSupervisor(socket.user.id);
      portfolios.forEach((portfolio) => socket.join(`supervisor:${portfolio.id_cartera}`));
    } catch (error) {
      socket.emit('presence:error', { message: 'No fue posible preparar el monitoreo de carteras.' });
      console.error('Socket supervisor rooms:', error);
    }
  });
  return io;
}

module.exports = { attachRealtime };
