# Demo video script — 2 min 50 s, one take plus two cuts

Written 16 October 2026 against the shipped UI (D-063 to D-066). Everything on screen is something
the product does today. Judges may score from this video alone, and are not required to watch past
3:00, so the strongest moment (a real Ring session unlocking PASS by itself) is in the first minute.

## Before you press record (15 minutes)

1. **Fresh data, AI on.** In PowerShell at `E:\ZAH\ZAH` (stop any running `npm run dev` first):
   ```powershell
   Remove-Item apps\api\data\demo.sqlite* -ErrorAction SilentlyContinue
   $env:AI_RUNTIME = "strands-gemini"; $env:DATABASE_PATH = "./data/demo.sqlite"; npm run dev
   ```
   The recorded demo run is re-seeded; the Live runs list starts empty.
2. **Browser:** Chrome, window about 1440 px wide, zoom 100 %, bookmarks bar hidden (Ctrl+Shift+B),
   only two tabs open: **Tab A** `http://localhost:5173`, **Tab B** the Ring Developer Playground.
   Turn on Do Not Disturb.
3. **Tab A:** sign in (`demo.operator` / `activityops-dev-only`, or "Fill demo account"). Go back to
   the Overview page; scroll to the top.
4. **Tab B:** generate a **fresh one-click token**, paste it into Tab A's "Connect Ring Developer
   Playground" card, tick the notice, press **Connect and discover devices**. Confirm the card says
   **Connected** and the device is **online**. Then in Tab B **scroll down to "3. Simulate live view
   event"** and leave it there — the token box must stay off-screen for the whole recording.
5. **Timing:** the token lasts 30 minutes. Start recording within 5 minutes of connecting.
6. **Recorder:** Xbox Game Bar (Win+G) or OBS, 1080p, system audio off, microphone on. Say one test
   sentence and play it back.
7. Read the narration aloud once. It is about 360 words; at a calm pace that is 2:45.

## The take

Times are targets. Narration is in italics. Actions are in bold. Keep the mouse still while talking.

### 0:00 – 0:12 · Overview page, hero in view
> *Every morning a store manager opens up with a paper checklist. Walk the entrance, check the alarm,
> count the float. Nobody can later prove any of it happened. ActivityOps turns that checklist into a
> record you can prove.*

### 0:12 – 0:30 · Start a live run
**Click "Go to Live Test".** The connected card and "1 device discovered" are visible.
> *The site's Ring camera is already connected — this is the Ring Developer Playground.*

**Click "Start a new run"** (opening check). On the run page, **click "Start Ring check"** on the first
card. The stepper and the countdown appear.
> *The first check needs Ring evidence. Starting it opens a five-minute window. PASS is locked until
> a live-view session on this camera is observed inside that window.*

### 0:30 – 0:45 · Trigger the session
**Switch to Tab B. Click "Motion"** under Simulate live view event. **Switch back to Tab A.** The card
reads "Checking Ring history automatically every 15 s".
> *In the Playground I start a live-view session. ActivityOps now checks Ring's Event History by
> itself. While Ring indexes that session, the manager carries on.*

### 0:45 – 1:20 · FAIL, incident, recheck — live, while the camera check waits
On **"Alarm panel disarmed and zones reviewed": click "Start check"**, then **"Record FAIL"**, type
`Zone 3 fault`, **submit**.
> *The alarm shows a fault. FAIL is always allowed. It opens an incident, and readiness goes to Not
> ready — with the reason, and what to do next. No AI is involved in that.*

**Click "Start recheck (attempt #2)"**, then **"Record PASS"**. **Click "Show all 2 attempts"**.
> *The fault is fixed, so I recheck. Attempt one, the FAIL, stays on record forever. Attempt two
> passes.*

In **Incidents**, the lifecycle track shows *Ready to resolve*. **Click "Approve resolution"**.
> *The incident moved along by itself; closing it takes a named person.*

