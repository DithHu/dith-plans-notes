<template>
  <view class="zd-page">
    <view class="zd-card">
      <view class="zd-group">
        <view class="zd-label">类型</view>
        <view class="type-row">
          <view
            v-for="item in typeOptions"
            :key="item.value"
            class="zd-chip"
            :class="{ active: form.type === item.value }"
            @click="form.type = item.value"
          >
            {{ item.label }}
          </view>
        </view>
      </view>

      <view class="zd-group">
        <view class="zd-label">标题</view>
        <up-input v-model="form.title" border="surround" placeholder="笔记标题" clearable />
      </view>

      <view v-if="form.type === 'url'" class="zd-group">
        <view class="zd-label">链接地址</view>
        <up-input v-model="form.url" border="surround" placeholder="https://" clearable />
      </view>

      <view v-if="form.type === 'text'" class="zd-group">
        <view class="zd-label">正文</view>
        <up-textarea
          v-model="form.content"
          border="surround"
          placeholder="笔记正文"
          :height="200"
        />
      </view>

      <view v-if="form.type === 'file'" class="zd-group">
        <view class="zd-label">文件</view>
        <view class="file-row">
          <text class="file-name">{{ fileLabel || '未选择文件' }}</text>
          <up-button size="small" type="primary" plain text="选择文件" @click="chooseAttachment" />
          <up-button
            v-if="form.file"
            size="small"
            type="error"
            plain
            text="清除"
            @click="clearAttachment"
          />
        </view>
      </view>

      <view class="zd-group">
        <view class="zd-label">备注</view>
        <up-textarea
          v-model="form.memo"
          border="surround"
          placeholder="备注信息（可选）"
          :height="100"
        />
      </view>

      <view class="zd-group">
        <view class="zd-label">父笔记</view>
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

const typeOptions = [
  { value: 'url', label: '链接' },
  { value: 'text', label: '文本' },
  { value: 'file', label: '文件' }
]

const form = reactive({
  createTime: 0,
  id: 0,
  type: 'text',
  title: '',
  url: '',
  content: '',
  file: '',
  memo: '',
  parentKey: null
})

const tags = ref([])
const notes = ref([])
const selectedTags = ref([])
const editing = ref(false)
const saving = ref(false)
const originalKey = ref('')

const fileLabel = computed(() => {
  if (!form.file) return ''
  if (form.file.startsWith('data:')) return '已选择文件'
  return form.file.split('/').pop()
})

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
    const next = notes.value.find((note) => keyOf(note) === cursor)
    cursor = next ? next.parentKey : null
  }
  return false
}

const parentOptions = computed(() => {
  const list = flattenTree(notes.value)
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
  notes.value = await repo.listNotes()

  if (query && query.key) {
    const key = decode(query.key)
    const note = notes.value.find((item) => item.key === key)
    if (note) {
      editing.value = true
      originalKey.value = key
      form.createTime = note.createTime
      form.id = note.id
      form.type = note.type || 'text'
      form.title = note.title
      form.url = note.url
      form.content = note.content
      form.file = note.file
      form.memo = note.memo
      form.parentKey = note.parentKey
      selectedTags.value = (note.tags || []).slice()
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

function onParentChange(e) {
  const option = parentOptions.value[Number(e.detail.value)]
  form.parentKey = option ? option.key || null : null
}

function chooseAttachment() {
  // #ifdef H5
  uni.chooseFile({
    count: 1,
    success: (res) => {
      const file = res.tempFiles && res.tempFiles[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        form.file = event.target.result
      }
      reader.readAsDataURL(file)
    },
    fail: () => {
      uni.showToast({ title: '选择文件失败', icon: 'none' })
    }
  })
  return
  // #endif
  // #ifndef H5
  uni.chooseImage({
    count: 1,
    success: (res) => {
      form.file = res.tempFilePaths[0]
    },
    fail: () => {
      uni.showToast({ title: '选择文件失败', icon: 'none' })
    }
  })
  // #endif
}

function clearAttachment() {
  form.file = ''
}

async function save() {
  if (saving.value) return
  if (!form.title.trim()) {
    uni.showToast({ title: '请填写标题', icon: 'none' })
    return
  }
  if (form.type === 'url' && !form.url.trim()) {
    uni.showToast({ title: '请填写链接地址', icon: 'none' })
    return
  }
  if (form.type === 'text' && !form.content.trim()) {
    uni.showToast({ title: '请填写正文', icon: 'none' })
    return
  }
  if (form.type === 'file' && !form.file) {
    uni.showToast({ title: '请选择文件', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await repo.saveNote({ ...form }, selectedTags.value)
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
    title: '删除笔记',
    content: '确定删除该笔记吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await repo.deleteNote({
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
.type-row {
  display: flex;
}

.picker-value {
  padding: 20rpx 24rpx;
  border: 1rpx solid #dcdfe6;
  border-radius: 8rpx;
  color: #303133;
  font-size: 28rpx;
  background-color: #ffffff;
}

.file-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16rpx;
}

.file-name {
  flex: 1;
  min-width: 200rpx;
  color: #606266;
  font-size: 26rpx;
  word-break: break-all;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
}
</style>
