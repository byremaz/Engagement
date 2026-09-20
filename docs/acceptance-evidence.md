# Acceptance evidence and operating notes (spec §15, §16)

This file records how each acceptance criterion is verified, the data sources used, and known
operational limitations. Automated checks run with `npm test`; manual checks must be repeated during
the venue rehearsal (AC-02, AC-16, AC-24, AC-25).

## Automated evidence

| ID | Evidence |
|---|---|
| AC-03 | `packages/shared/test/scoring.test.ts` - game totals use fixed denominators (300 / 800 / 1000); practice rounds carry `purpose: 'practice'` and are never written to the score ledger (`rounds.service.ts`). |
| AC-04 | `apps/api/test/race-engine.test.ts` - only GREEN grants distance; red violation eliminates once and emits one event; stale hold (disconnect) never kills. |
| AC-05 | `scoring.test.ts` "ranks finishers ... scores the rest by progress": 75 % alive = 60 raw, eliminated = 0; 100+0+80 -> 600. |
| AC-06 | `apps/api/test/geometry.test.ts` - inside (Riyadh/SAU), boundary midpoint (EGY), outside (Mediterranean/EGY, Cairo/BRA), islands (Hokkaido/JPN, Tasmania/AUS, MDG). |
| AC-07 | `geometry.test.ts` - 1,000 km = 80 raw, 5,000 km = 0, eight perfect pins = 1,000. |
| AC-08 | `scoring.test.ts` "awards 25 per absolute position" - 75 is unreachable for four unique cards. |
| AC-09 | `participation.service.ts` rejects submissions after `closesAt`, replaces earlier answers per attempt, and ignores voided attempt IDs. |
| AC-10 | `race-engine.test.ts` "RaceEngine pause" - progress frozen, holds cleared, no elimination on resume. |
| AC-12 | `rounds.service.ts` `voidRound` writes `round_attempts.void_reason`; scoring reads only the latest non-void attempt. |
| AC-13 | `scoring.test.ts` "Standings and ties" - displayed totals -> perfect games -> shared rank; no name ordering. |
| AC-18 / AC-19 | `transitions-and-device.test.ts` "Device detection" - empty headers yield `Unknown` / `Not available` without throwing. |
| AC-21 | `transitions-and-device.test.ts` "Host transitions" - timers only reach `InputLocked`; START/REVEAL/NEXT require host actions. |
| AC-22 | `transitions-and-device.test.ts` "Auto signal schedule" + race engine: mode change never resets tolerance or revives players. |

## Redesign v2 evidence (docs/redesign-plan-v2.md, 20 Sep 2026)

Scoring rule version `2.0.0` supersedes the AC-05 / AC-07 / AC-08 formulas above for sessions created
after this date; earlier sessions keep `1.2.0` (`scoringRules()` selects by the frozen version).

