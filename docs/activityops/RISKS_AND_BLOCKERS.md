# Risks and blockers

## B-001 — CLOSED (2026-10-07) — Ring Developer Playground access
Phase 1 (T1-T8) cannot run without a Playground account and a one-click token. Playground tokens
are valid ~30 minutes, so the tests must be run in one sitting, and a reconnect flow is required
for judges regardless.
**Resolved approach (2026-10-07):** the user runs T1-T8 against their own Playground account and
pastes redacted results back. No Ring token enters this session. Runbook:
T1-T8 were run against the live Playground API on 2026-10-07 and the results are recorded in
`INTEGRATION_FINDINGS.md` and `evidence/day-1/`. Superseded by B-005.

## B-002 — OPEN — AWS account / Bedrock access not confirmed
T9 and T10 need: region, an explicitly chosen model id, FTU use-case form status for Anthropic
models, IAM Marketplace permissions, and observed quota. Phase 5 must not start before this.
**Status (2026-10-09):** AWS sign-in fails with "Bad request"; the user has contacted AWS Support.
The Strands + Bedrock integration is implemented and tested offline, and `npm run ai:smoke` is ready
to run T9/T10 the moment access returns. What remains blocked is only real invocation and hosting.
**Status (2026-10-07):** no AWS account available yet. T9/T10 and Phase 5 stay BLOCKED. Bedrock
access must be arranged before Oct 14 (the plan date for the Strands/Bedrock handover) or the AI
copilot is at risk; the cut order does not permit cutting the Bedrock agent entirely, since the
AWS Builder mini challenge depends on it.

## B-003 — OPEN — Organizer permission for Playground UI / Ring-branded media in the public video
Spec sec. 29. The question has not been posted yet. Until it is answered the README must not claim
permission, and the video plan needs a fallback that avoids showing watermarked Ring media.

## B-004 — OPEN — No GitHub remote yet
CodeRabbit reviews pull requests on a hosted repository. Local git is initialized and
`.coderabbit.yaml` is committed, but CodeRabbit cannot run until the repo is pushed to GitHub and
the CodeRabbit app is installed on it.
**Status (2026-10-08):** the public repository exists (`MadhusudhanM23/activityops`) but the first push
was rejected: the supplied token lacks the `workflow` scope needed to push `.github/workflows/ci.yml`.
**Needed:** revoke the token that was pasted into the chat and issue one with `repo` + `workflow`.
Then install the CodeRabbit app. Until then each phase is self-reviewed by the Lead against the spec.

## R-001 — Schedule risk
16 calendar days to 23 October 2026. Cut order is fixed and recorded in `PHASE_PLAN.md`.

## R-002 — Evidence-honesty regression risk
The fastest way to lose credibility is UI wording that upgrades a session record into a safety
claim. Mitigated by `.coderabbit.yaml` path instructions plus wording assertions planned for
Phase 4 tests.

## R-003 — Single-EC2 single point of failure
Accepted for the hackathon (spec sec. 18). Mitigation is a documented rebuild path plus EBS
snapshots, not a distributed architecture.

## B-005 — OPEN — The Playground device is offline, so no live-view session can be started
`GET /v1/devices/{id}/status` reports `online: false`. Consequences:
- T5 (indexing delay) cannot be measured, so `post_window_observation_margin_seconds` stays at the
  unmeasured default of 60 and `clock_skew_allowance_seconds` stays at 30.
- T8 (live view) cannot be validated.
- T7 (snapshot) returns `416 MEDIA_NOT_FOUND` because the device has recorded nothing.
- T4 (pagination) is untestable: one event cannot span pages.
- The demo flow in spec sec. 20 assumes a live session producing a fresh `on_demand` record, and
  currently cannot be rehearsed end to end.

**Needed:** a way to bring a Playground device online, or a Playground simulation control that
generates `on_demand` sessions. Ask in the Ring developer forum alongside the sec. 29 question.

**Mitigation already in place:** Review Mode (a seeded recorded run) is a required deliverable and
carries the judge story without a live session. The readiness gate never depended on media APIs.

## B-006 — OPEN — `403` is not a reliable authorization signal
Observed twice as a request-validation failure (`REQUEST_FORBIDDEN` for a missing body field,
`TIME_RANGE_NOT_AUTHORIZED` for an out-of-bounds range). Mapping `403 -> RECONNECT_REQUIRED` on
status alone would show a judge "reconnect needed" when the connection is fine.
**Mitigation:** the adapter classifies on `errors[].code` first and falls back to the status. This
must be covered by a test in Phase 3.

## R-004 — Provider pagination is implemented but unverified
Day-1 T4 was inconclusive: the account holds one event, so no `links.next` traversal could be
exercised. The algorithm is proven against synthetic multi-page fixtures (page cap, repeated-URL
abort, stop-at-older, missing-`links` end-of-list, idempotent upsert).

**These tests prove our algorithm, not Ring's behaviour, and must never be described otherwise.**

**Mitigation:** the traversal is defensive by construction — bounded page count, repeated-URL abort,
no assumption that `links` exists, and a capped traversal explicitly cannot produce coverage.
**Retire by:** re-running T4 once the account holds enough events to span pages (depends on B-005).

## R-005 — CLOSED (2026-10-08) — The API had no authentication
Every route currently acts as a single demo identity. That is acceptable on a developer machine and
unacceptable on a public URL: anyone could attest, approve, or connect a token.
**Closed in Phase 6a:** session cookie, CSRF, rate limiting, route-keyed authorization policy, and 39
security and bypass-regression tests (D-035 to D-038).

## R-006 — The Playground live-view deep link is unverified
"Open Ring live view" links to the Ring developer portal by default (D-034). Confirm the real
Playground URL during the next live session and set `VITE_RING_PLAYGROUND_URL`.

## R-007 — ACCEPTED — Dev-only advisories in the Tailwind 3 toolchain
Seven npm advisories (5 high, 2 moderate) in Tailwind 3's build-time globbing dependencies. They are
not in the production image (verified) and only process this repository's own files. Production
dependencies audit clean. **Retire by** migrating to Tailwind 4 with a full visual re-check (D-043).

## R-008 — Deployment has never run on AWS
Every container behaviour in the runbook is verified locally, including the EBS ownership step, but
an EC2 deployment can still surface DNS, certificate, security-group or IAM issues. Budget a day on
the schedule's Oct 18 slot once AWS access exists (B-002).
