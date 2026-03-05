#!/usr/bin/env node
/**
 * Post-build bundler for NestJS services.
 *
 * After `@nx/js:swc` compiles TypeScript → CJS JS (with decorator metadata),
 * this script uses esbuild to bundle each service's dist into a single
 * self-contained main.js that Docker can run without node_modules.
 *
 * Usage: node bundle-services.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVICES = ['api-gateway', 'game-service', 'combat-service', 'leaderboard-service'];

for (const service of SERVICES) {
  const entryPoint = join(__dirname, `dist/apps/${service}/src/main.js`);
  const outfile = join(__dirname, `dist/apps/${service}/main.js`);
  // pnpm puts app-specific deps in apps/{service}/node_modules and shared tools at root.
  const nodePaths = [
    join(__dirname, `apps/${service}/node_modules`),
    join(__dirname, 'node_modules'),
  ];

  console.log(`Bundling ${service}...`);
  try {
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile,
      logLevel: 'warning',
      // Preserve class names so reflect-metadata works correctly
      keepNames: true,
      // Allow esbuild to resolve modules from the app's own node_modules (pnpm workspace)
      absWorkingDir: __dirname,
      nodePaths,
      // Allow overwriting existing output file
      allowOverwrite: true,
      // NestJS optionally requires these packages at runtime via try/catch.
      // Marking them external prevents bundling errors for uninstalled optional deps.
      external: [
        '@nestjs/microservices',
        '@nestjs/microservices/microservices-module',
        '@nestjs/websockets/socket-module',
        '@mikro-orm/core',
        '@nestjs/mongoose',
        '@nestjs/sequelize',
        '@nestjs/typeorm',
        '@nestjs/typeorm/dist/common/typeorm.utils',
        'class-transformer/storage',
        'cache-manager',
      ],
    });
    console.log(`  ✓ dist/apps/${service}/main.js`);
  } catch (err) {
    console.error(`  ✗ ${service}: ${err.message}`);
    process.exit(1);
  }
}

console.log('Bundle complete.');
