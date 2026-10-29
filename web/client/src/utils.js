import dayjs from 'dayjs'

export function formatTime(ms) {
  return ms ? dayjs(ms).format('YYYY-MM-DD HH:mm') : '-'
}

const ERROR_TEXT = {
  duplicate: '名称已存在',
  not_found: '记录不存在',
  already_approved: '已有其他已通过的下游',
  upstream_not_configured: '请先配置上游服务器地址',
  upstream_sync_failed: '上游同步失败',
  upstream_error: '上游接口返回异常',
  not_approved: '本端尚未获得上游批准',
  invalid_credentials: '用户名或密码错误',
  already_initialized: '账户已初始化',
}

export function errorMessage(error) {
  const data = error && error.response && error.response.data
  if (data && data.error) return ERROR_TEXT[data.error] || data.error
  return (error && error.message) || '操作失败'
}

/* ================= CSV ================= */

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename, rows) {
  const blob = new Blob(['\uFEFF' + buildCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function splitCsvRows(text) {
  const content = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          cell += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  row.push(cell)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

export function parseCsvObjects(text) {
  const rows = splitCsvRows(text)
  if (rows.length < 2) return []
  const headers = rows[0].map((header) => header.trim())
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => {
      const record = {}
      headers.forEach((header, index) => {
        record[header] = row[index] ?? ''
      })
      return record
    })
}
