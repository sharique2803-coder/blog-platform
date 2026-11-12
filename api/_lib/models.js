// ============================================================
// models.js — All DB model helpers (async Turso version)
// ============================================================
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { dbGet, dbAll, dbRun } = require('./db');

const parseArr = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const parseObj = (v) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };
const toArr    = (v) => JSON.stringify(Array.isArray(v) ? v : []);
const toObj    = (v) => JSON.stringify(v && typeof v === 'object' ? v : {});

function calcReadingTime(content) {
  const words = (content || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ── USER ──────────────────────────────────────────────────────
const User = {
  async create({ username, email, password, bio = '', avatar = '', role = 'user' }) {
    const id      = randomUUID();
    const now     = new Date().toISOString();
    const hashed  = bcrypt.hashSync(password, 10);
    await dbRun(
      `INSERT INTO users (id,username,email,password,bio,avatar,role,banned,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,0,?,?)`,
      [id, username, email, hashed, bio, avatar, role, now, now]
    );
    return User.findById(id);
  },
  findById:    (id)    => dbGet('SELECT * FROM users WHERE id=?', [id]),
  findByEmail: (email) => dbGet('SELECT * FROM users WHERE email=?', [email]),
  findByUsername: (u)  => dbGet('SELECT * FROM users WHERE username=?', [u]),
  findByEmailOrUsername: (email, username) =>
    dbGet('SELECT * FROM users WHERE email=? OR username=?', [email, username]),

  async findAll({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const totalRow = await dbGet('SELECT COUNT(*) as n FROM users');
    const users    = await dbAll('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    return { users, total: totalRow?.n || 0 };
  },

  async update(id, fields) {
    const allowed = ['username', 'bio', 'avatar', 'role', 'banned'];
    const sets = [], vals = [];
    for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); }
    if (!sets.length) return User.findById(id);
    sets.push('updated_at=?'); vals.push(new Date().toISOString(), id);
    await dbRun(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);
    return User.findById(id);
  },

  matchPassword: (plain, hashed) => bcrypt.compareSync(plain, hashed),

  async getStats(userId) {
    const postCount  = (await dbGet('SELECT COUNT(*) as n FROM posts WHERE author_id=? AND published=1', [userId]))?.n || 0;
    const totalViews = (await dbGet('SELECT SUM(views) as n FROM posts WHERE author_id=?', [userId]))?.n || 0;
    const likesRows  = await dbAll('SELECT likes FROM posts WHERE author_id=?', [userId]);
    const totalLikes = likesRows.reduce((s, r) => s + parseArr(r.likes).length, 0);
    const followers  = (await dbGet('SELECT COUNT(*) as n FROM follows WHERE following_id=?', [userId]))?.n || 0;
    const following  = (await dbGet('SELECT COUNT(*) as n FROM follows WHERE follower_id=?',  [userId]))?.n || 0;
    const badges     = await dbAll('SELECT type,label,earned_at FROM badges WHERE user_id=?', [userId]);
    return { postCount, totalViews, totalLikes, followerCount: followers, followingCount: following, badges };
  },

  async checkAndAwardBadges(userId) {
    const defs = [
      { type: 'first_post',    label: 'First Post',      fn: async () => ((await dbGet('SELECT COUNT(*) as n FROM posts WHERE author_id=? AND published=1', [userId]))?.n || 0) >= 1 },
      { type: 'ten_posts',     label: 'Prolific Writer',  fn: async () => ((await dbGet('SELECT COUNT(*) as n FROM posts WHERE author_id=? AND published=1', [userId]))?.n || 0) >= 10 },
      { type: 'century_views', label: 'Century Views',    fn: async () => ((await dbGet('SELECT SUM(views) as n FROM posts WHERE author_id=?', [userId]))?.n || 0) >= 100 },
      { type: 'viral',         label: 'Viral',            fn: async () => ((await dbGet('SELECT SUM(views) as n FROM posts WHERE author_id=?', [userId]))?.n || 0) >= 1000 },
      { type: 'social',        label: 'Social Butterfly', fn: async () => ((await dbGet('SELECT COUNT(*) as n FROM follows WHERE following_id=?', [userId]))?.n || 0) >= 10 },
    ];
    for (const def of defs) {
      const already = await dbGet('SELECT id FROM badges WHERE user_id=? AND type=?', [userId, def.type]);
      if (!already && await def.fn()) {
        await dbRun('INSERT OR IGNORE INTO badges (id,user_id,type,label,earned_at) VALUES (?,?,?,?,?)',
          [randomUUID(), userId, def.type, def.label, new Date().toISOString()]);
      }
    }
  },
};

// ── POST ──────────────────────────────────────────────────────
const Post = {
  async _hydrate(row, userId = null) {
    if (!row) return null;
    const author   = await dbGet('SELECT id,username,avatar,bio,role FROM users WHERE id=?', [row.author_id]);
    const cc       = await dbGet('SELECT COUNT(*) as n FROM comments WHERE post_id=?', [row.id]);
    const category = row.category_id
      ? await dbGet('SELECT id,name,slug FROM categories WHERE id=?', [row.category_id])
      : null;
    const badges = author ? await dbAll('SELECT type,label FROM badges WHERE user_id=?', [author.id]) : [];
    let bookmarked = false, inReadingList = false;
    if (userId) {
      bookmarked    = !!(await dbGet('SELECT id FROM bookmarks    WHERE user_id=? AND post_id=?', [userId, row.id]));
      inReadingList = !!(await dbGet('SELECT id FROM reading_list WHERE user_id=? AND post_id=?', [userId, row.id]));
    }
    return {
      _id: row.id, id: row.id,
      title: row.title, content: row.content, excerpt: row.excerpt,
      coverImage: row.cover_image, tags: parseArr(row.tags),
      category: category || null,
      likes: parseArr(row.likes), reactions: parseObj(row.reactions),
      views: row.views, readingTime: row.reading_time,
      published: row.published === 1 || row.published === true,
      featured:  row.featured  === 1 || row.featured  === true,
      publishAt: row.publish_at || null,
      createdAt: row.created_at, updatedAt: row.updated_at,
      author: author ? { _id: author.id, id: author.id, username: author.username,
        avatar: author.avatar, bio: author.bio, role: author.role, badges } : null,
      commentCount: cc?.n || 0, bookmarked, inReadingList,
    };
  },

  async create({ title, content, excerpt, coverImage = '', tags = [], categoryId = null,
                 authorId, published = true, featured = false, publishAt = null }) {
    const id  = randomUUID();
    const now = new Date().toISOString();
    const auto= excerpt || content.replace(/<[^>]+>/g, '').substring(0, 200) + '...';
    const rt  = calcReadingTime(content);
    await dbRun(
      `INSERT INTO posts (id,title,content,excerpt,cover_image,tags,category_id,author_id,
         likes,reactions,views,reading_time,published,featured,publish_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,'[]','{}',0,?,?,?,?,?,?)`,
      [id, title, content, auto, coverImage, toArr(tags), categoryId, authorId,
       rt, published ? 1 : 0, featured ? 1 : 0, publishAt, now, now]
    );
    return Post.findById(id);
  },

  async findById(id, userId = null) {
    const row = await dbGet('SELECT * FROM posts WHERE id=?', [id]);
    return Post._hydrate(row, userId);
  },

  async findAll({ page = 1, limit = 10, search = '', tag = '', category = '', userId = null, dateFrom = '', dateTo = '' } = {}) {
    const offset = (page - 1) * limit;
    let where = 'WHERE p.published=1';
    const params = [];
    if (search)   { where += ' AND (p.title LIKE ? OR p.content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (tag)      { where += ' AND p.tags LIKE ?'; params.push(`%"${tag.toLowerCase()}"%`); }
    if (category) { where += ' AND c.slug=?'; params.push(category); }
    if (dateFrom) { where += ' AND p.created_at>=?'; params.push(dateFrom); }
    if (dateTo)   { where += ' AND p.created_at<=?'; params.push(dateTo + 'T23:59:59'); }
    const totalRow = await dbGet(`SELECT COUNT(*) as n FROM posts p LEFT JOIN categories c ON p.category_id=c.id ${where}`, params);
    const rows     = await dbAll(`SELECT p.* FROM posts p LEFT JOIN categories c ON p.category_id=c.id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const posts = await Promise.all(rows.map(r => Post._hydrate(r, userId)));
    return { posts, total: totalRow?.n || 0 };
  },

  async findTrending({ limit = 6 } = {}) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let rows = await dbAll(`SELECT * FROM posts WHERE published=1 AND created_at>? ORDER BY views DESC LIMIT ?`, [since, limit]);
    if (rows.length < 3) rows = await dbAll('SELECT * FROM posts WHERE published=1 ORDER BY views DESC LIMIT ?', [limit]);
    return Promise.all(rows.map(r => Post._hydrate(r)));
  },

  async findRelated(postId, { limit = 4 } = {}) {
    const post = await dbGet('SELECT tags,category_id,author_id FROM posts WHERE id=?', [postId]);
    if (!post) return [];
    const tags = parseArr(post.tags);
    const rows = await dbAll('SELECT * FROM posts WHERE published=1 AND id!=? ORDER BY created_at DESC LIMIT 20', [postId]);
    const scored = rows.map(r => ({
      row: r,
      score: tags.filter(t => parseArr(r.tags).includes(t)).length * 3
           + (r.category_id === post.category_id ? 2 : 0)
           + (r.author_id   === post.author_id   ? 1 : 0),
    })).sort((a, b) => b.score - a.score).slice(0, limit);
    return Promise.all(scored.map(s => Post._hydrate(s.row)));
  },

  async findByAuthor(authorId, includeUnpublished = false) {
    const where = includeUnpublished ? 'WHERE author_id=?' : 'WHERE author_id=? AND published=1';
    const rows  = await dbAll(`SELECT * FROM posts ${where} ORDER BY created_at DESC`, [authorId]);
    return Promise.all(rows.map(r => Post._hydrate(r)));
  },

  async findFeatured({ limit = 3 } = {}) {
    const rows = await dbAll('SELECT * FROM posts WHERE published=1 AND featured=1 ORDER BY created_at DESC LIMIT ?', [limit]);
    return Promise.all(rows.map(r => Post._hydrate(r)));
  },

  async findScheduled() {
    return dbAll(`SELECT * FROM posts WHERE published=0 AND publish_at IS NOT NULL AND publish_at<=?`, [new Date().toISOString()]);
  },

  async update(id, fields) {
    const map = { title: 'title', content: 'content', excerpt: 'excerpt', coverImage: 'cover_image',
                  published: 'published', featured: 'featured', categoryId: 'category_id', publishAt: 'publish_at' };
    const sets = [], vals = [];
    for (const [jk, dc] of Object.entries(map)) {
      if (fields[jk] !== undefined) {
        sets.push(`${dc}=?`);
        vals.push(['published', 'featured'].includes(jk) ? (fields[jk] ? 1 : 0) : fields[jk]);
      }
    }
    if (fields.tags    !== undefined) { sets.push('tags=?');         vals.push(toArr(fields.tags)); }
    if (fields.content !== undefined) { sets.push('reading_time=?'); vals.push(calcReadingTime(fields.content)); }
    if (!sets.length) return Post.findById(id);
    sets.push('updated_at=?'); vals.push(new Date().toISOString(), id);
    await dbRun(`UPDATE posts SET ${sets.join(',')} WHERE id=?`, vals);
    return Post.findById(id);
  },

  async saveRevision({ postId, title, content, excerpt, revisedBy }) {
    await dbRun(`INSERT INTO post_revisions (id,post_id,title,content,excerpt,revised_by,created_at) VALUES (?,?,?,?,?,?,?)`,
      [randomUUID(), postId, title, content, excerpt || '', revisedBy, new Date().toISOString()]);
  },

  getRevisions:  (postId) => dbAll('SELECT id,post_id,title,excerpt,revised_by,created_at FROM post_revisions WHERE post_id=? ORDER BY created_at DESC LIMIT 20', [postId]),
  getRevision:   (revId)  => dbGet('SELECT * FROM post_revisions WHERE id=?', [revId]),
  incrementViews:(id)     => dbRun('UPDATE posts SET views=views+1 WHERE id=?', [id]),

  async toggleReaction(id, userId, emoji) {
    const row = await dbGet('SELECT reactions FROM posts WHERE id=?', [id]);
    if (!row) return null;
    const r = parseObj(row.reactions);
    if (!r[emoji]) r[emoji] = [];
    const idx = r[emoji].indexOf(userId);
    if (idx > -1) r[emoji].splice(idx, 1); else r[emoji].push(userId);
    await dbRun('UPDATE posts SET reactions=? WHERE id=?', [toObj(r), id]);
    return r;
  },

  async toggleLike(id, userId) {
    const row = await dbGet('SELECT likes FROM posts WHERE id=?', [id]);
    if (!row) return null;
    let likes = parseArr(row.likes);
    const liked = likes.includes(userId);
    likes = liked ? likes.filter(u => u !== userId) : [...likes, userId];
    await dbRun('UPDATE posts SET likes=? WHERE id=?', [toArr(likes), id]);
    return { liked: !liked, likesCount: likes.length };
  },

  delete:       (id)     => dbRun('DELETE FROM posts WHERE id=?', [id]),
  recordEvent:  (postId, type) => dbRun('INSERT INTO analytics_events (id,post_id,event_type,created_at) VALUES (?,?,?,?)',
    [randomUUID(), postId, type, new Date().toISOString()]),

  async getAuthorAnalytics(authorId, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const posts = await dbAll('SELECT id FROM posts WHERE author_id=?', [authorId]);
    if (!posts.length) return { daily: [], totals: { views: 0, posts: 0 } };
    const ids  = posts.map(p => p.id);
    const ph   = ids.map(() => '?').join(',');
    const daily= await dbAll(
      `SELECT date(created_at) as day, event_type, COUNT(*) as count
       FROM analytics_events WHERE post_id IN (${ph}) AND created_at>=?
       GROUP BY day, event_type ORDER BY day ASC`,
      [...ids, since]
    );
    const totals = await dbGet(`SELECT SUM(views) as totalViews FROM posts WHERE author_id=?`, [authorId]);
    return { daily, totals: { views: totals?.totalViews || 0, posts: posts.length } };
  },
};

// ── COMMENT ───────────────────────────────────────────────────
const Comment = {
  async _hydrate(row) {
    if (!row) return null;
    const author  = await dbGet('SELECT id,username,avatar FROM users WHERE id=?', [row.author_id]);
    const replies = await dbAll('SELECT * FROM comments WHERE parent_id=? ORDER BY created_at ASC', [row.id]);
    const hydratedReplies = await Promise.all(replies.map(r => Comment._hydrateFlat(r)));
    return {
      _id: row.id, id: row.id,
      content: row.content, post: row.post_id, parentId: row.parent_id || null,
      likes: parseArr(row.likes), upvotes: parseArr(row.upvotes), downvotes: parseArr(row.downvotes),
      score: parseArr(row.upvotes).length - parseArr(row.downvotes).length,
      createdAt: row.created_at, updatedAt: row.updated_at,
      author: author ? { _id: author.id, id: author.id, username: author.username, avatar: author.avatar } : null,
      replies: hydratedReplies,
    };
  },

  async _hydrateFlat(row) {
    if (!row) return null;
    const author = await dbGet('SELECT id,username,avatar FROM users WHERE id=?', [row.author_id]);
    return {
      _id: row.id, id: row.id,
      content: row.content, post: row.post_id, parentId: row.parent_id || null,
      likes: parseArr(row.likes), upvotes: parseArr(row.upvotes), downvotes: parseArr(row.downvotes),
      score: parseArr(row.upvotes).length - parseArr(row.downvotes).length,
      createdAt: row.created_at, updatedAt: row.updated_at,
      author: author ? { _id: author.id, id: author.id, username: author.username, avatar: author.avatar } : null,
      replies: [],
    };
  },

  async create({ content, authorId, postId, parentId = null }) {
    const id = randomUUID(); const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO comments (id,content,author_id,post_id,parent_id,likes,upvotes,downvotes,created_at,updated_at)
       VALUES (?,?,?,?,?,'[]','[]','[]',?,?)`,
      [id, content, authorId, postId, parentId, now, now]
    );
    return Comment.findById(id);
  },

  async findById(id) { return Comment._hydrate(await dbGet('SELECT * FROM comments WHERE id=?', [id])); },

  async findByPost(postId, sort = 'new') {
    const order = sort === 'top' ? 'ORDER BY created_at ASC' : 'ORDER BY created_at DESC';
    const rows  = await dbAll(`SELECT * FROM comments WHERE post_id=? AND parent_id IS NULL ${order}`, [postId]);
    return Promise.all(rows.map(r => Comment._hydrate(r)));
  },

  async update(id, content) {
    await dbRun('UPDATE comments SET content=?,updated_at=? WHERE id=?', [content, new Date().toISOString(), id]);
    return Comment.findById(id);
  },

  async vote(id, userId, direction) {
    const row = await dbGet('SELECT upvotes,downvotes FROM comments WHERE id=?', [id]);
    if (!row) return null;
    let up = parseArr(row.upvotes), down = parseArr(row.downvotes);
    if (direction === 'up')  { down = down.filter(u => u !== userId); if (up.includes(userId)) up = up.filter(u => u !== userId); else up.push(userId); }
    else                     { up   = up.filter(u => u !== userId);   if (down.includes(userId)) down = down.filter(u => u !== userId); else down.push(userId); }
    await dbRun('UPDATE comments SET upvotes=?,downvotes=? WHERE id=?', [toArr(up), toArr(down), id]);
    return { upvotes: up.length, downvotes: down.length, score: up.length - down.length };
  },

  delete:       (id)     => dbRun('DELETE FROM comments WHERE id=? OR parent_id=?', [id, id]),
  deleteByPost: (postId) => dbRun('DELETE FROM comments WHERE post_id=?', [postId]),
};

// ── NOTIFICATION helper ───────────────────────────────────────
async function createNotification({ userId, type, message, link = '' }) {
  try {
    await dbRun('INSERT INTO notifications (id,user_id,type,message,link,read,created_at) VALUES (?,?,?,?,?,0,?)',
      [randomUUID(), userId, type, message, link, new Date().toISOString()]);
  } catch {}
}

module.exports = { User, Post, Comment, createNotification };
