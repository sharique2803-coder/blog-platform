// GET  /api/comments/:postId        — list comments
// POST /api/comments/:postId        — add comment
// PUT  /api/comments/:id            — update comment  (id passed as query param via vercel.json rewrite)
// DELETE /api/comments/:id          — delete
// PUT  /api/comments/:id/like       — like
// PUT  /api/comments/:id/vote       — vote
const { initDB } = require('../_lib/db');
const { Comment, Post, User, createNotification } = require('../_lib/models');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');

const MENTION_RE = /@([a-zA-Z0-9_]+)/g;
function extractMentions(text) {
  const m = []; let match;
  while ((match = MENTION_RE.exec(text)) !== null) m.push(match[1]);
  return [...new Set(m)];
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();

  const { postId } = req.query;
  const url        = req.url || '';
  const segments   = url.split('?')[0].split('/').filter(Boolean);
  const action     = segments[3] || null; // like | vote

  // GET comments for a post
  if (req.method === 'GET') {
    const comments = await Comment.findByPost(postId, req.query.sort || 'new');
    return res.json({ success: true, count: comments.length, comments });
  }

  // POST — add comment
  if (req.method === 'POST' && !action) {
    const user = await requireAuth(req, res); if (!user) return;
    const { content, parentId } = req.body || {};
    if (!content?.trim())
      return res.status(400).json({ success: false, message: 'Content is required' });
    const post = await Post.findById(postId);
    if (!post || !post.published)
      return res.status(404).json({ success: false, message: 'Post not found' });
    const comment = await Comment.create({ content: content.trim(), authorId: user.id, postId, parentId: parentId || null });
    // Notify post author
    if (post.author && post.author.id !== user.id)
      await createNotification({ userId: post.author.id, type: 'comment',
        message: `${user.username} commented on "${post.title}"`, link: `/pages/post.html?id=${post.id}` });
    // Handle @mentions
    for (const uname of extractMentions(content)) {
      const mentioned = await User.findByUsername(uname);
      if (mentioned && mentioned.id !== user.id)
        await createNotification({ userId: mentioned.id, type: 'mention',
          message: `${user.username} mentioned you in a comment`, link: `/pages/post.html?id=${post.id}` });
    }
    await User.checkAndAwardBadges(user.id);
    return res.status(201).json({ success: true, message: 'Comment added', comment });
  }

  // PUT — update comment  (postId is actually commentId here via rewrite)
  if (req.method === 'PUT' && !action) {
    const user    = await requireAuth(req, res); if (!user) return;
    const comment = await Comment.findById(postId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (comment.author.id !== user.id)
      return res.status(403).json({ success: false, message: 'Not authorized' });
    const { content } = req.body || {};
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Content is required' });
    return res.json({ success: true, comment: await Comment.update(postId, content.trim()) });
  }

  // DELETE
  if (req.method === 'DELETE') {
    const user    = await requireAuth(req, res); if (!user) return;
    const comment = await Comment.findById(postId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (comment.author.id !== user.id && user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Not authorized' });
    await Comment.delete(postId);
    return res.json({ success: true, message: 'Comment deleted' });
  }

  // PUT like
  if (req.method === 'PUT' && action === 'like') {
    const user = await requireAuth(req, res); if (!user) return;
    // postId is commentId here
    const row  = await require('../_lib/db').dbGet('SELECT likes FROM comments WHERE id=?', [postId]);
    if (!row) return res.status(404).json({ success: false, message: 'Comment not found' });
    let likes = JSON.parse(row.likes || '[]');
    const liked = likes.includes(user.id);
    likes = liked ? likes.filter(u => u !== user.id) : [...likes, user.id];
    await require('../_lib/db').dbRun('UPDATE comments SET likes=? WHERE id=?', [JSON.stringify(likes), postId]);
    return res.json({ success: true, liked: !liked, likesCount: likes.length });
  }

  // PUT vote
  if (req.method === 'PUT' && action === 'vote') {
    const user = await requireAuth(req, res); if (!user) return;
    const { direction } = req.body || {};
    if (!['up','down'].includes(direction))
      return res.status(400).json({ success: false, message: 'direction must be up or down' });
    const result = await Comment.vote(postId, user.id, direction);
    return res.json({ success: true, ...result });
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
};
