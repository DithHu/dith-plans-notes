<template>
  <el-container class="layout">
    <el-aside width="200px" class="aside">
      <div class="logo">计划与笔记</div>
      <el-menu :default-active="$route.path" router @select="handleSelect">
        <el-menu-item index="/plans">计划</el-menu-item>
        <el-menu-item index="/notes">笔记</el-menu-item>
        <el-menu-item index="/tags">标签</el-menu-item>
        <el-menu-item index="/downstream">下游审批</el-menu-item>
        <el-menu-item index="/sync">设置</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span class="header-title">Web 端</span>
        <div class="user">
          <span class="username">{{ username }}</span>
          <el-button link type="primary" @click="logout">退出登录</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view :key="refreshKey" />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const username = ref('')
const refreshKey = ref(0)

// 点击左侧大功能菜单时重新挂载页面组件，触发对应数据刷新
function handleSelect() {
  refreshKey.value += 1
}

onMounted(async () => {
  try {
    const { data } = await api.get('/auth/me')
    username.value = data.username
  } catch (error) {
    username.value = ''
  }
})

function logout() {
  localStorage.removeItem('token')
  router.replace('/login')
}
</script>

<style scoped>
.layout {
  height: 100vh;
}

.aside {
  background: #fff;
  border-right: 1px solid #e4e7ed;
}

.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  font-weight: 600;
  font-size: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  font-weight: 600;
}

.user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.username {
  color: #606266;
}
</style>
