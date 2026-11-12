require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const http     = require('http');
const { initDB, getDB } = require('./config/db');
const { initWS, notifyUser } = require('./ws');
const { setNotifyUser } = require('./controllers/notificationController');
const Post = require('./models/Post');

async function startServer() {
  await initDB();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit:'10mb' }));
  app.use(express.urlencoded({ extended:false }));

  // Serve uploaded images
  app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
  // Serve static frontend
  app.use(express.static(path.join(__dirname, '../../frontend')));

  // ── API Routes ──────────────────────────────────────────────
  app.use('/api/auth',          require('./routes/authRoutes'));
  app.use('/api/posts',         require('./routes/postRoutes'));
  app.use('/api/comments',      require('./routes/commentRoutes'));
  app.use('/api/notifications', require('./routes/notificationRoutes'));
  app.use('/api/bookmarks',     require('./routes/bookmarkRoutes'));
  app.use('/api/reading-list',  require('./routes/readingListRoutes'));
  app.use('/api/follow',        require('./routes/followRoutes'));
  app.use('/api/authors',       require('./routes/authorRoutes'));
  app.use('/api/admin',         require('./routes/adminRoutes'));

  // ── RSS Feed ────────────────────────────────────────────────
  app.get('/feed.xml', (req, res) => {
    try {
      const { posts } = Post.findAll({ limit:20 });
      const items = posts.map(p => `
        <item>
          <title><![CDATA[${p.title}]]></title>
          <link>http://localhost:5000/pages/post.html?id=${p.id}</link>
          <description><![CDATA[${p.excerpt||''}]]></description>
          <author>${p.author?.username||'Unknown'}</author>
          <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
          <guid>http://localhost:5000/pages/post.html?id=${p.id}</guid>
        </item>`).join('');
      res.type('application/rss+xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BlogSpace</title>
    <link>http://localhost:5000</link>
    <description>Latest posts from BlogSpace</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="http://localhost:5000/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`);
    } catch(err){ res.status(500).send('RSS error'); }
  });

  // ── Sitemap ─────────────────────────────────────────────────
  app.get('/sitemap.xml', (req, res) => {
    try {
      const { posts } = Post.findAll({ limit:500 });
      const staticPages = ['','pages/login.html','pages/register.html','pages/explore.html'];
      const staticUrls  = staticPages.map(p=>`
        <url><loc>http://localhost:5000/${p}</loc><changefreq>weekly</changefreq></url>`).join('');
      const postUrls    = posts.map(p=>`
        <url>
          <loc>http://localhost:5000/pages/post.html?id=${p.id}</loc>
          <lastmod>${new Date(p.updatedAt).toISOString().split('T')[0]}</lastmod>
          <changefreq>monthly</changefreq>
        </url>`).join('');
      res.type('application/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${staticUrls}${postUrls}
</urlset>`);
    } catch(err){ res.status(500).send('Sitemap error'); }
  });

  // ── SPA fallback ────────────────────────────────────────────
  app.get('*', (req, res) =>
    res.sendFile(path.join(__dirname, '../../frontend/index.html'))
  );

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status||500).json({ success:false, message:err.message||'Server Error' });
  });

  // ── Create HTTP server + attach WS ──────────────────────────
  const server = http.createServer(app);
  initWS(server);
  setNotifyUser(notifyUser);

  // ── Scheduled posts checker (every 60s) ─────────────────────
  setInterval(() => {
    const ready = Post.findScheduled();
    for (const row of ready) {
      Post.update(row.id, { published:true, publishAt:null });
      console.log(`  Published scheduled post: ${row.id}`);
    }
  }, 60 * 1000);

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () =>
    console.log(`\n  BlogSpace running → http://localhost:${PORT}\n`)
  );
}

startServer().catch(err => { console.error('Failed to start:', err); process.exit(1); });