| Plan item | Evidence |
|---|---|
| §9 A — race outcomes persisted for every attempt, early close on "all done" | `apps/api/test/rounds-service.test.ts` "Race outcomes survive across attempts": practice then scored race → `writeRaceOutcome` rows for the scored race (0 before the fix); tick closes the round with the CURRENT attempt id. |
| §9 B — no stale race state in globe/order rounds | `rounds-service.test.ts` "myState() reads the race engine only for a race attempt". |
| §9 D — tie-break rotation and void | `rounds-service.test.ts` "Tie-breaks": TIE-01 → void → TIE-02, `tie_break` cleared. |
| §9 E/H — a round is never counted twice | `rounds-service.test.ts` "A scored round is never counted twice": `START_GAME` after a scored reveal is rejected; `gameRawTotals` sums the latest attempt only. `transitions-and-device.test.ts` "final results never skip the last game results". |
| §9 I — restart recovery | `rounds-service.test.ts` "Restart recovery": live race voided + replayed to `Ready`; live globe round paused. Observed live on 20 Sep: three stale sessions recovered on boot (`RECOVER_RESTART` audit rows); a second restart at 11:27 during a practice race logged `recovered RLGL attempt … after restart` and the session came back in `Instructions` with a fresh attempt id. |
| §9 J — race ticks do no DB work | `rounds-service.test.ts` "Race ticks are cheap": query count unchanged over 6 ticks, ≥3 `race` events. |
| §7 scoring v2 | `packages/shared/test/scoring.test.ts` "Scoring v2": every worked example of plan §7 (100 / 93.3 / 86.7 / 80 / 54 / 30 / 0; 97.6 / 92 / 84 / 80 / 78 / 70 / 60 / 40 / 0; 97 / 92 / 85 / 80 / 40 / 0; game totals 433 / 933 / 755 / 638); v1 still 25 per card and N-based. |
| §7.5 active time | `packages/shared/test/timing.test.ts`: pause + resume (with its 3 s countdown) excluded; agrees with the pause-record oracle across two pauses. |
| §8 podium order | `packages/shared/test/podium.test.ts`: 3 → 3+2 → 3+2+1; ties as bands; three tied for first reveal only at step 3. |
| §9 E tolerance | `apps/api/test/race-engine.test.ts` "RaceEngine v2 inputs": 700 ms default, per-session tolerance honoured, active finish time excludes a pause. |
| Design tokens | `npm run lint:tokens -w apps/web` — every `var(--…)` in `apps/web/src` is defined in `styles.css` (100 tokens). |
| Headless rehearsal | `docs/rehearsal-race-auto.sh` (AUTO signals, 20 bots, 3 races) and `docs/rehearsal-walkthrough.sh` (all three games, podium steps, ceremony, `rounds.csv` with Time/Base/Speed) — results recorded below. |

### Headless rehearsal results (20 Sep 2026, PostgreSQL, 20 bots)

**Full walkthrough** (`docs/rehearsal-walkthrough.sh`, session `37c02661…`): all three games, 3 + 8 + 10
scored rounds, per-game podium steps 1→4 after each game, ceremony steps 1→4, `rounds.csv` header carries
`Time (ms) / Base / Speed / Detail / Rule Version`, every scored row has `Rule Version = 2.0.0`.

| Check | Result |
|---|---|
| Races close early when nobody is still running | wall time 61 / 68 / 45 s against an 83 s deadline |
| Race outcomes persisted and scored | 20 rows per race, finishers `base 80 + speed 20`, eliminated `0` |
| Globe rounds (8) without any phone reload | every round 20 answers, mean 81–92, max 93–98 (inside + speed bonus) |
| Order rounds (10) | rounds 1–6 and 10: 20 answers each, mean 55–73, max 94–98 |
| Final standings | #1 1883 (333/906/644), #2 1794 (333/906/555), #3 1539 (0/897/642) |

Two anomalies in that run are environmental, not defects, and are recorded here so they are not
re-investigated: (1) the laptop entered Modern Standby at 10:44:38, 10:46:10, 10:46:36 and 10:46:47–11:19:28
local time (Windows `Kernel-Power` events 506/507), which froze the API process during ORDER rounds 7–9 —
round 7 closed 50 s after its deadline, the bots' submissions were rejected as late, and the host poll waited
1,968 s for round 9; (2) RLGL round 3 scored 0 for everyone because that run used the previous bot tuning
(all 20 bots eliminated) — see the race rehearsal below.

**Race rehearsal with tuned bots** (`docs/rehearsal-race-auto.sh`, session `2a462a7a…`, 11:28 local, fresh API):

| Race | Finished / out | Wall time (deadline 83 s) | Top 3 (raw = base + speed) | `rounds.csv` |
|---|---|---|---|---|
| 1 | 8 / 12 | 63 s | 100 / 99.7 / 99.6 | 20 rows, mean 39.7, finisher `Time (ms)` = 57058 |
| 2 | 8 / 12 | 69 s | 100 / 100 / 99.7 | 20 rows, mean 39.5 |
| 3 | 9 / 11 | 77 s | 100 / 99.5 / 99.5 | 20 rows, mean 44.0 |

Game podium after step 4: #1 997, #2 994, #3 985 — three distinct ranks, no massacre and no three-way tie.
Eliminated rows carry `state=eliminated;progress=…`, raw 0 and an empty Time column (they have no finish time).

