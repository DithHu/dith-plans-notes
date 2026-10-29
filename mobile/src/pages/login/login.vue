<template>
  <view class="zd-page">
    <view class="hero">
      <text class="hero-title">登录</text>
      <text class="hero-sub">请输入本机账户信息</text>
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

      <up-button
        type="primary"
        text="登录"
        :loading="loading"
        @click="submit"
      />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import * as repo from '../../store/repository'

const username = ref('')
const password = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return
  if (!username.value.trim() || !password.value) {
    uni.showToast({ title: '请输入用户名和密码', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const ok = await repo.login(username.value, password.value)
    if (!ok) {
      uni.showToast({ title: '用户名或密码错误', icon: 'none' })
      return
    }
    uni.reLaunch({ url: '/pages/plan/list' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '登录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss">
.hero {
  padding: 80rpx 0 40rpx;
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
</style>
