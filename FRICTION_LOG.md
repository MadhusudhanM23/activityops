# Friction log

Spec v7 sec. 30. Every entry is something this team actually encountered while building ActivityOps
against the Ring Partner API and Ring Developer Playground. Nothing here is taken from other
entrants' reports. Raw evidence is in [`evidence/day-1/`](evidence/day-1/).

Environment for all Ring entries: Ring Developer Playground, one-click OAuth token (scope
`ava.v1:read`), API base `https://api.amazonvision.com`, 7 October 2026, from a developer machine in
India (UTC+05:30).

AWS: no AWS friction is recorded because Amazon Bedrock has not yet been used — account access was
not available during the build (see [Known limitations](README.md#known-limitations)). That is our
own constraint, not an AWS product issue, so it is not logged here as friction.

---

### F-01 — `event_types` filter is silently ignored in the Playground

| | |
|---|---|
| **Attempted** | `GET /v1/history/devices/{id}/events?event_types=motion` to check server-side filtering |
| **Expected** | Only `motion` records, or an empty list when there are none |
| **Observed** | The account's one `on_demand` record was returned. `event_types=ding` and `event_types=not_a_real_type` returned the same record with `200` |
| **Error** | None — a successful response that did not apply the filter |
| **Reproducibility** | 8 query variants in one session, all identical |
| **Impact** | A client that trusts the server filter would treat a live-view session as a motion event, or vice versa. We filter client-side on every response as a result |
| **Suggestion** | Apply the filter in the Playground, or reject an unknown `event_types` value with `400` so the problem is visible |

### F-02 — Response envelope and timestamp format not on the documentation landing page

| | |
|---|---|
| **Attempted** | Building the adapter from the Partner API documentation page |
| **Expected** | Response examples alongside the endpoint list |
| **Observed** | The page lists paths and methods. The JSON:API envelope (`data` / `included` / `relationships`), event times as **epoch milliseconds** (`attributes.start`), and the device binding at `relationships.source.data.id` were only discoverable by calling the API |
| **Reproducibility** | Documentation as read on 7 October 2026 |
| **Impact** | We had assumed a flat shape with ISO timestamps; validating first meant we found out before writing the adapter rather than after |
| **Suggestion** | One example response per endpoint on the landing page, especially the timestamp unit |

### F-03 — A validation error worded as an authorization failure, with `403`

| | |
|---|---|
| **Attempted** | `POST /v1/devices/{id}/media/image/download` with body `{"components":[]}` |
| **Expected** | `400` naming the missing field |
| **Observed** | `403 REQUEST_FORBIDDEN`: "Cannot authorize: missing required timestamp fields in request body" |
| **Reproducibility** | Consistent |
| **Impact** | A client that maps `403` to "reconnect your account" would show an operator a false reconnect prompt for its own malformed request. We now classify on `errors[].code` before the HTTP status |
| **Suggestion** | Return `400` for request-shape errors and reserve `403` for authorization |

### F-04 — Time-range limit for media requests not stated, and also returned as `403`

| | |
|---|---|
| **Attempted** | Snapshot request with `latest_in_range` over the previous hour, and `at_timestamp` one hour ago |
| **Expected** | An image, or a clear statement of the permitted range |
| **Observed** | `403 TIME_RANGE_NOT_AUTHORIZED`: "Requested time range is not within authorized boundaries". A 10-minute range returned `416 MEDIA_NOT_FOUND` instead |
| **Reproducibility** | Consistent within the session |
| **Impact** | We could not tell what range a Playground token may request. (The snapshot feature was cut from our MVP for other reasons — see F-05) |
| **Suggestion** | Document the authorized window per token type, and include it in the error body |

### F-05 — The Playground device was offline, with no apparent way to bring it online

| | |
|---|---|
| **Attempted** | Live-view session from the Playground to generate an `on_demand` record and measure indexing delay |
| **Expected** | An online simulated device |
| **Observed** | `GET /v1/devices/{id}/status` → `"online": false`. Event History was empty at first; snapshot returned `MEDIA_NOT_FOUND`; no live session could be started |
| **Reproducibility** | Throughout the 30-minute token session |
| **Impact** | We could not measure provider indexing delay, which drives how long our product waits before treating "no session found" as evidence. That value stays a conservative, explicitly unmeasured default. Live demo rehearsal is blocked |
| **Suggestion** | A Playground control to bring the simulated device online, or to generate a live-view session record on demand |

### F-06 — An unexplained `on_demand` record appeared during testing

| | |
|---|---|
| **Observed** | With history empty at 11:20 UTC, a single `on_demand` record appeared with `start` 11:22:15 and `end` 11:34:45 — an end time about 11 minutes in the future when first seen. Our test harness started no live view; the Playground UI was open in a browser at the time, so activity there cannot be ruled out. A controlled repeat of the harness's only intervening action (a snapshot request) produced no new record |
| **Impact** | We could not attribute the record to any action, so we did not encode any rule about its cause. It does show a record can be visible while its own window is still open |
| **Suggestion** | Document what creates `on_demand` records in the Playground, and whether `end` can be in the future |

### F-07 — Thirty-minute tokens make sustained testing stop-start

| | |
|---|---|
| **Observed** | The one-click token expires after 30 minutes (`exp − iat = 1800`); the Playground UI says so clearly |
| **Impact** | Test sequences have to fit inside one token. Judges testing a hosted app need a reconnect flow — which we built — but long runs are awkward |
| **Suggestion** | An optional longer-lived sandbox token for development accounts |
