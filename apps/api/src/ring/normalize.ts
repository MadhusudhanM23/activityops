import { z } from 'zod';
import { RingError } from './errors.js';

/**
 * JSON:API normalization for the Ring Partner API.
 *
 * The shape here is the one MEASURED on 2026-10-07 (Day-1 T2/T3), not the flat
 * shape we had assumed (the documentation landing page lists paths, not
 * response envelopes):
 *
 *   { data: [ { type, id, attributes, relationships } ],
 *     included: [ ... ], meta: { time } }
 *
 * Two details cost real money if got wrong, and both were only learned by
 * calling the API:
 *   - event timestamps are EPOCH MILLISECONDS (`attributes.start`), not ISO strings;
 *   - the device binding lives at `relationships.source.data.id`, not a flat field.
 *
 * Every response is schema-validated before use (spec sec. 24). A response that
 * does not match is an integration error, never an empty result - the difference
 * between "nothing happened" and "we could not tell" is load-bearing (sec. 10).
 */

const resourceIdentifier = z.object({ type: z.string(), id: z.string() });

const relationship = z.object({
  data: z.union([resourceIdentifier, z.array(resourceIdentifier), z.null()]).optional(),
  links: z.object({ related: z.string() }).partial().optional(),
});

const deviceResource = z.object({
  type: z.literal('devices'),
  id: z.string().min(1),
  attributes: z.object({ name: z.string().optional(), image_url: z.string().optional() }).passthrough(),
  relationships: z.record(z.string(), relationship).optional(),
});

const includedResource = z.object({
  type: z.string(),
  id: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const deviceListEnvelope = z.object({
  data: z.array(deviceResource),
  included: z.array(includedResource).optional(),
  meta: z.object({ time: z.string().optional() }).passthrough().optional(),
});

const historyEventResource = z.object({
  type: z.string(),
  id: z.string().min(1),
  attributes: z
    .object({
      event_type: z.string().min(1),
      // Epoch milliseconds, measured. Not an ISO string.
      start: z.number(),
      end: z.number().nullable().optional(),
      is_third_party_reviewed: z.boolean().optional(),
    })
    .passthrough(),
  relationships: z
    .object({ source: relationship.optional() })
    .passthrough()
    .optional(),
});

export const historyEnvelope = z.object({
  data: z.array(historyEventResource),
  // Absent entirely when the result fits on one page (measured in T4), so this
  // must be optional rather than defaulted to an empty object.
  links: z.object({ next: z.string().nullable().optional() }).passthrough().optional(),
  included: z.array(includedResource).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type DeviceStatusValue = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

export interface NormalizedDevice {
  providerDeviceId: string;
  label: string;
  /**
   * UNKNOWN when the provider did not report, which is NOT the same as
   * UNAVAILABLE: only a confirmed-offline device may block a run (sec. 10 Case A).
   */
  status: DeviceStatusValue;
  lastStatusAt: string | null;
}

export interface NormalizedEvent {
  providerEventId: string;
  providerDeviceId: string | null;
  eventType: string;
  /** ISO-8601, converted from epoch milliseconds. */
  startAt: string;
  endAt: string | null;
  /** Raw epoch ms, retained in memory for window comparisons without re-parsing. */
  startMs: number;
  endMs: number | null;
}

function fail(message: string, cause?: unknown): never {
  throw new RingError('MALFORMED_RESPONSE', message, {
    code: cause instanceof z.ZodError ? 'SCHEMA_MISMATCH' : undefined,
  });
}

function toIso(epochMs: number): string {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) fail(`Unusable provider timestamp: ${epochMs}`);
  return date.toISOString();
}

export function normalizeDeviceList(body: unknown): NormalizedDevice[] {
  const parsed = deviceListEnvelope.safeParse(body);
  if (!parsed.success) fail('Device list did not match the expected envelope', parsed.error);

  const included = new Map(parsed.data.included?.map((r) => [`${r.type}:${r.id}`, r]) ?? []);

  return parsed.data.data.map((device) => {
    const statusRef = device.relationships?.['status']?.data;
    const statusId = statusRef && !Array.isArray(statusRef) ? statusRef.id : undefined;
    const statusResource = statusId ? included.get(`device-status:${statusId}`) : undefined;
    const online = statusResource?.attributes?.['online'];
    const reportedAt = statusResource?.attributes?.['reported_at'];

    return {
      providerDeviceId: device.id,
      label: device.attributes.name ?? 'Unnamed device',
      status: online === true ? 'AVAILABLE' : online === false ? 'UNAVAILABLE' : 'UNKNOWN',
      lastStatusAt: typeof reportedAt === 'string' ? reportedAt : null,
    };
  });
}

/** Device status fetched on its own (`GET /v1/devices/{id}/status`). */
export function normalizeDeviceStatus(body: unknown): {
  status: DeviceStatusValue;
  lastStatusAt: string | null;
} {
  const envelope = z.object({
    data: z.object({
      attributes: z
        .object({ online: z.boolean().nullable().optional(), reported_at: z.string().optional() })
        .passthrough(),
    }),
  });
  const parsed = envelope.safeParse(body);
  if (!parsed.success) fail('Device status did not match the expected envelope', parsed.error);

  const { online, reported_at: reportedAt } = parsed.data.data.attributes;
  return {
    status: online === true ? 'AVAILABLE' : online === false ? 'UNAVAILABLE' : 'UNKNOWN',
    lastStatusAt: reportedAt ?? null,
  };
}

export interface NormalizedHistoryPage {
  events: NormalizedEvent[];
  /** Absent when the list ends - measured as a missing `links` key, not an empty one. */
  nextUrl: string | null;
}

export function normalizeHistoryPage(body: unknown): NormalizedHistoryPage {
  const parsed = historyEnvelope.safeParse(body);
  if (!parsed.success) fail('Event history did not match the expected envelope', parsed.error);

  const events = parsed.data.data.map((event): NormalizedEvent => {
    const sourceRef = event.relationships?.source?.data;
    const providerDeviceId = sourceRef && !Array.isArray(sourceRef) ? sourceRef.id : null;
    const endMs = event.attributes.end ?? null;

    return {
      providerEventId: event.id,
      providerDeviceId,
      eventType: event.attributes.event_type,
      startAt: toIso(event.attributes.start),
      endAt: endMs === null ? null : toIso(endMs),
      startMs: event.attributes.start,
      endMs,
    };
  });

  return { events, nextUrl: parsed.data.links?.next ?? null };
}

/**
 * Authoritative client-side filter (spec sec. 8.6, 8.7, 9.2).
 *
 * Day-1 T3 measured that the server IGNORES `event_types`: asking for `motion`
 * returned an `on_demand` record, and asking for a type that does not exist
 * returned `200` with the same record. This filter is therefore the only thing
 * that makes the result correct - it is not a redundant safety net.
 */
export function filterEligible(
  events: readonly NormalizedEvent[],
  providerDeviceId: string,
  eventType = 'on_demand',
): NormalizedEvent[] {
  return events.filter(
    (event) => event.providerDeviceId === providerDeviceId && event.eventType === eventType,
  );
}
