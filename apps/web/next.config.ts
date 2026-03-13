import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@idempo/contracts'],
  // Required for Docker: produces a self-contained standalone build with its own
  // node_modules — no full workspace tree needed at container runtime.
  output: 'standalone',
  // Tell Next.js where the monorepo root is so standalone output uses relative
  // paths (apps/web/...) instead of absolute paths (/lab/idempo/apps/web/...)
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // /api/* is proxied at runtime via app/api/[...path]/route.ts so that
  // API_GATEWAY_URL is read from process.env on every request (not baked in
  // at build time as rewrites() would do).
};

export default nextConfig;
