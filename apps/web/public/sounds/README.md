# Display sound cues

Optional licensed audio for the shared display. When a file named
`<cue>.mp3` exists here it is played instead of the built-in synthesised cue
(see `src/app/core/sound.service.ts`). Missing files are fine — the synth is
always available.

| Cue | Moment |
|---|---|
| `countdownTick.mp3` | 3-2-1 countdown |
| `start.mp3` | round opens |
| `go.mp3` | GREEN signal |
| `stop.mp3` | RED signal |
| `elimination.mp3` | one player out |
| `eliminationBurst.mp3` | several players out at once |
| `finish.mp3` | a racer reaches the finish |
| `reveal.mp3` | results revealed |
| `podium.mp3` | a podium place revealed |
| `fanfare.mp3` | the champion revealed |

Keep each cue under two seconds. Phones never play these (§14).
