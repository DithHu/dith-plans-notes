<template>
  <view class="zd-page note-page" :class="{ 'has-action': !!selectedNote }">
    <view class="search-row">
      <up-search v-model="keyword" placeholder="搜索笔记标题、内容或备注" :show-action="false" />
    </view>

    <scroll-view v-if="tags.length" scroll-x class="tag-scroll">
      <view class="tag-row">
        <view class="zd-chip" :class="{ active: activeTag === '' }" @click="activeTag = ''">
          全部标签
        </view>
        <view
          v-for="tag in tags"
          :key="tag.id"
          class="zd-chip"
          :class="{ active: activeTag === tag.name }"
          :style="activeTag === tag.name ? { backgroundColor: tag.color } : {}"
          @click="toggleTag(tag.name)"
        >
          {{ tag.name }}
        </view>
      </view>
    </scroll-view>

    <view class="parent-row">
      <view class="parent-info">
        <text class="parent-label">父笔记：</text>
        <text class="parent-title">{{ parentLabel }}</text>
      </view>
      <view class="parent-actions">
        <up-button
          size="small"
          type="primary"
          plain
          text="返回上级"
          :disabled="!currentParent"
          @click="goUpper"
        />
        <up-button
          size="small"
          type="primary"
          plain
          text="清除"
          :disabled="!currentParent"
          @click="clearParent"
        />
      </view>
    </view>

    <view v-if="loading" class="zd-card loading">
      <up-loading-icon mode="circle" color="#3c9cff" size="32" />
    </view>

    <view v-else-if="!pagedItems.length" class="zd-card">
      <up-empty mode="list" text="暂无笔记" />
    </view>

    <view v-else>
      <view
        v-for="row in pagedItems"
        :key="row.item.key"
        class="zd-card note-card"
        :class="{ selected: row.item.key === selectedKey }"
        :style="{ marginLeft: row.depth * 28 + 'rpx' }"
        @click="toggleSelect(row.item)"
      >
        <view class="zd-row zd-between">
          <view class="zd-row title-line">
            <view class="type-badge">{{ typeText(row.item.type) }}</view>
            <text class="zd-title">{{ row.item.title || '(无标题)' }}</text>
          </view>
        </view>

        <text v-if="row.item.type === 'url' && row.item.url" class="content">
          {{ row.item.url }}
        </text>
        <text v-if="row.item.type === 'text' && row.item.content" class="content">
          {{ row.item.content }}
        </text>
        <text v-if="row.item.type === 'file' && row.item.file" class="content">
          文件：{{ fileLabel(row.item.file) }}
        </text>
        <text v-if="row.item.memo" class="memo">备注：{{ row.item.memo }}</text>

        <view v-if="row.item.tags.length" class="tag-list">
          <text v-for="name in row.item.tags" :key="name" class="zd-chip">{{ name }}</text>
        </view>
      </view>

      <view v-if="totalPages > 1" class="pager">
        <up-button
          size="small"
          plain
          text="上一页"
          :disabled="page <= 1"
          @click="page = page - 1"
        />
        <text class="page-text">{{ page }} / {{ totalPages }}</text>
        <up-button
          size="small"
          plain
          text="下一页"
          :disabled="page >= totalPages"
          @click="page = page + 1"
        />
      </view>
    </view>

    <view v-if="!selectedNote" class="fab" @click="add">
      <text class="fab-text">+</text>
    </view>

    <view v-if="selectedNote" class="action-bar">
      <view class="action-row">
        <up-button size="small" type="primary" plain text="编辑" @click="editSelected" />
        <up-button size="small" type="primary" plain text="添加子笔记" @click="addChildSelected" />
        <up-button size="small" type="primary" plain text="查看子笔记" @click="viewChildren(selectedNote)" />
        <up-button size="small" type="error" plain text="删除" @click="removeSelected" />
        <up-button size="small" plain text="取消" @click="selectedKey = ''" />
      </view>
    </view>

    <tab-bar current="/pages/note/list" />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import * as repo from '../../store/repository'
import { flattenTree, keyOf } from '../../utils/tree'

const PAGE_SIZE = 5

const notes = ref([])
const tags = ref([])
const keyword = ref('')
const activeTag = ref('')
const loading = ref(true)
const currentParent = ref(null)
const selectedKey = ref('')
const page = ref(1)

const parentKey = computed(() => (currentParent.value ? keyOf(currentParent.value) : ''))

const parentLabel = computed(() =>
  currentParent.value ? currentParent.value.title || '(无标题)' : '无'
)

const selectedNote = computed(
  () => notes.value.find((note) => keyOf(note) === selectedKey.value) || null
)

function isInSubtree(note, rootKey) {
  if (!rootKey) return true
  const byKey = new Map(notes.value.map((item) => [keyOf(item), item]))
  let cursor = note.parentKey
  const seen = new Set([keyOf(note)])
  while (cursor && !seen.has(cursor)) {
    if (cursor === rootKey) return true
    seen.add(cursor)
    const parent = byKey.get(cursor)
    if (!parent) return false
    cursor = parent.parentKey
  }
  return false
}

