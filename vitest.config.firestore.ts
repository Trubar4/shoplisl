import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment - no browser needed for Firestore E2E tests
    environment: 'node',

    // Only run firestore E2E test files
    include: ['src/app/core/services/__e2e__/**/*.e2e.spec.ts'],

    // No Angular setup needed
    setupFiles: [],

    globals: true,

    // Longer timeout for emulator operations
    testTimeout: 30000,

    // Run sequentially - tests share the emulator
    sequence: {
      concurrent: false,
    },

    // Single thread to avoid emulator race conditions
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
