import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { openDatabase } from './db.js';
import type { AppContext, HttpSettings } from './http/context.js';
import { errorHandler } from './http/errors.js';
import { dataRoutes } from './http/routes/data.js';
import { ringRoutes } from './http/routes/ring.js';
import { runRoutes } from './http/routes/runs.js';
import { sessionRoutes } from './http/routes/session.js';
import { registerSecurity } from './http/security.js';
import { RingClient } from './ring/client.js';
import { RingTokenStore } from './ring/tokenStore.js';
import { RateLimiter } from './security/rateLimit.js';
import { SessionStore } from './security/sessions.js';

export interface AppDeps {
  db: DatabaseSync;
  tokenStore: RingTokenStore;
  ringClient: RingClient;
  sessions: SessionStore;
  limiter: RateLimiter;
  now: () => Date;
  settings: HttpSettings;
  /** Whether a Bedrock model is configured. Drives the privacy notice wording. */
  aiEnabled: boolean;
  /** Captures log output. Tests use it to prove secrets never reach the logs. */
  logStream: NodeJS.WritableStream;
}

function defaultSettings(): HttpSettings {
  return {
    credentials: { username: config.DEMO_USERNAME, password: config.DEMO_PASSWORD },
    cookieSecure: config.COOKIE_SECURE,
    trustProxy: config.TRUST_PROXY,
    webDistPath: config.WEB_DIST_PATH,
    timing: {
      clockSkewAllowanceSeconds: config.CLOCK_SKEW_ALLOWANCE_SECONDS,
      sessionWindowSeconds: config.SESSION_WINDOW_SECONDS,
      demoSessionWindowSeconds: config.DEMO_SESSION_WINDOW_SECONDS,
      postWindowObservationMarginSeconds: config.POST_WINDOW_OBSERVATION_MARGIN_SECONDS,
      historyPageCap: config.HISTORY_PAGE_CAP,
    },
  };
}

export async function buildApp(overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const db = overrides.db ?? openDatabase(config.NODE_ENV === 'test' ? ':memory:' : config.DATABASE_PATH);
  migrate(db);
  const tokenStore = overrides.tokenStore ?? new RingTokenStore();
  const now = overrides.now ?? (() => new Date());
  const settings = overrides.settings ?? defaultSettings();

  const ctx: AppContext = {
    db,
    tokenStore,
    ringClient:
      overrides.ringClient ??
      new RingClient({ baseUrl: config.RING_API_BASE_URL ?? 'https://api.amazonvision.com', tokenProvider: tokenStore }),
    sessions: overrides.sessions ?? new SessionStore(config.SESSION_IDLE_MINUTES * 60_000, () => now().getTime()),
    limiter: overrides.limiter ?? new RateLimiter(() => now().getTime()),
    settings,
    now,
  };

  const app = Fastify({
    trustProxy: settings.trustProxy,
    bodyLimit: 64 * 1024,
    logger: {
      level: overrides.logStream ? 'debug' : config.NODE_ENV === 'test' ? 'silent' : 'info',
      ...(overrides.logStream ? { stream: overrides.logStream } : {}),
      // Bodies are never logged (the connect route carries a Ring token), and
      // credentials in headers are redacted.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]'],
    },
  });
  app.setErrorHandler(errorHandler);

  await registerSecurity(app, ctx);
  sessionRoutes(app, ctx);
  runRoutes(app, ctx);
  ringRoutes(app, ctx);
  dataRoutes(app, ctx, overrides.aiEnabled ?? Boolean(config.BEDROCK_MODEL_ID));

  // Production: one process serves the API and the built frontend; Caddy
  // terminates TLS in front of it (spec sec. 18).
  if (settings.webDistPath) {
    const root = resolve(settings.webDistPath);
    if (!existsSync(join(root, 'index.html'))) {
      throw new Error(`WEB_DIST_PATH has no index.html: ${root}`);
    }
    await app.register(fastifyStatic, { root, index: ['index.html'] });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'No such endpoint.' });
      }
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    if (!overrides.db) db.close();
  });

  return app;
}
