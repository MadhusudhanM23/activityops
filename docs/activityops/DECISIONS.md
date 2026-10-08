# Decisions

Format: id, date, decision, rationale, spec anchor, reversibility.

## D-001 — 2026-10-07 — npm workspaces monorepo (`apps/api`, `apps/web`)
Lean single-deployable layout matching spec sec. 25 (Fastify + React + SQLite) and sec. 18 (one
Docker Compose stack). Reversible.

## D-002 — 2026-10-07 — Node built-in `node:sqlite`, WAL, single application writer
Spec sec. 18 requires WAL and one writer. A synchronous driver makes that discipline easy to
enforce and keeps state-transition tests deterministic.

`better-sqlite3` was the first choice and was **rejected after a real failure**: it has no prebuilt
binary for Node 24 on this machine and `node-gyp` could not find a Visual Studio installation, so
`npm install` failed. `node:sqlite` is synchronous, needs no native toolchain, and keeps the
deployment image simple. Verified: `PRAGMA journal_mode` returns `wal`.

Consequence: the runtime floor is Node 22+ (Node 24 in CI and in the container image). Reversible
before Phase 2 ends if a driver feature turns out to be missing.

## D-003 — 2026-10-07 — Timing values are configuration, not constants
`CLOCK_SKEW_ALLOWANCE_SECONDS=30`, `SESSION_WINDOW_SECONDS=600`,
`DEMO_SESSION_WINDOW_SECONDS=300`, `POST_WINDOW_OBSERVATION_MARGIN_SECONDS=60` ship as defaults so
T5 can tighten them with measured evidence (spec sec. 8.2-8.4, 9.4). The 120-second pre-window is
explicitly forbidden.

## D-004 — 2026-10-07 — No product UI before the Day-1 gate
Spec sec. 21 and 34. The Phase 0 web app is a deliberate placeholder.

## D-005 — 2026-10-07 — Bedrock model id stays unset in `.env.example`
Spec sec. 17: "Do not assume Claude is available." T9 establishes region and model id against the
real account before any agent code is written.

## D-006 — 2026-10-07 — CodeRabbit configured with spec-derived path instructions
`.coderabbit.yaml` encodes the evidence-honesty and state-machine rules as review instructions so
spec drift is caught at review time rather than at demo time. `request_changes_workflow: true`.
Requires a GitHub remote to take effect (B-004).

## D-007 — 2026-10-07 — T1-T8 are run by the user; no Ring token enters the agent session
Keeps the 30-minute Playground token out of this conversation and out of any transcript. The agent
supplies the runbook, the curl templates and a redaction script; the user supplies real observations.
Spec sec. 19/24 (tokens server-side only, never logged).

## D-008 — 2026-10-07 — Ring endpoint paths are documentation-derived until T2/T3 confirm them
Paths were read from the official Ring Partner API documentation on 2026-10-07 and recorded in
`DAY1_RUNBOOK.md`, marked as unvalidated. Observed behaviour overrides documentation, and any
difference is recorded in `INTEGRATION_FINDINGS.md` rather than silently coded around
(spec sec. 34: do not invent Ring behaviour).

## D-009 — 2026-10-07 — Public GitHub repository with CodeRabbit as the review gate
The hackathon requires a public repo (spec sec. 31). CodeRabbit reviews each phase PR against the
path instructions in `.coderabbit.yaml`. Until the remote exists, the Lead self-reviews against
the same checklist and the gap is tracked as B-004.

## D-010 — 2026-10-07 — Spec rules are enforced in the schema wherever a constraint can do it
The one-to-one event claim is a UNIQUE index, the one-open-incident rule is a partial unique index,
and attempt immutability is three triggers. Application code can be wrong; these cannot be bypassed
by a future route, a seed script or a careless migration. Spec sec. 7, 8.8, 13.

