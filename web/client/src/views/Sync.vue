<template>
  <el-card class="page-card" shadow="never">
    <template #header>本端信息</template>
    <el-form label-width="120px">
      <el-form-item label="client_id">
        <el-button @click="clientVisible = true">查看</el-button>
      </el-form-item>
    </el-form>
  </el-card>

  <el-card class="page-card" shadow="never">
    <template #header>上游服务器</template>
    <el-form label-width="120px">
      <el-form-item label="上游服务器地址">
        <el-input v-model="upstreamUrl" placeholder="http://localhost:3000" />
      </el-form-item>
      <el-form-item label="审批状态">
        <el-tag :type="statusType(info.status)">{{ statusText(info.status) }}</el-tag>
      </el-form-item>
      <el-form-item label="最近同步时间">
        <span>{{ formatTime(info.lastSyncAt) }}</span>
      </el-form-item>
      <el-form-item>
        <el-button @click="saveUrl">保存地址</el-button>
        <el-button type="primary" @click="applyUpstream">申请</el-button>
        <el-button @click="refreshStatus">刷新状态</el-button>
      </el-form-item>
      <el-form-item>
        <el-button type="success" :loading="syncing" @click="syncNow">手动同步</el-button>
        <el-button type="warning" :loading="syncingFull" @click="syncFull">全量同步</el-button>
      </el-form-item>
      <el-form-item v-if="lastResult" label="同步结果">
        <span>{{ lastResult }}</span>
      </el-form-item>
    </el-form>
  </el-card>

  <el-dialog v-model="clientVisible" title="client_id" width="480px">
    <el-input :model-value="info.clientId" type="textarea" :rows="2" readonly />
    <template #footer>
      <el-button @click="clientVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import { errorMessage, formatTime } from '../utils'

const info = ref({ url: '', status: 'none', lastSyncAt: null, clientId: '' })
const clientVisible = ref(false)
const upstreamUrl = ref('')
const syncing = ref(false)
const syncingFull = ref(false)
const lastResult = ref('')

const STATUS_TEXT = { none: '未申请', pending: '待审批', approved: '已通过', rejected: '已拒绝' }

function statusText(status) {
  return STATUS_TEXT[status] || '未申请'
}

function statusType(status) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[status] || 'info'
}

async function load() {
  try {
    const { data } = await api.get('/sync/upstream')
    info.value = data
    upstreamUrl.value = data.url
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function saveUrl() {
  try {
    const { data } = await api.put('/sync/upstream', { url: upstreamUrl.value.trim() })
    info.value = data
    upstreamUrl.value = data.url
    ElMessage.success('已保存上游服务器地址')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function applyUpstream() {
  try {
    const { data } = await api.post('/sync/upstream/apply')
    info.value.status = data.status
    ElMessage.success(`申请已提交，当前状态：${statusText(data.status)}`)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function refreshStatus() {
  try {
    const { data } = await api.get('/sync/upstream/status')
    info.value.status = data.status
    ElMessage.success(`当前状态：${statusText(data.status)}`)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function describeResult(data) {
  return `推送：计划 ${data.push.plans} 条、笔记 ${data.push.notes} 条；拉取：计划 ${data.pull.plans} 条、笔记 ${data.pull.notes} 条、标签 ${data.pull.tags} 个`
}

async function syncNow() {
  syncing.value = true
  try {
    const { data } = await api.post('/sync/now')
    lastResult.value = describeResult(data)
    ElMessage.success('同步完成')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    syncing.value = false
  }
}

async function syncFull() {
  syncingFull.value = true
  try {
    const { data } = await api.post('/sync/full')
    lastResult.value = describeResult(data)
    ElMessage.success('全量同步完成')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    syncingFull.value = false
  }
}

onMounted(load)
</script>
