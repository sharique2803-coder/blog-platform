const { randomUUID } = require('crypto');
const { getDB } = require('../config/db');
const User = require('../models/User');
const { createNotification } = require('./notificationController');

// @route PUT /api/follow/:userId  (toggle follow)
const toggleFollow = (req, res) => {
  try {
    const DB         = getDB();
    const followerId  = req.user.id;
    const followingId = req.params.userId;

    if (followerId === followingId)
      return res.status(400).json({ success:false, message:"You can't follow yourself" });

    const target = User.findById(followingId);
    if (!target)
      return res.status(404).json({ success:false, message:'User not found' });

    const existing = DB.get('SELECT id FROM follows WHERE follower_id=? AND following_id=?',
      [followerId, followingId]);

    if (existing) {
      DB.run('DELETE FROM follows WHERE follower_id=? AND following_id=?',
        [followerId, followingId]);
      res.json({ success:true, following:false, message:`Unfollowed ${target.username}` });
    } else {
      DB.run('INSERT INTO follows (id,follower_id,following_id,created_at) VALUES (?,?,?,?)',
        [randomUUID(), followerId, followingId, new Date().toISOString()]);

      createNotification({
        userId:  followingId,
        type:    'follow',
        message: `${req.user.username} started following you`,
        link:    `/pages/author.html?id=${followerId}`,
      });

      res.json({ success:true, following:true, message:`Now following ${target.username}` });
    }
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/follow/:userId/followers
const getFollowers = (req, res) => {
  try {
    const DB   = getDB();
    const rows = DB.all(
      'SELECT follower_id FROM follows WHERE following_id=? ORDER BY created_at DESC',
      [req.params.userId]
    );
    const users = rows.map(r => {
      const u = User.findById(r.follower_id);
      return u ? { id:u.id, username:u.username, avatar:u.avatar, bio:u.bio } : null;
    }).filter(Boolean);
    res.json({ success:true, count:users.length, users });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/follow/:userId/following
const getFollowing = (req, res) => {
  try {
    const DB   = getDB();
    const rows = DB.all(
      'SELECT following_id FROM follows WHERE follower_id=? ORDER BY created_at DESC',
      [req.params.userId]
    );
    const users = rows.map(r => {
      const u = User.findById(r.following_id);
      return u ? { id:u.id, username:u.username, avatar:u.avatar, bio:u.bio } : null;
    }).filter(Boolean);
    res.json({ success:true, count:users.length, users });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

// @route GET /api/follow/:userId/status  (is current user following?)
const getFollowStatus = (req, res) => {
  try {
    if (!req.user) return res.json({ success:true, following:false });
    const following = !!getDB().get(
      'SELECT id FROM follows WHERE follower_id=? AND following_id=?',
      [req.user.id, req.params.userId]
    );
    res.json({ success:true, following });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
};

module.exports = { toggleFollow, getFollowers, getFollowing, getFollowStatus };
