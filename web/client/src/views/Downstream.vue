<template>
  <el-card class="page-card" shadow="never">
    <div class="toolbar">
      <el-button @click="load">刷新</el-button>
    </div>

    <el-table :data="list" border>
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="clientId" label="client_id" min-width="280" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="申请时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="通过时间" width="170">
        <template #default="{ row }">{{ formatTime(row.approvedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button link type="primary" :disabled="row.status === 'approved'" @click="approve(row)">通过</el-button>
          <el-button link type="warning" :disabled="row.status === 'rejected'" @click="reject(row)">拒绝</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'
import { errorMessage, formatTime } from '../utils'

const list = ref([])

const STATUS_TEXT = { pending: '待审批', approved: '已通过', rejected: '已拒绝' }

function statusText(status) {
  return STATUS_TEXT[status] || status
}

function statusType(status) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[status] || 'info'
}

async function load() {
  try {
    const { data } = await api.get('/downstream')
    list.value = data
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function approve(row) {
  try {
    await api.put(`/downstream/${row.clientId}/approve`)
    ElMessage.success('已通过申请')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function reject(row) {
  try {
    await api.put(`/downstream/${row.clientId}/reject`)
    ElMessage.success('已拒绝申请')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除下游「${row.name}」吗？`, '提示', { type: 'warning' })
  } catch (error) {
    return
  }
  try {
    await api.delete(`/downstream/${row.clientId}`)
    ElMessage.success('已删除')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(load)
</script>
