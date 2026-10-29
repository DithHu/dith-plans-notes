<template>
  <view class="zd-page">
    <view class="hero">
      <text class="hero-title">计划笔记</text>
      <text class="hero-sub">首次使用，请设置本地账户</text>
    </view>

    <view class="zd-card">
      <view class="zd-group">
        <view class="zd-label">用户名</view>
        <up-input
          v-model="username"
          placeholder="请输入用户名"
          border="surround"
          clearable
        />
      </view>
      <view class="zd-group">
        <view class="zd-label">密码</view>
        <up-input
          v-model="password"
          placeholder="请输入密码"
          border="surround"
          password
          password-visibility-toggle
        />
      </view>
      <view class="zd-group">
        <view class="zd-label">确认密码</view>
        <up-input
          v-model="confirm"
          placeholder="请再次输入密码"
          border="surround"
          password
        />
      </view>

      <up-button
        type="primary"
        text="完成初始化"
        :loading="loading"
        @click="submit"
      />
    </view>

    <text class="tip">账户仅保存在本机，请妥善保管密码</text>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import * as repo from '../../store/repository'

const username = ref('')
const password = ref('')
const confirm = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return
  if (!username.value.trim()) {
    uni.showToast({ title: '请输入用户名', icon: 'none' })
    return
  }
  if (!password.value) {
    uni.showToast({ title: '请输入密码', icon: 'none' })
    return
  }
  if (password.value !== confirm.value) {
    uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
    return
  }
  loading.value = true
  try {
    await repo.setupAccount(username.value, password.value)
    uni.showToast({ title: '初始化成功', icon: 'success' })
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/plan/list' })
    }, 500)
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '初始化失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss">
.hero {
  padding: 60rpx 0 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-title {
  font-size: 44rpx;
  font-weight: 600;
  color: #303133;
}

.hero-sub {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #909399;
}

.tip {
  display: block;
  text-align: center;
  color: #a8abb2;
  font-size: 24rpx;
}
</style>
