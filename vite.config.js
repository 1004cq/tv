import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import streamProxyPlugin from './vite-plugin-stream-proxy.js'

export default defineConfig({
  plugins: [vue(), streamProxyPlugin()],
  server: {
    port: 3000,
    open: true
  },
  preview: {
    port: 4173
  }
})
