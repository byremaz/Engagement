/**
 * Personal round result (plan v2 §5.6) — one template for all three games:
 *
 *   outcome sentence
 *   This round        93.3   ← achievement + speed bonus, so the player sees
 *     achievement       80      WHERE the points came from
 *     speed (+5.0 s)    13.3
 *   Game points (after n of total)
 *   Tournament total · provisional rank
 *   Next: …
 *
 * Every number comes from the server-populated `MyRoundState.result`; nothing
 * is computed or guessed here. Before the reveal the RLGL player's own
 * outcome (out / finished) is shown with its known zero, and nothing else.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { GameType, MyRoundState } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

type Result = NonNullable<MyRoundState['result']>;

@Component({
  selector: 'app-round-result-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (!result() && immediateOutcome()) {
      <section class="card-res rise-in" aria-live="polite">
        <p class="outcome" [class.good]="positive()">{{ immediateOutcome()! | t: outcomeParams() }}</p>
        @if (raceOutcome() === 'eliminated') {
          <div class="row primary"><span class="k">{{ 'result.thisRace' | t }}</span><span class="v num"><bdi>0</bdi></span></div>
          <p class="note">{{ 'result.zeroKeeps' | t }}</p>
        }
        <p class="next">{{ 'result.awaitingReveal' | t }}</p>
      </section>
    }

    @if (result(); as r) {
      <section class="card-res rise-in" aria-live="polite">
        <p class="outcome" [class.good]="positive()">
          @if (outcomeKey(); as ok) { {{ ok | t: outcomeParams() }} } @else { <bdi>{{ r.label }}</bdi> }
        </p>

        <div class="row primary">
          <span class="k">{{ 'result.thisRound' | t }}</span>
          <span class="v num"><bdi>{{ fmt(r.raw) }}</bdi><span class="max"> / <bdi>{{ r.roundMax ?? 100 }}</bdi></span></span>
        </div>
        @if (hasParts()) {
          <div class="row sub"><span class="k">{{ 'result.base' | t }}</span><span class="v num"><bdi>{{ fmt(r.base ?? 0) }}</bdi></span></div>
          <div class="row sub">
            <span class="k">{{ (r.timeMs !== null && r.timeMs !== undefined ? 'result.speed' : 'result.speedNone') | t: { sec: sec(r.timeMs) } }}</span>
            <span class="v num" [class.bonus]="(r.speed ?? 0) > 0"><bdi>{{ (r.speed ?? 0) > 0 ? '+' : '' }}{{ fmt(r.speed ?? 0) }}</bdi></span>
          </div>
        }

        @if (r.gamePoints !== undefined) {
          <div class="row">
            <span class="k">{{ 'result.gameAfter' | t: { n: roundNumber(), total: roundCount() } }}</span>
            <span class="v num"><bdi>{{ r.gamePoints }}</bdi><span class="max"> / <bdi>{{ r.gameMax }}</bdi></span></span>
          </div>
        }
        @if (r.tournamentTotal !== undefined && r.tournamentTotal !== null) {
          <div class="row total">
            <span class="k">{{ 'result.tournament' | t }}</span>
            <span class="v num"><bdi>{{ r.tournamentTotal }}</bdi></span>
          </div>
          @if (r.tournamentRank) {
            <div class="row"><span class="k">{{ 'result.provisional' | t }}</span><span class="v num">#<bdi>{{ r.tournamentRank }}</bdi></span></div>
          }
        }

        <p class="next">{{ nextText() }}</p>
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .card-res { display: flex; flex-direction: column; gap: 4px; padding: var(--space-4); border-radius: var(--radius-lg); background: var(--surface-1); box-shadow: var(--elev-1); }
    .outcome { margin: 0 0 6px; font-size: clamp(22px, 6vw, 28px); font-weight: 800; line-height: 1.25; color: var(--elm-navy); unicode-bidi: isolate; }
    .outcome.good { color: var(--game-go); }
    .row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-block: 6px; border-block-end: 1px solid var(--elm-pale-blue); }
    .row.sub { padding-block: 3px; border: 0; padding-inline-start: 14px; }
    .row.sub .k { font-size: var(--fs-00); }
    .k { color: var(--elm-muted-indigo); }
    .v { font-variant-numeric: tabular-nums; font-weight: 700; unicode-bidi: isolate; color: var(--elm-navy); }
    .row.primary .v { font-size: 28px; color: var(--elm-blue); }
    .row.total .v { color: var(--elm-purple); font-size: 22px; }
    .v.bonus { color: var(--game-go); }
    .max { font-weight: 400; color: var(--elm-light-blue); }
    .note { margin: 0; font-size: var(--fs-00); color: var(--elm-muted-indigo); }
    .next { margin: var(--space-2) 0 0; font-size: var(--fs-00); font-weight: 600; color: var(--elm-blue); }
  `],
})
export class RoundResultCardComponent {
  private readonly locale = inject(LocaleService);

  readonly result = input<Result | null>(null);
  readonly gameType = input<GameType | null>(null);
  readonly roundNumber = input(0);
  readonly roundCount = input(0);
  readonly isPractice = input(false);
  /** GEO: distance in km, 0 when inside. */
  readonly distanceKm = input<number | null>(null);
  readonly pinPlaced = input<boolean>(true);
  /** ORDER: how many cards ended in the correct position. */
  readonly correctCount = input<number | null>(null);
  readonly cardCount = input(4);
  /** RLGL: life state at the end of the race. */
  readonly raceOutcome = input<'finished' | 'eliminated' | 'timeout' | null>(null);

  readonly hasParts = computed(() => {
    const r = this.result();
    return !!r && r.base !== undefined && r.speed !== undefined;
  });

  readonly immediateOutcome = computed<StringKey | null>(() => {
    if (this.gameType() !== 'RLGL') return null;
    const o = this.raceOutcome();
    if (o !== 'eliminated' && o !== 'finished') return null;
    return `result.outcome.rlgl.${o}` as StringKey;
  });

  readonly outcomeKey = computed<StringKey | null>(() => {
    switch (this.gameType()) {
      case 'GEO':
        if (!this.pinPlaced()) return 'result.outcome.geo.none';
        return (this.distanceKm() ?? 0) <= 0 ? 'result.outcome.geo.inside' : 'result.outcome.geo.outside';
      case 'ORDER': {
        const n = this.correctCount();
        if (n === null) return null;
        return n >= this.cardCount() ? 'result.outcome.order.perfect' : 'result.outcome.order.correct';
      }
      case 'RLGL': {
        const o = this.raceOutcome();
        if (o === 'finished' && this.result()?.finishRank) return 'result.outcome.rlgl.finishedRank';
        return o ? (`result.outcome.rlgl.${o}` as StringKey) : null;
      }
      default:
        return null;
    }
  });

  readonly outcomeParams = computed<Record<string, string | number>>(() => ({
    distance: Math.round(this.distanceKm() ?? 0),
    n: this.correctCount() ?? 0,
    rank: this.result()?.finishRank ?? 0,
  }));

  readonly positive = computed(() => {
    const k = this.outcomeKey() ?? this.immediateOutcome();
    return k === 'result.outcome.geo.inside' || k === 'result.outcome.order.perfect' || k === 'result.outcome.rlgl.finished' || k === 'result.outcome.rlgl.finishedRank';
  });

  readonly nextText = computed(() => {
    this.locale.lang();
    if (this.isPractice()) return this.locale.t('wait.next', { next: this.locale.t('wait.next.startRound') });
    const n = this.roundNumber();
    const total = this.roundCount();
    if (n >= total) return this.locale.t('result.next.gameResults');
    return this.locale.t('result.next.round', { n: n + 1, total });
  });

  fmt(x: number): string {
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  sec(ms: number | null | undefined): string {
    return ms === null || ms === undefined ? '' : (ms / 1000).toFixed(1);
  }
}
