const { initDB, dbAll, dbGet, dbRun } = require('../_lib/db');
const { Post } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { randomUUID } = require('crypto');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const user = await requireAuth(req, res); if (!user) return;

  // GET — list reading list
  if (req.method === 'GET') {
    const rows  = await dbAll('SELECT post_id,read FROM reading_list WHERE user_id=? ORDER BY created_at DESC', [user.id]);
    const items = (await Promise.all(rows.map(async r => {
      const post = await Post.findById(r.post_id, user.id);
      return post ? { post, read: !!r.read } : null;
    }))).filter(Boolean);
    return res.json({ success: true, count: items.length, items });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
