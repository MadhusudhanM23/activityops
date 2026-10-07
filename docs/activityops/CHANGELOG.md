# Changelog

## 2026-10-07 — Phase 0 (foundation)
- Initialized git repository and an npm workspaces monorepo.
- Added `apps/api`: Fastify + TypeScript + better-sqlite3 + Vitest, health route, one test.
- Added `apps/web`: React + TypeScript + Vite + Tailwind placeholder — no product UI by design.
- Added a configuration module exposing the spec sec. 8 timing values as environment configuration.
- Added `.env.example` with no real secrets; `.gitignore` excludes env files and SQLite artifacts.
- Created the `docs/activityops/` record system and the `evidence/day-1/` folder.
- Added `.coderabbit.yaml` with spec-derived review instructions, and a GitHub Actions CI workflow
  running typecheck and tests.

### Corrections made during Phase 0
- `better-sqlite3` replaced with the built-in `node:sqlite` driver after a real install failure
  (no Node 24 prebuild, no Visual Studio toolchain on the build machine). See DECISIONS.md D-002.

## 2026-10-07 — Phase 1 preparation
- Added docs/activityops/DAY1_RUNBOOK.md with the T1-T10 procedure and the Ring endpoint paths
  read from the official Partner API documentation, explicitly marked unvalidated until T2/T3.
- Added scripts/redact.mjs (tested) so raw captures can be committed as public evidence with
  tokens destroyed and identifiers replaced by stable aliases.
- Added evidence/day-1/T1..T10 templates with the required reporting fields.
- Recorded D-007 (user runs T1-T8; no token enters the agent session), D-008 (endpoint paths are
  documentation-derived), D-009 (public repo + CodeRabbit as the review gate).

## 2026-10-07 — Phase 2 (data model + domain state machine)
- Added the full SQLite schema from spec sec. 23, with the one-to-one evidence claim, the
  one-open-incident rule and attempt immutability enforced structurally rather than by convention.
- Added deterministic readiness (sec. 11) as a pure function over a snapshot, returning ordered
  machine-readable reasons that Phase 5 will use for the readiness explanation.
- Added the attempt lifecycle: arming with a snapshotted window, evidence claiming with every
  sec. 8 rule re-checked at bind time, attestation with the PASS gate, cancellation, and the
  manager override recorded as a superseding OVERRIDDEN attempt.
- Added the incident lifecycle with a legal-transition table, severity escalation and action trail.
- Added run approval/cancellation and the Ring integration-state overlay.
- 53 new tests (54 total) covering every state transition and both evidence-honesty boundaries.

## 2026-10-07 — Phase 1 (Day-1 validation gate) — verdict PARTIAL
- Ran T1-T8 against the live Ring Playground API. Recorded every result, including the failures and
  the one correlation that did not reproduce.
- **T3 is the headline:** the server-side `event_types` filter is ignored — `event_types=motion`
  returns an `on_demand` record. Client-side filtering is now a measured necessity.
- Measured the real payload shape (JSON:API, epoch-millisecond timestamps) and the real error
  envelope, replacing the assumptions taken from the documentation landing page.
- Fixed a gap in `scripts/redact.mjs`: provider ids embedded in link URLs were surviving redaction.
  Caught by a post-redaction leakage check, which now runs over every committed artifact.
- Committed three redacted captures; raw responses stay git-ignored.
- Cut the snapshot thumbnail (D-017) on evidence.

## 2026-10-07 — Phase 3 (Ring evidence pipeline)
- Added `src/ring/normalize.ts`: JSON:API parsing built to the Day-1 measured contract, with zod
  schema validation and epoch-millisecond to ISO conversion at the boundary.
- Added `src/ring/errors.ts`: classification on `errors[].code` before HTTP status, encoding the
  measured fact that `403` is returned for request-validation failures (D-018).
- Added `src/ring/client.ts`: server-to-server client, token supplied per request and never stored,
  logged or returned; cross-origin `links.next` refused.
- Added `src/ring/sync.ts`: sec. 9.2 traversal with page cap, repeated-URL guard, stop-at-older,
  idempotent upsert by opaque provider event id, and sec. 9.4 two-condition coverage.
- Added fixtures derived from the real redacted capture, plus clearly-labelled synthetic multi-page
  fixtures for pagination.
- 43 new tests (105 total, 0 failing).

## 2026-10-07 — Phase 4 (core product UI)
- API: run, check, attempt, incident, audit and Live Test connection routes, with zod validation and
  an error mapper that never echoes request input (a pasted token cannot leak back out).
- Workflow layer: FAIL opens/updates the single incident; recheck -> RECHECKING; recheck PASS ->
  READY_TO_RESOLVE; RESOLVED only by a person. Auto-claim of the earliest eligible session.
- Coverage incidents: a confirmed blocker raises one BLOCKER incident, idempotently.
- Review Mode seed built through the real workflow from the Day-1 capture; immutable at the API.
- React UI, mobile-first: dashboard, Live Test connect (password field, cleared on submit, never
  stored), run detail with deterministic readiness explanation, Ring evidence card that always shows
  what the evidence does not establish, attempt history, incident lifecycle, audit trail.
- Frontend wording gate test; browser walkthroughs at 390px and 1280px; live end-to-end flow.

### Corrections made during Phase 4
- Phase 0 port diagnosis corrected (D-026, L-06).
- Production build could not boot - schema.sql missing from dist (D-033, L-10).
- Incident route lacked the recorded-run guard (D-031, L-16).
- Five visual defects found by screenshot review and fixed (L-17).
- Added `LESSONS_LEARNED.md` collecting every mistake so far for the final write-up.