function relativeDepth(item, items) {
  const byKey = new Map(items.map((one) => [keyOf(one), one]))
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

const scoped = computed(() =>
  notes.value.filter((note) => isInSubtree(note, parentKey.value))
)

const hasFilter = computed(() => !!keyword.value.trim() || !!activeTag.value)

const visibleItems = computed(() => {
  if (!hasFilter.value) {
    return flattenTree(scoped.value)
  }
  const text = keyword.value.trim().toLowerCase()
  return scoped.value
    .filter((note) => {
      const matchText =
        !text ||
        (note.title || '').toLowerCase().includes(text) ||
        (note.content || '').toLowerCase().includes(text) ||
        (note.memo || '').toLowerCase().includes(text) ||
        (note.url || '').toLowerCase().includes(text)
      const matchTag = !activeTag.value || (note.tags || []).includes(activeTag.value)
      return matchText && matchTag
    })
    .map((item) => ({ item, depth: relativeDepth(item, scoped.value) }))
    .sort((a, b) => b.item.createTime - a.item.createTime || b.item.id - a.item.id)
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(visibleItems.value.length / PAGE_SIZE))
)

const pagedItems = computed(() =>
  visibleItems.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

watch([keyword, activeTag, parentKey], () => {
  page.value = 1
  selectedKey.value = ''
})

watch(totalPages, (total) => {
  if (page.value > total) page.value = total
})

function typeText(type) {
  if (type === 'url') return '链接'
  if (type === 'file') return '文件'
  return '文本'
}

function fileLabel(file) {
  if (!file) return ''
  if (file.startsWith('data:')) return '已选择文件'
  return file.split('/').pop()
}

function toggleTag(name) {
  activeTag.value = activeTag.value === name ? '' : name
}

function toggleSelect(note) {
  const key = keyOf(note)
  selectedKey.value = selectedKey.value === key ? '' : key
}

async function load() {
  loading.value = true
  const keepParentKey = parentKey.value
  const keepSelectedKey = selectedKey.value
  try {
    notes.value = await repo.listNotes()
    tags.value = await repo.listTags()
    currentParent.value = keepParentKey
      ? notes.value.find((note) => keyOf(note) === keepParentKey) || null
      : null
    selectedKey.value = keepSelectedKey
      ? notes.value.some((note) => keyOf(note) === keepSelectedKey)
        ? keepSelectedKey
        : ''
      : ''
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

onShow(async () => {
  if (!(await repo.ensureLoggedIn())) return
  await load()
})

function add() {
  uni.navigateTo({ url: '/pages/note/edit' })
}

function addChild(note) {
  uni.navigateTo({ url: '/pages/note/edit?parentKey=' + encodeURIComponent(keyOf(note)) })
}

function edit(note) {
  uni.navigateTo({ url: '/pages/note/edit?key=' + encodeURIComponent(keyOf(note)) })
}

function editSelected() {
  if (selectedNote.value) edit(selectedNote.value)
}

function addChildSelected() {
  if (selectedNote.value) addChild(selectedNote.value)
}

function viewChildren(note) {
  currentParent.value = note
  page.value = 1
  selectedKey.value = ''
}

function goUpper() {
  if (!currentParent.value) return
  const upKey = currentParent.value.parentKey
  if (!upKey) {
    currentParent.value = null
    return
  }
  const upper = notes.value.find((note) => keyOf(note) === upKey)
  currentParent.value = upper || null
  page.value = 1
  selectedKey.value = ''
}

function clearParent() {
  currentParent.value = null
  page.value = 1
  selectedKey.value = ''
}

function removeSelected() {
  if (selectedNote.value) remove(selectedNote.value)
}

function remove(note) {
  uni.showModal({
    title: '删除笔记',
    content: `确定删除「${note.title || '(无标题)'}」吗？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await repo.deleteNote(note)
        uni.showToast({ title: '已删除', icon: 'success' })
        selectedKey.value = ''
        await load()
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
      }
    }
  })
}
</script>

<style lang="scss">
.note-page {
  padding-bottom: 240rpx;
}

.note-page.has-action {
  padding-bottom: 400rpx;
}

.search-row {
  margin-bottom: 16rpx;
}

.tag-scroll {
  white-space: nowrap;
  margin-bottom: 12rpx;
}

.tag-row {
  display: flex;
  padding-bottom: 8rpx;
}

.parent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  margin-bottom: 16rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
}

.parent-info {
  display: flex;
  align-items: center;
  flex: 1;
  overflow: hidden;
}

.parent-label {
  color: #909399;
  font-size: 24rpx;
}

.parent-title {
  color: #303133;
  font-size: 26rpx;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parent-actions {
  display: flex;
  flex-shrink: 0;
  gap: 12rpx;
}

.note-card {
  border-left: 6rpx solid #ebeef5;
}

.note-card.selected {
  border-left-color: #3c9cff;
  box-shadow: 0 0 0 2rpx rgba(60, 156, 255, 0.35);
}

.title-line {
  flex: 1;
  overflow: hidden;
}

.type-badge {
  padding: 2rpx 12rpx;
  margin-right: 12rpx;
  border-radius: 6rpx;
  background-color: #ecf5ff;
  color: #3c9cff;
  font-size: 22rpx;
}

.content {
  display: block;
  margin-top: 12rpx;
  color: #606266;
  font-size: 26rpx;
  line-height: 1.5;
  word-break: break-all;
}

.memo {
  display: block;
  margin-top: 10rpx;
  color: #909399;
  font-size: 24rpx;
}

.tag-list {
  margin-top: 12rpx;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 60rpx 0;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  padding: 20rpx 0;
}

.page-text {
  color: #606266;
  font-size: 26rpx;
}

.fab {
  position: fixed;
  right: 40rpx;
  bottom: 150rpx;
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background-color: #3c9cff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 20rpx rgba(60, 156, 255, 0.4);
  z-index: 99;
}

.fab-text {
  color: #ffffff;
  font-size: 52rpx;
  line-height: 1;
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(100rpx + constant(safe-area-inset-bottom));
  bottom: calc(100rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
  border-top: 1rpx solid #ebeef5;
  padding: 16rpx 24rpx;
  z-index: 101;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
</style>
