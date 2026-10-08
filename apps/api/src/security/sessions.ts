import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Sessions and CSRF (spec v7 sec. 24).
 *
 * - The session id travels only in an httpOnly, SameSite=Strict cookie, so page
 *   script cannot read it.
 * - CSRF uses the synchronizer-token pattern: a per-session token returned in a
 *   JSON body, held by the page in memory, and echoed in a header on every
 *   state-changing request. A cross-site form post can carry the cookie but can
 *   never read or forge the header value.
 * - Sessions live in memory. A restart signs everyone out, which is acceptable
 *   for a single-instance demo and avoids persisting session secrets.
 *
 * There is one login in this build. The UI therefore never implies two-person
 * control (sec. 14); a production version would add role separation.
 */

export interface Session {
  id: string;
  user: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
}

export const SESSION_COOKIE = 'aops_session';

function token(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison that does not leak length via early return. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export class SessionStore {
  readonly #sessions = new Map<string, Session>();

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(user: string): Session {
    const session: Session = {
      id: token(),
      user,
      csrfToken: token(),
      createdAt: this.now(),
      lastSeenAt: this.now(),
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  /** Returns a live session and refreshes its idle timer, or undefined. */
  get(id: string | undefined): Session | undefined {
    if (!id) return undefined;
    const session = this.#sessions.get(id);
    if (!session) return undefined;
    if (this.now() - session.lastSeenAt > this.idleTimeoutMs) {
      this.#sessions.delete(id);
      return undefined;
    }
    session.lastSeenAt = this.now();
    return session;
  }

  destroy(id: string | undefined): void {
    if (id) this.#sessions.delete(id);
  }

  /** Used by Delete All Data: every session ends with the data it could see. */
  clear(): void {
    this.#sessions.clear();
  }
}

/**
 * Checks the demo credentials. Both comparisons run regardless of the first
 * result, so timing does not reveal whether the username was right.
 */
export function checkCredentials(
  username: string,
  password: string,
  expected: { username: string; password: string },
): boolean {
  const userOk = safeEqual(username, expected.username);
  const passOk = safeEqual(password, expected.password);
  return userOk && passOk;
}
