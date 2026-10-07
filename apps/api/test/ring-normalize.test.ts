import { describe, expect, it } from 'vitest';
import {
  filterEligible,
  normalizeDeviceList,
  normalizeDeviceStatus,
  normalizeHistoryPage,
} from '../src/ring/normalize.js';
import { RingError } from '../src/ring/errors.js';
import { DEVICE_A, DEVICE_B, emptyHistoryPage, realDeviceList, realHistoryPage, syntheticEvent } from './fixtures/ring.js';

describe('device normalization (measured JSON:API envelope)', () => {
  it('reads the device and its side-loaded status', () => {
    const devices = normalizeDeviceList(realDeviceList);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      providerDeviceId: DEVICE_A,
      label: 'Playground Device',
      status: 'UNAVAILABLE', // online: false, as measured
      lastStatusAt: '2026-10-07T11:19:11Z',
    });
  });

  it('reports UNKNOWN - not UNAVAILABLE - when status is absent', () => {
    const withoutStatus = { ...realDeviceList, included: [] };
    expect(normalizeDeviceList(withoutStatus)[0]?.status).toBe('UNKNOWN');
  });

  it('maps online: true to AVAILABLE', () => {
    const online = {
      ...realDeviceList,
      included: [{ type: 'device-status', id: 'status-1', attributes: { online: true } }],
    };
    expect(normalizeDeviceList(online)[0]?.status).toBe('AVAILABLE');
  });

  it('normalizes a standalone status response', () => {
    const result = normalizeDeviceStatus({
      data: { type: 'device-status', id: 's', attributes: { online: false, reported_at: '2026-10-07T11:19:11Z' } },
    });
    expect(result).toEqual({ status: 'UNAVAILABLE', lastStatusAt: '2026-10-07T11:19:11Z' });
  });

  it('rejects a response that does not match the envelope', () => {
    expect(() => normalizeDeviceList({ devices: [{ id: 'x' }] })).toThrowError(
      expect.objectContaining({ kind: 'MALFORMED_RESPONSE' }),
    );
  });
});

describe('history normalization', () => {
  it('converts epoch milliseconds to ISO and resolves the source device', () => {
    const page = normalizeHistoryPage(realHistoryPage);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toMatchObject({
      eventType: 'on_demand',
      providerDeviceId: DEVICE_A,
      startAt: new Date(1791372135600).toISOString(),
      endAt: new Date(1791372885600).toISOString(),
      startMs: 1791372135600,
    });
  });

  it('treats a missing links key as end of list, not as an error', () => {
    expect(normalizeHistoryPage(realHistoryPage).nextUrl).toBeNull();
    expect(normalizeHistoryPage(emptyHistoryPage).events).toEqual([]);
  });

  it('reads links.next when present', () => {
    const page = normalizeHistoryPage({ data: [], links: { next: '/v1/history?page=2' } });
    expect(page.nextUrl).toBe('/v1/history?page=2');
  });

  it('rejects an ISO timestamp where epoch milliseconds are expected', () => {
    // Guards the exact mistake the Day-1 gate prevented: coding to the
    // documented shape instead of the measured one.
    const wrong = { data: [{ ...syntheticEvent({ id: 'e1', startMs: 0 }), attributes: { event_type: 'on_demand', start: '2026-10-07T11:22:15Z' } }] };
    expect(() => normalizeHistoryPage(wrong)).toThrowError(RingError);
  });

  it('rejects an event with no event_type', () => {
    const wrong = { data: [{ type: 'history-events', id: 'e1', attributes: { start: 1 } }] };
    expect(() => normalizeHistoryPage(wrong)).toThrowError(
      expect.objectContaining({ kind: 'MALFORMED_RESPONSE' }),
    );
  });

  it('keeps a null device binding rather than inventing one', () => {
    const orphan = { data: [{ type: 'history-events', id: 'e1', attributes: { event_type: 'on_demand', start: 1791372135600 } }] };
    expect(normalizeHistoryPage(orphan).events[0]?.providerDeviceId).toBeNull();
  });
});

describe('client-side filtering is authoritative (Day-1 T3)', () => {
  const events = normalizeHistoryPage({
    data: [
      syntheticEvent({ id: 'a', startMs: 1000, eventType: 'on_demand', deviceId: DEVICE_A }),
      syntheticEvent({ id: 'b', startMs: 2000, eventType: 'motion', deviceId: DEVICE_A }),
      syntheticEvent({ id: 'c', startMs: 3000, eventType: 'on_demand', deviceId: DEVICE_B }),
      syntheticEvent({ id: 'd', startMs: 4000, eventType: 'ding', deviceId: DEVICE_B }),
    ],
  }).events;

  it('drops the wrong event type even though the server was asked to filter', () => {
    const result = filterEligible(events, DEVICE_A);
    expect(result.map((e) => e.providerEventId)).toEqual(['a']);
  });

  it('drops events belonging to another device (no cross-device matching)', () => {
    expect(filterEligible(events, DEVICE_B).map((e) => e.providerEventId)).toEqual(['c']);
  });

  it('returns nothing for a device with no eligible events', () => {
    expect(filterEligible(events, 'ava1.ring.device.NOBODY')).toEqual([]);
  });
});
