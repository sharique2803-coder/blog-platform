const { initDB } = require('../_lib/db');
const { Post }   = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
  await initDB();
  const user  = await requireAuth(req, res); if (!user) return;
  const posts = await Post.findByAuthor(user.id, true);
  res.json({ success: true, count: posts.length, posts });
};
