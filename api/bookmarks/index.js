const { initDB, dbAll, dbGet, dbRun } = require('../_lib/db');
const { Post } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { randomUUID } = require('crypto');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const user = await requireAuth(req, res); if (!user) return;

  if (req.method === 'GET') {
    const rows  = await dbAll('SELECT post_id FROM bookmarks WHERE user_id=? ORDER BY created_at DESC', [user.id]);
    const posts = (await Promise.all(rows.map(r => Post.findById(r.post_id, user.id)))).filter(Boolean);
    return res.json({ success: true, count: posts.length, posts });
  }
  res.status(405).json({ success: false, message: 'Method not allowed' });
};
