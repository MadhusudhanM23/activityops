# Risks and blockers

## B-001 — OPEN — Ring Developer Playground access not available to this build session
Phase 1 (T1-T8) cannot run without a Playground account and a one-click token. Playground tokens
are valid ~30 minutes, so the tests must be run in one sitting, and a reconnect flow is required
for judges regardless.
**Resolved approach (2026-10-07):** the user runs T1-T8 against their own Playground account and
pastes redacted results back. No Ring token enters this session. Runbook:
`docs/activityops/DAY1_RUNBOOK.md`. Still blocked until those results exist.

## B-002 — OPEN — AWS account / Bedrock access not confirmed
T9 and T10 need: region, an explicitly chosen model id, FTU use-case form status for Anthropic
models, IAM Marketplace permissions, and observed quota. Phase 5 must not start before this.
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
**Decided (2026-10-07):** a public GitHub repository will be created (the hackathon requires one).
Pending: repo URL, `git push`, and installing the CodeRabbit app on it. Until then each phase is
self-reviewed by the Lead against the spec.

## R-001 — Schedule risk
16 calendar days to 23 October 2026. Cut order is fixed and recorded in `PHASE_PLAN.md`.

## R-002 — Evidence-honesty regression risk
The fastest way to lose credibility is UI wording that upgrades a session record into a safety
claim. Mitigated by `.coderabbit.yaml` path instructions plus wording assertions planned for
Phase 4 tests.

## R-003 — Single-EC2 single point of failure
Accepted for the hackathon (spec sec. 18). Mitigation is a documented rebuild path plus EBS
snapshots, not a distributed architecture.
