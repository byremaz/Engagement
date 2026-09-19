# ASAS Challenge - UX Redesign and Arabic/English Implementation Prompt

Use this prompt with the existing application, its requirements document, the current screenshots, and Elm's supplied `colors.pdf`.

---

Act as a senior product designer, live-event experience designer, and frontend engineer. Improve the existing ASAS Challenge application into a clear, enjoyable, responsive experience for the host, participants, and audience watching the shared screen.

Inspect the existing code and working journeys, make the design decisions, implement them, and verify the result. Deliver working changes across all three roles and all three games. A written design proposal alone does not complete this task.

## 1. Context and priorities

This is a 30-minute Elm employee engagement event for more than 50 people in one room, with support for 100 concurrent participants. Everyone plays individually on their phone; one host runs the event; a large screen shows the shared experience.

Games:

1. Red Light, Green Light.
2. Pin the Country.
3. Order It!

Participants keep their identity and accumulate up to 1,000 points per game and 3,000 overall.

Use the current requirements as the functional foundation. This prompt explicitly replaces the previous English-only requirement with full Arabic and English support. Improve layout, hierarchy, interaction, copy, transitions, and feedback while preserving the agreed scoring, host authority, recovery, and multiplayer rules.

Your priorities are:

1. Everyone immediately understands what is happening and what to do next.
2. The host can run the room confidently without searching through controls.
3. The phone feels comfortable as a game controller.
4. The shared display communicates the event clearly from the back of the room.
5. The experience feels lively and enjoyable while following Elm's identity.
6. Both languages and all target screen sizes receive the same level of polish.

## 2. Start with the actual application

Read the existing requirements and inspect the current routes, components, styles, event states, real-time messages, localization approach, and scoring models. Walk through the host, participant, and display flows. Identify reusable components and preserve the current stack where suitable.

The supplied screenshots show concrete areas to investigate:

- The host screen gives stage controls, signal controls, session administration, and rehearsal tools similar visual weight. The next important action is difficult to identify.
- A screenshot shows a paused participant state alongside an active-looking GREEN - GO instruction. The dominant instruction should reflect the effective interaction state.
- One host screenshot contains a Manual selection and an Auto-related warning. Check whether this reflects stale feedback, an attempted action, or a genuine state mismatch before changing behavior.
- The display leaderboard fills much of the screen with a dense table, a large same-color tied block, pagination, and page overflow. It needs better reading hierarchy and an explicit representation of ties.
- The mobile results screen shows a total and rank, with little explanation of the round outcome or what happens next.
- Large blank areas and heavy rectangular containers suggest that layouts need more intentional sizing and composition.
- The shared display exposes persistent audio controls and navigation chrome that could be reduced during the presentation.

Treat screenshots as evidence of visible presentation issues, not proof of unseen backend defects. Do not classify the browser's temporary fullscreen notification as application UI. Inspect game views not shown in the screenshots before diagnosing them.

## 3. Design three coordinated experiences

Give each role a layout tailored to its task, using shared Elm tokens, typography, game identity, and status language.

### A. Host: a focused live-event control desk

The host should immediately see:

- Current game and round.
- Current effective state: instructions, practice, countdown, live, paused, locked, reveal, or standings.
- Remaining round time and elapsed event time, clearly distinguished.
- Connected participants, readiness, and submitted answers when relevant.
- The single most important next action.
- A compact preview of what the audience currently sees.

Implement:

- A clear progression strip: Lobby → Instructions → Practice → Game → Results. Show the three games' overall progress separately without turning it into a wall of badges.
- A central live area with stage information and the current action, such as Start Practice, Start Round, Resume, Reveal Results, or Next Round.
- A stable primary-action position. Change its label and availability with the actual stage.
- Keep preparing the next round and starting it as distinct actions where required by the existing rules.
- Place signal controls beside the live preview while the first game is active. Keep them visibly separate from navigation actions.
- Show Manual/Auto as a clear mode selector. Explain Auto with short informational text: "Signals run automatically. You still control the event."
- Hide irrelevant signal controls during geography and ordering games.
- Put exports, recovery tools, detailed device metadata, and session management in secondary panels or drawers.
- Put rehearsal tools in a clearly separated rehearsal area. Keep simulated-player tools out of the main live-event workspace.
- Keep End Session and reset/void controls away from normal progression actions, with clear consequences and the existing confirmations.
- Show device metadata in participant details, rather than giving every technical field a permanent wide table column.
- Provide useful empty states: "No players yet. Share the join code to get started." Avoid unexplained Ready 0/0 or Answers 0/0 indicators in irrelevant stages.
- Distinguish host connection status from participant connection counts.

