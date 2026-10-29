import { createRouter, createWebHistory } from 'vue-router'
import api from './api'
import Setup from './views/Setup.vue'
import Login from './views/Login.vue'
import Layout from './views/Layout.vue'
import Plans from './views/Plans.vue'
import Notes from './views/Notes.vue'
import Tags from './views/Tags.vue'
import Sync from './views/Sync.vue'
import Downstream from './views/Downstream.vue'

const routes = [
  { path: '/setup', component: Setup },
  { path: '/login', component: Login },
  {
    path: '/',
    component: Layout,
    redirect: '/plans',
    children: [
      { path: 'plans', component: Plans },
      { path: 'notes', component: Notes },
      { path: 'tags', component: Tags },
      { path: 'sync', component: Sync },
      { path: 'downstream', component: Downstream },
    ],
  },
]

const router = createRouter({ history: createWebHistory(), routes })

async function isInitialized() {
  try {
    const { data } = await api.get('/auth/status')
    return !!data.initialized
  } catch (error) {
    return true
  }
}

router.beforeEach(async (to) => {
  if (to.path === '/setup') {
    return (await isInitialized()) ? '/login' : true
  }
  if (to.path === '/login') {
    if (!(await isInitialized())) return '/setup'
    return localStorage.getItem('token') ? '/plans' : true
  }
  return localStorage.getItem('token') ? true : '/login'
})

export default router
