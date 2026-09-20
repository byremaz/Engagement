/**
 * RLGL arena for the shared display: EVERY racer, always visible.
 *
 * The room is full of first-time players looking for themselves on the big
 * screen, so nobody is hidden behind a "showing 8 of 40" rule. Instead the
 * arena is a self-packing grid of "bar cards": each card is one racer, and
 * the card's own background IS the progress bar (the fill grows behind the
 * name). One line per racer gives roughly twice the density of a lane with
 * a separate track, which is what keeps names large with 50+ people:
 *
 *   racers   columns × rows   card height   name size (1080p)
 *   20       4 × 5            ~96 px        32 px
 *   50       5 × 10           ~63 px        26 px
 *   100      8 × 13           ~49 px        20 px
 *
 * The layout is computed from the container size and the racer count
 * (`layout()`), so the font is as large as the wall allows and shrinks only
 * when there are more people, never before.
 *
 * Findability rules:
 *  - cards are ordered by PLAYER NUMBER and never move: "player 21" is always
 *    in the same place, so a person finds themselves once and keeps them;
 *  - state is colour + word + icon: alive = blue fill, finished = green + 🏁,
 *    eliminated = burgundy, dimmed, ✕ (and a 2 s flash the moment it happens);
 *  - the three furthest racers carry a rank badge so the race still reads as
 *    a race at a glance.
 *
 * Invariants kept from the previous version:
 *  1. Everything here is COSMETIC. Ranking, scoring and life state are
 *     server-authoritative and arrive in the snapshot.
 *  2. The phone remains the authoritative personal view; this screen never
 *     sends a move command or advances a stage.
 *
 * Card geometry is pinned `direction: ltr` so Arabic localizes the chrome
 * without mirroring the meaning of "progress to the right" (plan §1).
 */
