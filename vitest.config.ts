import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Use jsdom for browser-like environment (needed for Angular)
    environment: 'jsdom',

    // Include test files
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],

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
      // Baseline (2025-10-31 after Quick Wins 1-3):
      //   Lines: 15.07% | Functions: 59.71% | Branches: 74.69% | Statements: 15.07%
      //
      // Strategy: Set thresholds at current baseline to prevent regression
      // Will increase progressively as we add tests in Phase 1-2
      // Ultimate goal: 70% across all metrics
      thresholds: {
        lines: 15,         // Current: 15.07%, Target: 70%
        functions: 59,     // Current: 59.71%, Target: 70%
        branches: 74,      // Current: 74.69%, Already above target! ✅
        statements: 15,    // Current: 15.07%, Target: 70%
      },
      // Report uncovered files
      all: true,
      // Include threshold coverage in CLI output
      skipFull: false,
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
