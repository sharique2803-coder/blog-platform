// GET    /api/posts/:id         — get single post
// PUT    /api/posts/:id         — update post
// DELETE /api/posts/:id         — delete post
// PUT    /api/posts/:id/like    — toggle like
// PUT    /api/posts/:id/react   — emoji reaction
// GET    /api/posts/:id/related — related posts
// GET    /api/posts/:id/revisions       — list revisions
// POST   /api/posts/:id/revisions/:revId/restore — restore revision
const { initDB } = require('../_lib/db');
const { Post, Comment } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth, getUserFromToken } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();

  const { id } = req.query;
  // Parse sub-route from URL: /api/posts/:id/like etc.
  const url      = req.url || '';
  const segments = url.split('?')[0].split('/').filter(Boolean);
  // segments example: ['api','posts','abc123','like'] → action = segments[3]
  const action   = segments[3] || null;
  const revId    = segments[4] || null; // for restore: segments[3]=revisions, [4]=:revId, [5]=restore

  // ── GET single post ───────────────────────────────────────
  if (req.method === 'GET' && !action) {
    const user = await getUserFromToken(req);
    const post = await Post.findById(id, user?.id || null);
    if (!post || !post.published)
      return res.status(404).json({ success: false, message: 'Post not found' });
    await Post.incrementViews(id);
    await Post.recordEvent(id, 'view');
    post.views += 1;
    return res.json({ success: true, post });
  }

  // ── GET related ───────────────────────────────────────────
  if (req.method === 'GET' && action === 'related') {
    return res.json({ success: true, posts: await Post.findRelated(id) });
  }

  // ── GET revisions ─────────────────────────────────────────
  if (req.method === 'GET' && action === 'revisions') {
    const user = await requireAuth(req, res); if (!user) return;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.author.id !== user.id && user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized' });
    return res.json({ success: true, revisions: await Post.getRevisions(id) });
  }

  // ── POST restore revision ─────────────────────────────────
  if (req.method === 'POST' && action === 'revisions' && revId) {
    const user = await requireAuth(req, res); if (!user) return;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.author.id !== user.id && user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized' });
    const rev = await Post.getRevision(revId);
    if (!rev || rev.post_id !== id) return res.status(404).json({ success: false, message: 'Revision not found' });
    await Post.saveRevision({ postId: id, title: post.title, content: post.content, excerpt: post.excerpt, revisedBy: user.id });
    const restored = await Post.update(id, { title: rev.title, content: rev.content, excerpt: rev.excerpt });
    return res.json({ success: true, message: 'Revision restored', post: restored });
  }

  // ── PUT update ────────────────────────────────────────────
  if (req.method === 'PUT' && !action) {
    const user = await requireAuth(req, res); if (!user) return;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.author.id !== user.id && user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized' });
    await Post.saveRevision({ postId: id, title: post.title, content: post.content, excerpt: post.excerpt, revisedBy: user.id });
    const { title, content, excerpt, coverImage, tags, categoryId, published, featured, publishAt } = req.body || {};
    const updates = {};
    if (title      !== undefined) updates.title      = title;
    if (content    !== undefined) updates.content    = content;
    if (excerpt    !== undefined) updates.excerpt    = excerpt;
    if (coverImage !== undefined) updates.coverImage = coverImage;
    if (published  !== undefined) updates.published  = !!published;
    if (featured   !== undefined) updates.featured   = !!featured;
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (publishAt  !== undefined) updates.publishAt  = publishAt;
    if (tags       !== undefined) updates.tags       = tags.map(t => t.toLowerCase().trim());
    return res.json({ success: true, message: 'Post updated', post: await Post.update(id, updates) });
  }

  // ── DELETE ────────────────────────────────────────────────
  if (req.method === 'DELETE' && !action) {
    const user = await requireAuth(req, res); if (!user) return;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.author.id !== user.id && user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized' });
    await Comment.deleteByPost(id);
    await Post.delete(id);
    return res.json({ success: true, message: 'Post deleted' });
  }

  // ── PUT like ──────────────────────────────────────────────
  if (req.method === 'PUT' && action === 'like') {
    const user = await requireAuth(req, res); if (!user) return;
    const result = await Post.toggleLike(id, user.id);
    return res.json({ success: true, ...result });
  }

  // ── PUT react ─────────────────────────────────────────────
  if (req.method === 'PUT' && action === 'react') {
    const user = await requireAuth(req, res); if (!user) return;
    const { emoji } = req.body || {};
    const allowed = ['❤️','🔥','🤯','👏','😂'];
    if (!allowed.includes(emoji))
      return res.status(400).json({ success: false, message: 'Invalid reaction' });
    const reactions = await Post.toggleReaction(id, user.id, emoji);
    await Post.recordEvent(id, 'reaction');
    return res.json({ success: true, reactions });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
