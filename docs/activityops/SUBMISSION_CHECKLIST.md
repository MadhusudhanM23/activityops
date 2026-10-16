# Submission checklist

Checked against the official Devpost rules (amazonappdev2026.devpost.com/rules), read 2026-10-10.
Deadline: **23 October 2026, 12:00 PM PDT** (24 October 00:30 IST). Submit a day early.

## Eligibility and project rules
- [x] Entrant eligible (India is not excluded; individual entry)
- [x] Built during the Submission Period (31 Aug - 23 Oct 2026): first commit 2026-10-07
- [x] English materials
- [x] Ring track: Ring API imported and called at runtime (`RingClient` in `apps/api/src/app.ts`)
- [x] AWS Builder: Strands Agents SDK used at runtime, integration documented (README, D-053, D-061);
      run for real 2026-10-10 ([evidence](../../evidence/ai/strands-gemini-handover.json))
- [ ] **Check Ring developer terms** allow sending Playground-derived facts to a third-party AI
      (Gemini). Only recorded demo data is sent; no video, images or tokens. If not allowed: remove
      the recorded Gemini note from Review Mode and run with `AI_RUNTIME=off`
- [x] Third-party terms otherwise: Gemini API key used under Google's terms; free-tier data use
      disclosed in the privacy notice

## Repository
- [ ] On GitHub, default branch contains this work (currently `feature/bedrock-strands`, unpushed)
- [x] Open-source licence (MIT `LICENSE`); must show in the repo's About section once public
- [x] Setup and run instructions (README "Run it locally", "Judge Test - 5 Minutes")
- [x] Login credentials for testing documented (local `demo.operator`)
- [x] No secrets: `node scripts/scan-secrets.mjs --history` clean - re-run before pushing
- [x] Internal handover notes (`document.txt`) git-ignored
- [ ] Fresh-clone run verified just before submitting

## Video (YouTube or Vimeo, public)
- [ ] Under 3 minutes; English
- [ ] Shows the project working through the Ring Developer Playground (Live Test) and Review Mode
- [ ] Shows the Strands agent output and its tool trace
- [ ] No copyrighted music; avoid unneeded third-party marks (the honest "Google Gemini" label is
      deliberate)
- [ ] Organizer watermark question answered, or video avoids the claim (ORGANIZER_QUESTIONS.md)

## Devpost form
- [ ] Text description of features and functionality
- [ ] Primary track: **Ring**. Mini challenge: **AWS Builder**
- [x] Product Feedback per tool, answering all five questions (`PRODUCT_FEEDBACK.md`), including
      which AWS services were used and how
- [x] Optional feature requests with priority ratings (`PRODUCT_FEEDBACK.md`)
- [x] Optional friction log, every entry with task, expected vs actual, severity, workaround and
      suggestion (`FRICTION_LOG.md`, F-01 - F-09) - worth up to a 10% bonus
- [ ] Submitted before the deadline
