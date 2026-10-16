# Friction log

Spec v7 sec. 30. Every entry is something this team actually encountered while building ActivityOps
against the Ring Partner API and Ring Developer Playground. Nothing here is taken from other
entrants' reports. Raw evidence is in [`evidence/day-1/`](evidence/day-1/).

Environment for all Ring entries: Ring Developer Playground, one-click OAuth token (scope
`ava.v1:read`), API base `https://api.amazonvision.com`, 7 October 2026, from a developer machine in
India (UTC+05:30).

AWS entries (F-08, F-09): AWS Free plan account created 8 October 2026, credits only, AWS CLI
2.37.12 signed in with `aws login`, regions ap-southeast-2 and us-east-1, 10 October 2026.

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
| **Severity** | High — silently wrong data, not an error |
| **Workaround** | Filter every response by device id and event type on our side; never trust the server filter |
| **Suggestion** | Apply the filter in the Playground, or reject an unknown `event_types` value with `400` so the problem is visible |

### F-02 — Response envelope and timestamp format not on the documentation landing page

| | |
|---|---|
| **Attempted** | Building the adapter from the Partner API documentation page |
| **Expected** | Response examples alongside the endpoint list |
| **Observed** | The page lists paths and methods. The JSON:API envelope (`data` / `included` / `relationships`), event times as **epoch milliseconds** (`attributes.start`), and the device binding at `relationships.source.data.id` were only discoverable by calling the API |
| **Reproducibility** | Documentation as read on 7 October 2026 |
| **Impact** | We had assumed a flat shape with ISO timestamps; validating first meant we found out before writing the adapter rather than after |
| **Severity** | Medium — costs a day of discovery; misreading the timestamp unit would shift every evidence window |
| **Workaround** | Called each endpoint, recorded the real shape, and schema-validate every response so a change fails loudly |
| **Suggestion** | One example response per endpoint on the landing page, especially the timestamp unit |

### F-03 — A validation error worded as an authorization failure, with `403`

| | |
|---|---|
| **Attempted** | `POST /v1/devices/{id}/media/image/download` with body `{"components":[]}` |
| **Expected** | `400` naming the missing field |
| **Observed** | `403 REQUEST_FORBIDDEN`: "Cannot authorize: missing required timestamp fields in request body" |
| **Reproducibility** | Consistent |
| **Impact** | A client that maps `403` to "reconnect your account" would show an operator a false reconnect prompt for its own malformed request. We now classify on `errors[].code` before the HTTP status |
| **Severity** | Medium — misleads error handling toward a false reconnect prompt |
| **Workaround** | Classify on `errors[].code` first, HTTP status second |
| **Suggestion** | Return `400` for request-shape errors and reserve `403` for authorization |

### F-04 — Time-range limit for media requests not stated, and also returned as `403`

| | |
|---|---|
| **Attempted** | Snapshot request with `latest_in_range` over the previous hour, and `at_timestamp` one hour ago |
| **Expected** | An image, or a clear statement of the permitted range |
| **Observed** | `403 TIME_RANGE_NOT_AUTHORIZED`: "Requested time range is not within authorized boundaries". A 10-minute range returned `416 MEDIA_NOT_FOUND` instead |
| **Reproducibility** | Consistent within the session |
| **Impact** | We could not tell what range a Playground token may request. (The snapshot feature was cut from our MVP for other reasons — see F-05) |
| **Severity** | Low for us — the snapshot feature was cut; it would block any product that uses media |
| **Workaround** | None needed: the readiness workflow never calls media endpoints |
| **Suggestion** | Document the authorized window per token type, and include it in the error body |

### F-05 — The Playground device was offline, with no apparent way to bring it online

| | |
|---|---|
| **Attempted** | Live-view session from the Playground to generate an `on_demand` record and measure indexing delay |
| **Expected** | An online simulated device |
| **Observed** | `GET /v1/devices/{id}/status` → `"online": false`. Event History was empty at first; snapshot returned `MEDIA_NOT_FOUND`; no live session could be started |
| **Reproducibility** | Throughout the 30-minute token session |
| **Impact** | We could not measure provider indexing delay, which drives how long our product waits before treating "no session found" as evidence. That value stays a conservative, explicitly unmeasured default. Live demo rehearsal is blocked |
| **Severity** | High — blocked a live demo and a timing measurement our product depends on |
| **Workaround** | Review Mode replays the one real session record we captured, labelled RECORDED DEMO; timing stays a documented conservative default; an offline device is shown as BLOCKED with an incident and next steps |
| **Suggestion** | A Playground control to bring the simulated device online, or to generate a live-view session record on demand |

