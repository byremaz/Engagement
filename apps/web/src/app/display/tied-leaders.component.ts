/**
 * Tied-leaders band (plan §4) — replaces the fixed three-slot podium.
 *
 * Ranks come from the REAL `rank` values in `StandingRow` (server-computed), so
 * ten players tied for first render as one shared band instead of being forced
 * into arbitrary 1st/2nd/3rd slots. No client-side re-ranking or tie-breaking
 * is performed here; the component is purely presentational.
 */
import { Component, computed, input } from '@angular/core';
import type { StandingRow } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

/** One rank group: every row that shares the same server-assigned rank. */
interface RankBand {
  rank: number;
  rows: StandingRow[];
  shown: StandingRow[];
  overflow: number;
}

/** Max faces rendered per band before collapsing into "+N more". */
const MAX_PER_BAND = 6;

@Component({
  selector: 'app-tied-leaders',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="bands">
      @for (b of bands(); track b.rank) {
        <section class="band" [class.first]="b.rank === 1" [attr.data-rank]="b.rank">
          <header class="band-head">
            <span class="medal" aria-hidden="true">{{ medal(b.rank) }}</span>
            <span class="rank-label">
              @if (b.rows.length > 1) {
                {{ 'display.tiedBand' | t: { rank: ordinal(b.rank) } }}
              } @else {
                {{ ordinal(b.rank) }}
              }
            </span>
            <span class="score num">{{ b.rows[0].total }} {{ 'common.pts' | t }}</span>
          </header>

          <ul class="faces">
            @for (r of b.shown; track r.participantId) {
              <li class="face">
                <span class="avatar" aria-hidden="true">{{ r.avatar }}</span>
                <bdi class="name">{{ r.name }}</bdi>
              </li>
            }
            @if (b.overflow > 0) {
              <li class="face more num">{{ 'display.andMore' | t: { count: b.overflow } }}</li>
            }
          </ul>
        </section>
      } @empty {
        <p class="empty">{{ 'display.noScores' | t }}</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .bands { display: flex; flex-direction: column; gap: var(--sp-4, 16px); }

    .band {
      border-radius: 18px;
      padding: var(--sp-4, 16px) var(--sp-5, 20px);
      background: var(--elm-muted-indigo);
      border: 2px solid transparent;
    }
    /* First place is dominant; lower ranks stay supporting context. */
    .band.first {
      background: linear-gradient(135deg, var(--elm-royal-blue), var(--elm-purple));
      border-color: var(--elm-cyan);
      box-shadow: var(--elev-3, 0 12px 32px rgba(5, 29, 73, 0.45));
    }

    .band-head {
      display: flex;
      align-items: center;
      gap: var(--sp-3, 12px);
      margin-block-end: var(--sp-3, 12px);
    }
    .medal { font-size: 1.8rem; line-height: 1; }
    .rank-label {
      flex: 1;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--elm-almost-white);
      letter-spacing: 0.01em;
    }
    .score {
      font-variant-numeric: tabular-nums;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--elm-peach);
      unicode-bidi: isolate;
    }
    .band.first .rank-label, .band.first .score { color: #fff; }

    .faces {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2, 8px) var(--sp-3, 12px);
    }
    .face {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      padding: 6px 14px 6px 8px;
      padding-inline: 8px 14px;
      max-width: 100%;
    }
    .avatar { font-size: 1.3rem; line-height: 1; }
    /* Long names are clamped so nothing leaves the 16:9 frame (plan §4). */
    .name {
      font-size: 1.05rem;
      font-weight: 600;
      color: #fff;
      unicode-bidi: isolate;
      max-width: 14ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .face.more {
      font-variant-numeric: tabular-nums;
      color: var(--elm-light-blue);
      background: transparent;
      font-weight: 600;
    }
    .empty { color: var(--elm-light-blue); text-align: center; margin: 0; }
  `],
})
export class TiedLeadersComponent {
  /** Server-ranked standings; already sorted by the API. */
  readonly rows = input<StandingRow[]>([]);
  /** How many distinct ranks to show (1 = winners only, 3 = classic podium depth). */
  readonly depth = input(3);

  /** Group rows by their real rank — never re-rank, never invent places. */
  readonly bands = computed<RankBand[]>(() => {
    const byRank = new Map<number, StandingRow[]>();
    for (const r of this.rows()) {
      const list = byRank.get(r.rank);
      if (list) list.push(r);
      else byRank.set(r.rank, [r]);
    }
    const ranks = [...byRank.keys()].sort((a, b) => a - b).slice(0, Math.max(1, this.depth()));
    return ranks.map((rank) => {
      const list = byRank.get(rank) ?? [];
      return {
        rank,
        rows: list,
        shown: list.slice(0, MAX_PER_BAND),
        overflow: Math.max(0, list.length - MAX_PER_BAND),
      };
    });
  });

  medal(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '•';
  }

  /** Western Arabic digits in BOTH languages (plan §1), so a bare number is safe. */
  ordinal(rank: number): string {
    return String(rank);
  }
}
