import { type NextRequest, NextResponse } from 'next/server';

/**
 * Runtime reverse proxy for /api/*.
 *
 * Forwards every request to the API gateway and streams the response back,
 * including 3xx redirects (redirect: 'manual') so that passport-github2's
 * OAuth initiation redirect reaches the browser intact rather than being
 * followed server-side.
 *
 * API_GATEWAY_URL is read at request time so the Docker env var
 * (http://api-gateway:3001) is picked up correctly without baking the value
 * into the image at build time (which next.config rewrites() would do).
 */

const API_GATEWAY = () => process.env['API_GATEWAY_URL'] ?? 'http://localhost:3001';

// Headers that must not be forwarded upstream or back to the client.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  // Next.js sets its own host header
  'host',
]);

async function proxy(req: NextRequest): Promise<NextResponse> {
  const upstream = `${API_GATEWAY()}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const reqHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) reqHeaders.set(key, value);
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  const upstreamRes = await fetch(upstream, {
    method: req.method,
    headers: reqHeaders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: hasBody ? (req.body as any) : undefined,
    redirect: 'manual', // pass 302s to the browser — critical for OAuth initiation
    // @ts-expect-error — Node.js fetch requires duplex:'half' for streaming request bodies
    duplex: 'half',
    cache: 'no-store',
  });

  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    // Use append for set-cookie so multiple cookies are not collapsed into one.
    if (key.toLowerCase() === 'set-cookie') {
      resHeaders.append(key, value);
    } else {
      resHeaders.set(key, value);
    }
  });

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
