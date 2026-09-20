# ASAS Challenge — Host Operating Guide (spec §16 deliverable 5)

A short, event-day guide for the person running the session. Covers setup, display and audio
testing, joining, device capture, explanations, signal modes, host transitions, connection
recovery and export. Keep this open on the host computer.

Three URLs, three audiences:

| URL | Who | Notes |
|---|---|---|
| `/` or `/join/:code` | Participant phones | QR code or session code + name |
| `/display` | Shared big screen | 1920 × 1080, main audio source, no admin controls |
| `/host` | Host computer only | Requires `HOST_ACCESS_KEY` |

---

## 1. Setup (T-60 min)

1. Start PostgreSQL, the API and the web app on the venue network (`README.md` → *Running locally*).
2. Confirm `GET /v1/health` returns OK from the host computer **and** from a phone on the venue Wi-Fi.
3. Open `/host`, enter the host access key. It is kept in `sessionStorage` only — closing the tab signs you out.
4. **Create a session:** event title (`ASAS Challenge`) and capacity `100`. Content and scoring rules are
   frozen into the session snapshot at creation; do not edit content after this point.
5. Note the join code shown in the header. Use **Copy join link** to test it once on your own phone.

Content, scoring rules and game order are configuration — freeze them before the tournament and do not
change them mid-session (§2, §10).

## 2. Display and audio test (T-30 min)

1. On the display computer open **Open display link** from the host dashboard (it carries a display token),
   then put the browser in full screen (F11).
2. The display shows a start overlay: **click it once**. Browser autoplay policy requires one local
   gesture before any sound can play (AC-25).
3. You should hear the short test tone. Use the mute toggle and volume control on the display to set a
   level that carries to the back row.
4. Check readability from the **back of the actual room**: join code, timer and standings (AC-16).
5. Phones are silent by default and stay that way — all event audio comes from the display machine.

## 3. Rehearsal before the audience arrives

Use the **Rehearsal** panel on the host dashboard:

1. Set a count (1–100) and press **Add simulated players**. They appear in the roster with a `sim` badge.
2. Walk the full stage sequence for all three games and check the display and a real phone.
3. Press **Remove all** to clear simulated players before real joining opens.

Simulated players exist to validate the flow and load; they are flagged in the roster and must be
removed before the event so real results stay clean (§16 deliverable 4, AC-01).

## 4. Joining and device capture (00:00–03:00)

1. Confirm **joining is open** (the Session card toggles between *Open joining* / *Close joining*).
2. The display Lobby shows the QR code, join code, player count and avatars.
3. Participants scan, type a name (2–24 characters) and join. **Name is the only required input** — no
   phone number, email or employee ID (§5.1, AC-18).
4. Each phone stores a private recovery code. Tell participants once: *"if your phone dies, that code
   restores your identity"*. The server keeps only a hash, so the host cannot read a lost code back.
5. The **Participants** table fills in automatically: Name, Device Type, Model, OS, Browser, Connection,
   Ready. Missing values show **Not available** — detection failure never blocks play (AC-18, AC-19).
6. Duplicate names get a distinguishing number (e.g. `Abdullah #17`). Use **Rename** or **Remove** for
   genuine duplicates. Never edit scores; there is no per-player score editing in v1 (§4.1).
7. Device details and recovery codes never appear on the shared display or in public exports.

Late arrivals: keep joining open if you like — a late player waits for the next round, scores zero for
missed rounds, and their denominator does not change (§5.1 item 10).

## 5. Explanations before every game (mandatory)

Press **Show Instructions** before *each* game. How to Play opens on the display and on every phone,
with three steps, an animated example and the scoring/elimination rule. Scored controls are inactive.

- Phones show **I'm Ready**; you see a count such as `Ready 42/60`.
- Full readiness **never** starts the game — you always press the next button (AC-20).
- **Start Practice** → **Reveal Practice Results** is unscored. You may skip practice when time is tight,
  but never skip the instructions themselves (§4.4).

## 6. Signal modes — Red Light, Green Light only

| Mode | Behaviour |
|---|---|
| **Manual** (default) | You press **■ RED** / **▶ GREEN**; the change synchronises to all devices. |
| **Auto** | The server runs a reproducible signal schedule inside the race. |

Auto controls **signal switching only, never event progression** — Start, Reveal and Next always require
your action in both modes. Switching mode mid-race never revives an eliminated player and never resets
the red tolerance window (§4.5, AC-21, AC-22).

