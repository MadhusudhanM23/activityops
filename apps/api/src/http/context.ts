import type { DatabaseSync } from 'node:sqlite';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { row } from '../db/query.js';
import { DomainError, ERR } from '../domain/errors.js';
import { setIntegrationState } from '../domain/runs.js';
import { RingError } from '../ring/errors.js';
import type { RingClient } from '../ring/client.js';
import type { RingTokenStore } from '../ring/tokenStore.js';
import type { RateLimiter, RateRule } from '../security/rateLimit.js';
import type { Session, SessionStore } from '../security/sessions.js';

/** Settings the HTTP layer needs, separated from process env so tests can set them. */
export interface HttpSettings {
  credentials: { username: string; password: string };
  cookieSecure: boolean;
  trustProxy: boolean;
  webDistPath?: string;
  timing: {
    clockSkewAllowanceSeconds: number;
    sessionWindowSeconds: number;
    demoSessionWindowSeconds: number;
    postWindowObservationMarginSeconds: number;
    historyPageCap: number;
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in session, or null for an anonymous request. */
    session: Session | null;
  }
}

/** Everything a route module needs, built once per app. */
export interface AppContext {
  db: DatabaseSync;
  tokenStore: RingTokenStore;
  ringClient: RingClient;
  sessions: SessionStore;
  limiter: RateLimiter;
  settings: HttpSettings;
  now: () => Date;
}

/** The authenticated actor. Routes that reach this have passed the auth hook. */
export function actor(request: FastifyRequest): string {
  if (!request.session) throw new DomainError(ERR.NOT_FOUND, 'No session');
  return request.session.user;
}

/** Wraps writes in a transaction so a failed step leaves no partial state. */
export function tx<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Raises the RECONNECT_REQUIRED overlay for a Ring integration failure. The
 * stored detail is the error kind only - never a payload, never a token.
 */
export function noteIntegrationFailure(ctx: AppContext, error: unknown): void {
  if (error instanceof RingError && error.setsReconnectOverlay) {
    setIntegrationState(ctx.db, 'RECONNECT_REQUIRED', error.kind, ctx.now());
  }
}

export function runMode(db: DatabaseSync, runId: string): 'LIVE' | 'RECORDED_DEMO' {
  const run = row<{ data_mode: 'LIVE' | 'RECORDED_DEMO' }>(
    db,
    'SELECT data_mode FROM verification_run WHERE id = ?',
    runId,
  );
  if (!run) throw new DomainError(ERR.NOT_FOUND, `No run ${runId}`);
  return run.data_mode;
}

/** A recorded run is immutable in full - at the API, not just in the UI (D-031). */
export function requireLiveRun(db: DatabaseSync, runId: string): void {
  if (runMode(db, runId) !== 'LIVE') {
    throw new DomainError(
      ERR.RUN_TERMINAL,
      'This is a recorded demo run. It is not connected to live Ring data and cannot be synced or changed.',
    );
  }
}

/**
 * Anonymous visitors may read the recorded demo run - that is Review Mode
 * (spec sec. 19) - but never a live run.
 */
export function requireReadable(db: DatabaseSync, request: FastifyRequest, runId: string): void {
  if (request.session) return;
  if (runMode(db, runId) !== 'RECORDED_DEMO') throw new AuthRequired();
}

export class AuthRequired extends Error {
  constructor() {
    super('Sign in to do this.');
    this.name = 'AuthRequired';
  }
}

/**
 * Applies a rate rule keyed by session (or client IP when anonymous).
 * Returns false after sending 429, so the caller can stop.
 */
export function withinLimit(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  name: string,
  rule: RateRule,
): boolean {
  const key = `${name}:${request.session?.id ?? request.ip}`;
  const decision = ctx.limiter.check(key, rule);
  if (decision.allowed) return true;
  reply
    .status(429)
    .header('Retry-After', String(decision.retryAfterSeconds))
    .send({ error: 'RATE_LIMITED', message: `Too many requests. Try again in ${decision.retryAfterSeconds}s.` });
  return false;
}
