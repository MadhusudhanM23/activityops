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

## D-021 — 2026-10-07 — The Ring adapter is built to the MEASURED contract, not an assumed one
`src/ring/normalize.ts` parses the JSON:API envelope observed on Day-1: entities under `data`,
status side-loaded under `included`, device binding at `relationships.source.data.id`, and
`attributes.start`/`end` as epoch milliseconds converted to ISO at the boundary. A test feeds it an
ISO string where epoch milliseconds are expected and asserts rejection, so the assumed-shape
mistake cannot creep back in.

*Correction (2026-10-08):* earlier wording here and elsewhere said the documentation "implied" a
flat shape. It did not: the landing page lists endpoint paths and does not describe response
envelopes at all. The flat shape was our own assumption. See LESSONS_LEARNED L-01.

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

## D-046 — 2026-10-08 — Build the model-agnostic half of Phase 5 before model access
The brief says to wire Strands and Bedrock only after access is confirmed, and that rule stands. The
read-only tools, injection defences, agent loop and deterministic answers do not depend on any
model, and the spec's fallback path uses "the same tool contracts". Building them now leaves only a
thin adapter for when access arrives. `ModelClient` mirrors the Bedrock Converse message shape.

## D-047 — 2026-10-08 — Users choose from fixed copilot tasks; there is no free-text prompt
The spec lists four supported prompts. Offering exactly those, as an enum, removes the direct
prompt-injection surface entirely. Indirect injection (via operator-typed data) is handled by D-048
and the output guard.

## D-048 — 2026-10-08 — Tools are read-only, allowlisted, and scoped to one run
No tool can change state, so even a fully obeyed injection cannot act. Each request's tools can see
only the run being asked about. Operator-typed strings come back as `{untrusted: true, text}`,
sanitised of control, zero-width and bidi-override characters and bounded at 300 characters.

## D-049 — 2026-10-08 — An output guard withholds drafts the evidence cannot support
A draft claiming a person or motion was detected, or that an area or site was clear, safe or secure,
is withheld and never saved. Conservative by design: it may also catch a negated phrasing, which the
system prompt already forbids.

## D-050 — 2026-10-08 — "Why are we not ready?" and "What should I do next?" never use a model
Spec sec. 17 requires both to be deterministic. They come from the readiness engine and a fixed
reason-to-action mapping, work with no model configured, and are labelled "no AI involved".

## D-051 — 2026-10-08 — The privacy notice follows whether a model actually runs
Keyed on the presence of a working model client, not on `BEDROCK_MODEL_ID` being set, so a
configured id without a working client cannot make the notice claim that data goes to Bedrock.

## D-052 — 2026-10-08 — Only completed notes are saved; prompts never are
Withheld or incomplete drafts are discarded. A saved note keeps its text, model id, requester and
tool trace (names, times, result summaries) - never the system prompt, the instruction, or model
reasoning. Covered by Delete All Data.

## D-053 — 2026-10-09 — Strands Agents for TypeScript is the primary AI runtime
`StrandsRuntime` registers the same ten read-only tools as JSON-schema tools (no zod-defined schemas
needed) and drives `BedrockModel`. Verified first in a scratch probe that the real SDK loop works
with a scripted model and refuses unregistered tool names itself.

## D-054 — 2026-10-09 — Direct Bedrock Converse kept as the spec's fallback, behind one interface
`AiRuntime` has two implementations: `StrandsRuntime` and `ConverseRuntime` (our existing loop over
`BedrockConverseClient`). `AI_RUNTIME` selects; both share the system prompt, tools, step limit and
the single `finalise` output guard, so a safety check cannot exist in one path only.

## D-055 — 2026-10-09 — zod upgraded to 4 instead of forcing peer resolution
Strands declares zod ^4.1.12. `--legacy-peer-deps` would hide the mismatch and break `npm ci` in CI
and Docker. One API rename was needed; all tests passed.

## D-056 — 2026-10-09 — AI is off unless a model id AND region are configured
No assumption about account access (spec sec. 17). A model id without a region refuses to start.
Construction makes no AWS call, so a server without credentials starts and reports NO_CREDENTIALS
on the first copilot request.

## D-057 — 2026-10-09 — Credentials only from the AWS SDK default chain
Locally a short-lived CLI session; in production the EC2 instance role. ActivityOps never reads,
stores, logs or returns a credential, and `.env.example` says not to put keys there.

