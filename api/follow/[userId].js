const { initDB, dbGet, dbAll, dbRun } = require('../_lib/db');
const { User, createNotification } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth, getUserFromToken } = require('../_lib/auth');
const { randomUUID } = require('crypto');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const { userId } = req.query;
  const url        = req.url || '';
  const action     = url.split('?')[0].split('/').filter(Boolean)[3]; // followers | following | status

  // GET followers
  if (req.method === 'GET' && action === 'followers') {
    const rows  = await dbAll('SELECT follower_id FROM follows WHERE following_id=? ORDER BY created_at DESC', [userId]);
    const users = (await Promise.all(rows.map(r => User.findById(r.follower_id))))
      .filter(Boolean).map(u => ({ id: u.id, username: u.username, avatar: u.avatar, bio: u.bio }));
    return res.json({ success: true, count: users.length, users });
  }

  // GET following
  if (req.method === 'GET' && action === 'following') {
    const rows  = await dbAll('SELECT following_id FROM follows WHERE follower_id=? ORDER BY created_at DESC', [userId]);
    const users = (await Promise.all(rows.map(r => User.findById(r.following_id))))
      .filter(Boolean).map(u => ({ id: u.id, username: u.username, avatar: u.avatar, bio: u.bio }));
    return res.json({ success: true, count: users.length, users });
  }

  // GET status (is current user following?)
  if (req.method === 'GET' && action === 'status') {
    const me = await getUserFromToken(req);
    if (!me) return res.json({ success: true, following: false });
    const following = !!(await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [me.id, userId]));
    return res.json({ success: true, following });
  }

  // PUT — toggle follow
  if (req.method === 'PUT' && !action) {
    const me = await requireAuth(req, res); if (!me) return;
    if (me.id === userId) return res.status(400).json({ success: false, message: "Can't follow yourself" });
    const target   = await User.findById(userId);
    if (!target)   return res.status(404).json({ success: false, message: 'User not found' });
    const existing = await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [me.id, userId]);
    if (existing) {
      await dbRun('DELETE FROM follows WHERE follower_id=? AND following_id=?', [me.id, userId]);
      return res.json({ success: true, following: false, message: `Unfollowed ${target.username}` });
    }
    await dbRun('INSERT INTO follows (id,follower_id,following_id,created_at) VALUES (?,?,?,?)',
      [randomUUID(), me.id, userId, new Date().toISOString()]);
    await createNotification({ userId, type: 'follow',
      message: `${me.username} started following you`, link: `/pages/author.html?id=${me.id}` });
    return res.json({ success: true, following: true, message: `Now following ${target.username}` });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
