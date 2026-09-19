/**
 * Race signal panel — RENDERED ONLY FOR RLGL.
 *
 * Three fixes from the diagnosis:
 *  1. The host component only instantiates this when `gameType === 'RLGL'`, so
 *     RED/GREEN controls no longer appear during Pin the Country or Order It!.
 *  2. Manual/Auto is a segmented mode selector, and the Auto explanation is an
 *     informational line ("Signals run automatically. You still control the
 *     event.") styled `alert-info` — never `alert-error`, which stays reserved
 *     for real failures.
 *  3. Signals never advance the event; that stays with the stage actions.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SessionSnapshot, SignalColor, SignalMode } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-signal-panel',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card-dark stack signal-panel">
      <h2 class="signal-panel__title">{{ 'host.signal.title' | t }}</h2>
      <p class="small signal-panel__note">{{ 'host.signal.neverAdvances' | t }}</p>

      <!-- Segmented mode selector: one control, two exclusive options. -->
      <div class="segmented" role="radiogroup" [attr.aria-label]="'host.signal.mode' | t">
        <button
          type="button"
          class="segmented__opt"
          role="radio"
          [attr.aria-checked]="mode() === 'MANUAL'"
          [class.is-active]="mode() === 'MANUAL'"
          (click)="modeChange.emit('MANUAL')"
        >
          {{ 'host.signal.manual' | t }}
        </button>
        <button
          type="button"
          class="segmented__opt"
          role="radio"
          [attr.aria-checked]="mode() === 'AUTO'"
          [class.is-active]="mode() === 'AUTO'"
          (click)="modeChange.emit('AUTO')"
        >
          {{ 'host.signal.auto' | t }}
        </button>
      </div>

      @if (mode() === 'AUTO') {
        <!-- Informational, not an error. -->
        <p class="alert alert-info signal-panel__auto">{{ 'host.signal.autoNote' | t }}</p>
      }

      <!--
        Plan §6: in AUTO the manual buttons are HIDDEN with a stated reason
        rather than left on screen looking broken. In MANUAL the CURRENT signal
        is visually distinct from the NEXT selectable command, so the host can
        never mistake "what is showing" for "what I can press".
      -->
      @if (mode() === 'MANUAL') {
        <div class="row sig">
          <button
            type="button"
            class="btn btn-lg signal signal-red"
            [class.is-current]="currentSignal() === 'RED'"
            [disabled]="!canSignal() || currentSignal() === 'RED'"
            [attr.aria-current]="currentSignal() === 'RED' ? 'true' : null"
            (click)="signal.emit('RED')"
          >
            <span class="signal__label">{{ 'host.signal.red' | t }}</span>
            <span class="signal__state small">
              {{ (currentSignal() === 'RED' ? 'host.signal.showingNow' : 'host.signal.switchTo') | t }}
            </span>
          </button>
          <button
            type="button"
            class="btn btn-lg signal signal-green"
            [class.is-current]="currentSignal() === 'GREEN'"
            [disabled]="!canSignal() || currentSignal() === 'GREEN'"
            [attr.aria-current]="currentSignal() === 'GREEN' ? 'true' : null"
            (click)="signal.emit('GREEN')"
          >
            <span class="signal__label">{{ 'host.signal.green' | t }}</span>
            <span class="signal__state small">
              {{ (currentSignal() === 'GREEN' ? 'host.signal.showingNow' : 'host.signal.switchTo') | t }}
            </span>
          </button>
        </div>
        <!-- When manual control is unavailable, say WHY. -->
        @if (!canSignal()) {
          <p class="alert alert-info signal-panel__why">{{ disabledReason() | t }}</p>
        }
      }

      @if (snap()?.paused) {
        <!-- PAUSED dominates here too: the last signal is context only. -->
        <p class="signal-panel__paused">{{ 'signal.paused.title' | t }}</p>
        <p class="small signal-panel__note">{{ 'signal.paused.hostBody' | t }}</p>
      }

      @if (snap()?.race; as r) {
        <p class="small signal-panel__now">
          <span>{{ 'host.signal.current' | t }}:</span>
          <strong>{{ (r.signal === 'GREEN' ? 'signal.green' : 'signal.red') | t }}</strong>
          <span aria-hidden="true">·</span>
          <bdi class="num">{{ 'host.race.counts' | t: { alive: aliveCount(), finished: finishedCount(), eliminated: eliminatedCount() } }}</bdi>
        </p>
      }
    </section>
  `,
  styles: [
    `
      .signal-panel__title {
        margin: 0;
      }
      .signal-panel__note {
        margin: 0;
        opacity: 0.85;
      }
      .signal-panel__now {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1, 4px);
        margin: 0;
        align-items: baseline;
      }
      .signal-panel__paused {
        margin: 0;
        font-size: var(--fs-xl, 1.375rem);
        font-weight: 800;
        letter-spacing: 0.04em;
      }
      .segmented {
        display: inline-flex;
        padding: 3px;
        border-radius: var(--radius-pill, 999px);
        background: rgba(255, 255, 255, 0.14);
        gap: 3px;
      }
      .segmented__opt {
        appearance: none;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: 600;
        padding: 6px 16px;
        min-block-size: 36px;
        border-radius: var(--radius-pill, 999px);
        cursor: pointer;
      }
      .segmented__opt.is-active {
        background: #fff;
        color: var(--elm-navy, #051d49);
      }
      .sig .btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: var(--fs-xl, 1.375rem);
        min-block-size: 72px;
      }
      .signal__label {
        font-weight: 800;
      }
      /* Secondary line states the ROLE of the button, so "current" and
         "selectable" are never confused by colour alone (§9 contrast rule). */
      .signal__state {
        font-weight: 600;
        opacity: 0.9;
        text-transform: none;
        letter-spacing: 0;
      }
      /* The signal already showing is a status, not an invitation to press. */
      .sig .btn.is-current {
        outline: 4px solid #fff;
        outline-offset: 2px;
        opacity: 1;
      }
      .signal-panel__why {
        margin: 0;
      }
    `,
  ],
})
export class SignalPanelComponent {
  readonly snap = input<SessionSnapshot | null>(null);
  readonly mode = input<SignalMode>('MANUAL');

  readonly signal = output<SignalColor>();
  readonly modeChange = output<SignalMode>();

  /** Manual signals are only meaningful in a live, unpaused race. */
  readonly canSignal = computed(() => {
    const s = this.snap();
    return !!s && s.state === 'RoundActive' && s.gameType === 'RLGL' && !s.paused && this.mode() === 'MANUAL';
  });

  /** The signal actually showing to the room, from the authoritative snapshot. */
  readonly currentSignal = computed<SignalColor | null>(() => this.snap()?.race?.signal ?? null);

  /**
   * Why manual control is unavailable right now. Never a bare disabled button:
   * the host is told what state blocks the press (plan §6).
   */
  readonly disabledReason = computed(() => {
    const s = this.snap();
    if (!s) return 'host.signal.why.noSession';
    if (s.gameType !== 'RLGL') return 'host.signal.why.notRace';
    if (s.paused) return 'host.signal.why.paused';
    if (s.state !== 'RoundActive') return 'host.signal.why.notActive';
    return 'host.signal.why.notActive';
  });

  private readonly players = computed(() => this.snap()?.race?.players ?? []);
  readonly aliveCount = computed(() => this.players().filter((p) => p.state === 'alive').length);
  readonly finishedCount = computed(() => this.players().filter((p) => p.state === 'finished').length);
  readonly eliminatedCount = computed(() => this.players().filter((p) => p.state === 'eliminated').length);
}
