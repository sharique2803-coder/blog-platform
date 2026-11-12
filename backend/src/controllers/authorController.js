const User = require('../models/User');
const Post = require('../models/Post');
const { getDB } = require('../config/db');

// @route GET /api/authors/:id
const getAuthorProfile = (req, res) => {
  try {
    const user = User.findById(req.params.id);
    if (!user || user.banned)
      return res.status(404).json({ success:false, message:'Author not found' });

    const stats = User.getStats(user.id);
    const posts = Post.findByAuthor(user.id, false);

    // Is current user following?
    let isFollowing = false;
    if (req.user) {
      isFollowing = !!getDB().get(
        'SELECT id FROM follows WHERE follower_id=? AND following_id=?',
        [req.user.id, user.id]
      );
    }

    res.json({
      success: true,
      author: {
        id: user.id, username: user.username,
        email: user.email, bio: user.bio, avatar: user.avatar,
        role: user.role, createdAt: user.created_at,
      },
      stats,
      posts,
      isFollowing,
    });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

module.exports = { getAuthorProfile };
