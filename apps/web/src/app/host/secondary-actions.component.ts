/**
 * "More stage actions" — the secondary row. The primary slot owns the single
 * next press; everything else the current state allows lands here, collapsed.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { HostAction, SessionSnapshot } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';
import { pauseActionFor, secondaryActionsFor } from './next-action';

@Component({
  selector: 'app-secondary-actions',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actions().length || pauseAction()) {
      <details class="more">
        <summary class="more__summary">{{ 'host.more' | t }}</summary>
        <div class="more__row">
          @if (pauseAction(); as pa) {
            <button type="button" class="btn btn-warm" [disabled]="busy()" (click)="run.emit(pa)">⏸ {{ labelKey(pa) | t }}</button>
          }
          @for (a of actions(); track a) {
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="run.emit(a)">{{ labelKey(a) | t }}</button>
          }
        </div>
      </details>
    }
  `,
  styles: [`
    .more { min-inline-size: 0; }
    .more__summary { cursor: pointer; font-size: var(--fs-00); color: var(--elm-royal-blue); font-weight: 600; }
    .more__row { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-block-start: var(--space-2); }
  `],
})
export class SecondaryActionsComponent {
  readonly snap = input<SessionSnapshot | null>(null);
  readonly busy = input<boolean>(false);
  readonly primary = input<HostAction | null>(null);
  readonly run = output<HostAction>();

  labelKey(a: HostAction): StringKey {
    return `action.${a}` as StringKey;
  }

  readonly actions = computed<HostAction[]>(() => secondaryActionsFor(this.snap(), this.primary()));
  readonly pauseAction = computed<HostAction | null>(() => pauseActionFor(this.snap()));
}
