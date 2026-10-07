# T8 - Live view

**Status:** BLOCKED - device offline; no session could be started

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
