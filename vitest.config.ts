import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/**/*.spec.ts', 'src/__tests__/**/*.spec.ts'],
  },
});
