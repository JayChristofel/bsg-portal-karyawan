import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Integration files share one database and TRUNCATE it between tests, so files must not overlap.
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
  },
});