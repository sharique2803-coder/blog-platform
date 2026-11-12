const { randomUUID } = require('crypto');
const { getDB } = require('../config/db');

const parseArr=(v)=>{ try{return JSON.parse(v||'[]');}catch{return [];} };
const toArr   =(v)=>JSON.stringify(Array.isArray(v)?v:[]);

function hydrate(row) {
  if (!row) return null;
  const DB=getDB();
  const author=DB.get('SELECT id,username,avatar FROM users WHERE id=?',[row.author_id]);
  const replies=DB.all('SELECT * FROM comments WHERE parent_id=? ORDER BY created_at ASC',[row.id]).map(hydrateFlat);
  return {
    _id:row.id, id:row.id,
    content:row.content, post:row.post_id, parentId:row.parent_id||null,
    likes:parseArr(row.likes), upvotes:parseArr(row.upvotes), downvotes:parseArr(row.downvotes),
    score:(parseArr(row.upvotes).length - parseArr(row.downvotes).length),
    createdAt:row.created_at, updatedAt:row.updated_at,
    author:author?{_id:author.id,id:author.id,username:author.username,avatar:author.avatar}:null,
    replies,
  };
}

function hydrateFlat(row) {
  if (!row) return null;
  const author=getDB().get('SELECT id,username,avatar FROM users WHERE id=?',[row.author_id]);
  return {
    _id:row.id, id:row.id,
    content:row.content, post:row.post_id, parentId:row.parent_id||null,
    likes:parseArr(row.likes), upvotes:parseArr(row.upvotes), downvotes:parseArr(row.downvotes),
    score:(parseArr(row.upvotes).length - parseArr(row.downvotes).length),
    createdAt:row.created_at, updatedAt:row.updated_at,
    author:author?{_id:author.id,id:author.id,username:author.username,avatar:author.avatar}:null,
    replies:[],
  };
}

const Comment = {
  create({ content, authorId, postId, parentId=null }) {
    const DB=getDB(); const id=randomUUID(); const now=new Date().toISOString();
    DB.run(`INSERT INTO comments (id,content,author_id,post_id,parent_id,likes,upvotes,downvotes,created_at,updated_at)
            VALUES (?,?,?,?,?,'[]','[]','[]',?,?)`,
      [id,content,authorId,postId,parentId,now,now]);
    return Comment.findById(id);
  },

  findById(id) { return hydrate(getDB().get('SELECT * FROM comments WHERE id=?',[id])); },

  findByPost(postId, sort='new') {
    let order = sort==='top' ? 'ORDER BY (json_array_length(upvotes)-json_array_length(downvotes)) DESC' : 'ORDER BY created_at DESC';
    return getDB().all(`SELECT * FROM comments WHERE post_id=? AND parent_id IS NULL ${order}`,[postId]).map(hydrate);
  },

  update(id, content) {
    getDB().run('UPDATE comments SET content=?,updated_at=? WHERE id=?',[content,new Date().toISOString(),id]);
    return Comment.findById(id);
  },

  vote(id, userId, direction) {
    const DB=getDB();
    const row=DB.get('SELECT upvotes,downvotes FROM comments WHERE id=?',[id]);
    if (!row) return null;
    let up=parseArr(row.upvotes), down=parseArr(row.downvotes);
    if (direction==='up') {
      down=down.filter(u=>u!==userId);
      if (up.includes(userId)) up=up.filter(u=>u!==userId); else up.push(userId);
    } else {
      up=up.filter(u=>u!==userId);
      if (down.includes(userId)) down=down.filter(u=>u!==userId); else down.push(userId);
    }
    DB.run('UPDATE comments SET upvotes=?,downvotes=? WHERE id=?',[toArr(up),toArr(down),id]);
    return { upvotes:up.length, downvotes:down.length, score:up.length-down.length };
  },

  delete(id) { getDB().run('DELETE FROM comments WHERE id=? OR parent_id=?',[id,id]); },
  deleteByPost(postId) { getDB().run('DELETE FROM comments WHERE post_id=?',[postId]); },
};

module.exports = Comment;
