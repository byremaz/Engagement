# ASAS Challenge — UX Diagnosis and Role Journeys

Grounded in the current code (`apps/web/src`, `packages/shared/src`) and the supplied screenshots.
Every finding below is verifiable in the repository at the commit this document was written against.

---

## 1. Diagnosis

### 1.1 There is no localization layer at all
A workspace search for `lang|locale|i18n|dir=|rtl` under `apps/web/src` returned **zero matches**.
Consequences:

- Every visible string is hard-coded English inside component templates
  (`play.component.ts`, `host.component.ts`, `display.component.ts`, `join.component.ts`).
- Domain copy is hard-coded English in `packages/shared/src/content.ts`:
  `GAME_TITLES`, `HOW_TO_PLAY`, ORDER `prompt` / `direction` / option `label`, and
  `CountryContent.name`.
- `styles.css` pins `direction: ltr` on `html, body` and uses physical
  `left` / `right` / `margin-left` style properties, so an RTL pass could not
  have worked even if strings were translated.

**Fix direction:** a signal-backed `LocaleService` + `TranslatePipe`, typed `en`/`ar`
dictionaries, per-role persistence, logical CSS properties, and Arabic label fields
added *alongside* (never replacing) the ID-keyed content.

### 1.2 The host dashboard has a flat hierarchy
In `host.component.ts`:

- Stage control, Race signals, Session, Rehearsal, and a wide device roster table are
  rendered as sibling `.card` elements of **equal visual weight**.
- Every entry of `available()` from the `ACTIONS` table is painted as one
  undifferentiated button row, so *the next action is not identifiable*. A host under
  stage pressure has to read 6–8 buttons to find "Start Round".
- The signal controls render regardless of `snap()?.gameType`, so RED/GREEN buttons are
  present and clickable during GEO and ORDER rounds where they mean nothing.
- The Auto-mode notice is rendered through `.alert-error` styling, so a purely
  informational state looks like a failure.
- `err()` is never cleared when the snapshot changes, so a stale error from a previous
  stage stays on screen.

**Fix direction:** a three-zone shell (status bar / progression strip / live area), a single
stable primary-action slot derived from the effective state, secondary actions demoted to a
"more actions" row, drawers for exports + session admin + rehearsal, an RLGL-only signal
panel, and `err()` cleared in the snapshot `effect`.

### 1.3 PAUSED is not the dominant instruction
- `play.component.ts` renders pause as a small `alert-info` line while
  `app-hold-button` still receives `[color]="signal()"` — so a full-bleed green
  "GREEN — GO" control keeps visual dominance while the round is actually frozen.
- `display.component.ts` repeats the problem: `.signal.huge` dominates and pause is a
  small badge.

**Fix direction:** an *effective state* (`PAUSED` wins over `GREEN`/`RED`) computed once and
passed to phone, host preview, and display; the previous signal survives only as small
secondary context; the hold control is disabled while paused.

### 1.4 Participant results are a bare number
`MyRoundState.result` is only `{ raw: number; label: string }`, and the `GameResults` view
shows the tournament total and rank with **no** round score, game score, outcome
explanation, or "what happens next".

**Fix direction:** extend `MyRoundState.result` additively to
`{ raw, label, roundPoints, roundMax, gamePoints, gameMax, tournamentTotal, tournamentRank }`,
populated in the API from the **existing** `round-scoring.ts` and `standings.service.ts`
outputs. No new scoring math and nothing invented on the client.

### 1.5 The shared display is document-style, not a presentation
- Dark cards plus `app-standings-table [pageSize]="12"` — a table-first, read-at-a-desk layout.
- A fixed three-slot podium built from a top-three-ties computation that collapses large ties
  into arbitrary places.
- Page-level vertical scrolling in the normal flow.
- Permanently visible mute/volume chrome competing with the content.

**Fix direction:** fixed-viewport composition (`100dvh` / `overflow: hidden`), one dominant
visual per stage, a leader summary plus ~8–10 readable rows, a tied-leaders band driven by the
real `rank` values, host-driven paging over the snapshot, and audio/fullscreen moved into a
discreet setup overlay.

### 1.6 Game-level readability and discoverability gaps
- **RLGL:** the runner avatar is positioned with a raw `left: %`, so it is clipped at 0% and
  100%; the arena shows full names for up to 100 players and an uncapped elimination feed.
- **GEO:** no rotate/zoom/tap demonstration, no explicit pin status
  (not placed / saved / locked), no Reset View, and controls can sit over the likely target.
- **ORDER:** cards are compact with no drag handle, no visible insertion position, no keyboard
  or touch alternative to dragging, and Lock can cover the last card.
- **All three instruction screens** lead with prose rather than one sentence + three visual
  steps + a tiny demonstration.

---

## 2. The three role journeys

### 2.1 Participant — "a personal game controller"
```
Join (name only)
  → You're in (recovery code, what's coming)
  → Instructions (1 sentence · 3 steps · tiny demo · I'm Ready)
  → Practice (unscored, same controls)
  → Ready / Countdown (what to look for)
  → Round active (ONE dominant control, timer, effective state)
  → Locked (explicit confirmation, nothing revealed)
  → Reveal (outcome sentence → this round → this game → tournament → next step)
  → Game results → Final results → Thanks
```
Principles: name only at entry; avatar auto-assigned; points and rank appear **once**;
language toggle (EN / ع) in the header switches only this phone; the primary action stays
reachable with the on-screen keyboard open; PAUSED is a full-width dominant panel.

### 2.2 Host — "a live-event control desk"
```
Status bar     title · join code · effective state · game · round X/Y · round time · event time · sockets
Progression    Lobby → Instructions → Practice → Game → Results  (+ 3-dot game progress)
Live area      stage info · audience preview · ONE primary action · secondary actions
Drawers        Roster · Exports · Session admin · Rehearsal
```
Principles: fits 1366×768 without page scroll; exactly one primary action at a time derived
from the authoritative state; "prepare the next round" and "start it" stay distinct;
destructive actions (void / close session) live away from progression with explicit
consequences; counters render only in stages where they mean something; the host's dashboard
language is independent from the display language.

### 2.3 Shared display — "a presentation for the whole room"
```
Lobby        join code + QR, joined count, "no players yet" guidance
Instructions one sentence + three steps, huge
Round        one dominant visual (arena / globe / cards) + big timer + effective state
Reveal       the answer, the room's distribution, top five
Standings    leader summary + 8–10 rows, host-paged
Ceremony     tied-leaders band from real ranks, then full table
```
Principles: fixed viewport, no document scrolling, transitions run **only** after the host
authorizes the stage, animation completion never starts a round, results stay long enough to
read, long names / many tied winners / large scores are constrained so nothing leaves the frame.

---

## 3. Invariants this redesign must not break
1. The server stays authoritative: `seq`-ordered snapshots, host-only stage transitions.
2. Scoring math in `packages/shared/src/scoring.ts` is unchanged.
3. Solutions (`correctOrder`, `explanation`, `countryCode`, `revealView`) stay stripped until
   the host reveals.
4. Option `id`, `code`, `questionId`, and `correctOrder` are the only score-bearing identity
   and are **never** translated.
5. New snapshot / `MyRoundState` fields are optional so an older client cannot crash.
6. No accidental revival: reconnection restores the real life state.
