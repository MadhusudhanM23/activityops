# T1 - Playground token

**Status:** PARTIAL - auth-failure shape captured; natural expiry not observed

## Hypothesis
A Playground one-click token authenticates Partner API calls and expires after a stated validity,
after which calls fail with a distinguishable auth error rather than an empty result.

## Date / time
2026-10-07. Token issued 11:12:42 UTC, `exp` 11:42:42 UTC. Testing ran 11:20-11:31 UTC.

## Environment
Ring Developer Playground one-click OAuth token. The Playground UI states: "Token expires in 30
minutes. Generate a new one after expiry. Do not expose this token publicly. Closing this tab will
clear the token."

## Request
Authenticated calls throughout the gate, plus a deliberate negative control with an invalid token.

## Result
- Valid token: `200` on every `GET` attempted.
- **Invalid token: `401`**, empty body.
- JWT claims (decoded locally, never written to disk): `scopes: ["ava.v1:read"]`, 30-minute lifetime
  (`exp - iat = 1800`), issuer `RingOAuthService-prod:us-east-1`.
- Natural expiry was **not** observed - testing finished before `exp`.

## Interpretation
The 30-minute validity in the spec is confirmed both from the token itself and from the Playground
UI. A failed auth is a clean `401`, clearly distinguishable from a successful-but-empty
`200 {"data":[]}` - precisely the distinction spec sec. 10 depends on. The empty-history case was
observed separately during this gate, so both sides of that distinction are now evidenced.

**The token is read-scoped** (`ava.v1:read`). It still reached the WHEP session endpoint, which
answered `400 MALFORMED_SDP_OFFER` rather than `403`, so write paths are not uniformly blocked.

## Evidence
`raw/_log.json` (local, git-ignored). The token itself is deliberately recorded nowhere.

## Decision
- Treat `401` as `RECONNECT_REQUIRED`, never as negative site evidence (sec. 10).
- A judge-facing reconnect flow is required, as the spec already assumes.
- Do **not** special-case `403` as an auth failure - see T7, where `403` was a request-validation
  error.

## Impact on product
Confirms the Live Test Mode design in spec sec. 19 and the error classification in sec. 10, with one
refinement: classification must read the error `code`, not only the HTTP status.

## Next action
Observe a natural expiry on a later Playground session and capture the exact body. Low priority -
the `401` shape is already known.
