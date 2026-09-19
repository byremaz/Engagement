/**
 * ResultBreakdownComponent — the participant's post-reveal hierarchy (plan §3):
 *
 *   outcome sentence → This round → This game → Tournament total + rank →
 *   "Waiting for the host to start the next round."
 *
 * Every number is taken from the server-populated `MyRoundState.result`
 * breakdown (`round-scoring.ts` / `standings.service.ts`). The component NEVER
 * computes or guesses a score; when a field is absent (older server, or the
 * host has not revealed yet) that line is simply not rendered [secure-coding].
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { GameType, MyRoundState } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

type Result = NonNullable<MyRoundState['result']>;

@Component({
  selector: 'app-result-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <!--
      Plan §8: the IMMEDIATE personal outcome is separated from the
      host-controlled score reveal. A player who was eliminated (or who
      finished) learns that at once — including the eliminated race's known 0 —
      while nobody else's unrevealed score is exposed [secure-coding].
    -->
    @if (!result() && immediateOutcome()) {
      <section class="breakdown" aria-live="polite">
        <p class="outcome" [class.good]="positive()">{{ immediateOutcome()! | t: outcomeParams() }}</p>
        @if (raceOutcome() === 'eliminated') {
          <div class="row primary">
            <span class="k">{{ 'result.thisRace' | t }}</span>
            <!-- A known zero is a real result, not a hidden one. -->
            <span class="v num"><bdi>0</bdi></span>
          </div>
          <p class="rank">{{ 'result.zeroKeeps' | t }}</p>
        }
        <p class="next">{{ 'result.awaitingReveal' | t }}</p>
      </section>
    }

    @if (result(); as r) {
      <section class="breakdown" aria-live="polite">
        <!-- 1. Outcome sentence: what actually happened, in words. -->
        <p class="outcome" [class.good]="positive()">
          @if (outcomeKey(); as ok) {
            {{ ok | t: outcomeParams() }}
          } @else {
            <bdi>{{ r.label }}</bdi>
          }
        </p>

        <!-- 2. This round -->
        @if (hasRound()) {
          <div class="row primary">
            <span class="k">{{ 'result.thisRound' | t }}</span>
            <span class="v num"><bdi>{{ r.roundPoints }}</bdi><span class="max"> / <bdi>{{ r.roundMax }}</bdi></span></span>
          </div>
        }

        <!-- 3. This game -->
        @if (hasGame()) {
          <div class="row">
            <span class="k">{{ 'result.thisGame' | t }}</span>
            <span class="v num"><bdi>{{ r.gamePoints }}</bdi><span class="max"> / <bdi>{{ r.gameMax }}</bdi></span></span>
          </div>
        }

        <!-- 4. Tournament total and rank -->
        @if (r.tournamentTotal !== undefined && r.tournamentTotal !== null) {
          <div class="row total">
            <span class="k">{{ 'result.tournament' | t }}</span>
            <span class="v num"><bdi>{{ r.tournamentTotal }}</bdi> {{ 'common.pts' | t }}</span>
          </div>
        }
        @if (rankLine(); as rank) {
          <p class="rank">{{ rank }}</p>
        } @else {
          <!-- Never a stale or invented rank (plan §5). -->
          <p class="rank">{{ 'standings.beforeReveal' | t }}</p>
        }

        <!-- 5. What happens next -->
        <p class="next">{{ 'result.nextUp' | t }}</p>
      </section>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .breakdown {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px);
        border-radius: var(--radius-lg, 16px);
        background: var(--surface-1, #fff);
        box-shadow: var(--elev-1, 0 1px 3px rgba(5, 29, 73, 0.12));
      }
      .outcome {
        margin: 0 0 var(--space-1, 4px);
        font-size: var(--fs-lg, 18px);
        font-weight: 700;
        line-height: 1.3;
        color: var(--elm-navy, #051d49);
        unicode-bidi: isolate;
      }
      .outcome.good { color: var(--game-go, #15803d); }
      .row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-3, 12px);
        padding-block: 6px;
        border-block-end: 1px solid var(--elm-neutral-100, #e5e9f6);
      }
      .row:last-of-type { border-block-end: none; }
      .k { color: var(--elm-neutral-600, #464d7e); }
      .v {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        unicode-bidi: isolate;
        color: var(--elm-navy, #051d49);
      }
      .row.primary .v { font-size: var(--fs-xl, 22px); color: var(--elm-blue, #0071ce); }
      .row.total .v { color: var(--elm-purple, #763cbc); }
      .max { font-weight: 400; color: var(--elm-neutral-500, #bdc9e9); }
      .rank {
        margin: 0;
        font-size: var(--fs-sm, 14px);
        color: var(--elm-neutral-600, #464d7e);
        unicode-bidi: isolate;
      }
      .next {
        margin: var(--space-2, 8px) 0 0;
        font-size: var(--fs-sm, 14px);
        color: var(--elm-blue, #0071ce);
      }
    `,
  ],
})
export class ResultBreakdownComponent {
  private readonly locale = inject(LocaleService);

  /** Server-populated breakdown; null before the host reveals. */
  readonly result = input<Result | null>(null);
  /** Which game produced this result — selects the outcome sentence. */
  readonly gameType = input<GameType | null>(null);
  /** Total ranked players, for "Rank 4 of 27". */
  readonly rankTotal = input<number | null>(null);

  /** GEO: distance in km, 0/`null` when the pin landed inside the country. */
  readonly distanceKm = input<number | null>(null);
  /** GEO: whether a pin was placed at all. */
  readonly pinPlaced = input<boolean>(true);
  /** ORDER: how many cards ended in the correct position (0-4). */
  readonly correctCount = input<number | null>(null);
  /** ORDER: total cards, so "perfect" is data-driven rather than hard-coded. */
  readonly cardCount = input<number>(4);
  /** RLGL: the participant's life state at the end of the race. */
  readonly raceOutcome = input<'finished' | 'eliminated' | 'timeout' | null>(null);

  /**
   * The outcome sentence the player is entitled to BEFORE the host reveals
   * scores: their own elimination or finish. Returns null when there is no
   * personally-known outcome yet, so nothing is invented (plan §8).
   */
  readonly immediateOutcome = computed<StringKey | null>(() => {
    if (this.gameType() !== 'RLGL') return null;
    const o = this.raceOutcome();
    if (o !== 'eliminated' && o !== 'finished') return null;
    return `result.outcome.rlgl.${o}` as StringKey;
  });

  readonly hasRound = computed(() => {
    const r = this.result();
    return !!r && r.roundPoints !== undefined && r.roundMax !== undefined;
  });

  readonly hasGame = computed(() => {
    const r = this.result();
    return !!r && r.gamePoints !== undefined && r.gameMax !== undefined;
  });

  /** Chooses the localized outcome sentence; null falls back to the server label. */
  readonly outcomeKey = computed<StringKey | null>(() => {
    switch (this.gameType()) {
      case 'GEO':
        if (!this.pinPlaced()) return 'result.outcome.geo.none';
        return (this.distanceKm() ?? 0) <= 0
          ? 'result.outcome.geo.inside'
          : 'result.outcome.geo.outside';
      case 'ORDER': {
        const n = this.correctCount();
        if (n === null) return null;
        return n >= this.cardCount() ? 'result.outcome.order.perfect' : 'result.outcome.order.correct';
      }
      case 'RLGL': {
        const o = this.raceOutcome();
        return o ? (`result.outcome.rlgl.${o}` as StringKey) : null;
      }
      default:
        return null;
    }
  });

  readonly outcomeParams = computed<Record<string, string | number>>(() => ({
    distance: Math.round(this.distanceKm() ?? 0),
    n: this.correctCount() ?? 0,
  }));

  /** Green outcome sentence only when the round genuinely went well. */
  readonly positive = computed(() => {
    // Also covers the pre-reveal immediate outcome, so a finish reads as good
    // and an elimination never does.
    const k = this.outcomeKey() ?? this.immediateOutcome();
    return (
      k === 'result.outcome.geo.inside' ||
      k === 'result.outcome.order.perfect' ||
      k === 'result.outcome.rlgl.finished'
    );
  });

  /** Rendered through the service (not the pipe) because it needs two values. */
  readonly rankLine = computed<string | null>(() => {
    const r = this.result();
    const total = this.rankTotal();
    if (!r || r.tournamentRank === undefined || r.tournamentRank === null || !total) return null;
    return this.rankText(r.tournamentRank, total);
  });

  /** Labelled and localized: a bare "4 / 27" reads as a score, not a rank. */
  private rankText(rank: number, total: number): string {
    return this.locale.t('result.publishedRank', { rank, total });
  }
}
