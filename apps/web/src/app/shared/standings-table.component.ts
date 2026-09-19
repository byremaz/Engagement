/**
 * Public standings table (§12.2 public fields only; plan §5/§8).
 *
 * Three rules this component exists to enforce:
 *  1. A player NEVER discovers their own rank through pagination: a persistent
 *     `You` / `أنت` card sits above the list whenever `highlight` is set, even
 *     when that player is on another page or filtered out by a search.
 *  2. Ties are REAL and explicit. Rows sharing a total show a tied indicator
 *     rather than implying a strict ordering the scoring never produced.
 *  3. Before the reveal there is no rank at all — never a stale or invented
 *     one. The caller passes `revealed=false` and gets explanatory copy.
 *
 * Paginates instead of shrinking essential names (§13.6, §9).
 */
import { Component, computed, input, signal } from '@angular/core';
import type { StandingRow } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-standings-table',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <!--
      Plan §5: the personal card is rendered from the SAME row data as the
      table, so it can never disagree with the list.
    -->
    @if (revealed() && myRow(); as me) {
      <section class="mecard" aria-live="polite">
        <span class="mecard__badge">{{ 'common.you' | t }}</span>
        <span class="mecard__avatar" aria-hidden="true">{{ me.avatar }}</span>
        <span class="mecard__name"><bdi>{{ me.name }}</bdi></span>
        <span class="mecard__rank num">
          {{ 'standings.rankOf' | t: { rank: me.rank, total: rows().length } }}
          @if (isTied(me)) { <span class="tie">{{ 'standings.tied' | t }}</span> }
        </span>
        <span class="mecard__total num">{{ 'standings.totalPoints' | t: { points: me.total } }}</span>
      </section>
    } @else if (!revealed()) {
      <!-- No fabricated rank before the host reveals. -->
      <p class="alert alert-info">{{ 'standings.beforeReveal' | t }}</p>
    }

    @if (searchable()) {
      <div class="tools">
        <label class="sr-only" for="st-search">{{ 'standings.search' | t }}</label>
        <input id="st-search" class="input" type="search" [value]="query()"
          (input)="onQuery($event)" [attr.placeholder]="'standings.search' | t" />
        @if (myRow()) {
          <button type="button" class="btn btn-secondary" (click)="showMe()">{{ 'standings.showMe' | t }}</button>
        }
      </div>
    }

    <table class="num">
      <thead>
        <tr>
          <th>{{ 'standings.rank' | t }}</th>
          <th class="l">{{ 'standings.name' | t }}</th>
          <th>{{ 'game.RLGL.short' | t }}</th>
          <th>{{ 'game.GEO.short' | t }}</th>
          <th>{{ 'game.ORDER.short' | t }}</th>
          <th>{{ 'standings.total' | t }}</th>
        </tr>
      </thead>
      <tbody>
        @for (r of pageRows(); track r.participantId) {
          <tr [class.top]="r.rank <= 3" [class.me]="r.participantId === highlight()">
            <td>
              {{ r.rank }}
              @if (isTied(r)) { <span class="tie" [attr.title]="'standings.tied' | t">=</span> }
            </td>
            <td class="l">
              <span aria-hidden="true">{{ r.avatar }}</span> <bdi>{{ r.name }}</bdi>
              @if (r.participantId === highlight()) { <span class="youtag">{{ 'common.you' | t }}</span> }
            </td>
            <td>{{ r.rlgl }}</td><td>{{ r.geo }}</td><td>{{ r.order }}</td>
            <td><strong>{{ r.total }}</strong></td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="l muted">{{ (query() ? 'standings.noMatch' : 'standings.empty') | t }}</td></tr>
        }
      </tbody>
    </table>

    @if (pageCount() > 1) {
      <div class="row pager">
        <button type="button" class="btn btn-secondary" (click)="page.set(page() - 1)" [disabled]="page() === 0">
          {{ 'common.prev' | t }}
        </button>
        <span class="num">{{ 'standings.page' | t: { page: page() + 1, pages: pageCount() } }}</span>
        <button type="button" class="btn btn-secondary" (click)="page.set(page() + 1)" [disabled]="page() >= pageCount() - 1">
          {{ 'common.next' | t }}
        </button>
      </div>
    }
  `,
  styles: [`
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; text-align: right; border-bottom: 1px solid var(--elm-light-blue); }
    .l { text-align: left; }
    :host-context([dir="rtl"]) th, :host-context([dir="rtl"]) td { text-align: left; }
    :host-context([dir="rtl"]) .l { text-align: right; }
    th { color: var(--elm-muted-indigo); font-weight: 600; font-size: 0.85em; }
    tr.top td { background: var(--elm-pale-blue); }
    tr.me td { outline: 2px solid var(--elm-purple); }
    .pager { justify-content: center; margin-top: 12px; }
    .tools { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
    .tools .input { flex: 1; }
    /* Persistent personal card: navy on light, always above the list. */
    .mecard {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 12px 14px; margin-bottom: 12px; border-radius: 14px;
      background: var(--elm-almost-white); border: 3px solid var(--elm-navy);
    }
    .mecard__badge {
      background: var(--elm-navy); color: var(--elm-almost-white);
      padding: 3px 12px; border-radius: 999px; font-weight: 800; font-size: 14px;
    }
    .mecard__avatar { font-size: 28px; }
    .mecard__name { font-weight: 800; font-size: 19px; color: var(--elm-navy); }
    .mecard__rank { margin-inline-start: auto; font-weight: 700; color: var(--elm-navy); }
    .mecard__total { font-weight: 800; color: var(--elm-navy); }
    /* A tie is stated in text, not conveyed by a tiny mark alone (§9). */
    .tie {
      display: inline-block; margin-inline-start: 6px; padding: 1px 8px;
      border-radius: 999px; background: var(--elm-peach); color: var(--elm-navy);
      font-size: 13px; font-weight: 700;
    }
    .youtag {
      margin-inline-start: 6px; padding: 1px 8px; border-radius: 999px;
      background: var(--elm-purple); color: var(--elm-almost-white);
      font-size: 12px; font-weight: 700;
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }
    :host-context(.card-dark) th, :host-context(.card-dark) td { border-color: var(--elm-muted-indigo); color: var(--elm-almost-white); }
    :host-context(.card-dark) tr.top td { background: var(--elm-muted-indigo); }
  `],
})
export class StandingsTableComponent {
  readonly rows = input<StandingRow[]>([]);
  readonly pageSize = input(15);
  readonly highlight = input<string | null>(null);
  /** Search + "Show me" are for interactive views, not the shared display. */
  readonly searchable = input(false);
  /** False before the host reveals: no rank is shown at all. */
  readonly revealed = input(true);

  readonly page = signal(0);
  readonly query = signal('');

  /** The viewer's own row, found regardless of page or active search. */
  readonly myRow = computed(() => {
    const id = this.highlight();
    return id ? this.rows().find((r) => r.participantId === id) ?? null : null;
  });

  /** Counts per rank, so a tie is derived from real data, never guessed. */
  private readonly rankCounts = computed(() => {
    const counts = new Map<number, number>();
    for (const r of this.rows()) counts.set(r.rank, (counts.get(r.rank) ?? 0) + 1);
    return counts;
  });

  isTied(row: StandingRow): boolean {
    return (this.rankCounts().get(row.rank) ?? 0) > 1;
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter(
      (r) => r.name.toLowerCase().includes(q) || String(r.number).includes(q),
    );
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));

  readonly pageRows = computed(() => {
    const p = Math.min(this.page(), this.pageCount() - 1);
    return this.filtered().slice(p * this.pageSize(), (p + 1) * this.pageSize());
  });

  onQuery(ev: Event): void {
    this.query.set((ev.target as HTMLInputElement).value);
    this.page.set(0);
  }

  /** Jumps to the page holding the viewer's row — no hunting required. */
  showMe(): void {
    const id = this.highlight();
    if (!id) return;
    this.query.set('');
    const idx = this.rows().findIndex((r) => r.participantId === id);
    if (idx >= 0) this.page.set(Math.floor(idx / this.pageSize()));
  }
}
