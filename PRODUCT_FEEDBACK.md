# Product feedback

Spec v7 sec. 30. Feedback on each Ring and AWS tool this project used, written from what we actually
did with it. Specific friction, with reproduction details, is in [FRICTION_LOG.md](FRICTION_LOG.md).

## Ring Partner API

**Used for:** device discovery and status, Event History, and the error contract. Called
server-to-server only; tokens never reach the browser.

**What worked well**
- Authentication failures are a clean `401` with no ambiguity, distinct from an empty `200`.
- JSON:API with side-loaded `included` resources made device status cheap to fetch alongside
  discovery, in one call.
- Opaque, stable provider ids made idempotent sync straightforward.
- The error envelope (`errors[].code`, `detail`, request `id`, timestamp) is consistent and machine
  readable — once we read the code rather than the status, classification was reliable.

**What would help**
- Example responses on the documentation landing page, especially timestamp units (F-02).
- A server-side `event_types` filter that applies, or rejects unknown values (F-01).
- `400` rather than `403` for malformed requests (F-03, F-04).
- Documentation of what creates an `on_demand` record and whether its `end` may be in the future
  (F-06). Products that treat a session record as evidence need these semantics pinned down.

## Ring Developer Playground

**Used for:** the Day-1 validation gate (tests T1-T8) and judge Live Test Mode.

**What worked well**
- One-click tokens got us from zero to real API calls in minutes.
- The token page states the 30-minute expiry and the "do not expose" warning plainly.
- The Explore APIs panel shows the exact `curl` for each call, which made our own harness easy to
  check against.

**What would help**
- A way to bring the simulated device online or to trigger a live-view session record on demand
  (F-05). This single gap blocked our timing measurement and live demo rehearsal.
- An optional longer-lived development token (F-07).

## AWS

| Service | Status in this build |
|---|---|
| Amazon EC2, Amazon EBS (encrypted), IAM instance role, AWS Secrets Manager | Deployment designed and every container-side step verified locally ([deploy/README.md](deploy/README.md)); **not yet deployed** — no AWS account was available |
| Amazon Bedrock, Strands Agents | **Not yet used** — model access not available during the build |
| Amazon CloudWatch | Logging designed to be shippable safely (no secrets in logs, test-verified); not yet connected |

We will add AWS feedback only from real use. We are not filling this section in from documentation.
