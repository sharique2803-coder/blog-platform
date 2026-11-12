const { randomUUID } = require('crypto');
const { getDB } = require('../config/db');

const parseArr = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const parseObj = (v) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };
const toArr    = (v) => JSON.stringify(Array.isArray(v) ? v : []);
const toObj    = (v) => JSON.stringify(v && typeof v === 'object' ? v : {});

function calcReadingTime(content) {
  const words = (content || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function hydrate(row, userId = null) {
  if (!row) return null;
  const DB = getDB();
  const author   = DB.get('SELECT id,username,avatar,bio,role FROM users WHERE id=?', [row.author_id]);
  const cc       = DB.get('SELECT COUNT(*) as n FROM comments WHERE post_id=?', [row.id]);
  const category = row.category_id ? DB.get('SELECT id,name,slug FROM categories WHERE id=?', [row.category_id]) : null;
  let bookmarked = false, inReadingList = false;
  if (userId) {
    bookmarked    = !!DB.get('SELECT id FROM bookmarks    WHERE user_id=? AND post_id=?', [userId, row.id]);
    inReadingList = !!DB.get('SELECT id FROM reading_list WHERE user_id=? AND post_id=?', [userId, row.id]);
  }
  const userBadges = DB.all('SELECT type,label,earned_at FROM badges WHERE user_id=?', [row.author_id]);
  return {
    _id: row.id, id: row.id,
    title: row.title, content: row.content, excerpt: row.excerpt,
    coverImage: row.cover_image, tags: parseArr(row.tags), category: category || null,
    likes: parseArr(row.likes), reactions: parseObj(row.reactions),
    views: row.views, readingTime: row.reading_time,
    published: row.published === 1 || row.published === true,
    featured:  row.featured  === 1 || row.featured  === true,
    publishAt: row.publish_at || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    author: author ? { _id: author.id, id: author.id, username: author.username,
      avatar: author.avatar, bio: author.bio, role: author.role, badges: userBadges } : null,
    commentCount: cc ? cc.n : 0, bookmarked, inReadingList,
  };
}

const Post = {
  create({ title, content, excerpt, coverImage='', tags=[], categoryId=null,
           authorId, published=true, featured=false, publishAt=null }) {
    const DB  = getDB();
    const id  = randomUUID();
    const now = new Date().toISOString();
    const auto= excerpt || content.replace(/<[^>]+>/g,'').substring(0,200)+'...';
    const rt  = calcReadingTime(content);
    DB.run(
      `INSERT INTO posts (id,title,content,excerpt,cover_image,tags,category_id,author_id,
         likes,reactions,views,reading_time,published,featured,publish_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,'[]','{}',0,?,?,?,?,?,?)`,
      [id,title,content,auto,coverImage,toArr(tags),categoryId,authorId,
       rt,published?1:0,featured?1:0,publishAt,now,now]
    );
    return Post.findById(id);
  },

  findById(id, userId=null) {
    return hydrate(getDB().get('SELECT * FROM posts WHERE id=?',[id]), userId);
  },

  findAll({ page=1,limit=10,search='',tag='',category='',userId=null,dateFrom='',dateTo='' }={}) {
    const DB=getDB(); const offset=(page-1)*limit;
    let where='WHERE p.published=1'; const params=[];
    if (search)   { where+=' AND (p.title LIKE ? OR p.content LIKE ?)'; params.push(`%${search}%`,`%${search}%`); }
    if (tag)      { where+=' AND p.tags LIKE ?'; params.push(`%"${tag.toLowerCase()}"%`); }
    if (category) { where+=' AND c.slug=?'; params.push(category); }
    if (dateFrom) { where+=' AND p.created_at>=?'; params.push(dateFrom); }
    if (dateTo)   { where+=' AND p.created_at<=?'; params.push(dateTo+'T23:59:59'); }
    const totalRow=DB.get(`SELECT COUNT(*) as n FROM posts p LEFT JOIN categories c ON p.category_id=c.id ${where}`,params);
    const rows=DB.all(`SELECT p.* FROM posts p LEFT JOIN categories c ON p.category_id=c.id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,[...params,limit,offset]);
    return { posts:rows.map(r=>hydrate(r,userId)), total:totalRow?totalRow.n:0 };
  },

  findTrending({ limit=6 }={}) {
    const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
    const rows=getDB().all(`SELECT * FROM posts WHERE published=1 AND created_at>? ORDER BY views DESC LIMIT ?`,[since,limit]);
    if (rows.length<3) return getDB().all('SELECT * FROM posts WHERE published=1 ORDER BY views DESC LIMIT ?',[limit]).map(r=>hydrate(r));
    return rows.map(r=>hydrate(r));
  },

  findRelated(postId,{ limit=4 }={}) {
    const post=getDB().get('SELECT tags,category_id,author_id FROM posts WHERE id=?',[postId]);
    if (!post) return [];
    const tags=parseArr(post.tags);
    const rows=getDB().all(`SELECT * FROM posts WHERE published=1 AND id!=? ORDER BY created_at DESC LIMIT 20`,[postId]);
    return rows.map(r=>({ row:r, score:tags.filter(t=>parseArr(r.tags).includes(t)).length*3+(r.category_id===post.category_id?2:0)+(r.author_id===post.author_id?1:0) }))
      .sort((a,b)=>b.score-a.score).slice(0,limit).map(s=>hydrate(s.row));
  },

  findByAuthor(authorId, includeUnpublished=false) {
    const w=includeUnpublished?'WHERE author_id=?':'WHERE author_id=? AND published=1';
    return getDB().all(`SELECT * FROM posts ${w} ORDER BY created_at DESC`,[authorId]).map(r=>hydrate(r));
  },

  findFeatured({ limit=3 }={}) {
    return getDB().all('SELECT * FROM posts WHERE published=1 AND featured=1 ORDER BY created_at DESC LIMIT ?',[limit]).map(r=>hydrate(r));
  },

  findScheduled() {
    const now=new Date().toISOString();
    return getDB().all(`SELECT * FROM posts WHERE published=0 AND publish_at IS NOT NULL AND publish_at<=?`,[now]);
  },

  update(id, fields) {
    const DB=getDB();
    const map={title:'title',content:'content',excerpt:'excerpt',coverImage:'cover_image',
               published:'published',featured:'featured',categoryId:'category_id',publishAt:'publish_at'};
    const sets=[]; const vals=[];
    for (const [jk,dc] of Object.entries(map)) {
      if (fields[jk]!==undefined) { sets.push(`${dc}=?`); vals.push(['published','featured'].includes(jk)?(fields[jk]?1:0):fields[jk]); }
    }
    if (fields.tags!==undefined)    { sets.push('tags=?');         vals.push(toArr(fields.tags)); }
    if (fields.content!==undefined) { sets.push('reading_time=?'); vals.push(calcReadingTime(fields.content)); }
    if (!sets.length) return Post.findById(id);
    sets.push('updated_at=?'); vals.push(new Date().toISOString(),id);
    DB.run(`UPDATE posts SET ${sets.join(',')} WHERE id=?`,vals);
    return Post.findById(id);
  },

  saveRevision({ postId, title, content, excerpt, revisedBy }) {
    getDB().run(
      `INSERT INTO post_revisions (id,post_id,title,content,excerpt,revised_by,created_at) VALUES (?,?,?,?,?,?,?)`,
      [randomUUID(),postId,title,content,excerpt||'',revisedBy,new Date().toISOString()]
    );
  },

  getRevisions(postId) {
    return getDB().all('SELECT id,post_id,title,excerpt,revised_by,created_at FROM post_revisions WHERE post_id=? ORDER BY created_at DESC LIMIT 20',[postId]);
  },

  getRevision(revId) {
    return getDB().get('SELECT * FROM post_revisions WHERE id=?',[revId]);
  },

  incrementViews(id) { getDB().run('UPDATE posts SET views=views+1 WHERE id=?',[id]); },

  toggleReaction(id, userId, emoji) {
    const DB=getDB();
    const row=DB.get('SELECT reactions FROM posts WHERE id=?',[id]);
    if (!row) return null;
    const r=parseObj(row.reactions);
    if (!r[emoji]) r[emoji]=[];
    const idx=r[emoji].indexOf(userId);
    if (idx>-1) r[emoji].splice(idx,1); else r[emoji].push(userId);
    DB.run('UPDATE posts SET reactions=? WHERE id=?',[toObj(r),id]);
    return r;
  },

  delete(id) { getDB().run('DELETE FROM posts WHERE id=?',[id]); },

  // Analytics: record daily view/reaction events
  recordEvent(postId, type) {
    getDB().run('INSERT INTO analytics_events (id,post_id,event_type,created_at) VALUES (?,?,?,?)',
      [randomUUID(),postId,type,new Date().toISOString()]);
  },

  getAnalytics(postId, days=30) {
    const since=new Date(Date.now()-days*24*60*60*1000).toISOString();
    return getDB().all(
      `SELECT date(created_at) as day, event_type, COUNT(*) as count
       FROM analytics_events WHERE post_id=? AND created_at>=?
       GROUP BY day, event_type ORDER BY day ASC`,
      [postId,since]
    );
  },

  getAuthorAnalytics(authorId, days=30) {
    const since=new Date(Date.now()-days*24*60*60*1000).toISOString();
    const posts=getDB().all('SELECT id FROM posts WHERE author_id=?',[authorId]);
    if (!posts.length) return { daily:[], totals:{} };
    const ids=posts.map(p=>p.id);
    const placeholders=ids.map(()=>'?').join(',');
    const daily=getDB().all(
      `SELECT date(created_at) as day, event_type, COUNT(*) as count
       FROM analytics_events WHERE post_id IN (${placeholders}) AND created_at>=?
       GROUP BY day, event_type ORDER BY day ASC`,
      [...ids,since]
    );
    const totals=getDB().get(
      `SELECT SUM(views) as totalViews FROM posts WHERE author_id=?`,[authorId]
    );
    return { daily, totals:{ views: totals?.totalViews||0, posts:posts.length } };
  },
};

module.exports = Post;
