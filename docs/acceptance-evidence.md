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
