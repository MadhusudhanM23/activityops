/**
 * Fixed-window rate limiting (spec v7 sec. 24: "Authentication and rate limiting
 * on Ring sync and AI routes").
 *
 * In memory, single instance - matching the single-EC2 deployment. A shared
 * store would only be needed with more than one app instance, which the spec
 * deliberately rules out.
 */
export interface RateRule {
  /** Maximum requests per window. */
  limit: number;
  windowMs: number;
}

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  readonly #windows = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, rule: RateRule): RateDecision {
    const now = this.now();
    const current = this.#windows.get(key);

    if (!current || now - current.startedAt >= rule.windowMs) {
      this.#windows.set(key, { startedAt: now, count: 1 });
      this.#prune(now, rule.windowMs);
      return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
    }

    if (current.count >= rule.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + rule.windowMs - now) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true, remaining: rule.limit - current.count, retryAfterSeconds: 0 };
  }

  /** Bounds memory: expired windows are dropped opportunistically. */
  #prune(now: number, windowMs: number): void {
    if (this.#windows.size < 5000) return;
    for (const [key, window] of this.#windows) {
      if (now - window.startedAt >= windowMs) this.#windows.delete(key);
    }
  }
}

export const RATE_RULES = {
  /** Slows password guessing against the published demo login. */
  login: { limit: 10, windowMs: 60_000 },
  /** Each connect calls Ring discovery. */
  ringConnect: { limit: 6, windowMs: 60_000 },
  /** Each sync makes several provider calls. */
  ringSync: { limit: 30, windowMs: 60_000 },
  /** Bedrock invocations cost money and have account quotas (sec. 17). */
  ai: { limit: 10, windowMs: 60_000 },
  /** Destructive; there is no legitimate reason to repeat it quickly. */
  deleteAll: { limit: 3, windowMs: 60_000 },
} satisfies Record<string, RateRule>;
