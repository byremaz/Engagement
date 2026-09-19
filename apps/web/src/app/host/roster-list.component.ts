/**
 * Host roster — a LIST, not a wide table.
 *
 * The old dashboard rendered nine columns (device type, model, OS, browser…)
 * for every player, which pushed the live workspace off screen. Here each row
 * shows only what the host needs mid-event (`#`, avatar + name, connection,
 * ready) and the device details live in an expandable per-participant panel.
 * On narrow screens the rows collapse into cards.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { ParticipantHostView } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

@Component({
  selector: 'app-roster-list',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="roster stack">
      <div class="roster__head">
        <h2 class="roster__title">{{ 'host.roster' | t }} <bdi class="num">({{ players().length }})</bdi></h2>
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary sm" (click)="refresh.emit()">{{ 'host.refresh' | t }}</button>
      </div>

      @if (players().length === 0) {
        <!-- Purposeful empty state: says what to do next, not just "no data". -->
        <p class="roster__empty muted">{{ 'host.noPlayers' | t }}</p>
      } @else {
        <ul class="roster__list">
          @for (p of players(); track p.id) {
            <li class="roster__row" [class.is-open]="isOpen(p.id)">
              <div class="roster__main">
                <bdi class="roster__num num">{{ p.number }}</bdi>
                <span class="roster__avatar" aria-hidden="true">{{ p.avatar }}</span>
                <bdi class="roster__name">{{ p.name }}</bdi>
                @if (p.isSimulated) { <span class="badge badge-lavender">{{ 'host.roster.simulated' | t }}</span> }
                <span class="spacer"></span>
                <span
                  class="badge"
                  [class.badge-go]="p.connected"
                  [class.badge-stop]="!p.connected"
                  >{{ (p.connected ? 'host.roster.connected' : 'host.roster.offline') | t }}</span
                >
                @if (p.ready) { <span class="badge badge-stage">{{ 'host.roster.ready' | t }}</span> }
                <button
                  type="button"
                  class="btn btn-secondary sm"
                  [attr.aria-expanded]="isOpen(p.id)"
                  [attr.aria-label]="(isOpen(p.id) ? 'host.roster.collapse' : 'host.roster.expand') | t"
                  (click)="toggle(p.id)"
                >
                  {{ isOpen(p.id) ? '▴' : '▾' }}
                </button>
              </div>

              @if (isOpen(p.id)) {
                <dl class="roster__details small">
                  <div><dt>{{ 'host.roster.device' | t }}</dt><dd><bdi>{{ p.device.deviceType }}</bdi></dd></div>
                  <div><dt>{{ 'host.roster.model' | t }}</dt><dd><bdi>{{ p.device.model ?? dash() }}</bdi></dd></div>
                  <div><dt>{{ 'host.roster.os' | t }}</dt><dd><bdi>{{ p.device.os ?? dash() }}</bdi></dd></div>
                  <div><dt>{{ 'host.roster.browser' | t }}</dt><dd><bdi>{{ p.device.browser ?? dash() }}</bdi></dd></div>
                  <div><dt>{{ 'host.roster.joinedAt' | t }}</dt><dd><bdi class="num">{{ joined(p) }}</bdi></dd></div>
                </dl>
                <div class="roster__tools">
                  <button type="button" class="btn btn-secondary sm" (click)="rename.emit(p)">{{ 'host.roster.rename' | t }}</button>
                  <button type="button" class="btn btn-danger sm" (click)="remove.emit(p)">{{ 'host.roster.remove' | t }}</button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .roster {
        min-inline-size: 0;
      }
      .roster__head {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }
      .roster__title {
        margin: 0;
        font-size: var(--fs-md, 1rem);
      }
      .roster__empty {
        margin: 0;
      }
      .roster__list {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        max-block-size: 42vh;
      }
      .roster__row {
        border-block-end: 1px solid var(--elm-light-blue, #bdc9e9);
        padding-block: var(--space-2, 8px);
      }
      .roster__row.is-open {
        background: var(--elm-off-white, #f7f8fc);
      }
      .roster__main {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        min-inline-size: 0;
      }
      .roster__num {
        font-variant-numeric: tabular-nums;
        color: var(--elm-slate, #464d7e);
        min-inline-size: 3ch;
      }
      .roster__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-inline-size: 18ch;
      }
      .spacer {
        flex: 1;
      }
      .roster__details {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: var(--space-1, 4px) var(--space-3, 12px);
        margin: var(--space-2, 8px) 0 0;
        padding-inline-start: 3ch;
      }
      .roster__details dt {
        color: var(--elm-slate, #464d7e);
        font-size: var(--fs-xs, 0.75rem);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .roster__details dd {
        margin: 0;
      }
      .roster__tools {
        display: flex;
        gap: var(--space-2, 8px);
        margin-block-start: var(--space-2, 8px);
        padding-inline-start: 3ch;
      }
      .sm {
        min-block-size: 32px;
        padding: 2px 8px;
        font-size: var(--fs-xs, 0.8125rem);
      }
      @media (max-width: 640px) {
        .roster__main {
          flex-wrap: wrap;
        }
        .roster__details,
        .roster__tools {
          padding-inline-start: 0;
        }
      }
    `,
  ],
})
export class RosterListComponent {
  private readonly locale = inject(LocaleService);

  readonly players = input<ParticipantHostView[]>([]);

  readonly refresh = output<void>();
  readonly rename = output<ParticipantHostView>();
  readonly remove = output<ParticipantHostView>();

  /** Only one participant's device details are expanded at a time. */
  private readonly openId = signal<string | null>(null);

  readonly dash = computed(() => this.locale.t('common.dash' as StringKey));

  isOpen(id: string): boolean {
    return this.openId() === id;
  }

  toggle(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  /** Local `HH:mm` only — the raw ISO timestamp stays in the exports. */
  joined(p: ParticipantHostView): string {
    const d = new Date(p.joinedAt);
    if (Number.isNaN(d.getTime())) return this.dash();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
