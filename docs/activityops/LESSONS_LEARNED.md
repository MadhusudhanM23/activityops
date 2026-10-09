# Lessons learned — mistakes, near-misses and how they were caught

Raw material for the final project write-up. Every entry is something that actually went wrong or
nearly went wrong during the build, recorded when it happened. Format: what happened, how it was
caught, root cause, fix, and the general lesson.

The most valuable column is **"how it was caught"**: almost every defect here was found by a check
that existed for a different reason, which is the argument for building those checks early.

---

## Integration and provider behaviour

### L-01 — Our assumed API shape was wrong in three places (Phase 1)
- **What happened:** we assumed a flat device/event shape. The real API returns JSON:API
  (`data`/`included`/`relationships`), event times as **epoch milliseconds**, and the device binding
  at `relationships.source.data.id`.
- **Correction (2026-10-08):** this entry first said the documentation landing page "implied" the
  flat shape, and that phrasing spread to five other files. Re-checking before writing the public
  friction log showed the page lists endpoint paths only and says nothing about response envelopes.
  The assumption was ours. All six places were corrected; the friction log reports the real gap
  (envelope not documented on that page), not a contradiction that did not exist.
- **Caught by:** the Day-1 validation gate — calling the real API before writing the adapter.
- **Fix:** adapter built to the measured contract; a test rejects ISO strings where epoch ms belong.
- **Lesson:** validate the provider before building against it. A day spent measuring saved a rewrite
  of the whole integration.

### L-02 — The server ignores `event_types` (Phase 1)
- **What happened:** `event_types=motion` returned an `on_demand` record; a nonexistent type returned
  `200` with the same record.
- **Caught by:** a deliberately discriminating query (asking for a type that should exclude the record).
- **Fix:** client-side filtering is authoritative; the server filter is sent but never relied on.
- **Lesson:** a filter test that only asks for what you expect cannot detect a filter that does
  nothing. Ask for something that should return nothing.

### L-03 — An apparent cause-and-effect that did not reproduce (Phase 1, T6)
- **What happened:** history was empty; a snapshot request was made; an `on_demand` record appeared
  ~2 seconds later. It looked conclusive.
- **Caught by:** a controlled second trial with a baseline — no new record appeared.
- **Fix:** nothing was encoded as a product rule. The conservative rule (readiness never calls media)
  already covered the case.
- **Lesson:** one correlated observation is a hypothesis. Repeat with a baseline before believing it.

### L-04 — `403` was not an authorization failure (Phase 1)
- **What happened:** the spec mapped `403` to "reconnect needed". Ring returned `403` twice for
  malformed requests (`REQUEST_FORBIDDEN`, `TIME_RANGE_NOT_AUTHORIZED`).
- **Caught by:** probing the snapshot endpoint and reading the error body, not just the status.
- **Fix:** classify on `errors[].code` first (D-018); a request bug never raises the reconnect banner.
- **Lesson:** HTTP status codes are overloaded by providers. Read the body.

---

## Environment and tooling

### L-05 — Native SQLite driver would not install (Phase 0)
- **What happened:** `better-sqlite3` had no prebuilt binary for Node 24 and no Visual Studio
  toolchain was available, so `npm install` failed.
- **Fix:** switched to Node's built-in `node:sqlite` — also removes a native dependency from the
  deployment image.
- **Lesson:** prefer platform built-ins over native addons for a hackathon-scale deploy.

### L-06 — A port conflict was misdiagnosed for four phases (Phase 0 → found in Phase 4)
- **What happened:** the API failed to bind with `EACCES`. Phase 0 recorded the cause as "binding
  `0.0.0.0` is denied" and worked around it by binding loopback. In Phase 4 the same error appeared
  on `127.0.0.1`, which disproved that explanation.
- **Real cause:** a local Windows service (`AgentService`) already listens on port 8080. On Windows a
  port held with exclusive access returns `EACCES`, not `EADDRINUSE`.
- **Caught by:** the error reappearing under conditions the first explanation could not account for.
- **Fix:** dev default port moved to 8787 (D-026); the earlier explanation is corrected in the
  records rather than left standing.
- **Lesson:** when a workaround "works", the diagnosis can still be wrong. Check who owns the port.

### L-07 — Vitest 2 could not load `node:sqlite` (Phase 2)
- **Fix:** upgraded to Vitest 3. **Lesson:** new Node built-ins can outpace bundler builtin lists.

### L-08 — Shell escaping silently corrupted files (Phases 0, 4)
- **What happened:** (a) heredocs containing apostrophes failed to parse when writing docs;
  (b) a `node -e` one-liner turned the regex escape `\b` into a **literal backspace byte**. The
  resulting test still passed — by accident, because the broken pattern happened to match.
- **Caught by:** an edit that failed to find text that looked identical on screen; `od -c` revealed
  the `\b` control byte.
- **Fix:** files are now written directly rather than patched through shell one-liners; the repo was
  swept for control bytes (none others found).
