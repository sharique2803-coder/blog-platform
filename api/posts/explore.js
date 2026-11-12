const { initDB, dbAll } = require('../_lib/db');
const { Post } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const cats = await dbAll(
    `SELECT c.*, COUNT(p.id) as postCount FROM categories c
     LEFT JOIN posts p ON p.category_id=c.id AND p.published=1
     GROUP BY c.id ORDER BY postCount DESC`
  );
  const result = await Promise.all(cats.map(async cat => {
    const rows = await dbAll(
      `SELECT * FROM posts WHERE category_id=? AND published=1 ORDER BY views DESC LIMIT 4`,
      [cat.id]
    );
    const topPosts = await Promise.all(rows.map(r => Post.findById(r.id)));
    return { ...cat, topPosts };
  }));
  res.json({ success: true, categories: result });
};
