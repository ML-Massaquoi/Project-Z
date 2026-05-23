import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// When running inside Docker, the backend is reachable via the service name.
// When running locally (outside Docker), it's on localhost:8000.
const backendHost = process.env.VITE_API_BASE_URL || 'http://localhost:8000'
const wsHost = process.env.VITE_WS_URL || 'ws://localhost:8000'

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
        target: backendHost,
        changeOrigin: true,
      },
      '/ws': {
        target: wsHost,
        ws: true,
      },
      '/iclock': {
        target: backendHost,
        changeOrigin: true,
      },
    },
  },
})
