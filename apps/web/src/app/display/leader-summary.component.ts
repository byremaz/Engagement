/**
 * Leader summary (plan §4) — replaces the table-first standings on the shared
 * display with a dominant leader block plus a readable supporting list.
 *
 * Paging is HOST-DRIVEN: the page index arrives on the seq-ordered snapshot
 * (`standingsPage`) so the display can never race the stage machine. This
 * component never advances a page on its own and never triggers a transition.
 *
 * Row count adapts to the available height (8-10 rows) instead of clipping or
 * shrinking the text below readable size.
 */
import { Component, computed, input } from '@angular/core';
import type { GameType, StandingRow } from '@asas/shared';
import { DISPLAY_ROWS_PER_PAGE } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

/** Rows per page on the big screen; shared with the host pager so both agree. */
const ROWS_PER_PAGE = DISPLAY_ROWS_PER_PAGE;

@Component({
  selector: 'app-leader-summary',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="wrap">
      <header class="head">
        <h2 class="title">{{ titleKey() | t: titleParams() }}</h2>
        @if (scope() === 'tournament') { <span class="badge badge-warm">{{ 'display.provisional' | t }}</span> }
        @if (pageCount() > 1) {
          <span class="page num">{{ 'display.page' | t: { page: page() + 1, count: pageCount() } }}</span>
        }
      </header>

      <!-- Leader block: only on the first page, where it is the dominant visual. -->
      @if (page() === 0 && leader(); as top) {
        <div class="leader">
          <span class="crown" aria-hidden="true">👑</span>
          <span class="avatar" aria-hidden="true">{{ top.avatar }}</span>
          <span class="who">
            <bdi class="name">{{ top.name }}</bdi>
            <span class="cap">
              @if (tiedCount() > 1) {
                {{ 'display.tiedLeaders' | t: { count: tiedCount() } }}
              } @else {
                {{ 'display.leader' | t }}
              }
            </span>
          </span>
          <span class="total num">{{ top.total }}</span>
        </div>
      }

      <ul class="rows">
        @for (r of pageRows(); track r.participantId) {
          <li class="row" [class.me]="r.participantId === highlight()">
            <span class="rank num">{{ r.rank }}</span>
            <span class="avatar sm" aria-hidden="true">{{ r.avatar }}</span>
            <bdi class="name">{{ r.name }}</bdi>
            <span class="games">
              <span class="g" [class.unplayed]="!played('RLGL', r)">
                <span class="g-label">{{ 'game.RLGL.short' | t }}</span>
                <span class="g-val num">{{ played('RLGL', r) ? r.rlgl : ('common.dash' | t) }}</span>
              </span>
              <span class="g" [class.unplayed]="!played('GEO', r)">
                <span class="g-label">{{ 'game.GEO.short' | t }}</span>
                <span class="g-val num">{{ played('GEO', r) ? r.geo : ('common.dash' | t) }}</span>
              </span>
              <span class="g" [class.unplayed]="!played('ORDER', r)">
                <span class="g-label">{{ 'game.ORDER.short' | t }}</span>
                <span class="g-val num">{{ played('ORDER', r) ? r.order : ('common.dash' | t) }}</span>
              </span>
            </span>
            <span class="total num">{{ r.total }}</span>
          </li>
        } @empty {
          <li class="empty">{{ 'display.noScores' | t }}</li>
        }
      </ul>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 0; }
    .wrap { display: flex; flex-direction: column; gap: var(--sp-3, 12px); min-height: 0; height: 100%; }

    .head { display: flex; align-items: baseline; gap: var(--sp-3, 12px); }
    .title { margin: 0; flex: 1; font-size: clamp(1.4rem, 2.4vw, 2.2rem); color: #fff; }
    .page { font-variant-numeric: tabular-nums; color: var(--elm-light-blue); unicode-bidi: isolate; }

    .leader {
      display: flex;
      align-items: center;
      gap: var(--sp-3, 12px);
      padding: var(--sp-4, 16px) var(--sp-5, 20px);
      border-radius: 18px;
      background: linear-gradient(135deg, var(--elm-royal-blue), var(--elm-purple));
      box-shadow: var(--elev-3, 0 12px 32px rgba(5, 29, 73, 0.45));
    }
    .crown { font-size: 2rem; line-height: 1; }
    .avatar { font-size: 2.4rem; line-height: 1; }
    .avatar.sm { font-size: 1.4rem; }
    .who { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .leader .name { font-size: clamp(1.3rem, 2.2vw, 2rem); font-weight: 800; color: #fff; }
    .cap { font-size: 0.95rem; color: var(--elm-light-blue); }
    .leader .total { font-size: clamp(1.6rem, 3vw, 2.6rem); font-weight: 800; color: var(--elm-peach); }

    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
    .row {
      display: flex;
      align-items: center;
      gap: var(--sp-3, 12px);
      padding: 10px var(--sp-4, 16px);
      border-radius: 12px;
      background: var(--elm-muted-indigo);
      color: var(--elm-almost-white);
    }
    .row.me { outline: 2px solid var(--elm-cyan); }
    .rank { font-variant-numeric: tabular-nums; min-width: 2.5ch; font-weight: 700; color: var(--elm-light-blue); }

    /* Long names are clamped so a row never leaves the frame (plan §4). */
    .name {
      flex: 1;
      min-width: 0;
      font-size: 1.15rem;
      font-weight: 600;
      unicode-bidi: isolate;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .games { display: flex; gap: var(--sp-3, 12px); }
    .g { display: flex; flex-direction: column; align-items: center; min-width: 5ch; }
    .g-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--elm-light-blue); }
    .g-val { font-variant-numeric: tabular-nums; font-size: 1.05rem; font-weight: 700; }
    /* A game that was never played shows a dash but still contributes its real 0. */
    .g.unplayed .g-val { color: var(--elm-light-blue); opacity: 0.6; }

    .row .total {
      font-variant-numeric: tabular-nums;
      min-width: 5ch;
      text-align: end;
      font-size: 1.3rem;
      font-weight: 800;
      color: var(--elm-peach);
    }
    .empty { color: var(--elm-light-blue); text-align: center; padding: var(--sp-5, 20px); }
  `],
})
export class LeaderSummaryComponent {
  readonly rows = input<StandingRow[]>([]);
  /** Host-driven page index from the snapshot; never advanced locally. */
  readonly page = input(0);
  readonly highlight = input<string | null>(null);
  /** Which games have actually been played, so unplayed ones render "—". */
  readonly playedGames = input<GameType[]>([]);
  /** Heading: tournament, final, or a single game's standings. */
  readonly scope = input<'tournament' | 'final' | 'game'>('tournament');
  readonly gameLabel = input<string>('');

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.rows().length / ROWS_PER_PAGE)));

  readonly pageRows = computed(() => {
    const p = Math.min(Math.max(0, this.page()), this.pageCount() - 1);
    return this.rows().slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
  });

  readonly leader = computed<StandingRow | null>(() => this.rows()[0] ?? null);

  /** How many share rank 1 — drives the "tied for first" caption. */
  readonly tiedCount = computed(() => this.rows().filter((r) => r.rank === 1).length);

  titleKey(): StringKey {
    const s = this.scope();
    if (s === 'final') return 'display.finalStandings';
    if (s === 'game') return 'display.currentGame';
    return 'display.tournament';
  }

  titleParams(): Record<string, string | number> {
    return { game: this.gameLabel() };
  }

  /** True once a game has been played; unplayed games show "—" (plan §4). */
  played(game: GameType, _row: StandingRow): boolean {
    return this.playedGames().includes(game);
  }
}