- **Lesson:** a passing test proves nothing if the test itself is corrupted. Inspect bytes when text
  "should match" but doesn't.

### L-09 — Stopped background tasks left orphan processes holding ports (Phase 4)
- **What happened:** stopping a background shell killed the wrapper but not its `node` child, so the
  next server start failed with `EADDRINUSE`.
- **Fix:** stop by port, after confirming the owning process's command line is ours.
- **Lesson:** process trees outlive their parent shell on Windows.

### L-10 — The production build could not boot (Phase 4)
- **What happened:** `tsc` compiles `.ts` only, so `schema.sql` was missing from `dist/`. The built
  server would have crashed at startup on the EC2 host.
- **Caught by:** deliberately booting `node dist/server.js` instead of trusting "build: clean".
  All 135 tests passed because they run from `src/`.
- **Fix:** the build copies the schema; the built server was booted and queried.
- **Lesson:** "it compiles" and "the tests pass" are both silent on whether the artifact you ship
  starts. Run the artifact.

---

## Tests that were wrong

### L-11 — A test blamed the wrong cause (Phase 4)
- **What happened:** a test asserted a `401` during sync must not make the run `BLOCKED`. It failed.
  The fixture device was the real Day-1 device — **offline** — so `BLOCKED` was correct behaviour,
  caused by the device, not the `401`.
- **Fix:** the test now isolates one variable (online device); a separate test pins the offline case.
  The product rule was not weakened to make the test pass.
- **Lesson:** when a test fails, first ask whether the test or the product is wrong.

### L-12 — A test that could not fail (Phase 4)
- **What happened:** a test for "recorded runs refuse incident changes" used an incident that was
  already `RESOLVED` — which the lifecycle rules reject anyway. It would have passed with the guard
  deleted.
- **Fix:** plant an `OPEN` incident and assert the guard's specific message.
- **Lesson:** check that a test fails without the code it protects.

### L-13 — A scanner matched documentation instead of usage (Phase 4)
- **What happened:** the "never persist the token" scan flagged a comment reading "No localStorage".
- **Fix:** match property access only, with self-tests proving it catches real use and ignores prose.

---

## Security

### L-14 — Credentials pasted into the chat (setup)
- **What happened:** a GitHub personal access token and a Ring Playground token were pasted into the
  conversation in plaintext.
- **Mitigation:** the Ring token expired after 30 minutes and was never written to disk, logs, or
  commits. The GitHub token was flagged for revocation.
- **Lesson:** paste secrets into a local `.env` or a CLI login prompt, never into a chat transcript.

### L-15 — Redaction missed identifiers inside URLs (Phase 1)
- **What happened:** provider device ids embedded in `links.related` URLs survived redaction.
- **Caught by:** a post-redaction leakage sweep run before commit.
- **Fix:** the redactor aliases provider ids wherever they occur.
- **Lesson:** run a sweep after redaction, not just the redactor.

### L-16 — Guard enforced in the UI but not the API (Phase 4)
- **What happened:** the recorded demo run hid incident buttons in the UI, but the API accepted
  incident transitions on it.
- **Caught by:** writing the UI component and asking what the server would do without it.
- **Fix:** the API refuses changes to any part of a recorded run.
- **Lesson:** a hidden button is not access control.

---

## UI defects found only by looking (Phase 4)

### L-17 — Screenshot review found five defects tests could not
Double periods in rendered reasons ("follow.. This"), a bullet orphaned on its own line at mobile
width, "1 need" instead of "1 needs", a date breaking at its hyphen ("2026-10-" / "07"), and a
favicon 404. All fixed and re-verified in the browser.
- **Lesson:** behavioural tests and type checks say nothing about how a page reads. Look at it, at
  phone width.

### L-18 — A screenshot script bug looked like an app bug
Clicking "Show all attempts" relabels the button to "Hide", so a pre-collected locator list went
stale and timed out. The app was fine; the script re-queries now.

---

## Process

### L-19 — Platform permissions are not credentials
Being granted "full permission" did not supply a GitHub login, an AWS account, or a Ring token. Work
that genuinely needed those stayed blocked and was reported as blocked, while everything else
proceeded.

### L-20 — A history rewrite was blocked by the safety layer
Removing a workflow file from git history (to push with a token lacking `workflow` scope) was refused
as a destructive git operation. The clean fix — a correctly scoped token — is also the safer one.

---

## Phase 6

### L-21 — An authentication bypass in my own code, found by reading a dependency advisory
- **What happened:** the auth hook decided "is this an API route?" with `request.url.startsWith('/api/')`
  on the raw URL. The router matches on the decoded path, so `GET /%61pi/templates` ran the
  `/api/templates` handler while the hook classified it as a static file and skipped
  authentication. Protected GET routes leaked to anonymous callers, and an encoded
  `POST /%61pi/ring/disconnect` could have cleared a signed-in operator's Ring session.
- **Why the destructive routes survived:** their handlers call `actor(request)`, which throws without
  a session — defence in depth that happened to be in place, not by design for this attack.
