# T5 - Indexing delay

**Status:** BLOCKED - could not trigger a session to measure (depends on T8)

## Hypothesis
A live-view session appears in Event History after a measurable delay; that delay sets
`post_window_observation_margin_seconds`.

## Date / time
2026-10-07, 11:20-11:31 UTC.

## Environment
Ring Developer Playground, device `online: false`.

## Request
Intended: trigger a session, then poll `GET /v1/history/devices/{id}/events` until it appears.

## Result
No session could be triggered (see T8), so no indexing delay was measured.

Two timing observations were captured in passing, and neither substitutes for the measurement:

1. **Server/client clock offset.** Comparing the HTTP `Date` header against the local clock at the
   round-trip midpoint gave offsets of **+0.59 s to +1.27 s** across four calls. The spread tracks
   request latency (1.2-1.7 s per call), so the true offset is sub-second. Recorded as diagnostics
   only; provider timestamps are never rewritten (spec sec. 8.5).
2. **One `on_demand` record did appear during the session**, with
   `start = 11:22:15.600Z` and `end = 11:34:45.600Z` - a 750-second span whose end was about eleven
   minutes in the **future** when first observed at 11:23:52. Its origin is unexplained (see T6).

Observation 2 matters for the coverage rule: a history record can be visible while its own window is
still open, so "the event exists" and "the session has finished" are different statements.

## Interpretation
`post_window_observation_margin_seconds` cannot be tuned on evidence, so it stays at the unmeasured
default of **60 seconds** (spec sec. 9.4).

The sub-second clock offset does suggest the 30-second skew allowance in sec. 8.2 is generous and
could be reduced to 15 s - but sec. 8.2 permits a reduction only on measured evidence of
*provider event timestamp* behaviour, and that is exactly what is missing. **Keeping 30 s.**

## Evidence
`raw/_log.json` (`serverClockOffsetMs` per call), `provider-payload-redacted.json`.

## Decision
- `CLOCK_SKEW_ALLOWANCE_SECONDS` stays **30**.
- `POST_WINDOW_OBSERVATION_MARGIN_SECONDS` stays **60**.
- Both remain configuration, so a later measurement can tighten them without a code change.
- The sync's coverage check must not treat an event whose `end` lies in the future as a completed
  session.

## Impact on product
This is the one Day-1 measurement the spec explicitly wanted and did not get. It is recorded as an
open risk rather than papered over with a plausible number.

## Next action
Blocked on T8. Re-run as the first action once a session can be triggered.
