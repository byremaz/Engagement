# ASAS Challenge: Complete Website Requirements

**Version:** 1.2  
**Date:** 8 September 2026  
**Language:** English throughout the specification and website  
**Visual identity:** Elm, using the supplied `colors.pdf`, page 1

> **Revision v2 (20 Sep 2026, `docs/redesign-plan-v2.md`):** this document remains the functional foundation; the rules below were superseded by the approved redesign plan and are implemented under scoring rule version `2.0.0` (frozen per session; earlier sessions keep `1.2.0`):
> - §6.4 red synchronization tolerance **200 ms → 700 ms** (human reaction + venue latency); §6.7 minimum Auto green **36 s → 48 s** (60 %).
> - Revision v2.1 (20 Sep 2026, owner): the 700 ms window made the race too easy, so the tolerance is now **450 / 400 / 350 ms** for races 1–3 (500 ms in practice), reds are more frequent and races 2–3 include short fake-out greens (§6.7). Order It! runs **5 scored rounds** (game still normalised to 1000, §8.5). The globe reveal marks the country's location and a dashed line from the player's pin (§7.4).
> - §6.8 race scoring: finished = `80 + 20 · max(0, 1 − (t − t_first) / 15 s)` (100 ms buckets, independent of N); alive at timeout = `60 · p`; eliminated = 0.
> - §7.5 geo scoring: inside = `80 + 20 · max(0, 1 − t_lock / 25 s)` (manual lock only); outside = `max(0, 80 − d / 50)`; no pin = 0.
> - §8.5 ordering: **20** per correct position (0/20/40/80); a perfect, manually locked order adds `20 · max(0, 1 − t_lock / 20 s)`.
> - §9.2: a per-game podium (3rd → 2nd → champion → table) precedes the game standings; the final ceremony keeps its four steps.
> - §2/§13 language rows: full Arabic and English (see `ASAS-UX-Enhancement-Prompt.md`), with a host-controlled display language.
> Time-to-lock is measured on the API clock as `duration − (deadline − now)` at the manual lock, so pauses never inflate it.

## 1. Purpose and intended outcome

Build a working, real-time website for a 30-minute employee engagement event. More than 50 people will participate individually from their phones while sitting in one room facing a large shared screen. One host controls the event. Participants keep the same identity across three games, and their combined scores determine the event winners.

The approved games, in event order, are:

1. **Red Light, Green Light:** hold to move on green; moving on red eliminates the player from the current race, with a death animation and sound.
2. **Pin the Country:** rotate a globe and place a pin inside the named country; accuracy determines the score.
3. **Order It!:** arrange four cards in the requested order; each correctly positioned card earns points.

The working event title is **ASAS Challenge** and may be changed before the event. Apply Elm's supplied color identity across the website. Show **Built using ASAS** in the lobby and ceremony once the experience has actually been built using ASAS. Elm is the host organization; ASAS is the build attribution. Do not invent an official Elm or ASAS logo.

Deliver a functioning experience across real devices, with a shared backend and persistent results. A browser-only mockup or locally simulated multiplayer screen is not the operational deliverable.

All rules below are the default implementation specification. Configure content and scoring before the tournament, then freeze them for that session. The host may switch the first game's signal control between Manual and Auto without changing scoring rules.

## 2. Scope and fixed requirements

| Area | Requirement |
|---|---|
| Capacity | Support 100 concurrent participants, plus the host and shared display. |
| Competition | Individual participation; no teams or turn-taking for answers. |
| Elimination | In the first game, elimination lasts for the current race only. Players return for the next host-started race and subsequent games. |
| Join flow | QR code or link and session code. Name is the only required personal input. |
| Device capture | Automatically detect the device type and available model information for the host. Detection failure must not block participation. |
| Devices | iPhone and Android phones, a host computer, and a large display. |
| Language | English UI, questions, instructions, controls, results, and errors; left-to-right layout. Preserve participant names entered in other scripts. |
| Host authority | The host starts every practice, game, and round, reveals answers, and advances stages. |
| Timers | Timers close input only. They do not reveal answers or start another stage. |
| Scores | Each game is worth up to 1,000 points; the tournament total is up to 3,000. |
| Persistence | Preserve identity, locked answers, elimination state, and results after reload or reconnection. |
| Content | Include all scored rounds, practice content, spare content, and tie-breakers in this document. |
| Results | Live standings, a top-three ceremony, complete rankings, and CSV exports. |
| Branding | Implement the exact source colors and their documented website roles in Section 13. |

Version 1 does not require employee accounts, team formation, chat, external messaging, cash prizes, or AI-based answer judging. Questions and graphics must be prepared before the event. The content bank may be expanded later without rewriting the game rules.

## 3. Thirty-minute event plan

| Event time | Activity | Included content |
|---|---|---|
| 00:00-03:00 | Join and prepare | QR, names, automatic avatars, device readiness, explanation of the overall score. |
| 03:00-10:00 | Red Light, Green Light | Instructions, a 20-second practice, three races of up to 80 seconds, reveals and transitions. |
| 10:00-19:00 | Pin the Country | Instructions, practice, eight countries; 25 seconds to answer and approximately 20 seconds to reveal each round. |
| 19:00-27:00 | Order It! | Instructions, practice, ten questions; 20 seconds to answer and approximately 15 seconds to reveal each round. |
| 27:00-30:00 | Final results | Any required tie-break, top-three ceremony, and complete standings. |

These blocks include time for explanation and audience reactions. Reveal durations are pacing guidance, not automatic transition deadlines. The host sees the total event timer and an overrun notice. Do not silently remove scored rounds to catch up or change scoring denominators during play.

## 4. Roles, screens, and host-controlled flow

### 4.1 Host dashboard

Provide a protected host interface separate from the participant and display links. The host can:

- Create and name a session; configure its capacity, content, and game order before starting.
- Preview content and rehearse without recording tournament points.
- See connected players, readiness, names, detected devices, and connection status.
- Rename or remove duplicate participant records and help restore an existing identity.
- Open and close joining. New arrivals wait for the next round if admitted after play begins.
- Display instructions, start practice, start games and rounds, and control each reveal and transition.
- See the number of received answers without publishing their contents.
- Use the first game's RED and GREEN controls, or select Auto for signals within the race.
- Pause, resume, or cancel and replay a round after a technical problem.
- Show game standings, tournament standings, and the ceremony.
- Export results and close the session.

Do not provide arbitrary per-player score editing in Version 1. Resolve a defective round by voiding and replaying it for everyone, retaining the reason. Destructive session reset or result deletion requires an explicit confirmation inside the host interface.

### 4.2 Shared large-screen display

Provide a dedicated full-screen display route with no host administration controls. Its views include:

- **Lobby:** event title, genuine logo assets if available, QR code, join code, player count, and avatars.
- **How to Play:** game title, three short steps, a visual example, and scoring or elimination guidance.
- **Live round:** game arena or question, timer, round number, and response count where appropriate.
- **Results:** host-triggered visual reveal, scores, leading participants, and standings.
- **Ceremony:** third place, second place, first place, then the full results table.

