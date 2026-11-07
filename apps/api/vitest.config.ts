import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    name: 'unit',
    globals: true,
    root: './',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage/unit',
    },
    include: ['**/*.spec.ts'],
  },
});
