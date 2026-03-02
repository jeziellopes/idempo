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
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'src/match/match.service.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/match/match.repository.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
