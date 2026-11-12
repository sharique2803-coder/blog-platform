const bcrypt=require('bcryptjs');
const { randomUUID }=require('crypto');
const { getDB }=require('../config/db');

// Badge definitions: { type, label, check(userId, DB) → bool }
const BADGE_DEFS = [
  { type:'first_post',  label:'First Post',       check:(uid,DB)=>DB.get('SELECT COUNT(*) as n FROM posts WHERE author_id=? AND published=1',[uid])?.n>=1 },
  { type:'ten_posts',   label:'Prolific Writer',   check:(uid,DB)=>DB.get('SELECT COUNT(*) as n FROM posts WHERE author_id=? AND published=1',[uid])?.n>=10 },
  { type:'century_views',label:'Century Views',   check:(uid,DB)=>DB.get('SELECT SUM(views) as n FROM posts WHERE author_id=?',[uid])?.n>=100 },
  { type:'viral',       label:'Viral',             check:(uid,DB)=>DB.get('SELECT SUM(views) as n FROM posts WHERE author_id=?',[uid])?.n>=1000 },
  { type:'social',      label:'Social Butterfly',  check:(uid,DB)=>DB.get('SELECT COUNT(*) as n FROM follows WHERE following_id=?',[uid])?.n>=10 },
];

const User = {
  create({ username, email, password, bio='', avatar='', role='user' }) {
    const DB=getDB(); const salt=bcrypt.genSaltSync(10); const hashed=bcrypt.hashSync(password,salt);
    const id=randomUUID(); const now=new Date().toISOString();
    DB.run(`INSERT INTO users (id,username,email,password,bio,avatar,role,banned,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)`,
      [id,username,email,hashed,bio,avatar,role,now,now]);
    return User.findById(id);
  },

  findById(id)       { return getDB().get('SELECT * FROM users WHERE id=?',[id]); },
  findByEmail(email) { return getDB().get('SELECT * FROM users WHERE email=?',[email]); },
  findByUsername(u)  { return getDB().get('SELECT * FROM users WHERE username=?',[u]); },
  findByEmailOrUsername(email,username) {
    return getDB().get('SELECT * FROM users WHERE email=? OR username=?',[email,username]);
  },
  findAll({ page=1,limit=20 }={}) {
    const DB=getDB(); const offset=(page-1)*limit;
    return { users:DB.all('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',[limit,offset]),
             total:DB.get('SELECT COUNT(*) as n FROM users').n };
  },
  update(id, fields) {
    const DB=getDB(); const allowed=['username','bio','avatar','role','banned'];
    const sets=[]; const vals=[];
    for (const k of allowed) if (fields[k]!==undefined){ sets.push(`${k}=?`); vals.push(fields[k]); }
    if (!sets.length) return User.findById(id);
    sets.push('updated_at=?'); vals.push(new Date().toISOString(),id);
    DB.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`,vals);
    return User.findById(id);
  },
  matchPassword(plain,hashed) { return bcrypt.compareSync(plain,hashed); },

  getStats(userId) {
    const DB=getDB();
    const postCount=DB.get('SELECT COUNT(*) as n FROM posts WHERE author_id=? AND published=1',[userId])?.n||0;
    const totalViews=DB.get('SELECT SUM(views) as n FROM posts WHERE author_id=?',[userId])?.n||0;
    const totalLikes=DB.all('SELECT likes FROM posts WHERE author_id=?',[userId])
      .reduce((s,r)=>{ try{return s+JSON.parse(r.likes||'[]').length;}catch{return s;} },0);
    const followerCount =DB.get('SELECT COUNT(*) as n FROM follows WHERE following_id=?',[userId])?.n||0;
    const followingCount=DB.get('SELECT COUNT(*) as n FROM follows WHERE follower_id=?', [userId])?.n||0;
    const badges=DB.all('SELECT type,label,earned_at FROM badges WHERE user_id=?',[userId]);
    return { postCount, totalViews, totalLikes, followerCount, followingCount, badges };
  },

  // Award any newly earned badges
  checkAndAwardBadges(userId) {
    const DB=getDB();
    for (const def of BADGE_DEFS) {
      const already=DB.get('SELECT id FROM badges WHERE user_id=? AND type=?',[userId,def.type]);
      if (!already && def.check(userId,DB)) {
        DB.run('INSERT OR IGNORE INTO badges (id,user_id,type,label,earned_at) VALUES (?,?,?,?,?)',
          [randomUUID(),userId,def.type,def.label,new Date().toISOString()]);
      }
    }
  },
};

module.exports = User;
