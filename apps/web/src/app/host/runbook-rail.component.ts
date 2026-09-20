/**
 * Event runbook rail (plan v2 §4.2): the 30-minute plan as a list, with the
 * current step highlighted and a planned-vs-elapsed indicator so the host
 * always knows WHERE IN TIME the room is. Read-only.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { GameType, SessionSnapshot } from '@asas/shared';
import { GAME_ORDER, gameTitle } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';

interface Step {
  key: string;
  label: string;
  /** Planned start, minutes from the event start (§3). */
  plannedMin: number;
  game: GameType | null;
  kind: 'join' | 'game' | 'final';
}

const PLAN_MIN: Record<GameType, number> = { RLGL: 3, GEO: 10, ORDER: 19 };

@Component({
  selector: 'app-runbook-rail',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="rail" [attr.aria-label]="'host.runbook.title' | t">
      <h3 class="rail__title">{{ 'host.runbook.title' | t }}</h3>
      <ol class="rail__list">
        @for (st of steps(); track st.key; let i = $index) {
          <li class="rail__step" [class.is-current]="i === activeIndex()" [class.is-done]="i < activeIndex()" [attr.aria-current]="i === activeIndex() ? 'step' : null">
            <span class="rail__time num">{{ mm(st.plannedMin) }}</span>
            <span class="rail__label"><bdi>{{ st.label }}</bdi></span>
            @if (i === activeIndex() && detail(); as d) { <span class="rail__detail small"><bdi>{{ d }}</bdi></span> }
          </li>
        }
      </ol>
      @if (drift(); as d) {
        <p class="rail__drift small" [class.behind]="d.behind" [class.ahead]="d.ahead">
          {{ (d.behind ? 'host.runbook.behind' : d.ahead ? 'host.runbook.ahead' : 'host.runbook.onTime') | t: { min: d.min } }}
        </p>
      }
    </aside>
  `,
  styles: [`
    .rail { display: flex; flex-direction: column; gap: var(--space-2); }
    .rail__title { margin: 0; font-size: var(--fs-00); text-transform: uppercase; letter-spacing: .05em; color: var(--elm-muted-indigo); }
    .rail__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .rail__step { display: grid; grid-template-columns: 4ch 1fr; gap: 4px var(--space-2); align-items: baseline; padding: 6px 8px; border-radius: var(--radius-btn); color: var(--elm-muted-indigo); border-inline-start: 3px solid transparent; }
    .rail__step.is-done { color: var(--elm-blue); }
    .rail__step.is-current { background: var(--elm-pale-blue); color: var(--elm-navy); font-weight: 700; border-inline-start-color: var(--elm-purple); }
    .rail__time { font-variant-numeric: tabular-nums; font-size: var(--fs-00); }
    .rail__detail { grid-column: 2; font-weight: 400; }
    .rail__drift { margin: var(--space-2) 0 0; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--elm-pale-blue); color: var(--elm-navy); text-align: center; font-weight: 700; }
    .rail__drift.behind { background: var(--elm-peach); }
    .rail__drift.ahead { background: var(--game-go-soft); }
  `],
})
export class RunbookRailComponent {
  private readonly locale = inject(LocaleService);
  readonly snap = input<SessionSnapshot | null>(null);
  /** Elapsed event minutes, from the host's 1 s clock. */
  readonly elapsedMin = input(0);

  readonly steps = computed<Step[]>(() => {
    const lang = this.locale.lang();
    return [
      { key: 'join', label: this.locale.t('host.runbook.join'), plannedMin: 0, game: null, kind: 'join' },
      ...GAME_ORDER.map<Step>((g) => ({ key: g, label: gameTitle(g, lang), plannedMin: PLAN_MIN[g], game: g, kind: 'game' })),
      { key: 'final', label: this.locale.t('host.runbook.final'), plannedMin: 24, game: null, kind: 'final' },
    ];
  });

  readonly activeIndex = computed(() => {
    const s = this.snap();
    if (!s) return 0;
    if (s.state === 'Lobby' || s.state === 'Draft') return 0;
    if (s.state === 'TournamentResults' || s.state === 'Closed') return 4;
    return Math.min(3, Math.max(0, s.gameIndex) + 1);
  });

  /** What exactly is happening inside the current step. */
  readonly detail = computed(() => {
    const s = this.snap();
    if (!s || this.activeIndex() === 0 || this.activeIndex() === 4) return '';
    if (s.state === 'Instructions') return this.locale.t('state.Instructions');
    if (s.isPractice) return this.locale.t('host.progress.practice');
    if (s.state === 'GameResults') return this.locale.t('state.GameResults');
    if (s.roundPublic) return this.locale.t('host.runbook.round', { n: `${s.roundNumber}/${s.roundCount}` });
    return '';
  });

  /** Minutes behind (+) or ahead (−) of the plan for the current step. */
  readonly drift = computed(() => {
    const s = this.snap();
    if (!s?.eventStartedAt) return null;
    const planned = this.steps()[this.activeIndex()]?.plannedMin ?? 0;
    const diff = Math.round(this.elapsedMin() - planned);
    return { min: Math.abs(diff), behind: diff >= 2, ahead: diff <= -2 };
  });

  mm(min: number): string {
    return `${String(min).padStart(2, '0')}:00`;
  }
}
