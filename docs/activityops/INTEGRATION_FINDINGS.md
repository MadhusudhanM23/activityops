# Integration findings — Day-1 gate (T1-T10)

Every entry records: hypothesis, date/time, environment, request, result, relevant response,
interpretation, evidence file, decision, impact on product, next action. Full write-ups are in
`evidence/day-1/`.

**Nothing in this file is filled in from documentation or from another entrant's report.** Only
observations actually made against the real Ring Playground account appear here. Unverified
observations create test cases, never product truth (spec sec. 0B).

| Test | Subject | Status | Headline result |
|------|---------|--------|-----------------|
| T1 | Playground token | PARTIAL | 30-min validity confirmed from the JWT; invalid token → clean `401`; natural expiry not observed |
| T2 | Device discovery | **PASS** | `200`, **1 device**, JSON:API envelope, `online: false` |
| T3 | `event_types` filter | **PASS (negative)** | **Server-side filter is ignored** — `event_types=motion` returns an `on_demand` record |
| T4 | Pagination | INCONCLUSIVE | Only one event exists; no `links` key at all; traversal never exercised |
| T5 | Indexing delay | **BLOCKED** | No session could be triggered; margin stays at the unmeasured default |
| T6 | Media side effect | **NOT REPRODUCED** | Trial 1 correlated; controlled trial 2 produced no event. No rule derived |
| T7 | Snapshot | **FAILED** | No JPEG. `403` twice (validation, *not* auth) then `416 MEDIA_NOT_FOUND` |
| T8 | Live view | **BLOCKED** | Device offline; WHEP endpoint reachable but no session possible |
| T9 | Bedrock | BLOCKED | No AWS account access (B-002) |
| T10 | Strands custom tool | BLOCKED | Depends on T9 |

---

## Gate verdict

### `DAY-1 GATE: PARTIAL`

**Proven, and now safe to build on:**

1. Ring Partner API authentication, device discovery and Event History all work with a Playground
   one-click token. The integration is real.
2. The payload format is **JSON:API** (`data` / `included` / `relationships` / `meta`), not the flat
   shape the documentation landing page implied. Event timestamps are **epoch milliseconds**
   (`attributes.start`, `attributes.end`); the device binding is at `relationships.source.data.id`.
3. **The `event_types` server-side filter is ignored in Playground.** Open question B.1 from spec
   sec. 0B is answered. Client-side filtering is a measured necessity, not a precaution.
4. Auth failure is a clean `401`, distinguishable from a successful-but-empty `200 {"data":[]}`.
   Both were observed.
5. `403` is **not** reliably an authorization signal — it was returned twice for request-validation
   problems. Error classification must read `errors[].code`, not the HTTP status alone.
6. The account holds exactly **one** device, and it reports `online: false`.

**Still unproven, and must not be assumed:**

1. Pagination ordering and `links.next` traversal (T4) — no multi-page history exists.
2. Provider indexing delay (T5) — so `post_window_observation_margin_seconds` stays at 60 and
   `clock_skew_allowance_seconds` stays at 30, both unmeasured.
3. Whether a media request creates an `on_demand` record (T6) — correlated once, not reproduced.
4. Whether snapshot retrieval can return a JPEG (T7) — no media exists on an offline device.
5. The live-view session flow end to end (T8).
6. Everything on the AWS side (T9, T10).

**Root cause of most of the gaps:** the single Playground device is offline, so no live-view session
can be started, which blocks T5 and T8 and leaves T4, T6 and T7 without data.

### Decisions taken on this evidence

| # | Decision |
|---|----------|
| 1 | Client-side filtering by device id and event type is load-bearing and gets a test fed a deliberately mis-filtered server response. |
| 2 | The adapter normalizes the JSON:API envelope and converts epoch-ms to ISO before anything else sees it. |
| 3 | Error classification reads `errors[].code` first; `403` alone never means "reconnect". |
| 4 | Snapshot/media thumbnail is **cut** (Cut 1 in spec sec. 26). Nothing to show, and the readiness gate never called media APIs anyway. |
| 5 | Timing configuration is unchanged and explicitly marked unmeasured. |
| 6 | Pagination correctness is proven by synthetic multi-page fixtures, with a note that it is unvalidated against the provider. |
| 7 | `device.status` maps `online: true/false` to `AVAILABLE`/`UNAVAILABLE`, and anything unreadable to `UNKNOWN`. |

### What this means for the phase plan

Phase 3 (Ring evidence pipeline) is **unblocked** — the envelope, the field names, the error shapes
and the filter behaviour are all now known from real responses rather than assumed.

Phase 5 (AI agent) stays blocked on AWS access (B-002).

The demo script needs rework: it assumed a live Playground session producing a fresh `on_demand`
record. Until a device can be brought online, the Review Mode seeded run carries the judge story.
