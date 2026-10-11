import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 2048,
    reportCompressedSize: false,
  },
});
