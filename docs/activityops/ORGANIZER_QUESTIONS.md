# Questions to post in the official Ring / hackathon forum

These need answers from people outside the team. Post them now — answers can take days, and two of
the open blockers depend on them. Record each answer, with a link and date, in
`RISKS_AND_BLOCKERS.md`.

## Q1 — Showing the Playground in the public demo video (spec sec. 29, blocker B-003)

> For the Ring Developer Playground path, is it acceptable for our public demo video to show the
> Playground UI and Ring-branded or watermarked live-view media as part of demonstrating the
> required Ring technology? We will clearly label the Playground content as simulated and will not
> imply that it is real-world motion or person detection.

**Until answered:** the README makes no claim of permission, and the video plan below avoids
showing Ring-branded media.

## Q2 — Bringing a Playground device online (blocker B-005)

> In the Ring Developer Playground, our one discovered device ("Playground Device") reports
> `online: false` from `GET /v1/devices/{id}/status`, so we cannot start a live-view session or
> generate a fresh `on_demand` Event History record. Is there a way to bring the simulated device
> online, or a Playground control that generates a live-view session record on demand? We need it to
> measure the delay between a session and its appearance in Event History.

## Q3 — What creates an `on_demand` record in the Playground (finding F-06)

> During testing, an `on_demand` record appeared in Event History without our code starting a live
> view, with an `end` timestamp about 11 minutes in the future when first observed. What creates
> `on_demand` records in the Playground, and can `end` be in the future while a session is still
> open?

## Q4 — The `event_types` filter (finding F-01)

> `GET /v1/history/devices/{id}/events?event_types=motion` returns an `on_demand` record in the
> Playground, and an unrecognised `event_types` value returns `200`. Is the filter expected to apply
> in the Playground? We filter client-side regardless, but would like to describe the behaviour
> accurately in our submission.