## D-011 — 2026-10-07 — verification_attempt carries armed_at, window_seconds and skew_seconds
The sec. 23 field list omits them, but sec. 8.1-8.4 require an armed timestamp and a window.
Snapshotting the window onto the attempt means a later configuration change cannot retroactively
alter what counted as eligible for a historical attempt. Recorded as an additive extension to the
spec data model, not a change to it.

## D-012 — 2026-10-07 — Override is a new attempt with status OVERRIDDEN, not a mutation
Sec. 13 requires that an override is never displayed as PASS and that dismissal cannot erase a FAIL.
Writing the override as a superseding attempt satisfies both and keeps the original FAIL visible in
the audit history.

## D-013 — 2026-10-07 — Device status UNKNOWN is not UNAVAILABLE
Only a confirmed UNAVAILABLE device may produce a BLOCKER (sec. 10 Case A). A device that has not
been reported on — including because the Ring integration is down — must never create a coverage
blocker, otherwise an integration failure becomes false negative evidence.

## D-014 — 2026-10-07 — Delete All Data drops and rebuilds tables
The anti-delete trigger that protects attempt history would otherwise block the sec. 16 delete
operation. DROP TABLE does not fire row triggers, and wiping the store is an explicit operator act.

## D-015 — 2026-10-07 — Vitest upgraded to v3
Vitest 2 could not resolve the `node:sqlite` builtin and every domain test failed to load. Vitest 3
(Vite 6) resolves it. An observed failure, not a preference.

## D-016 — 2026-10-07 — The user supplied the Playground token directly, superseding D-007
D-007 planned for the user to run T1-T8 and paste results. The user chose to paste the token instead.
Handling: the token was held in an environment variable for the duration of the run, never written to
a file, a log, a commit or an evidence artifact, and the raw captures live in the git-ignored
`evidence/day-1/raw/`. Only redacted payloads are committed.

## D-017 — 2026-10-07 — Snapshot/media thumbnail is CUT
T7 returned no image: `403` twice on body validation, then `416 MEDIA_NOT_FOUND` on a well-formed
request, because the device is offline. This is Cut 1 in the spec sec. 26 cut order, taken early on
evidence rather than late under schedule pressure.

## D-018 — 2026-10-07 — Error classification reads the provider error code, not the HTTP status
Spec sec. 10 lists "403 authorization issue requiring re-link" as a reconnect condition. T7 shows
`403` is also returned for request-validation failures. The adapter therefore classifies on
`errors[].code` and treats the status as a fallback. **This is a refinement of sec. 10 driven by
measured behaviour** and is logged here as the versioned correction the spec requires.

## D-019 — 2026-10-07 — Timing configuration stays at its unmeasured defaults
Sec. 8.2 permits reducing the skew allowance to 15 s only on measured evidence. T5 could not be run,
so `CLOCK_SKEW_ALLOWANCE_SECONDS` stays 30 and `POST_WINDOW_OBSERVATION_MARGIN_SECONDS` stays 60,
both explicitly marked unmeasured. The sub-second HTTP `Date` offset observed is diagnostic only and
is not evidence about provider event timestamps.

## D-020 — 2026-10-07 — The adapter normalizes a JSON:API envelope with epoch-millisecond timestamps
Measured shape: entities under `data`, side-loaded objects under `included`, device binding at
`relationships.source.data.id`, and `attributes.start`/`attributes.end` as epoch milliseconds.
The schema's ISO-8601 `start_at`/`end_at` columns are unchanged; conversion happens in the adapter,
which is exactly the normalization boundary spec sec. 16 and 34 require.

## D-021 — 2026-10-07 — The Ring adapter is built to the MEASURED contract, not the documented one
`src/ring/normalize.ts` parses the JSON:API envelope observed on Day-1: entities under `data`,
status side-loaded under `included`, device binding at `relationships.source.data.id`, and
`attributes.start`/`end` as epoch milliseconds converted to ISO at the boundary. A test feeds it an
ISO string where epoch milliseconds are expected and asserts rejection, so the documented-shape
mistake cannot creep back in.

