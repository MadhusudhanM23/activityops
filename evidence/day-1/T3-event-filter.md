# T3 - Event History `event_types` filter

**Status:** RUN - **server-side filter is NOT honoured in the Playground environment**

## Hypothesis
The server may or may not honour `event_types=on_demand`. Our client-side filter produces the
correct result either way.

## Date / time
2026-10-07, 11:20-11:31 UTC (server `Date` header used as the reference clock).

## Environment
Ring Developer Playground, one-click OAuth token (scopes: `ava.v1:read`), account holds exactly one
device ("Playground Device", reported `online: false`). API base `https://api.amazonvision.com`.

## Request
`GET /v1/history/devices/{device_id}/events` with the query string varied:

| Query | HTTP | Events returned | Types returned |
|-------|------|-----------------|----------------|
| *(none)* | 200 | 1 | `on_demand` |
| `?event_types=on_demand` | 200 | 1 | `on_demand` |
| `?event_types=motion` | 200 | **1** | **`on_demand`** |
| `?event_types=ding` | 200 | **1** | **`on_demand`** |
| `?event_types=not_a_real_type` | 200 | **1** | **`on_demand`** |
| `?event_types=motion,on_demand` | 200 | 1 | `on_demand` |
| `?page_size=1` / `?limit=1` | 200 | 1 | `on_demand` |

## Result
The filter has no observable effect. Asking for `motion` returns an `on_demand` record. Asking for a
type that does not exist returns 200 with the same record rather than an error or an empty set.

An earlier run at 11:20 returned `{"data": []}` for every query, because the account had no history
at that point. The discriminating test only became possible once one event existed.

## Relevant response
See `provider-payload-redacted.json`. Event shape (JSON:API):

```json
{ "type": "history-events", "id": "<opaque>",
  "attributes": { "start": 1791372135600, "end": 1791372885600,
                  "event_type": "on_demand", "is_third_party_reviewed": true },
  "relationships": { "source": { "data": { "type": "devices", "id": "<device id>" } },
                     "cv_detections": { "data": [] } } }
```

## Interpretation
This confirms open question B.1 from spec sec. 0B: **a live Playground environment ignores the
`event_types` filter.** It establishes nothing about production Ring behaviour.

Only one event type was present, so this does not prove the server would mis-filter a mixed set -
but returning a record for `not_a_real_type` shows the parameter is not being applied at all.

## Evidence
`provider-payload-redacted.json`, `T2-devices-redacted.json`, `raw/_log.json` (local, git-ignored).

## Decision
Client-side filtering by `event_type` and by device id is **mandatory and load-bearing**, exactly as
spec sec. 8.7 and 9.2 require. The server-side filter is still sent (it is free and may work
elsewhere), but nothing may depend on it.

## Impact on product
- `MASTER_SPEC_REFERENCE.md` rule 2 is upgraded from "mandatory precaution" to "measured necessity".
- The Ring adapter must normalize before filtering, and the filter must be covered by a test that
  feeds it a deliberately mis-filtered server response.
- Field mapping is now known and differs from the assumed shape: `attributes.start` / `attributes.end`
  are **epoch milliseconds**, not ISO strings, and the device binding lives at
  `relationships.source.data.id`, not a flat `device_id`.

## Next action
Build the normalizer against this exact envelope, with a fixture derived from this capture
(Phase 3). Re-run T3 if a non-`on_demand` event ever appears, to test mixed-type filtering.
