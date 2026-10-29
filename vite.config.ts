import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (
            id.includes('node_modules/socket.io-client') ||
            id.includes('node_modules/engine.io-client') ||
            id.includes('node_modules/socket.io-parser') ||
            id.includes('node_modules/engine.io-parser') ||
            id.includes('node_modules/@socket.io/')
          ) {
            return 'vendor-socketio';
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
