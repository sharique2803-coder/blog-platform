const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes — JWT required
const protect = (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer '))
    token = req.headers.authorization.split(' ')[1];

  if (!token)
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = User.findById(decoded.id);
    if (!user)
      return res.status(401).json({ success: false, message: 'User not found' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};

// Optional auth — attaches user if valid token present, never blocks
const optionalAuth = (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer '))
    token = req.headers.authorization.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = User.findById(decoded.id) || null;
    } catch {
      req.user = null;
    }
  }
  next();
};

module.exports = { protect, optionalAuth };