### F-06 — An unexplained `on_demand` record appeared during testing

| | |
|---|---|
| **Attempted** | Repeated Event History reads for the Playground device during the Day-1 session, with no live view started by our test harness |
| **Expected** | Event History to change only after an action we took, and a record's `end` not to lie in the future |
| **Observed** | With history empty at 11:20 UTC, a single `on_demand` record appeared with `start` 11:22:15 and `end` 11:34:45 — an end time about 11 minutes in the future when first seen. Our test harness started no live view; the Playground UI was open in a browser at the time, so activity there cannot be ruled out. A controlled repeat of the harness's only intervening action (a snapshot request) produced no new record |
| **Impact** | We could not attribute the record to any action, so we did not encode any rule about its cause. It does show a record can be visible while its own window is still open |
| **Severity** | Medium — evidence semantics we cannot pin down |
| **Workaround** | Matching uses only device, record type and start time inside the check window; nothing depends on what created the record |
| **Suggestion** | Document what creates `on_demand` records in the Playground, and whether `end` can be in the future |

### F-07 — Thirty-minute tokens make sustained testing stop-start

| | |
|---|---|
| **Attempted** | Running the Day-1 validation sequence and live rehearsals on one Playground token |
| **Expected** | Enough token lifetime for a full test session, or a way to refresh |
| **Observed** | The one-click token expires after 30 minutes (`exp − iat = 1800`); the Playground UI says so clearly |
| **Impact** | Test sequences have to fit inside one token. Judges testing a hosted app need a reconnect flow — which we built — but long runs are awkward |
| **Severity** | Low — clearly documented, only inconvenient |
| **Workaround** | Test sequences sized to one token; the app shows time left and has a reconnect flow |
| **Suggestion** | An optional longer-lived sandbox token for development accounts |

### F-08 — Bedrock returns "Too many tokens per day, please wait" when the daily quota is zero

| | |
|---|---|
| **Attempted** | First-ever Bedrock call from a new account: Playground prompt `hello`, then `bedrock-runtime converse` with `maxTokens: 10` against `global.` and `au.` Claude Sonnet 4.5 profiles, Claude Haiku 4.5 and Amazon Nova Lite |
| **Expected** | A completion, or an error naming the real cause (account tier, verification, or missing entitlement) |
| **Observed** | `ThrottlingException: Too many tokens per day, please wait before trying again` on every model, before a single token had been used. Service Quotas shows the daily token quota is `0.0` with `Adjustable: False` for every model on the account |
| **Severity** | High — blocks all model use, and the wording points the developer in the wrong direction |
| **Reproducibility** | Consistent across 5 model ids and 2 regions over several hours |
| **Workaround** | Read the quota with `aws service-quotas list-service-quotas --service-code bedrock` instead of trusting the error text. We kept our Strands agent and ran it against a local model for development, labelled as such |
| **Suggestion** | When the quota is zero, return `AccessDeniedException` stating the cause and the fix (for example "model invocation is not available on this account tier") rather than a retry-later throttle |

### F-09 — The same call gives different errors in different regions, and changes over minutes

| | |
|---|---|
| **Attempted** | The same Converse request in us-east-1 after it failed in ap-southeast-2 |
| **Expected** | The same account-level answer in every region |
| **Observed** | us-east-1 first returned `AccessDeniedException: Your account is currently being verified… normally takes less than 2 hours`; minutes later the same call returned the zero-quota throttle from F-08. ap-southeast-2 only ever showed the throttle. One quota row (`10000000.0` input tokens/minute for an OpenAI model) was non-zero, yet invoking that model returned "not available for this account" |
| **Severity** | Medium — costs debugging time; a non-zero quota row suggests a model is usable when it is not |
| **Reproducibility** | Seen once per region during verification; the quota/entitlement mismatch is consistent |
| **Workaround** | Tested in more than one region and compared Service Quotas with real invocation results |
| **Suggestion** | Surface "account verification in progress" consistently in every region and in the Bedrock console, and do not show non-zero quotas for models the account is not entitled to |
