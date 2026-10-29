<template>
  <view class="zd-page plan-page" :class="{ 'has-action': !!selectedPlan }">
    <view class="search-row">
      <up-search v-model="keyword" placeholder="搜索计划标题或内容" :show-action="false" />
    </view>

    <view class="filter-row">
      <view
        class="zd-chip"
        :class="{ active: statusFilter === 'all' }"
        @click="statusFilter = 'all'"
      >
        全部
      </view>
      <view
        class="zd-chip"
        :class="{ active: statusFilter === 'undone' }"
        @click="statusFilter = 'undone'"
      >
        未完成
      </view>
      <view
        class="zd-chip"
        :class="{ active: statusFilter === 'done' }"
        @click="statusFilter = 'done'"
      >
        已完成
      </view>
    </view>

    <scroll-view v-if="tags.length" scroll-x class="tag-scroll">
      <view class="tag-row">
        <view
          class="zd-chip"
          :class="{ active: activeTag === '' }"
          @click="activeTag = ''"
        >
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
        <text class="parent-label">父计划：</text>
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
      <up-empty mode="list" text="暂无计划" />
    </view>

    <view v-else class="plan-list">
      <view
        v-for="row in pagedItems"
        :key="row.item.key"
        class="zd-card plan-card"
        :class="{ selected: row.item.key === selectedKey }"
        :style="{ marginLeft: row.depth * 28 + 'rpx' }"
        @click="toggleSelect(row.item)"
      >
        <view class="zd-row zd-between">
          <view class="zd-row title-line">
            <view class="zd-dot" :class="statusClass(row.item)"></view>
            <text class="zd-title">{{ row.item.title || '(无标题)' }}</text>
          </view>
          <view class="status-line" @click.stop>
            <text class="status-text" :class="statusClass(row.item)">
              {{ statusText(row.item) }}
            </text>
            <up-switch
              :model-value="!!row.item.completed"
              size="20"
              activeColor="#19be6b"
              class="complete-switch"
              @change="(value) => toggleComplete(row.item, value)"
            />
          </view>
        </view>

        <text v-if="row.item.content" class="content">{{ row.item.content }}</text>

        <view class="meta-row">
          <text v-if="row.item.dueTime" class="zd-muted">
            截止 {{ formatTime(row.item.dueTime) }}
          </text>
          <text v-if="row.item.actualTime" class="zd-muted">
            完成 {{ formatTime(row.item.actualTime) }}
          </text>
          <text v-if="row.item.important" class="flag important">重要</text>
          <text v-if="row.item.urgent" class="flag urgent">紧急</text>
        </view>

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

    <view v-if="!selectedPlan" class="fab" @click="add">
      <text class="fab-text">+</text>
    </view>

    <view v-if="selectedPlan" class="action-bar">
      <view class="action-row">
        <up-button size="small" type="primary" plain text="编辑" @click="editSelected" />
        <up-button size="small" type="primary" plain text="添加子计划" @click="addChildSelected" />
        <up-button size="small" type="primary" plain text="查看子计划" @click="viewChildren(selectedPlan)" />
        <up-button size="small" type="error" plain text="删除" @click="removeSelected" />
        <up-button size="small" plain text="取消" @click="selectedKey = ''" />
      </view>
    </view>

    <tab-bar current="/pages/plan/list" />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import * as repo from '../../store/repository'
import { flattenTree, keyOf } from '../../utils/tree'
import { formatTime } from '../../utils/format'

const PAGE_SIZE = 5

const plans = ref([])
const tags = ref([])
const keyword = ref('')
const activeTag = ref('')
// 默认筛选未完成计划
const statusFilter = ref('undone')
const loading = ref(true)
const currentParent = ref(null)
const selectedKey = ref('')
const page = ref(1)

const parentKey = computed(() => (currentParent.value ? keyOf(currentParent.value) : ''))

const parentLabel = computed(() =>
  currentParent.value ? currentParent.value.title || '(无标题)' : '无'
)

const selectedPlan = computed(
  () => plans.value.find((plan) => keyOf(plan) === selectedKey.value) || null
)

function isInSubtree(plan, rootKey) {
  if (!rootKey) return true
  const byKey = new Map(plans.value.map((item) => [keyOf(item), item]))
  let cursor = plan.parentKey
  const seen = new Set([keyOf(plan)])
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
  plans.value.filter((plan) => isInSubtree(plan, parentKey.value))
)

const hasFilter = computed(
  () => !!keyword.value.trim() || !!activeTag.value || statusFilter.value !== 'all'
)

