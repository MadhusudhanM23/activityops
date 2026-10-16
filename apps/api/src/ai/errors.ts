/**
 * AI availability errors.
 *
 * Every failure to reach a model - missing AWS credentials, model access not
 * granted, a wrong model id, throttling, a network problem - becomes one of a
 * few safe kinds. The client sees the kind and a fixed sentence; it never sees
 * AWS error text, account ids, ARNs or request ids.
 *
 * None of these ever affects readiness: readiness is computed deterministically
 * and does not call the AI at all (spec sec. 17).
 */

export type AiUnavailableKind =
  | 'NO_CREDENTIALS' // the AWS SDK credential chain found nothing
  | 'ACCESS_DENIED' // credentials exist but lack bedrock:InvokeModel, or model access not granted
  | 'MODEL_NOT_FOUND' // the configured model id or region is wrong or not offered
  | 'THROTTLED' // quota or rate limit
  | 'NETWORK' // DNS, connection or socket failure
  | 'TIMEOUT' // the request or the whole run took too long
  | 'PROVIDER_ERROR'; // anything else from the model provider

const MESSAGES: Record<AiUnavailableKind, string> = {
  NO_CREDENTIALS: 'The AI assistant has no AWS credentials on this server.',
  ACCESS_DENIED: 'The AI assistant is not permitted to use the configured Bedrock model. Model access or IAM permissions are missing.',
  MODEL_NOT_FOUND: 'The configured Bedrock model is not available in the configured region.',
  THROTTLED: 'The AI assistant is busy. Try again in a minute.',
  NETWORK: 'The AI assistant could not reach Amazon Bedrock.',
  TIMEOUT: 'The AI assistant took too long to respond.',
  PROVIDER_ERROR: 'The AI assistant is unavailable right now.',
};

export class AiUnavailableError extends Error {
  constructor(readonly kind: AiUnavailableKind) {
    super(MESSAGES[kind]);
    this.name = 'AiUnavailableError';
  }
}

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  /** HTTP status on non-AWS SDK errors (Google GenAI, OpenAI). */
  status?: unknown;
  $metadata?: { httpStatusCode?: number };
}

/** The error and everything it wraps - Strands wraps AWS SDK errors in its own. */
function chain(error: unknown): ErrorLike[] {
  const out: ErrorLike[] = [];
  let current: unknown = error;
  while (current && typeof current === 'object' && out.length < 8) {
    out.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return out;
}

const NETWORK_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE']);

export function classifyAiError(error: unknown): AiUnavailableError {
  if (error instanceof AiUnavailableError) return error;
  const links = chain(error);
  const names = links.map((e) => String(e.name ?? ''));
  const codes = links.map((e) => String(e.code ?? ''));
  const text = links.map((e) => String(e.message ?? '')).join(' ').toLowerCase();
  const has = (...candidates: string[]) => candidates.some((c) => names.includes(c));
  const statuses = links.map((e) => Number(e.status ?? e.$metadata?.httpStatusCode ?? 0));
  const status = (...candidates: number[]) => candidates.some((c) => statuses.includes(c));

  if (has('CredentialsProviderError', 'ExpiredTokenException', 'UnrecognizedClientException', 'InvalidSignatureException') ||
      text.includes('could not load credentials')) {
    return new AiUnavailableError('NO_CREDENTIALS');
  }
  // Non-AWS providers (Gemini, OpenAI-compatible) report by HTTP status.
  if (text.includes('api key not valid') || text.includes('api key is required') || status(401)) {
    return new AiUnavailableError('NO_CREDENTIALS');
  }
  if (status(429)) return new AiUnavailableError('THROTTLED');
  if (status(403)) return new AiUnavailableError('ACCESS_DENIED');
  if (status(404)) return new AiUnavailableError('MODEL_NOT_FOUND');
  if (has('AccessDeniedException')) return new AiUnavailableError('ACCESS_DENIED');
  if (has('ResourceNotFoundException') ||
      (has('ValidationException') && (text.includes('model identifier') || text.includes('model id')))) {
    return new AiUnavailableError('MODEL_NOT_FOUND');
  }
  if (has('ThrottlingException', 'ServiceQuotaExceededException', 'ModelThrottledError', 'TooManyRequestsException')) {
    return new AiUnavailableError('THROTTLED');
  }
  if (has('TimeoutError', 'ModelTimeoutException', 'AbortError', 'CancelledError') || codes.includes('ETIMEDOUT')) {
    return new AiUnavailableError('TIMEOUT');
  }
  if (codes.some((c) => NETWORK_CODES.has(c)) || text.includes('fetch failed')) return new AiUnavailableError('NETWORK');
  return new AiUnavailableError('PROVIDER_ERROR');
}
