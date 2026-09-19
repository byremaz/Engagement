/**
 * Race state panel (plan §3) — the SINGLE primary panel for the race, replacing
 * the overlapping banners that previously competed on the phone.
 *
 * One resolved `effectiveState` drives one localized panel, in this precedence
 * so a known outcome always dominates a transient signal:
 *
 *   eliminated | finished > reconnecting > paused > countdown > timeEnded
 *   > green/red (holding or not) > ready > instructions
 *
 * The LARGEST text always describes the action the player should take now. On
 * RED the panel says "Release now!" / "Stop! Do not press" and the pad label
 * matches — but the pad stays ENABLED and keeps reporting input, because
 * disabling it would delete the elimination mechanic (plan Notes/Risks).
 */
import { Component, computed, input } from '@angular/core';
import type { MyLife } from '@asas/shared';
import type { SignalColor } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

/** Every distinct panel the race can show. */
export type RaceUiState =
  | 'eliminated'
  | 'finished'
  | 'reconnecting'
  | 'paused'
  | 'countdown'
  | 'timeEnded'
  | 'greenHolding'
  | 'green'
  | 'redHolding'
  | 'red'
  | 'ready'
  | 'instructions';

/** States in which movement is genuinely impossible, so the pad is removed. */
const NO_PAD: readonly RaceUiState[] = [
  'eliminated', 'finished', 'reconnecting', 'paused', 'countdown', 'timeEnded', 'ready', 'instructions',
];

@Component({
  selector: 'app-race-state-panel',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <section class="rsp" [class.rsp--red]="tone() === 'red'" [class.rsp--green]="tone() === 'green'">
      <!-- The "instruction" class picks up the role-scoped participant scale. -->
      <h2 class="rsp__title instruction" role="status" aria-live="assertive">{{ titleKey() | t }}</h2>
      <p class="rsp__body">{{ bodyKey() | t }}</p>
    </section>
  `,
  styles: [`
    .rsp {
      padding: 18px 16px; border-radius: 18px; text-align: center;
      border: 4px solid var(--elm-navy); background: var(--elm-almost-white);
    }
    .rsp--green { background: var(--elm-mint, #d8f5e3); }
    .rsp--red { background: var(--elm-peach); }
    /* Instruction scale (§9): 28-36px, the dominant element on the phone. */
    .rsp__title { margin: 0; font-size: clamp(28px, 8vw, 36px); line-height: 1.15; color: var(--elm-navy); }
    /* Body 16-18px; secondary to the instruction, never competing with it. */
    .rsp__body { margin: 6px 0 0; font-size: 17px; line-height: 1.45; color: var(--elm-navy); }
  `],
})
export class RaceStatePanelComponent {
  readonly life = input<MyLife>('unknown');
  readonly color = input<SignalColor>('RED');
  readonly holding = input(false);
  readonly paused = input(false);
  readonly connected = input(true);
  readonly countdown = input(false);
  readonly timeEnded = input(false);
  /** The round is live, so a signal panel is meaningful. */
  readonly active = input(false);

  /** The §9.3 precedence resolver — the one source of truth for the panel. */
  readonly effectiveState = computed<RaceUiState>(() => {
    const life = this.life();
    // A known outcome outranks EVERYTHING, including a live signal.
    if (life === 'eliminated') return 'eliminated';
    if (life === 'finished') return 'finished';
    if (!this.connected()) return 'reconnecting';
    if (this.paused()) return 'paused';
    if (this.countdown()) return 'countdown';
    if (this.timeEnded()) return 'timeEnded';
    if (this.active() && life === 'alive') {
      if (this.color() === 'GREEN') return this.holding() ? 'greenHolding' : 'green';
      return this.holding() ? 'redHolding' : 'red';
    }
    if (this.active()) return 'ready';
    return 'instructions';
  });

  readonly titleKey = computed(() => `race.${this.effectiveState()}.title`);
  readonly bodyKey = computed(() => `race.${this.effectiveState()}.body`);

  /** Movement is only possible in the four live signal states. */
  readonly showPad = computed(() => !NO_PAD.includes(this.effectiveState()));

  readonly tone = computed<'red' | 'green' | 'neutral'>(() => {
    const s = this.effectiveState();
    if (s === 'green' || s === 'greenHolding') return 'green';
    if (s === 'red' || s === 'redHolding' || s === 'eliminated') return 'red';
    return 'neutral';
  });
}
