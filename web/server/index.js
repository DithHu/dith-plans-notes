const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, getSetting, setSetting } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

/* ================= 通用工具 ================= */

function keyOf(createTime, id) {
  return `${createTime}:${id}`;
}

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const names = [];
  for (const item of tags) {
    const name = typeof item === 'string' ? item.trim() : item && typeof item.name === 'string' ? item.name.trim() : '';
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function findTag(name) {
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
}

function createTag(name, color) {
  const existing = findTag(name);
  if (existing) {
    if (existing.deleted) db.prepare('UPDATE tags SET deleted = 0 WHERE id = ?').run(existing.id);
    return { id: existing.id, created: false };
  }
  const info = db
    .prepare('INSERT INTO tags (name, color, create_time, deleted) VALUES (?, ?, ?, 0)')
    .run(name, color || '#409EFF', Date.now());
  return { id: info.lastInsertRowid, created: true };
}

function setPlanTags(createTime, id, tags) {
  db.prepare('DELETE FROM plan_tags WHERE plan_create_time = ? AND plan_id = ?').run(createTime, id);
  const insert = db.prepare('INSERT OR IGNORE INTO plan_tags (plan_create_time, plan_id, tag_id) VALUES (?, ?, ?)');
  for (const name of normalizeTags(tags)) {
    insert.run(createTime, id, createTag(name).id);
  }
}

function setNoteTags(createTime, id, tags) {
  db.prepare('DELETE FROM note_tags WHERE note_create_time = ? AND note_id = ?').run(createTime, id);
  const insert = db.prepare('INSERT OR IGNORE INTO note_tags (note_create_time, note_id, tag_id) VALUES (?, ?, ?)');
  for (const name of normalizeTags(tags)) {
    insert.run(createTime, id, createTag(name).id);
  }
}

function getPlanTags(createTime, id) {
  return db
    .prepare(
      'SELECT t.name FROM plan_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.plan_create_time = ? AND pt.plan_id = ? AND t.deleted = 0 ORDER BY t.name'
    )
    .all(createTime, id)
    .map((row) => row.name);
}

function getNoteTags(createTime, id) {
  return db
    .prepare(
      'SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_create_time = ? AND nt.note_id = ? AND t.deleted = 0 ORDER BY t.name'
    )
    .all(createTime, id)
    .map((row) => row.name);
}

// op: 0=编辑/新增，1=删除
function enqueueRecord(type, createTime, id, op = 0) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO to_sync_downstream (type, create_time, id, op, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(type, create_time, id) DO UPDATE SET op = excluded.op, created_at = excluded.created_at`
  ).run(type, createTime, id, op, now);
  db.prepare(
    `INSERT INTO to_sync_upstream (type, create_time, id, op, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(type, create_time, id) DO UPDATE SET op = excluded.op, created_at = excluded.created_at`
  ).run(type, createTime, id, op, now);
}

function nextId(table, createTime) {
  const row = db.prepare(`SELECT COALESCE(MAX(id), 0) AS maxId FROM ${table} WHERE create_time = ?`).get(createTime);
  return row.maxId + 1;
}

function planRow(createTime, id) {
  return db.prepare('SELECT * FROM plans WHERE create_time = ? AND id = ? AND deleted = 0').get(createTime, id);
}

function noteRow(createTime, id) {
  return db.prepare('SELECT * FROM notes WHERE create_time = ? AND id = ? AND deleted = 0').get(createTime, id);
}

function parseKey(key) {
  const parts = String(key || '').split(':');
  if (parts.length !== 2) return null;
  const createTime = Number(parts[0]);
  const id = Number(parts[1]);
  if (!createTime || !id) return null;
  return { createTime, id };
}

function effectivePlanTags(row) {
  const names = getPlanTags(row.create_time, row.id).slice();
  const seen = new Set([keyOf(row.create_time, row.id)]);
  let parentKey = row.parent_key;
  while (parentKey && !seen.has(parentKey)) {
    seen.add(parentKey);
    const key = parseKey(parentKey);
    if (!key) break;
    const parent = db
      .prepare('SELECT * FROM plans WHERE create_time = ? AND id = ? AND deleted = 0')
      .get(key.createTime, key.id);
    if (!parent) break;
    for (const name of getPlanTags(parent.create_time, parent.id)) {
      if (!names.includes(name)) names.push(name);
    }
    parentKey = parent.parent_key;
  }
  return names;
}

function effectiveNoteTags(row) {
  const names = getNoteTags(row.create_time, row.id).slice();
  const seen = new Set([keyOf(row.create_time, row.id)]);
  let parentKey = row.parent_key;
  while (parentKey && !seen.has(parentKey)) {
    seen.add(parentKey);
    const key = parseKey(parentKey);
    if (!key) break;
    const parent = db
      .prepare('SELECT * FROM notes WHERE create_time = ? AND id = ? AND deleted = 0')
      .get(key.createTime, key.id);
    if (!parent) break;
    for (const name of getNoteTags(parent.create_time, parent.id)) {
      if (!names.includes(name)) names.push(name);
    }
    parentKey = parent.parent_key;
  }
  return names;
}

function planDto(row) {
  return {
    createTime: row.create_time,
    id: row.id,
    key: keyOf(row.create_time, row.id),
    title: row.title,
    content: row.content,
    dueTime: row.due_time,
    actualTime: row.actual_time,
    completed: row.completed,
    important: row.important,
    urgent: row.urgent,
    parentKey: row.parent_key,
    tags: effectivePlanTags(row),
    updateTime: row.update_time,
    deleted: row.deleted,
  };
}

function noteDto(row) {
  return {
    createTime: row.create_time,
    id: row.id,
    key: keyOf(row.create_time, row.id),
    title: row.title,
    url: row.url,
    content: row.content,
    file: row.file,
    memo: row.memo,
    type: row.type,
    parentKey: row.parent_key,
    tags: effectiveNoteTags(row),
    updateTime: row.update_time,
    deleted: row.deleted,
  };
}

function tagDtos() {
  return db.prepare('SELECT id, name, color FROM tags WHERE deleted = 0 ORDER BY name').all();
}

function allPlanDtos() {
  return db.prepare('SELECT * FROM plans WHERE deleted = 0 ORDER BY create_time DESC, id DESC').all().map(planDto);
}

function allNoteDtos() {
  return db.prepare('SELECT * FROM notes WHERE deleted = 0 ORDER BY create_time DESC, id DESC').all().map(noteDto);
}

/* ================= 鉴权 ================= */

function signToken(username) {
  return jwt.sign({ username }, getSetting('jwt_secret'), { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, getSetting('jwt_secret'));
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

function clientIdOf(req) {
  return String(req.headers['x-client-id'] || '').trim();
}

function getDownstream(clientId) {
  return db.prepare('SELECT * FROM downstream_clients WHERE client_id = ?').get(clientId);
}

function requireApprovedClient(req, res, next) {
  const clientId = clientIdOf(req);
  const row = clientId ? getDownstream(clientId) : null;
  if (!row || row.status !== 'approved') return res.status(403).json({ error: 'not_approved' });
  req.clientId = clientId;
  return next();
}

/* ================= 认证接口 ================= */

app.get('/api/auth/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  res.json({ initialized: count > 0 });
});

app.post('/api/auth/setup', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return res.status(409).json({ error: 'already_initialized' });

  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });

  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (username, password, salt, created_at) VALUES (?, ?, ?, ?)').run(
    username,
    md5(salt + password),
    salt,
    Date.now()
  );
  res.json({ token: signToken(username), user: { username } });
});

app.post('/api/auth/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.password !== md5(user.salt + password)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({ token: signToken(user.username) });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ username: req.user.username });
});

/* ================= 计划 ================= */

app.get('/api/plans', auth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const tag = String(req.query.tag || '').trim();
  const parent = req.query.parent !== undefined ? String(req.query.parent).trim() : '';

  let sql = 'SELECT p.* FROM plans p';
  const where = ['p.deleted = 0'];
  const params = [];

  if (q) {
    where.push('(p.title LIKE ? OR p.content LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (parent) {
    where.push('p.parent_key = ?');
    params.push(parent);
  }

  sql += ` WHERE ${where.join(' AND ')} ORDER BY p.create_time DESC, p.id DESC`;
  const rows = db.prepare(sql).all(...params);
  let dtos = rows.map(planDto);
  if (tag) dtos = dtos.filter((plan) => plan.tags.includes(tag));
  res.json(dtos);
});

app.post('/api/plans', auth, (req, res) => {
  const body = req.body || {};
  const createTime = Date.now();
  const id = nextId('plans', createTime);

  db.prepare(
    'INSERT INTO plans (create_time, id, title, content, due_time, actual_time, completed, important, urgent, parent_key, update_time, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
  ).run(
    createTime,
    id,
    body.title ?? '',
    body.content ?? '',
    toNullableNumber(body.dueTime),
    toNullableNumber(body.actualTime),
    body.completed ? 1 : 0,
    body.important ? 1 : 0,
    body.urgent ? 1 : 0,
    body.parentKey || null,
    createTime
  );

  setPlanTags(createTime, id, body.tags);
  enqueueRecord(0, createTime, id);
  res.json(planDto(planRow(createTime, id)));
});

app.put('/api/plans/:createTime/:id', auth, (req, res) => {
  const createTime = Number(req.params.createTime);
  const id = Number(req.params.id);
  const current = planRow(createTime, id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  const body = req.body || {};
  const completed = body.completed !== undefined ? (body.completed ? 1 : 0) : current.completed;
  let actualTime = body.actualTime !== undefined ? toNullableNumber(body.actualTime) : current.actual_time;
  if (body.completed !== undefined && !body.completed && body.actualTime === undefined) actualTime = null;

  db.prepare(
    'UPDATE plans SET title = ?, content = ?, due_time = ?, actual_time = ?, completed = ?, important = ?, urgent = ?, parent_key = ?, update_time = ? WHERE create_time = ? AND id = ?'
  ).run(
    body.title !== undefined ? body.title ?? '' : current.title,
    body.content !== undefined ? body.content ?? '' : current.content,
    body.dueTime !== undefined ? toNullableNumber(body.dueTime) : current.due_time,
    actualTime,
    completed,
    body.important !== undefined ? (body.important ? 1 : 0) : current.important,
    body.urgent !== undefined ? (body.urgent ? 1 : 0) : current.urgent,
    body.parentKey !== undefined ? body.parentKey || null : current.parent_key,
    Date.now(),
    createTime,
    id
  );

  if (body.tags !== undefined) setPlanTags(createTime, id, body.tags);
  enqueueRecord(0, createTime, id);
  res.json(planDto(planRow(createTime, id)));
});

app.delete('/api/plans/:createTime/:id', auth, (req, res) => {
  const createTime = Number(req.params.createTime);
  const id = Number(req.params.id);
  const current = planRow(createTime, id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  db.prepare('UPDATE plans SET deleted = 1, update_time = ? WHERE create_time = ? AND id = ?').run(
    Date.now(),
    createTime,
    id
  );
  enqueueRecord(0, createTime, id, 1);
  res.json({ ok: true });
});

/* ================= 笔记 ================= */

const NOTE_TYPES = ['url', 'text', 'file'];

app.get('/api/notes', auth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const tag = String(req.query.tag || '').trim();
  const parent = req.query.parent !== undefined ? String(req.query.parent).trim() : '';

  let sql = 'SELECT n.* FROM notes n';
  const where = ['n.deleted = 0'];
  const params = [];

  if (q) {
    where.push('(n.title LIKE ? OR n.content LIKE ? OR n.memo LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (parent) {
    where.push('n.parent_key = ?');
    params.push(parent);
  }

  sql += ` WHERE ${where.join(' AND ')} ORDER BY n.create_time DESC, n.id DESC`;
  const rows = db.prepare(sql).all(...params);
  let dtos = rows.map(noteDto);
  if (tag) dtos = dtos.filter((note) => note.tags.includes(tag));
  res.json(dtos);
});

app.post('/api/notes', auth, (req, res) => {
  const body = req.body || {};
  const createTime = Date.now();
  const id = nextId('notes', createTime);
  const type = NOTE_TYPES.includes(body.type) ? body.type : 'text';

  db.prepare(
    'INSERT INTO notes (create_time, id, title, url, content, file, memo, type, parent_key, update_time, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
  ).run(
    createTime,
    id,
    body.title ?? '',
    body.url ?? '',
    body.content ?? '',
    body.file ?? '',
    body.memo ?? '',
    type,
    body.parentKey || null,
    createTime
  );

  setNoteTags(createTime, id, body.tags);
  enqueueRecord(1, createTime, id);
  res.json(noteDto(noteRow(createTime, id)));
});

app.put('/api/notes/:createTime/:id', auth, (req, res) => {
  const createTime = Number(req.params.createTime);
  const id = Number(req.params.id);
  const current = noteRow(createTime, id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  const body = req.body || {};
  db.prepare(
    'UPDATE notes SET title = ?, url = ?, content = ?, file = ?, memo = ?, type = ?, parent_key = ?, update_time = ? WHERE create_time = ? AND id = ?'
  ).run(
    body.title !== undefined ? body.title ?? '' : current.title,
    body.url !== undefined ? body.url ?? '' : current.url,
    body.content !== undefined ? body.content ?? '' : current.content,
    body.file !== undefined ? body.file ?? '' : current.file,
    body.memo !== undefined ? body.memo ?? '' : current.memo,
    NOTE_TYPES.includes(body.type) ? body.type : current.type,
    body.parentKey !== undefined ? body.parentKey || null : current.parent_key,
    Date.now(),
    createTime,
    id
  );

  if (body.tags !== undefined) setNoteTags(createTime, id, body.tags);
  enqueueRecord(1, createTime, id);
  res.json(noteDto(noteRow(createTime, id)));
});

app.delete('/api/notes/:createTime/:id', auth, (req, res) => {
  const createTime = Number(req.params.createTime);
  const id = Number(req.params.id);
  const current = noteRow(createTime, id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  db.prepare('UPDATE notes SET deleted = 1, update_time = ? WHERE create_time = ? AND id = ?').run(
    Date.now(),
    createTime,
    id
  );
  enqueueRecord(1, createTime, id, 1);
  res.json({ ok: true });
});

/* ================= CSV 数据导入 ================= */

app.post('/api/plans/import', auth, (req, res) => {
  const records = Array.isArray(req.body && req.body.plans) ? req.body.plans : [];
  const stats = ingestData(records, [], [], { strict: true });
  for (const plan of records) {
    const createTime = Number(plan.createTime);
    const id = Number(plan.id);
    if (!createTime || !id || plan.deleted) continue;
    enqueueRecord(0, createTime, id);
  }
  res.json({ count: stats.plans, total: records.length });
});

app.post('/api/notes/import', auth, (req, res) => {
  const records = Array.isArray(req.body && req.body.notes) ? req.body.notes : [];
  const stats = ingestData([], records, [], { strict: true });
  for (const note of records) {
    const createTime = Number(note.createTime);
    const id = Number(note.id);
    if (!createTime || !id || note.deleted) continue;
    enqueueRecord(1, createTime, id);
  }
  res.json({ count: stats.notes, total: records.length });
});

/* ================= 标签 ================= */

app.get('/api/tags', auth, (req, res) => {
  res.json(tagDtos());
});

app.post('/api/tags', auth, (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const color = String((req.body && req.body.color) || '').trim() || '#409EFF';

  const existing = findTag(name);
  if (existing) {
    if (!existing.deleted) return res.status(409).json({ error: 'duplicate' });
    db.prepare('UPDATE tags SET deleted = 0, color = ? WHERE id = ?').run(color, existing.id);
  } else {
    db.prepare('INSERT INTO tags (name, color, create_time, deleted) VALUES (?, ?, ?, 0)').run(name, color, Date.now());
  }

  const row = findTag(name);
  res.json({ id: row.id, name: row.name, color: row.color });
});

app.put('/api/tags/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM tags WHERE id = ? AND deleted = 0').get(id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  const body = req.body || {};
  const name = body.name !== undefined ? String(body.name).trim() : current.name;
  const color = body.color !== undefined ? String(body.color).trim() : current.color;
  if (!name) return res.status(400).json({ error: 'missing_name' });

  const duplicate = findTag(name);
  if (duplicate && duplicate.id !== id) return res.status(409).json({ error: 'duplicate' });

  db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, id);
  res.json({ id, name, color });
});

app.delete('/api/tags/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM tags WHERE id = ? AND deleted = 0').get(id);
  if (!current) return res.status(404).json({ error: 'not_found' });

  db.prepare('UPDATE tags SET deleted = 1 WHERE id = ?').run(id);
  db.prepare('DELETE FROM plan_tags WHERE tag_id = ?').run(id);
  db.prepare('DELETE FROM note_tags WHERE tag_id = ?').run(id);
  res.json({ ok: true });
});

/* ================= 同步数据导入 ================= */

function ingestData(plansIn, notesIn, tagsIn, options = {}) {
  const stats = { plans: 0, notes: 0, tags: 0 };
  const compare = options.strict ? '>' : '>=';

  for (const item of tagsIn || []) {
    const name = typeof item === 'string' ? item.trim() : item && typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const color = (item && typeof item === 'object' && item.color) || '#409EFF';
    const result = createTag(name, color);
    if (result.created) stats.tags++;
  }

  const upsertPlan = db.prepare(
    `INSERT INTO plans (create_time, id, title, content, due_time, actual_time, completed, important, urgent, parent_key, update_time, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(create_time, id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       due_time = excluded.due_time,
       actual_time = excluded.actual_time,
       completed = excluded.completed,
       important = excluded.important,
       urgent = excluded.urgent,
       parent_key = excluded.parent_key,
       update_time = excluded.update_time,
       deleted = excluded.deleted
     WHERE excluded.update_time ${compare} COALESCE(plans.update_time, 0)`
  );
  for (const plan of plansIn || []) {
    const createTime = Number(plan.createTime);
    const id = Number(plan.id);
    if (!createTime || !id) continue;
    const info = upsertPlan.run(
      createTime,
      id,
      plan.title ?? '',
      plan.content ?? '',
      toNullableNumber(plan.dueTime),
      toNullableNumber(plan.actualTime),
      plan.completed ? 1 : 0,
      plan.important ? 1 : 0,
      plan.urgent ? 1 : 0,
      plan.parentKey || null,
      Number(plan.updateTime) || Date.now(),
      plan.deleted ? 1 : 0
    );
    if (info.changes > 0) {
      stats.plans++;
      if (plan.tags !== undefined && !plan.deleted) setPlanTags(createTime, id, plan.tags);
    }
  }

  const upsertNote = db.prepare(
    `INSERT INTO notes (create_time, id, title, url, content, file, memo, type, parent_key, update_time, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(create_time, id) DO UPDATE SET
       title = excluded.title,
       url = excluded.url,
       content = excluded.content,
       file = excluded.file,
       memo = excluded.memo,
       type = excluded.type,
       parent_key = excluded.parent_key,
       update_time = excluded.update_time,
       deleted = excluded.deleted
     WHERE excluded.update_time ${compare} COALESCE(notes.update_time, 0)`
  );
  for (const note of notesIn || []) {
    const createTime = Number(note.createTime);
    const id = Number(note.id);
    if (!createTime || !id) continue;
    const info = upsertNote.run(
      createTime,
      id,
      note.title ?? '',
      note.url ?? '',
      note.content ?? '',
      note.file ?? '',
      note.memo ?? '',
      NOTE_TYPES.includes(note.type) ? note.type : 'text',
      note.parentKey || null,
      Number(note.updateTime) || Date.now(),
      note.deleted ? 1 : 0
    );
    if (info.changes > 0) {
      stats.notes++;
      if (note.tags !== undefined && !note.deleted) setNoteTags(createTime, id, note.tags);
    }
  }

  return stats;
}

/* ================= 客户端同步接口（X-Client-Id） ================= */

app.post('/api/sync/apply', (req, res) => {
  const clientId = clientIdOf(req);
  if (!clientId) return res.status(400).json({ error: 'missing_client_id' });

  const existing = getDownstream(clientId);
  if (existing) return res.json({ status: existing.status });

  const name = String((req.body && req.body.name) || '').trim() || 'unknown';
  db.prepare('INSERT INTO downstream_clients (client_id, name, status, created_at, approved_at) VALUES (?, ?, ?, ?, NULL)').run(
    clientId,
    name,
    'pending',
    Date.now()
  );
  res.json({ status: 'pending' });
});

app.get('/api/sync/status', (req, res) => {
  const clientId = clientIdOf(req);
  const row = clientId ? getDownstream(clientId) : null;
  res.json({ status: row ? row.status : 'none' });
});

app.get('/api/sync/pull', requireApprovedClient, (req, res) => {
  const full = String(req.query.full || '0') === '1';
  let plans;
  let notes;

  if (full) {
    plans = allPlanDtos();
    notes = allNoteDtos();
  } else {
    const queue = db.prepare('SELECT type, create_time, id, op FROM to_sync_downstream').all();
    const getPlan = db.prepare('SELECT * FROM plans WHERE create_time = ? AND id = ?');
    const getNote = db.prepare('SELECT * FROM notes WHERE create_time = ? AND id = ?');
    plans = [];
    notes = [];
    for (const item of queue) {
      if (item.type === 0) {
        const row = getPlan.get(item.create_time, item.id);
        if (!row) continue;
        const dto = planDto(row);
        if (item.op === 1) dto.deleted = 1;
        plans.push(dto);
      } else if (item.type === 1) {
        const row = getNote.get(item.create_time, item.id);
        if (!row) continue;
        const dto = noteDto(row);
        if (item.op === 1) dto.deleted = 1;
        notes.push(dto);
      }
    }
    db.prepare('DELETE FROM to_sync_downstream').run();
  }

  res.json({ serverTime: Date.now(), full, plans, notes, tags: tagDtos() });
});

app.post('/api/sync/push', requireApprovedClient, (req, res) => {
  const body = req.body || {};
  const inserted = ingestData(body.plans, body.notes, body.tags);
  res.json({ ok: true, inserted });
});

/* ================= 下游管理（Bearer） ================= */

app.get('/api/downstream', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM downstream_clients ORDER BY created_at DESC').all();
  res.json(
    rows.map((row) => ({
      clientId: row.client_id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
    }))
  );
});

app.put('/api/downstream/:clientId/approve', auth, (req, res) => {
  const clientId = String(req.params.clientId);
  const row = getDownstream(clientId);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const approved = db
    .prepare("SELECT * FROM downstream_clients WHERE status = 'approved' AND client_id <> ?")
    .get(clientId);
  if (approved) return res.status(409).json({ error: 'already_approved' });

  db.prepare('UPDATE downstream_clients SET status = ?, approved_at = ? WHERE client_id = ?').run(
    'approved',
    Date.now(),
    clientId
  );
  res.json({ ok: true, status: 'approved' });
});

app.put('/api/downstream/:clientId/reject', auth, (req, res) => {
  const clientId = String(req.params.clientId);
  const row = getDownstream(clientId);
  if (!row) return res.status(404).json({ error: 'not_found' });

  db.prepare("UPDATE downstream_clients SET status = 'rejected', approved_at = NULL WHERE client_id = ?").run(clientId);
  res.json({ ok: true, status: 'rejected' });
});

app.delete('/api/downstream/:clientId', auth, (req, res) => {
  const clientId = String(req.params.clientId);
  const row = getDownstream(clientId);
  if (!row) return res.status(404).json({ error: 'not_found' });

  db.prepare('DELETE FROM downstream_clients WHERE client_id = ?').run(clientId);
  res.json({ ok: true });
});

/* ================= 上游同步（Bearer） ================= */

function upstreamInfo() {
  const lastSyncAt = getSetting('upstream_last_sync_at');
  return {
    url: getSetting('upstream_url') || '',
    status: getSetting('upstream_status') || 'none',
    lastSyncAt: lastSyncAt ? Number(lastSyncAt) : null,
    clientId: getSetting('client_id'),
  };
}

function upstreamBase() {
  const url = (getSetting('upstream_url') || '').trim().replace(/\/+$/, '');
  if (!url) {
    const err = new Error('upstream_not_configured');
    err.code = 'upstream_not_configured';
    throw err;
  }
  return url;
}

async function httpJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

function upstreamHeaders() {
  return { 'Content-Type': 'application/json', 'X-Client-Id': getSetting('client_id') };
}

function handleUpstreamError(res, err) {
  if (err.code === 'upstream_not_configured') {
    return res.status(400).json({ error: 'upstream_not_configured' });
  }
  return res.status(502).json({ error: 'upstream_sync_failed', message: err.message });
}

async function runUpstreamSync(full) {
  const base = upstreamBase();
  const clientId = getSetting('client_id');

  let pushStats = { plans: 0, notes: 0, tags: 0 };
  let pushBody = null;

  if (full) {
    pushBody = { full: 1, plans: allPlanDtos(), notes: allNoteDtos(), tags: tagDtos() };
  } else {
    const queue = db.prepare('SELECT type, create_time, id, op FROM to_sync_upstream').all();
    const plans = [];
    const notes = [];
    for (const item of queue) {
      if (item.type === 0) {
        const row = db.prepare('SELECT * FROM plans WHERE create_time = ? AND id = ?').get(item.create_time, item.id);
        if (!row) continue;
        const dto = planDto(row);
        if (item.op === 1) dto.deleted = 1;
        plans.push(dto);
      } else if (item.type === 1) {
        const row = db.prepare('SELECT * FROM notes WHERE create_time = ? AND id = ?').get(item.create_time, item.id);
        if (!row) continue;
        const dto = noteDto(row);
        if (item.op === 1) dto.deleted = 1;
        notes.push(dto);
      }
    }
    if (plans.length || notes.length) {
      const usedTags = new Set();
      for (const record of plans.concat(notes)) {
        if (record.deleted) continue;
        for (const name of record.tags) usedTags.add(name);
      }
      pushBody = {
        full: 0,
        plans,
        notes,
        tags: tagDtos().filter((tag) => usedTags.has(tag.name)),
      };
    }
  }

  if (pushBody) {
    const pushed = await httpJson(`${base}/api/sync/push`, {
      method: 'POST',
      headers: upstreamHeaders(),
      body: JSON.stringify(pushBody),
    });
    if (!pushed.ok) {
      const err = new Error(`upstream push failed (${pushed.status})`);
      err.code = 'upstream_error';
      throw err;
    }
    pushStats = (pushed.data && pushed.data.inserted) || pushStats;
  }
  db.prepare('DELETE FROM to_sync_upstream').run();

  const pulled = await httpJson(`${base}/api/sync/pull?full=${full ? 1 : 0}`, {
    headers: { 'X-Client-Id': clientId },
  });
  if (!pulled.ok) {
    const err = new Error(`upstream pull failed (${pulled.status})`);
    err.code = 'upstream_error';
    throw err;
  }
  const data = pulled.data || {};
  const pullStats = ingestData(data.plans, data.notes, data.tags);

  setSetting('upstream_last_sync_at', Date.now());
  return { push: pushStats, pull: pullStats };
}

app.get('/api/sync/upstream', auth, (req, res) => {
  res.json(upstreamInfo());
});

app.put('/api/sync/upstream', auth, (req, res) => {
  const url = String((req.body && req.body.url) || '').trim().replace(/\/+$/, '');
  setSetting('upstream_url', url);
  setSetting('upstream_status', 'none');
  res.json(upstreamInfo());
});

app.post('/api/sync/upstream/apply', auth, async (req, res) => {
  try {
    const base = upstreamBase();
    const result = await httpJson(`${base}/api/sync/apply`, {
      method: 'POST',
      headers: upstreamHeaders(),
      body: JSON.stringify({ name: 'web-server' }),
    });
    if (!result.ok) return res.status(502).json({ error: 'upstream_error', status: result.status });

    const status = (result.data && result.data.status) || 'pending';
    setSetting('upstream_status', status);
    res.json({ status });
  } catch (err) {
    handleUpstreamError(res, err);
  }
});

app.get('/api/sync/upstream/status', auth, async (req, res) => {
  try {
    const base = upstreamBase();
    const result = await httpJson(`${base}/api/sync/status`, {
      headers: { 'X-Client-Id': getSetting('client_id') },
    });
    if (!result.ok) return res.status(502).json({ error: 'upstream_error', status: result.status });

    const status = (result.data && result.data.status) || 'none';
    setSetting('upstream_status', status);
    res.json({ status });
  } catch (err) {
    handleUpstreamError(res, err);
  }
});

app.post('/api/sync/now', auth, async (req, res) => {
  try {
    res.json(await runUpstreamSync(false));
  } catch (err) {
    handleUpstreamError(res, err);
  }
});

app.post('/api/sync/full', auth, async (req, res) => {
  try {
    res.json(await runUpstreamSync(true));
  } catch (err) {
    handleUpstreamError(res, err);
  }
});

/* ================= 兜底 ================= */

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`web server listening on http://localhost:${PORT}`);
});
