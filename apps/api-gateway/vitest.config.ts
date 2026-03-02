import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.module.ts', 'src/main.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        'src/filters/global-exception.filter.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/auth/auth.controller.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
