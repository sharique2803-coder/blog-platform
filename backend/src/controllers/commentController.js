const Comment = require('../models/Comment');
const Post    = require('../models/Post');
const User    = require('../models/User');
const { createNotification } = require('./notificationController');
const { broadcast } = require('../ws');

const MENTION_RE = /@([a-zA-Z0-9_]+)/g;

function extractMentions(text) {
  const matches = []; let m;
  while ((m = MENTION_RE.exec(text)) !== null) matches.push(m[1]);
  return [...new Set(matches)];
}

const getComments = (req, res) => {
  try {
    const sort = req.query.sort || 'new';
    const comments = Comment.findByPost(req.params.postId, sort);
    res.json({ success:true, count:comments.length, comments });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const addComment = (req, res) => {
  try {
    const { content, parentId } = req.body;
    if (!content?.trim()) return res.status(400).json({ success:false, message:'Content is required' });
    const post = Post.findById(req.params.postId);
    if (!post||!post.published) return res.status(404).json({ success:false, message:'Post not found' });

    const comment = Comment.create({ content:content.trim(), authorId:req.user.id, postId:req.params.postId, parentId:parentId||null });

    // Notify post author
    if (post.author && post.author.id !== req.user.id)
      createNotification({ userId:post.author.id, type:'comment', message:`${req.user.username} commented on "${post.title}"`, link:`/pages/post.html?id=${post.id}` });

    // Handle @mentions
    const mentions = extractMentions(content);
    for (const uname of mentions) {
      const mentioned = User.findByUsername(uname);
      if (mentioned && mentioned.id !== req.user.id)
        createNotification({ userId:mentioned.id, type:'mention', message:`${req.user.username} mentioned you in a comment`, link:`/pages/post.html?id=${post.id}` });
    }

    // Broadcast live comment via WebSocket
    broadcast({ type:'new_comment', postId:req.params.postId, comment });

    // Badge check
    User.checkAndAwardBadges(req.user.id);

    res.status(201).json({ success:true, message:'Comment added', comment });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const updateComment = (req, res) => {
  try {
    const comment = Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success:false, message:'Comment not found' });
    if (comment.author.id !== req.user.id) return res.status(403).json({ success:false, message:'Not authorized' });
    if (!req.body.content?.trim()) return res.status(400).json({ success:false, message:'Content is required' });
    res.json({ success:true, comment:Comment.update(req.params.id, req.body.content.trim()) });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const deleteComment = (req, res) => {
  try {
    const comment = Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success:false, message:'Comment not found' });
    if (comment.author.id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success:false, message:'Not authorized' });
    Comment.delete(req.params.id);
    broadcast({ type:'delete_comment', commentId:req.params.id, postId:comment.post });
    res.json({ success:true, message:'Comment deleted' });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const likeComment = (req, res) => {
  try {
    const comment = Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success:false, message:'Comment not found' });
    const result = Comment.toggleLike ? Comment.toggleLike(req.params.id, req.user.id) : { liked:false, likesCount:0 };
    res.json({ success:true, ...result });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const voteComment = (req, res) => {
  try {
    const { direction } = req.body;
    if (!['up','down'].includes(direction)) return res.status(400).json({ success:false, message:'direction must be up or down' });
    const comment = Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success:false, message:'Comment not found' });
    const result = Comment.vote(req.params.id, req.user.id, direction);
    res.json({ success:true, ...result });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

module.exports = { getComments, addComment, updateComment, deleteComment, likeComment, voteComment };
