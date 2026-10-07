# Master spec reference

Source of truth: `ActivityOps_Amazon_Hackathon_Master_Spec_v7.pdf` (Final Build Specification v7,
prepared 7 October 2026). **v7 only.** Earlier versions are not active.

Any change to Ring semantics, AWS model access, hackathon rules or judge testing must be filed as a
versioned correction to the spec document, never as a silent implementation change.

## Load-bearing rules extracted for implementers

| # | Rule | Spec sec. |
|---|------|-----------|
| 1 | `on_demand` = a live-view **session record**. Never "person detected", "motion detected", "site clear", "site safe". | 0A, 1, 5 |
| 2 | Client-side filtering of device id and event type is mandatory even when `event_types=on_demand` was sent server-side. | 8.7, 9.2 |
| 3 | Event History is newest-first; every sync starts at page 1 and follows `links.next`. A stored `next_url` is diagnostic only. | 9.1, 9.3 |
| 4 | Eligible window = `armed_at - clock_skew_allowance` .. `armed_at + session_window_seconds`. Defaults 30s / 600s (demo 300s). **Never a 120s pre-window.** | 8.2-8.4 |
| 5 | One provider event may be claimed by at most one attempt (DB unique constraint). | 8.8 |
| 6 | The readiness workflow never invokes snapshot/media APIs. | 8.9, 15 |
| 7 | Integration error (401/403/429/timeout/malformed/aborted sync) is **not** negative evidence. It sets the `RECONNECT_REQUIRED` overlay, not a coverage incident. | 10 |
| 8 | BLOCKER only from (A) confirmed device unavailable, or (B) expired window + covered sync + no qualifying session. | 10, 12 |
| 9 | Attempts are immutable; rechecks are new attempts with `supersedes_attempt_id`. | 7 |
| 10 | Run status is derived by deterministic precedence, never an editable column. | 11, 23 |
| 11 | Operator FAIL is always allowed, even with no Ring evidence. PASS on `RING_REQUIRED` needs qualifying evidence. | 12 |
| 12 | Override is recorded as `OVERRIDDEN`, never displayed as PASS. Dismissing an incident does not erase a FAIL. | 13 |
| 13 | AI explains state; it never decides readiness or resolution. Tools are read-only. Operator-typed strings are untrusted data. | 17 |
| 14 | Ring tokens are server-side only: no localStorage, no URL params, no logs, no SQLite. | 4, 19, 24 |
| 15 | Persist normalized facts, not raw provider payloads, raw tokens or raw prompts. | 16 |
| 16 | No two-person-control language ("four-eyes", "manager sign-off") while the MVP has one login. | 14 |
| 17 | Deployment: single EC2 + encrypted EBS + Docker Compose + HTTPS reverse proxy. App Runner is ruled out (ephemeral filesystem). | 18 |
| 18 | Judges need both Review Mode (seeded, no token) and Live Test Mode (judge-supplied Playground token, ~30 min validity). | 19 |

## Open organizer question (spec sec. 29)

Permission to show Playground UI / Ring-branded media in the public demo video is **unanswered**.
Do not claim permission in the README until answered.
