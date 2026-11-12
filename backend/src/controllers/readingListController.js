const { randomUUID } = require('crypto');
const { getDB } = require('../config/db');
const Post = require('../models/Post');

// Toggle post in reading list
const toggleReadingList = (req, res) => {
  try {
    const DB=getDB();
    const existing=DB.get('SELECT id,read FROM reading_list WHERE user_id=? AND post_id=?',[req.user.id,req.params.postId]);
    if (existing) {
      DB.run('DELETE FROM reading_list WHERE user_id=? AND post_id=?',[req.user.id,req.params.postId]);
      return res.json({ success:true, inList:false, message:'Removed from reading list' });
    }
    DB.run('INSERT INTO reading_list (id,user_id,post_id,read,created_at) VALUES (?,?,?,0,?)',
      [randomUUID(),req.user.id,req.params.postId,new Date().toISOString()]);
    res.json({ success:true, inList:true, message:'Added to reading list' });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

// Mark as read
const markRead = (req, res) => {
  try {
    getDB().run('UPDATE reading_list SET read=1 WHERE user_id=? AND post_id=?',[req.user.id,req.params.postId]);
    res.json({ success:true, message:'Marked as read' });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

// Get reading list
const getReadingList = (req, res) => {
  try {
    const DB=getDB();
    const rows=DB.all('SELECT post_id,read FROM reading_list WHERE user_id=? ORDER BY created_at DESC',[req.user.id]);
    const items=rows.map(r=>({ post:Post.findById(r.post_id,req.user.id), read:!!r.read })).filter(i=>i.post);
    res.json({ success:true, count:items.length, items });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

module.exports = { toggleReadingList, markRead, getReadingList };