**Phone hold bug (20 Sep, afternoon).** Report: "holding barely moves, 4 % at most". A scripted socket
client reached 38 % in 20 s (server path healthy, ack p95 5 ms), but the real Angular UI driven in
headless Chrome through CDP released the pad within one frame of every press (`holding:false`, 0.1 %).
Root cause: the hold button's `effect()`s called `up()`, which reads the `holding` signal, so each press
re-ran the effect and released itself. Fix: the release runs `untracked`. Same probe after the fix:
mouse 0 → 11.3 % in 4 s, emulated touch 11.3 → 23.6 % in 5 s (3 %/s, the engine speed). The same
pattern wiped the player's draft order and lock time on every snapshot in `play.component.ts`; fixed
by tracking a value-memoised `attemptKey` instead of the snapshot object.

**Display arena, every racer visible.** `race-arena.component.ts` is now a self-packing grid of bar
cards (the card background is the progress bar) ordered by player number. Headless captures at
1920×1080 with 50 bots: 6 × 9 cards, names ≈ 26 px, rank badges on the top 3, eliminated cards flash
then dim (`display-50-en-*.png`, `display-50-ar-*.png` in the session scratchpad).

**Revision v2.1 (20 Sep, evening, owner request: harder race, 5 ordering rounds, globe reveal).**
Tolerance 450 / 400 / 350 ms per race with fake-out greens in races 2-3; bots calibrated to release
inside the tolerance and lapse on ~11 % of reds. `docs/rehearsal-race-auto.sh` after the change:

| Race | Finished / out | Wall time | First finish |
|---|---|---|---|
| 1 (450 ms) | 12 / 8 | 61 s | 54.0 s |
| 2 (400 ms, fake-outs 15 %) | 5 / 15 | 75 s | 68.5 s |
| 3 (350 ms, fake-outs 25 %) | 9 / 11 | 79 s | 69.5 s |

Every race remains winnable (the 48 s minimum green still holds for all seeds, `transitions-and-device.test.ts`),
finishing now takes 54-70 s instead of 54-60 s, and a real room will fall more often than these bots.
`scoring.test.ts` covers the five-round Order It! total (3 × 93 + 40 + 0 → 638; 5 × 100 → 1000).

### Manual checks still open for v2 (need real devices)

M1–M14 in `docs/redesign-plan-v2.md` §11.3: elimination takeover + vibration on iPhone/Android, 700 ms
fairness, globe touch/pinch, ORDER drag on iOS Safari, Arabic rendering with the self-hosted font,
reconnect mid-round, display audio/fullscreen from the back of the room, p95 latency with 100 bots.

## Corrective contract verification (plan §9.9, 15 Sep 2026)

### To-do 21 — participant join URL vs authenticated host (source-verified)

The reported "host screen under a join URL" was listed as **Investigate**, not a confirmed defect.
Reading the routing and authorization layers shows the separation holds; no code change was required.

| Claim | Evidence |
|---|---|
| A join URL can never render host controls | `apps/web/src/app/app.routes.ts` — `join/:code` lazy-loads `JoinComponent` only. `host` is the single route loading `HostComponent`; there is no wildcard or nested path that reaches it. `**` redirects to the participant join screen, so an unknown/mistyped URL degrades to the *participant* entry point, never the host one. |
| Host REST routes reject an unauthenticated caller | `HostActionsController` and `ExportsController` (`rounds/rounds.controller.ts`) and `SessionsController` (`sessions/sessions.controller.ts`) each carry a **class-level** `@UseGuards(HostGuard)`, so every current and future method inherits it. `rehearsal.controller.ts` is guarded the same way. |
| The guard is not bypassable by a crafted header | `sessions/host.guard.ts` compares `x-host-key` against `HOST_ACCESS_KEY` using `timingSafeEqual` with an explicit length pre-check, and throws `UnauthorizedException` when the header is absent. The key is read from config, never hard-coded [secure-coding]. |
| Participant endpoints carry no host powers | `JoinController` (`@Controller('join')`, deliberately **unguarded**) exposes exactly three operations: lobby preview, join, and identity restore. It returns `publicSession()`, which omits capacity, indices, signal mode, `contentFrozen` and `closedAt` — the host-only projection `hostSession()` is used solely inside the guarded controller. No stage action, signal, roster or export is reachable from it. |
| A participant cannot drive the race | The only race mutations are `HostActionsController.signal()` (guarded) and `RaceController.input()`, which accepts a hold/release boolean for the caller's *own* participant id and returns only that player's `{ progress, state }`. |