Elimination lasts for the **current race only**. Eliminated players return automatically at the next
host-started race and for the following games (§2, AC-23).

## 7. Host transitions — the button order

Per game:

```
Show Instructions → Start Practice → Reveal Practice Results → Start Game
  → Start Round → [round runs] → Reveal Results → Next Round → … (repeat)
  → Show Game Results → Next Game
```

At the end: **Show Final Results** → step the **Ceremony** (3rd → 2nd → 1st → full table).

Rules that matter live:

- **Timers close input only.** When a timer expires the round closes and everything shows
  *"Waiting for the host"*. Nothing reveals and nothing advances by itself (§4.5, AC-21).
- The answer **count** is visible to you during a round; answer **contents** are not, and ordering
  solutions stay hidden until you reveal (AC-15).
- **Start Round** plays a shared three-second countdown, then opens input.
- Only the last valid answer received before closing counts; late and duplicate messages are ignored (AC-09).

## 8. When something goes wrong

| Situation | What to do |
|---|---|
| Projector, network or noise problem mid-round | **Pause** — interaction and time freeze. **Resume** replays a shared countdown; stale holds are not penalised and results are not duplicated (AC-10). |
| Round is defective (wrong content, unfair start) | **Void & replay round…**, enter a reason (kept as an audit record). Only the replacement attempt scores. A spare round is used where the spec requires it (§10.4, AC-12). |
| A phone reloads or drops | Identity, score, locked answer and life state are restored by the server. A reload never creates a second player and never revives an eliminated one (AC-11, AC-23). |
| A participant switches to another phone | They enter their recovery code. The new device becomes the single active controller; the old one is disconnected. Device history is retained (§5.1 item 8). |
| Display drops | Reopen **Open display link** and click the overlay once to re-enable audio. Old sounds do not replay after recovery (AC-24). |
| After each game | **Show game results** opens the podium: press **Reveal 3rd place → Reveal 2nd place → Reveal the champion → Show full table** (the primary button walks these steps). A tie shows one band with everyone tied; a step with nobody to reveal is greyed out. |
| Display language | In the **Room** card choose the shared display's language and the default language for new phones; each phone can still switch its own language. |
| Server restarted mid-round | The API recovers on boot: a live race is voided and prepared again (press **Start round**); a live globe/order round is paused (press **Resume**). |
| Tie for the top three | The **Ceremony** panel offers an Order It! tie-break for exactly the tied players. |

Disconnection alone never eliminates a racer; a hold with no heartbeat is treated as released (AC-04).

## 9. Results and export (27:00–30:00)

1. **Show Final Results**, then step through the ceremony: third, second, first, then the complete table.
2. Export before closing:
   - **Export standings (public)** — `standings.csv`, rankings and scores, no device data.
   - **Export standings (private)** — adds the device columns for the host record.
   - **Export rounds** — `rounds.csv`, per-round detail including void reasons.
3. Check the CSV rankings match the ceremony table, including names in non-Latin scripts (AC-14).
4. **Close session…** (double confirmation). Joining and play end; results are kept in the database.

Scoring reference (v2, rule version 2.0.0): every round = up to 80 for the achievement + up to 20 for speed
(speed only with a full achievement and a manual lock). Race: finish 80 + speed relative to the first finisher
(15 s window), alive at the end 60 × progress, eliminated 0. Globe: inside 80 + speed, outside 80 − 10 per
500 km. Order: 20 per correct card, all four + a fast lock adds speed. The red-signal tolerance is 450 / 400 / 350 ms for races 1-3 (500 ms in practice); races 2 and 3 include short fake-out greens. Order It! has 5 scored rounds.
Each game is worth up to 1,000 points, tournament total up to 3,000. All scoring runs
on the server from frozen rules (`SCORING_RULE_VERSION` in the session snapshot); clients never send
scores. Practice never contributes points (AC-03).

## 10. Two-minute pre-event checklist

- [ ] `GET /v1/health` OK from host computer and from a phone on venue Wi-Fi
- [ ] Session created, capacity 100, joining open
- [ ] Display full screen, overlay clicked, test tone heard, volume set
- [ ] QR code resolves to the public URL from a real phone
- [ ] Simulated rehearsal players removed (`Remove all` shows 0)
- [ ] One real iPhone and one real Android joined and visible in the roster
- [ ] This guide and `docs/acceptance-evidence.md` open on the host computer

Known limitations are listed at the end of `docs/acceptance-evidence.md` — read them once before the event.
