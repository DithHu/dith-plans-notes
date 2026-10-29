<template>
  <view class="tab-bar">
    <view
      v-for="item in items"
      :key="item.url"
      class="tab-item"
      :class="{ active: current === item.url }"
      @click="go(item.url)"
    >
      <text class="tab-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  current: {
    type: String,
    default: ''
  }
})

const items = [
  { text: '计划', url: '/pages/plan/list' },
  { text: '笔记', url: '/pages/note/list' },
  { text: '标签', url: '/pages/tag/tag' },
  { text: '设置', url: '/pages/sync/sync' }
]

function go(url) {
  if (url === props.current) return
  uni.reLaunch({ url })
}
</script>

<style lang="scss">
.tab-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100rpx;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  background-color: #ffffff;
  border-top: 1rpx solid #ebeef5;
  display: flex;
  align-items: center;
  z-index: 100;
}

.tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-text {
  font-size: 28rpx;
  color: #909399;
}

.tab-item.active .tab-text {
  color: #3c9cff;
  font-weight: 600;
}
</style>
