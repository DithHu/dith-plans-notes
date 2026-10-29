<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <template #header>
        <div class="auth-title">登录</div>
      </template>
      <el-form :model="form" label-width="90px" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">登录</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'
import { errorMessage } from '../utils'

const router = useRouter()
const loading = ref(false)
const form = reactive({ username: '', password: '' })

async function submit() {
  if (!form.username.trim() || !form.password) {
    return ElMessage.warning('请输入用户名和密码')
  }
  loading.value = true
  try {
    const { data } = await api.post('/auth/login', { username: form.username.trim(), password: form.password })
    localStorage.setItem('token', data.token)
    ElMessage.success('登录成功')
    router.replace('/plans')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}
</script>
