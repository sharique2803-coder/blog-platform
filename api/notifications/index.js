const { initDB, dbAll, dbGet, dbRun } = require('../_lib/db');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const user = await requireAuth(req, res); if (!user) return;

  const url     = req.url || '';
  const segment = url.split('?')[0].split('/').filter(Boolean)[2]; // notifications/:id or 'read'

  // GET all notifications
  if (req.method === 'GET' && !segment) {
    const notifications = await dbAll('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50', [user.id]);
    const unreadRow     = await dbGet('SELECT COUNT(*) as n FROM notifications WHERE user_id=? AND read=0', [user.id]);
    return res.json({ success: true, notifications, unread: unreadRow?.n || 0 });
  }

  // PUT /read — mark all read
  if (req.method === 'PUT' && segment === 'read') {
    await dbRun('UPDATE notifications SET read=1 WHERE user_id=?', [user.id]);
    return res.json({ success: true });
  }

  // DELETE — clear all
  if (req.method === 'DELETE' && !segment) {
    await dbRun('DELETE FROM notifications WHERE user_id=?', [user.id]);
    return res.json({ success: true });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
