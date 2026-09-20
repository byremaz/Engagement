/**
 * One stable primary-action slot for the host desk ("Now & Next", plan v2 §4.2).
 *
 * The label and availability derive from the authoritative effective state
 * (snapshot `state` + `paused`), never from local optimism, so the host always
 * looks at the same place for "what do I press next". Preparing the next round
 * and starting it stay two distinct actions — this component never merges them.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { HostAction, SessionSnapshot } from '@asas/shared';
import { podiumRankForStep } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';
import { nextStepFor, primaryActionFor } from './next-action';

export interface PrimaryPress {
  action: HostAction;
  payload?: { step?: number };
}

@Component({
  selector: 'app-primary-action',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="primary-slot">
      <span class="primary-slot__hint small muted">{{ 'host.primary.hint' | t }}</span>
      @if (press(); as p) {
        <button type="button" class="btn btn-primary btn-lg primary-slot__btn" [disabled]="busy()" (click)="run.emit(p)">
          {{ label() }}
        </button>
        @if (stepNote(); as n) { <p class="primary-slot__note small muted">{{ n }}</p> }
      } @else {
        <p class="primary-slot__context" role="status">{{ contextText() }}</p>
      }
    </div>
  `,
  styles: [`
    .primary-slot { display: flex; flex-direction: column; gap: var(--space-2); min-block-size: 96px; justify-content: center; }
    .primary-slot__btn { inline-size: 100%; min-block-size: 64px; font-size: var(--fs-2); }
    .primary-slot__context { margin: 0; font-size: var(--fs-0); font-weight: var(--fw-bold); line-height: 1.4; color: var(--elm-navy); }
    .primary-slot__note { margin: 0; }
  `],
})
export class PrimaryActionComponent {
  private readonly locale = inject(LocaleService);

  readonly snap = input<SessionSnapshot | null>(null);
  readonly busy = input<boolean>(false);
  readonly run = output<PrimaryPress>();

  readonly action = computed(() => primaryActionFor(this.snap()));

  readonly press = computed<PrimaryPress | null>(() => {
    const a = this.action();
    if (!a) return null;
    if (a === 'PODIUM_STEP' || a === 'CEREMONY_STEP') return { action: a, payload: { step: nextStepFor(this.snap()) } };
    return { action: a };
  });

  readonly label = computed(() => {
    this.locale.lang();
    const p = this.press();
    if (!p) return '';
    if (p.action === 'PODIUM_STEP' || p.action === 'CEREMONY_STEP') return this.locale.t(`podium.step.${p.payload?.step ?? 0}` as StringKey);
    return this.locale.t(`action.${p.action}` as StringKey);
  });

  /** Warns when the next podium step has nobody to reveal (a tie skipped it). */
  readonly stepNote = computed(() => {
    const s = this.snap();
    const p = this.press();
    if (!s || !p || (p.action !== 'PODIUM_STEP' && p.action !== 'CEREMONY_STEP')) return null;
    const step = p.payload?.step ?? 0;
    if (step >= 1 && step <= 3 && podiumRankForStep(s.standings ?? [], step) === null) return this.locale.t('podium.step.none');
    return null;
  });

  readonly contextText = computed(() => {
    const s = this.snap();
    if (!s) return this.locale.t('host.context.loading');
    switch (s.state) {
      case 'Countdown':
        return this.locale.t('host.context.countdown');
      case 'RoundActive': {
        if (s.gameType === 'RLGL') {
          const players = s.race?.players ?? [];
          return this.locale.t('host.context.raceActive', {
            alive: players.filter((p) => p.state === 'alive').length,
            finished: players.filter((p) => p.state === 'finished').length,
          });
        }
        return this.locale.t('host.context.roundActive', { answers: s.responseCount, total: s.participantCount });
      }
      case 'TournamentResults':
        return this.locale.t('host.context.tournamentResults');
      case 'Draft':
        return this.locale.t('host.context.draft');
      case 'Closed':
        return this.locale.t('host.context.closed');
      default:
        return this.locale.t('host.context.waiting');
    }
  });
}
