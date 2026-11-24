import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
