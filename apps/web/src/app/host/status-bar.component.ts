/**
 * Host status bar — the always-visible "where are we" line.
 *
 * Deliberate separations required by the diagnosis:
 *  - Round time (the current round's remaining time) and Event time (elapsed
 *    since the event started) are two clearly distinct readouts.
 *  - The HOST SOCKET status is separate from the PARTICIPANT online count; they
 *    answered different questions but used to look like one badge.
 * All numbers are wrapped in `<bdi>` with `tabular-nums` so Arabic RTL text
 * cannot scramble codes, fractions or clocks.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SessionSnapshot } from '@asas/shared';
import { TimerComponent } from '../shared/timer.component';
import { TranslatePipe } from '../i18n/t.pipe';
import type { ConnState } from '../core/realtime.service';

@Component({
  selector: 'app-host-status-bar',
  standalone: true,
  imports: [TimerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="statusbar">
      <div class="statusbar__id">
        <strong class="statusbar__title"><bdi>{{ title() }}</bdi></strong>
        <span class="statusbar__code">
          <span class="small muted">{{ 'host.joinCode' | t }}</span>
          <bdi class="num code">{{ joinCode() }}</bdi>
        </span>
      </div>

      <div class="statusbar__stage">
        @if (snap(); as s) {
          @if (s.paused) {
            <span class="badge badge-warm">{{ 'state.paused' | t }}</span>
          } @else {
            <span class="badge badge-stage">{{ 'state.' + s.state | t }}</span>
          }
          @if (s.gameType; as g) {
            <span class="statusbar__game">{{ 'game.' + g | t }}</span>
          }
          @if (s.roundPublic && !s.isPractice && s.roundCount > 0) {
            <span class="small muted"><bdi>{{ 'host.roundOf' | t: { n: s.roundNumber, total: s.roundCount } }}</bdi></span>
          }
          @if (s.isPractice) { <span class="badge badge-lavender">{{ 'state.Practice' | t }}</span> }
        }
      </div>

      <div class="statusbar__clocks">
        <!-- Round time: only meaningful while a round is counting. -->
        <span class="readout">
          <span class="readout__label small muted">{{ 'host.roundTime' | t }}</span>
          <bdi class="readout__value num">
            @if (roundTimeEndsAt(); as ends) {
              <app-timer [endsAt]="ends" [frozenMs]="snap()?.paused ? (snap()?.remainingMs ?? null) : null" />s
            } @else {
              {{ 'common.dash' | t }}
            }
          </bdi>
        </span>
        <!-- Event time: elapsed wall clock, flagged when the event overruns. -->
        <span class="readout" [class.readout--overrun]="overrun()">
          <span class="readout__label small muted">{{ 'host.eventTime' | t }}</span>
          <bdi class="readout__value num">{{ elapsedLabel() || ('common.dash' | t) }}</bdi>
          @if (overrun()) { <span class="badge badge-stop">{{ 'host.overrun' | t }}</span> }
        </span>
      </div>

      <div class="statusbar__conn">
        <!-- Participants online — a room fact. -->
        <span class="readout">
          <span class="readout__label small muted">{{ 'host.online' | t }}</span>
          <bdi class="readout__value num">{{ onlineCount() }}/{{ snap()?.participantCount ?? 0 }}</bdi>
        </span>
        <!-- Host link — a fact about THIS browser, not about the room. -->
        <span class="readout">
          <span class="readout__label small muted">{{ 'host.socket' | t }}</span>
          <span
            class="badge"
            [class.badge-go]="conn() === 'connected'"
            [class.badge-warm]="conn() === 'connecting'"
            [class.badge-stop]="conn() !== 'connected' && conn() !== 'connecting'"
            >{{ connLabel() | t }}</span
          >
        </span>
      </div>

      <div class="statusbar__actions">
        <ng-content></ng-content>
      </div>
    </header>
  `,
  styles: [
    `
      .statusbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3, 12px) var(--space-5, 20px);
        padding: var(--space-3, 12px) var(--space-5, 20px);
        background: var(--elm-pale-blue, #e5e9f6);
        border-block-end: 1px solid var(--elm-light-blue, #bdc9e9);
        font-size: var(--fs-sm, 0.875rem);
      }
      .statusbar__id,
      .statusbar__stage,
      .statusbar__clocks,
      .statusbar__conn {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        min-inline-size: 0;
      }
      .statusbar__title {
        font-size: var(--fs-md, 1rem);
        max-inline-size: 22ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .statusbar__code {
        display: inline-flex;
        align-items: baseline;
        gap: var(--space-1, 4px);
      }
      .code {
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .statusbar__game {
        font-weight: 600;
        color: var(--elm-navy, #051d49);
      }
      .statusbar__actions {
        margin-inline-start: auto;
        display: flex;
        gap: var(--space-2, 8px);
      }
      .readout {
        display: inline-flex;
        align-items: baseline;
        gap: var(--space-1, 4px);
      }
      .readout__label {
        text-transform: uppercase;
        font-size: var(--fs-xs, 0.75rem);
        letter-spacing: 0.05em;
      }
      .readout__value {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .readout--overrun .readout__value {
        color: var(--elm-burgundy, #a12b2a);
      }
      @media (max-width: 720px) {
        .statusbar {
          gap: var(--space-2, 8px) var(--space-3, 12px);
          padding-inline: var(--space-3, 12px);
        }
        .statusbar__actions {
          margin-inline-start: 0;
        }
      }
    `,
  ],
})
export class HostStatusBarComponent {
  readonly snap = input<SessionSnapshot | null>(null);
  readonly title = input<string>('');
  readonly joinCode = input<string>('');
  readonly conn = input<ConnState>('connecting');
  readonly onlineCount = input<number>(0);
  /** `m:ss` elapsed event time, computed by the host component's 1s clock. */
  readonly elapsedLabel = input<string>('');
  readonly overrun = input<boolean>(false);

  readonly connLabel = computed(() => `host.socket.${this.conn()}`);

  /** A round clock only exists during the countdown and the active round. */
  readonly roundTimeEndsAt = computed(() => {
    const s = this.snap();
    if (!s) return null;
    if (s.state === 'Countdown') return s.countdownEndsAt;
    if (s.state === 'RoundActive') return s.deadlineAt;
    return null;
  });
}
