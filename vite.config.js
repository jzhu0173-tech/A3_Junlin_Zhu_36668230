import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const repositoryName = 'A3_Junlin_Zhu_36668230'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? `/${repositoryName}/` : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
