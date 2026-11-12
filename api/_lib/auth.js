// ============================================================
// auth.js — JWT middleware helpers
// ============================================================
const jwt = require('jsonwebtoken');
const { dbGet } = require('./db');

async function getUserFromToken(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const row = await dbGet('SELECT * FROM users WHERE id=?', [decoded.id]);
    return row || null;
  } catch {
    return null;
  }
}

// Use as: const user = await requireAuth(req, res); if (!user) return;
async function requireAuth(req, res) {
  const user = await getUserFromToken(req);
  if (!user) {
    res.status(401).json({ success: false, message: 'Not authorized, no token' });
    return null;
  }
  if (user.banned) {
    res.status(403).json({ success: false, message: 'Account suspended' });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return null;
  }
  return user;
}

module.exports = { getUserFromToken, requireAuth, requireAdmin };
