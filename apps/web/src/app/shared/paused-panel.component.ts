/**
 * PausedPanelComponent — plan §3/§5: when the host pauses, PAUSED must be the
 * DOMINANT instruction on the phone, the host desk and the display. The
 * previous race signal is shown only as secondary context, never with its
 * full GREEN/RED visual weight, so nobody keeps acting on a stale signal.
 *
 * Purely presentational: no timers, no actions — pause/resume stays entirely
 * host-authoritative.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { SignalColor } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-paused-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section class="paused" role="alert" aria-live="assertive">
      <span class="icon" aria-hidden="true">⏸</span>
      <h2 class="title">{{ 'signal.paused.title' | t }}</h2>
      <p class="body">{{ bodyKey() | t }}</p>

      @if (previousSignal(); as sig) {
        <p class="prev">
          {{ 'signal.paused.wasBefore' | t: { signal: signalText() } }}
        </p>
      }

      <p class="hint">{{ 'signal.paused.resumeHint' | t }}</p>
    </section>
  `,
  styles: [
    `
      :host { display: block; }
      .paused {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2, 8px);
        text-align: center;
        padding: var(--space-6, 24px) var(--space-4, 16px);
        border-radius: var(--radius-lg, 16px);
        background: var(--elm-navy, #051d49);
        color: var(--elm-almost-white, #f7f8fc);
        box-shadow: var(--elev-2, 0 4px 12px rgba(5, 29, 73, 0.24));
      }
      .icon { font-size: 44px; line-height: 1; }
      .title {
        margin: 0;
        font-size: var(--fs-2xl, 30px);
        letter-spacing: 0.06em;
      }
      .body {
        margin: 0;
        max-width: 36ch;
        color: var(--elm-neutral-100, #e5e9f6);
      }
      .prev {
        margin: var(--space-2, 8px) 0 0;
        font-size: var(--fs-sm, 14px);
        padding: 4px 12px;
        border-radius: 999px;
        background: rgba(247, 248, 252, 0.12);
        color: var(--elm-neutral-500, #bdc9e9);
        unicode-bidi: isolate;
      }
      .hint {
        margin: 0;
        font-size: var(--fs-sm, 14px);
        color: var(--elm-cyan, #00a1e0);
      }
    `,
  ],
})
export class PausedPanelComponent {
  private readonly locale = inject(LocaleService);

  /** The signal that was live before the pause — secondary context only. */
  readonly previousSignal = input<SignalColor | null>(null);
  /** Host desk uses slightly different copy ("frozen for everyone"). */
  readonly forHost = input(false);

  readonly bodyKey = computed(() =>
    this.forHost() ? ('signal.paused.hostBody' as const) : ('signal.paused.body' as const),
  );

  /** Localized name of the previous signal (re-computes on language switch). */
  readonly signalText = computed(() => {
    this.locale.lang();
    const sig = this.previousSignal();
    return sig ? this.locale.t(sig === 'GREEN' ? 'signal.green' : 'signal.red') : '';
  });
}
