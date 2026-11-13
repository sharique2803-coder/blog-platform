// ============================================================
// db.js — Direct HTTP calls to Turso REST API
// No @libsql/client — bypasses migration jobs check entirely
// ============================================================

const TURSO_URL   = () => (process.env.TURSO_DATABASE_URL || '').trim().replace('libsql://', 'https://');
const TURSO_TOKEN = () => (process.env.TURSO_AUTH_TOKEN   || '').trim();

// Execute a SQL statement via Turso HTTP API
async function execute(sql, args = []) {
  const url   = TURSO_URL();
  const token = TURSO_TOKEN();

  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const body = {
    requests: [
      { type: 'execute', stmt: { sql, args: args.map(toArg) } },
      { type: 'close' },
    ],
  };

  const res = await fetch(`${url}/v2/pipeline`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Turso HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const result = data.results?.[0];

  if (result?.type === 'error') {
    throw new Error(result.error?.message || 'Turso query error');
  }

  const cols = result?.response?.result?.cols?.map(c => c.name) || [];
  const rows = (result?.response?.result?.rows || []).map(row => {
    const obj = {};
    row.forEach((val, i) => { obj[cols[i]] = fromVal(val); });
    return obj;
  });

  return { rows, cols };
}

function toArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number')  return { type: 'integer', value: String(Math.trunc(v)) };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  return { type: 'text', value: String(v) };
}

function fromVal(v) {
  if (!v || v.type === 'null') return null;
  if (v.type === 'integer') return parseInt(v.value, 10);
  if (v.type === 'float')   return parseFloat(v.value);
  return v.value ?? null;
}

// ── Public helpers ────────────────────────────────────────────
async function dbGet(sql, args = []) {
  const res = await execute(sql, args);
  return res.rows[0] || null;
}

async function dbAll(sql, args = []) {
  const res = await execute(sql, args);
  return res.rows;
}

async function dbRun(sql, args = []) {
  await execute(sql, args);
}

// ── Schema init ───────────────────────────────────────────────
let _initialized = false;

async function initDB() {
  if (_initialized) return;

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, bio TEXT DEFAULT '', avatar TEXT DEFAULT '', role TEXT DEFAULT 'user', banned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, excerpt TEXT DEFAULT '', cover_image TEXT DEFAULT '', tags TEXT DEFAULT '[]', category_id TEXT, author_id TEXT NOT NULL, likes TEXT DEFAULT '[]', reactions TEXT DEFAULT '{}', views INTEGER DEFAULT 0, reading_time INTEGER DEFAULT 1, published INTEGER DEFAULT 1, featured INTEGER DEFAULT 0, publish_at TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS post_revisions (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, excerpt TEXT DEFAULT '', revised_by TEXT NOT NULL, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, content TEXT NOT NULL, author_id TEXT NOT NULL, post_id TEXT NOT NULL, parent_id TEXT, likes TEXT DEFAULT '[]', upvotes TEXT DEFAULT '[]', downvotes TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, post_id TEXT NOT NULL, created_at TEXT, UNIQUE(user_id, post_id))`,
    `CREATE TABLE IF NOT EXISTS reading_list (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, post_id TEXT NOT NULL, read INTEGER DEFAULT 0, created_at TEXT, UNIQUE(user_id, post_id))`,
    `CREATE TABLE IF NOT EXISTS follows (id TEXT PRIMARY KEY, follower_id TEXT NOT NULL, following_id TEXT NOT NULL, created_at TEXT, UNIQUE(follower_id, following_id))`,
    `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, link TEXT DEFAULT '', read INTEGER DEFAULT 0, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, resolved INTEGER DEFAULT 0, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS badges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, label TEXT NOT NULL, earned_at TEXT, UNIQUE(user_id, type))`,
    `CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, event_type TEXT NOT NULL, created_at TEXT)`,
  ];

  for (const sql of tables) {
    try { await execute(sql); } catch (e) {
      if (!e.message?.includes('already exists')) console.error('Table error:', e.message);
    }
  }

  // Seed categories
  try {
    const res = await execute('SELECT id FROM categories LIMIT 1');
    if (res.rows.length === 0) {
      const { randomUUID } = require('crypto');
      const now = new Date().toISOString();
      const cats = [
        ['General','general'],['Technology','technology'],['Lifestyle','lifestyle'],
        ['Travel','travel'],['Food','food'],['Health','health'],
        ['Business','business'],['Science','science'],['Arts','arts'],['Sports','sports'],
      ];
      for (const [name, slug] of cats) {
        await execute(
          'INSERT OR IGNORE INTO categories (id,name,slug,created_at) VALUES (?,?,?,?)',
          [randomUUID(), name, slug, now]
        );
      }
    }
  } catch (e) { console.error('Seed error:', e.message); }

  _initialized = true;
}

function getDB() { return { execute, dbGet, dbAll, dbRun }; }

module.exports = { getDB, initDB, dbGet, dbAll, dbRun };
