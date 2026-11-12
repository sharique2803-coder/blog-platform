const { initDB } = require('../_lib/db');
const { Post }   = require('../_lib/models');
const { handleCors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const posts = await Post.findTrending({ limit: +(req.query.limit || 6) });
  res.json({ success: true, posts });
};
