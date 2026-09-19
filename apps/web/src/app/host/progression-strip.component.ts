/**
 * Host progression strip: Lobby → Instructions → Practice → Game → Results.
 *
 * It is a READ-ONLY reflection of the authoritative snapshot state. Clicking a
 * step does nothing — progression happens only through the primary action and
 * the "more stage actions" row, so the host can never jump the state machine by
 * touching a progress indicator.
 *
 * A compact three-dot marker shows overall game progress (1 of 3) instead of a
 * wall of badges.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SessionSnapshot, SessionState } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

/** Ordered phases of a single game, with the states that map onto each phase. */
const PHASES: { key: string; states: SessionState[] }[] = [
  { key: 'host.progress.lobby', states: ['Draft', 'Lobby'] },
  { key: 'host.progress.instructions', states: ['Instructions'] },
  { key: 'host.progress.practice', states: ['Practice'] },
  { key: 'host.progress.game', states: ['Ready', 'Countdown', 'RoundActive', 'InputLocked', 'Reveal'] },
  { key: 'host.progress.results', states: ['GameResults', 'TournamentResults', 'Closed'] },
];

@Component({
  selector: 'app-progression-strip',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip" role="group" [attr.aria-label]="'host.stage' | t">
      <ol class="strip__phases">
        @for (p of phases; track p.key; let i = $index) {
          <li
            class="strip__phase"
            [class.is-current]="i === activeIndex()"
            [class.is-done]="i < activeIndex()"
            [attr.aria-current]="i === activeIndex() ? 'step' : null"
          >
            <span class="strip__dot" aria-hidden="true"></span>
            <span class="strip__label">{{ p.key | t }}</span>
          </li>
        }
      </ol>

      <!-- Overall game progress: three dots, not a badge wall. -->
      <div class="strip__games" [attr.aria-label]="'host.progress.gameOf' | t: { n: gameNumber(), total: 3 }">
        <span class="strip__games-text small muted">{{ 'host.progress.gameOf' | t: { n: gameNumber(), total: 3 } }}</span>
        <span class="strip__games-dots" aria-hidden="true">
          @for (g of games; track g) {
            <span class="strip__game-dot" [class.is-done]="g < gameNumber()" [class.is-current]="g === gameNumber()"></span>
          }
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      .strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3, 12px);
        justify-content: space-between;
      }
      .strip__phases {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3, 12px);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .strip__phase {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        color: var(--elm-slate, #464d7e);
        font-size: var(--fs-sm, 0.875rem);
        white-space: nowrap;
      }
      /* Logical separator so the arrow flips with dir automatically. */
      .strip__phase + .strip__phase::before {
        content: '';
        inline-size: 18px;
        block-size: 2px;
        background: var(--elm-light-blue, #bdc9e9);
        margin-inline-end: var(--space-2, 8px);
      }
      .strip__dot {
        inline-size: 10px;
        block-size: 10px;
        border-radius: 50%;
        background: var(--elm-light-blue, #bdc9e9);
      }
      .strip__phase.is-done .strip__dot {
        background: var(--elm-blue, #0071ce);
      }
      .strip__phase.is-current .strip__dot {
        background: var(--elm-royal-blue, #0032a0);
        box-shadow: 0 0 0 4px rgba(0, 50, 160, 0.18);
      }
      .strip__phase.is-current .strip__label {
        color: var(--elm-navy, #051d49);
        font-weight: 700;
      }
      .strip__games {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }
      .strip__games-dots {
        display: inline-flex;
        gap: 4px;
      }
      .strip__game-dot {
        inline-size: 8px;
        block-size: 8px;
        border-radius: 50%;
        background: var(--elm-light-blue, #bdc9e9);
      }
      .strip__game-dot.is-done {
        background: var(--elm-blue, #0071ce);
      }
      .strip__game-dot.is-current {
        background: var(--elm-purple, #763cbc);
      }
    `,
  ],
})
export class ProgressionStripComponent {
  readonly snap = input<SessionSnapshot | null>(null);

  readonly phases = PHASES;
  readonly games = [1, 2, 3];

  readonly activeIndex = computed(() => {
    const st = this.snap()?.state;
    if (!st) return 0;
    // Practice rounds run through the normal round states, so a practice
    // attempt must still read as "Practice", not as "Game".
    if (this.snap()?.isPractice && st !== 'GameResults' && st !== 'TournamentResults') return 2;
    const i = PHASES.findIndex((p) => p.states.includes(st));
    return i < 0 ? 0 : i;
  });

  readonly gameNumber = computed(() => Math.min(3, Math.max(1, (this.snap()?.gameIndex ?? 0) + 1)));
}
