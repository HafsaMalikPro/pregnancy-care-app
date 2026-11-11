import { defineConfig } from 'vitest/config';

/**
 * Unit and e2e suites together, for one combined coverage report with enforced thresholds
 * (`pnpm test:coverage`, run in CI). Needs TEST_DATABASE_URL like the e2e suite.
 */
export default defineConfig({
  test: {
    projects: ['./vitest.config.ts', './vitest.config.e2e.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage/all',
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
