<template>
  <el-card class="page-card" shadow="never">
    <div class="toolbar">
      <el-input
        v-model="filters.q"
        placeholder="搜索标题、内容或备注"
        clearable
        style="width: 220px"
        @keyup.enter="load"
      />
      <el-select v-model="filters.tag" placeholder="按标签筛选" clearable style="width: 160px">
        <el-option v-for="tag in tags" :key="tag.id" :label="tag.name" :value="tag.name" />
      </el-select>
      <el-button type="primary" @click="search">搜索</el-button>
      <el-button @click="resetFilters">重置</el-button>
      <el-button type="success" @click="openCreate">新建笔记</el-button>
      <el-button @click="exportCsv">导出CSV</el-button>
      <el-button @click="triggerImport">导入CSV</el-button>
      <input ref="importInput" type="file" accept=".csv,text/csv" style="display: none" @change="onImportChange" />
    </div>

    <el-table :data="pagedTreeData" row-key="key" :tree-props="{ children: 'children' }" default-expand-all border>
      <el-table-column prop="title" label="标题" min-width="160" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="typeTagOf(row.type)">{{ typeText(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="内容" min-width="220">
        <template #default="{ row }">
          <span v-if="row.type === 'url'">{{ row.url }}</span>
          <a v-else-if="row.type === 'file'" :href="row.file" target="_blank" rel="noopener">查看文件</a>
          <span v-else>{{ (row.content || '').slice(0, 60) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="标签" min-width="140">
        <template #default="{ row }">
          <el-tag v-for="name in row.tags" :key="name" size="small" style="margin-right: 4px">{{ name }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="160">
        <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="listPage"
        :page-size="LIST_PAGE_SIZE"
        :total="treeData.length"
        layout="total, prev, pager, next"
        background
      />
    </div>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="editingKey ? '编辑笔记' : '新建笔记'" width="620px">
    <el-form :model="form" label-width="90px">
      <el-form-item label="类型">
        <el-radio-group v-model="form.type">
          <el-radio value="url">链接</el-radio>
          <el-radio value="text">文本</el-radio>
          <el-radio value="file">文件</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="form.title" placeholder="请输入笔记标题" />
      </el-form-item>
      <el-form-item v-if="form.type === 'url'" label="链接">
        <el-input v-model="form.url" placeholder="https://..." />
      </el-form-item>
      <el-form-item v-if="form.type === 'text'" label="内容">
        <el-input v-model="form.content" type="textarea" :rows="4" placeholder="请输入笔记内容" />
      </el-form-item>
      <el-form-item v-if="form.type === 'file'" label="文件">
        <div class="file-row">
          <input ref="fileInput" type="file" style="display: none" @change="onFileChange" />
          <el-button @click="fileInput && fileInput.click()">选择文件</el-button>
          <span v-if="fileLabel" class="file-label">{{ fileLabel }}</span>
          <el-button v-if="form.file" link type="danger" @click="clearFile">清除</el-button>
        </div>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.memo" type="textarea" :rows="2" placeholder="备注内容" />
      </el-form-item>
      <el-form-item label="父笔记">
        <el-select v-model="form.parentKey" placeholder="无父笔记" clearable filterable style="width: 100%">
          <el-option
            v-for="note in parentOptions"
            :key="note.key"
            :label="note.title || '(无标题)'"
            :value="note.key"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入标签"
          style="width: 100%"
        >
          <el-option v-for="tag in tags" :key="tag.id" :label="tag.name" :value="tag.name" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'
import { downloadCsv, errorMessage, formatTime, parseCsvObjects } from '../utils'

const LIST_PAGE_SIZE = 10

function emptyForm() {
  return {
    title: '',
    type: 'text',
    url: '',
    content: '',
    file: '',
    memo: '',
    parentKey: null,
    tags: [],
  }
}

const notes = ref([])
const tags = ref([])
const filters = reactive({ q: '', tag: '' })
const dialogVisible = ref(false)
const saving = ref(false)
const editingKey = ref(null)
const fileLabel = ref('')
const fileInput = ref(null)
const form = reactive(emptyForm())
const listPage = ref(1)
const importInput = ref(null)

const treeData = computed(() => {
  const map = new Map()
  const roots = []
  notes.value.forEach((note) => map.set(note.key, { ...note, children: [] }))
  notes.value.forEach((note) => {
    const node = map.get(note.key)
    const parent = note.parentKey ? map.get(note.parentKey) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
})

const pagedTreeData = computed(() => {
  const maxPage = Math.max(1, Math.ceil(treeData.value.length / LIST_PAGE_SIZE))
  const page = Math.min(Math.max(1, listPage.value), maxPage)
  return treeData.value.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE)
})

const parentOptions = computed(() => {
  if (!editingKey.value) return notes.value
  const excluded = new Set([editingKey.value])
  let changed = true
  while (changed) {
    changed = false
    for (const note of notes.value) {
      if (note.parentKey && excluded.has(note.parentKey) && !excluded.has(note.key)) {
        excluded.add(note.key)
        changed = true
      }
    }
  }
  return notes.value.filter((note) => !excluded.has(note.key))
})

function typeText(type) {
  return { url: '链接', text: '文本', file: '文件' }[type] || '文本'
}

function typeTagOf(type) {
  return { url: 'success', text: 'info', file: 'warning' }[type] || 'info'
}

async function load() {
  const params = {}
  if (filters.q) params.q = filters.q
  if (filters.tag) params.tag = filters.tag
  try {
    const { data } = await api.get('/notes', { params })
    notes.value = data
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function loadTags() {
  try {
    const { data } = await api.get('/tags')
    tags.value = data
  } catch (error) {
    tags.value = []
  }
}

async function resetFilters() {
  try {
    await ElMessageBox.confirm('确定要重置筛选条件吗？', '提示', { type: 'warning' })
  } catch (error) {
    return
  }
  filters.q = ''
  filters.tag = ''
  listPage.value = 1
  load()
}

function search() {
  listPage.value = 1
  load()
}

function openCreate() {
  Object.assign(form, emptyForm())
  fileLabel.value = ''
  editingKey.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  Object.assign(form, {
    title: row.title,
    type: row.type,
    url: row.url || '',
    content: row.content || '',
    file: row.file || '',
    memo: row.memo || '',
    parentKey: row.parentKey || null,
    tags: [...row.tags],
  })
  fileLabel.value = row.file ? '已上传文件' : ''
  editingKey.value = row.key
  dialogVisible.value = true
}

function onFileChange(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning('文件不能超过 20MB')
    event.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.file = reader.result
    fileLabel.value = file.name
  }
  reader.readAsDataURL(file)
}

function clearFile() {
  form.file = ''
  fileLabel.value = ''
}

async function submit() {
  saving.value = true
  try {
    const payload = {
      title: form.title,
      type: form.type,
      url: form.type === 'url' ? form.url : '',
      content: form.type === 'text' ? form.content : '',
      file: form.type === 'file' ? form.file : '',
      memo: form.memo,
      parentKey: form.parentKey || null,
      tags: form.tags,
    }
    if (editingKey.value) {
      const [createTime, id] = editingKey.value.split(':')
      await api.put(`/notes/${createTime}/${id}`, payload)
    } else {
      await api.post('/notes', payload)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await load()
    await loadTags()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除笔记「${row.title || '无标题'}」吗？`, '提示', { type: 'warning' })
  } catch (error) {
    return
  }
  try {
    const [createTime, id] = row.key.split(':')
    await api.delete(`/notes/${createTime}/${id}`)
    ElMessage.success('已删除')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function triggerImport() {
  if (importInput.value) importInput.value.click()
}

function onImportChange(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      await applyImport(String(reader.result))
    } catch (error) {
      ElMessage.error(errorMessage(error))
    } finally {
      event.target.value = ''
    }
  }
  reader.readAsText(file, 'utf-8')
}

function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function splitTags(value) {
  return String(value || '')
    .split('|')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

async function exportCsv() {
  try {
    const { data } = await api.get('/notes')
    const rows = [
      [
        'key',
        'createTime',
        'id',
        'title',
        'type',
        'url',
        'content',
        'file',
        'memo',
        'parentKey',
        'tags',
        'updateTime',
      ],
      ...data.map((note) => [
        note.key,
        note.createTime,
        note.id,
        note.title,
        note.type,
        note.url,
        note.content,
        note.file,
        note.memo,
        note.parentKey ?? '',
        (note.tags || []).join('|'),
        note.updateTime,
      ]),
    ]
    downloadCsv(`notes-${Date.now()}.csv`, rows)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function applyImport(text) {
  const records = parseCsvObjects(text)
    .map((record) => {
      const createTime = Number(record.createTime)
      const id = Number(record.id)
      if (!createTime || !id) return null
      return {
        createTime,
        id,
        title: record.title || '',
        type: record.type || 'text',
        url: record.url || '',
        content: record.content || '',
        file: record.file || '',
        memo: record.memo || '',
        parentKey: record.parentKey || null,
        tags: splitTags(record.tags),
        updateTime: toNullableNumber(record.updateTime) || createTime,
      }
    })
    .filter(Boolean)
  if (!records.length) {
    ElMessage.warning('CSV 中没有可导入的笔记数据')
    return
  }
  const { data } = await api.post('/notes/import', { notes: records })
  ElMessage.success(`导入完成：写入/更新 ${data.count} 条，跳过 ${data.total - data.count} 条`)
  listPage.value = 1
  await load()
  await loadTags()
}

watch(
  () => treeData.value.length,
  (length) => {
    const maxPage = Math.max(1, Math.ceil(length / LIST_PAGE_SIZE))
    if (listPage.value > maxPage) listPage.value = maxPage
  },
)

onMounted(() => {
  load()
  loadTags()
})
</script>

<style scoped>
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-label {
  color: #606266;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
