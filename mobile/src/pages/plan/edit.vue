<template>
  <view class="zd-page">
    <view class="zd-card">
      <view class="zd-group">
        <view class="zd-label">标题</view>
        <up-input v-model="form.title" border="surround" placeholder="计划标题" clearable />
      </view>

      <view class="zd-group">
        <view class="zd-label">内容</view>
        <up-textarea
          v-model="form.content"
          border="surround"
          placeholder="计划内容"
          :height="140"
        />
      </view>

      <view class="zd-group">
        <view class="zd-label">截止时间</view>
        <view class="date-row">
          <picker mode="date" :value="dueDate" @change="onDateChange" class="picker">
            <view class="picker-value">{{ dueDate || '选择日期' }}</view>
          </picker>
          <picker mode="time" :value="dueTimeStr" @change="onTimeChange" class="picker">
            <view class="picker-value">{{ dueTimeStr || '选择时间' }}</view>
          </picker>
          <view class="clear-btn" @click="clearDue">清除</view>
        </view>
      </view>

      <view class="zd-group">
        <view class="zd-label">父计划</view>
        <picker :range="parentLabels" :value="parentIndex" @change="onParentChange">
          <view class="picker-value">{{ parentLabel || '无' }}</view>
        </picker>
      </view>

      <view class="zd-group">
        <view class="zd-label">标签</view>
        <view v-if="tags.length" class="tag-list">
          <view
            v-for="tag in tags"
            :key="tag.id"
            class="zd-chip"
            :class="{ active: selectedTags.includes(tag.name) }"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </view>
        </view>
        <text v-else class="zd-muted">暂无标签，请到标签页添加</text>
      </view>

      <view class="switch-row">
        <text class="switch-label">重要</text>
        <up-switch v-model="form.important" activeColor="#e54d42" />
      </view>
      <view class="switch-row">
        <text class="switch-label">紧急</text>
        <up-switch v-model="form.urgent" activeColor="#f9ae3d" />
      </view>
      <view v-if="form.actualTime" class="actual-time">
        实际完成时间：{{ formatTime(form.actualTime) }}
      </view>

      <up-button
        type="primary"
        text="保存"
        class="zd-save"
        :loading="saving"
        @click="save"
      />
      <up-button
        v-if="editing"
        type="error"
        plain
        text="删除"
        class="zd-save"
        @click="remove"
      />
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import * as repo from '../../store/repository'
import { flattenTree, keyOf } from '../../utils/tree'
import { formatTime, toDateTime, parseDateTime } from '../../utils/format'

const form = reactive({
  createTime: 0,
  id: 0,
  title: '',
  content: '',
  dueTime: null,
  actualTime: null,
  completed: false,
  important: false,
  urgent: false,
  parentKey: null
})

const tags = ref([])
const plans = ref([])
const selectedTags = ref([])
const dueDate = ref('')
const dueTimeStr = ref('')
const editing = ref(false)
const saving = ref(false)
const originalKey = ref('')

function decode(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch (e) {
    return value
  }
}

function isUnder(item) {
  if (!originalKey.value) return false
  if (keyOf(item) === originalKey.value) return true
  let cursor = item.parentKey
  const seen = new Set()
  while (cursor && !seen.has(cursor)) {
    if (cursor === originalKey.value) return true
    seen.add(cursor)
    const next = plans.value.find((plan) => keyOf(plan) === cursor)
    cursor = next ? next.parentKey : null
  }
  return false
}

const parentOptions = computed(() => {
  const list = flattenTree(plans.value)
    .filter((row) => !isUnder(row.item))
    .map((row) => ({
      key: keyOf(row.item),
      label: '　'.repeat(row.depth) + (row.item.title || '(无标题)')
    }))
  return [{ key: '', label: '无' }].concat(list)
})

const parentLabels = computed(() => parentOptions.value.map((item) => item.label))

const parentIndex = computed(() => {
  const index = parentOptions.value.findIndex((item) => item.key === (form.parentKey || ''))
  return index < 0 ? 0 : index
})

const parentLabel = computed(() => parentOptions.value[parentIndex.value].label)

onLoad(async (query) => {
  if (!(await repo.ensureLoggedIn())) return
  tags.value = await repo.listTags()
  plans.value = await repo.listPlans()

  if (query && query.key) {
    const key = decode(query.key)
    const plan = plans.value.find((item) => item.key === key)
    if (plan) {
      editing.value = true
      originalKey.value = key
      form.createTime = plan.createTime
      form.id = plan.id
      form.title = plan.title
      form.content = plan.content
      form.dueTime = plan.dueTime
      form.actualTime = plan.actualTime
      form.completed = !!plan.completed
      form.important = !!plan.important
      form.urgent = !!plan.urgent
      form.parentKey = plan.parentKey
      selectedTags.value = (plan.tags || []).slice()
      if (plan.dueTime) {
        const parts = toDateTime(plan.dueTime)
        dueDate.value = parts.date
        dueTimeStr.value = parts.time
      }
    }
  } else if (query && query.parentKey) {
    form.parentKey = decode(query.parentKey)
  }
})

function toggleTag(name) {
  if (selectedTags.value.includes(name)) {
    selectedTags.value = selectedTags.value.filter((item) => item !== name)
  } else {
    selectedTags.value = selectedTags.value.concat(name)
  }
}

function syncDue() {
  form.dueTime = parseDateTime(dueDate.value, dueTimeStr.value)
}

function onDateChange(e) {
  dueDate.value = e.detail.value
  if (!dueTimeStr.value) dueTimeStr.value = '23:59'
  syncDue()
}

function onTimeChange(e) {
  dueTimeStr.value = e.detail.value
  if (!dueDate.value) dueDate.value = toDateTime(Date.now()).date
  syncDue()
}

function clearDue() {
  dueDate.value = ''
  dueTimeStr.value = ''
  form.dueTime = null
}

function onParentChange(e) {
  const option = parentOptions.value[Number(e.detail.value)]
  form.parentKey = option ? option.key || null : null
}

async function save() {
  if (saving.value) return
  if (!form.title.trim() && !form.content.trim()) {
    uni.showToast({ title: '请填写标题或内容', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await repo.savePlan({ ...form }, selectedTags.value)
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function remove() {
  uni.showModal({
    title: '删除计划',
    content: '确定删除该计划吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await repo.deletePlan({
          createTime: form.createTime,
          id: form.id
        })
        uni.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => uni.navigateBack(), 400)
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
      }
    }
  })
}
</script>

<style lang="scss">
.date-row {
  display: flex;
  align-items: center;
}

.picker {
  flex: 1;
  margin-right: 16rpx;
}

.picker-value {
  padding: 20rpx 24rpx;
  border: 1rpx solid #dcdfe6;
  border-radius: 8rpx;
  color: #303133;
  font-size: 28rpx;
  background-color: #ffffff;
}

.clear-btn {
  color: #e54d42;
  font-size: 26rpx;
  padding: 8rpx 12rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #f2f3f5;
}

.switch-label {
  font-size: 28rpx;
  color: #606266;
}

.actual-time {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #19be6b;
}
</style>