Use red feedback for real errors or danger. Normal information about Auto mode must not appear as a persistent emergency banner. Clear stale feedback after the state changes, and ensure all status text comes from the same authoritative state.

### B. Participant: a simple personal game controller

Design the phone journey around one question: "What should I do right now?"

- Join with name only. Detect the device in the background. Assign an avatar automatically; optional customization must not block entry.
- Keep a compact header: name, language switch, and accessible help. Show points and rank where useful instead of repeatedly displaying them in every corner.
- Use a comfortable main task area and a reachable primary action, respecting browser controls, safe areas, and the on-screen keyboard.
- Make waiting purposeful: identify the current stage, say what the host is preparing, and preview the next action without revealing answers.
- After answering, confirm that it is locked. At reveal, explain the result, round score, game score, and tournament total with clearly separated labels.
- Show genuine progress and encouragement without inventing achievements or changing scores.
- Use the available screen intentionally. Do not stretch a small result card to fill the screen, and do not leave the player with only an unexplained number at the top.

For result screens, use a clear hierarchy such as:

1. "Inside the country!" or "2 cards in the correct positions."
2. This round: 100/100.
3. This game: 625/1000.
4. Tournament total and rank.
5. "Waiting for the host to start the next round."

Values above are illustrative; render actual server results. If a breakdown is unavailable, add the necessary legitimate response data rather than guessing.

### C. Shared display: a presentation for the whole room

Compose a dedicated presentation layout for a large 16:9 screen, with readable hierarchy and no document-style vertical scrolling during the normal event flow.

- Use large titles, a clear timer, and one dominant visual: arena, globe, ordering cards, or results.
- Keep operational tools in the host dashboard. Retain a discreet local setup overlay for fullscreen/audio initialization, accessible when needed and hidden during presentation.
- Let the host control leaderboard pages and ceremony steps from their dashboard.
- Use purposeful transitions: a brief round introduction, countdown, action, answer reveal, score movement, and standings.
- Transitions happen only after the host authorizes the corresponding stage. Animation completion never starts another round.
- Replace the oversized table-first standings view with a leader summary and a readable supporting list, while retaining access to everyone through host-controlled pages.
- Show at most approximately 8-10 readable rows per page at the target display size. Adapt row count if space is smaller rather than clipping or shrinking text excessively.
- Distinguish current-game standings from tournament standings. Use recognizable game labels/icons instead of ambiguous Race / Globe / Order shorthand alone.
- Show a not-yet-played game as a dash or "Not played" in presentation, while preserving its actual zero contribution to the total. Do not confuse that with a played round scoring zero.
- Explain ties explicitly. Ten tied first-place participants must not be converted into an arbitrary three-person podium. Preserve the real competition ranking and use a tied-leaders treatment until the tie rules resolve it.
- Animate actual position changes gently after a reveal. Keep results stable long enough to read.
- Prevent long names, many tied winners, and large scores from pushing content outside the display frame.

## 4. Improve each game's experience

### Red Light, Green Light

Make the effective state unmistakable across host, phone, and display.

- GREEN: a clear GO instruction and responsive hold feedback.
- RED: a clear STOP instruction, distinct icon, and immediate visual emphasis.
- PAUSED: a dominant PAUSED state and explanatory text. Do not leave GO as the main instruction. The previous signal may remain as secondary context only.
- ELIMINATED: show the agreed death animation and controlled elimination sound, explain "0 points this race", and state that the player returns next race.
- FINISHED: celebrate completion briefly and confirm that the player is waiting for the host.
- DISCONNECTED: freeze safely, communicate reconnection, and restore the real life state without reviving an eliminated player.

Make the personal progress indicator feel like movement toward a finish line. Keep the avatar within the track container; it must not be clipped at 0% or 100%. Maintain a large hold control that is usable one-handed.

The shared arena must communicate many players without an unreadable cloud of names. Use short identifiers, featured names, alive/finished/eliminated counts, and a limited event feed.

Preserve server-authoritative timing, shared red tolerance, Manual/Auto semantics, one-time death events, zero points for an eliminated race, and host-triggered respawn in the next race. Localization, resize, or opening a menu must not leave a stuck hold or cause an unintended movement command.

