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
  /**
   * Server-side reverse proxy for /api/*.
   * All browser requests to /api/* are forwarded to the API gateway.
   * This allows a single public hostname (ngrok or production domain) to
   * serve both the web UI and the API without CORS or cookie domain issues.
   * API_GATEWAY_URL is a server-only var (not NEXT_PUBLIC_) since the rewrite
   * runs on the Next.js server, not in the browser.
   */
  async rewrites() {
    const apiGatewayUrl = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiGatewayUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