## D-058 — 2026-10-09 — AI failures are classified to seven safe kinds; only the kind is logged
NO_CREDENTIALS, ACCESS_DENIED, MODEL_NOT_FOUND, THROTTLED, NETWORK, TIMEOUT, PROVIDER_ERROR, found by
walking the error `cause` chain (Strands wraps AWS errors). The client gets a fixed sentence; AWS
error text, which can carry account ids and ARNs, never leaves the server.

## D-059 — 2026-10-09 — A hard wall-clock timeout on the Strands run, retries off
Strands checks cancellation only between steps, so a stalled stream would ignore an abort. The run
races a timer (AI_TIMEOUT_MS, default 60 s). Retries are off because this runs inside an HTTP
request; the user can retry.

## D-060 — 2026-10-09 — `npm run ai:smoke` is the T9/T10 harness
One real handover against the recorded demo run through the server's own runtime, printing status,
trace and note, or the failure kind and next step. It also flags a run in which no tool was called,
so T10 cannot be claimed from a text-only reply.

## D-061 — 2026-10-10 — The same Strands agent on a local model or Gemini, labelled, while Bedrock is blocked
Bedrock invocation is blocked on the project's AWS account (R-009), and the owner will not upgrade
to a paid plan. The hackathon rules list the Strands SDK as a qualifying AWS service in its own
right. So `AI_RUNTIME=strands-local` runs the unchanged `StrandsRuntime` - same ten read-only tools,
system prompt, step limit, timeout and output guard - with Strands' `OpenAIModel` pointed at an
OpenAI-compatible server on the same machine (Ollama).

Honesty and privacy are structural, not just wording:
- `LOCAL_MODEL_BASE_URL` must be loopback (`127.0.0.1`, `localhost`, `::1`); any other host is
  refused at startup, so "local" cannot quietly send run data to an external service.
- Every runtime reports a `provider` (`bedrock` | `local` | `test`). It is saved with each note and
  shown on it: "Strands agent · local model · not Amazon Bedrock".
- The privacy notice states that a local model sends nothing to Bedrock or any external AI service.

**Measured on the build machine (7.9 GB RAM, no GPU), `qwen3:4b`:** 4.1 tokens/s generation and
3.6 tokens/s prompt processing. The agent's prompt and tool schemas alone would take over ten
minutes per step, and the first full run hit the 300 s timeout. The path works on capable hardware
but not on this machine, so it is kept but not used for the demo.

**Hence `AI_RUNTIME=strands-gemini`:** the same `StrandsRuntime` with Strands' `GoogleModel`
(default `gemini-2.5-flash`, `@google/genai` 2.28.0, production audit 0).
- The key is read by the Google SDK from `GEMINI_API_KEY` in the server environment. Config checks
  only that it is present and drops it (`GEMINI_API_KEY_SET: true`), so it cannot reach a log or a
  response; a test asserts the serialized config never contains it. The secret scanner now flags
  Google API keys.
- Google may use free-tier inputs to improve its products, so a Gemini-backed copilot **refuses live
  runs** (`503 AI_NOT_FOR_LIVE_DATA`, model never called) and drafts only for the published recorded
  demo run. The privacy notice says this; notes are labelled "Strands agent · Google Gemini · not
  Amazon Bedrock".

Neither path counts as T9/T10 passing; those still need Bedrock.
`openai` 6.49.0 was added as the optional peer Strands needs for `OpenAIModel` (production audit: 0).

## D-062 — 2026-10-10 — A run lists open incidents carried over from earlier runs of its checks
An incident belongs to its check and stays open across runs until resolved - a broken contact is
still broken at the next shift - and readiness already counts every open incident on the run's
checks. The run's Incidents panel, however, listed only incidents raised during that run, so a later
run could read "Blocked" beside "No incidents". The panel now also lists open incidents on the run's
checks raised earlier, labelled "From an earlier run". How incidents are raised, deduplicated or
counted is unchanged; this is display only.
Addendum (2026-10-12): actions on such a carried-over incident taken while a later run is open
(from its start until approval or cancellation) now also appear in that run's audit trail. Found in
a real Playground run: dismissing the carried-over BLOCKER unblocked approval, but the dismissal was
only in the earlier run's trail. A run that has not started any check has no start time, so it shows
none of these actions - a known, minor gap.

## D-063 — 2026-10-12 — Frontend redesign for first-time users; React + Vite kept
A real Live Test showed the UI did not guide a new user: the Ring check's steps were implicit, the
check window was plain text (a window was missed), and every card had equal weight. The redesign
adds: a "start here" home with two paths (recorded run / live test), a hero preview of the recorded
run, a live-test guide, a four-step Ring check stepper with a live window countdown, a run summary
bar (progress ring, readiness, countdown, approval), a two-column run page, an incident lifecycle
track, toasts for every action, a split sign-in page, a logo and a compact type scale (Inter).

