<script>
import { init } from './store/repository'

export default {
  onLaunch() {
    init().catch((e) => console.error('本地数据库初始化失败', e))
  }
}
</script>

<style lang="scss">
@import "uview-plus/index.scss";

page {
  background-color: #f5f6fa;
  color: #303133;
  font-size: 28rpx;
}

.zd-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 140rpx;
  box-sizing: border-box;
}

.zd-card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.zd-row {
  display: flex;
  align-items: center;
}

.zd-between {
  justify-content: space-between;
}

.zd-muted {
  color: #909399;
  font-size: 24rpx;
}

.zd-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #303133;
}

.zd-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 16rpx;
}

.zd-chip {
  display: inline-block;
  padding: 6rpx 18rpx;
  margin: 0 10rpx 10rpx 0;
  border-radius: 999rpx;
  background-color: #eef1f8;
  color: #5a5f6a;
  font-size: 24rpx;
}

.zd-chip.active {
  background-color: #3c9cff;
  color: #ffffff;
}

.zd-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-right: 10rpx;
}

.zd-dot.green {
  background-color: #19be6b;
}

.zd-dot.red {
  background-color: #e54d42;
}

.zd-dot.yellow {
  background-color: #f9ae3d;
}

.zd-save {
  margin-top: 32rpx;
}

.zd-group {
  margin-bottom: 24rpx;
}

.zd-label {
  font-size: 26rpx;
  color: #606266;
  margin-bottom: 12rpx;
}

.zd-btn-row {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}

.zd-btn-row .u-button {
  flex: 1;
}
</style>
