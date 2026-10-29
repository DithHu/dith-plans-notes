import * as repo from './repository'

function normalizeBase(url) {
  return (url || '').trim().replace(/\/+$/, '')
}

async function request(method, path, data) {
  const base = normalizeBase(await repo.getServerUrl())
  if (!base) throw new Error('请先配置上游服务器地址')
  if (!/^https?:\/\//i.test(base)) throw new Error('上游服务器地址需以 http:// 或 https:// 开头')
  const clientId = await repo.getClientId()

  return new Promise((resolve, reject) => {
    uni.request({
      url: base + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId
      },
      success: (res) => {
        const body = res.data || {}
        if (res.statusCode === 403) {
          const error = new Error('等待上游审批')
          error.notApproved = true
          reject(error)
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body)
          return
        }
        const detail = body && body.error ? `：${body.error}` : ''
        reject(new Error(`请求失败(${res.statusCode})${detail}`))
      },
      fail: (err) => {
        reject(new Error('网络请求失败：' + ((err && err.errMsg) || '未知错误')))
      }
    })
  })
}

export async function applySync() {
  const data = await request('POST', '/api/sync/apply', { name: 'mobile' })
  const status = (data && data.status) || 'pending'
  await repo.setSyncStatus(status)
  return status
}

export async function refreshStatus() {
  const data = await request('GET', '/api/sync/status')
  const status = (data && data.status) || 'none'
  await repo.setSyncStatus(status)
  return status
}

export async function push(full) {
  const plans = await repo.getPlansForSync(full)
  const notes = await repo.getNotesForSync(full)
  const tags = await repo.listTags()
  const data = await request('POST', '/api/sync/push', {
    full: full ? 1 : 0,
    plans,
    notes,
    tags: tags.map((tag) => ({ name: tag.name, color: tag.color }))
  })
  if (data && data.ok) {
    await repo.clearQueue()
  }
  return data
}

export async function pull(full) {
  const data = await request('GET', '/api/sync/pull?full=' + (full ? 1 : 0))
  const result = await repo.mergePull(data || {})
  return { serverTime: data && data.serverTime, ...result }
}

export async function syncAll(full) {
  await push(full)
  const result = await pull(full)
  return result
}

export async function getSyncInfo() {
  const [clientId, serverUrl, status, lastTime, lastResult] = await Promise.all([
    repo.getClientId(),
    repo.getServerUrl(),
    repo.getSyncStatus(),
    repo.getLastSyncTime(),
    repo.getLastSyncResult()
  ])
  return { clientId, serverUrl, status, lastTime, lastResult }
}

export { normalizeBase }
