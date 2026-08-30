import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base must match the GitHub repo name exactly, with slashes.
// If you later add a custom domain, change this to '/'.
export default defineConfig({
  base: '/wesplit/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
