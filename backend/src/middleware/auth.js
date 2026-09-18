const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Sesión requerida.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'La sesión expiró. Ingresa nuevamente.' });
  }
}

module.exports = { requireAuth };
