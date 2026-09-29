import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// configure-pages returns either an empty path or a repository subdirectory.
const path = (process.env.BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
const base = path ? `/${path}/` : '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: base,
        name: 'NUU QR',
        short_name: 'NUU QR',
        description: 'Make beautiful, scannable QR codes. Private by design and ready to work offline.',
        lang: 'en',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#080d19',
        theme_color: '#080d19',
        categories: ['utilities', 'productivity'],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\.[^/]+$/],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: 'es2020' },
});
