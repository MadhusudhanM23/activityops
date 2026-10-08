import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAudit } from '../../domain/audit.js';
import { RATE_RULES } from '../../security/rateLimit.js';
import { SESSION_COOKIE, checkCredentials } from '../../security/sessions.js';
import { type AppContext, withinLimit } from '../context.js';
import { sessionCookieOptions } from '../security.js';

const loginBody = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

export function sessionRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/session', async (request) =>
    request.session
      ? { authenticated: true, user: request.session.user, csrfToken: request.session.csrfToken }
      : { authenticated: false, user: null, csrfToken: null },
  );

  app.post('/api/session/login', async (request, reply) => {
    if (!withinLimit(ctx, request, reply, 'login', RATE_RULES.login)) return reply;
    const { username, password } = loginBody.parse(request.body);

    if (!checkCredentials(username, password, ctx.settings.credentials)) {
      // Never record the attempted username: people type passwords into it.
      writeAudit(ctx.db, {
        actor: 'anonymous',
        action: 'LOGIN_FAILED',
        entityType: 'session',
        entityId: 'login',
        at: ctx.now(),
      });
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'That username and password do not match.' });
    }

    // Rotate: any session id the browser already held is discarded.
    ctx.sessions.destroy(request.cookies[SESSION_COOKIE]);
    const session = ctx.sessions.create(ctx.settings.credentials.username);
    reply.setCookie(SESSION_COOKIE, session.id, sessionCookieOptions(ctx.settings.cookieSecure));
    writeAudit(ctx.db, {
      actor: session.user,
      action: 'LOGIN',
      entityType: 'session',
      entityId: session.user,
      at: ctx.now(),
    });
    return { authenticated: true, user: session.user, csrfToken: session.csrfToken };
  });

  app.post('/api/session/logout', async (request, reply) => {
    if (request.session) {
      writeAudit(ctx.db, {
        actor: request.session.user,
        action: 'LOGOUT',
        entityType: 'session',
        entityId: request.session.user,
        at: ctx.now(),
      });
    }
    ctx.sessions.destroy(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(ctx.settings.cookieSecure));
    return { authenticated: false };
  });
}
