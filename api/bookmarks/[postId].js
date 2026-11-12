const { initDB, dbGet, dbRun } = require('../_lib/db');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { randomUUID } = require('crypto');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ success: false, message: 'Method not allowed' });
  await initDB();
  const user = await requireAuth(req, res); if (!user) return;
  const { postId } = req.query;
  const existing = await dbGet('SELECT id FROM bookmarks WHERE user_id=? AND post_id=?', [user.id, postId]);
  if (existing) {
    await dbRun('DELETE FROM bookmarks WHERE user_id=? AND post_id=?', [user.id, postId]);
    return res.json({ success: true, bookmarked: false, message: 'Bookmark removed' });
  }
  await dbRun('INSERT INTO bookmarks (id,user_id,post_id,created_at) VALUES (?,?,?,?)',
    [randomUUID(), user.id, postId, new Date().toISOString()]);
  res.json({ success: true, bookmarked: true, message: 'Post bookmarked' });
};