import {
  AfterViewInit, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import type { RacePlayerPublic, RaceSnapshot } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

/** Gap between cards (px) — must match the CSS `gap`. */
const GAP = 8;
/** A card never grows past this: beyond it the wall is better spent on breathing room. */
const MAX_CARD_H = 96;
/** Width-to-height ratio below which a single-line card starts to truncate names. */
const MIN_ASPECT = 5;
/** How long a freshly eliminated card flashes before it settles into the dimmed state. */
const FRESH_OUT_MS = 2000;
/** Rank badges shown on the furthest racers. */
const RANK_BADGES = 3;

interface Layout { cols: number; cardH: number }

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

      @if (alive() === 1 && players().length > 1) {
        <p class="solo-cap">{{ 'display.lastRacer' | t }}</p>
      }

      <!-- Self-packing grid: every racer, ordered by player number, sized from the wall. -->
      <div
        #grid
        class="grid"
        [style.--cols]="layout().cols"
        [style.--card-h.px]="layout().cardH"
      >
        @for (p of cards(); track p.participantId) {
          <div
            class="card"
            [class.card--alive]="p.state === 'alive'"
            [class.card--done]="p.state === 'finished'"
            [class.card--out]="p.state === 'eliminated'"
            [class.card--fresh-out]="freshOut().has(p.participantId)"
            [class.card--solo]="alive() === 1 && p.state === 'alive'"
            [style.--p.%]="clamp(p.progress)"
          >
            @if (rankOf(p.participantId); as r) { <span class="card__rank num" aria-hidden="true">{{ r }}</span> }
            <span class="card__avatar" aria-hidden="true">{{ p.avatar }}</span>
            <span class="card__who">
              <bdi class="card__name">{{ p.name }}</bdi>
              <span class="card__num num">#{{ p.number }}</span>
            </span>
            <span class="card__end num">
              @switch (p.state) {
                @case ('finished') { <span class="card__flag" aria-hidden="true">🏁</span> }
                @case ('eliminated') { <span class="card__x" aria-hidden="true">✕</span> }
                @default { {{ round(p.progress) }}% }
              }
            </span>
          </div>
        } @empty {
          <p class="empty">{{ 'display.noRacers' | t }}</p>
        }
      </div>

      <!-- Labelled counts: a number alone never carries the meaning (§9). -->
      <div class="counts">
        <span class="chip alive num">{{ 'host.race.alive' | t }} {{ alive() }}</span>
        <span class="chip done num">{{ 'host.race.finished' | t }} {{ finished() }}</span>
        <span class="chip out num">{{ 'host.race.eliminated' | t }} {{ eliminated() }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 0; position: relative; }
    .arena-wrap { display: flex; flex-direction: column; gap: 10px; min-height: 0; height: 100%; }

    .burst {
      position: absolute; inset-inline-start: 50%; inset-block-start: 18%; transform: translateX(-50%); z-index: 5;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      background: var(--game-stop); color: var(--elm-almost-white); border: 4px solid var(--elm-almost-white);
      border-radius: 20px; padding: 14px 32px; box-shadow: var(--elev-overlay);
    }
    :host-context([dir="rtl"]) .burst { transform: translateX(50%); }
    .burst__n { font-size: clamp(36px, 4vw, 60px); font-weight: 900; line-height: 1; }
    .burst__names { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; font-size: 1.1rem; font-weight: 700; }

    .solo-cap { margin: 0; text-align: center; font-size: 1.4rem; color: var(--elm-peach); font-weight: 800; }

    /* Game geometry stays physically LTR in both languages (plan §1). */
    .grid {
      direction: ltr;
      flex: 1; min-height: 0;
      display: grid;
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
      grid-auto-rows: var(--card-h, 64px);
      align-content: start;
      gap: 8px;
      overflow: hidden;
    }

    /*
     * The card IS the bar: its background is a hard-stop gradient at --p, so
     * the fill grows behind the name and nothing else needs space.
     */
    .card {
      --fill: var(--elm-royal-blue);
      --name-size: clamp(16px, calc(var(--card-h, 64px) * 0.42), 32px);
      position: relative;
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
      padding: 0 12px 0 8px;
      border-radius: 12px;
      background: linear-gradient(to right, var(--fill) var(--p, 0%), var(--elm-navy) var(--p, 0%));
      color: #fff;
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08);
      transition: background 150ms linear;
      overflow: hidden;
    }
    .card--alive { box-shadow: inset 0 0 0 2px rgba(189, 201, 233, 0.35); }
    .card--done { --fill: var(--game-go); box-shadow: inset 0 0 0 3px var(--elm-almost-white); }
    .card--out { --fill: var(--elm-burgundy); opacity: 0.55; filter: saturate(0.6); }
    .card--out .card__name { text-decoration: line-through; text-decoration-thickness: 2px; }
    .card--fresh-out { opacity: 1; filter: none; animation: fresh-out 600ms ease-out 3; z-index: 1; }
    .card--solo { box-shadow: inset 0 0 0 4px var(--elm-peach); animation: pulse-soft 1.2s ease-in-out infinite; }

    .card__avatar {
      font-size: calc(var(--card-h, 64px) * 0.5); line-height: 1;
      width: calc(var(--card-h, 64px) * 0.7); height: calc(var(--card-h, 64px) * 0.7);
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; background: var(--elm-peach); border: 2px solid var(--elm-navy);
      flex: none;
    }
    .card__who { display: flex; align-items: baseline; gap: 8px; min-width: 0; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45); }
    /* The name is the essential element: as large as the wall allows, never shrunk to fit a bar. */
    .card__name {
      font-size: var(--name-size); font-weight: 800; line-height: 1.1;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: isolate;
    }
    .card__num { font-size: calc(var(--name-size) * 0.62); color: var(--elm-light-blue); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .card__end {
      font-size: calc(var(--name-size) * 0.85); font-weight: 800; color: var(--elm-peach);
      font-variant-numeric: tabular-nums; min-width: 3.2ch; text-align: right; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    }
    .card__flag { font-size: calc(var(--name-size) * 0.95); }
    .card__x { color: var(--elm-almost-white); }
    .card__rank {
      position: absolute; inset-block-start: -3px; inset-inline-start: -3px;
      width: calc(var(--name-size) * 1.15); height: calc(var(--name-size) * 1.15);
      border-radius: 50%; background: var(--elm-peach); color: var(--elm-navy);
      font-size: calc(var(--name-size) * 0.7); font-weight: 900;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid var(--elm-navy); z-index: 1;
    }

    .empty { grid-column: 1 / -1; margin: auto; color: var(--elm-light-blue); font-size: 1.2rem; text-align: center; }

    .counts { display: flex; gap: 12px; justify-content: center; }
    .chip {
      font-variant-numeric: tabular-nums; font-weight: 700; font-size: 1.35rem;
      border-radius: 999px; padding: 8px 20px; unicode-bidi: isolate;
    }
    .chip.alive { background: var(--game-go); color: #fff; }
    .chip.done { background: var(--elm-cyan); color: var(--elm-navy); }
    .chip.out { background: var(--elm-burgundy); color: #fff; }

    @keyframes fresh-out {
      0% { transform: scale(1); box-shadow: inset 0 0 0 4px var(--elm-almost-white); }
      50% { transform: scale(1.06); box-shadow: inset 0 0 0 4px var(--elm-almost-white), 0 0 24px var(--elm-burgundy); }
      100% { transform: scale(1); box-shadow: inset 0 0 0 4px var(--elm-almost-white); }
    }

    @media (prefers-reduced-motion: reduce) {
      .card { transition: none; }
      .card--fresh-out { animation: none; box-shadow: inset 0 0 0 4px var(--elm-almost-white); }
      .card--solo { animation: none; }
    }
  `],
})
export class RaceArenaComponent implements AfterViewInit {
  readonly race = input<RaceSnapshot | null>(null);
  /** Aggregated elimination burst (names + count), cleared by the parent after ~2 s. */
  readonly burst = input<{ names: string[]; count: number } | null>(null);

  private readonly gridEl = viewChild.required<ElementRef<HTMLElement>>('grid');
  private readonly destroyRef = inject(DestroyRef);

  /** Measured grid box; the layout is derived from it and the racer count. */
  private readonly box = signal<{ w: number; h: number }>({ w: 1600, h: 640 });

  readonly players = computed<RacePlayerPublic[]>(() => this.race()?.players ?? []);

  readonly alive = computed(() => this.players().filter((p) => p.state === 'alive').length);
  readonly finished = computed(() => this.players().filter((p) => p.state === 'finished').length);
  readonly eliminated = computed(() => this.players().filter((p) => p.state === 'eliminated').length);

  /** Stable order by player number: a card never moves, so people find themselves once. */
  readonly cards = computed(() => this.players().slice().sort((a, b) => a.number - b.number));

  /**
   * Rank badges for the furthest racers (cosmetic). Finished racers rank
   * first, then alive ones by progress; eliminated racers never rank.
   */
  private readonly ranks = computed(() => {
    const ranked = this.players()
      .filter((p) => p.state !== 'eliminated' && p.progress > 0)
      .sort((a, b) => (Number(b.state === 'finished') - Number(a.state === 'finished')) || (b.progress - a.progress) || (a.number - b.number))
      .slice(0, RANK_BADGES);
    return new Map(ranked.map((p, i) => [p.participantId, i + 1]));
  });

  /** Racers eliminated within the last two seconds: they flash before dimming. */
  readonly freshOut = signal<Set<string>>(new Set());
  private readonly seenOut = new Set<string>();
  private readonly freshTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Pack N single-line cards into the measured box so the card (and so the
   * name) is as large as possible: for each column count, the card height is
   * limited by the rows that must fit and by the width (a card narrower than
   * MIN_ASPECT × height would truncate names). Pick the best.
   */
  readonly layout = computed<Layout>(() => {
    const n = Math.max(1, this.players().length);
    const { w, h } = this.box();
    let best: Layout = { cols: 1, cardH: 48 };
    let bestSize = -1;
    for (let cols = 1; cols <= 12; cols++) {
      const rows = Math.ceil(n / cols);
      const cardH = Math.min(MAX_CARD_H, (h - GAP * (rows - 1)) / rows);
      const cardW = (w - GAP * (cols - 1)) / cols;
      const size = Math.min(cardH, cardW / MIN_ASPECT);
      if (size > bestSize + 0.5) { bestSize = size; best = { cols, cardH: Math.max(36, Math.floor(cardH)) }; }
    }
    return best;
  });

  constructor() {
    effect(() => {
      const players = this.players();
      untracked(() => this.trackEliminations(players));
    });
  }

  ngAfterViewInit(): void {
    const el = this.gridEl().nativeElement;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) this.box.set({ w: r.width, h: r.height });
    });
    ro.observe(el);
    this.destroyRef.onDestroy(() => {
      ro.disconnect();
      for (const t of this.freshTimers.values()) clearTimeout(t);
    });
  }

  rankOf(id: string): number | null {
    return this.ranks().get(id) ?? null;
  }

  round(progress: number): number {
    return Math.round(progress);
  }

  clamp(progress: number): number {
    return Math.min(100, Math.max(0, progress));
  }

  /**
   * Flash a card the moment its racer is eliminated, then let it settle. A
   * page reload never replays flashes (everything already eliminated at the
   * first snapshot is seeded as "seen"), matching the phone's behaviour.
   */
  private trackEliminations(players: RacePlayerPublic[]): void {
    if (players.length === 0) return;
    const firstSnapshot = !this.primed;
    this.primed = true;
    const ids = new Set(players.map((p) => p.participantId));
    for (const id of [...this.seenOut]) if (!ids.has(id)) this.seenOut.delete(id); // new attempt: forget
    for (const p of players) {
      if (p.state !== 'eliminated') { this.seenOut.delete(p.participantId); continue; }
      if (this.seenOut.has(p.participantId)) continue;
      this.seenOut.add(p.participantId);
      if (firstSnapshot) continue;
      this.freshOut.update((s) => new Set(s).add(p.participantId));
      const prev = this.freshTimers.get(p.participantId);
      if (prev) clearTimeout(prev);
      this.freshTimers.set(p.participantId, setTimeout(() => {
        this.freshTimers.delete(p.participantId);
        this.freshOut.update((s) => { const next = new Set(s); next.delete(p.participantId); return next; });
      }, FRESH_OUT_MS));
    }
  }
  private primed = false;
}