- **Caught by:** `npm audit` flagged "authorization bypass via non-canonical URL paths" in
  `@fastify/static`. That advisory was about the dependency, but it described the same class of bug,
  so I wrote 17 tests probing my own policy with encoded paths before changing anything.
- **Fix:** policy keyed on the matched route (`request.routeOptions.url`); actors resolved before side
  effects. The tests fail against the old policy and pass against the new one.
- **Lesson:** never make an authorization decision on a different representation of the request
  than the one the router uses. And read advisories for the *class* of bug, not just the package.

### L-22 — A simulation that could not reproduce the condition, and a test with no exit
- **What happened:** to prove "a root-owned EBS mount breaks SQLite", I `chown`ed a Docker named
  volume to root and started the app. It worked fine — because Docker copies the image directory's
  ownership onto an empty named volume when it is mounted, silently undoing the chown. The healthy
  app then never exited, and the command, which expected a crash and had no timeout, hung for 10
  minutes until the session ended.
- **Fix:** reproduced with a real bind mount (which keeps host ownership, like EBS): root-owned ->
  `unable to open database file`; after `chown 1000:1000` -> healthy. Every container probe now has a
  timeout.
- **Lesson:** check that a simulation actually produces the condition before trusting its result,
  and give every "expect it to fail" probe a deadline.

### L-23 — A major dependency upgrade nothing tested
- **What happened:** `@fastify/static` went 8 -> 10 (breaking). All 176 tests still passed — because
  none of them configured static serving at all.
- **Fix:** 7 tests serving a real temporary dist directory, including path traversal.
- **Lesson:** a green suite after an upgrade only means something if the suite exercises the upgraded
  code. Check coverage of the thing you changed.

### L-24 — Git Bash rewrote Docker arguments
`--tmpfs /tmp` became a Windows path and Docker rejected it. `MSYS_NO_PATHCONV=1` disables the
conversion for Docker commands.

### L-25 — A 4-second rebuild proves nothing about what is inside
After an interrupted session the image rebuilt instantly from cache. Rather than assume it held the
upgraded dependencies, I read the versions inside the image: `@fastify/static` 10.1.5 and no dev
dependencies present.

### L-26 — Record counts written from memory were wrong
Two per-suite test counts typed into TEST_RESULTS from memory were off by one. Recounted from the
runner's JSON report and corrected. Numbers in records come from tools, not recollection.

---

## Phase 7

### L-27 — My own test setup hid the bug a judge would hit first
- **What happened:** the README told readers to open `http://127.0.0.1:5173`. Following it literally
  from a fresh clone, the page refused to connect: `npm run dev:web` starts Vite on `localhost`,
  which on this machine binds IPv6 `::1` only.
- **Why earlier testing missed it:** every browser test in Phases 4 and 6 started Vite with
  `--host 127.0.0.1` explicitly — a flag the README never mentions.
- **Caught by:** cloning the repository into an empty directory and following the README word for
  word, instead of re-using the development setup.
- **Fix:** README now uses `localhost` and says why.
- **Lesson:** test documentation the way its reader will run it — from a clean clone, with only the
  commands written down.

### L-28 — Re-reading my own claims before publishing them
Writing the public friction log forced a re-check of three statements that had been repeated
internally for a day: that the Ring docs "implied" a flat shape (they did not — L-01), that no live
view was started before the unexplained `on_demand` record (true of the harness, not provably true of
the Playground UI that was open), and that live view was "used" (never exercised). All three were
corrected before anything was published.
- **Lesson:** a claim becomes more dangerous the more often it is repeated, because repetition feels
  like verification. Re-derive anything that is about to leave the team.

---

## Phase 5 (Bedrock integration)

### L-29 — A test double that was too helpful
- **What happened:** the HTTP failure test used a fake runtime that threw an already-sanitised error.
  The route's own sanitising was never exercised, so logging raw AWS error text (account ids, ARNs)
  would not have been caught.
- **Caught by:** mutation testing — the "log the raw error" mutation survived.
- **Fix:** the fake now throws the raw AWS-shaped error, so the route must do the sanitising.
- **Lesson:** a test double should be at least as hostile as the real dependency, not friendlier.

### L-30 — An optional peer dependency that npm still enforces
Strands marks zod as an optional peer, but npm refused to install it beside zod 3. Forcing it would
have broken `npm ci` everywhere else; upgrading zod was the honest fix (D-055).

### L-31 — Read the SDK, then prove it, before integrating
The Strands API was learned from its type definitions and README, then confirmed by a throwaway
probe against the real package (scripted model, JSON-schema tool, unknown tool name) before any
project code was written. The probe also showed that the SDK has no step limit and checks
cancellation only between steps — both of which needed handling (D-059).

### L-32 — Windows Node cannot read Git Bash's /tmp
A shell script wrote to `/tmp` and a Node one-liner failed to read it back. Scratch files now live in
the session scratchpad with a Windows path.
