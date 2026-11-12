const initSqlJs = require('sql.js');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../../data/blog.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db = null;

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

const DB = {
  run(sql, params = []) { db.run(sql, params); persist(); },
  get(sql, params = []) {
    const stmt = db.prepare(sql); stmt.bind(params);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free(); return result;
  },
  all(sql, params = []) {
    const stmt = db.prepare(sql); stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free(); return rows;
  },
};

async function initDB() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      bio         TEXT DEFAULT '',
      avatar      TEXT DEFAULT '',
      role        TEXT DEFAULT 'user',
      banned      INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL,
      excerpt       TEXT DEFAULT '',
      cover_image   TEXT DEFAULT '',
      tags          TEXT DEFAULT '[]',
      category_id   TEXT DEFAULT NULL,
      author_id     TEXT NOT NULL,
      likes         TEXT DEFAULT '[]',
      reactions     TEXT DEFAULT '{}',
      views         INTEGER DEFAULT 0,
      reading_time  INTEGER DEFAULT 1,
      published     INTEGER DEFAULT 1,
      featured      INTEGER DEFAULT 0,
      publish_at    TEXT DEFAULT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS post_revisions (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      excerpt    TEXT DEFAULT '',
      revised_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      author_id   TEXT NOT NULL,
      post_id     TEXT NOT NULL,
      parent_id   TEXT DEFAULT NULL,
      likes       TEXT DEFAULT '[]',
      upvotes     TEXT DEFAULT '[]',
      downvotes   TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      post_id    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS reading_list (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      post_id    TEXT NOT NULL,
      read       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS follows (
      id           TEXT PRIMARY KEY,
      follower_id  TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      link       TEXT DEFAULT '',
      read       INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id          TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id   TEXT NOT NULL,
      reason      TEXT NOT NULL,
      resolved    INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS badges (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      type        TEXT NOT NULL,
      label       TEXT NOT NULL,
      earned_at   TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, type)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed categories
  const existing = DB.get("SELECT id FROM categories WHERE slug='general'");
  if (!existing) {
    const { randomUUID } = require('crypto');
    const cats = [
      ['General','general'],['Technology','technology'],['Lifestyle','lifestyle'],
      ['Travel','travel'],['Food','food'],['Health','health'],
      ['Business','business'],['Science','science'],['Arts','arts'],['Sports','sports']
    ];
    for (const [name, slug] of cats)
      db.run('INSERT OR IGNORE INTO categories (id,name,slug) VALUES (?,?,?)',[randomUUID(),name,slug]);
  }

  persist();
  console.log('SQLite database ready →', DB_PATH);
  return DB;
}

module.exports = { initDB, getDB: () => DB };