**Conclusion:** host authority is enforced server-side by a guard, not merely hidden in the UI, and
the participant projection leaks no host state. The original observation was most likely a host
browser session open on `/host`, not a join URL rendering host controls. No defect found; no change made.

## Manual checks (record results on event day)

| ID | Procedure | Result |
|---|---|---|
| AC-01 | Host dashboard -> **Rehearsal** card (`host.component.ts`, count 1-100) -> add 100 simulated participants; run all three games; verify no duplicate scores in `standings.csv`; then **Remove all**. | |
| AC-02 | One iPhone and one Android phone complete all games with one identity each against the shared display. | |
| AC-11 | Reload a phone mid-round; use the recovery code on a second device; confirm score, locked answer and life state persist and the first device is disconnected. | |
| AC-14 | Compare `standings.csv` with the ceremony table; include a name in Arabic script. | |
| AC-15 | Call `POST /v1/sessions/:id/actions` without `x-host-key` -> 401/403; ordering solutions absent from participant snapshots before reveal. | |
| AC-16 | Full rehearsal fits 30 minutes; text readable from the back row at 1920 x 1080. | |
| AC-17 | Walk every screen and error message; UI is English, names unchanged. | |
| AC-20 | How to Play appears before each game; I'm Ready never starts play. | |
| AC-23 | Eliminated player reconnects and stays eliminated; respawns at next host-started race. | |
| AC-24 | Trigger simultaneous eliminations with simulated players; one audio cue, all avatars animate; reconnect does not replay sounds. | |
| AC-25 | Display: click the start overlay ("Click to initialise display audio"), hear the test tone, toggle mute, adjust volume; phones stay silent. | |
| AC-26 - AC-29 | Compare `apps/web/src/styles.css` tokens with `colors.pdf`; run a contrast checker on rendered states; no invented logo (text fallback documented in README). | |
| AC-30 | Keyboard traversal of Order It! (Move Up / Move Down), 360 px viewport, `prefers-reduced-motion`. | |

## Load check target (§15)

Add 100 simulated participants in Rehearsal mode and observe the gateway log: the API stamps every
snapshot with `seq` and `serverTime`; a client can compute delivery delay as `Date.now() - snapshot.serverTime` in the browser console. Engineering target:
p95 state delivery <= 250 ms on a healthy LAN. Record the observed value and network description here
before the event. This is not a guarantee for the venue network.

## Data sources and deviations

- **Map data:** `world-atlas@2.0.2` `countries-110m.json` (Natural Earth 1:110m, ISC licence),
  pinned in `apps/api/package.json`, loaded from `node_modules` at boot. The same geometry drives
  scoring and the reveal highlight. 1:110m simplification means coastlines are coarse; pins within a few
  km of a coast may score slightly differently from a high-resolution map. Accepted for this event.
- **Brand assets:** no official Elm or ASAS logo is shipped; text fallbacks are used (AC-29).
  Palette tokens live in `apps/web/src/styles.css` and mirror `colors.pdf` page 1.
- **Fonts:** system font stack; no official font is claimed.
- **Scoring rules:** `packages/shared/src/scoring.ts`, `SCORING_RULE_VERSION` is frozen into the
  session snapshot when the host starts the event.

## Known operational limitations

- Rehearsal bots share the API process; adding more than 100 per call is rejected.
- The display must receive one local click to unlock audio (browser autoplay policy).
- Recovery codes are shown on the phone after joining and stored on the device; the server keeps only a
  hash, so a lost code cannot be re-read by the host (the host can remove the duplicate record instead).
