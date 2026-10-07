import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RingClient } from './client.js';
import { RingError } from './errors.js';
import { filterEligible, normalizeHistoryPage, type NormalizedEvent } from './normalize.js';

/**
 * Event History synchronization (spec v7 sec. 9).
 *
 * Every sync starts at page one and follows `links.next`. A stored `next_url` is
 * diagnostic only and is never the resume point, because the list is newest-first
 * and a historical cursor would skip exactly the records we care about (sec. 9.1).
 *
 * This module never calls a media endpoint (sec. 8.9, 15).
 */

export type SyncStopReason =
  | 'REACHED_OLDER_THAN_WINDOW'
  | 'NO_NEXT_LINK'
  | 'PAGE_CAP_REACHED'
  | 'REPEATED_NEXT_URL'
  | 'ALREADY_SEEN_EVENT';

export interface SyncOptions {
  providerDeviceId: string;
  /** Local device row id, used for storage and client-side binding. */
  deviceId: string;
  /** eligible_start - traversal continues until records are older than this. */
  windowStart: Date;
  /** eligible_end - used with the margin to decide coverage (sec. 9.4). */
  windowEnd: Date;
  pageCap: number;
  /** post_window_observation_margin_seconds. PROVISIONAL: unmeasured (T5). */
  observationMarginSeconds: number;
  now: Date;
  eventType?: string;
}

export interface SyncResult {
  pagesFetched: number;
  eventsSeen: number;
  eligibleEventsStored: number;
  stopReason: SyncStopReason;
  /** Traversal passed records older than windowStart, or hit the true end of the list. */
  reachedOlder: boolean;
  /**
   * True only when the sync can be treated as definitive for the window
   * (sec. 9.4). A sync that stopped at the page cap or on a repeated URL is NOT
   * coverage, however many events it saw.
   */
  coversWindow: boolean;
  clockOffsetMs: number | null;
}

function iso(date: Date): string {
  return date.toISOString();
}

/**
 * Stores normalized facts only. The raw provider payload is deliberately not
 * persisted (spec sec. 16) - it never leaves this function.
 */