Answers and private participant metadata remain hidden until the appropriate reveal. Use the typography sizes in Section 13 and verify readability from the back of the actual room at 1920 x 1080. The display computer is the main audio source.

### 4.3 Participant phone interface

The participant's name is the only mandatory persistent identity label. Show a connection warning when necessary. Display the avatar, participant number, rank, or score where useful for the current game; do not make all of them permanent header clutter.

The phone follows the stage selected by the host. Participants do not navigate to separate game links.

| Game | Main phone interaction |
|---|---|
| Red Light, Green Light | One large hold button, signal state, personal progress, and alive/eliminated/finished status. |
| Pin the Country | Rotate and zoom the globe, place a pin, reset view, and lock the pin. |
| Order It! | Reorder four vertical cards using drag-and-drop or Move Up / Move Down buttons, then lock the order. |

Show **Answer locked** only after server acknowledgment. Show the result and scoring explanation when the host reveals it.

### 4.4 Mandatory explanation before every game

Before each game, open **How to Play** on the shared display and every participant phone. Scored controls are inactive during this stage.

| Game | Participant instructions |
|---|---|
| Red Light, Green Light | 1. Hold the button on GREEN to move. 2. Release on RED; moving gets you eliminated. 3. Reach the finish to score. Eliminated players return next race. |
| Pin the Country | 1. Rotate the globe to find the country. 2. Tap to place your pin, then lock it. 3. Inside the country earns full points; closer pins earn more. |
| Order It! | 1. Read the requested order. 2. Move the four cards from top to bottom. 3. Lock your answer. Each correct position earns 25 points. |

Include a short animated example: hold/stop/elimination, globe/pin, or moving a card. Demonstration animations are illustrative and do not add points.

The phone has **I'm Ready**; the host sees a count such as **Ready 42/60**. Full readiness never starts the game automatically. Instructions remain until the host advances. A late joiner sees the current explanation. A Help control can reopen instructions locally later without pausing the event.

Practice is available before each game and is unscored. The host may skip practice after showing the instructions; the normal event flow must not skip the instructions themselves.

### 4.5 Explicit transition controls

Only the host may issue the following stage-changing actions:

| Action | Effect |
|---|---|
| Show Instructions | Open the current game's explanation on all devices. |
| Start Practice | Start the unscored practice countdown and round. |
| Reveal Practice Results | Reveal the closed practice outcome. |
| Start Game | Prepare the first scored round; do not start its timer. |
| Start Round | Start a shared three-second countdown, then the round. |
| Pause / Resume | Freeze the round or resume after a shared countdown. |
| Reveal Results | Reveal the closed round's answers and publish its score. |
| Next Round | Prepare the next round; wait for Start Round. |
| Show Game Results | Show the completed game's standings. |
| Next Game | Open the next game's How to Play screen. |
| Show Final Results | Open tournament results and ceremony controls. |

When a timer expires, all answers are locked, or no racer can continue, close the round and show **Waiting for the host**. Do not reveal answers, automatically start the next question, or advance to another game.

Automatic animations and scoring calculations may run within a stage after the host's command. **Auto controls signal switching only, not event progression.**

## 5. Joining, identity, and automatic device detection

### 5.1 Joining and restoration

1. Scan the QR code or enter the session code.
2. Enter a display name of 2-24 characters and select **Join**. This is the only required personal input.
3. Assign an avatar and internal participant number automatically. Avatar customization is optional after joining.
4. Create a stable participant identity and private recovery code. A short number distinguishes duplicate names, for example **Abdullah #17**.
5. Detect available device information in the background and associate it with the participant.
6. Store the recovery credential on the device and keep the authoritative identity, score, and gameplay state on the server.
7. A page reload restores the existing player, including elimination status. It must not create a second player or revive an eliminated player.
8. A recovery code used on another device transfers the active controller to that device and invalidates the previous controller. Update current device information and retain the change history.
9. Allow only one active control connection per identity. The host and shared display are not players.
10. If joining remains open, late arrivals wait for the next round. Missed rounds score zero and do not change that player's denominator.

Do not request a phone number, email, or employee ID. Keep recovery codes and device details off the public display.

### 5.2 Device information visible to the host

Host columns: **Name, Device Type, Model (if available), OS, Browser, Connection**.

Device Type values: **iPhone, Android phone, iPad or tablet, Desktop, Unknown**. This is browser-reported or inferred metadata, not verified hardware identity.

- Use available User-Agent Client Hints where supported, with a User-Agent fallback and an Unknown result when necessary.
- Record manufacturer or model only when the browser explicitly supplies useful information. Do not infer an exact iPhone or Samsung model from screen dimensions.
- An unavailable model is stored as `null` and displayed as **Not available**.
- Example: **Abdullah | iPhone | Not available | iOS | Safari**.
- Detection must run without blocking Join or waiting for an additional mandatory participant input. Failure does not exclude anyone.
- Store only the useful host fields: `device_type`, `device_model`, `os`, `browser`, `device_detection_source`, and update time. Avoid collecting unrelated hardware identifiers.
- Use feature detection for rendering decisions; do not change scoring or eligibility based on the detected device name.

Browser support and detail availability vary. See [MDN: additional User-Agent Client Hints](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues) and [MDN: Navigator.userAgent](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgent). The implementation must tolerate reduced or unreliable device metadata.

## 6. Game 1: Red Light, Green Light

### 6.1 Objective and explanation

Main instruction: **Hold on GREEN. Release on RED. Move on RED and you're eliminated!**

Scoring note shown before play: **Eliminated = 0 points this race. Your previous scores stay safe.**

Elimination means the character dies and leaves the current race. All players return in the next race when the host starts it. They remain eligible for the other two games.

### 6.2 Phone experience

- A large **Hold to Move** control responds to continuous pressure, not repeated taps.
- Show **GREEN - GO** or **RED - STOP**, with a matching icon and color.
- Show personal progress and remaining time while alive.
- The safe initial signal is RED. After the countdown, the host or Auto schedule supplies the first green signal.
- On server-confirmed death, disable movement immediately and show **ELIMINATED** and **You moved on red. Watch this race; you'll return next round.**
- On reaching the finish, show **FINISHED - Waiting for the host**. Finished players cannot be eliminated later in that race.
- Reloading or switching devices does not reset life state. Eliminated players can spectate only.

### 6.3 Shared arena, death animation, and audio

Use a simple original 2D cartoon arena. Display all players as compact avatars with short numbers; use highlighted names for leaders and featured events. Keep a sidebar with **Alive / Eliminated / Finished** counts and the leading five players.

Arrange avatars in parallel visual lanes with spacing that avoids overlap. Lane position is decorative: it does not change distance or movement speed. Avoid displaying 100 full names continuously in tiny text.

When a player is eliminated:

- Show a brief hit effect, the character collapsing, then fading or becoming an elimination marker.
- Display **[Name] eliminated** in the event feed.
- Play a short in-game shot/elimination sound from the shared display, synchronized with the collapse.
- Keep the animation approximately 0.8-1.2 seconds. It must not delay control disablement or stop the race.
- Use stylized cartoon effects without detailed blood imagery.
- If multiple players die together, animate each at their location, aggregate names in the event feed, and combine overlapping audio into a short controlled sound rather than stacking dozens of clips.
- Replay each new elimination event once. Restoring state must not replay old death sounds.

