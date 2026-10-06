import { fileURLToPath } from 'url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'click-outside-vue3': fileURLToPath(
        new URL('../src/index.js', import.meta.url),
      ),
    },
  },
})
