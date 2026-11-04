import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Dev-only: teruskan /api dan /ws ke server LAN agar web admin bisa login
    // dan menampilkan data saat dijalankan lokal (mirror proxy desktop).
    proxy: {
      '/api': { target: 'http://192.168.0.100', changeOrigin: true },
      '/ws': { target: 'http://192.168.0.100', ws: true, changeOrigin: true },
    },
  },
})
