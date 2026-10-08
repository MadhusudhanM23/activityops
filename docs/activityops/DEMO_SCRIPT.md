# Demo video script (target under 3 minutes)

Spec sec. 20 assumed a live Playground session and an AI handover. As of 8 October 2026 the
Playground device is offline (B-005) and the AI assistant is not built (B-002). This script follows
sec. 20 where the product can honestly show it, and marks each segment that depends on a blocker
with a fallback. **Record nothing that the product cannot do on camera.**

| Time | Shows | Depends on | Fallback if still blocked |
|---|---|---|---|
| 0:00–0:12 | The problem: opening checks on paper prove nothing afterwards | — | — |
| 0:12–0:27 | Sign in, connect Playground, "**N** devices discovered" — not an assumed three | Ring token | — (works with an offline device) |
| 0:27–0:48 | Start Ring check; open live view in the Playground tab; DEMO / SIMULATED labels | Device online (B-005); permission to show Playground UI (B-003) | Show the check armed with its window and **PASS locked**, explaining that PASS needs a session in the window. Skip the Playground tab |
| 0:48–1:05 | Sync history; card reads "Ring session observed during this check window" | Device online | Switch to Review Mode and show the **real captured session** on the recorded run, labelled RECORDED DEMO — capture 2026-10-07 |
| 1:05–1:25 | Record FAIL on the alarm check — allowed without Ring evidence; incident opens; readiness "Not ready" with the reason | — | — |
| 1:25–1:45 | Start recheck #2, PASS; attempt #1 still visible | — | — |
| 1:45–2:00 | Incident at READY_TO_RESOLVE; a person approves resolution; record approval → Ready | — | — |
| 2:00–2:20 | AI: "Create a handover note for the next manager", with tool trace | Bedrock (B-002) | Replace with the **offline device** case: Ring reports it offline → BLOCKED + BLOCKER incident, and a 401 shown as "Reconnect needed — not evidence about the site" |
| 2:20–2:34 | Data practices notice, Delete All Data, Review Mode for judges | — | — |
| 2:34–2:40 | Architecture and the closing line: *"ActivityOps records the check, the evidence, the decision, and what still needs action."* | — | — |

## Rules for the recording

- Every Playground-derived screen is visibly labelled SIMULATED or RECORDED DEMO.
- Never say or caption "detected", "clear" or "safe" about the Ring evidence.
- Do not show Ring-branded or watermarked media until Q1 in `ORGANIZER_QUESTIONS.md` is answered.
- Record the Playground segment separately and edit it in (spec sec. 20).
- Re-time against the real product the day before recording (Oct 22); cut, do not speed up.
