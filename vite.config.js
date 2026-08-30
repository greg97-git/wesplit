import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped into the sign-in screen so you can tell at a glance which build a
// device is actually running. Saves guessing whether a deploy has landed or
// the service worker is serving something stale.
const build = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
})()

// base must match the GitHub repo name exactly, with slashes.
// If you later add a custom domain, change this to '/'.
export default defineConfig({
  base: '/wesplit/',
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register by hand in main.jsx so we can force update checks.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'WeSplit',
        short_name: 'WeSplit',
        description: 'Shared expenses for two',
        theme_color: '#10896B',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/wesplit/',
        start_url: '/wesplit/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Never cache Supabase responses. The network is the source of truth.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
})