## D-022 — 2026-10-07 — Every provider response is schema-validated; a mismatch is an integration error
Spec sec. 24 requires validating provider response schemas. A malformed response raises
`MALFORMED_RESPONSE`, which sets the reconnect overlay and is explicitly NOT an empty result. The
difference between "nothing happened" and "we could not tell" is the whole basis of sec. 10.

## D-023 — 2026-10-07 — REQUEST_INVALID does not raise the reconnect overlay
`RingError.setsReconnectOverlay` is false for a request bug of ours. Telling an operator to
reconnect because we sent a malformed body would be a false statement about the integration.

## D-024 — 2026-10-07 — The client refuses to follow a cross-origin links.next
Following provider-supplied links blindly would let a malformed or hostile response redirect an
authenticated request with the bearer token attached. `resolveUrl` rejects any origin other than the
configured base.

## D-025 — 2026-10-07 — A capped or aborted traversal is never coverage
`coversWindow` requires BOTH the observation margin to have elapsed AND the traversal to have
reached older records or the true end of the list. Stopping at the page cap or on a repeated URL
yields `coversWindow: false`, so a missing session stays "not yet observed" rather than becoming
negative evidence (sec. 9.4, 10 Case B).

## D-026 — 2026-10-07 — CORRECTION: the Phase 0 bind failure was a port conflict, not 0.0.0.0
Phase 0 recorded "binding 0.0.0.0 was denied" and made HOST configurable. In Phase 4 the same EACCES
appeared on 127.0.0.1, disproving that. Root cause: a local Windows service (AgentService) holds port
8080; Windows reports an exclusively-held port as EACCES rather than EADDRINUSE. The dev default port
is now 8787; containers set PORT explicitly. Configurable HOST is kept - it is still correct for
containers. See LESSONS_LEARNED L-06.

## D-027 — 2026-10-07 — verification_run carries data_mode and capture_date
Spec sec. 19 requires the seeded run never be presented as live data. A column (with a CHECK that a
RECORDED_DEMO run has a capture date) makes every view label it honestly, rather than relying on a
convention in free-text `scheduled_context`.

## D-028 — 2026-10-07 — Auto-claim binds the EARLIEST eligible unclaimed session
Deterministic, and leaves a later session in the same window available to another check on the same
device. Every sec. 8 rule is still re-checked inside `claimEvidence`.

## D-029 — 2026-10-07 — Attempts drive the incident to READY_TO_RESOLVE and stop there
Starting a recheck moves an open incident to RECHECKING; a recheck PASS moves it to READY_TO_RESOLVE;
a recheck FAIL sends it back to ACTION_REQUIRED. RESOLVED is only ever set by a named person - spec
sec. 1 forbids turning a recheck into automatic resolution. These system steps are attributed to
`system` in the lifecycle so the UI can show they were driven by an attempt.

## D-030 — 2026-10-07 — Review Mode is generated through the real workflow, from the one real capture
The seed calls the same workflow functions as live use, so the recorded run passes the same
immutability triggers and evidence gate. Its Ring evidence is the single on_demand record captured on
Day-1 (synthetic id). Only one real session exists, so the fail -> recheck story runs on a non-Ring
check instead of inventing a second Ring session.

## D-031 — 2026-10-07 — A recorded run is immutable at the API, not just in the UI
Start, sync, decision, override, approve, cancel and incident transitions are all refused for a
RECORDED_DEMO run server-side. Found when the incident route turned out to lack the guard (L-16).

## D-032 — 2026-10-07 — The product has no mock Ring mode
Browser end-to-end testing points the real API at a test-only fake Ring server in the scratchpad via
`RING_API_BASE_URL`. Product code has no fake data path to accidentally ship or demo (spec sec. 34).

