import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { SESSION_COOKIE, safeEqual } from '../security/sessions.js';
import type { AppContext } from './context.js';

/**
 * Request-level security (spec v7 sec. 24).
 *
 * Policy, in order:
 *  1. Attach the session from the httpOnly cookie, if any.
 *  2. Anything under /api is signed-in only, except a short public list and the
 *     read-only Review Mode routes (whose handlers still refuse live runs).
 *  3. Every state-changing request from a session must carry the CSRF token.
 *  4. Every response carries defensive headers; API responses are never cached.
 */

const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/meta',
  'GET /api/session',
  // The data-practices notice must be readable before anyone signs in or connects Ring.
  'GET /api/privacy',
  'POST /api/session/login',
  'POST /api/session/logout',
]);

/**
 * Review Mode reads, named by their REGISTERED route pattern. Handlers still
 * allow anonymous access to the recorded run only.
 */
const PUBLIC_READ = new Set([
  '/api/runs',
  '/api/runs/:runId',
  '/api/runs/:runId/audit',
  '/api/runs/:runId/readiness',
  '/api/runs/:runId/ai',
]);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export async function registerSecurity(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(cookie);
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (request, reply) => {
    request.session = ctx.sessions.get(request.cookies[SESSION_COOKIE]) ?? null;

    // Policy is keyed on the route the router MATCHED, never on the raw URL.
    // The router decodes paths ("/%61pi/x" matches "/api/x"); a check on the raw
    // string can disagree with it, and an earlier version did - anonymous callers
    // reached protected GET handlers that way (LESSONS_LEARNED L-21).
    const route = request.routeOptions.url;
    if (!route?.startsWith('/api/')) return; // static frontend, or no route (404)

    const isPublic =
      PUBLIC.has(`${request.method} ${route}`) || (request.method === 'GET' && PUBLIC_READ.has(route));

    if (!isPublic && !request.session) {
      return reply.status(401).send({ error: 'AUTH_REQUIRED', message: 'Sign in to do this.' });
    }

    // Login has no session yet; everything else that changes state must prove
    // it came from our own page, not a cross-site form.
    if (!SAFE_METHODS.has(request.method) && request.session && route !== '/api/session/login') {
      const header = request.headers['x-csrf-token'];
      if (typeof header !== 'string' || !safeEqual(header, request.session.csrfToken)) {
        return reply.status(403).send({ error: 'CSRF_FAILED', message: 'Missing or invalid request token. Reload the page.' });
      }
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', CSP);
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (request.routeOptions.url?.startsWith('/api/') || request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });
}

export function sessionCookieOptions(secure: boolean) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure,
  };
}
