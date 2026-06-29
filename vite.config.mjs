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
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:7899',
    },
  },
});
