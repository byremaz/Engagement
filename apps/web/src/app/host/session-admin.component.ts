/**
 * Session administration — links, exports and the destructive tools.
 *
 * This block lives inside a drawer (`app-host-drawer`), deliberately away from
 * the progression actions: voiding a round or ending the session must never sit
 * next to "Next round". Both destructive actions state their consequence and
 * are confirmed by the host component before anything is sent.
 *
 * Exports carry the stable machine IDs; only display columns are localized
 * [api-conventions], and no host key or token is ever rendered here
 * [secure-coding].
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

export type ExportKind = 'standings-public' | 'standings-private' | 'rounds';

@Component({
  selector: 'app-session-admin',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin stack">
      <section class="admin__group">
        <h3 class="admin__title">{{ 'host.session.links' | t }}</h3>
        <div class="admin__row">
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="toggleJoin.emit()">
            {{ (joinOpen() ? 'host.session.closeJoin' : 'host.session.openJoin') | t }}
          </button>
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="openDisplay.emit()">
            {{ 'host.session.copyDisplay' | t }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="copyJoin.emit()">
            {{ (copied() ? 'common.copied' : 'host.session.copyJoin') | t }}
          </button>
        </div>
      </section>

      <section class="admin__group">
        <h3 class="admin__title">{{ 'host.drawer.exports' | t }}</h3>
        <div class="admin__row">
          <button type="button" class="btn btn-secondary" (click)="exportCsv.emit('standings-public')">
            {{ 'host.export.standingsPublic' | t }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="exportCsv.emit('standings-private')">
            {{ 'host.export.standingsPrivate' | t }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="exportCsv.emit('rounds')">
            {{ 'host.export.rounds' | t }}
          </button>
        </div>
        <p class="small muted admin__note">{{ 'host.export.note' | t }}</p>
      </section>

      <section class="admin__group admin__group--danger">
        @if (canVoid()) {
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="voidRound.emit()">
            {{ 'host.session.voidRound' | t }}
          </button>
          <p class="small admin__note">{{ 'host.session.voidConsequence' | t }}</p>
        }
        <button type="button" class="btn btn-danger" [disabled]="busy() || closed()" (click)="closeSession.emit()">
          {{ 'host.session.close' | t }}
        </button>
        <p class="small admin__note">{{ 'host.session.closeConsequence' | t }}</p>
      </section>
    </div>
  `,
  styles: [
    `
      .admin__group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }
      .admin__group + .admin__group {
        padding-block-start: var(--space-3, 12px);
        border-block-start: 1px solid var(--elm-light-blue, #bdc9e9);
      }
      .admin__group--danger {
        margin-block-start: var(--space-2, 8px);
      }
      .admin__title {
        margin: 0;
        font-size: var(--fs-md, 1rem);
      }
      .admin__row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
      }
      .admin__note {
        margin: 0;
        color: var(--elm-slate, #464d7e);
      }
    `,
  ],
})
export class SessionAdminComponent {
  readonly joinOpen = input<boolean>(false);
  readonly closed = input<boolean>(false);
  readonly busy = input<boolean>(false);
  /** True only for a real (non-practice) attempt that can still be replayed. */
  readonly canVoid = input<boolean>(false);
  readonly copied = input<boolean>(false);

  readonly toggleJoin = output<void>();
  readonly openDisplay = output<void>();
  readonly copyJoin = output<void>();
  readonly exportCsv = output<ExportKind>();
  readonly voidRound = output<void>();
  readonly closeSession = output<void>();
}
