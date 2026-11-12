const { initDB } = require('./_lib/db');
const { Post }   = require('./_lib/models');

module.exports = async (req, res) => {
  await initDB();
  const { posts } = await Post.findAll({ limit: 20 });
  const items = posts.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>https://${req.headers.host}/pages/post.html?id=${p.id}</link>
      <description><![CDATA[${p.excerpt || ''}]]></description>
      <author>${p.author?.username || 'Unknown'}</author>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <guid>https://${req.headers.host}/pages/post.html?id=${p.id}</guid>
    </item>`).join('');
  res.setHeader('Content-Type', 'application/rss+xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>BlogSpace</title>
    <link>https://${req.headers.host}</link>
    <description>Latest posts from BlogSpace</description>
    ${items}
  </channel>
</rss>`);
};