Before the event, the display computer must expose **Enable Audio**, **Test Elimination Effect**, mute, and volume controls. Obtain an actual local user interaction to initialize audio. Browser playback restrictions must be handled; see [MDN: autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay). Phone audio is off by default.

An eliminated player stays dead for that attempt. Do not apply the obsolete backward-step penalty or revive the character within an ongoing attempt.

### 6.4 Decisive rules

| Setting | Default |
|---|---|
| Scored races | 3 |
| Maximum race duration | 80 seconds |
| Track length | 100 progress units |
| Movement speed | 3 units per second, only during green |
| Signal mode | Manual by default; Auto available |
| Signal colors | RED and GREEN only |
| Confirmed movement on red | Elimination and zero raw points for the race |
| Respawn | At the next host-started race, or a new attempt after the host voids the entire defective attempt |

Continuing to hold or issuing a new movement press during red counts as attempted movement on red. The avatar does not need to advance visually before the violation is detected.

At a transition to red, apply a fixed, shared **200 ms synchronization tolerance**. Stop movement immediately at red; the tolerance does not grant extra distance. After it expires, the first confirmed continuing hold causes immediate elimination. A new press during an already established red state causes immediate elimination. Document this technical tolerance in detailed rules and keep it identical for all players.

Releasing the finger, touch cancellation, loss of focus, or backgrounding the page stops movement. Missing connection messages alone must not kill the player. Reject movement inputs from eliminated or finished players.

Close the race when 80 seconds expires or no living, unfinished player remains. One remaining living player must still reach the finish or the deadline; do not declare them the winner automatically. Closing the race shows **Waiting for the host**. Results and subsequent races require host commands.

### 6.5 Manual signal control

Manual is the default. Provide:

- Large **GREEN** and **RED** buttons, current signal, and **Pending / Applied** feedback.
- A server-assigned shared effective time for each signal change. The host interface must not claim the signal is applied before the shared effective time.
- Optional G and R keyboard shortcuts when signal controls have focus; ignore them while typing in text fields.
- One pending change at a time. Repeating the current color is a no-op: it does not restart red tolerance.
- A host indicator showing the remaining green time needed to make a clean finish possible. Warn if insufficient green time has been provided; never take over the signal in Manual mode.

The host chooses when to switch red and green. All participants receive the same signal timeline.

### 6.6 Auto signal control and switching modes

- The host selects Auto and starts the race manually. The server changes only the signals according to the configured schedule.
- Auto never starts practice, a new race, a game, a reveal, or a stage transition.
- **Take Manual Control** cancels future automatic changes and preserves the current signal. Apply at a safe command boundary after resolving any pending signal command.
- Enabling Auto during a race creates a schedule for the remaining time. It does not reset the timer, points, elimination status, or red tolerance.
- If earlier manual choices leave too little time for a clean finish, show that fact rather than guaranteeing a possible finish.
- Pause freezes signals, movement, and the timer. Resume remains a separate host action.

### 6.7 Default race content

| Race | Screen title | Automatic green interval | Automatic red interval | Scene |
|---|---|---|---|---|
| 1 | Warm-up Run | 3-5 seconds | 1.5-2.5 seconds | Cartoon office corridor |
| 2 | Stay Sharp | 2-4 seconds | 1.5-3 seconds | Break-area courtyard |
| 3 | Final Dash | 1.5-3.5 seconds | 1-2 seconds | Finish-line corridor |

The Auto schedule is identical for all players and is generated on the server. Do not send future signal changes to participants in advance of their scheduling requirement. An uninterrupted Auto schedule starting at the beginning of a full race must provide at least 36 green seconds within 80 seconds. This guarantee does not apply to time already spent in Manual mode.

Provide a 20-second unscored practice. The host can demonstrate green, red, and elimination before starting the first scored race with all participants alive.

### 6.8 Race scoring

Each race has a raw score of 0-100. End states are **eliminated**, **finished**, and **alive-at-timeout**.

Let:

- `p` = final progress / 100, clamped to 0-1.
- `N` = the number of participants registered for the race at its start, including those who disconnect later.
- `r` = finish rank, starting at 1. Finishes in the same 0.1-second timing bucket share a rank; use competition ranking for the next position.

| End state | Raw score |
|---|---|
| Eliminated | 0, regardless of prior progress |
| Alive at timeout, not finished | `80 * p` |
| Finished, with N > 1 | `80 + 20 * (N - r) / (N - 1)` |
| Finished, only one participant | 100 |

**Game score = `round_half_up(1000 * sum(raw_race_scores) / 300)`**.

Keep full precision until rounding the game score. Previous race results are never removed by a later death.

Examples:

- Raw scores 100, 0, and 80 produce 600 game points.
- A living player at 75% progress when time ends earns 60 raw points.
- A player eliminated at 75% progress earns zero for that race.
- If everyone dies, all receive zero for that race. Do not invent a winner or automatically replay it.

### 6.9 Synchronization and recovery

The server owns signal state, life state, movement, timing, and scoring. Each signal command has an event ID and shared effective time. Do not trust a participant-supplied timestamp or position to bypass elimination.

During a hold, monitor regular input/connection messages. Stop movement if they cease for more than 500 ms; absence alone is not evidence of red movement. After recovery, require a new press on green. Save the death reason, time, and event ID, and process elimination only once.

If the host disconnects for more than two seconds, pause the active race in both Manual and Auto. Reconnection does not resume it: wait for **Resume**. If network delay affects the room materially, the host can void and replay the whole attempt rather than award estimated compensation to individuals.

## 7. Game 2: Pin the Country

### 7.1 Objective and explanation

Instruction: **Rotate the globe and pin the country. Inside its borders earns full points; closer guesses earn more.**

Use the country's accepted geographic area for scoring, not its center or capital. Every point inside the accepted area is equally correct.

### 7.2 Phone experience

- Show the country name in English and a 25-second timer.
- Provide a touch-rotatable, zoomable globe, **Reset View**, and a way to return to the current pin.
- Distinguish land, water, and country boundaries. Do not show country names, city labels, flags, or search controls on the map during answering.
- A short tap places a pin. A drag rotates the globe and must not accidentally place a pin.
- Allow moving the pin until **Lock My Pin** is acknowledged by the server.
- At the deadline, use the last pin received by the server if it was not explicitly locked. No pin means zero; do not silently create a default pin.
- Show **Place your pin**, then **Pin saved - you can still move it**, then **Pin locked**.

Every device starts with the same globe orientation and zoom. Do not orient the globe toward the target before answering. Provide a label-free flat-map fallback if a device cannot render the globe, using the same geographic data and scoring rules without extra hints.

### 7.3 Default countries

Unscored practice: **Saudi Arabia**.

