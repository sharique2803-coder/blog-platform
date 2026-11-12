const { initDB } = require('../_lib/db');
const { User }   = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  await initDB();

  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Please provide email and password' });

  const user = await User.findByEmail(email.toLowerCase());
  if (!user || !User.matchPassword(password, user.password))
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  if (user.banned)
    return res.status(403).json({ success: false, message: 'Your account has been suspended' });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, message: 'Login successful', token,
    user: { id: user.id, username: user.username, email: user.email, bio: user.bio, avatar: user.avatar, role: user.role, createdAt: user.created_at } });
};
