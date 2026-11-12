const { initDB, dbAll } = require('../_lib/db');
const { handleCors } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const categories = await dbAll(
    `SELECT c.*, COUNT(p.id) as postCount FROM categories c
     LEFT JOIN posts p ON p.category_id=c.id AND p.published=1
     GROUP BY c.id ORDER BY c.name ASC`
  );
  res.json({ success: true, categories });
};
