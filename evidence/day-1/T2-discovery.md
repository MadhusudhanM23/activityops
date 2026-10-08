# T2 - Device discovery

**Status:** RUN - PASS

## Hypothesis
`GET /v1/devices` returns the devices on the Playground account with a stable provider device id and
a status field, and the count is whatever the account holds.

## Date / time
2026-10-07, 11:20:40 UTC (server `Date` header).

## Environment
Ring Developer Playground, one-click OAuth token, scopes `ava.v1:read`.

## Request
`GET /v1/devices?include=status,capabilities,location,configurations`

## Result
`200`, 5769 bytes, 1748 ms. **Device count: 1** - "Playground Device".

The response is **JSON:API**, not the flat object shape we had assumed (the documentation landing
page lists endpoint paths but does not describe response envelopes):

```
{ data: [ { type: "devices", id: "<113-char opaque id>",
            attributes: { name, image_url },
            relationships: { capabilities, configurations, status, location } } ],
  included: [ locations, device-status, device-capabilities, device-configurations ],
  meta: { time: "2026-10-07T11:20:40Z" } }
```

Provider device ids are long opaque strings of the form `ava1.ring.device.<96 chars>`.

`GET /v1/devices/{id}/status` returned `200` with:

```json
{ "online": false, "reported_at": "2026-10-07T11:19:11Z", "state": null,
  "audio": { "snooze": { "active": null, "until": null } } }
```

Capabilities include `video` (AVC, 1080 max, 16:9), `motion_detection`, and
`image_enhancements.configurations` containing `snapshot`.

## Interpretation
Discovery works and is dynamic. The account holds **one** device, so any UI or demo script assuming
three devices would be wrong. Spec sec. 20 already requires showing "N required devices discovered"
dynamically; that is now a measured requirement rather than a precaution.

**The device reports `online: false`.** That is the Case A condition in our readiness model
(sec. 10), and it is why no live-view session could be initiated during this gate.

## Evidence
`T2-devices-redacted.json`, `T2-status-redacted.json`.

## Decision
- Normalize the JSON:API envelope in the adapter: entities arrive under `data`, side-loaded objects
  under `included`, and relationships carry the device binding.
- `device.status` maps from the included `device-status.attributes.online`:
  `true -> AVAILABLE`, `false -> UNAVAILABLE`, absent or unreadable -> `UNKNOWN`.
- Store `reported_at` as `last_status_at`.

## Impact on product
Confirms the schema's `provider_device_id TEXT` (ids are long opaque strings, never integers) and
the three-state device status already in `schema.sql`. Seed and demo data must not promise a device
count.

## Next action
Phase 3 adapter: parse this envelope, using a redacted fixture taken from this capture.
