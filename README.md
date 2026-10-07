# ActivityOps

Operator-facing business-site verification for opening, closing and shift handover.

> ActivityOps records the check, the Ring evidence, the operator decision, and what still needs
> action.

Built for the Amazon Developer Hackathon 2026 — Ring track, AWS Builder mini challenge.

## What the Ring evidence means

A Ring Event History `on_demand` record is a **live-view session record**. ActivityOps labels it
"Ring session observed during this check window". It is never presented as person detection, motion
detection, proof that an area was clear, or proof that a site is safe. The operator's attestation
supplies the business decision.

## Status

Phase 0 (foundation) complete. The Day-1 Ring/AWS validation gate (T1-T10) has not been run yet —
see `docs/activityops/INTEGRATION_FINDINGS.md`. No product UI is built before that gate is
recorded, by design.

## Development

```bash
npm install
cp .env.example .env     # fill in locally; never commit .env
npm run dev:api          # http://localhost:8080/api/health
npm run dev:web          # http://localhost:5173
npm test
npm run typecheck
```

Requires Node 20+ (the API uses the built-in `node:sqlite` driver; Node 22+ recommended).

## Project records

Build tracking, decisions, test results, integration findings, risks and the submission checklist
live in [`docs/activityops/`](docs/activityops/). The authoritative specification is
`ActivityOps_Amazon_Hackathon_Master_Spec_v7.pdf`.

## Licence

MIT — see [LICENSE](LICENSE).
