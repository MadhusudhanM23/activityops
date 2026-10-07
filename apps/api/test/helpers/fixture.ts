import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/db/migrate.js';

/**
 * In-memory fixture with one site, one device and a mixed checklist:
 * a Ring-backed required check, a non-Ring required check, and a non-Ring
 * optional check. Mirrors the "realistic operational checklist" of spec sec. 6.
 */
export interface Fixture {
  db: DatabaseSync;
  siteId: string;
  deviceId: string;
  providerDeviceId: string;
  templateId: string;
  runId: string;
  ringCheckId: string;
  nonRingCheckId: string;
  optionalCheckId: string;
}

export const T0 = new Date('2026-10-07T09:00:00.000Z');

export function at(secondsFromT0: number): Date {
  return new Date(T0.getTime() + secondsFromT0 * 1000);
}

export function makeFixture(): Fixture {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);

  const siteId = randomUUID();
  const deviceId = randomUUID();
  const providerDeviceId = 'synthetic-device-0001';
  const templateId = randomUUID();
  const runId = randomUUID();
  const ringCheckId = randomUUID();
  const nonRingCheckId = randomUUID();
  const optionalCheckId = randomUUID();

  db.prepare('INSERT INTO site (id, name, timezone) VALUES (?, ?, ?)').run(
    siteId,
    'Demo site',
    'Europe/London',
  );
  db.prepare(
    'INSERT INTO device (id, site_id, provider_device_id, label, required_for_open, status, last_status_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
  ).run(deviceId, siteId, providerDeviceId, 'Front entrance', 'AVAILABLE', T0.toISOString());
  db.prepare(
    'INSERT INTO verification_template (id, site_id, name, trigger_type) VALUES (?, ?, ?, ?)',
  ).run(templateId, siteId, 'Opening readiness', 'OPENING');

  const insertCheck = db.prepare(
    'INSERT INTO verification_check (id, template_id, device_id, label, requirement_type, required, session_window_seconds, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  insertCheck.run(ringCheckId, templateId, deviceId, 'Front entrance walkthrough', 'RING_REQUIRED', 1, 600, 1);
  insertCheck.run(nonRingCheckId, templateId, null, 'Alarm panel armed', 'NON_RING', 1, 600, 2);
  insertCheck.run(optionalCheckId, templateId, null, 'Stockroom inspection', 'NON_RING', 0, 600, 3);

  db.prepare('INSERT INTO verification_run (id, template_id) VALUES (?, ?)').run(runId, templateId);

  return {
    db,
    siteId,
    deviceId,
    providerDeviceId,
    templateId,
    runId,
    ringCheckId,
    nonRingCheckId,
    optionalCheckId,
  };
}

export interface SeedEventOptions {
  startAt: Date;
  eventType?: string;
  isAmbiguous?: boolean;
  deviceId?: string;
  isSimulated?: boolean;
}

export function seedRingEvent(fx: Fixture, options: SeedEventOptions): string {
  const id = randomUUID();
  fx.db
    .prepare(
      'INSERT INTO ring_event (id, provider_event_id, device_id, event_type, start_at, is_simulated, is_ambiguous, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      `synthetic-event-${id.slice(0, 8)}`,
      options.deviceId ?? fx.deviceId,
      options.eventType ?? 'on_demand',
      options.startAt.toISOString(),
      options.isSimulated === false ? 0 : 1,
      options.isAmbiguous ? 1 : 0,
      options.startAt.toISOString(),
    );
  return id;
}

/** Records that a sync covered an attempt's whole window (sec. 9.4). */
export function seedCoverage(fx: Fixture, attemptId: string, reachedOlder = true): void {
  fx.db
    .prepare(
      'INSERT INTO sync_coverage (id, device_id, attempt_id, covered_from, covered_to, synced_at, reached_older) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      randomUUID(),
      fx.deviceId,
      attemptId,
      T0.toISOString(),
      at(600).toISOString(),
      at(700).toISOString(),
      reachedOlder ? 1 : 0,
    );
}
