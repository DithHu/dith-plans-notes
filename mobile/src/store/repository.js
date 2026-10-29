import * as db from './db'
import md5 from 'js-md5'
import { uuid } from '../utils/uuid'
import { randomTagColor } from '../utils/format'

function keyOf(item) {
  return `${item.createTime}:${item.id}`
}

function dedupe(list) {
  return Array.from(new Set((list || []).filter(Boolean)))
}

function planRecord(plan, createTime, id) {
  return {
    createTime,
    id,
    title: plan.title || '',
    content: plan.content || '',
    dueTime: plan.dueTime === undefined ? null : plan.dueTime,
    actualTime: plan.actualTime === undefined ? null : plan.actualTime,
    completed: plan.completed ? 1 : 0,
    important: plan.important ? 1 : 0,
    urgent: plan.urgent ? 1 : 0,
    parentKey: plan.parentKey || null,
    updateTime: Date.now(),
    deleted: 0
  }
}

function noteRecord(note, createTime, id) {
  return {
    createTime,
    id,
    title: note.title || '',
    url: note.url || '',
    content: note.content || '',
    file: note.file || '',
    memo: note.memo || '',
    type: note.type || 'text',
    parentKey: note.parentKey || null,
    updateTime: Date.now(),
    deleted: 0
  }
}

async function nextId(table, createTime) {
  const rows = await db.getAll(table)
  return rows
    .filter((row) => row.createTime === createTime)
    .reduce((max, row) => Math.max(max, row.id), 0) + 1
}

async function nextTagId() {
  const tags = await db.getAll('tags')
  return tags.reduce((max, tag) => Math.max(max, tag.id), 0) + 1
}

async function relationTagNames(relTable) {
  const rels = await db.getAll(relTable)
  const tags = (await db.getAll('tags')).filter((tag) => !tag.deleted)
  const idToName = new Map(tags.map((tag) => [tag.id, tag.name]))
  const map = new Map()
  rels.forEach((rel) => {
    const name = idToName.get(rel.tagId)
    if (!name) return
    const key = `${rel.createTime}:${rel.id}`
    if (!map.has(key)) map.set(key, [])
    if (!map.get(key).includes(name)) map.get(key).push(name)
  })
  return map
}

function applyEffectiveTags(records, ownMap) {
  const byKey = new Map(records.map((record) => [keyOf(record), record]))
  const result = new Map()
  records.forEach((record) => {
    const names = new Set(ownMap.get(keyOf(record)) || [])
    let cursor = record.parentKey
    const seen = new Set([keyOf(record)])
    while (cursor && byKey.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor)
      const parent = byKey.get(cursor)
      ;(ownMap.get(cursor) || []).forEach((name) => names.add(name))
      cursor = parent.parentKey
    }
    result.set(keyOf(record), Array.from(names))
  })
  return result
}

async function setTagNames(relTable, record, names) {
  const rels = await db.getAll(relTable)
  const keys = `${record.createTime}:${record.id}`
  for (const rel of rels) {
    if (`${rel.createTime}:${rel.id}` === keys) {
      await db.deleteRow(relTable, {
        createTime: rel.createTime,
        id: rel.id,
        tagId: rel.tagId
      })
    }
  }
  const tags = await db.getAll('tags')
  const active = tags.filter((tag) => !tag.deleted)
  let maxId = tags.reduce((max, tag) => Math.max(max, tag.id), 0)
  for (const name of dedupe(names)) {
    let tag = active.find((item) => item.name === name)
    if (!tag) {
      maxId += 1
      tag = {
        id: maxId,
        name,
        color: randomTagColor(),
        createTime: Date.now(),
        deleted: 0
      }
      await db.insertRow('tags', tag)
      tags.push(tag)
      active.push(tag)
    }
    await db.insertRow(relTable, {
      createTime: record.createTime,
      id: record.id,
      tagId: tag.id
    })
  }
  return dedupe(names)
}

async function inheritedNames(parentKey, relTable) {
  if (!parentKey) return []
  const records = await db.getAll(relTable === 'planTags' ? 'plans' : 'notes')
  const byKey = new Map(records.map((record) => [keyOf(record), record]))
  const ownMap = await relationTagNames(relTable)
  const names = new Set()
  let cursor = parentKey
  const seen = new Set()
  while (cursor && byKey.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = byKey.get(cursor)
    ;(ownMap.get(cursor) || []).forEach((name) => names.add(name))
    cursor = parent.parentKey
  }
  return Array.from(names)
}

