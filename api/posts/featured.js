const { initDB } = require('../_lib/db');
const { Post }   = require('../_lib/models');
const { handleCors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const posts = await Post.findFeatured({ limit: 3 });
  res.json({ success: true, posts });
};
