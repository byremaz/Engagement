/**
 * Podium / ceremony stepper (plan v2 §8): the host reveals third → second →
 * champion → full table with explicit presses. Steps with nobody to reveal
 * (a tie skipped that place) are greyed out with a stated reason. The
 * tie-break button lives here because it is a results-stage decision.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { SessionSnapshot } from '@asas/shared';
import { podiumRankForStep, topThreeTies } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-podium-stepper',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="stepper">
      <h3 class="stepper__title">{{ (final() ? 'host.ceremony.title' : 'host.podium.title') | t }}</h3>
      <p class="small muted stepper__hint">{{ 'host.podium.stepHint' | t }}</p>
      <div class="stepper__row">
        @for (st of stepsList; track st) {
          <button
            type="button"
            class="btn"
            [class.btn-stage]="current() === st"
            [class.btn-secondary]="current() !== st"
            [disabled]="busy() || (st >= 1 && st <= 3 && empty(st))"
            [attr.title]="st >= 1 && st <= 3 && empty(st) ? ('podium.step.none' | t) : null"
            (click)="step.emit(st)"
          >
            {{ 'podium.step.' + st | t }}
          </button>
        }
      </div>
      @if (final() && tiedCount() > 0) {
        <button type="button" class="btn btn-warm" [disabled]="busy()" (click)="tieBreak.emit()">{{ 'host.tiebreak' | t: { count: tiedCount() } }}</button>
      }
    </section>
  `,
  styles: [`
    .stepper { display: flex; flex-direction: column; gap: var(--space-2); }
    .stepper__title { margin: 0; font-size: var(--fs-0); }
    .stepper__hint { margin: 0; }
    .stepper__row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  `],
})
export class PodiumStepperComponent {
  private readonly locale = inject(LocaleService);
  readonly snap = input<SessionSnapshot | null>(null);
  readonly busy = input(false);
  readonly step = output<number>();
  readonly tieBreak = output<void>();

  readonly stepsList = [1, 2, 3, 4, 0];
  readonly final = computed(() => this.snap()?.state === 'TournamentResults');
  readonly current = computed(() => {
    const s = this.snap();
    return this.final() ? (s?.ceremonyStep ?? 0) : (s?.podiumStep ?? 0);
  });
  readonly tiedCount = computed(() => topThreeTies(this.snap()?.standings ?? [])[0]?.length ?? 0);

  empty(step: number): boolean {
    return podiumRankForStep(this.snap()?.standings ?? [], step) === null;
  }
}
