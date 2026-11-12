const { randomUUID } = require('crypto');
const { getDB } = require('../config/db');

let _notifyUser = null;
function setNotifyUser(fn) { _notifyUser = fn; }

function createNotification({ userId, type, message, link='' }) {
  try {
    const DB=getDB(); const id=randomUUID(); const now=new Date().toISOString();
    DB.run('INSERT INTO notifications (id,user_id,type,message,link,read,created_at) VALUES (?,?,?,?,?,0,?)',
      [id,userId,type,message,link,now]);
    // Push via WebSocket
    if (_notifyUser) _notifyUser(userId, { userId, type, message, link, createdAt:now });
  } catch(err){ console.error('Notification error:', err.message); }
}

const getNotifications = (req, res) => {
  try {
    const DB=getDB();
    const notifications=DB.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[req.user.id]);
    const unread=DB.get('SELECT COUNT(*) as n FROM notifications WHERE user_id=? AND read=0',[req.user.id])?.n||0;
    res.json({ success:true, notifications, unread });
  } catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

const markAllRead = (req, res) => {
  try { getDB().run('UPDATE notifications SET read=1 WHERE user_id=?',[req.user.id]); res.json({ success:true }); }
  catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

const markOneRead = (req, res) => {
  try { getDB().run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?',[req.params.id,req.user.id]); res.json({ success:true }); }
  catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

const clearAll = (req, res) => {
  try { getDB().run('DELETE FROM notifications WHERE user_id=?',[req.user.id]); res.json({ success:true }); }
  catch(err){ res.status(500).json({ success:false,message:err.message }); }
};

module.exports = { createNotification, setNotifyUser, getNotifications, markAllRead, markOneRead, clearAll };
