import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError, ERR } from '../domain/errors.js';
import { RingError } from '../ring/errors.js';
import { AuthRequired } from './context.js';

/**
 * Maps domain and integration failures to HTTP.
 *
 * A Ring integration failure is reported with its kind and the integration
 * state, so the UI can show "Reconnect needed" - and is never phrased as
 * anything about the site (spec sec. 10). Error bodies never echo request
 * input, so a token pasted into the connect form cannot leak back out.
 */

const DOMAIN_STATUS: Record<string, number> = {
  [ERR.NOT_FOUND]: 404,
  [ERR.OVERRIDE_REASON_REQUIRED]: 422,
  [ERR.RESOLUTION_APPROVER_REQUIRED]: 422,
  [ERR.RING_TOKEN_EXPIRED]: 422,
};

const RING_STATUS: Record<string, number> = {
  RECONNECT_REQUIRED: 409,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  TRANSPORT: 502,
  MALFORMED_RESPONSE: 502,
  // Our own malformed request: a server-side bug, not the operator's problem.
  REQUEST_INVALID: 500,
};

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AuthRequired) {
    reply.status(401).send({ error: 'AUTH_REQUIRED', message: error.message });
    return;
  }

  if (error instanceof DomainError) {
    reply.status(DOMAIN_STATUS[error.code] ?? 409).send({ error: error.code, message: error.message });
    return;
  }

  if (error instanceof RingError) {
    reply.status(RING_STATUS[error.kind] ?? 502).send({
      error: `RING_${error.kind}`,
      message:
        error.kind === 'RECONNECT_REQUIRED'
          ? 'Reconnect needed. Ring sync is unavailable - this is an integration problem, not evidence about the site.'
          : error.kind === 'REQUEST_INVALID'
            ? 'ActivityOps sent Ring a request it rejected. This is a defect on our side, not a connection problem.'
            : 'Ring sync unavailable. This is an integration problem, not evidence about the site.',
      setsReconnectOverlay: error.setsReconnectOverlay,
      providerCode: error.detail?.code ?? null,
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'VALIDATION_FAILED',
      // Paths only - never the received values.
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  const status = (error as FastifyError).statusCode ?? 500;
  if (status >= 500) request.log.error({ err: { message: error.message, name: error.name } }, 'request failed');
  reply.status(status).send({ error: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST', message: status >= 500 ? 'Unexpected error' : error.message });
}
