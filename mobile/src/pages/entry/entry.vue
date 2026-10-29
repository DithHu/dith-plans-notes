<template>
  <view class="entry-page">
    <up-loading-icon mode="circle" color="#3c9cff" size="36" />
    <text class="entry-text">正在进入…</text>
  </view>
</template>

<script setup>
import { onLoad } from '@dcloudio/uni-app'
import * as repo from '../../store/repository'

onLoad(async () => {
  try {
    await repo.init()
    if (!(await repo.isInitialized())) {
      uni.reLaunch({ url: '/pages/init/init' })
      return
    }
    if (!(await repo.isLoggedIn())) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    uni.reLaunch({ url: '/pages/plan/list' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '初始化失败', icon: 'none' })
  }
})
</script>

<style lang="scss">
.entry-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #f5f6fa;
}

.entry-text {
  margin-top: 24rpx;
  color: #909399;
  font-size: 26rpx;
}
</style>
