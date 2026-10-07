import { RingError, classifyHttpError } from './errors.js';

/**
 * Server-to-server Ring client (spec v7 sec. 4, 19, 24).
 *
 * The token is supplied by a provider function and is never stored, logged, or
 * returned. It exists in memory for the life of a request only, so a dump of the
 * database or the logs cannot contain it.
 */

export interface RingTokenProvider {
  /** Returns the current token, or null when no session is connected. */
  getToken(): string | null;
}

export interface RingClientOptions {
  baseUrl: string;
  tokenProvider: RingTokenProvider;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RingResponse<T> {
  body: T;
  /**
   * Observed offset between the provider's HTTP `Date` header and our clock, in
   * milliseconds. Diagnostics only - provider event timestamps are never
   * rewritten with it (spec sec. 8.5).
   */
  clockOffsetMs: number | null;
}

export class RingClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: RingTokenProvider;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RingClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.tokenProvider = options.tokenProvider;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Resolves a URL that may be absolute or a site-relative `links.next`.
   *
   * A next URL pointing at another host is refused: following provider-supplied
   * links blindly would let a malformed or hostile response redirect our
   * authenticated requests, token attached.
   */
  resolveUrl(pathOrUrl: string): string {
    if (!/^https?:\/\//i.test(pathOrUrl)) {
      return `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    }
    const target = new URL(pathOrUrl);
    const base = new URL(this.baseUrl);
    if (target.origin !== base.origin) {
      throw new RingError(
        'MALFORMED_RESPONSE',
        `Refusing to follow a provider link to a different origin: ${target.origin}`,
      );
    }
    return target.toString();
  }

  async get<T = unknown>(pathOrUrl: string): Promise<RingResponse<T>> {
    const token = this.tokenProvider.getToken();
    if (!token) {
      throw new RingError('RECONNECT_REQUIRED', 'No Ring session is connected.');
    }

    const url = this.resolveUrl(pathOrUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const sentAt = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError';
      throw new RingError(
        'TRANSPORT',
        aborted ? `Ring request timed out after ${this.timeoutMs}ms` : 'Ring request failed',
      );
    } finally {
      clearTimeout(timer);
    }

    const receivedAt = Date.now();
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new RingError('MALFORMED_RESPONSE', 'Ring returned a non-JSON success response');
        }
      }
    }

    if (!response.ok) throw classifyHttpError(response.status, body);

    const dateHeader = response.headers.get('date');
    const serverMs = dateHeader ? Date.parse(dateHeader) : Number.NaN;
    const midpoint = sentAt + (receivedAt - sentAt) / 2;

    return {
      body: body as T,
      clockOffsetMs: Number.isNaN(serverMs) ? null : Math.round(serverMs - midpoint),
    };
  }

  devicesPath(): string {
    return '/v1/devices?include=status,capabilities,location,configurations';
  }

  deviceStatusPath(providerDeviceId: string): string {
    return `/v1/devices/${encodeURIComponent(providerDeviceId)}/status`;
  }

  /**
   * The server-side filter is sent because it costs nothing and may work in
   * other environments, but Day-1 T3 proved it is ignored in Playground, so
   * nothing may depend on it (see `filterEligible`).
   */
  historyPath(providerDeviceId: string, eventType = 'on_demand'): string {
    return `/v1/history/devices/${encodeURIComponent(providerDeviceId)}/events?event_types=${encodeURIComponent(eventType)}`;
  }
}
