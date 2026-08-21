import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a new service worker installs but waits for
      // explicit activation, so the in-app "update available" banner controls when
      // the reload happens instead of silently swapping code under an open tablet.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: "Prego's Cucina POS",
        short_name: 'Pregos POS',
        description:
          "iPad point-of-sale for Prego's Cucina — offline-first order taking, inventory, and analytics.",
        theme_color: '#970000',
        background_color: '#fbf9f8',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // /order, /kitchen, /fulfillment run on tablets that stay open all day and
        // depend on realtime Supabase subscriptions to be useful at all, so they must
        // always fetch the latest deployed code over the network rather than risk
        // serving a stale offline snapshot. Never let navigations to these routes
        // fall back to the cached app shell, online or offline.
        navigateFallbackDenylist: [/^\/order(\/|$)/, /^\/kitchen(\/|$)/, /^\/fulfillment(\/|$)/],
        // Belt-and-suspenders: once those pages exist, they'll be grouped into
        // realtime-* chunks by the manualChunks rule below (build.rollupOptions.output)
        // — this keeps those chunks out of the precache manifest entirely. Requires the
        // page code to live under src/features/{order,kitchen,fulfillment}/ and be
        // added to the router via React.lazy/dynamic import (not a static import like
        // today's routes) so it actually forms its own chunk.
        globIgnores: ['**/realtime-*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep the future realtime routes (/order, /kitchen, /fulfillment) out of the
        // main app bundle so they can be excluded from offline precaching (see the
        // globIgnores/navigateFallbackDenylist comments above). Only takes effect once
        // those pages exist under src/features/{order,kitchen,fulfillment}/ and are
        // wired into the router via a lazy/dynamic import.
        manualChunks(id) {
          const match = id.match(/[\\/]src[\\/]features[\\/](order|kitchen|fulfillment)[\\/]/)
          if (match) return `realtime-${match[1]}`
        },
      },
    },
  },
})
