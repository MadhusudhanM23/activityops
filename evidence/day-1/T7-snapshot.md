# T7 - Snapshot retrieval

**Status:** RUN - FAILED to retrieve an image. No JPEG obtained.

## Hypothesis
A snapshot request returns a retrievable valid JPEG through the Playground flow.

## Date / time
2026-10-07, 11:22-11:26 UTC.

## Environment
Ring Developer Playground, device `online: false`, token scopes `ava.v1:read`.

## Request
`POST /v1/devices/{id}/media/image/download`, four body variants.

## Result

| Body | HTTP | Error code | Detail |
|------|------|-----------|--------|
| `{"components":[]}` | 403 | `REQUEST_FORBIDDEN` | "Cannot authorize: missing required timestamp fields in request body" |
| `{"type":"latest_in_range","start_timestamp":<now-1h>,"end_timestamp":<now>}` | 403 | `TIME_RANGE_NOT_AUTHORIZED` | "Requested time range is not within authorized boundaries" |
| `{"type":"at_timestamp","timestamp":<now-1h>}` | 403 | `TIME_RANGE_NOT_AUTHORIZED` | "Requested time range is not within authorized boundaries" |
| `{"type":"latest_in_range","start_timestamp":<now-10min>}` | 416 | `MEDIA_NOT_FOUND` | "No media found" |

No redirect was followed (`num_redirects=0`), no image bytes were returned, and the content type was
`application/json` throughout.

The documented body shape - `type` of `at_timestamp` or `latest_in_range`, epoch-millisecond
timestamps, a single-element `components` array for multi-camera devices - was read from the
official Ring API documentation after the first `403` rather than guessed.

## Interpretation
The endpoint is reachable and validates input, but no media exists to retrieve: the device is
offline and has recorded nothing. `416 MEDIA_NOT_FOUND` on a well-formed request is the honest
result of a correct request against an empty device.

**The `403` responses here are request-validation failures, not authorization failures.** Mapping
`403 -> RECONNECT_REQUIRED` on status alone would have mislabelled a malformed request as an expired
link, and would have shown a judge "reconnect needed" when nothing was wrong with the connection.
This is the most useful error-handling finding of the gate.

## Evidence
Response bodies quoted above. The error envelope is JSON:API:
`{"errors":[{"id","status","code","detail","meta":{"timestamp"}}]}`.

## Decision
- **Cut the snapshot/media thumbnail.** It is already Cut 1 in the spec's cut order (sec. 26), there
  is nothing to show, and pursuing it costs demo time for no judge-visible gain.
- The readiness gate never calls media APIs - unchanged, and now also moot.
- Error classification reads `errors[].code` first and falls back to the HTTP status.

## Impact on product
Confirms the `SIMULATED` thumbnail is out of MVP scope. Supplies the real error envelope for the
adapter's error model.

## Next action
None. Revisit only if an online device becomes available and time remains after the core story is
stable.
