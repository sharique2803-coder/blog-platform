const { initDB } = require('../_lib/db');
const { User }   = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  await initDB();

  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res.status(400).json({ success: false, message: 'Please provide all fields' });
  if (username.length < 3)
    return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ success: false, message: 'Please enter a valid email' });

  const existing = await User.findByEmailOrUsername(email.toLowerCase(), username);
  if (existing) {
    const field = existing.email === email.toLowerCase() ? 'Email' : 'Username';
    return res.status(400).json({ success: false, message: `${field} is already taken` });
  }

  const user  = await User.create({ username, email: email.toLowerCase(), password });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ success: true, message: 'Registration successful', token,
    user: { id: user.id, username: user.username, email: user.email, bio: user.bio, avatar: user.avatar, role: user.role, createdAt: user.created_at } });
};