| Round | Country | Content code | Estimated difficulty | Purpose |
|---|---|---|---|---|
| 1 | Egypt | EGY | Easy | Familiar regional starting point |
| 2 | Brazil | BRA | Easy | Large country on another continent |
| 3 | Australia | AUS | Easy | Distinctive outline |
| 4 | Japan | JPN | Medium | Island geography |
| 5 | Italy | ITA | Medium | Smaller, recognizable shape |
| 6 | Canada | CAN | Medium | Large northern country |
| 7 | Norway | NOR | Moderately challenging | Long, narrow geography |
| 8 | Madagascar | MDG | Medium | Island off Africa |

Difficulty labels are design estimates to validate in rehearsal. Before the tournament, the host may choose replacements from a reviewed country bank with valid geometry. A free-text country name without scoring boundaries is not valid content.

### 7.4 Host-triggered reveal

1. Close input at the deadline and wait for **Reveal Results**.
2. Animate the globe toward the country and highlight its accepted area.
3. Reveal participant pins progressively. Mark in-country answers with a check icon and semantic success color; represent other distances with a labeled scale.
4. Show the number of in-country answers and the top five round scores.
5. Show each participant their result, such as **Inside the country: 100/100** or **640 km away: 87/100**.

Cluster overlapping pins visually and show the count. The host may inspect an individual pin. Visual clustering must not modify the coordinates used for scoring. Follow the map colors in Section 13.

### 7.5 Geographic scoring

Let `d` be the distance in kilometres. It is zero inside or on the accepted country boundary; otherwise it is the shortest geodesic surface distance from the pin to that boundary.

**Raw round score = `max(0, 100 * (1 - d / 5000))`**.

| Distance | Raw score |
|---|---:|
| Inside or on the boundary | 100 |
| 500 km | 90 |
| 1,000 km | 80 |
| 2,500 km | 50 |
| 5,000 km or more | 0 |
| No pin | 0 |

**Game score = `round_half_up(1000 * sum(raw_round_scores) / 800)`**.

Eight fully correct pins earn 1,000 points. There is no speed bonus. Participants with in-country pins tie at 100 regardless of distance to the capital. Use full precision for calculations even if distances and round scores are rounded for display.

### 7.6 Map and boundary correctness

- Use licensed geographic data, record its source and version, and retain a fixed copy with the application assets or controlled storage.
- Highlight exactly the same geometry used for scoring, including islands and multipart countries.
- Do not automatically merge separate dependencies or territories into a parent country. Review and define each target's accepted area; explain any material exception before play.
- Exclude disputed areas from the chosen content or review their representation before the event; do not let an undisclosed dataset assumption decide a disputed answer.
- Preserve principal islands when simplifying geometry. Handle longitude wraparound and the international date line correctly.
- Calculate geodesic distance, not pixel distance or a simple difference between latitude/longitude values.
- Preload map assets and scoring geometry. Do not depend on live web searches or AI-generated geography during a round.

## 8. Game 3: Order It!

### 8.1 Objective and explanation

Instruction: **Put the four cards in the requested order, top to bottom. Lock your answer before time runs out.**

Every question has exactly four distinct options and a predefined correct order. Use automatic deterministic scoring; there is no free-text judging or audience voting.

### 8.2 Phone experience

- Show the question, timer, and direction explicitly, such as **Smallest at the top → Largest at the bottom** or **Earliest first**.
- Display four vertical cards numbered 1-4; read the answer from top to bottom.
- Support drag-and-drop and **Move Up / Move Down** alternatives.
- **Lock My Order** commits the answer after acknowledgment; changes are allowed before locking.
- Save each valid rearrangement automatically. At timeout, use the last server-received arrangement if the participant interacted at least once.
- No drag, move, or lock action means no answer and zero points, even if the initial arrangement happens to contain correctly placed cards.
- Locking the initial arrangement intentionally counts as an answer.

Use the same shuffled starting order for everyone in a question. It must not equal the complete correct answer. Do not disclose correctness during answering.

### 8.3 Unscored practice

**Question:** Order these time units from shortest to longest.  
**Initial example options:** Day, Minute, Hour, Second.  
**Correct order:** Second → Minute → Hour → Day.

Demonstrate dragging and the alternative movement controls. After the host reveals practice results, show how positions produce points.

### 8.4 Default scored question bank

The following is the content definition. Correct orders are server-side solutions, not the initial participant order. Never send them to participant clients before reveal.

| ID | Question | Correct order, top to bottom | Difficulty | Reveal explanation |
|---|---|---|---|---|
| SORT-01 | Order these healthy adult animals by number of legs, fewest first. | Chicken → Cat → Ant → Spider | Easy | 2, 4, 6, 8 legs. |
| SORT-02 | Put these Hijri months in calendar order. | Rajab → Sha'ban → Ramadan → Shawwal | Easy | Months 7, 8, 9, 10. |
| SORT-03 | Order these storage units from smallest to largest. | Kilobyte → Megabyte → Gigabyte → Terabyte | Easy-medium | Increasing storage unit size. |
| SORT-04 | Order these values from smallest to largest. | 0.25 → One third → One half → 0.75 | Medium | 0.25 < 1/3 < 0.5 < 0.75. |
| SORT-05 | Put these months in calendar order. | March → June → September → December | Easy | Months 3, 6, 9, 12. |
| SORT-06 | Order these distances from shortest to longest. | 100 metres → Half a kilometre → 750 metres → One kilometre | Medium | 100, 500, 750, 1000 metres. |
| SORT-07 | Put these letters in English alphabetical order. | B → G → S → W | Easy-medium | B comes before G, then S, then W. |
| SORT-08 | Order these planets from nearest to farthest from the Sun. | Earth → Mars → Jupiter → Neptune | Medium | The 3rd, 4th, 5th and 8th planets from the Sun. |
| SORT-09 | Order these masses from lightest to heaviest. | 250 grams → Half a kilogram → 750 grams → One kilogram | Medium | 250, 500, 750, 1000 grams. |
| SORT-10 | Order these durations from shortest to longest. | 45 seconds → One minute → 90 seconds → Two minutes | Medium | 45, 60, 90, 120 seconds. |

Rehearse the difficulty with a small group. Replacements must have reviewed, unambiguous solutions. Avoid questions based on changing prices, popularity, or variable physical sizes without a date and source. Avoid equal-valued options unless the scoring system is explicitly extended to accept equivalent orders; Version 1 uses distinct positions.

### 8.5 Reveal and scoring

After answers close and the host selects **Reveal Results**, move the display cards into the correct order. Show the one-line explanation and the number of players scoring 100.

On the phone, compare the submitted order with the answer. Mark correct positions with color and check icons and show, for example, **2 cards in the correct positions: 50/100**.

- Each card in its exact correct position earns 25 points.
- Score absolute positions 1-4, not merely relative ordering between pairs.
- Possible raw scores are 0, 25, 50, or 100. A score of 75 is impossible for a permutation of four unique cards: three correct positions imply the fourth is correct.
- Ten rounds at 100 points each give a maximum of 1,000 game points.
- No speed bonus and no additional deduction for incorrect cards.
- Example: for solution A,B,C,D, answer A,C,B,D scores 50; B,A,D,C scores 0; A,B,C,D scores 100.

