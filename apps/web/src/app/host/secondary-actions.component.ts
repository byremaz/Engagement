/**
 * "More stage actions" — the secondary row.
 *
 * The primary slot owns the single next press; everything else the current
 * state allows lands here, so the next action is always identifiable instead of
 * being one of an undifferentiated button row. Preparing the next round and
 * starting it stay two distinct entries. Pause/Resume is included only while a
 * round is actually running.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { HostAction, SessionSnapshot } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

/** Which stage actions the server accepts in which state. */
const BY_STATE: Record<string, HostAction[]> = {
  Lobby: ['SHOW_INSTRUCTIONS'],
  Instructions: ['SHOW_INSTRUCTIONS', 'START_PRACTICE', 'START_GAME'],
  Practice: [],
  Ready: ['START_ROUND'],
  InputLocked: ['REVEAL_PRACTICE', 'REVEAL_RESULTS'],
  Reveal: ['START_GAME', 'NEXT_ROUND', 'SHOW_GAME_RESULTS'],
  GameResults: ['SHOW_INSTRUCTIONS', 'NEXT_GAME', 'SHOW_FINAL_RESULTS'],
};

@Component({
  selector: 'app-secondary-actions',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actions().length || pauseAction()) {
      <details class="more">
        <summary class="more__summary">{{ 'host.more' | t }}</summary>
        <div class="more__row">
          @if (pauseAction(); as pa) {
            <button type="button" class="btn btn-warm" [disabled]="busy()" (click)="run.emit(pa)">
              {{ labelKey(pa) | t }}
            </button>
          }
          @for (a of actions(); track a) {
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="run.emit(a)">
              {{ labelKey(a) | t }}
            </button>
          }
        </div>
      </details>
    }
  `,
  styles: [
    `
      .more {
        min-inline-size: 0;
      }
      .more__summary {
        cursor: pointer;
        font-size: var(--fs-sm, 0.875rem);
        color: var(--elm-royal-blue, #0032a0);
        font-weight: 600;
      }
      .more__row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
        margin-block-start: var(--space-2, 8px);
      }
    `,
  ],
})
export class SecondaryActionsComponent {
  readonly snap = input<SessionSnapshot | null>(null);
  readonly busy = input<boolean>(false);
  /** The action already shown in the primary slot, excluded from this row. */
  readonly primary = input<HostAction | null>(null);

  readonly run = output<HostAction>();

  labelKey(a: HostAction): StringKey {
    return `action.${a}` as StringKey;
  }

  readonly actions = computed<HostAction[]>(() => {
    const s = this.snap();
    if (!s || s.paused) return [];
    const all = BY_STATE[s.state] ?? [];
    return all.filter((a) => {
      if (a === this.primary()) return false;
      // Practice reveal vs scored reveal are mutually exclusive.
      if (a === 'REVEAL_PRACTICE') return s.isPractice;
      if (a === 'REVEAL_RESULTS') return !s.isPractice;
      if (a === 'START_GAME') return s.state === 'Instructions' || s.isPractice;
      if (a === 'NEXT_ROUND') return !s.isPractice;
      if (a === 'SHOW_GAME_RESULTS') return !s.isPractice;
      return true;
    });
  });

  /** Pause and Resume only exist while a round is live. */
  readonly pauseAction = computed<HostAction | null>(() => {
    const s = this.snap();
    if (!s) return null;
    const live = s.state === 'Countdown' || s.state === 'RoundActive';
    if (!live) return null;
    // Resume is the primary action while paused, so it is not repeated here.
    return s.paused ? null : 'PAUSE';
  });
}