function upsertEvent(db: DatabaseSync, deviceId: string, event: NormalizedEvent, now: Date): boolean {
  const existing = db
    .prepare('SELECT id FROM ring_event WHERE provider_event_id = ?')
    .get(event.providerEventId) as { id: string } | undefined;

  if (existing) {
    // Opaque provider event ids are the identity (sec. 9.2 step 5). An event we
    // have already claimed must never be rewritten by a later sync.
    db.prepare('UPDATE ring_event SET end_at = COALESCE(?, end_at), observed_at = ? WHERE id = ?').run(
      event.endAt,
      iso(now),
      existing.id,
    );
    return false;
  }

  db.prepare(
    `INSERT INTO ring_event
       (id, provider_event_id, device_id, event_type, start_at, end_at, is_simulated, is_ambiguous,
        normalized_facts, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  ).run(
    randomUUID(),
    event.providerEventId,
    deviceId,
    event.eventType,
    event.startAt,
    event.endAt,
    JSON.stringify({ startMs: event.startMs, endMs: event.endMs }),
    iso(now),
  );
  return true;
}

function recordCursor(
  db: DatabaseSync,
  options: SyncOptions,
  nextUrl: string | null,
  lastEventId: string | null,
  repeatedCount: number,
  syncId: string,
  succeeded: boolean,
): void {
  const existing = db
    .prepare('SELECT id, error_count FROM sync_cursor WHERE device_id = ?')
    .get(options.deviceId) as { id: string; error_count: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE sync_cursor SET next_url = ?, last_observed_event_id = COALESCE(?, last_observed_event_id),
         last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END,
         repeated_next_url_count = ?, error_count = ?, last_sync_id = ? WHERE id = ?`,
    ).run(
      nextUrl,
      lastEventId,
      succeeded ? 1 : 0,
      iso(options.now),
      repeatedCount,
      succeeded ? 0 : existing.error_count + 1,
      syncId,
      existing.id,
    );
    return;
  }

  db.prepare(
    `INSERT INTO sync_cursor (id, device_id, next_url, last_observed_event_id, last_success_at,
       repeated_next_url_count, error_count, last_sync_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    options.deviceId,
    nextUrl,
    lastEventId,
    succeeded ? iso(options.now) : null,
    repeatedCount,
    succeeded ? 0 : 1,
    syncId,
  );
}

export async function syncDeviceHistory(
  db: DatabaseSync,
  client: RingClient,
  options: SyncOptions,
): Promise<SyncResult> {
  const syncId = randomUUID();
  const eventType = options.eventType ?? 'on_demand';
  const windowStartMs = options.windowStart.getTime();

  let url: string | null = client.historyPath(options.providerDeviceId, eventType);
  const visited = new Set<string>();
  let pagesFetched = 0;
  let eventsSeen = 0;
  let eligibleEventsStored = 0;
  let reachedOlder = false;
  let repeatedCount = 0;
  let lastEventId: string | null = null;
  let clockOffsetMs: number | null = null;
  let stopReason: SyncStopReason = 'NO_NEXT_LINK';

  try {
    while (url !== null) {
      if (visited.has(url)) {
        // Guard against a provider that returns a self-referential next link.
        repeatedCount += 1;
        stopReason = 'REPEATED_NEXT_URL';
        break;
      }
      visited.add(url);

      if (pagesFetched >= options.pageCap) {
        stopReason = 'PAGE_CAP_REACHED';
        break;
      }

      const response = await client.get(url);
      clockOffsetMs = response.clockOffsetMs ?? clockOffsetMs;
      pagesFetched += 1;

      const page = normalizeHistoryPage(response.body);
      eventsSeen += page.events.length;

      // Client-side filtering is authoritative: T3 measured that the server
      // ignores event_types entirely.
      for (const event of filterEligible(page.events, options.providerDeviceId, eventType)) {
        if (upsertEvent(db, options.deviceId, event, options.now)) eligibleEventsStored += 1;
        lastEventId ??= event.providerEventId;
      }

      // The list is newest-first, so once a page carries anything older than the
      // window start, everything beyond it is older too (sec. 9.2 step 8).
      if (page.events.some((event) => event.startMs < windowStartMs)) {
        reachedOlder = true;
        stopReason = 'REACHED_OLDER_THAN_WINDOW';
        break;
      }

      if (page.nextUrl === null) {
        // A missing `links` key means the true end of the available list, which
        // also satisfies the coverage condition (sec. 9.4 clause 2). Measured in T4.
        reachedOlder = true;
        stopReason = 'NO_NEXT_LINK';
        break;
      }

      url = client.resolveUrl(page.nextUrl);
    }
  } catch (cause) {
    recordCursor(db, options, null, lastEventId, repeatedCount, syncId, false);
    // Integration failures propagate unchanged. The caller raises the overlay;
    // nothing here is allowed to look like negative evidence (sec. 10).
    throw cause instanceof RingError
      ? cause
      : new RingError('TRANSPORT', 'Ring history sync failed');
  }

  recordCursor(db, options, null, lastEventId, repeatedCount, syncId, true);

  // sec. 9.4 - BOTH conditions. The margin is PROVISIONAL: T5 could not be run,
  // so it protects against an indexing delay whose real size is unknown.
  const marginSatisfied =
    options.now.getTime() >= options.windowEnd.getTime() + options.observationMarginSeconds * 1000;

  return {
    pagesFetched,
    eventsSeen,
    eligibleEventsStored,
    stopReason,
    reachedOlder,
    coversWindow: marginSatisfied && reachedOlder,
    clockOffsetMs,
  };
}

/**
 * Records that a sync covered an attempt's window, which is what later allows a
 * missing session to become negative evidence (sec. 10 Case B).
 *
 * Deliberately only writes when `coversWindow` is true: a partial sync must
 * leave no trace that could be mistaken for coverage.
 */
export function recordCoverage(
  db: DatabaseSync,
  attemptId: string,
  options: SyncOptions,
  result: SyncResult,
): boolean {
  if (!result.coversWindow) return false;

  db.prepare(
    `INSERT INTO sync_coverage (id, device_id, attempt_id, covered_from, covered_to, synced_at, reached_older)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(attempt_id) DO UPDATE SET synced_at = excluded.synced_at, reached_older = 1`,
  ).run(
    randomUUID(),
    options.deviceId,
    attemptId,
    iso(options.windowStart),
    iso(options.windowEnd),
    iso(options.now),
  );
  return true;
}
