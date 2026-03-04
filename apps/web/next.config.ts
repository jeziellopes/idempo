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
};

export default nextConfig;
