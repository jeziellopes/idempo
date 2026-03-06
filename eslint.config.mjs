import { FlatCompat } from '@eslint/eslintrc';
import nxEslintPlugin from '@nx/eslint-plugin';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  { plugins: { '@nx': nxEslintPlugin } },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'scope:app',
              onlyDependOnLibsWithTags: ['scope:shared', 'scope:app'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
          ],
        },
      ],
    },
  },
  ...compat.extends('plugin:@typescript-eslint/recommended'),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // NestJS services/controllers/strategies/modules use constructor injection which requires 
  // runtime imports for dependency resolution, even if they appear type-only to ESLint.
  // Disable consistent-type-imports rule for these architectural files.
  {
    files: [
      'apps/**/src/**/*.controller.ts',
      'apps/**/src/**/*.service.ts',
      'apps/**/src/**/*.strategy.ts',
      'apps/**/src/**/*.module.ts',
      'apps/**/src/**/*.guard.ts',
      'apps/**/src/**/*.interceptor.ts',
      'apps/**/src/**/*.factory.ts',
      'apps/**/src/**/*.consumer.ts',
      'apps/**/src/**/*.repository.ts',
      'apps/**/src/**/*.gateway.ts',
      'packages/**/src/**/*.service.ts',
      'packages/**/src/**/*.module.ts',
      'packages/**/src/**/*.factory.ts',
      'packages/**/src/**/*.consumer.ts',
      'packages/**/src/**/*.repository.ts',
      'packages/**/src/**/*.gateway.ts',
    ],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    ignores: [
      '**/.nx/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.js',
    ],
  },
];
