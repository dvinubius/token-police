import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

// Frontend source lives in frontend/; `vite build` emits to dist/, which
// server.js serves statically. The dev server proxies /api/* to the running
// Express process so the dev UI hits real data.
export default defineConfig({
  plugins: [svelte()],
  root: resolve(root, 'frontend'),
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    // Vite 8's CSS minifier (lightningcss) collapses a hand-written
    // `backdrop-filter` + `-webkit-backdrop-filter` pair to ONLY the -webkit-
    // form, which Firefox does not implement — silently killing every glass
    // surface in the built app. So styles.css writes only the standard
    // property, and these explicit targets make lightningcss generate the
    // -webkit- prefix itself (Safari 16 still needs it). Do not hand-write
    // -webkit-backdrop-filter in styles.css.
    cssTarget: ['chrome110', 'firefox110', 'safari16'],
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:7899',
    },
  },
});
