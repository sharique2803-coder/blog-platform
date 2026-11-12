const { initDB } = require('./_lib/db');
const { Post }   = require('./_lib/models');

module.exports = async (req, res) => {
  await initDB();
  const { posts } = await Post.findAll({ limit: 500 });
  const base   = `https://${req.headers.host}`;
  const statics= ['', 'pages/explore.html', 'pages/search.html'].map(p =>
    `<url><loc>${base}/${p}</loc><changefreq>weekly</changefreq></url>`).join('');
  const postUrls = posts.map(p =>
    `<url><loc>${base}/pages/post.html?id=${p.id}</loc><lastmod>${new Date(p.updatedAt).toISOString().split('T')[0]}</lastmod></url>`
  ).join('');
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${statics}${postUrls}
</urlset>`);
};
