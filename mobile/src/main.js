import App from './App'
import { createSSRApp } from 'vue'
import uviewPlus from 'uview-plus'

export function createApp() {
  const app = createSSRApp(App)
  app.use(uviewPlus)
  return { app }
}
