import path from 'path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@calc': path.resolve(rootDir, '../measurer'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
