/**
 * Host-driven paging of the display standings (plan v2, BUG-J). The page
 * travels on the seq-ordered snapshot; this only emits the host's intent.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SessionSnapshot } from '@asas/shared';
import { DISPLAY_ROWS_PER_PAGE } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-standings-pager',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pageCount() > 1) {
      <div class="pager">
        <button type="button" class="btn btn-secondary" [disabled]="busy() || page() === 0" (click)="pageChange.emit(page() - 1)">{{ 'host.standings.prev' | t }}</button>
        <span class="num">{{ 'host.standings.page' | t: { page: page() + 1, total: pageCount() } }}</span>
        <button type="button" class="btn btn-secondary" [disabled]="busy() || page() >= pageCount() - 1" (click)="pageChange.emit(page() + 1)">{{ 'host.standings.next' | t }}</button>
      </div>
    }
  `,
  styles: [`.pager { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }`],
})
export class StandingsPagerComponent {
  readonly snap = input<SessionSnapshot | null>(null);
  readonly busy = input(false);
  readonly pageChange = output<number>();

  readonly page = computed(() => this.snap()?.standingsPage ?? 0);
  readonly pageCount = computed(() => Math.max(1, Math.ceil((this.snap()?.standings?.length ?? 0) / DISPLAY_ROWS_PER_PAGE)));
}
