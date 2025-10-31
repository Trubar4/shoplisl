import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Use jsdom for browser-like environment (needed for Angular)
    environment: 'jsdom',

    // Include test files
    include: ['src/**/*.spec.ts'],

    // Exclude files
    exclude: ['node_modules', 'dist', '.angular'],

    // Setup files to run before tests
    setupFiles: ['src/test-setup.ts'],

    // Enable globals (describe, it, expect, etc.) without imports
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        'src/main.ts',
        'src/environments/**',
      ],
      // Progressive thresholds - start at baseline, increase during refactoring
      // Baseline (2025-10-31): Lines 8%, Functions 39%, Branches 76%, Statements 8%
      thresholds: {
        lines: 8,         // Current: 8.07%, Target: 70%
        functions: 35,    // Current: 38.67%, Target: 70%
        branches: 70,     // Current: 75.63%, Maintain above 70%
        statements: 8,    // Current: 8.07%, Target: 70%
      },
      // Report uncovered files
      all: true,
    },

    // Browser mode for better Angular compatibility
    // This helps with async operations and change detection
    testTimeout: 10000,

    // Server configuration to handle external templates and styles
    server: {
      deps: {
        inline: ['@angular/*'],
      },
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@app': resolve(__dirname, './src/app'),
      '@core': resolve(__dirname, './src/app/core'),
      '@shared': resolve(__dirname, './src/app/shared'),
      '@features': resolve(__dirname, './src/app/features'),
    },
  },

  // Enable CSS/HTML processing for Angular components
  assetsInclude: ['**/*.html', '**/*.scss', '**/*.css'],
});
