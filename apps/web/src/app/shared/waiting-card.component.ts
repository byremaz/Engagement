/**
 * WaitingCardComponent — the participant's "nothing to do right now" surface.
 *
 * Plan §3: it must NAME the current stage, say what the host is preparing, and
 * preview the next action — without leaking any answer. It therefore renders
 * only stage-level copy from the i18n dictionary (`wait.title.*`, `wait.body.*`,
 * `wait.next.*`); it never receives round content, solutions or scores, so a
 * waiting phone cannot display something the host has not revealed
 * [secure-coding].
 *
 * It is presentational: no API calls, no timers that could advance a stage.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { SessionState } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

/** Stages that have their own waiting copy; anything else uses the Lobby copy. */
const KNOWN: readonly SessionState[] = [
  'Lobby',
  'Instructions',
  'Practice',
  'Ready',
  'Countdown',
  'InputLocked',
  'Reveal',
  'GameResults',
  'TournamentResults',
];

/** What the host is expected to do next, per stage (preview only, never an action). */
const NEXT: Partial<Record<SessionState, StringKey>> = {
  Lobby: 'wait.next.startRound',
  Instructions: 'wait.next.startRound',
  Practice: 'wait.next.startRound',
  Ready: 'wait.next.startRound',
  Countdown: 'wait.next.startRound',
  InputLocked: 'wait.next.reveal',
  Reveal: 'wait.next.nextRound',
  GameResults: 'wait.next.nextGame',
};

@Component({
  selector: 'app-waiting-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section class="wait" aria-live="polite">
      <div class="stage-chip">{{ stageKey() | t }}</div>

      <h2 class="title">{{ titleKey() | t }}</h2>
      <p class="body">{{ bodyKey() | t }}</p>

      @if (roundLabel(); as rl) {
        <p class="round num"><bdi>{{ rl }}</bdi></p>
      }

      @if (nextKey()) {
        <p class="next">{{ 'wait.next' | t: { next: nextText() } }}</p>
      }

      <ng-content />
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .wait {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-3, 12px);
        text-align: center;
        padding: var(--space-5, 20px) var(--space-4, 16px);
        border-radius: var(--radius-lg, 16px);
        background: var(--surface-1, #fff);
        box-shadow: var(--elev-1, 0 1px 3px rgba(5, 29, 73, 0.12));
      }
      .stage-chip {
        font-size: var(--fs-xs, 12px);
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 999px;
        color: var(--elm-royal-blue, #0032a0);
        background: var(--elm-neutral-100, #e5e9f6);
      }
      .title {
        margin: 0;
        font-size: var(--fs-xl, 22px);
        line-height: 1.25;
        color: var(--elm-navy, #051d49);
      }
      .body {
        margin: 0;
        max-width: 34ch;
        color: var(--elm-neutral-600, #464d7e);
      }
      .round {
        margin: 0;
        font-variant-numeric: tabular-nums;
        unicode-bidi: isolate;
        color: var(--elm-neutral-600, #464d7e);
      }
      .next {
        margin: 0;
        font-size: var(--fs-sm, 14px);
        color: var(--elm-blue, #0071ce);
        unicode-bidi: isolate;
      }
    `,
  ],
})
export class WaitingCardComponent {
  private readonly locale = inject(LocaleService);

  /** Effective session state coming from the authoritative snapshot. */
  readonly state = input.required<SessionState>();
  /** Optional "Round 2 of 3" style label, already formatted by the caller. */
  readonly roundLabel = input<string | null>(null);

  /** Falls back to Lobby copy for stages without dedicated text (Draft/Closed). */
  private readonly effective = computed<SessionState>(() =>
    KNOWN.includes(this.state()) ? this.state() : 'Lobby',
  );

  readonly stageKey = computed<StringKey>(() => `state.${this.state()}` as StringKey);
  readonly titleKey = computed<StringKey>(() => `wait.title.${this.effective()}` as StringKey);
  readonly bodyKey = computed<StringKey>(() => `wait.body.${this.effective()}` as StringKey);
  readonly nextKey = computed<StringKey | null>(() => NEXT[this.effective()] ?? null);

  /** Interpolated into `wait.next`; re-computes on language change via the signal. */
  readonly nextText = computed(() => {
    this.locale.lang();
    const k = this.nextKey();
    return k ? this.locale.t(k) : '';
  });
}
