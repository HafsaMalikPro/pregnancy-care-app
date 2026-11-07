import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: 'e2e',
    globals: true,
    root: './',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage/e2e',
    },
    include: ['**/*.e2e-spec.ts'],
    // Points the suite at TEST_DATABASE_URL and refuses non-local or production databases.
    setupFiles: ['./test/setup-e2e.ts'],
    // Files run in parallel and each signs up users with deliberately slow password hashing;
    // the defaults (5 s / 10 s) time out under that load on ordinary laptops.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