## D-033 — 2026-10-07 — The API build ships schema.sql and the built artifact is boot-tested
`tsc` does not copy non-TS files; `scripts/copy-assets.mjs` does. Found by booting `dist/` (L-10).

## D-034 — 2026-10-07 — "Open Ring live view" URL is configuration
The exact Playground live-view URL was not verified, so it is `VITE_RING_PLAYGROUND_URL`, defaulting
to the official Ring developer portal rather than a guessed deep link.

## D-035 — 2026-10-08 — One login; anonymous visitors get Review Mode only
Spec sec. 14 allows a single demo identity and forbids implying two-person control. Spec sec. 28's
judge flow starts with "open the hosted URL, choose Review Mode", so the recorded run is readable
without signing in; every live run, template, device, incident list and every state change needs a
session. Credentials for Live Test are published in the README for judges.

## D-036 — 2026-10-08 — CSRF uses the synchronizer-token pattern
The token is returned in the JSON body of login and `GET /api/session`, held in page memory only,
and echoed in `X-CSRF-Token`. SameSite=Strict already blocks most cross-site requests; the token is
required anyway because spec sec. 24 names CSRF protection explicitly.

## D-037 — 2026-10-08 — Authorization policy is keyed on the matched route, never the raw URL
The router decodes paths, so a check on the raw string can disagree with it. The first version did,
and anonymous callers reached protected GET handlers through `/%61pi/...` (L-21). The hook now reads
`request.routeOptions.url`; handlers also resolve the actor before any side effect, as a second line.

## D-038 — 2026-10-08 — Sessions and rate limits live in memory
Single instance by design (spec sec. 18), so no shared store is needed. A restart signs everyone out,
which is acceptable for a demo and avoids persisting session secrets.

## D-039 — 2026-10-08 — The privacy notice is generated from configuration
`GET /api/privacy` states whether Ring-derived data goes to Bedrock based on whether a model is
actually configured, so the notice cannot claim something the deployment does not do. Connecting
Ring requires acknowledging it, and the acknowledgement is audited.

## D-040 — 2026-10-08 — Delete All Data resets, then restores the published demo
It ends the Ring connection, drops and rebuilds every table, writes one DELETE audit record (the
"minimum deletion audit" of spec sec. 16), then re-seeds the recorded demo so Review Mode keeps
working for other visitors to a shared hosted instance. The response and the UI say so.

## D-041 — 2026-10-08 — Production refuses to boot without a strong password
Missing, short (< 12) or the development value -> configuration error at startup. Verified in the
real container image.

## D-042 — 2026-10-08 — Dependency upgrades: @fastify/static 10.1.5, Vitest 5
`@fastify/static` <= 10.1.1 carried HIGH advisories (path traversal, route-guard bypass); Vitest 3
pulled a critical `tinypool` advisory. Both upgraded; static serving gained its own tests because no
existing test exercised it (L-23).

## D-043 — 2026-10-08 — Tailwind 3 dev-only advisories accepted for now (R-007)
Seven findings (`braces`, `micromatch`, `chokidar`, `fast-glob`, `postcss-nested`,
`postcss-selector-parser`, `tailwindcss`) sit in Tailwind 3's build-time file globbing. They never
ship - verified that dev dependencies are absent from the image - and only ever process our own
source paths. The fix is the Tailwind 4 migration, which changes ring/shadow/rounded semantics and
needs full visual re-verification; deferred, not ignored.

## D-044 — 2026-10-08 — Own secret scanner rather than a third-party action
`scripts/scan-secrets.mjs` targets the credential shapes this project actually handled (Ring JWTs,
GitHub tokens, AWS keys, Ring provider ids), recognises deliberately synthetic test values, scans
full history, and prints locations only. Proven with a positive control before being trusted.

## D-045 — 2026-10-08 — Phase 6 split into 6a (PASS) and 6b deployment (BLOCKED)
Security, privacy and the container are complete and verified. Nothing has been deployed to AWS, so
marking the whole phase PASS would misstate it.
