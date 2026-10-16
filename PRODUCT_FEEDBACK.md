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

**Onboarding (zero to hello world):** a Playground token reached a real `GET /v1/devices` response
in the first session. Authentication was quick; the time went into discovering the response shape
by calling the API (F-02).

**Would we build with it again?** Yes. The contract is consistent and machine-readable once known,
and Event History is exactly the primitive an accountability workflow needs: a record that a session
happened, with times, on a named device.

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

**Onboarding:** the fastest part of the whole build - signed in, clicked once, had a working token.

**Would we build with it again?** Yes, and it is what made a judge-testable Live Test possible
without hardware. An offline simulated device with no way to wake it was the one real limit.

## AWS

**Which AWS services we used, and how (AWS Builder mini challenge)**

| Service | How we used it | Status |
|---|---|---|
| **Strands Agents for TypeScript** (`@strands-agents/sdk` 1.20.0) | The operations copilot is a Strands agent: our system prompt, a fixed task (no free-text prompt), ten read-only run-scoped tools registered as JSON-schema tools, a step limit, a wall-clock timeout, and an output guard that withholds any claim the evidence cannot support | **Used at runtime.** Run for real on 2026-10-10 - completed in ~10 s, the agent chose 6-7 tool calls on its own ([evidence](evidence/ai/strands-gemini-handover.json)) |
| **Amazon Bedrock** (Strands `BedrockModel`; direct Converse API fallback) | The intended production model path for the same agent | Implemented and tested offline. **Invocation refused** on our account - see below |
| AWS CLI v2, `aws login` | Local credentials with no long-lived keys | Used |
| AWS Budgets | Zero-spend alert while testing | Used |
| Amazon EC2, encrypted EBS, IAM instance role, Secrets Manager, CloudWatch | Deployment designed; container steps verified locally ([deploy/README.md](deploy/README.md)) | Not deployed - a hosted URL is not required, and the account restriction below applies |

**Strands Agents - what worked well**
- The agent loop worked first time against a scripted model in tests, and refuses tool names that
  are not registered - a safety property we did not have to build.
- Swapping the model provider is one constructor: the same agent ran on `BedrockModel`, an
  OpenAI-compatible local model and `GoogleModel` without changing tools, prompt or guard.
- Plain JSON-schema tools meant no schema library was forced on us.

**Strands Agents - what needs work**
- No built-in step limit or wall-clock timeout for an agent run inside an HTTP request; we added both.
- Optional peer dependencies (`openai`, `@google/genai`) fail only at run time when missing; a clearer
  install-time hint would help.

**Amazon Bedrock - what needs work**
- A new account's first call returned `ThrottlingException: Too many tokens per day, please wait`
  when the real quota was `0.0` and not adjustable (F-08). The message sent us to wait instead of
  fixing the account.
- The same call gave different errors by region, and a non-zero quota row existed for a model the
  account could not invoke (F-09).

**Onboarding (zero to hello world):** Strands - minutes, in tests. Bedrock - AWS sign-in, CLI and
the control plane worked within an evening; a completion never arrived because of the quota.

**Would we build with these again?** Strands: **yes** - provider-agnostic agents with our own safety
controls on top is exactly the shape an operations copilot needs. Bedrock: **yes**, once the
new-account quota is explained in the error itself; the integration is already written.

## Feature requests

| Request | Why it matters to ActivityOps | Priority |
|---|---|---|
| Ring Playground: bring the simulated device online, or create a live-view session record on demand | Without it we could not demo a fresh session or measure indexing delay (F-05) | Critical |
| Bedrock: when a model's quota is zero, say so in the error (with the fix) instead of "please wait" | A new account cannot tell a temporary throttle from a block (F-08) | Critical |
| Ring API: apply the `event_types` filter, or reject unknown values with `400` | A silently ignored filter returns the wrong records (F-01) | Important |
| Ring API: `400` for malformed requests, `403` only for authorization | Prevents false "reconnect your account" prompts (F-03, F-04) | Important |
| Ring docs: one example response per endpoint, with timestamp units | The envelope and epoch-millisecond times were only discoverable by calling (F-02) | Important |
| Ring docs: what creates an `on_demand` record, and whether `end` can be in the future | Products that treat session records as evidence need fixed semantics (F-06) | Important |
| Strands Agents: built-in step limit and wall-clock timeout per agent run | Every server-side agent needs both; we wrote our own | Important |
| Ring Playground: optional longer-lived development token | 30 minutes makes long test sessions stop-start (F-07) | Nice-to-have |
| Strands Agents: install-time hint for optional peer dependencies (`openai`, `@google/genai`) | They currently fail only when first used | Nice-to-have |

