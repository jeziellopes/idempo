import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@idempo/contracts'],
  // Required for Docker: produces a self-contained standalone build with its own
  // node_modules — no full workspace tree needed at container runtime.
  output: 'standalone',
};

export default nextConfig;
