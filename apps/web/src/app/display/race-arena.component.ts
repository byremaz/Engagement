/**
 * RLGL arena for the shared display (plan §7).
 *
 * Readability beats completeness at 1920x1080 from the back of a room:
 *  - ~6-8 LARGE lanes (avatar, short name, player number, progress, finish
 *    marker) instead of 40 hairlines,
 *  - ONE declared selection rule — furthest progress first — stated on screen
 *    as "Showing 8 of 40 active racers" whenever the field is truncated,
 *  - labelled Racing / Finished / Eliminated counts,
 *  - a small BOUNDED event feed,
 *  - one remaining racer gets a single large focused lane, and the field of
 *    eliminated dots collapses into a quiet aggregate.
 *
 * Two invariants this component must never break:
 *  1. Lane selection is COSMETIC. It never changes ranking, scoring or life
 *     state — those are server-authoritative and arrive in the snapshot.
 *  2. The phone remains the authoritative personal view; this screen is shared
 *     context, so it never sends a move command or advances a stage.
 *
 * Lane geometry is pinned `direction: ltr` so Arabic localizes the surrounding
 * UI without mirroring game meaning (plan §1).
 */
import { Component, computed, input } from '@angular/core';
import type { RacePlayerPublic, RaceSnapshot } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

/** Large lanes rendered at once. Reduce lanes before shrinking names (§9). */
const MAX_LANES = 8;
/** Bounded event feed (plan §7: "a small bounded event feed"). */
const MAX_FEED = 4;

