const { initDB, dbGet } = require('../_lib/db');
const { User, Post }   = require('../_lib/models');
const { handleCors }   = require('../_lib/cors');
const { getUserFromToken } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
  await initDB();

  const { id } = req.query;
  const user   = await User.findById(id);
  if (!user || user.banned) return res.status(404).json({ success: false, message: 'Author not found' });

  const stats  = await User.getStats(id);
  const posts  = await Post.findByAuthor(id, false);
  const me     = await getUserFromToken(req);
  let isFollowing = false;
  if (me) isFollowing = !!(await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [me.id, id]));

  res.json({ success: true,
    author: { id: user.id, username: user.username, email: user.email, bio: user.bio,
              avatar: user.avatar, role: user.role, createdAt: user.created_at },
    stats, posts, isFollowing });
};