// op: 0=编辑/新增，1=删除
async function enqueue(type, createTime, id, op = 0) {
  const queue = await db.getAll('toSyncUpstream')
  const exist = queue.find(
    (item) => item.type === type && item.createTime === createTime && item.id === id
  )
  if (exist) {
    await db.updateRow('toSyncUpstream', { type, createTime, id }, { op, createdAt: Date.now() })
  } else {
    await db.insertRow('toSyncUpstream', { type, createTime, id, op, createdAt: Date.now() })
  }
}

let readyPromise = null

export function init() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.init()
      const clientId = await db.getMeta('client_id')
      if (!clientId) await db.setMeta('client_id', uuid())
      // 每次启动（App 或浏览器刷新）都需要重新登录
      await db.setMeta('logged_in', '0')
    })().catch((e) => {
      readyPromise = null
      throw e
    })
  }
  return readyPromise
}

// ---------- 账户 ----------
export async function isInitialized() {
  await init()
  const users = await db.getAll('users')
  return users.length > 0
}

export async function getAccount() {
  await init()
  const users = await db.getAll('users')
  return users[0] || null
}

export async function setupAccount(username, password) {
  await init()
  const users = await db.getAll('users')
  if (users.length) throw new Error('账户已存在')
  const salt = uuid().replace(/-/g, '').slice(0, 16)
  await db.insertRow('users', {
    id: 1,
    username: username.trim(),
    password: md5(salt + password),
    salt
  })
  await db.setMeta('logged_in', '1')
}

export async function login(username, password) {
  await init()
  const account = await getAccount()
  if (!account || account.username !== username.trim()) return false
  if (account.password !== md5(account.salt + password)) return false
  await db.setMeta('logged_in', '1')
  return true
}

export async function isLoggedIn() {
  await init()
  return (await db.getMeta('logged_in')) === '1'
}

export async function logout() {
  await db.setMeta('logged_in', '0')
}

export async function ensureLoggedIn() {
  await init()
  if (!(await isLoggedIn())) {
    uni.reLaunch({ url: '/pages/login/login' })
    return false
  }
  return true
}

