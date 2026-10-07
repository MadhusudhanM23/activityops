/**
 * Ring provider fixtures.
 *
 * `realHistoryPage` and `realDeviceList` are the SHAPE actually returned by the
 * Ring Partner API on 2026-10-07 (Day-1 T2/T3), with identifiers replaced by
 * synthetic aliases. See `evidence/day-1/provider-payload-redacted.json` and
 * `evidence/day-1/T2-devices-redacted.json`.
 *
 * The multi-page fixtures are SYNTHETIC. Real provider pagination remains
 * unverified (T4 inconclusive), so tests built on them prove our algorithm, not
 * Ring's behaviour, and must not be described as provider evidence.
 */

export const DEVICE_A = 'ava1.ring.device.SYNTHETIC0000000000000000000000000000000000000000AAAA';
export const DEVICE_B = 'ava1.ring.device.SYNTHETIC0000000000000000000000000000000000000000BBBB';

/** Observed envelope: data + included + meta, status side-loaded. */
export const realDeviceList = {
  data: [
    {
      type: 'devices',
      id: DEVICE_A,
      attributes: { name: 'Playground Device', image_url: 'https://example.invalid/device.png' },
      relationships: {
        capabilities: { data: { type: 'device-capabilities', id: 'cap-1' } },
        configurations: { data: { type: 'device-configurations', id: 'conf-1' } },
        status: { data: { type: 'device-status', id: 'status-1' } },
        location: { data: { type: 'locations', id: 'loc-1' } },
      },
    },
  ],
  included: [
    { type: 'locations', id: 'loc-1', attributes: { state: 'CA', country: 'US' } },
    {
      type: 'device-status',
      id: 'status-1',
      // Measured on Day-1: the Playground device was offline.
      attributes: { online: false, reported_at: '2026-10-07T11:19:11Z', state: null },
    },
  ],
  meta: { time: '2026-10-07T11:20:40Z' },
};

/**
 * The real on_demand record. Note `start`/`end` are epoch milliseconds and the
 * device binding is under relationships.source.data.id.
 *
 * Also note `end` lies after `start` by 750s - on Day-1 this record was visible
 * while its own window was still open.
 */
export const realHistoryPage = {
  data: [
    {
      type: 'history-events',
      id: 'ava1.ring.history.event.SYNTHETIC000000000000000000000000000000000001',
      attributes: {
        end: 1791372885600,
        is_third_party_reviewed: true,
        start: 1791372135600,
        event_type: 'on_demand',
      },
      relationships: {
        cv_detections: { data: [] },
        source: { data: { type: 'devices', id: DEVICE_A } },
      },
      meta: { riid: null },
    },
  ],
  // No `links` key at all - measured in T4 when the result fits on one page.
};

export const emptyHistoryPage = { data: [] };

export interface SyntheticEventSpec {
  id: string;
  startMs: number;
  endMs?: number | null;
  eventType?: string;
  deviceId?: string;
}

export function syntheticEvent(spec: SyntheticEventSpec) {
  return {
    type: 'history-events',
    id: spec.id,
    attributes: {
      start: spec.startMs,
      end: spec.endMs === undefined ? spec.startMs + 60_000 : spec.endMs,
      event_type: spec.eventType ?? 'on_demand',
      is_third_party_reviewed: true,
    },
    relationships: {
      cv_detections: { data: [] },
      source: { data: { type: 'devices', id: spec.deviceId ?? DEVICE_A } },
    },
  };
}

/** SYNTHETIC multi-page envelope. Proves our traversal, not Ring's. */
export function syntheticPage(events: SyntheticEventSpec[], nextUrl: string | null) {
  const page: Record<string, unknown> = { data: events.map(syntheticEvent) };
  if (nextUrl !== null) page['links'] = { next: nextUrl };
  return page;
}

/** Minimal stub of the fetch surface the client uses. */
export function stubFetch(
  routes: (url: string) => { status?: number; body: unknown; headers?: Record<string, string> },
): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    const route = routes(url);
    const status = route.status ?? 200;
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', ...(route.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
