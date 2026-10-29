<template>
  <view class="zd-page">
    <view class="zd-card">
      <view class="form-title">{{ editId ? '编辑标签' : '新增标签' }}</view>
      <view class="zd-group">
        <view class="zd-label">标签名</view>
        <up-input v-model="name" border="surround" placeholder="请输入标签名" clearable />
      </view>
      <view class="zd-group">
        <view class="zd-label">颜色</view>
        <view class="color-row">
          <view
            v-for="color in colors"
            :key="color"
            class="color-item"
            :class="{ selected: selectedColor === color }"
            :style="{ backgroundColor: color }"
            @click="selectedColor = color"
          ></view>
        </view>
      </view>
      <view class="zd-btn-row">
        <up-button
          type="primary"
          :text="editId ? '保存修改' : '新增标签'"
          :loading="saving"
          @click="save"
        />
        <up-button v-if="editId" type="info" plain text="取消" @click="reset" />
      </view>
    </view>

    <view v-if="loading" class="zd-card loading">
      <up-loading-icon mode="circle" color="#3c9cff" size="32" />
    </view>

    <up-empty v-else-if="!tags.length" mode="list" text="暂无标签" />

    <view v-else>
      <view v-for="tag in pagedTags" :key="tag.id" class="zd-card">
        <view class="zd-row zd-between">
          <view class="zd-row">
            <view class="color-dot" :style="{ backgroundColor: tag.color }"></view>
            <text class="tag-name">{{ tag.name }}</text>
          </view>
          <text class="zd-muted">ID {{ tag.id }}</text>
        </view>
        <view class="zd-actions">
          <up-button size="small" type="primary" plain text="编辑" @click="startEdit(tag)" />
          <up-button size="small" type="error" plain text="删除" @click="remove(tag)" />
        </view>
      </view>

      <view v-if="totalPages > 1" class="pager">
        <up-button size="small" plain text="上一页" :disabled="page <= 1" @click="page = page - 1" />
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

    <tab-bar current="/pages/tag/tag" />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import * as repo from '../../store/repository'
import { TAG_COLORS } from '../../utils/format'

const PAGE_SIZE = 10

const colors = TAG_COLORS
const tags = ref([])
const page = ref(1)
const name = ref('')
const selectedColor = ref(TAG_COLORS[0])
const editId = ref(null)
const saving = ref(false)
const loading = ref(true)

const totalPages = computed(() => Math.max(1, Math.ceil(tags.value.length / PAGE_SIZE)))

const pagedTags = computed(() =>
  tags.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

watch(totalPages, (total) => {
  if (page.value > total) page.value = total
})

async function load() {
  loading.value = true
  try {
    tags.value = await repo.listTags()
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

function startEdit(tag) {
  editId.value = tag.id
  name.value = tag.name
  selectedColor.value = tag.color || TAG_COLORS[0]
}

function reset() {
  editId.value = null
  name.value = ''
  selectedColor.value = TAG_COLORS[0]
}

async function save() {
  if (saving.value) return
  if (!name.value.trim()) {
    uni.showToast({ title: '请输入标签名', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await repo.saveTag({
      id: editId.value || undefined,
      name: name.value,
      color: selectedColor.value
    })
    uni.showToast({ title: '保存成功', icon: 'success' })
    reset()
    await load()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function remove(tag) {
  uni.showModal({
    title: '删除标签',
    content: `确定删除标签「${tag.name}」吗？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await repo.deleteTag(tag.id)
        if (editId.value === tag.id) reset()
        uni.showToast({ title: '已删除', icon: 'success' })
        await load()
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '删除失败', icon: 'none' })
      }
    }
  })
}
</script>

<style lang="scss">
.form-title {
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 20rpx;
}

.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.color-item {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  border: 4rpx solid transparent;
}

.color-item.selected {
  border-color: #303133;
}

.color-dot {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  margin-right: 16rpx;
}

.tag-name {
  font-size: 30rpx;
  font-weight: 600;
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
</style>