// ---------- 标签 ----------
export async function listTags() {
  await init()
  const tags = (await db.getAll('tags')).filter((tag) => !tag.deleted)
  return tags.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export async function saveTag(input) {
  await init()
  const name = (input.name || '').trim()
  if (!name) throw new Error('标签名不能为空')
  const tags = await db.getAll('tags')
  const active = tags.filter((tag) => !tag.deleted)
  if (active.some((tag) => tag.name === name && tag.id !== input.id)) {
    throw new Error('标签名已存在')
  }
  if (input.id) {
    await db.updateRow('tags', { id: input.id }, { name, color: input.color })
  } else {
    const id = await nextTagId()
    await db.insertRow('tags', {
      id,
      name,
      color: input.color || randomTagColor(),
      createTime: Date.now(),
      deleted: 0
    })
  }
}

export async function deleteTag(id) {
  await init()
  await db.updateRow('tags', { id }, { deleted: 1 })
  for (const table of ['planTags', 'noteTags']) {
    const rels = (await db.getAll(table)).filter((rel) => rel.tagId === id)
    for (const rel of rels) {
      await db.deleteRow(table, { createTime: rel.createTime, id: rel.id, tagId: id })
    }
  }
}

// ---------- 计划 ----------
export async function listPlans() {
  await init()
  const records = (await db.getAll('plans')).filter((plan) => !plan.deleted)
  const ownMap = await relationTagNames('planTags')
  const effective = applyEffectiveTags(records, ownMap)
  return records
    .map((plan) => ({
      ...plan,
      key: keyOf(plan),
      tags: effective.get(keyOf(plan)) || []
    }))
    .sort((a, b) => b.createTime - a.createTime || b.id - a.id)
}

export async function getPlan(key) {
  const plans = await listPlans()
  return plans.find((plan) => plan.key === key) || null
}

export async function savePlan(input, tagNames) {
  await init()
  const isNew = !input.createTime || !input.id
  const createTime = isNew ? Date.now() : input.createTime
  const id = isNew ? await nextId('plans', createTime) : input.id
  const record = planRecord(input, createTime, id)

  if (!isNew) {
    const rows = await db.getAll('plans')
    const exist = rows.some(
      (row) => row.createTime === createTime && row.id === id
    )
    if (exist) {
      await db.updateRow('plans', { createTime, id }, record)
    } else {
      await db.insertRow('plans', record)
    }
  } else {
    await db.insertRow('plans', record)
  }

  const inherited = await inheritedNames(record.parentKey, 'planTags')
  const finalTags = await setTagNames(
    'planTags',
    record,
    dedupe((tagNames || []).concat(inherited))
  )
  await enqueue(0, createTime, id)
  return { ...record, key: keyOf(record), tags: finalTags }
}

export async function deletePlan(plan) {
  await init()
  await db.updateRow(
    'plans',
    { createTime: plan.createTime, id: plan.id },
    { deleted: 1, updateTime: Date.now() }
  )
  await enqueue(0, plan.createTime, plan.id, 1)
}

export async function setPlanCompleted(plan, completed) {
  await init()
  const actualTime = completed ? plan.actualTime || Date.now() : null
  await db.updateRow(
    'plans',
    { createTime: plan.createTime, id: plan.id },
    {
      completed: completed ? 1 : 0,
      actualTime,
      updateTime: Date.now()
    }
  )
  await enqueue(0, plan.createTime, plan.id)
}

export async function getPlansForSync(full) {
  await init()
  const all = await db.getAll('plans')
  let rows = all
  if (!full) {
    const queue = await db.getAll('toSyncUpstream')
    const keys = new Set(
      queue.filter((item) => item.type === 0).map((item) => `${item.createTime}:${item.id}`)
    )
    rows = all.filter((row) => keys.has(keyOf(row)))
  }
  const ownMap = await relationTagNames('planTags')
  const effective = applyEffectiveTags(rows, ownMap)
  return rows.map((row) => ({ ...row, tags: effective.get(keyOf(row)) || [] }))
}

// ---------- 笔记 ----------
export async function listNotes() {
  await init()
  const records = (await db.getAll('notes')).filter((note) => !note.deleted)
  const ownMap = await relationTagNames('noteTags')
  const effective = applyEffectiveTags(records, ownMap)
  return records
    .map((note) => ({
      ...note,
      key: keyOf(note),
      tags: effective.get(keyOf(note)) || []
    }))
    .sort((a, b) => b.createTime - a.createTime || b.id - a.id)
}

export async function getNote(key) {
  const notes = await listNotes()
  return notes.find((note) => note.key === key) || null
}

export async function saveNote(input, tagNames) {
  await init()
  const isNew = !input.createTime || !input.id
  const createTime = isNew ? Date.now() : input.createTime
  const id = isNew ? await nextId('notes', createTime) : input.id
  const record = noteRecord(input, createTime, id)

  if (!isNew) {
    const rows = await db.getAll('notes')
    const exist = rows.some(
      (row) => row.createTime === createTime && row.id === id
    )
    if (exist) {
      await db.updateRow('notes', { createTime, id }, record)
    } else {
      await db.insertRow('notes', record)
    }
  } else {
    await db.insertRow('notes', record)
  }

  const inherited = await inheritedNames(record.parentKey, 'noteTags')
  const finalTags = await setTagNames(
    'noteTags',
    record,
    dedupe((tagNames || []).concat(inherited))
  )
  await enqueue(1, createTime, id)
  return { ...record, key: keyOf(record), tags: finalTags }
}

export async function deleteNote(note) {
  await init()
  await db.updateRow(
    'notes',
    { createTime: note.createTime, id: note.id },
    { deleted: 1, updateTime: Date.now() }
  )
  await enqueue(1, note.createTime, note.id, 1)
}

export async function getNotesForSync(full) {
  await init()
  const all = await db.getAll('notes')
  let rows = all
  if (!full) {
    const queue = await db.getAll('toSyncUpstream')
    const keys = new Set(
      queue.filter((item) => item.type === 1).map((item) => `${item.createTime}:${item.id}`)
    )
    rows = all.filter((row) => keys.has(keyOf(row)))
  }
  const ownMap = await relationTagNames('noteTags')
  const effective = applyEffectiveTags(rows, ownMap)
  return rows.map((row) => ({ ...row, tags: effective.get(keyOf(row)) || [] }))
}

// ---------- 同步队列 / 合并 ----------
export function getQueue() {
  return db.getAll('toSyncUpstream')
}

export function clearQueue() {
  return db.clearTable('toSyncUpstream')
}

function planFromServer(plan) {
  return {
    createTime: Number(plan.createTime),
    id: Number(plan.id),
    title: plan.title || '',
    content: plan.content || '',
    dueTime: plan.dueTime === undefined ? null : plan.dueTime,
    actualTime: plan.actualTime === undefined ? null : plan.actualTime,
    completed: plan.completed ? 1 : 0,
    important: plan.important ? 1 : 0,
    urgent: plan.urgent ? 1 : 0,
    parentKey: plan.parentKey || null,
    updateTime: Number(plan.updateTime) || Date.now(),
    deleted: plan.deleted ? 1 : 0
  }
}

function noteFromServer(note) {
  return {
    createTime: Number(note.createTime),
    id: Number(note.id),
    title: note.title || '',
    url: note.url || '',
    content: note.content || '',
    file: note.file || '',
    memo: note.memo || '',
    type: note.type || 'text',
    parentKey: note.parentKey || null,
    updateTime: Number(note.updateTime) || Date.now(),
    deleted: note.deleted ? 1 : 0
  }
}

export async function mergePull(data) {
  await init()
  const result = { plans: 0, notes: 0, tags: 0 }

  const tags = await db.getAll('tags')
  const active = tags.filter((tag) => !tag.deleted)
  let maxTagId = tags.reduce((max, tag) => Math.max(max, tag.id), 0)
  for (const tag of data.tags || []) {
    if (!tag || !tag.name) continue
    if (active.some((item) => item.name === tag.name)) continue
    maxTagId += 1
    const row = {
      id: maxTagId,
      name: tag.name,
      color: tag.color || randomTagColor(),
      createTime: Date.now(),
      deleted: 0
    }
    await db.insertRow('tags', row)
    tags.push(row)
    active.push(row)
    result.tags += 1
  }

  const planMap = new Map((await db.getAll('plans')).map((row) => [keyOf(row), row]))
  for (const plan of data.plans || []) {
    if (!plan || !plan.createTime || !plan.id) continue
    const key = keyOf(plan)
    const existing = planMap.get(key)
    const record = planFromServer(plan)
    if (existing && Number(existing.updateTime || 0) > record.updateTime) continue
    if (record.deleted) {
      if (existing) {
        await setTagNames('planTags', record, [])
        await db.deleteRow('plans', { createTime: record.createTime, id: record.id })
        planMap.delete(key)
        result.plans += 1
      }
      continue
    }
    if (existing) {
      await db.updateRow('plans', { createTime: record.createTime, id: record.id }, record)
    } else {
      await db.insertRow('plans', record)
    }
    planMap.set(key, record)
    await setTagNames('planTags', record, plan.tags || [])
    result.plans += 1
  }

  const noteMap = new Map((await db.getAll('notes')).map((row) => [keyOf(row), row]))
  for (const note of data.notes || []) {
    if (!note || !note.createTime || !note.id) continue
    const key = keyOf(note)
    const existing = noteMap.get(key)
    const record = noteFromServer(note)
    if (existing && Number(existing.updateTime || 0) > record.updateTime) continue
    if (record.deleted) {
      if (existing) {
        await setTagNames('noteTags', record, [])
        await db.deleteRow('notes', { createTime: record.createTime, id: record.id })
        noteMap.delete(key)
        result.notes += 1
      }
      continue
    }
    if (existing) {
      await db.updateRow('notes', { createTime: record.createTime, id: record.id }, record)
    } else {
      await db.insertRow('notes', record)
    }
    noteMap.set(key, record)
    await setTagNames('noteTags', record, note.tags || [])
    result.notes += 1
  }

  return result
}

// ---------- meta ----------
export async function getClientId() {
  await init()
  return db.getMeta('client_id')
}

export async function getServerUrl() {
  await init()
  return (await db.getMeta('server_url')) || ''
}

export async function setServerUrl(url) {
  await init()
  await db.setMeta('server_url', url || '')
}

export async function getSyncStatus() {
  await init()
  return (await db.getMeta('sync_status')) || 'none'
}

export async function setSyncStatus(status) {
  await init()
  await db.setMeta('sync_status', status || 'none')
}

export async function getLastSyncTime() {
  await init()
  const value = await db.getMeta('last_sync_time')
  return value ? Number(value) : 0
}

export async function getLastSyncResult() {
  await init()
  return (await db.getMeta('last_sync_result')) || ''
}

export async function setLastSyncResult(result) {
  await init()
  await db.setMeta('last_sync_time', String(Date.now()))
  await db.setMeta('last_sync_result', result || '')
}
