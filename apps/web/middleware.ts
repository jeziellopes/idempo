import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware — route protection.
 *
 * Reads the httpOnly `accessToken` cookie (set by the API Gateway's JWT layer).
 * Unauthenticated requests to protected routes are redirected to /signin so
 * the user re-authenticates via GitHub OAuth.
 *
 * Public routes (no cookie required): /signin and all Next.js internals.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals, sign-in page, and all API proxy routes through
  // unconditionally. /api/* is proxied server-side to the API gateway via
  // next.config rewrites — the OAuth callback lands here and must NOT be
  // redirected to /signin before it can be handled.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/signin' ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has('accessToken');
  if (!hasSession) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/signin';
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Apply to all routes except static files and Next.js internals.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