@Component({
  selector: 'app-race-arena',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="arena-wrap">
      <!-- Simultaneous deaths: ONE burst callout, not a queue of animations (plan v2 §5.11). -->
      @if (burst(); as b) {
        <div class="burst rise-in" role="status">
          <span class="burst__n num">✕ {{ 'display.outBurst' | t: { n: b.count } }}</span>
          <span class="burst__names">
            @for (n of b.names.slice(0, 4); track $index) { <bdi>{{ n }}</bdi> }
            @if (b.names.length > 4) { <span class="num">{{ 'display.andMore' | t: { count: b.names.length - 4 } }}</span> }
          </span>
        </div>
      }
      <!--
        §7: one remaining racer is the whole story — give them a single large
        focused lane rather than one thin row among dozens of dead dots.
      -->
      @if (soloFocus(); as solo) {
        <div class="solo">
          <p class="solo__cap">{{ 'display.lastRacer' | t }}</p>
          <div class="solo__row">
            <span class="solo__avatar" aria-hidden="true">{{ solo.avatar }}</span>
            <bdi class="solo__name">{{ solo.name }}</bdi>
            <span class="solo__num num">{{ 'rlgl.player' | t: { number: solo.number } }}</span>
          </div>
          <div class="solo__track" aria-hidden="true">
            <div class="solo__fill" [style.width.%]="clamp(solo.progress)"></div>
            <span class="solo__flag">{{ 'display.finishLine' | t }}</span>
          </div>
          <p class="solo__pct num">{{ 'display.trackPct' | t: { n: round(solo.progress) } }}</p>
        </div>
      } @else {
        <!-- The selection rule is DECLARED, not left for the room to infer. -->
        @if (hiddenLanes() > 0) {
          <p class="rule num">
            {{ 'display.showingOf' | t: { shown: lanes().length, total: activePlayers().length } }}
            <span class="rule__how">{{ 'display.laneRule' | t }}</span>
          </p>
        }

        <div class="lanes">
          @for (p of lanes(); track p.participantId) {
            <div class="lane" [class.lane--done]="p.state === 'finished'">
              <div class="lane__id">
                <span class="lane__avatar" aria-hidden="true">{{ p.avatar }}</span>
                <bdi class="lane__name">{{ p.name }}</bdi>
                <span class="lane__num num">{{ 'rlgl.player' | t: { number: p.number } }}</span>
              </div>
              <div class="lane__track">
                <div class="lane__fill" [style.width.%]="clamp(p.progress)"></div>
                <div class="lane__runner" [style.inset-inline-start]="posCss(p.progress)" aria-hidden="true">
                  {{ p.avatar }}
                </div>
                <span class="lane__flag" aria-hidden="true">🏁</span>
              </div>
              <span class="lane__pct num">{{ round(p.progress) }}%</span>
            </div>
          } @empty {
            <p class="empty">{{ 'display.noRacers' | t }}</p>
          }
        </div>
      }

      <!-- Labelled counts: a number alone never carries the meaning (§9). -->
      <div class="counts">
        <span class="chip alive num">{{ 'host.race.alive' | t }} {{ alive() }}</span>
        <span class="chip done num">{{ 'host.race.finished' | t }} {{ finished() }}</span>
        <span class="chip out num">{{ 'host.race.eliminated' | t }} {{ eliminated() }}</span>
      </div>

      <!--
        §4: simultaneous deaths aggregate into a bounded summary instead of
        queued blocking animations.
      -->
      <div class="feed">
        <span class="cap">{{ 'display.eliminatedFeed' | t }}</span>
        @for (n of feedNames(); track $index) {
          <bdi class="out-name">{{ n }}</bdi>
        } @empty {
          <span class="muted">{{ 'display.feedEmpty' | t }}</span>
        }
        @if (feedOverflow() > 0) {
          <span class="out-more num">{{ 'display.andMore' | t: { count: feedOverflow() } }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 0; position: relative; }
    .arena-wrap { display: flex; flex-direction: column; gap: 12px; min-height: 0; height: 100%; }
    .burst {
      position: absolute; inset-inline-start: 50%; inset-block-start: 18%; transform: translateX(-50%); z-index: 5;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      background: var(--game-stop); color: var(--elm-almost-white); border: 4px solid var(--elm-almost-white);
      border-radius: 20px; padding: 14px 32px; box-shadow: var(--elev-overlay);
    }
    :host-context([dir="rtl"]) .burst { transform: translateX(50%); }
    .burst__n { font-size: clamp(36px, 4vw, 60px); font-weight: 900; line-height: 1; }
    .burst__names { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; font-size: 1.1rem; font-weight: 700; }

    .rule { margin: 0; color: var(--elm-light-blue); font-size: 1.05rem; text-align: center; }
    .rule__how { opacity: .85; margin-inline-start: 8px; }

    /* Game geometry stays physically LTR in both languages (plan §1). */
    .lanes {
      direction: ltr;
      flex: 1; min-height: 0;
      display: flex; flex-direction: column; gap: 8px;
      background: var(--elm-dark-indigo);
      border-radius: 14px; padding: 12px 16px; overflow: hidden;
    }
    .lane {
      display: grid;
      grid-template-columns: minmax(200px, 22%) 1fr auto;
      align-items: center; gap: 14px;
      flex: 1; min-height: 0;
    }
    .lane__id { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .lane__avatar { font-size: 34px; }
    /* Display names 28-36px (§9): essential, so never shrunk to fit. */
    .lane__name {
      font-size: clamp(22px, 1.6vw, 30px); font-weight: 800; color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: isolate;
    }
    .lane__num { font-size: 1rem; color: var(--elm-light-blue); font-variant-numeric: tabular-nums; white-space: nowrap; }

    .lane__track {
      position: relative; height: 100%; min-height: 46px;
      background: var(--elm-navy); border-radius: 10px; overflow: hidden;
    }
    .lane__fill { position: absolute; inset-block: 0; inset-inline-start: 0; background: var(--elm-royal-blue); }
    .lane__runner {
      --runner: 40px;
      position: absolute; inset-block-start: 50%;
      width: var(--runner); height: var(--runner);
      margin-inline-start: calc(var(--runner) / -2); transform: translateY(-50%);
      border-radius: 50%; background: var(--elm-peach); border: 3px solid var(--elm-navy);
      display: flex; align-items: center; justify-content: center; font-size: 22px;
      transition: inset-inline-start 150ms linear;
    }
    .lane__flag { position: absolute; inset-inline-end: 6px; inset-block-start: 50%; transform: translateY(-50%); font-size: 26px; opacity: .8; }
    .lane--done .lane__fill { background: var(--game-go); }
    .lane__pct { font-size: 1.3rem; font-weight: 800; color: var(--elm-peach); font-variant-numeric: tabular-nums; min-width: 4ch; text-align: end; }
    .empty { margin: auto; color: var(--elm-light-blue); font-size: 1.2rem; }

    /* One-survivor focus. */
    .solo {
      direction: ltr;
      flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px;
      background: var(--elm-dark-indigo); border-radius: 14px; padding: 24px 28px;
    }
    .solo__cap { margin: 0; text-align: center; font-size: 1.4rem; color: var(--elm-peach); font-weight: 800; }
    .solo__row { display: flex; align-items: center; justify-content: center; gap: 16px; }
    .solo__avatar { font-size: 72px; }
    .solo__name { font-size: clamp(32px, 3vw, 52px); font-weight: 900; color: #fff; unicode-bidi: isolate; }
    .solo__num { font-size: 1.3rem; color: var(--elm-light-blue); font-variant-numeric: tabular-nums; }
    .solo__track { position: relative; height: 64px; background: var(--elm-navy); border-radius: 12px; overflow: hidden; }
    .solo__fill { position: absolute; inset-block: 0; inset-inline-start: 0; background: var(--elm-royal-blue); transition: width 150ms linear; }
    .solo__flag { position: absolute; inset-inline-end: 12px; inset-block-start: 50%; transform: translateY(-50%); color: #fff; font-weight: 700; }
    .solo__pct { margin: 0; text-align: center; font-size: 2rem; font-weight: 800; color: var(--elm-peach); font-variant-numeric: tabular-nums; }

    .counts { display: flex; gap: 12px; justify-content: center; }
    .chip {
      font-variant-numeric: tabular-nums; font-weight: 700; font-size: 1.35rem;
      border-radius: 999px; padding: 8px 20px; unicode-bidi: isolate;
    }
    .chip.alive { background: var(--game-go); color: #fff; }
    .chip.done { background: var(--elm-cyan); color: var(--elm-navy); }
    .chip.out { background: var(--elm-burgundy); color: #fff; }

    .cap { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--elm-light-blue); }
    .feed { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 30px; }
    .out-name {
      font-size: 1rem; color: var(--elm-almost-white);
      background: rgba(161, 43, 42, 0.35); border-radius: 8px; padding: 4px 12px;
      max-width: 14ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      unicode-bidi: isolate;
    }
    .out-more { font-size: 1rem; color: var(--elm-light-blue); font-variant-numeric: tabular-nums; }
    .muted { color: var(--elm-light-blue); font-size: 0.95rem; }

    @media (prefers-reduced-motion: reduce) {
      .lane__runner, .solo__fill { transition: none; }
    }
  `],
})
export class RaceArenaComponent {
  readonly race = input<RaceSnapshot | null>(null);
  /** Aggregated elimination burst (names + count), cleared by the parent after ~2 s. */
  readonly burst = input<{ names: string[]; count: number } | null>(null);

  readonly players = computed<RacePlayerPublic[]>(() => this.race()?.players ?? []);

  readonly alive = computed(() => this.players().filter((p) => p.state === 'alive').length);
  readonly finished = computed(() => this.players().filter((p) => p.state === 'finished').length);
  readonly eliminated = computed(() => this.players().filter((p) => p.state === 'eliminated').length);

  /**
   * Eliminated players leave the lanes entirely: a field of dead dots is the
   * noise §7 asks us to collapse into the quiet aggregate chip instead.
   */
  readonly activePlayers = computed(() => this.players().filter((p) => p.state !== 'eliminated'));

  /**
   * THE declared selection rule: furthest progress first. Cosmetic only — it
   * never changes ranking or state, which stay server-authoritative.
   */
  readonly lanes = computed(() =>
    this.activePlayers()
      .slice()
      .sort((a, b) => b.progress - a.progress)
      .slice(0, MAX_LANES),
  );

  readonly hiddenLanes = computed(() => Math.max(0, this.activePlayers().length - MAX_LANES));

  /** Exactly one racer left still running: switch to the focused lane. */
  readonly soloFocus = computed<RacePlayerPublic | null>(() => {
    const stillRacing = this.players().filter((p) => p.state === 'alive');
    return stillRacing.length === 1 ? stillRacing[0] : null;
  });

  /** Newest eliminations first, hard-capped; the remainder becomes a count. */
  readonly feedNames = computed(() => {
    const feed = this.race()?.eliminationsFeed ?? [];
    const names: string[] = [];
    for (let i = feed.length - 1; i >= 0 && names.length < MAX_FEED; i--) {
      for (const n of feed[i].names) {
        if (names.length < MAX_FEED) names.push(n);
      }
    }
    return names;
  });

  /** Aggregated overflow so simultaneous deaths never queue animations (§4). */
  readonly feedOverflow = computed(() => {
    const feed = this.race()?.eliminationsFeed ?? [];
    const total = feed.reduce((sum, e) => sum + e.names.length, 0);
    return Math.max(0, total - this.feedNames().length);
  });

  round(progress: number): number {
    return Math.round(progress);
  }

  clamp(progress: number): number {
    return Math.min(100, Math.max(0, progress));
  }

  /** Clamp inside the lane: the avatar is never clipped at either end. */
  posCss(progress: number): string {
    return `calc(var(--runner) / 2 + (100% - var(--runner)) * ${this.clamp(progress) / 100})`;
  }
}
