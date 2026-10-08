# T6 - Media side-effect test

**Status:** RUN - **NOT REPRODUCED. No product rule may be derived from it.**

## Hypothesis
A snapshot/media request may or may not create an `on_demand` history record. If it does, such
events are ambiguous and can never satisfy the Ring session gate.

## Date / time
2026-10-07, 11:22-11:27 UTC.

## Environment
Ring Developer Playground, one device, `online: false`, token scopes `ava.v1:read`.

## Request / Result

### Trial 1 - 11:22:13 UTC
`POST /v1/devices/{id}/media/image/download` with body `{"components":[]}`
→ `403 REQUEST_FORBIDDEN` - "Cannot authorize: missing required timestamp fields in request body".

History had been empty (`{"data": []}`) at 11:20:43. At 11:23:52 it contained one `on_demand`
record with `start = 1791372135600` ≈ **11:22:15 UTC**, roughly two seconds after that POST.

That looked like a direct causal hit.

### Trial 2 - 11:26:21 UTC (controlled repeat)
Baseline recorded first (1 event). Then
`POST .../media/image/download` with a valid body `{"type":"latest_in_range","start_timestamp":<now-10min>}`
→ `416 MEDIA_NOT_FOUND`. History polled at +5s, +15s and +30s.

**New events created: 0 at every poll.**

## Interpretation
The correlation did not survive a controlled repeat, so the trial-1 timing is **not** evidence that
a media request creates an `on_demand` record. More likely explanations, none of them tested:
the Playground seeds a session record shortly after a token session begins, or the record was
produced by activity unrelated to our call - including possible activity in the Playground UI,
which was open in a browser during the test window.

Worth noting about that record: `start = 11:22:15` and `end = 11:34:45` - a 750-second span whose
end lay ~11 minutes in the **future** at the moment it was first observed. A record can therefore be
visible while its own window is still open, which matters for the coverage rule.

Per spec sec. 0B, this stays a test case and does not become product truth.

## Evidence
`provider-payload-redacted.json`; trial logs in `raw/` (git-ignored).

## Decision
1. The MVP rule is unchanged and unconditional: **the readiness workflow never invokes media APIs**
   (spec sec. 8.9, 15). It holds whether or not the side effect is real, so the product does not
   depend on resolving this.
2. The `ring_event.is_ambiguous` quarantine column stays in the schema and stays enforced at claim
   time. It is currently never set by the sync - correct, since nothing has been proven.
3. Do **not** record "media creates `on_demand`" anywhere as a finding.

## Impact on product
None to the design. The quarantine mechanism already built in Phase 2 covers the case if it is ever
confirmed.

## Next action
Re-run with a device that is online and with a successful (200) snapshot, which neither trial
achieved. Until then the question stays open and the conservative rule carries the product.
