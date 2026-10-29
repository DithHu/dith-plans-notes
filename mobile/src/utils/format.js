function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

export function formatTime(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

export function formatDate(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

export function toDateTime(ms) {
  const d = new Date(ms)
  return {
    date: formatDate(ms),
    time: pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
}

export function parseDateTime(dateStr, timeStr) {
  if (!dateStr) return null
  const dateParts = dateStr.split('-').map(Number)
  const timeParts = (timeStr || '00:00').split(':').map(Number)
  return new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0] || 0,
    timeParts[1] || 0,
    0,
    0
  ).getTime()
}

export const TAG_COLORS = [
  '#3c9cff',
  '#19be6b',
  '#f9ae3d',
  '#e54d42',
  '#9c27b0',
  '#00bcd4',
  '#ff9800',
  '#607d8b'
]

export function randomTagColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
}
