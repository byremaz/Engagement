/**
 * A generic host drawer.
 *
 * Exports, session administration, links, recovery tools, the roster and the
 * rehearsal panel all live in drawers so the live workspace only ever shows
 * "where are we / what do I press next". A drawer is closed by default, opens
 * over the side of the screen (inset-inline-end, so it flips in Arabic) and
 * never contains a progression action.
 */
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

@Component({
  selector: 'app-host-drawer',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="drawer" [class.is-open]="open()">
      <button
        type="button"
        class="btn btn-secondary drawer__toggle"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        {{ titleKey() | t }}
      </button>

      @if (open()) {
        <section class="drawer__panel card stack" role="dialog" [attr.aria-label]="titleKey() | t">
          <header class="drawer__head">
            <h2 class="drawer__title">{{ titleKey() | t }}</h2>
            <span class="spacer"></span>
            <button
              type="button"
              class="btn btn-secondary sm"
              [attr.aria-label]="'common.close' | t"
              (click)="open.set(false)"
            >
              ✕
            </button>
          </header>
          <div class="drawer__body">
            <ng-content></ng-content>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .drawer {
        position: relative;
      }
      .drawer__panel {
        position: absolute;
        inset-block-start: calc(100% + 8px);
        inset-inline-end: 0;
        z-index: 40;
        inline-size: min(420px, 92vw);
        max-block-size: 70vh;
        overflow: auto;
        box-shadow: var(--elevation-3, 0 12px 32px rgba(5, 29, 73, 0.24));
      }
      .drawer__head {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }
      .drawer__title {
        margin: 0;
        font-size: var(--fs-md, 1rem);
      }
      .drawer__body {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }
      .spacer {
        flex: 1;
      }
      .sm {
        min-block-size: 32px;
        padding: 2px 10px;
      }
      @media (max-width: 640px) {
        .drawer__panel {
          position: fixed;
          inset-block: auto 0;
          inset-inline: 0;
          inline-size: auto;
          max-block-size: 80dvh;
          border-start-start-radius: var(--radius-lg, 14px);
          border-start-end-radius: var(--radius-lg, 14px);
        }
      }
    `,
  ],
})
export class HostDrawerComponent {
  /** Dictionary key for the drawer's button and heading. */
  readonly titleKey = input.required<StringKey>();
  /** Two-way so the host component can close every drawer on a state change. */
  readonly open = model<boolean>(false);
}
