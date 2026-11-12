const User    = require('../models/User');
const Post    = require('../models/Post');
const Comment = require('../models/Comment');
const { getDB } = require('../config/db');

// Middleware: admin only
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ success:false, message:'Admin access required' });
  next();
};

// @route GET /api/admin/stats
const getStats = (req, res) => {
  try {
    const DB        = getDB();
    const users     = DB.get('SELECT COUNT(*) as n FROM users').n;
    const posts     = DB.get('SELECT COUNT(*) as n FROM posts WHERE published=1').n;
    const comments  = DB.get('SELECT COUNT(*) as n FROM comments').n;
    const reports   = DB.get('SELECT COUNT(*) as n FROM reports WHERE resolved=0').n;
    const banned    = DB.get('SELECT COUNT(*) as n FROM users WHERE banned=1').n;
    const drafts    = DB.get('SELECT COUNT(*) as n FROM posts WHERE published=0').n;
    res.json({ success:true, stats:{ users, posts, comments, reports, banned, drafts } });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/admin/users
const getUsers = (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { users, total } = User.findAll({ page, limit });
    const safe = users.map(u => ({
      id:u.id, username:u.username, email:u.email,
      role:u.role, banned:!!u.banned, createdAt:u.created_at,
    }));
    res.json({ success:true, users:safe, total, page, pages:Math.ceil(total/limit) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route PUT /api/admin/users/:id/ban
const banUser = (req, res) => {
  try {
    const user = User.findById(req.params.id);
    if (!user) return res.status(404).json({ success:false, message:'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success:false, message:'Cannot ban an admin' });
    const banned = user.banned ? 0 : 1;
    User.update(req.params.id, { banned });
    res.json({ success:true, message: banned ? 'User banned' : 'User unbanned', banned:!!banned });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route PUT /api/admin/users/:id/role
const setRole = (req, res) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role))
      return res.status(400).json({ success:false, message:'Invalid role' });
    User.update(req.params.id, { role });
    res.json({ success:true, message:`Role updated to ${role}` });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/admin/posts
const getPosts = (req, res) => {
  try {
    const DB     = getDB();
    const page   = parseInt(req.query.page) || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const offset = (page-1)*limit;
    const total  = DB.get('SELECT COUNT(*) as n FROM posts').n;
    const rows   = DB.all('SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    const posts  = rows.map(r => {
      const author = User.findById(r.author_id);
      return {
        id:r.id, title:r.title, published:!!r.published, featured:!!r.featured,
        views:r.views, createdAt:r.created_at,
        author: author ? { id:author.id, username:author.username } : null,
      };
    });
    res.json({ success:true, posts, total, page, pages:Math.ceil(total/limit) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route DELETE /api/admin/posts/:id
const deletePost = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    Comment.deleteByPost(req.params.id);
    Post.delete(req.params.id);
    res.json({ success:true, message:'Post deleted' });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route PUT /api/admin/posts/:id/feature
const toggleFeature = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    const updated = Post.update(req.params.id, { featured: !post.featured });
    res.json({ success:true, featured:updated.featured, message: updated.featured ? 'Post featured' : 'Post unfeatured' });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/admin/reports
const getReports = (req, res) => {
  try {
    const DB   = getDB();
    const rows = DB.all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100');
    res.json({ success:true, reports:rows });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route PUT /api/admin/reports/:id/resolve
const resolveReport = (req, res) => {
  try {
    getDB().run('UPDATE reports SET resolved=1 WHERE id=?', [req.params.id]);
    res.json({ success:true, message:'Report resolved' });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

module.exports = { adminOnly, getStats, getUsers, banUser, setRole, getPosts, deletePost, toggleFeature, getReports, resolveReport };