### Pin the Country

Make globe interaction discoverable with a short demonstration of rotate, zoom, tap, and lock.

- Keep the country name and timer readable while interacting.
- Show whether the pin is not placed, saved, or locked.
- Make placing a pin distinct from rotating the globe.
- Keep Reset View available without crowding the main action.
- Reserve adequate globe space in both portrait and landscape layouts; do not shrink it into a decorative thumbnail.
- Ensure visible controls do not cover the likely target or the player's pin.
- At reveal, show the correct country, the player's pin, distance when outside, and earned score. Show the same geography on the big screen with appropriate pin clustering.
- Preserve equal full points for all pins inside the accepted country area and the existing distance formula outside it.

### Order It!

- State the requested order explicitly and identify which end is first.
- Use four spacious cards with a drag handle, position marker, and keyboard/touch movement alternatives.
- Make dragging readable: show the insertion position and give subtle drop feedback.
- Keep Lock My Order reachable without covering the final card.
- At reveal, compare the submitted arrangement with the correct order and explain the score by correct positions.
- Keep actual point values and correctness hidden until the host reveals them.

For all games, improve the instructional screens with one short sentence, three visual steps, a tiny demonstration, and clear readiness feedback. Participants should understand the main action in about ten seconds. Instructions remain until the host advances; readiness does not trigger play.

## 5. Full Arabic and English support

This is a functional bilingual experience, not a translated menu.

Translate all:

- Join forms, navigation, host controls, instructions, questions, option labels, country names, and help.
- Waiting, pause, countdown, eliminated, finished, disconnected, locked, and error states.
- Standings, scoring explanations, ties, exports, and ceremony messages.
- Accessible labels, hints, notifications, and validation messages.

Use clear, friendly Arabic suitable for a Saudi workplace, and concise natural English. Avoid awkward literal translations and unexplained technical wording.

Suggested terminology:

| English | Arabic |
|---|---|
| Red Light, Green Light | امش… وقف! |
| Pin the Country | وين الدولة؟ |
| Order It! | رتّبها! |
| Start Round | ابدأ الجولة |
| Reveal Results | اعرض النتائج |
| Resume | استئناف |
| Manual | يدوي |
| Auto | تلقائي |
| Waiting for the host | بانتظار المقدّم |
| Paused by the host | أوقف المقدّم الجولة مؤقتًا |
| Hold to Move | اضغط باستمرار للمشي |
| Eliminated | خرجت من هذه الجولة |
| Lock My Pin | ثبّت موقعي |
| Lock My Order | ثبّت ترتيبي |
| This round | نقاط الجولة |
| This game | نقاط اللعبة |
| Tournament total | مجموع البطولة |

Language behavior:

- Each participant independently chooses Arabic or English. Save the preference without creating a new identity.
- The host dashboard language is independent from the shared display language.
- Let the host select the display language and the default language for new participants. A participant's change must never switch the entire room.
- Switching language must preserve session, current stage, timer deadline, pin, card order, lock status, scores, and elimination state. It must not restart a round or create extra answer time.
- Keep event IDs, country IDs, option IDs, and correct answers language-independent. Translate labels, never the score-bearing identity.
- Use proper RTL for Arabic and LTR for English, including controls, drawers, spacing, icons that convey direction, and text alignment.
- Do not mirror the actual globe, geographical coordinates, spatial race model, or top-to-bottom answer order. Localize the surrounding UI while preserving game meaning.
- Isolate mixed-script names, join codes, timestamps, fractions, units, and scores so bidirectional text does not scramble them.
- Do not silently replace a knowledge question with a different one in another language. For example, an English alphabet ordering question must keep the same letters and explicitly say "English alphabetical order" in both languages.
- Keep question difficulty, timing, and scoring equivalent. If a prompt cannot be translated fairly, replace it for everyone before the event, not for one locale during a round.
- Decide and consistently apply a numeral-formatting convention; scores and code entry must remain unambiguous.
- Exports should retain stable machine-readable IDs. Localized labels must not corrupt CSV structure or score fields.

## 6. Responsive design across all roles

Design for available space and task priority. Avoid a single desktop layout compressed into a phone.

Verify at representative sizes:

- Phones: 360, 390, and 430 px widths; include a short viewport and landscape orientation.
- Tablets: approximately 768 and 1024 px widths.
- Host laptops: 1366 x 768 and 1440 x 900.
- Shared displays: 1920 x 1080 and 3840 x 2160, plus a smaller window for rehearsal.