Short general comments such as **That last move paid off!** may appear. Do not automatically publish individual mistakes with names; associate names primarily with achievements and standings.

## 9. Tournament scores, rankings, and ties

### 9.1 Shared scoring rules

- Each game has a maximum of 1,000 points; the tournament maximum is 3,000.
- Calculate Game 1 and Game 2 at full precision, then round each game once to the nearest integer, with halves rounded upward. Game 3 already produces integer scores.
- The total is the sum of the displayed game scores. Do not secretly rank equal displayed totals using hidden fractions.
- Published tournament points come only from rounds whose results the host has revealed, using the full planned denominator. A first correct geography answer must not temporarily display 1,000 game points.
- Current race progress is not awarded points. If a live estimate is shown, label it **Provisional**; it can become zero on death.
- Absent players score zero for missed rounds. Practice and voided attempts do not count.
- A voided round is replayed under the same round number with a new attempt ID. The old result stays in the audit history but contributes no points.
- Freeze round counts and scoring rules at tournament start. Changing them requires a new tournament rather than a silent mid-event change.

### 9.2 Standings

| Rank | Participant | Red Light, Green Light /1000 | Pin the Country /1000 | Order It! /1000 | Total /3000 |
|---|---|---:|---:|---:|---:|
| 1 | Abdullah #17 | 900 | 850 | 750 | 2500 |

The display shows the top ten or host-selected pages of complete rankings. The phone shows the player's rank, score, and nearby positions when standings are open. Label in-progress standings **Provisional standings**.

The host triggers the final ceremony, revealing third place, second place, and first place through explicit ceremony controls, followed by the full table. Use podium numbers, names, and scores, not color alone.

### 9.3 Tie resolution

For equal final totals:

1. Rank higher the participant who achieved 1,000 in more games.
2. If still tied, retain a shared rank. If the tie affects a top-three award, the host may run an Order It! tie-break for only the affected players; others spectate.
3. A tie-break determines ordering only and does not increase the 3,000-point total. Compare correctly positioned cards first. Compare final lock time only for completely correct answers.
4. Manual locking is required to qualify for the speed comparison. A saved but unlocked arrangement can earn positional correctness at the deadline, but no speed advantage.
5. Treat lock-time differences smaller than 0.5 seconds as tied. If needed, use the second spare tie-break; if still tied, award a shared position rather than selecting by name or entry number.

Prepared tie-breakers, 15 seconds each:

| ID | Question | Correct order |
|---|---|---|
| TIE-01 | Order these values from smallest to largest. | 0.2 → One quarter → One third → 0.4 |
| TIE-02 | Order these durations from shortest to longest. | Half a minute → 45 seconds → One minute and a quarter → 90 seconds |

Announce tie rules before the competition. Verify connections before a timed tie-break; correctness remains the first criterion.

## 10. Content management and session snapshots

Store an immutable copy of the selected content and scoring configuration with each started session, even if the reusable content bank changes later.

### 10.1 Race content

Fields: English title, scene, duration, movement speed, track length, elimination rule, scoring rule version, Manual/Auto setting, interval ranges, synchronization tolerance, death animation and sound asset references, and a replayable signal command log.

### 10.2 Country content

Fields: English name, country ID, accepted scoring geometry and version, reveal viewpoint, difficulty, duration, and boundary preview. Validate mainland and island behavior before allowing a target to be used.

### 10.3 Ordering content

Fields: question ID, English prompt, direction, four unique option IDs and labels, correct ordered IDs, explanation, estimated difficulty, duration, and purpose: practice, scored, spare, or tie-break.

Validate exactly four unique options and an answer containing each once. The explanation must agree with the answer. Review content before publication; do not generate live questions during the event.

### 10.4 Spare content after a revealed round is voided

If an answer was already shown, use an equivalent spare rather than replaying that answer for points.

| Type | Spare content |
|---|---|
| Geography | Argentina and Germany, with reviewed boundaries. |
| Ordering SPARE-01 | Put these days in order, starting from Saturday. Answer: Saturday → Sunday → Tuesday → Thursday. |
| Ordering SPARE-02 | Order these values from smallest to largest. Answer: 0.1 → 0.3 → 0.6 → 0.9. |

Do not reuse a tie-break question as a spare and later present it again to the same players for tie resolution.

## 11. State management, pausing, and failures

Use explicit states: **Draft, Lobby, Instructions, Practice, Ready, Countdown, Round Active, Input Locked, Reveal, Game Results, Tournament Results, Closed**. Pause is an overlay that preserves the prior state and remaining time.

- **Starting:** a countdown starts only after the host selects Start Practice or Start Round. Readiness or asset loading never starts play.
- **Pausing:** freeze timers, movement, signal changes, and answer modifications. Show **Paused by the host**.
- **Resuming:** after the host selects Resume, run a shared three-second countdown and continue the remaining time. Clear old held-button state. Retain eliminated and finished players. In Manual mode, resume at RED and wait for the host's GREEN command. In Auto, use a valid remaining-time schedule. Never kill someone because of an old press from before the pause.
- **Voiding a round:** invalidate the attempt for everyone, save the reason, and let the host start a new attempt. In a race, all players respawn because the entire old attempt was voided; this is not individual revival within a live race.
- **Participant disconnect:** others continue. Stop the disconnected racer. In Games 2 and 3, retain the last valid server-received answer according to the normal deadline rules. Do not extend time for one player.
- **Participant reconnect:** restore the current stage, identity, locked answer, scores, device metadata, and alive/dead state. Do not reopen locked input or revive an eliminated player.
- **Host disconnect:** after more than two seconds, pause the active round. Reconnection restores the controls but requires Resume. It never advances the event.
- **Shared display failure:** if the host is connected, they can pause from their dashboard or a replacement authenticated host device. Restoring the display must not change game state.
- **Server restart during a movement race:** mark the incomplete attempt interrupted and require a host-started replay for everyone. Do not simulate missing movement or award unseen penalties. Retain completed rounds.

For two host dashboards, enforce one active controller or serialize commands so conflicting Start, Reveal, or signal actions cannot create inconsistent states.

## 12. Technical requirements and data

No particular framework or programming language is mandated. Meet the following requirements using the existing project's suitable stack.

1. Use a shared authoritative service and persistent storage. Results cannot exist only in the host browser.
2. Provide real-time communication among server, host, display, and phones, with state snapshots after reconnection.
3. Use server timing and synchronized client countdowns. Reject late submissions and do not trust the device clock for scoring.
4. Include session, participant, round, attempt, and event identifiers plus sequence information. Duplicated, stale, or reordered messages must not duplicate scores or overwrite newer state.
5. Calculate movement, death, geography distances, correct orders, and rankings on the server. Never accept a client-provided score as authoritative.
6. Protect host commands. The public display cannot call administration actions. Correct ordering answers remain undisclosed before reveal; participant pins remain private until reveal.
7. Acknowledge saved inputs and locks. The UI shows a committed state only after acknowledgment.
8. Validate coordinates, card IDs, identity, input rates, and allowed state transitions.
9. Finalize each round and publish its score logically once, even if the host retries or reconnects.
10. Preload heavy assets, compress graphics, and reduce globe rendering detail on less capable devices. No live image or text generation is required.
11. Serve over HTTPS, with map and game assets reachable from actual participant devices. Do not assume every guest can access a private corporate network.
12. Retain session results until the organizer deletes them. Support deletion and exports. Do not publish previous sessions' results by default.
13. Use centralized Elm design tokens, not scattered hardcoded colors. Distinguish source brand tokens from the explicit functional green extension in Section 13.

