/**
 * Ring error classification (spec v7 sec. 10, refined by D-018).
 *
 * The spec lists "403 authorization issue requiring re-link" as a reconnect
 * condition. Day-1 T7 measured two `403` responses that were request-validation
 * failures, not authorization failures:
 *
 *   403 REQUEST_FORBIDDEN        "missing required timestamp fields in request body"
 *   403 TIME_RANGE_NOT_AUTHORIZED "Requested time range is not within authorized boundaries"
 *
 * Classifying on status alone would tell an operator to reconnect when the
 * connection is fine. So we classify on `errors[].code` first and fall back to
 * the status.
 *
 * Nothing in this file is ever negative evidence about a site. Every value of
 * `RingErrorKind` maps to either an integration overlay or a request bug.
 */

export type RingErrorKind =
  /** Token expired/invalid, or an authorization problem that needs a re-link. */
  | 'RECONNECT_REQUIRED'
  /** Throttled. An integration condition, not evidence. */
  | 'RATE_LIMITED'
  /** Our request was wrong. A bug on our side, never shown as "reconnect". */
  | 'REQUEST_INVALID'
  /** Provider has no media/record for the request. Not applicable to readiness. */
  | 'NOT_FOUND'
  /** Network failure, timeout, or 5xx. */
  | 'TRANSPORT'
  /** Response did not match the expected schema (sec. 24). */
  | 'MALFORMED_RESPONSE';

export class RingError extends Error {
  constructor(
    readonly kind: RingErrorKind,
    message: string,
    readonly detail?: { status?: number; code?: string; requestId?: string },
  ) {
    super(message);
    this.name = 'RingError';
  }

  /**
   * True when this condition should raise the RECONNECT_REQUIRED overlay.
   *
   * A request bug is deliberately excluded: showing "reconnect needed" for our
   * own malformed request would be a lie to the operator.
   */
  get setsReconnectOverlay(): boolean {
    return (
      this.kind === 'RECONNECT_REQUIRED' ||
      this.kind === 'RATE_LIMITED' ||
      this.kind === 'TRANSPORT' ||
      this.kind === 'MALFORMED_RESPONSE'
    );
  }

  /** Always false. No provider error is ever evidence about a site (sec. 10). */
  get isNegativeSiteEvidence(): false {
    return false;
  }
}

/**
 * Provider error codes measured on Day-1 that arrive with `403` but mean
 * "your request was wrong", not "your authorization failed".
 */
const VALIDATION_CODES = new Set(['REQUEST_FORBIDDEN', 'TIME_RANGE_NOT_AUTHORIZED']);

/** Codes that genuinely indicate the link to Ring must be re-established. */
const RECONNECT_CODES = new Set([
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'UNAUTHORIZED',
  'AUTHORIZATION_REVOKED',
]);

const NOT_FOUND_CODES = new Set(['MEDIA_NOT_FOUND', 'RESOURCE_NOT_FOUND']);

export interface ProviderErrorBody {
  errors?: { id?: string; status?: string; code?: string; detail?: string }[];
}

/**
 * Maps an HTTP response to a RingError.
 *
 * Order matters: the provider's own code wins, because the Day-1 evidence shows
 * the status is ambiguous.
 */
export function classifyHttpError(status: number, body: unknown): RingError {
  const parsed = body as ProviderErrorBody | null;
  const first = parsed?.errors?.[0];
  const code = first?.code;
  const detail = { status, code, requestId: first?.id };
  const message = first?.detail ?? `Ring request failed with HTTP ${status}`;

  if (code) {
    if (RECONNECT_CODES.has(code)) return new RingError('RECONNECT_REQUIRED', message, detail);
    if (VALIDATION_CODES.has(code)) return new RingError('REQUEST_INVALID', message, detail);
    if (NOT_FOUND_CODES.has(code)) return new RingError('NOT_FOUND', message, detail);
  }

  // 401 was measured as a clean, unambiguous auth failure (T1).
  if (status === 401) return new RingError('RECONNECT_REQUIRED', message, detail);
  if (status === 429) return new RingError('RATE_LIMITED', message, detail);
  if (status === 404 || status === 416) return new RingError('NOT_FOUND', message, detail);

  // An unrecognised 403 keeps the spec's default reading. Only the codes measured
  // on Day-1 are downgraded to REQUEST_INVALID above.
  if (status === 403) return new RingError('RECONNECT_REQUIRED', message, detail);

  if (status >= 500) return new RingError('TRANSPORT', message, detail);
  if (status >= 400) return new RingError('REQUEST_INVALID', message, detail);

  return new RingError('TRANSPORT', message, detail);
}
