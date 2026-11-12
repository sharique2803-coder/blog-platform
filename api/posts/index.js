// GET /api/posts  — list posts
// POST /api/posts — create post
const { initDB } = require('../_lib/db');
const { Post, User } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth, getUserFromToken } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();

  if (req.method === 'GET') {
    const user   = await getUserFromToken(req);
    const { page=1, limit=10, search='', tag='', category='', dateFrom='', dateTo='' } = req.query;
    const result = await Post.findAll({ page:+page, limit:+limit, search, tag, category,
      userId: user?.id || null, dateFrom, dateTo });
    return res.json({ success: true, ...result, count: result.posts.length,
      page: +page, pages: Math.ceil(result.total / limit) });
  }

  if (req.method === 'POST') {
    const authUser = await requireAuth(req, res); if (!authUser) return;
    const { title, content, excerpt, coverImage, tags, categoryId, published, featured, publishAt } = req.body || {};
    if (!title || !content)
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    const post = await Post.create({
      title, content, excerpt: excerpt||'', coverImage: coverImage||'',
      tags: Array.isArray(tags) ? tags.map(t=>t.toLowerCase().trim()) : [],
      categoryId: categoryId||null, authorId: authUser.id,
      published: publishAt ? false : (published !== undefined ? !!published : true),
      featured: !!featured, publishAt: publishAt||null,
    });
    await User.checkAndAwardBadges(authUser.id);
    return res.status(201).json({ success: true, message: 'Post created', post });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