### 12.1 Logical data model

| Entity | Key fields |
|---|---|
| Session | ID, title, join code, host, state, capacity, frozen configuration, timing, content version. |
| Participant | Stable ID, short number, name, assigned avatar, recovery credential, connection, join time, device type/model/OS/browser, detection source, update history. |
| Session game | Type, order, score cap, round count, state. |
| Round attempt | ID, round number, frozen content, start/deadline, pause records, void status and reason. |
| Round participation | Pin, ordering answer, or race progress/life state; received and locked times; elimination reason/event. |
| Score | Raw result, normalized game result, calculation details, scoring rule version. |
| Event log | Host identity and Start/Next/Pause/Resume/Reveal/Cancel commands; signal/mode changes; elimination and scoring events. |

### 12.2 Exports

Provide UTF-8 CSV with English headers while preserving names in other scripts:

**Participant ID, Name, Rank, Red Light Green Light, Pin the Country, Order It, Total, Tie-break**.

A private host export additionally includes **Device Type, Device Model, OS, Browser**. Never put these fields on the public leaderboard. Also provide an optional round-level export for inspection. Exported values must match the displayed totals and final ordering.

## 13. Elm identity analysis and required website design

### 13.1 Source, evidence, and interpretation

The authoritative color reference for this task is the user-supplied **colors.pdf, page 1**, visually inspected alongside its printed numeric values. It identifies:

- Seven **Primary** colors.
- Three **Secondary** colors.
- Five **Neutrals**, with a note specifying their use as backgrounds.

Use the printed HEX/RGB values for digital implementation. Normalize omitted leading zeros, for example `5 1d 49` becomes `#051D49`. Do not sample the PDF screenshot as the source of truth: rendering and color management can change displayed swatch pixels. Pantone labels are reference identifiers, not a request to approximate screen colors from Pantone or CMYK.

The supplied page is a color reference, not a complete identity manual. It does not provide an official logo asset, typeface, logo clear-space measurements, component radii, icon rules, or motion rules. The following website roles, hierarchy, spacing, and type recommendations are **project design decisions derived from the palette**, not claims that Elm formally specifies them.

**Design interpretation:** the navy provides a strong, legible anchor; blue, cyan, and purple offer a coherent technology-oriented accent family; peach, orange, and lavender add warmth to highlights and game details; the supplied cool neutrals support quiet backgrounds. Keep the experience recognizable as an Elm event with playful game content, rather than giving each game an unrelated visual identity.

### 13.2 Exact source palette

Descriptive color names below are implementation labels; the source classifications and numeric values come from the supplied PDF.

| Source group | Implementation label | Source label | HEX | RGB |
|---|---|---|---|---|
| Primary | Elm Navy | PANTONE 2768 C | `#051D49` | 5, 29, 73 |
| Primary | Elm Peach | PANTONE 1565 C | `#FFA168` | 255, 161, 104 |
| Primary | Elm Orange | PANTONE 171 C | `#FF5D36` | 255, 93, 54 |
| Primary | Elm Lavender | PANTONE 2572 C | `#CC8BDB` | 204, 139, 219 |
| Primary | Elm Purple | PANTONE 266 C | `#763CBC` | 118, 60, 188 |
| Primary | Elm Cyan | PANTONE 299 C | `#00A1E0` | 0, 161, 224 |
| Primary | Elm Blue | PANTONE 285 C | `#0071CE` | 0, 113, 206 |
| Secondary | Elm Burgundy | PANTONE 7628 C | `#A12B2A` | 161, 43, 42 |
| Secondary | Elm Deep Purple | PANTONE 268 C | `#5A2C83` | 90, 44, 131 |
| Secondary | Elm Royal Blue | PANTONE 286 C | `#0032A0` | 0, 50, 160 |
| Neutral | Almost White | Almost white | `#F7F8FC` | 247, 248, 252 |
| Neutral | Light Blue | PANTONE 2120 C | `#BDC9E9` | 189, 201, 233 |
| Neutral | Pale Blue | PANTONE 2120 C (40%) | `#E5E9F6` | 229, 233, 246 |
| Neutral | Dark Indigo | PANTONE 2119 C | `#2B2E65` | 43, 46, 101 |
| Neutral | Muted Indigo | PANTONE 2111 C | `#464D7E` | 70, 77, 126 |

The PDF groups all seven entries as primary; this website's choice of navy and blue for its dominant interface roles does not reclassify the other source colors.

### 13.3 Mandatory UI mapping

| UI element | Required treatment |
|---|---|
| Main app background | Almost White `#F7F8FC`. |
| Alternate panels and instructions | Pale Blue `#E5E9F6`; use Light Blue `#BDC9E9` for selected background areas. |
| Main text and headings | Elm Navy `#051D49`. |
| Main action buttons | Elm Blue `#0071CE` background with Almost White text. |
| Hover/pressed primary buttons | Elm Royal Blue `#0032A0` background with Almost White text. |
| Secondary action buttons | Pale Blue background, Navy text, and a sufficiently visible Navy or Blue outline. |
| Interactive links | Elm Blue, underlined in body copy. |
| Current-stage emphasis | Elm Purple `#763CBC`; Almost White text if used as a filled badge. |
| Warm highlights | Peach, Orange, or Lavender with Navy text. |
| Secondary dark panels | Dark Indigo or Muted Indigo as backgrounds with readable light foreground text. |
| Danger, elimination, and RED signal | Elm Burgundy `#A12B2A` with Almost White text and a stop/elimination icon. |
| GREEN signal and affirmative game feedback | Functional green `#15803D` with Almost White text and GO/check icon; see exception below. |
| Focus indicators | Blue or Navy on light surfaces; Peach or Almost White on dark surfaces, tested against adjacent colors. |
| Disabled controls | A neutral background plus explicit disabled state; do not use low contrast for active explanatory text. |

The five neutrals are primarily background tokens, following the supplied note. Almost White may also serve as an inverse text foreground where contrast requires it; this foreground use is a documented website accessibility adaptation. Do not treat every source swatch as an interchangeable action color.

**Functional green exception:** the supplied palette contains no green. The accepted game explicitly requires RED/GREEN signals. Add `#15803D` as a clearly separated functional token for GO and affirmative game feedback only. It is not an official Elm brand color and must not become a decorative brand accent. RED can use the supplied Burgundy. Do not replace GREEN with blue or purple to force the game into the brand palette.

### 13.4 Central design tokens

Use these values in one shared theme. Equivalent names are acceptable if source colors and semantic roles remain clear.

