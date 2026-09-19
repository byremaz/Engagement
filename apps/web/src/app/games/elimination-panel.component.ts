/**
 * Elimination panel (plan §4) — the persistent, personal, localized statement
 * that a player is out of the current race.
 *
 * Contract this component exists to honour:
 *  - It REPLACES the primary game panel; it is not a toast and it does not
 *    wait for a leaderboard, a signal change or the end of the round.
 *  - It is stable and high-contrast for the rest of the race.
 *  - It is restored from a snapshot after a refresh WITHOUT replaying the
 *    sound: `playEffect` gates the effect only, never the card.
 *  - `prefers-reduced-motion` gets an immediate state change, and a muted
 *    device still receives the full outcome visually.
 *  - No Restart, no "Try again", no enabled pad.
 */
import { Component, computed, effect, input, signal } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-elimination-panel',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <section class="elim" role="alert" aria-live="assertive">
      <div class="avatar" [class.collapse]="collapsing()" aria-hidden="true">{{ avatar() }}</div>

      <h2 class="elim__title outcome-title">{{ 'elim.title' | t }}</h2>
      <p class="elim__reason">{{ 'elim.reason' | t }}</p>

      <p class="elim__score">{{ 'elim.thisRace' | t }}</p>

      <!--
        §4 + to-do 9: on the FINAL race of a game we must not promise a next
        race that does not exist.
      -->
      <p class="elim__safe">{{ (finalRace() ? 'elim.safe.final' : 'elim.safe') | t }}</p>

      <!-- Optional compact spectator line, from real state only. -->
      @if (aliveCount() !== null) {
        <p class="elim__spectate">{{ 'elim.spectate' | t: { alive: aliveCount() } }}</p>
      }
    </section>
  `,
  styles: [`
    .elim {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 24px 18px; border-radius: 20px;
      /* High contrast, stable: navy on light carries the essential message. */
      background: var(--elm-almost-white); border: 4px solid var(--elm-navy);
      box-shadow: 0 10px 0 rgba(10, 20, 60, .18); text-align: center;
    }
    .avatar {
      width: 84px; height: 84px; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; font-size: 42px;
      background: var(--elm-peach); border: 3px solid var(--elm-navy);
    }
    /* Brief collapse; the CARD never depends on the animation completing. */
    .avatar.collapse { animation: elim-collapse 600ms ease-in forwards; }
    @keyframes elim-collapse {
      0%   { transform: scale(1) translateY(0); opacity: 1; }
      60%  { transform: scale(.78) translateY(10px); opacity: .85; }
      100% { transform: scale(.55) translateY(18px); opacity: .5; filter: grayscale(1); }
    }
    /* Reduced motion: immediate final state, no movement at all. */
    @media (prefers-reduced-motion: reduce) {
      .avatar.collapse { animation: none; transform: scale(.55); opacity: .5; filter: grayscale(1); }
    }
    /* Outcome type scale (§9): 32-40px. */
    .elim__title { margin: 4px 0 0; font-size: clamp(32px, 9vw, 40px); line-height: 1.15; color: var(--elm-navy); }
    .elim__reason { margin: 0; font-size: clamp(18px, 5vw, 22px); font-weight: 700; color: var(--elm-navy); }
    .elim__score {
      margin: 6px 0 0; font-size: clamp(22px, 6vw, 28px); font-weight: 800;
      color: var(--elm-almost-white); background: var(--elm-navy);
      padding: 8px 18px; border-radius: 999px;
    }
    .elim__safe { margin: 4px 0 0; font-size: 17px; line-height: 1.5; color: var(--elm-navy); max-width: 34ch; }
    .elim__spectate { margin: 0; font-size: 16px; font-weight: 700; opacity: .75; color: var(--elm-navy); }
  `],
})
export class EliminationPanelComponent {
  readonly avatar = input('🙂');
  /** True on the last race of the game, which changes the closing line. */
  readonly finalRace = input(false);
  /** Real count of players still racing, or null when it is not known. */
  readonly aliveCount = input<number | null>(null);
  /**
   * False when the state was restored from a snapshot (refresh/reconnect):
   * the card still shows, but the collapse effect and sound do not replay.
   */
  readonly playEffect = input(true);

  readonly collapsing = signal(false);

  constructor() {
    effect(() => {
      // Only a live elimination animates. A restored one appears already settled.
      if (this.playEffect()) this.collapsing.set(true);
    });
  }
}
