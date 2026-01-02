import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-audio': ['dexie'],  // IndexedDB for offline audio
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    // Increase chunk size warning limit slightly
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: false, // Using our custom manifest.json
      workbox: {
        // Cache app shell and static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Don't serve SPA for API routes (especially OAuth callbacks)
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime caching strategies
        runtimeCaching: [
          {
            // Never cache OAuth callbacks - let browser handle redirects
            urlPattern: /\/api\/v1\/spotify\/callback/,
            handler: 'NetworkOnly',
          },
          {
            // Never cache OAuth auth requests
            urlPattern: /\/api\/v1\/spotify\/auth/,
            handler: 'NetworkOnly',
          },
          {
            // Cache album artwork
            urlPattern: /\/api\/v1\/tracks\/.*\/artwork/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'artwork-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache API responses (except streaming and OAuth)
            urlPattern: /\/api\/v1\/(?!tracks\/.*\/stream|tracks\/.*\/video|spotify\/callback|spotify\/auth)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Don't cache audio streams - always fetch fresh
            urlPattern: /\/api\/v1\/tracks\/.*\/stream/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false, // Disable in dev mode
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4400',
        changeOrigin: true,
        timeout: 300000, // 5 minute timeout for long operations like Spotify sync
      },
    },
  },
})
