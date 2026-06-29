import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// ── Proxy target resolution ────────────────────────────────────────────────
const isDocker = process.env.RUNNING_IN_DOCKER === 'true'
const dockerGateway = process.env.DOCKER_HOST_GATEWAY || '172.19.0.1'

// Backend is running on port 8000 (FastAPI directly)
// Port 8081 is reserved for ADMS device push via Windows portproxy → do not use for API
const BACKEND_PORT = 8000

const proxyTarget =
  process.env.VITE_API_BASE_URL ||
  (isDocker
    ? `http://${dockerGateway}:${BACKEND_PORT}`
    : `http://127.0.0.1:${BACKEND_PORT}`)

const wsTarget = proxyTarget.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 3000,

    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },

      '/ws-app': {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
      },

      '/iclock': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },

      '/adms': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})