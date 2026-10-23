import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
      '/uploads': 'http://localhost:3002',
      '/logo.png': 'http://localhost:3002',
      '/bus.jpg': 'http://localhost:3002',
    },
  },
})
