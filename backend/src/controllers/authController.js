const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) =>
  jwt.sign({ id:userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE||'7d' });

const fmt = (u) => ({
  id:u.id, username:u.username, email:u.email,
  bio:u.bio||'', avatar:u.avatar||'', role:u.role||'user',
  createdAt:u.created_at,
});

const register = (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username||!email||!password)
      return res.status(400).json({ success:false, message:'Please provide all fields' });
    if (username.length < 3)
      return res.status(400).json({ success:false, message:'Username must be at least 3 characters' });
    if (password.length < 6)
      return res.status(400).json({ success:false, message:'Password must be at least 6 characters' });
    if (!/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ success:false, message:'Please enter a valid email' });

    const existing = User.findByEmailOrUsername(email.toLowerCase(), username);
    if (existing) {
      const field = existing.email === email.toLowerCase() ? 'Email' : 'Username';
      return res.status(400).json({ success:false, message:`${field} is already taken` });
    }
    const user  = User.create({ username, email:email.toLowerCase(), password });
    const token = generateToken(user.id);
    res.status(201).json({ success:true, message:'Registration successful', token, user:fmt(user) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

const login = (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email||!password)
      return res.status(400).json({ success:false, message:'Please provide email and password' });
    const user = User.findByEmail(email.toLowerCase());
    if (!user || !User.matchPassword(password, user.password))
      return res.status(401).json({ success:false, message:'Invalid email or password' });
    if (user.banned)
      return res.status(403).json({ success:false, message:'Your account has been suspended' });
    const token = generateToken(user.id);
    res.json({ success:true, message:'Login successful', token, user:fmt(user) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

const getMe = (req, res) => {
  try {
    const user = User.findById(req.user.id);
    if (!user) return res.status(404).json({ success:false, message:'User not found' });
    const stats = User.getStats(user.id);
    res.json({ success:true, user:{ ...fmt(user), ...stats } });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

const updateProfile = (req, res) => {
  try {
    const { username, bio } = req.body;
    const updated = User.update(req.user.id, { username, bio });
    res.json({ success:true, message:'Profile updated', user:fmt(updated) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

module.exports = { register, login, getMe, updateProfile };
