# Phase plan

| Phase | Name | Owner | Gate |
|-------|------|-------|------|
| 0 | Project foundation | Lead | Repo, both apps run, SQLite opens, docs system, test framework, no secrets |
| 1 | Day-1 Ring + AWS validation gate (T1-T10) | Ring + AI/AWS | Real evidence artifacts in `evidence/day-1/`; verdict PASS / PARTIAL / BLOCKED |
| 2 | Data model + domain state machine | Backend | Immutable attempts, deterministic readiness, incident lifecycle, transition tests |
| 3 | Ring evidence pipeline | Ring | Sync, client-side filter, normalization, matching, one-to-one claim, coverage |
| 4 | Core product UI | Frontend | Run / check / evidence / attestation / incident / recheck / readiness / audit, mobile-first |
| 5 | AI operations agent | AI/AWS | Read-only tools, handover note, injection defences, trace without chain-of-thought |
| 6 | Security + privacy + deployment | QA/DevOps | Session/CSRF/rate limit, delete-all, notice, EC2 + EBS + Compose + HTTPS |
| 7 | Judge experience + submission | Lead | Review Mode, Live Test Mode, README, submission checklist |

Sequencing rule: Phase 1 runs immediately after Phase 0. No polished dashboard before the Day-1
results are recorded (spec sec. 21, 34).

Cut order if time runs short: (1) media thumbnail, (2) Strands to direct Bedrock tool use,
(3) workplace-consent UI refinement. Never cut Ring runtime integration, readiness gate, operator
attestation, incident lifecycle, audit trail, judge testing path, or privacy/security essentials.