```css
:root {
  --elm-navy: #051D49;
  --elm-peach: #FFA168;
  --elm-orange: #FF5D36;
  --elm-lavender: #CC8BDB;
  --elm-purple: #763CBC;
  --elm-cyan: #00A1E0;
  --elm-blue: #0071CE;
  --elm-burgundy: #A12B2A;
  --elm-deep-purple: #5A2C83;
  --elm-royal-blue: #0032A0;
  --elm-almost-white: #F7F8FC;
  --elm-light-blue: #BDC9E9;
  --elm-pale-blue: #E5E9F6;
  --elm-dark-indigo: #2B2E65;
  --elm-muted-indigo: #464D7E;

  /* Functional extension, absent from the supplied Elm palette. */
  --game-go: #15803D;
  --game-stop: var(--elm-burgundy);

  --page-bg: var(--elm-almost-white);
  --panel-bg: var(--elm-pale-blue);
  --text-primary: var(--elm-navy);
  --action-bg: var(--elm-blue);
  --action-hover-bg: var(--elm-royal-blue);
  --action-text: var(--elm-almost-white);
  --stage-accent: var(--elm-purple);
  --error-bg: var(--elm-burgundy);
  --error-text: var(--elm-almost-white);
}
```

Avoid uncontrolled hue changes, random multicolor gradients, default framework purples/blues, and gold/silver/bronze trophy colors unrelated to the supplied palette. Distinguish podium places by numerals, height, and labels; use Peach, Light Blue, and Lavender as their decorative backgrounds.

### 13.5 Screen-by-screen composition

| Screen | Elm treatment and layout |
|---|---|
| Lobby | Spacious Almost White background, Navy title, Blue Join/QR frame, modest Purple and Peach accents. Place the official Elm logo if supplied; otherwise use a simple Elm text label, not a fabricated logo. Put Built using ASAS in a secondary footer. |
| Host dashboard | Light background, Navy headings, clear Pale Blue sections, Blue primary progression action. Separate gameplay signal controls from navigation so RED cannot be mistaken for Next. |
| How to Play | One large game title, three numbered instruction cards, one animated example, and a clear Waiting for the host state. Keep the same template for all three games. |
| Participant phone | Name at the top, task in the center, one dominant action near the bottom. Maintain safe spacing for device insets and touch input. |
| Red Light, Green Light | Navy/neutral arena with Blue/Purple supporting details. Keep the red/green signal dominant and separate from decorative accents. Avatars may use the source accent colors but retain visible IDs. |
| Pin the Country | Navy ocean, Pale Blue land, and distinguishable boundaries. Use Orange plus a Navy outline for the player's pin. After reveal, highlight target land with Peach and a Blue boundary; use functional success green with a check mark for correct pins. |
| Order It! | Almost White page, Pale Blue cards, Navy text, Blue position controls, Purple selection outline. Correctness uses a check label and functional success color only after reveal. |
| Standings and ceremony | Navy headings or a Navy display stage with readable light text. Blue/Purple accents and controlled Peach/Lavender confetti. Scores remain larger and clearer than decoration. |

Keep map controls and borders legible at all zoom levels. Participant avatars need visible outlines or numbers; identity cannot depend on a unique color for each of 100 people.

### 13.6 Typography, spacing, and geometry

These are implementation recommendations because the source PDF does not identify a typeface or layout system.

- Use an existing licensed Elm English font if one is available in the project. Otherwise use a system sans-serif stack such as `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Do not label the fallback as Elm's official typeface.
- Use normal weight for body text, semibold for controls, and bold for primary scores/headings. Use tabular numerals for timers and scores.
- On phones: body 16-18 px, buttons 16-18 px, question titles 24-32 px, and critical countdowns 40-56 px as space allows.
- On the 1080p shared display: game/question titles approximately 48-64 px, instructions 28-36 px, timers 56-80 px, and table names/scores approximately 24-32 px. Paginate instead of shrinking a 100-row leaderboard.
- Host dashboard body text approximately 14-16 px; primary controls at least 16 px.
- Use an 8 px spacing rhythm, approximately 12 px card corners, and 8-12 px button corners. These are website choices, not extracted brand rules.
- Touch targets must be at least 44 x 44 px. The Hold to Move control must be substantially larger and easy to use one-handed.
- Use original simple line or flat illustrations. The palette sheet's angular swatch-card cutouts are not evidence of an official Elm motif; do not reproduce them as a mandatory logo or brand pattern.

### 13.7 Contrast and accessibility

Aim for at least 4.5:1 for normal text, 3:1 for qualifying large text, and 3:1 for essential interface boundaries and meaningful graphics against adjacent backgrounds. See [W3C: text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) and [W3C: non-text contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html).

The following solid-color pair ratios were calculated from the specified HEX values using sRGB relative luminance. They are checks of these pairs, not certification of an unbuilt website.

| Foreground | Background | Approximate contrast |
|---|---|---:|
| Almost White `#F7F8FC` | Navy `#051D49` | 15.48:1 |
| Almost White `#F7F8FC` | Blue `#0071CE` | 4.65:1 |
| Almost White `#F7F8FC` | Purple `#763CBC` | 6.30:1 |
| Navy `#051D49` | Cyan `#00A1E0` | 5.61:1 |
| Navy `#051D49` | Peach `#FFA168` | 8.25:1 |
| Navy `#051D49` | Orange `#FF5D36` | 5.37:1 |
| Navy `#051D49` | Lavender `#CC8BDB` | 6.48:1 |
| Almost White `#F7F8FC` | Burgundy `#A12B2A` | 6.84:1 |
| Almost White `#F7F8FC` | Functional Green `#15803D` | 4.73:1 |

Do not place small light text on Orange, Peach, Cyan, or Lavender; use Navy. Recheck contrast when opacity, gradients, imagery, hover states, or overlays change the effective colors. Use color plus text/icons for GO/STOP, correctness, connectivity, and elimination. Avoid rapid flashing. Reduced-motion mode should reduce animation without changing timing or scoring.

### 13.8 Logos and brand assets

The supplied PDF contains color references, not a usable Elm logo package. If official Elm and ASAS assets are already available in the implementation project, use those unchanged, retaining proportions and approved variants. If absent, use text labels as a temporary fallback and document the missing asset; do not trace a logo from memory, recolor it arbitrarily, or pretend a placeholder is an official mark.

Only use a logo variant that remains readable on its chosen background. Follow an actual logo guide if provided later; do not invent clear-space measurements and attribute them to Elm. Keep build attribution secondary to the event identity.

## 14. General interaction and usability requirements

- Keep the host dashboard practical, the shared display engaging, and each phone focused on one primary task.
- Do not expose implementation details or scoring formulas inside the core gameplay flow. Keep a concise explanation available in Help.
- Support phone widths from 360 px and normal desktop viewports. Preserve names entered in Arabic or other scripts while retaining English UI and stable numeric direction.
- Prevent text selection and long-press context menus on the hold control; handle touch cancellation correctly.
- Use short success, elimination, and reveal effects. Keep phone sound off by default to avoid dozens of simultaneous speakers.
- Retain each participant's avatar, ID, and score style across the three games.
- Use legible waiting, locked, disconnected, and paused states. Never show an enabled control that cannot accept input without explaining its state.
- Apply Elm styling to every operational state, including validation messages, empty states, reconnect screens, instructions, and the flat-map fallback, not only the landing page.