const visibleItems = computed(() => {
  if (!hasFilter.value) {
    return flattenTree(scoped.value)
  }
  const text = keyword.value.trim().toLowerCase()
  return scoped.value
    .filter((plan) => {
      const matchText =
        !text ||
        (plan.title || '').toLowerCase().includes(text) ||
        (plan.content || '').toLowerCase().includes(text)
      const matchTag = !activeTag.value || (plan.tags || []).includes(activeTag.value)
      const matchStatus =
        statusFilter.value === 'all' ||
        (statusFilter.value === 'done' ? !!plan.completed : !plan.completed)
      return matchText && matchTag && matchStatus
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

watch([keyword, activeTag, statusFilter, parentKey], () => {
  page.value = 1
  selectedKey.value = ''
})

watch(totalPages, (total) => {
  if (page.value > total) page.value = total
})

function statusClass(plan) {
  if (!plan.completed) return 'red'
  if (!plan.dueTime) return 'green'
  return plan.actualTime && plan.actualTime <= plan.dueTime ? 'green' : 'yellow'
}

function statusText(plan) {
  const status = statusClass(plan)
  if (status === 'green') return '按时完成'
  if (status === 'yellow') return '超时完成'
  return '未完成'
}

function toggleTag(name) {
  activeTag.value = activeTag.value === name ? '' : name
}

function toggleSelect(plan) {
  const key = keyOf(plan)
  selectedKey.value = selectedKey.value === key ? '' : key
}

async function load() {
  loading.value = true
  const keepParentKey = parentKey.value
  const keepSelectedKey = selectedKey.value
  try {
    plans.value = await repo.listPlans()
    tags.value = await repo.listTags()
    currentParent.value = keepParentKey
      ? plans.value.find((plan) => keyOf(plan) === keepParentKey) || null
      : null
    selectedKey.value = keepSelectedKey
      ? plans.value.some((plan) => keyOf(plan) === keepSelectedKey)
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
  uni.navigateTo({ url: '/pages/plan/edit' })
}

function addChild(plan) {
  uni.navigateTo({ url: '/pages/plan/edit?parentKey=' + encodeURIComponent(keyOf(plan)) })
}

function edit(plan) {
  uni.navigateTo({ url: '/pages/plan/edit?key=' + encodeURIComponent(keyOf(plan)) })
}

function editSelected() {
  if (selectedPlan.value) edit(selectedPlan.value)
}

function addChildSelected() {
  if (selectedPlan.value) addChild(selectedPlan.value)
}

function viewChildren(plan) {
  currentParent.value = plan
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
  const upper = plans.value.find((plan) => keyOf(plan) === upKey)
  currentParent.value = upper || null
  page.value = 1
  selectedKey.value = ''
}

function clearParent() {
  currentParent.value = null
  page.value = 1
  selectedKey.value = ''
}

async function toggleComplete(plan, value) {
  try {
    await repo.setPlanCompleted(plan, !!value)
    uni.showToast({ title: value ? '已标记完成' : '已取消完成', icon: 'none' })
    await load()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '更新失败', icon: 'none' })
    await load()
  }
}

function removeSelected() {
  if (selectedPlan.value) remove(selectedPlan.value)
}

function remove(plan) {
  uni.showModal({
    title: '删除计划',
    content: `确定删除「${plan.title || '(无标题)'}」吗？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await repo.deletePlan(plan)
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
.plan-page {
  padding-bottom: 240rpx;
}

.plan-page.has-action {
  padding-bottom: 400rpx;
}

.search-row {
  margin-bottom: 16rpx;
}

.filter-row {
  display: flex;
  margin-bottom: 12rpx;
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

.plan-card {
  border-left: 6rpx solid #ebeef5;
}

.plan-card.selected {
  border-left-color: #3c9cff;
  box-shadow: 0 0 0 2rpx rgba(60, 156, 255, 0.35);
}

.title-line {
  flex: 1;
  overflow: hidden;
}

.content {
  display: block;
  margin-top: 12rpx;
  color: #606266;
  font-size: 26rpx;
  line-height: 1.5;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 12rpx;
  align-items: center;
}

.status-text {
  font-size: 24rpx;
  margin-left: 16rpx;
}

.status-line {
  display: flex;
  align-items: center;
  margin-left: 16rpx;
}

.complete-switch {
  margin-left: 12rpx;
}

.status-text.green {
  color: #19be6b;
}

.status-text.red {
  color: #e54d42;
}

.status-text.yellow {
  color: #f9ae3d;
}

.flag {
  font-size: 22rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
}

.flag.important {
  background-color: #fdeceb;
  color: #e54d42;
}

.flag.urgent {
  background-color: #fff5e6;
  color: #f9ae3d;
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