Requirements:

- No horizontal overflow or clipped primary controls in either language.
- The host's stage action remains easy to reach on smaller screens; secondary tools collapse into tabs or drawers.
- Convert wide administrative tables into useful mobile lists with expandable details.
- Keep phone touch targets at least 44 x 44 px and main gameplay controls larger.
- Handle safe-area insets, browser chrome, keyboard opening, and zoom without losing the primary action.
- Preserve card order and globe pin on resize or orientation change.
- Normal display presentation fits its viewport; mobile instructions and help can scroll naturally when needed.
- Support visible keyboard focus, reduced motion, color-independent state cues, and readable text contrast.
- Optimize live rendering for 100 players and modest phones. Animate only what helps comprehension; avoid effect-heavy updates on every incoming message.

## 7. Elm identity and creative direction

Follow `colors.pdf` and the existing requirements' verified palette. Use centralized tokens and shared components.

Key colors:

- Navy: #051D49.
- Blue: #0071CE; Royal Blue: #0032A0.
- Purple: #763CBC; Deep Purple: #5A2C83.
- Cyan: #00A1E0.
- Peach: #FFA168; Orange: #FF5D36; Lavender: #CC8BDB.
- Burgundy: #A12B2A.
- Background neutrals: #F7F8FC, #E5E9F6, #BDC9E9, #2B2E65, #464D7E.
- Functional GO/success green: #15803D, already documented as a game-specific extension rather than an official Elm color.

Create a consistent visual rhythm: calm neutral surfaces, strong Navy typography, Blue primary actions, Purple stage accents, and restrained warm celebratory details. Avoid giving every panel a heavy filled background or every statistic a badge.

Use a compatible Arabic/Latin type system with good name rendering and legible numerals. Use licensed project-provided Elm fonts if available; do not claim a fallback font or invented logo is official.

Keep genuine Elm assets intact and Built using ASAS as secondary attribution. Maintain readable foreground/background pairs. Do not change RED/GREEN semantics to match decorative colors.

Make the event enjoyable through meaningful moments: a clear countdown, tactile hold feedback, a country reveal, correct cards snapping into position after reveal, truthful score gains, and a carefully paced ceremony. Use existing scores and events as the source of every celebration.

## 8. Implementation and verification expectations

Work in the existing project. Inspect and update state logic where necessary to fix inconsistent UI, without replacing functioning multiplayer or scoring architecture unnecessarily.

Suggested sequence:

1. Record a concise, screenshot-grounded diagnosis and define the three role-specific journeys.
2. Establish shared bilingual design tokens, typography, controls, and status components.
3. Implement the host workspace, participant journey, and display composition.
4. Apply the new system to all three games, their instructions, and every recovery/result state.
5. Verify both languages and viewport groups against real event states.

Do not stop after the audit, a landing-page refresh, or a single improved screen. Continue through implementation and validation of the complete event journey.

Before finishing, verify:

- Joining through the ceremony works across host, participant, and display.
- The host always controls Start, Reveal, and Next, including Auto signal mode.
- Pause presents one coherent instruction on every screen.
- Manual/Auto controls, labels, and feedback agree with authoritative state.
- Arabic and English can be used simultaneously by different participants.
- Switching language preserves locked/unlocked answers and all active game state.
- Arabic layouts do not break maps, fractions, alphabetical questions, names, or codes.
- Mobile actions remain reachable; the shared display does not overflow.
- Correct ties and unplayed-game states remain distinguishable.
- Refresh and reconnection preserve scores and elimination state.
- No duplicate scoring, leaked answers, fabricated progress, or accidental revival is introduced.
- Animations and sound remain usable with many participants and reduced-motion/mute settings.

Use screenshots from the running application, not just design mockups, to inspect the new layouts. Report what was tested and any untested device or network limitation accurately.

Final handoff:

- A concise explanation of the most important UX improvements by role.
- Updated working screens and shared components.
- Complete Arabic and English content coverage.
- Representative before/after screenshots for host, participant, and display, with both languages and phone/desktop examples.
- A short list of genuine remaining limitations or missing official assets.

The result should allow a first-time participant to understand their next action immediately, let the host lead the room without hunting for controls, and make the large-screen presentation clear, lively, and unmistakably connected to Elm and ASAS.
