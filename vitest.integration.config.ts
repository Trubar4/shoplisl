import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for Firebase integration tests
 *
 * These tests run against Firebase emulators and don't need a browser environment.
 * They test Firebase operations directly without Angular components.
 */
export default defineConfig({
  test: {
    // Use node environment (no browser needed)
    environment: 'node',

    // Include only integration test files
    include: ['e2e/integration/**/*.spec.ts'],

    // Exclude other test files
    exclude: ['node_modules', 'dist', '.angular', 'src/**/*.spec.ts'],

    // Enable globals (describe, it, expect, etc.)
    globals: true,

    // Longer timeout for Firebase operations
    testTimeout: 30000,

    // Run tests sequentially to avoid emulator conflicts
    threads: false,
    isolate: true,

    // Hooks to ensure emulators are running
    globalSetup: './e2e/global-setup.ts',
  },
});
