const { randomUUID } = require('crypto');
const { getDB } = require('../config/db');
const Post = require('../models/Post');

// @route PUT /api/bookmarks/:postId  (toggle)
const toggleBookmark = (req, res) => {
  try {
    const DB       = getDB();
    const existing = DB.get('SELECT id FROM bookmarks WHERE user_id=? AND post_id=?',
      [req.user.id, req.params.postId]);

    if (existing) {
      DB.run('DELETE FROM bookmarks WHERE user_id=? AND post_id=?',
        [req.user.id, req.params.postId]);
      res.json({ success:true, bookmarked:false, message:'Bookmark removed' });
    } else {
      DB.run('INSERT INTO bookmarks (id,user_id,post_id,created_at) VALUES (?,?,?,?)',
        [randomUUID(), req.user.id, req.params.postId, new Date().toISOString()]);
      res.json({ success:true, bookmarked:true, message:'Post bookmarked' });
    }
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/bookmarks  (list saved posts)
const getBookmarks = (req, res) => {
  try {
    const DB   = getDB();
    const rows = DB.all(
      'SELECT post_id FROM bookmarks WHERE user_id=? ORDER BY created_at DESC',
      [req.user.id]
    );
    const posts = rows
      .map(r => Post.findById(r.post_id, req.user.id))
      .filter(Boolean);
    res.json({ success:true, count:posts.length, posts });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

module.exports = { toggleBookmark, getBookmarks };
