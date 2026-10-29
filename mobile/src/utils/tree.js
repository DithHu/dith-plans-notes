export function keyOf(item) {
  return item.key || `${item.createTime}:${item.id}`
}

export function flattenTree(items) {
  const byKey = new Map(items.map((item) => [keyOf(item), item]))
  const children = new Map()
  const roots = []
  items.forEach((item) => {
    const key = keyOf(item)
    const parentKey = item.parentKey
    if (parentKey && byKey.has(parentKey) && parentKey !== key) {
      if (!children.has(parentKey)) children.set(parentKey, [])
      children.get(parentKey).push(item)
    } else {
      roots.push(item)
    }
  })

  const sortDesc = (list) =>
    list.sort((a, b) => b.createTime - a.createTime || b.id - a.id)

  const output = []
  const visited = new Set()

  function walk(item, depth) {
    const key = keyOf(item)
    if (visited.has(key)) return
    visited.add(key)
    output.push({ item, depth })
    const kids = children.get(key) || []
    sortDesc(kids).forEach((child) => walk(child, depth + 1))
  }

  sortDesc(roots).forEach((root) => walk(root, 0))
  items.forEach((item) => {
    if (!visited.has(keyOf(item))) walk(item, 0)
  })
  return output
}

export function depthOf(item, allItems) {
  const byKey = new Map(allItems.map((one) => [keyOf(one), one]))
  let depth = 0
  let cursor = item.parentKey
  const seen = new Set([keyOf(item)])
  while (cursor && byKey.has(cursor) && !seen.has(cursor) && depth < 30) {
    seen.add(cursor)
    depth += 1
    cursor = byKey.get(cursor).parentKey
  }
  return depth
}
