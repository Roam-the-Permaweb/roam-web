import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import UnoCSS from "unocss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      // Polyfill node built-ins
      include: ["crypto", "buffer", "stream"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    preact(),
    UnoCSS(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [
          /^\/api\//,
          /\.(?:js|css|png|jpg|jpeg|svg|gif|webp|avif|ico|woff|woff2)$/,
        ],
        // Increase file size limit to accommodate AR.IO SDK bundle
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/arweave\.net\//,
            handler: "CacheFirst",
            options: {
              cacheName: "arweave-content",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
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
    // Increase chunk size warning limit for AR.IO SDK
    chunkSizeWarningLimit: 8000, // 8MB
    rollupOptions: {
      output: {
        // Enable content-based hashing for cache busting
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
