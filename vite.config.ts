/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // served from https://<user>.github.io/qrxfer/ in production; keep local dev at the root
  base: command === 'build' ? '/qrxfer/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'qrxfer — QR file transfer research lab',
        short_name: 'qrxfer',
        description: 'Transfer files over animated, fountain-coded QR codes — fully offline, in the browser.',
        theme_color: '#7c3aed',
        background_color: '#111014',
        display: 'standalone',
        icons: [],
      },
      workbox: {
        // the zxing WASM binary is large; make sure it's precached for offline use
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}))
