<template>
  <el-card class="page-card" shadow="never">
    <div class="toolbar">
      <el-button type="success" @click="openCreate">新建标签</el-button>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-table :data="pagedTags" border>
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="颜色" width="160">
        <template #default="{ row }">
          <span class="color-dot" :style="{ background: row.color || '#409EFF' }"></span>
          <span style="margin-left: 8px">{{ row.color }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        :page-size="PAGE_SIZE"
        :total="tags.length"
        layout="total, prev, pager, next"
        background
      />
    </div>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="editingId ? '编辑标签' : '新建标签'" width="420px">
    <el-form :model="form" label-width="70px">
      <el-form-item label="名称">
        <el-input v-model="form.name" placeholder="请输入标签名称" />
      </el-form-item>
      <el-form-item label="颜色">
        <el-color-picker v-model="form.color" />
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
import { errorMessage } from '../utils'

const PAGE_SIZE = 10

const tags = ref([])
const page = ref(1)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref(null)
const form = reactive({ name: '', color: '#409EFF' })

const pagedTags = computed(() => {
  const maxPage = Math.max(1, Math.ceil(tags.value.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, page.value), maxPage)
  return tags.value.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
})

async function load() {
  try {
    const { data } = await api.get('/tags')
    tags.value = data
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openCreate() {
  form.name = ''
  form.color = '#409EFF'
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  form.name = row.name
  form.color = row.color || '#409EFF'
  editingId.value = row.id
  dialogVisible.value = true
}

async function submit() {
  if (!form.name.trim()) return ElMessage.warning('请输入标签名称')
  saving.value = true
  try {
    const payload = { name: form.name.trim(), color: form.color || '#409EFF' }
    if (editingId.value) {
      await api.put(`/tags/${editingId.value}`, payload)
    } else {
      await api.post('/tags', payload)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除标签「${row.name}」吗？相关记录上的该标签也会移除。`, '提示', { type: 'warning' })
  } catch (error) {
    return
  }
  try {
    await api.delete(`/tags/${row.id}`)
    ElMessage.success('已删除')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(load)

watch(
  () => tags.value.length,
  (length) => {
    const maxPage = Math.max(1, Math.ceil(length / PAGE_SIZE))
    if (page.value > maxPage) page.value = maxPage
  },
)
</script>

<style scoped>
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
