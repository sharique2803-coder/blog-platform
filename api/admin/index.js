// All admin routes in one file, sub-routed via URL segments
// /api/admin/stats | /api/admin/users | /api/admin/posts | /api/admin/reports
const { initDB, dbGet, dbAll, dbRun } = require('../_lib/db');
const { User, Post, Comment } = require('../_lib/models');
const { handleCors }  = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const admin = await requireAdmin(req, res); if (!admin) return;

  const url      = req.url || '';
  const segments = url.split('?')[0].split('/').filter(Boolean);
  // /api/admin/stats           → segments[2]='stats'
  // /api/admin/users/:id/ban   → segments[2]='users', [3]=id, [4]='ban'
  const resource = segments[2];
  const param    = segments[3];
  const action   = segments[4];

  // ── STATS ─────────────────────────────────────────────────
  if (req.method === 'GET' && resource === 'stats') {
    const users    = (await dbGet('SELECT COUNT(*) as n FROM users'))?.n || 0;
    const posts    = (await dbGet('SELECT COUNT(*) as n FROM posts WHERE published=1'))?.n || 0;
    const comments = (await dbGet('SELECT COUNT(*) as n FROM comments'))?.n || 0;
    const reports  = (await dbGet('SELECT COUNT(*) as n FROM reports WHERE resolved=0'))?.n || 0;
    const banned   = (await dbGet('SELECT COUNT(*) as n FROM users WHERE banned=1'))?.n || 0;
    const drafts   = (await dbGet('SELECT COUNT(*) as n FROM posts WHERE published=0'))?.n || 0;
    return res.json({ success: true, stats: { users, posts, comments, reports, banned, drafts } });
  }

  // ── USERS ─────────────────────────────────────────────────
  if (resource === 'users') {
    if (req.method === 'GET' && !param) {
      const page   = +(req.query.page || 1);
      const { users, total } = await User.findAll({ page, limit: 20 });
      const safe = users.map(u => ({ id: u.id, username: u.username, email: u.email,
        role: u.role, banned: !!u.banned, createdAt: u.created_at }));
      return res.json({ success: true, users: safe, total, page, pages: Math.ceil(total / 20) });
    }
    if (req.method === 'PUT' && param && action === 'ban') {
      const user = await User.findById(param);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot ban an admin' });
      const banned = user.banned ? 0 : 1;
      await User.update(param, { banned });
      return res.json({ success: true, message: banned ? 'User banned' : 'User unbanned', banned: !!banned });
    }
    if (req.method === 'PUT' && param && action === 'role') {
      const { role } = req.body || {};
      if (!['user','admin'].includes(role))
        return res.status(400).json({ success: false, message: 'Invalid role' });
      await User.update(param, { role });
      return res.json({ success: true, message: `Role updated to ${role}` });
    }
  }

  // ── POSTS ─────────────────────────────────────────────────
  if (resource === 'posts') {
    if (req.method === 'GET' && !param) {
      const page   = +(req.query.page || 1);
      const limit  = 20;
      const offset = (page - 1) * limit;
      const total  = (await dbGet('SELECT COUNT(*) as n FROM posts'))?.n || 0;
      const rows   = await dbAll('SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
      const posts  = await Promise.all(rows.map(async r => {
        const author = await User.findById(r.author_id);
        return { id: r.id, title: r.title, published: !!r.published, featured: !!r.featured,
                 views: r.views, createdAt: r.created_at,
                 author: author ? { id: author.id, username: author.username } : null };
      }));
      return res.json({ success: true, posts, total, page, pages: Math.ceil(total / limit) });
    }
    if (req.method === 'DELETE' && param) {
      await Comment.deleteByPost(param);
      await Post.delete(param);
      return res.json({ success: true, message: 'Post deleted' });
    }
    if (req.method === 'PUT' && param && action === 'feature') {
      const post = await Post.findById(param);
      if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
      const updated = await Post.update(param, { featured: !post.featured });
      return res.json({ success: true, featured: updated.featured, message: updated.featured ? 'Post featured' : 'Post unfeatured' });
    }
  }

  // ── REPORTS ───────────────────────────────────────────────
  if (resource === 'reports') {
    if (req.method === 'GET') {
      const rows = await dbAll('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100');
      return res.json({ success: true, reports: rows });
    }
    if (req.method === 'PUT' && param && action === 'resolve') {
      await dbRun('UPDATE reports SET resolved=1 WHERE id=?', [param]);
      return res.json({ success: true, message: 'Report resolved' });
    }
  }

  res.status(404).json({ success: false, message: 'Admin route not found' });
};
