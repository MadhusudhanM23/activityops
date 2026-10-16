# T8 - Live view

**Status:** PASS (2026-10-12) - first real end-to-end run. A Playground "Simulate live view event"
session was found by Event History sync, bound to the armed attempt, and unlocked PASS.

## Result - 2026-10-12 (supersedes the blocked attempt below)
- **Environment:** Ring Developer Playground (developer.amazon.com/ring/console/playground), one-click
  token, device reported **online** for the first time. ActivityOps dev build, Live Test Mode, local.
- **Steps:** started a live run; *Start Ring check* armed the window 22:20:15 - 22:25:45 IST
  (300 s, 30 s skew allowance); in the Playground, section 3 *Simulate live view event* -> **Motion**;
  then *Sync Ring history* in ActivityOps.
- **Observed:** one session record on the check's device, start **22:21:42**, end **22:22:22** IST
  (40 s), labelled SIMULATED, provider record shown truncated (`...UMYG6HF5`). Bound to attempt #1
  only; *Record PASS* became enabled. A sync at ~22:22:31 had it; an earlier sync at ~22:22:09 may
  also have, but its result was not captured.
- **Timing (partial T5):** the record was visible **no later than ~10 s after its end time**
  (~50 s after its start). Not a controlled measurement - one sample, sync times approximate.
- **Not shown:** video. ActivityOps never requests media; the Playground streamed in its own tab.
- **Interpretation:** the evidence pipeline works against the real Ring API end to end: device
  binding via `relationships.source`, epoch-ms times, window matching, single-claim binding, and the
  PASS gate. The 60 s post-window wait and 30 s skew allowance remain conservative defaults.

---

Earlier record:

## Hypothesis
The Playground live-view flow starts a session, is usable in an external tab for a demo, and
produces a corresponding history record.

## Date / time
2026-10-07, 11:22 UTC.

## Environment
Ring Developer Playground. **Device status `online: false`** (`reported_at` 11:19:11 UTC).

## Request
`POST /v1/devices/{id}/media/streaming/whep/sessions` with `Content-Type: application/sdp`.

## Result
`400 MALFORMED_SDP_OFFER` - "Malformed SDP offer".

A placeholder SDP body was sent, so this result is expected. It establishes only that the endpoint
exists, is reachable with a read-scoped token, and validates the offer before checking anything
else. No real WebRTC offer was negotiated and no live-view session was started.

## Interpretation
The WHEP endpoint answered with a *content* error rather than `403`, which suggests a read-scoped
token is not categorically barred from it. That is an observation, not a conclusion.

The blocking fact is simpler: **the only device on the account is offline**, so there is no stream to
open. That also explains the empty event history and the `MEDIA_NOT_FOUND` in T7.

## Evidence
Response quoted above.

## Decision
The MVP live-view path remains "open Ring live view in an external Playground tab" (spec sec. 4).
Nothing observed here changes that, and nothing here validates it either.

## Impact on product
T5 is blocked behind this, because measuring indexing delay requires triggering a real session.
`post_window_observation_margin_seconds` therefore stays at its unmeasured default of 60.

## Next action
Ask in the Ring developer forum how to bring a Playground device online, or whether a simulation
control exists for generating `on_demand` sessions on demand. Until then T5 and T8 stay open.
