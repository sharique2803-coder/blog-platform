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

  const url      = req.url || '';
  const isRead   = url.includes('/read');

  if (isRead) {
    await dbRun('UPDATE reading_list SET read=1 WHERE user_id=? AND post_id=?', [user.id, postId]);
    return res.json({ success: true, message: 'Marked as read' });
  }

  const existing = await dbGet('SELECT id FROM reading_list WHERE user_id=? AND post_id=?', [user.id, postId]);
  if (existing) {
    await dbRun('DELETE FROM reading_list WHERE user_id=? AND post_id=?', [user.id, postId]);
    return res.json({ success: true, inList: false, message: 'Removed from reading list' });
  }
  await dbRun('INSERT INTO reading_list (id,user_id,post_id,read,created_at) VALUES (?,?,?,0,?)',
    [randomUUID(), user.id, postId, new Date().toISOString()]);
  res.json({ success: true, inList: true, message: 'Added to reading list' });
};
