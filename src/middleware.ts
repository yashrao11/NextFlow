import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Clerk route matcher declaration.
 * Defines which routes are publicly accessible without authentication.
 * 1. '/sign-in(.*)' allows sign-in routes and their sub-paths.
 * 2. '/sign-up(.*)' allows sign-up routes and their sub-paths.
 * 3. '/api/clerk-webhook(.*)' allows Clerk webhooks to receive payloads without auth.
 */
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/clerk-webhook(.*)',
  '/api/workflows/run(.*)',
  '/api/runs(.*)',
]);

/**
 * Default Clerk middleware configuration.
 * Intercepts incoming requests and protects non-public routes.
 * If a route is not matched as public, `auth().protect()` will enforce Clerk login.
 */
export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) {
    auth().protect();
  }
});

/**
 * Next.js Middleware matcher configuration.
 * Ensures the middleware runs for all page routes and API routes,
 * while efficiently skipping static files and Next.js internals.
 */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.[\\w]+$).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};

