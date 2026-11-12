const { initDB } = require('../_lib/db');
const { User }   = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();

  if (req.method === 'GET') {
    const authUser = await requireAuth(req, res); if (!authUser) return;
    const user  = await User.findById(authUser.id);
    const stats = await User.getStats(authUser.id);
    return res.json({ success: true,
      user: { id: user.id, username: user.username, email: user.email, bio: user.bio,
              avatar: user.avatar, role: user.role, createdAt: user.created_at, ...stats } });
  }

  if (req.method === 'PUT') {
    const authUser = await requireAuth(req, res); if (!authUser) return;
    const { username, bio } = req.body || {};
    const updated = await User.update(authUser.id, { username, bio });
    return res.json({ success: true, message: 'Profile updated',
      user: { id: updated.id, username: updated.username, email: updated.email,
              bio: updated.bio, avatar: updated.avatar, role: updated.role } });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