## 15. Acceptance criteria and verification

A visually complete front end is not sufficient. Verify the operational requirements below.

| ID | Acceptance criterion |
|---|---|
| AC-01 | 100 simulated participants plus host and display can join with separate identities, without losing answers or duplicating scores. |
| AC-02 | Real iPhone and Android devices complete all three games against the same shared display using one identity each. |
| AC-03 | Practice contributes no points, and the tournament cannot exceed 3,000 points. |
| AC-04 | Only green permits progress; a confirmed red violation disables control, eliminates once, and produces one animation/audio event. Reload does not revive; disconnection alone does not kill. |
| AC-05 | A living player at 75% progress at timeout earns 60 raw points; an eliminated player at that progress earns zero. Raw race scores 100+0+80 normalize to 600. |
| AC-06 | Test a pin inside a country, on its boundary, outside it, and on an accepted island. Scoring matches the highlighted geometry. |
| AC-07 | A 1,000 km distance scores 80 raw; 5,000 km scores zero; eight perfect pins score 1,000 game points. |
| AC-08 | Ordering permutations correctly yield 0, 25, 50, or 100; no permutation of four unique cards yields 75. |
| AC-09 | Use only the last valid answer received before closing. Ignore late, duplicate, and voided-attempt messages. |
| AC-10 | Pause freezes interaction and time. Resume neither penalizes stale holds nor duplicates results. |
| AC-11 | Reload, reconnect, and recovery on another device preserve scores, locked answers, and life state. |
| AC-12 | Voiding and replaying a round counts only the replacement attempt and retains the void audit record. |
| AC-13 | Equal displayed totals follow the published tie rules without hidden fractions or name-based ranking. |
| AC-14 | CSV values match screen rankings and scores, and names in other scripts remain readable. |
| AC-15 | Participants cannot call host actions or submit authoritative scores; ordering solutions remain hidden until reveal. |
| AC-16 | A complete rehearsal fits the 30-minute plan and is readable from the back of the room. |
| AC-17 | Every UI string, question, explanation, host control, and error is in English; participant-entered names remain unchanged. |
| AC-18 | Name alone is sufficient to join. Device detection failure does not block joining, require a model entry, or force avatar selection. |
| AC-19 | Available device metadata appears in the host view/export; missing models show Not available; public rankings contain no device details. |
| AC-20 | How to Play appears before every game on phones and display. I'm Ready does not start play; practice is unscored. |
| AC-21 | Timer expiry closes input only. Start, Reveal, and Next require authorized host actions even when the first game's signals are Auto. |
| AC-22 | Manual is the default; RED/GREEN changes synchronize across devices. Mode changes do not revive players or reset red tolerance. |
| AC-23 | Death awards zero for that race only and survives reconnection. Respawn occurs only at the next host-started race or a fully voided attempt's replacement. |
| AC-24 | Simultaneous eliminations animate all affected avatars with controlled audio; old sounds do not replay after recovery. |
| AC-25 | Display audio can be initialized through local interaction, tested, muted, and adjusted. Phone audio remains off by default. |
| AC-26 | All 15 source palette tokens match colors.pdf exactly. Functional green is a separate documented extension. |
| AC-27 | Landing, host, phone, instructions, all games, reconnect states, and ceremony use the Elm component mappings. |
| AC-28 | The chosen text/background pairs and meaningful controls meet the specified contrast targets in their actual rendered states. |
| AC-29 | No invented Elm logo or falsely attributed official font is delivered. Missing official assets are documented and use text fallbacks. |
| AC-30 | Keyboard/touch alternatives, visible focus, color-independent status cues, reduced motion, and 360 px phone layouts work. |

Perform meaningful load checks: 100 connections, repeated hold messages, submissions near the deadline, delayed/duplicated messages, host interruption, and participant reconnection. An initial engineering target on a healthy network is state-update delivery at the 95th percentile within 250 ms. Measure and report the environment; this is not a guarantee for the venue's network.

Conduct an actual room/network/audio rehearsal before the event. Investigate observed synchronization problems, rather than assuming simulated load results guarantee venue performance.

## 16. Implementation priorities and delivery package

### Phase 1: Shared tournament foundation

Implement joining, stable participant identity, automatic device detection, host/display/phone routes, stage permissions, timers, persistence, recovery, and the score ledger. Establish the Elm theme and shared controls immediately. Use a simple ordering question to validate the complete flow.

### Phase 2: Games and prepared content

Implement Order It! and its bank, then geography with validated boundaries, then the synchronized movement race with Manual/Auto signals and elimination. Connect every game to the same session and score system. Include mandatory explanations and host-triggered practice throughout.

### Phase 3: Presentation and event readiness

Complete avatar scenes, elimination sound/animation, result reveals, Elm-styled ceremony, content management, exports, mobile refinements, load testing, and the rehearsal.

### Required deliverables from the website implementer

1. A working application with participant join, protected host, and shared display links.
2. The full default event content, practice rounds, reviewed geography geometry, spares, and tie-breakers.
3. Centralized Elm tokens and documented component roles, including the functional green exception.
4. A separate rehearsal mode that can add simulated players without contaminating real results.
5. A short operating guide covering setup, display/audio testing, joining, device capture, explanations, signal modes, host transitions, connection recovery, and export.
6. Documentation of scoring rules, map data source/version, assets, brand-source limitations, and any implementation deviations.
7. Evidence for the acceptance checks and any known operational limitation before using the website at the event.

**Implementation instruction:** Build these three games as one English-language, Elm-styled event website for more than 50 people. Require only a name to join and detect device information in the background. Keep starts, reveals, and stage transitions under host control. Show clear How to Play instructions before each game. Prioritize scoring correctness, first-use clarity, synchronization, and dependable operation, then refine the visuals and effects. The production deliverable must use real communication between devices rather than local simulation.

## 17. Revision history and reference notes

| Version | Changes |
|---|---|
| 1.0 | Defined the three games, 30-minute format, individual scores, content, and operational requirements. |
| 1.1 | Set English website content, explicit host-controlled stages, name-only joining, automatic device capture, elimination with sound/animation, Manual/Auto signals, and pre-game explanations. |
| 1.2 | Rewrote the complete specification in English and added Elm palette analysis, exact color values, UI tokens, screen mappings, contrast calculations, brand limitations, and brand acceptance criteria. |

**Brand reference:** user-supplied `colors.pdf`, page 1. Its primary/secondary/neutral classifications and numeric color values are the source evidence. Functional green, inverse foreground use of Almost White, UI roles, typography, spacing, and motion choices are explicitly identified implementation decisions.

**Technical references:** browser metadata and autoplay documentation and W3C contrast guidance are linked beside the requirements they support. They inform implementation constraints; they do not imply the website has already been built or certified.
