import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RingClient } from './client.js';
import { normalizeDeviceList, type NormalizedDevice } from './normalize.js';
import { row } from '../db/query.js';

/**
 * Dynamic device discovery (spec v7 sec. 2, 20).
 *
 * The device count is whatever the connected account returns - Day-1 measured
 * exactly one - so nothing here assumes a number. Each discovered device gets
 * one RING_REQUIRED check on the live template; the non-Ring checks show that a
 * realistic checklist does not make Ring mandatory for every task (sec. 6).
 */

export const LIVE_SITE_ID = 'site-live-playground';
export const LIVE_TEMPLATE_ID = 'template-live-opening';

const NON_RING_CHECKS = [
  { id: 'check-live-alarm', label: 'Alarm panel disarmed and zones reviewed', required: 1, order: 100 },
  { id: 'check-live-notes', label: 'Previous shift notes reviewed', required: 0, order: 110 },
];

export interface DiscoveryResult {
  devices: NormalizedDevice[];
  templateId: string;
}

export async function discoverDevices(
  db: DatabaseSync,
  client: RingClient,
  now: Date,
  sessionWindowSeconds: number,
): Promise<DiscoveryResult> {
  const response = await client.get(client.devicesPath());
  const devices = normalizeDeviceList(response.body);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO site (id, name, timezone, enabled) VALUES (?, 'Live Playground site', 'UTC', 1)
         ON CONFLICT(id) DO NOTHING`,
    ).run(LIVE_SITE_ID);

    db.prepare(
      `INSERT INTO verification_template (id, site_id, name, trigger_type, enabled)
         VALUES (?, ?, 'Live Playground opening check', 'OPENING', 1)
         ON CONFLICT(id) DO NOTHING`,
    ).run(LIVE_TEMPLATE_ID, LIVE_SITE_ID);

    let order = 1;
    for (const device of devices) {
      const existing = row<{ id: string }>(
        db,
        'SELECT id FROM device WHERE provider_device_id = ?',
        device.providerDeviceId,
      );
      const deviceId = existing?.id ?? randomUUID();

      if (existing) {
        db.prepare('UPDATE device SET label = ?, status = ?, last_status_at = ? WHERE id = ?').run(
          device.label,
          device.status,
          device.lastStatusAt ?? now.toISOString(),
          deviceId,
        );
      } else {
        db.prepare(
          `INSERT INTO device (id, site_id, provider_device_id, label, required_for_open, status, last_status_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          deviceId,
          LIVE_SITE_ID,
          device.providerDeviceId,
          device.label,
          device.status,
          device.lastStatusAt ?? now.toISOString(),
        );
      }

      const checkId = `check-live-ring-${deviceId}`;
      db.prepare(
        `INSERT INTO verification_check
           (id, template_id, device_id, label, requirement_type, required, session_window_seconds, sort_order)
         VALUES (?, ?, ?, ?, 'RING_REQUIRED', 1, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(checkId, LIVE_TEMPLATE_ID, deviceId, `Live view walkthrough - ${device.label}`, sessionWindowSeconds, order);
      order += 1;
    }

    for (const check of NON_RING_CHECKS) {
      db.prepare(
        `INSERT INTO verification_check
           (id, template_id, device_id, label, requirement_type, required, session_window_seconds, sort_order)
         VALUES (?, ?, NULL, ?, 'NON_RING', ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(check.id, LIVE_TEMPLATE_ID, check.label, check.required, sessionWindowSeconds, check.order);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { devices, templateId: LIVE_TEMPLATE_ID };
}
