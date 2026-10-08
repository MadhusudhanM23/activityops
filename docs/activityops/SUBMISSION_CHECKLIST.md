# Submission checklist (spec sec. 31)

Deadline: 23 October 2026. Verify the exact Devpost cutoff timestamp on the submission page
immediately before uploading.

- [ ] Correct Ring track selected
- [ ] Ring technology used at runtime, not mocked
- [ ] AWS Builder requirements satisfied
- [ ] Public GitHub repository exists
- [x] Visible license, or configured private reviewer access — MIT `LICENSE` committed
- [x] No secrets or tokens in git history or fixtures — `scan-secrets.mjs --history` clean (2026-10-08); re-run before submitting
- [ ] Hosted judge Review Mode works without a token — works locally and in the container; not yet hosted
- [ ] Live Playground reconnect flow works
- [x] Testing instructions present ("Judge Test — 5 Minutes") — in README; must be updated with the hosted URL
- [ ] Public YouTube/Vimeo video, English, under 3 minutes
- [ ] Product feedback completed for every relevant Ring/AWS tool — Ring done; AWS pending real use
- [ ] Friction log submitted if genuine friction was encountered — `FRICTION_LOG.md` written (7 entries); submit with the entry
- [ ] AWS architecture described accurately
- [x] All demo data labelled SIMULATED or RECORDED DEMO — enforced in UI and API
- [x] Privacy / delete controls demoable — verified in the production container (2026-10-08)
- [ ] Organizer watermark question answered, or video adjusted to avoid the claim
- [ ] Final submission uploaded before the Devpost deadline
