const Post    = require('../models/Post');
const Comment = require('../models/Comment');
const User    = require('../models/User');
const { getDB } = require('../config/db');
const { broadcast } = require('../ws');

const getPosts = (req, res) => {
  try {
    const { page=1,limit=10,search='',tag='',category='',dateFrom='',dateTo='' } = req.query;
    const userId = req.user?.id || null;
    const { posts, total } = Post.findAll({ page:+page, limit:+limit, search, tag, category, userId, dateFrom, dateTo });
    res.json({ success:true, count:posts.length, total, page:+page, pages:Math.ceil(total/limit), posts });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const getPostById = (req, res) => {
  try {
    const userId = req.user?.id || null;
    const post   = Post.findById(req.params.id, userId);
    if (!post || !post.published) return res.status(404).json({ success:false, message:'Post not found' });
    Post.incrementViews(req.params.id);
    Post.recordEvent(req.params.id, 'view');
    post.views += 1;
    res.json({ success:true, post });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const createPost = (req, res) => {
  try {
    const { title, content, excerpt, coverImage, tags, categoryId, published, featured, publishAt } = req.body;
    if (!title||!content) return res.status(400).json({ success:false, message:'Title and content are required' });
    const post = Post.create({
      title, content, excerpt:excerpt||'', coverImage:coverImage||'',
      tags: Array.isArray(tags)?tags.map(t=>t.toLowerCase().trim()):[],
      categoryId:categoryId||null, authorId:req.user.id,
      published: publishAt ? false : (published!==undefined?!!published:true),
      featured: !!featured,
      publishAt: publishAt||null,
    });
    // Award badges on publish
    User.checkAndAwardBadges(req.user.id);
    res.status(201).json({ success:true, message:'Post created', post });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const updatePost = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    if (post.author.id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success:false, message:'Not authorized' });
    // Save revision before overwriting
    Post.saveRevision({ postId:post.id, title:post.title, content:post.content, excerpt:post.excerpt, revisedBy:req.user.id });
    const { title, content, excerpt, coverImage, tags, categoryId, published, featured, publishAt } = req.body;
    const updates = {};
    if (title!==undefined)      updates.title      = title;
    if (content!==undefined)    updates.content    = content;
    if (excerpt!==undefined)    updates.excerpt    = excerpt;
    if (coverImage!==undefined) updates.coverImage = coverImage;
    if (published!==undefined)  updates.published  = !!published;
    if (featured!==undefined)   updates.featured   = !!featured;
    if (categoryId!==undefined) updates.categoryId = categoryId;
    if (publishAt!==undefined)  updates.publishAt  = publishAt;
    if (tags!==undefined)       updates.tags       = tags.map(t=>t.toLowerCase().trim());
    const updated = Post.update(req.params.id, updates);
    res.json({ success:true, message:'Post updated', post:updated });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const deletePost = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    if (post.author.id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success:false, message:'Not authorized' });
    Comment.deleteByPost(req.params.id);
    Post.delete(req.params.id);
    res.json({ success:true, message:'Post deleted' });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const likePost = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    const result = Post.toggleLike ? Post.toggleLike(req.params.id, req.user.id) : null;
    // toggleLike still works from base model
    res.json({ success:true, ...result });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const reactPost = (req, res) => {
  try {
    const { emoji } = req.body;
    const allowed = ['❤️','🔥','🤯','👏','😂'];
    if (!allowed.includes(emoji)) return res.status(400).json({ success:false, message:'Invalid reaction' });
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    const reactions = Post.toggleReaction(req.params.id, req.user.id, emoji);
    Post.recordEvent(req.params.id, 'reaction');
    // broadcast via WS
    broadcast({ type:'reaction', postId:req.params.id, reactions });
    res.json({ success:true, reactions });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const getRevisions = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    if (post.author.id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success:false, message:'Not authorized' });
    const revisions = Post.getRevisions(req.params.id);
    res.json({ success:true, revisions });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const restoreRevision = (req, res) => {
  try {
    const post = Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success:false, message:'Post not found' });
    if (post.author.id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success:false, message:'Not authorized' });
    const rev = Post.getRevision(req.params.revId);
    if (!rev || rev.post_id !== req.params.id) return res.status(404).json({ success:false, message:'Revision not found' });
    Post.saveRevision({ postId:post.id, title:post.title, content:post.content, excerpt:post.excerpt, revisedBy:req.user.id });
    const restored = Post.update(req.params.id, { title:rev.title, content:rev.content, excerpt:rev.excerpt });
    res.json({ success:true, message:'Revision restored', post:restored });
  } catch(err){ res.status(500).json({ success:false, message:err.message }); }
};

const getMyPosts   = (req, res) => { try { const posts=Post.findByAuthor(req.user.id,true); res.json({ success:true,count:posts.length,posts }); } catch(err){ res.status(500).json({ success:false,message:err.message }); } };
const getTrending  = (req, res) => { try { res.json({ success:true, posts:Post.findTrending({ limit:+(req.query.limit||6) }) }); } catch(err){ res.status(500).json({ success:false,message:err.message }); } };
const getRelated   = (req, res) => { try { res.json({ success:true, posts:Post.findRelated(req.params.id,{limit:4}) }); } catch(err){ res.status(500).json({ success:false,message:err.message }); } };
const getFeatured  = (req, res) => { try { res.json({ success:true, posts:Post.findFeatured({limit:3}) }); } catch(err){ res.status(500).json({ success:false,message:err.message }); } };
const getCategories= (req, res) => {
  try {
    const DB=getDB();
    const cats = DB.all(`SELECT c.*,COUNT(p.id) as postCount FROM categories c
      LEFT JOIN posts p ON p.category_id=c.id AND p.published=1
      GROUP BY c.id ORDER BY c.name ASC`);
    res.json({ success:true, categories:cats });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

const getAnalytics = (req, res) => {
  try {
    const { days=30 } = req.query;
    const data = Post.getAuthorAnalytics(req.user.id, +days);
    res.json({ success:true, ...data });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

// Explore: categories with top posts
const getExplore = (req, res) => {
  try {
    const DB=getDB();
    const cats=DB.all(`SELECT c.*,COUNT(p.id) as postCount FROM categories c
      LEFT JOIN posts p ON p.category_id=c.id AND p.published=1
      GROUP BY c.id ORDER BY postCount DESC`);
    const result = cats.map(cat => {
      const topPosts=DB.all(`SELECT * FROM posts WHERE category_id=? AND published=1 ORDER BY views DESC LIMIT 4`,[cat.id])
        .map(r => Post.findById(r.id));
      return { ...cat, topPosts };
    });
    res.json({ success:true, categories:result });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

// Image upload (multer)
const uploadImage = (req, res) => {
  if (!req.file) return res.status(400).json({ success:false, message:'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success:true, url });
};

module.exports = { getPosts, getPostById, createPost, updatePost, deletePost, likePost, reactPost,
  getRevisions, restoreRevision, getMyPosts, getTrending, getRelated, getFeatured, getCategories,
  getAnalytics, getExplore, uploadImage };
