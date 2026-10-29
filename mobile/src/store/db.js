// 统一数据库封装：App 端使用 plus.sqlite，H5 端用 localStorage 模拟同样的表结构
const DB_NAME = 'plan_note'
const DB_PATH = '_doc/plan_note.db'
const LS_PREFIX = 'appdb_'

const FIELDS = {
  plans: [
    'createTime',
    'id',
    'title',
    'content',
    'dueTime',
    'actualTime',
    'completed',
    'important',
    'urgent',
    'parentKey',
    'updateTime',
    'deleted'
  ],
  notes: [
    'createTime',
    'id',
    'title',
    'url',
    'content',
    'file',
    'memo',
    'type',
    'parentKey',
    'updateTime',
    'deleted'
  ],
  tags: ['id', 'name', 'color', 'createTime', 'deleted'],
  planTags: ['createTime', 'id', 'tagId'],
  noteTags: ['createTime', 'id', 'tagId'],
  toSyncUpstream: ['type', 'createTime', 'id', 'op', 'createdAt'],
  users: ['id', 'username', 'password', 'salt'],
  meta: ['key', 'value']
}

const TABLE_NAMES = {
  plans: 'plans',
  notes: 'notes',
  tags: 'tags',
  planTags: 'plan_tags',
  noteTags: 'note_tags',
  toSyncUpstream: 'to_sync_upstream',
  users: 'users',
  meta: 'meta'
}

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS plans (
    create_time INTEGER NOT NULL,
    id INTEGER NOT NULL,
    title TEXT,
    content TEXT,
    due_time INTEGER,
    actual_time INTEGER,
    completed INTEGER DEFAULT 0,
    important INTEGER DEFAULT 0,
    urgent INTEGER DEFAULT 0,
    parent_key TEXT,
    update_time INTEGER,
    deleted INTEGER DEFAULT 0,
    PRIMARY KEY (create_time, id)
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    create_time INTEGER NOT NULL,
    id INTEGER NOT NULL,
    title TEXT,
    url TEXT,
    content TEXT,
    file TEXT,
    memo TEXT,
    type TEXT,
    parent_key TEXT,
    update_time INTEGER,
    deleted INTEGER DEFAULT 0,
    PRIMARY KEY (create_time, id)
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    create_time INTEGER,
    deleted INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS plan_tags (
    create_time INTEGER NOT NULL,
    id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (create_time, id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS note_tags (
    create_time INTEGER NOT NULL,
    id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (create_time, id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS to_sync_upstream (
    type INTEGER NOT NULL,
    create_time INTEGER NOT NULL,
    id INTEGER NOT NULL,
    op INTEGER DEFAULT 0,
    created_at INTEGER,
    PRIMARY KEY (type, create_time, id)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    password TEXT,
    salt TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`
]

function isApp() {
  return typeof plus !== 'undefined' && plus.sqlite
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
}

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (m, c) => c.toUpperCase())
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return "'" + String(value).replace(/'/g, "''") + "'"
}

function buildWhere(where) {
  return Object.keys(where)
    .map((key) => `${camelToSnake(key)} = ${sqlValue(where[key])}`)
    .join(' AND ')
}

function rowFromSql(row) {
  const out = {}
  Object.keys(row).forEach((key) => {
    out[snakeToCamel(key)] = row[key]
  })
  return out
}

function executeSql(sql) {
  return new Promise((resolve, reject) => {
    plus.sqlite.executeSql({
      name: DB_NAME,
      sql,
      success: () => resolve(),
      fail: (e) => reject(new Error((e && e.message) || '数据库执行失败'))
    })
  })
}

function selectSql(sql) {
  return new Promise((resolve, reject) => {
    plus.sqlite.selectSql({
      name: DB_NAME,
      sql,
      success: (rows) => resolve(rows || []),
      fail: (e) => reject(new Error((e && e.message) || '数据库查询失败'))
    })
  })
}

function readRows(table) {
  try {
    const value = uni.getStorageSync(LS_PREFIX + table)
    if (!value) return []
    return JSON.parse(value)
  } catch (e) {
    return []
  }
}

function writeRows(table, rows) {
  uni.setStorageSync(LS_PREFIX + table, JSON.stringify(rows))
}

let readyPromise = null
let dbOpened = false

async function doInit() {
  if (isApp()) {
    if (!dbOpened) {
      await new Promise((resolve, reject) => {
        plus.sqlite.openDatabase({
          name: DB_NAME,
          path: DB_PATH,
          success: () => resolve(),
          fail: (e) => reject(new Error((e && e.message) || '打开本地数据库失败'))
        })
      })
      dbOpened = true
    }
    for (const sql of CREATE_TABLES) {
      await executeSql(sql)
    }
    // 旧库升级：同步队列补充 op 字段（0=编辑/新增，1=删除）
    try {
      await executeSql('ALTER TABLE to_sync_upstream ADD COLUMN op INTEGER DEFAULT 0')
    } catch (e) {
      // 字段已存在时忽略
    }
  } else {
    Object.keys(FIELDS).forEach((table) => {
      let value = ''
      try {
        value = uni.getStorageSync(LS_PREFIX + table)
      } catch (e) {
        value = ''
      }
      if (!value) writeRows(table, [])
    })
  }
}

export function init() {
  if (!readyPromise) readyPromise = doInit()
  return readyPromise
}

export async function getAll(table) {
  await init()
  if (isApp()) {
    const rows = await selectSql('SELECT * FROM ' + TABLE_NAMES[table])
    return rows.map(rowFromSql)
  }
  return readRows(table).map((row) => ({ ...row }))
}

export async function insertRow(table, row) {
  await init()
  if (isApp()) {
    const fields = FIELDS[table].filter((field) => row[field] !== undefined)
    const cols = fields.map(camelToSnake).join(', ')
    const values = fields.map((field) => sqlValue(row[field])).join(', ')
    await executeSql(`INSERT INTO ${TABLE_NAMES[table]} (${cols}) VALUES (${values})`)
  } else {
    const rows = readRows(table)
    rows.push({ ...row })
    writeRows(table, rows)
  }
}

export async function updateRow(table, where, patch) {
  await init()
  if (isApp()) {
    const sets = Object.keys(patch)
      .map((key) => `${camelToSnake(key)} = ${sqlValue(patch[key])}`)
      .join(', ')
    await executeSql(
      `UPDATE ${TABLE_NAMES[table]} SET ${sets} WHERE ${buildWhere(where)}`
    )
  } else {
    const rows = readRows(table)
    const keys = Object.keys(where)
    rows.forEach((row) => {
      if (keys.every((key) => row[key] === where[key])) {
        Object.assign(row, patch)
      }
    })
    writeRows(table, rows)
  }
}

export async function deleteRow(table, where) {
  await init()
  if (isApp()) {
    await executeSql(`DELETE FROM ${TABLE_NAMES[table]} WHERE ${buildWhere(where)}`)
  } else {
    const rows = readRows(table)
    const keys = Object.keys(where)
    writeRows(
      table,
      rows.filter((row) => !keys.every((key) => row[key] === where[key]))
    )
  }
}

export async function clearTable(table) {
  await init()
  if (isApp()) {
    await executeSql(`DELETE FROM ${TABLE_NAMES[table]}`)
  } else {
    writeRows(table, [])
  }
}

export async function getMeta(key) {
  const rows = await getAll('meta')
  const row = rows.find((item) => item.key === key)
  return row ? row.value : null
}

export async function setMeta(key, value) {
  const rows = await getAll('meta')
  const exist = rows.find((item) => item.key === key)
  if (exist) {
    await updateRow('meta', { key }, { value: String(value) })
  } else {
    await insertRow('meta', { key, value: String(value) })
  }
}
