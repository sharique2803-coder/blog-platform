// ============================================================
// api/index.js — Single serverless function handling ALL routes
// This keeps us within Vercel Hobby's 12-function limit
// ============================================================
const { initDB, dbGet, dbAll, dbRun } = require('./_lib/db');
const { User, Post, Comment, createNotification } = require('./_lib/models');
const { requireAuth, requireAdmin, getUserFromToken } = require('./_lib/auth');
const { handleCors } = require('./_lib/cors');
const jwt  = require('jsonwebtoken');
const { randomUUID } = require('crypto');

// ── Route dispatcher ──────────────────────────────────────────
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    await initDB();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Database init failed: ' + err.message });
  }

  const url      = (req.url || '/').split('?')[0].replace(/\/$/, '') || '/';
  const segments = url.split('/').filter(Boolean); // ['api','posts','abc123','like']
  const method   = req.method.toUpperCase();
  const query    = req.query || {};
  const body     = req.body || {};

  // segments[0] = 'api', segments[1] = resource, segments[2] = id, segments[3] = action
  const resource = segments[1] || '';
  const seg2     = segments[2] || '';
  const seg3     = segments[3] || '';
  const seg4     = segments[4] || '';

  try {

    // ══════════════════════════════════════════════════════════
    // AUTH
    // ══════════════════════════════════════════════════════════
    if (resource === 'auth') {

      // POST /api/auth/register
      if (seg2 === 'register' && method === 'POST') {
        const { username, email, password } = body;
        if (!username || !email || !password)
          return res.status(400).json({ success:false, message:'Please provide all fields' });
        if (username.length < 3)
          return res.status(400).json({ success:false, message:'Username must be at least 3 characters' });
        if (password.length < 6)
          return res.status(400).json({ success:false, message:'Password must be at least 6 characters' });
        if (!/^\S+@\S+\.\S+$/.test(email))
          return res.status(400).json({ success:false, message:'Please enter a valid email' });
        const existing = await User.findByEmailOrUsername(email.toLowerCase(), username);
        if (existing) {
          const field = existing.email === email.toLowerCase() ? 'Email' : 'Username';
          return res.status(400).json({ success:false, message:`${field} is already taken` });
        }
        const user  = await User.create({ username, email:email.toLowerCase(), password });
        const token = jwt.sign({ id:user.id }, process.env.JWT_SECRET, { expiresIn:'7d' });
        return res.status(201).json({ success:true, message:'Registration successful', token,
          user:{ id:user.id, username:user.username, email:user.email, bio:user.bio, avatar:user.avatar, role:user.role, createdAt:user.created_at } });
      }

      // POST /api/auth/login
      if (seg2 === 'login' && method === 'POST') {
        const { email, password } = body;
        if (!email || !password)
          return res.status(400).json({ success:false, message:'Please provide email and password' });
        const user = await User.findByEmail(email.toLowerCase());
        if (!user || !User.matchPassword(password, user.password))
          return res.status(401).json({ success:false, message:'Invalid email or password' });
        if (user.banned)
          return res.status(403).json({ success:false, message:'Account suspended' });
        const token = jwt.sign({ id:user.id }, process.env.JWT_SECRET, { expiresIn:'7d' });
        return res.json({ success:true, message:'Login successful', token,
          user:{ id:user.id, username:user.username, email:user.email, bio:user.bio, avatar:user.avatar, role:user.role, createdAt:user.created_at } });
      }

      // GET /api/auth/me  |  PUT /api/auth/me  |  PUT /api/auth/profile
      if ((seg2 === 'me' || seg2 === 'profile')) {
        const authUser = await requireAuth(req, res); if (!authUser) return;
        if (method === 'GET') {
          const stats = await User.getStats(authUser.id);
          return res.json({ success:true, user:{ id:authUser.id, username:authUser.username,
            email:authUser.email, bio:authUser.bio, avatar:authUser.avatar,
            role:authUser.role, createdAt:authUser.created_at, ...stats } });
        }
        if (method === 'PUT') {
          const updated = await User.update(authUser.id, { username:body.username, bio:body.bio });
          return res.json({ success:true, message:'Profile updated',
            user:{ id:updated.id, username:updated.username, email:updated.email,
              bio:updated.bio, avatar:updated.avatar, role:updated.role } });
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    // POSTS
    // ══════════════════════════════════════════════════════════
    if (resource === 'posts') {

      // Static sub-routes first
      if (seg2 === 'categories' && method === 'GET') {
        const categories = await dbAll(`SELECT c.*, COUNT(p.id) as postCount FROM categories c LEFT JOIN posts p ON p.category_id=c.id AND p.published=1 GROUP BY c.id ORDER BY c.name ASC`);
        return res.json({ success:true, categories });
      }
      if (seg2 === 'trending' && method === 'GET') {
        return res.json({ success:true, posts: await Post.findTrending({ limit:+(query.limit||6) }) });
      }
      if (seg2 === 'featured' && method === 'GET') {
        return res.json({ success:true, posts: await Post.findFeatured({ limit:3 }) });
      }
      if (seg2 === 'explore' && method === 'GET') {
        const cats = await dbAll(`SELECT c.*, COUNT(p.id) as postCount FROM categories c LEFT JOIN posts p ON p.category_id=c.id AND p.published=1 GROUP BY c.id ORDER BY postCount DESC`);
        const result = await Promise.all(cats.map(async cat => {
          const rows = await dbAll(`SELECT * FROM posts WHERE category_id=? AND published=1 ORDER BY views DESC LIMIT 4`,[cat.id]);
          const topPosts = await Promise.all(rows.map(r => Post.findById(r.id)));
          return { ...cat, topPosts };
        }));
        return res.json({ success:true, categories:result });
      }
      if (seg2 === 'analytics' && method === 'GET') {
        const user = await requireAuth(req, res); if (!user) return;
        const data = await Post.getAuthorAnalytics(user.id, +(query.days||30));
        return res.json({ success:true, ...data });
      }
      if (seg2 === 'user' && seg3 === 'my' && method === 'GET') {
        const user = await requireAuth(req, res); if (!user) return;
        const posts = await Post.findByAuthor(user.id, true);
        return res.json({ success:true, count:posts.length, posts });
      }

      // GET /api/posts  — list
      if (!seg2 && method === 'GET') {
        const me = await getUserFromToken(req);
        const { page=1,limit=10,search='',tag='',category='',dateFrom='',dateTo='' } = query;
        const result = await Post.findAll({ page:+page,limit:+limit,search,tag,category,
          userId:me?.id||null,dateFrom,dateTo });
        return res.json({ success:true, ...result, count:result.posts.length,
          page:+page, pages:Math.ceil(result.total/limit) });
      }

      // POST /api/posts — create
      if (!seg2 && method === 'POST') {
        const user = await requireAuth(req, res); if (!user) return;
        const { title,content,excerpt,coverImage,tags,categoryId,published,featured,publishAt } = body;
        if (!title||!content)
          return res.status(400).json({ success:false, message:'Title and content are required' });
        const post = await Post.create({
          title,content,excerpt:excerpt||'',coverImage:coverImage||'',
          tags:Array.isArray(tags)?tags.map(t=>t.toLowerCase().trim()):[],
          categoryId:categoryId||null,authorId:user.id,
          published:publishAt?false:(published!==undefined?!!published:true),
          featured:!!featured,publishAt:publishAt||null,
        });
        await User.checkAndAwardBadges(user.id);
        return res.status(201).json({ success:true, message:'Post created', post });
      }

      // /api/posts/:id/...
      if (seg2) {
        const postId = seg2;

        if (seg3 === 'related' && method === 'GET')
          return res.json({ success:true, posts: await Post.findRelated(postId) });

        if (seg3 === 'revisions') {
          const user = await requireAuth(req, res); if (!user) return;
          const post = await Post.findById(postId);
          if (!post) return res.status(404).json({ success:false, message:'Post not found' });
          if (post.author.id!==user.id && user.role!=='admin')
            return res.status(403).json({ success:false, message:'Not authorized' });
          if (method === 'GET' && !seg4)
            return res.json({ success:true, revisions: await Post.getRevisions(postId) });
          if (method === 'POST' && seg4) { // restore
            const rev = await Post.getRevision(seg4);
            if (!rev||rev.post_id!==postId) return res.status(404).json({ success:false, message:'Revision not found' });
            await Post.saveRevision({ postId, title:post.title, content:post.content, excerpt:post.excerpt, revisedBy:user.id });
            const restored = await Post.update(postId,{ title:rev.title,content:rev.content,excerpt:rev.excerpt });
            return res.json({ success:true, message:'Revision restored', post:restored });
          }
        }

        if (seg3 === 'like' && method === 'PUT') {
          const user = await requireAuth(req, res); if (!user) return;
          const result = await Post.toggleLike(postId, user.id);
          return res.json({ success:true, ...result });
        }

        if (seg3 === 'react' && method === 'PUT') {
          const user = await requireAuth(req, res); if (!user) return;
          const allowed = ['❤️','🔥','🤯','👏','😂'];
          if (!allowed.includes(body.emoji))
            return res.status(400).json({ success:false, message:'Invalid reaction' });
          const reactions = await Post.toggleReaction(postId, user.id, body.emoji);
          await Post.recordEvent(postId, 'reaction');
          return res.json({ success:true, reactions });
        }

        if (!seg3) {
          if (method === 'GET') {
            const me = await getUserFromToken(req);
            const post = await Post.findById(postId, me?.id||null);
            if (!post||!post.published) return res.status(404).json({ success:false, message:'Post not found' });
            await Post.incrementViews(postId);
            await Post.recordEvent(postId,'view');
            post.views+=1;
            return res.json({ success:true, post });
          }
          if (method === 'PUT') {
            const user = await requireAuth(req, res); if (!user) return;
            const post = await Post.findById(postId);
            if (!post) return res.status(404).json({ success:false, message:'Post not found' });
            if (post.author.id!==user.id&&user.role!=='admin')
              return res.status(403).json({ success:false, message:'Not authorized' });
            await Post.saveRevision({ postId, title:post.title, content:post.content, excerpt:post.excerpt, revisedBy:user.id });
            const { title,content,excerpt,coverImage,tags,categoryId,published,featured,publishAt } = body;
            const updates = {};
            if (title!==undefined)      updates.title=title;
            if (content!==undefined)    updates.content=content;
            if (excerpt!==undefined)    updates.excerpt=excerpt;
            if (coverImage!==undefined) updates.coverImage=coverImage;
            if (published!==undefined)  updates.published=!!published;
            if (featured!==undefined)   updates.featured=!!featured;
            if (categoryId!==undefined) updates.categoryId=categoryId;
            if (publishAt!==undefined)  updates.publishAt=publishAt;
            if (tags!==undefined)       updates.tags=tags.map(t=>t.toLowerCase().trim());
            return res.json({ success:true, message:'Post updated', post: await Post.update(postId,updates) });
          }
          if (method === 'DELETE') {
            const user = await requireAuth(req, res); if (!user) return;
            const post = await Post.findById(postId);
            if (!post) return res.status(404).json({ success:false, message:'Post not found' });
            if (post.author.id!==user.id&&user.role!=='admin')
              return res.status(403).json({ success:false, message:'Not authorized' });
            await Comment.deleteByPost(postId);
            await Post.delete(postId);
            return res.json({ success:true, message:'Post deleted' });
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    // COMMENTS  /api/comments/:postId[/:action]
    // ══════════════════════════════════════════════════════════
    if (resource === 'comments' && seg2) {
      const id = seg2; // postId for GET/POST, commentId for PUT/DELETE

      const MENTION_RE = /@([a-zA-Z0-9_]+)/g;
      function extractMentions(text) {
        const m=[]; let match;
        while ((match=MENTION_RE.exec(text))!==null) m.push(match[1]);
        return [...new Set(m)];
      }

      if (method==='GET' && !seg3)
        return res.json({ success:true, comments: await Comment.findByPost(id, query.sort||'new') });

      if (method==='POST' && !seg3) {
        const user = await requireAuth(req, res); if (!user) return;
        const { content,parentId } = body;
        if (!content?.trim()) return res.status(400).json({ success:false, message:'Content is required' });
        const post = await Post.findById(id);
        if (!post||!post.published) return res.status(404).json({ success:false, message:'Post not found' });
        const comment = await Comment.create({ content:content.trim(), authorId:user.id, postId:id, parentId:parentId||null });
        if (post.author&&post.author.id!==user.id)
          await createNotification({ userId:post.author.id, type:'comment',
            message:`${user.username} commented on "${post.title}"`, link:`/pages/post.html?id=${post.id}` });
        for (const uname of extractMentions(content)) {
          const mentioned = await User.findByUsername(uname);
          if (mentioned&&mentioned.id!==user.id)
            await createNotification({ userId:mentioned.id, type:'mention',
              message:`${user.username} mentioned you in a comment`, link:`/pages/post.html?id=${post.id}` });
        }
        await User.checkAndAwardBadges(user.id);
        return res.status(201).json({ success:true, message:'Comment added', comment });
      }

      if (method==='PUT' && !seg3) {
        const user = await requireAuth(req, res); if (!user) return;
        const comment = await Comment.findById(id);
        if (!comment) return res.status(404).json({ success:false, message:'Comment not found' });
        if (comment.author.id!==user.id) return res.status(403).json({ success:false, message:'Not authorized' });
        if (!body.content?.trim()) return res.status(400).json({ success:false, message:'Content is required' });
        return res.json({ success:true, comment: await Comment.update(id,body.content.trim()) });
      }

      if (method==='DELETE') {
        const user = await requireAuth(req, res); if (!user) return;
        const comment = await Comment.findById(id);
        if (!comment) return res.status(404).json({ success:false, message:'Comment not found' });
        if (comment.author.id!==user.id&&user.role!=='admin') return res.status(403).json({ success:false, message:'Not authorized' });
        await Comment.delete(id);
        return res.json({ success:true, message:'Comment deleted' });
      }

      if (seg3==='like' && method==='PUT') {
        const user = await requireAuth(req, res); if (!user) return;
        const row = await dbGet('SELECT likes FROM comments WHERE id=?',[id]);
        if (!row) return res.status(404).json({ success:false, message:'Comment not found' });
        let likes=JSON.parse(row.likes||'[]');
        const liked=likes.includes(user.id);
        likes=liked?likes.filter(u=>u!==user.id):[...likes,user.id];
        await dbRun('UPDATE comments SET likes=? WHERE id=?',[JSON.stringify(likes),id]);
        return res.json({ success:true, liked:!liked, likesCount:likes.length });
      }

      if (seg3==='vote' && method==='PUT') {
        const user = await requireAuth(req, res); if (!user) return;
        if (!['up','down'].includes(body.direction))
          return res.status(400).json({ success:false, message:'direction must be up or down' });
        const result = await Comment.vote(id,user.id,body.direction);
        return res.json({ success:true, ...result });
      }
    }

    // ══════════════════════════════════════════════════════════
    // NOTIFICATIONS
    // ══════════════════════════════════════════════════════════
    if (resource === 'notifications') {
      const user = await requireAuth(req, res); if (!user) return;

      if (!seg2 && method==='GET') {
        const notifications = await dbAll('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[user.id]);
        const unread = (await dbGet('SELECT COUNT(*) as n FROM notifications WHERE user_id=? AND read=0',[user.id]))?.n||0;
        return res.json({ success:true, notifications, unread });
      }
      if (seg2==='read' && method==='PUT') {
        await dbRun('UPDATE notifications SET read=1 WHERE user_id=?',[user.id]);
        return res.json({ success:true });
      }
      if (!seg2 && method==='DELETE') {
        await dbRun('DELETE FROM notifications WHERE user_id=?',[user.id]);
        return res.json({ success:true });
      }
      if (seg2 && seg3==='read' && method==='PUT') {
        await dbRun('UPDATE notifications SET read=1 WHERE id=? AND user_id=?',[seg2,user.id]);
        return res.json({ success:true });
      }
    }

    // ══════════════════════════════════════════════════════════
    // BOOKMARKS
    // ══════════════════════════════════════════════════════════
    if (resource === 'bookmarks') {
      const user = await requireAuth(req, res); if (!user) return;

      if (!seg2 && method==='GET') {
        const rows = await dbAll('SELECT post_id FROM bookmarks WHERE user_id=? ORDER BY created_at DESC',[user.id]);
        const posts = (await Promise.all(rows.map(r=>Post.findById(r.post_id,user.id)))).filter(Boolean);
        return res.json({ success:true, count:posts.length, posts });
      }
      if (seg2 && method==='PUT') {
        const existing = await dbGet('SELECT id FROM bookmarks WHERE user_id=? AND post_id=?',[user.id,seg2]);
        if (existing) {
          await dbRun('DELETE FROM bookmarks WHERE user_id=? AND post_id=?',[user.id,seg2]);
          return res.json({ success:true, bookmarked:false });
        }
        await dbRun('INSERT INTO bookmarks (id,user_id,post_id,created_at) VALUES (?,?,?,?)',
          [randomUUID(),user.id,seg2,new Date().toISOString()]);
        return res.json({ success:true, bookmarked:true });
      }
    }

    // ══════════════════════════════════════════════════════════
    // READING LIST
    // ══════════════════════════════════════════════════════════
    if (resource === 'reading-list') {
      const user = await requireAuth(req, res); if (!user) return;

      if (!seg2 && method==='GET') {
        const rows = await dbAll('SELECT post_id,read FROM reading_list WHERE user_id=? ORDER BY created_at DESC',[user.id]);
        const items = (await Promise.all(rows.map(async r=>{
          const post=await Post.findById(r.post_id,user.id);
          return post?{ post,read:!!r.read }:null;
        }))).filter(Boolean);
        return res.json({ success:true, count:items.length, items });
      }
      if (seg2 && seg3==='read' && method==='PUT') {
        await dbRun('UPDATE reading_list SET read=1 WHERE user_id=? AND post_id=?',[user.id,seg2]);
        return res.json({ success:true, message:'Marked as read' });
      }
      if (seg2 && method==='PUT') {
        const existing = await dbGet('SELECT id FROM reading_list WHERE user_id=? AND post_id=?',[user.id,seg2]);
        if (existing) {
          await dbRun('DELETE FROM reading_list WHERE user_id=? AND post_id=?',[user.id,seg2]);
          return res.json({ success:true, inList:false });
        }
        await dbRun('INSERT INTO reading_list (id,user_id,post_id,read,created_at) VALUES (?,?,?,0,?)',
          [randomUUID(),user.id,seg2,new Date().toISOString()]);
        return res.json({ success:true, inList:true });
      }
    }

    // ══════════════════════════════════════════════════════════
    // FOLLOW  /api/follow/:userId[/followers|following|status]
    // ══════════════════════════════════════════════════════════
    if (resource === 'follow' && seg2) {
      const targetId = seg2;

      if (method==='GET' && seg3==='followers') {
        const rows = await dbAll('SELECT follower_id FROM follows WHERE following_id=? ORDER BY created_at DESC',[targetId]);
        const users=(await Promise.all(rows.map(r=>User.findById(r.follower_id)))).filter(Boolean)
          .map(u=>({ id:u.id,username:u.username,avatar:u.avatar,bio:u.bio }));
        return res.json({ success:true, count:users.length, users });
      }
      if (method==='GET' && seg3==='following') {
        const rows = await dbAll('SELECT following_id FROM follows WHERE follower_id=? ORDER BY created_at DESC',[targetId]);
        const users=(await Promise.all(rows.map(r=>User.findById(r.following_id)))).filter(Boolean)
          .map(u=>({ id:u.id,username:u.username,avatar:u.avatar,bio:u.bio }));
        return res.json({ success:true, count:users.length, users });
      }
      if (method==='GET' && seg3==='status') {
        const me = await getUserFromToken(req);
        if (!me) return res.json({ success:true, following:false });
        const following=!!(await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?',[me.id,targetId]));
        return res.json({ success:true, following });
      }
      if (method==='PUT' && !seg3) {
        const me = await requireAuth(req, res); if (!me) return;
        if (me.id===targetId) return res.status(400).json({ success:false, message:"Can't follow yourself" });
        const target=await User.findById(targetId);
        if (!target) return res.status(404).json({ success:false, message:'User not found' });
        const existing=await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?',[me.id,targetId]);
        if (existing) {
          await dbRun('DELETE FROM follows WHERE follower_id=? AND following_id=?',[me.id,targetId]);
          return res.json({ success:true, following:false, message:`Unfollowed ${target.username}` });
        }
        await dbRun('INSERT INTO follows (id,follower_id,following_id,created_at) VALUES (?,?,?,?)',
          [randomUUID(),me.id,targetId,new Date().toISOString()]);
        await createNotification({ userId:targetId, type:'follow',
          message:`${me.username} started following you`, link:`/pages/author.html?id=${me.id}` });
        return res.json({ success:true, following:true, message:`Now following ${target.username}` });
      }
    }

    // ══════════════════════════════════════════════════════════
    // AUTHORS
    // ══════════════════════════════════════════════════════════
    if (resource === 'authors' && seg2 && method==='GET') {
      const user = await User.findById(seg2);
      if (!user||user.banned) return res.status(404).json({ success:false, message:'Author not found' });
      const stats  = await User.getStats(seg2);
      const posts  = await Post.findByAuthor(seg2, false);
      const me     = await getUserFromToken(req);
      let isFollowing=false;
      if (me) isFollowing=!!(await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?',[me.id,seg2]));
      return res.json({ success:true,
        author:{ id:user.id,username:user.username,email:user.email,bio:user.bio,
          avatar:user.avatar,role:user.role,createdAt:user.created_at },
        stats, posts, isFollowing });
    }

    // ══════════════════════════════════════════════════════════
    // ADMIN
    // ══════════════════════════════════════════════════════════
    if (resource === 'admin') {
      const admin = await requireAdmin(req, res); if (!admin) return;

      if (seg2==='stats' && method==='GET') {
        const users   =(await dbGet('SELECT COUNT(*) as n FROM users'))?.n||0;
        const posts   =(await dbGet('SELECT COUNT(*) as n FROM posts WHERE published=1'))?.n||0;
        const comments=(await dbGet('SELECT COUNT(*) as n FROM comments'))?.n||0;
        const reports =(await dbGet('SELECT COUNT(*) as n FROM reports WHERE resolved=0'))?.n||0;
        const banned  =(await dbGet('SELECT COUNT(*) as n FROM users WHERE banned=1'))?.n||0;
        const drafts  =(await dbGet('SELECT COUNT(*) as n FROM posts WHERE published=0'))?.n||0;
        return res.json({ success:true, stats:{ users,posts,comments,reports,banned,drafts } });
      }

      if (seg2==='users') {
        if (method==='GET'&&!seg3) {
          const page=+(query.page||1); const { users,total }=await User.findAll({ page,limit:20 });
          const safe=users.map(u=>({ id:u.id,username:u.username,email:u.email,role:u.role,banned:!!u.banned,createdAt:u.created_at }));
          return res.json({ success:true, users:safe, total, page, pages:Math.ceil(total/20) });
        }
        if (method==='PUT'&&seg3&&seg4==='ban') {
          const user=await User.findById(seg3);
          if (!user) return res.status(404).json({ success:false, message:'User not found' });
          if (user.role==='admin') return res.status(400).json({ success:false, message:'Cannot ban an admin' });
          const banned=user.banned?0:1;
          await User.update(seg3,{ banned });
          return res.json({ success:true, banned:!!banned });
        }
        if (method==='PUT'&&seg3&&seg4==='role') {
          if (!['user','admin'].includes(body.role))
            return res.status(400).json({ success:false, message:'Invalid role' });
          await User.update(seg3,{ role:body.role });
          return res.json({ success:true, message:`Role updated to ${body.role}` });
        }
      }

      if (seg2==='posts') {
        if (method==='GET'&&!seg3) {
          const page=+(query.page||1); const limit=20; const offset=(page-1)*limit;
          const total=(await dbGet('SELECT COUNT(*) as n FROM posts'))?.n||0;
          const rows=await dbAll('SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?',[limit,offset]);
          const posts=await Promise.all(rows.map(async r=>{
            const author=await User.findById(r.author_id);
            return { id:r.id,title:r.title,published:!!r.published,featured:!!r.featured,
              views:r.views,createdAt:r.created_at,
              author:author?{ id:author.id,username:author.username }:null };
          }));
          return res.json({ success:true, posts, total, page, pages:Math.ceil(total/limit) });
        }
        if (method==='DELETE'&&seg3) {
          await Comment.deleteByPost(seg3); await Post.delete(seg3);
          return res.json({ success:true, message:'Post deleted' });
        }
        if (method==='PUT'&&seg3&&seg4==='feature') {
          const post=await Post.findById(seg3);
          if (!post) return res.status(404).json({ success:false, message:'Post not found' });
          const updated=await Post.update(seg3,{ featured:!post.featured });
          return res.json({ success:true, featured:updated.featured });
        }
      }

      if (seg2==='reports') {
        if (method==='GET') return res.json({ success:true, reports: await dbAll('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100') });
        if (method==='PUT'&&seg3&&seg4==='resolve') {
          await dbRun('UPDATE reports SET resolved=1 WHERE id=?',[seg3]);
          return res.json({ success:true });
        }
      }
    }

    // 404
    res.status(404).json({ success:false, message:`Route not found: ${method} ${url}` });

  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ success:false, message:err.message||'Internal Server Error' });
  }
};
