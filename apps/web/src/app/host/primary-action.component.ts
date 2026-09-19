/**
 * One stable primary-action slot for the host desk.
 *
 * The label and availability derive from the authoritative effective state
 * (snapshot `state` + `paused`), never from local optimism, so the host always
 * looks at the same place for "what do I press next". Preparing the next round
 * and starting it stay two distinct actions — this component never merges them.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { HostAction, SessionSnapshot } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';

export interface PrimaryActionDef {
  action: HostAction;
  /** Dictionary key resolved through `LocaleService`. */
  labelKey: string;
}

@Component({
  selector: 'app-primary-action',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="primary-slot">
      <span class="primary-slot__hint small muted">{{ 'host.primary.hint' | t }}</span>
      @if (resolved(); as a) {
        <button
          type="button"
          class="btn btn-primary btn-lg primary-slot__btn"
          [disabled]="busy()"
          (click)="run.emit(a.action)"
        >
          {{ label() }}
        </button>
      } @else {
        <!--
          Plan §6: a state with no button is NOT "no action available". It is a
          live state the host needs explained: what is happening now and how it
          ends. The text is derived from authoritative snapshot state only.
        -->
        <p class="primary-slot__context" role="status">{{ contextText() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .primary-slot {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        min-block-size: 96px;
        justify-content: center;
      }
      .primary-slot__btn {
        inline-size: 100%;
        min-block-size: 56px;
        font-size: var(--fs-lg, 1.125rem);
      }
      /* Live context is operational information, not a disabled-looking blank. */
      .primary-slot__context {
        margin: 0;
        font-size: var(--fs-md, 1rem);
        font-weight: var(--fw-bold, 700);
        line-height: 1.4;
        color: var(--elm-navy);
      }
    `,
  ],
})
export class PrimaryActionComponent {
  private readonly locale = inject(LocaleService);

  readonly snap = input<SessionSnapshot | null>(null);
  readonly busy = input<boolean>(false);
  readonly run = output<HostAction>();

  /** Resume always wins: a paused event has exactly one sensible next press. */
  readonly resolved = computed<PrimaryActionDef | null>(() => {
    const s = this.snap();
    if (!s) return null;
    if (s.paused) return { action: 'RESUME', labelKey: 'action.RESUME' };
    switch (s.state) {
      case 'Lobby':
        return { action: 'SHOW_INSTRUCTIONS', labelKey: 'action.SHOW_INSTRUCTIONS' };
      case 'Instructions':
        return { action: 'START_PRACTICE', labelKey: 'action.START_PRACTICE' };
      case 'Practice':
      case 'Ready':
        return { action: 'START_ROUND', labelKey: 'action.START_ROUND' };
      case 'InputLocked':
        return s.isPractice
          ? { action: 'REVEAL_PRACTICE', labelKey: 'action.REVEAL_PRACTICE' }
          : { action: 'REVEAL_RESULTS', labelKey: 'action.REVEAL_RESULTS' };
      case 'Reveal':
        // Practice reveal leads into the real game; a scored reveal leads to the
        // next round, or to the game results once the planned rounds are done.
        if (s.isPractice) return { action: 'START_GAME', labelKey: 'action.START_GAME' };
        return s.roundNumber >= s.roundCount
          ? { action: 'SHOW_GAME_RESULTS', labelKey: 'action.SHOW_GAME_RESULTS' }
          : { action: 'NEXT_ROUND', labelKey: 'action.NEXT_ROUND' };
      case 'GameResults':
        return s.gameIndex >= 2
          ? { action: 'SHOW_FINAL_RESULTS', labelKey: 'action.SHOW_FINAL_RESULTS' }
          : { action: 'NEXT_GAME', labelKey: 'action.NEXT_GAME' };
      case 'Countdown':
      case 'RoundActive':
      case 'TournamentResults':
      case 'Draft':
      case 'Closed':
      default:
        return null;
    }
  });

  readonly label = computed(() => {
    const a = this.resolved();
    // `t()` reads the `lang` signal, so a language switch re-renders the label.
    return a ? this.locale.t(a.labelKey as never) : '';
  });

  /**
   * Live context for the states that deliberately have no primary press
   * (plan §6). Explains what is running and how the round ends, so the host
   * is never left guessing — and never tempted to press a next-stage button
   * that would quietly end a live race or award points early.
   */
  readonly contextText = computed(() => {
    const s = this.snap();
    if (!s) return this.locale.t('host.context.loading' as never);
    switch (s.state) {
      case 'Countdown':
        return this.locale.t('host.context.countdown' as never);
      case 'RoundActive': {
        if (s.gameType === 'RLGL') {
          const players = s.race?.players ?? [];
          return this.locale.t('host.context.raceActive' as never, {
            alive: players.filter((p) => p.state === 'alive').length,
            finished: players.filter((p) => p.state === 'finished').length,
          });
        }
        return this.locale.t('host.context.roundActive' as never, {
          answers: s.responseCount,
          total: s.participantCount,
        });
      }
      case 'TournamentResults':
        return this.locale.t('host.context.tournamentResults' as never);
      case 'Draft':
        return this.locale.t('host.context.draft' as never);
      case 'Closed':
        return this.locale.t('host.context.closed' as never);
      default:
        return this.locale.t('host.context.waiting' as never);
    }
  });
}
