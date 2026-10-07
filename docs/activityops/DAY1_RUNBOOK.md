# Day-1 validation runbook (T1-T10)

Spec v7 sec. 21-22. Run T1-T8 in **one sitting** — a Playground one-click token is valid about
30 minutes.

## Status of the endpoint paths below

These paths were read from the official Ring Partner API documentation landing page
(<https://developer.amazon.com/docs/ring/api-documentation.html>) on 2026-10-07. They are
**documentation-derived, not yet validated against a live account**. T2/T3 confirm them. If a path
or parameter differs in practice, correct it here and record the difference in
`INTEGRATION_FINDINGS.md` — the observed behaviour wins, and the correction is a versioned note,
never a silent change.

```
API base:   https://api.amazonvision.com
OAuth:      https://oauth.ring.com
devices:    GET  /v1/devices?include=status,capabilities,location,configurations
status:     GET  /v1/devices/{device_id}/status
history:    GET  /v1/history/devices/{device_id}/events
whep:       POST /v1/devices/{device_id}/media/streaming/whep/sessions
snapshot:   POST /v1/devices/{device_id}/media/image/download
clip:       POST /v1/devices/{device_id}/media/video/download
```

## Before you start

```bash
export RING_TOKEN='<paste the Playground one-click token>'
export RING_BASE='https://api.amazonvision.com'
mkdir -p evidence/day-1/raw          # git-ignored: raw captures stay local
```

Rules for everything you capture:

- Never paste a token into a file, a commit, a screenshot, or this conversation.
- Save raw responses under `evidence/day-1/raw/` (git-ignored), then run
  `node scripts/redact.mjs evidence/day-1/raw/<file>.json` and commit only the redacted output.
- Record the wall-clock time of each request — T5 depends on it.
- Record failures exactly as they happened. A failed test is a result, not a problem to hide.

---

## T1 — Playground token

1. Generate a one-click token in the Ring Developer Playground. Note the time.
2. Make any authenticated call (T2 below) and confirm it succeeds.
3. Wait past the stated validity and repeat the same call. Record the **exact** status and error
   body you get when it expires (this drives the `RECONNECT_REQUIRED` overlay).
4. Generate a second token and confirm the reconnect path works.

Capture: time issued, time of first failure, failure status/body, reconnect experience.

## T2 — Device discovery

```bash
curl -sS -D evidence/day-1/raw/T2-headers.txt \
  -H "Authorization: Bearer $RING_TOKEN" \
  "$RING_BASE/v1/devices?include=status,capabilities,location,configurations" \
  -o evidence/day-1/raw/T2-devices.json
```

Capture: HTTP status, **actual** device count, the capability fields present, and whether a device
id and a status field exist per device. Do not promise a fixed device count anywhere in the product
— discovery is dynamic (spec sec. 20).

## T3 — Event History filter

Run the same query twice, with and without the server-side filter:

```bash
DEV='<device_id from T2>'
curl -sS -H "Authorization: Bearer $RING_TOKEN" \
  "$RING_BASE/v1/history/devices/$DEV/events" \
  -o evidence/day-1/raw/T3-nofilter.json
curl -sS -H "Authorization: Bearer $RING_TOKEN" \
  "$RING_BASE/v1/history/devices/$DEV/events?event_types=on_demand" \
  -o evidence/day-1/raw/T3-filtered.json
```

Capture: do the two responses differ? Does the filtered response contain any non-`on_demand`
record? Also record the `Date` response header against your local clock — that offset is the
diagnostic input for spec sec. 8.5.

**Pass condition is about our code, not Ring's:** client-side filtering must produce the correct
result whichever way the server behaves.

## T4 — Pagination

Follow `links.next` by hand for at least two pages if the account has enough history.

Capture: is the order newest-first? What exactly does `links.next` look like (absolute or
relative)? Does the same next URL ever repeat? Where does it stop?

## T5 — Timing / indexing delay

The single most important measurement — it sets `post_window_observation_margin_seconds`.

1. Note the wall-clock time, then trigger a live-view session in the Playground.
2. Note the HTTP response time.
3. Poll Event History every ~10s and record the first time the new `on_demand` record appears.
4. Repeat 3-5 times if the token allows.

Capture: simulation time, response time, first appearance, delta per run.

## T6 — Media side-effect test

1. Record a baseline of the latest history events.
2. In isolation — not during any check — POST `/v1/devices/{id}/media/image/download`.
3. Sync history again.
4. Does a **new** `on_demand` record appear that was not caused by a live-view session?

If it does, those events are quarantined as ambiguous and can never satisfy the Ring session gate
(spec sec. 8.9). The MVP rule stands regardless: the readiness workflow never calls media APIs.

## T7 — Snapshot

Capture: response status, redirect behaviour, content type, whether the bytes are a valid JPEG, and
the privacy implications of storing it. Only after this do we decide whether a `SIMULATED` thumbnail
is worth it — and it is cut first if the schedule slips.

## T8 — Live view

Capture: how a session starts, whether it produces a history record, how usable the external tab is
for a demo, and any WHEP behaviour observed.

---

## T9 — Bedrock (BLOCKED — no AWS account yet)

In the real account: choose a model id explicitly, test invocation, confirm the region, confirm the
first-time-use form requirement for Anthropic models, confirm Marketplace/IAM prerequisites, and
observe quota/throttling. **Do not assume Claude is available.**

## T10 — Strands custom tool (BLOCKED — depends on T9)

Implement one minimal read-only tool (`getVerificationRun`), invoke it through Strands, return the
result to the model. If Strands blocks progress, switch to direct Bedrock tool use immediately.

---

## Reporting back

For each test, fill the matching file in `evidence/day-1/` and paste the redacted result. Every
entry needs: hypothesis, date/time, environment, request, result, relevant response, interpretation,
evidence, decision, impact on product, next action.