### ~1:05 – 1:25 · The session arrives (whenever the toast appears)
A toast reads **"Ring session found automatically — Record PASS is unlocked"**, and the evidence card
appears on the first check. **Scroll to it; pause on "What this does not establish".**
> *And here is the Ring evidence: a session observed during this check window, bound to this
> attempt only — and, on the card, what it does not prove. It does not show who started the session
> or what they saw. The decision is still a person's.*

**Click "Record PASS"** on the Ring check.

*If the toast has not appeared by the time the incident is resolved, click "Sync Ring history" once
and continue. If it still has not, say "Ring has not indexed it yet", then cut (see Cuts).*

### 1:25 – 1:40 · Approve
The summary bar shows **Ready to approve**. **Click "Record approval".** **Click "Audit trail → Show".**
> *Every required check is decided, so the run can be approved — under the signed-in name. The audit
> trail has every action, who did it and when, including the system steps.*

### 1:40 – 2:15 · The AI copilot (recorded run)
**Click "Overview", then "Open the recorded run".** The Two-minute tour appears. **Click stop 5, "AI
handover note".** The note and its labels are in view: *Strands agent · Google Gemini · not Amazon
Bedrock*, *Recorded output*. **Expand nothing; "What the agent read" is already open.**
> *A read-only AI agent, built on the Strands Agents SDK, drafts the handover note. It reads the run
> through six tools — you can see each call — and it cannot pass a check or close an incident. It
> runs on Gemini today; the Bedrock path is built and switches on with one setting.*

**Scroll up to Incidents; on the resolved alarm incident click "Summarize with AI".** Wait for the
toast (about ten seconds). Scroll to the new *Incident summary* note.
> *The same agent summarises an incident on request. Ten seconds, from recorded facts only.*

### 2:15 – 2:35 · Honesty and the report
**Click tour stop 3, "Override, not a PASS".**
> *An approved exception is shown as OVERRIDDEN — never as a pass.*

**Click "Audit report"** (top right). The report opens. **Hover "Print / Save as PDF"; do not click.**
> *And the whole run prints as a verification report: checks, kept failures, evidence limits,
> incident history, the audit trail. What a manager hands to head office or an inspector.*

### 2:35 – 2:50 · Close
**Click "Overview"; scroll to "Who it is for".**
> *ActivityOps is for small multi-site operators that already own Ring cameras — cafés, pharmacies,
> retail chains. The camera is the witness that a check happened. The person stays accountable for
> the decision. ActivityOps records the check, the evidence, the decision, and what still needs
> action.*

Stop recording.

## Cuts

Two cuts are allowed, both honest:
- If the Ring session took longer than a minute to arrive, cut the dead wait and add a plain caption
  **"about a minute later"**. Never speed the footage up.
- Trim the start and the end.

## If something goes wrong live

| Problem | Do this |
|---|---|
| Playground device shows **offline** at connect time | Record the run anyway: the Ring check goes **Blocked** with a BLOCKER incident and next steps. Narrate: *"The camera is offline — the app says so, blocks the check, and never guesses."* Then do the FAIL/recheck on the manual check and use the **recorded run** for the evidence card (tour stop 1). |
| Token expires mid-take | Stop. Get a new token, reconnect, start over. The take is only three minutes. |
| "Summarize with AI" says busy | Skip it. The handover note and its tool trace are already on screen. |
| Toast never appears and manual sync finds nothing | Say *"Ring has not indexed it yet"*, cut, retry the Ring check once; if it still fails, use the recorded run's evidence card. |

## Rules for the recording

- Every Playground-derived screen is labelled **SIMULATED**, **LIVE PLAYGROUND** or **RECORDED DEMO**;
  leave those labels in frame.
- Never say or caption "detected", "clear" or "safe" about the Ring evidence.
- The Ring token is never on screen. The Playground tab stays scrolled to "Simulate live view event".
- No music. English narration. Under 3:00.
- Upload to YouTube as **Public**. Suggested title: *ActivityOps — opening checks you can prove, with
  Ring evidence (Amazon Developer Hackathon 2026)*. Put the GitHub link in the description once the
  repo is public.
- Re-time against the running product on the day: do one silent dry run first.