- **Next.js was requested and not adopted.** Its runtime injects inline scripts that the
  production CSP (`script-src 'self'`) blocks, and it would replace the single Fastify process that
  serves the built UI. No judge-visible gain for that risk.
- **Toasts are in-house** (`src/toast.tsx`): common toast packages inject a `<style>` element at
  runtime, which `style-src 'self'` blocks. Inter is self-hosted (`@fontsource-variable/inter`)
  for the same reason; icons are `lucide-react` (inline SVG).
- **Behaviour unchanged.** Every API call, honesty label, the PASS gate, the token's password field
  and all evidence wording are as before; 269 tests pass, including the UI wording gate.
- The "Fill demo account" button exists only in development builds (`import.meta.env.DEV`); the
  production bundle was checked to contain no demo password.
- The Playground link now points to `developer.amazon.com/ring/console/playground`, verified during
  the 2026-10-12 live run (closes R-006).

## D-064 — 2026-10-14 — Cancelling a run closes the coverage incidents it raised that nobody touched
Found in the 2026-10-12 live run: a run that missed its check window was cancelled, and its
system-raised BLOCKER ("window expired, no qualifying session") then blocked the next run until
someone dismissed it. Only one incident can be open per check (sec. 13, enforced by a partial unique
index), so scoping such incidents to their own run was not an option.

Rule: when a person cancels a run, every open incident that run raised whose actions are all the
system's is moved to DISMISSED **under the canceller's name**, with the reason "Run cancelled - this
coverage incident was about that run's check window, which no longer applies", in the same
transaction as the cancellation. The lifecycle and audit trail show it.

- Operator FAILs (actor is a person) are real site problems: they stay open and carry over (D-062).
- An incident any person has acted on (acknowledged, a FAIL attached, ...) is left alone.
- Approved by the project owner on 2026-10-14. Two route tests cover both cases.

## D-065 — 2026-10-14 — Auto-sync, incident AI summary, audit report, closing and handover checklists
- **Auto-sync:** an armed Ring check polls Event History every 15 s (Ring sync is limited to 30/min),
  paused while the tab is hidden or another action runs, stopping on evidence, on a covered window,
  90 s after the window closes, or on any error. The manual Sync button stays. Verified against a
  stub: history calls at +15 s and +30 s.
- **"Summarize with AI"** on each incident calls the existing read-only `INCIDENT_SUMMARY` task; the
  draft appears in the copilot panel. Same provider rules as handover notes (Gemini: recorded demo
  run only).
- **Audit report** (`#/runs/:id/report`): a printable A4 record - checks with earlier FAILs kept,
  OVERRIDDEN never shown as PASS, evidence limits, incident lifecycles, the AI draft labelled as a
  draft, the full audit trail. "Save as PDF" is the browser's print dialog (no PDF library, CSP-safe).
- **Closing and shift-handover live checklists** are built from the discovered devices alongside
  opening; the opening template keeps its ids. Listed opening, closing, handover.

## D-066 — 2026-10-16 — Judge-facing fixes: tour, section menu, impact story, one-command start
Scored against the four judging criteria, the weakest were Potential Impact (no written customer
case) and Design (a long run page, and judges without a Ring token see only the recorded run).
- **Two-minute tour** on the recorded run: six numbered stops (evidence card, FAIL kept / recheck
  PASS, override, incident lifecycle, AI note, audit trail) that scroll to the part; the audit trail
  opens by default on the recorded run.
- **Section menu** that stays under the summary bar: Checklist, Incidents, AI copilot, Audit trail.
- **Who it is for** on the home page and in the README: multi-site operators that already own Ring
  cameras; what each role gets; why Event History as a witness rather than AI detection; the Ring
  Appstore path. A **What's next** roadmap in the README, with the hospitality table-turnover idea
  deferred and worded to keep identities out of it.
- **`npm run dev`** starts API and UI together via `concurrently`. The API runs without watch mode
  there: `tsx watch` never launches when another process owns its stdin on Windows (verified: direct
  `tsx` starts in ~1 s; `tsx watch` under `concurrently`, with or without `--handle-input`, idles
  until killed). `dev:api` keeps watch mode for development.
- **Two-camera test**: two discovered devices become two Ring checks, and a session on one device
  never satisfies the other (the single-claim binding is per device). The Playground offers one
  device, so this stays test-proven, and the README says so.
- The café "dining room reset" checklist was considered and deferred until after the hackathon.

