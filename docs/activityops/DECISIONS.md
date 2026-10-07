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
