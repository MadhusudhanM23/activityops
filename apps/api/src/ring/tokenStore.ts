import type { RingTokenProvider } from './client.js';

/**
 * Ring session token held in memory only (spec v7 sec. 19, 24).
 *
 * Never written to SQLite, never logged, never serialized into any response.
 * Process restart drops it, which is correct: a Playground token lives about
 * 30 minutes anyway and the judge flow is built around reconnecting.
 */
export class RingTokenStore implements RingTokenProvider {
  #token: string | null = null;
  #expiresAt: Date | null = null;
  #connectedAt: Date | null = null;

  /**
   * @param expiresAt when known. Playground tokens are JWTs carrying `exp`, but
   * the claim is read by the caller - this store does not parse tokens.
   */
  set(token: string, now: Date, expiresAt: Date | null): void {
    this.#token = token;
    this.#connectedAt = now;
    this.#expiresAt = expiresAt;
  }

  clear(): void {
    this.#token = null;
    this.#expiresAt = null;
    this.#connectedAt = null;
  }

  getToken(): string | null {
    return this.#token;
  }

  isExpired(now: Date): boolean {
    return this.#expiresAt !== null && now.getTime() >= this.#expiresAt.getTime();
  }

  /**
   * Safe to serialize to the browser: reports whether a session exists and when
   * it lapses, never the token itself.
   */
  status(now: Date): {
    connected: boolean;
    expiresAt: string | null;
    connectedAt: string | null;
    secondsRemaining: number | null;
  } {
    const connected = this.#token !== null && !this.isExpired(now);
    const secondsRemaining =
      connected && this.#expiresAt
        ? Math.max(0, Math.round((this.#expiresAt.getTime() - now.getTime()) / 1000))
        : null;
    return {
      connected,
      expiresAt: this.#expiresAt?.toISOString() ?? null,
      connectedAt: this.#connectedAt?.toISOString() ?? null,
      secondsRemaining,
    };
  }
}

/**
 * Reads `exp` from a JWT without verifying it.
 *
 * We are not authenticating the token - Ring does that. This only lets the UI
 * show an honest countdown instead of discovering expiry through a 401.
 * Returns null for anything that is not a readable JWT.
 */
export function readJwtExpiry(token: string): Date | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}
