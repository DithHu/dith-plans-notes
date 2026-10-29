const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'app.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  create_time INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
  create_time INTEGER NOT NULL,
  id INTEGER NOT NULL,
  title TEXT,
  content TEXT,
  due_time INTEGER,
  actual_time INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  important INTEGER NOT NULL DEFAULT 0,
  urgent INTEGER NOT NULL DEFAULT 0,
  parent_key TEXT,
  update_time INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (create_time, id)
);

CREATE TABLE IF NOT EXISTS notes (
  create_time INTEGER NOT NULL,
  id INTEGER NOT NULL,
  title TEXT,
  url TEXT,
  content TEXT,
  file TEXT,
  memo TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  parent_key TEXT,
  update_time INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (create_time, id)
);

CREATE TABLE IF NOT EXISTS plan_tags (
  plan_create_time INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (plan_create_time, plan_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_create_time INTEGER NOT NULL,
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_create_time, note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS to_sync_downstream (
  type INTEGER NOT NULL,
  create_time INTEGER NOT NULL,
  id INTEGER NOT NULL,
  op INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  PRIMARY KEY (type, create_time, id)
);

CREATE TABLE IF NOT EXISTS to_sync_upstream (
  type INTEGER NOT NULL,
  create_time INTEGER NOT NULL,
  id INTEGER NOT NULL,
  op INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  PRIMARY KEY (type, create_time, id)
);

CREATE TABLE IF NOT EXISTS downstream_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL,
  created_at INTEGER,
  approved_at INTEGER
);
`);

// 旧库升级：同步队列补充 op 字段（0=编辑/新增，1=删除）
for (const table of ['to_sync_downstream', 'to_sync_upstream']) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === 'op')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN op INTEGER NOT NULL DEFAULT 0`);
  }
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

if (!getSetting('jwt_secret')) {
  setSetting('jwt_secret', crypto.randomBytes(32).toString('hex'));
}
if (!getSetting('client_id')) {
  setSetting('client_id', crypto.randomUUID());
}

module.exports = { db, getSetting, setSetting };
