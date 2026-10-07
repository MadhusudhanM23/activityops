# Integration findings — Day-1 gate (T1-T10)

Each entry records: hypothesis, date/time, environment, request, result, relevant response,
interpretation, evidence file, decision, impact on product, next action.

**Nothing in this file may be filled in from documentation or from another entrant's report.**
Only observations actually made against the real Ring Playground / AWS account belong here.
Unverified observations may create test cases, never product truth (spec sec. 0B).

| Test | Subject | Status |
|------|---------|--------|
| T1 | Playground token: obtain, expiry behaviour, reconnect | NOT_RUN |
| T2 | Device discovery: HTTP status, device count, capability fields | NOT_RUN |
| T3 | Event History `event_types` filter, with and without | NOT_RUN |
| T4 | Pagination: newest-first, `links.next`, repeated-URL guard, stop condition | NOT_RUN |
| T5 | Indexing delay — sets `post_window_observation_margin_seconds` | NOT_RUN |
| T6 | Does a snapshot/media request create an `on_demand` record? | NOT_RUN |
| T7 | Snapshot retrieval: status, redirect, content type, image validity | NOT_RUN |
| T8 | Live-view flow, external-tab usability, WHEP behaviour | NOT_RUN |
| T9 | Bedrock: region, model id, invocation, FTU, Marketplace/IAM, quota | BLOCKED (B-002) |
| T10 | Strands custom read-only tool (`getVerificationRun`) | BLOCKED (B-002) |

## Gate verdict

`DAY-1 GATE: NOT_RUN`

Procedure ready: see `DAY1_RUNBOOK.md`. T1-T8 await a Playground session; T9/T10 await AWS access.
Blocked on credentials — see `RISKS_AND_BLOCKERS.md` (B-001, B-002).
