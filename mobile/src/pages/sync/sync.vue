<template>
  <view class="zd-page">
    <view class="zd-card">
      <view class="zd-row zd-between">
        <view class="zd-label">客户端 ID</view>
        <up-button size="small" type="primary" plain text="查看" @click="showClientId" />
      </view>
      <text class="zd-muted">用于向上游服务器申请同步时标识本机</text>
    </view>

    <view class="zd-card">
      <view class="zd-label">上游服务器地址</view>
      <up-input
        v-model="serverUrl"
        border="surround"
        placeholder="http://192.168.1.10:3000"
        clearable
      />
      <view class="zd-btn-row">
        <up-button size="small" type="primary" text="保存地址" @click="saveUrl" />
      </view>

      <view class="status-line">
        <text class="status-label">申请状态：</text>
        <text class="status-value" :class="'status-' + info.status">{{ statusText }}</text>
      </view>
      <view class="status-line">
        <text class="status-label">最近同步：</text>
        <text class="status-value">{{ info.lastTime ? formatTime(info.lastTime) : '尚未同步' }}</text>
      </view>
      <view v-if="info.lastResult" class="status-line">
        <text class="status-label">同步结果：</text>
        <text class="status-value">{{ info.lastResult }}</text>
      </view>
    </view>

    <view class="zd-card">
      <view class="zd-btn-row">
        <up-button
          type="primary"
          plain
          text="申请"
          :loading="loading.apply"
          @click="apply"
        />
        <up-button
          type="primary"
          plain
          text="刷新状态"
          :loading="loading.refresh"
          @click="refresh"
        />
      </view>
      <view class="zd-btn-row">
        <up-button
          type="primary"
          text="手动同步"
          :loading="loading.normal"
          @click="manual"
        />
      </view>
      <view class="zd-btn-row">
        <up-button
          type="warning"
          text="全量同步"
          :loading="loading.full"
          @click="fullSync"
        />
      </view>
      <text class="zd-muted tip">
        手动同步会先上传本地变更再拉取上游服务器数据；全量同步会提交并拉取全部数据。同步需上游服务器审批通过。
      </text>
    </view>

    <view class="zd-card">
      <up-button type="error" plain text="退出登录" @click="logout" />
    </view>

    <tab-bar current="/pages/sync/sync" />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import * as repo from '../../store/repository'
import { applySync, refreshStatus, syncAll, getSyncInfo } from '../../store/sync'
import { formatTime } from '../../utils/format'

const info = reactive({
  clientId: '',
  status: 'none',
  lastTime: 0,
  lastResult: ''
})
const serverUrl = ref('')
const loading = reactive({
  apply: false,
  refresh: false,
  normal: false,
  full: false
})
let urlLoaded = false

const STATUS_TEXT = {
  none: '未申请',
  pending: '等待上游审批',
  approved: '已通过',
  rejected: '已拒绝'
}

const statusText = computed(() => STATUS_TEXT[info.status] || '未申请')

async function loadInfo() {
  const data = await getSyncInfo()
  info.clientId = data.clientId || ''
  info.status = data.status || 'none'
  info.lastTime = data.lastTime || 0
  info.lastResult = data.lastResult || ''
  if (!urlLoaded) {
    serverUrl.value = data.serverUrl || ''
    urlLoaded = true
  }
}

onShow(async () => {
  if (!(await repo.ensureLoggedIn())) return
  try {
    await loadInfo()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '读取同步信息失败', icon: 'none' })
  }
})

function showError(e) {
  if (e && e.notApproved) {
    uni.showToast({ title: '等待上游审批', icon: 'none' })
    return
  }
  uni.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
}

function showClientId() {
  uni.showModal({
    title: '客户端 ID',
    content: info.clientId || '生成中…',
    showCancel: false
  })
}

function logout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账户吗？',
    success: async (res) => {
      if (!res.confirm) return
      await repo.logout()
      uni.reLaunch({ url: '/pages/login/login' })
    }
  })
}

async function saveUrl() {
  const url = (serverUrl.value || '').trim()
  if (url && !/^https?:\/\//i.test(url)) {
    uni.showToast({ title: '地址需以 http:// 或 https:// 开头', icon: 'none' })
    return
  }
  try {
    await repo.setServerUrl(url)
    serverUrl.value = url
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
  }
}

async function apply() {
  if (loading.apply) return
  loading.apply = true
  try {
    const status = await applySync()
    info.status = status
    let title = '已提交申请，等待上游审批'
    if (status === 'approved') title = '申请已通过'
    if (status === 'rejected') title = '申请被拒绝'
    uni.showToast({ title, icon: 'none' })
  } catch (e) {
    showError(e)
  } finally {
    loading.apply = false
    await loadInfo()
  }
}

async function refresh() {
  if (loading.refresh) return
  loading.refresh = true
  try {
    await refreshStatus()
    uni.showToast({ title: '状态已刷新', icon: 'success' })
  } catch (e) {
    showError(e)
  } finally {
    loading.refresh = false
    await loadInfo()
  }
}

async function runSync(full, key) {
  if (loading[key]) return
  loading[key] = true
  try {
    const result = await syncAll(full)
    await repo.setLastSyncResult(
      `成功（新增计划 ${result.plans}，笔记 ${result.notes}，标签 ${result.tags}）`
    )
    uni.showToast({ title: '同步完成', icon: 'success' })
  } catch (e) {
    await repo.setLastSyncResult('失败：' + ((e && e.message) || '未知错误'))
    showError(e)
  } finally {
    loading[key] = false
    await loadInfo()
  }
}

function manual() {
  runSync(false, 'normal')
}

function fullSync() {
  runSync(true, 'full')
}
</script>

<style lang="scss">
.status-line {
  display: flex;
  margin-top: 16rpx;
  font-size: 26rpx;
}

.status-label {
  color: #909399;
  width: 160rpx;
}

.status-value {
  flex: 1;
  color: #303133;
  word-break: break-all;
}

.status-none {
  color: #909399;
}

.status-pending {
  color: #f9ae3d;
}

.status-approved {
  color: #19be6b;
}

.status-rejected {
  color: #e54d42;
}

.tip {
  display: block;
  margin-top: 20rpx;
  line-height: 1.6;
}
</style>
