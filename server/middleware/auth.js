const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'kaaboo-dev-secret-change-in-prod';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Returns a socket.io middleware that populates socket.data.userId/username from JWT
function socketAuth(io) {
  return (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.data.userId = decoded.userId;
        socket.data.username = decoded.username;
      } catch { /* unauthenticated — allowed but userId will be undefined */ }
    }
    next();
  };
}

module.exports = { requireAuth, socketAuth, JWT_SECRET };
