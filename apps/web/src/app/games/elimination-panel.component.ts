/**
 * Elimination takeover (plan v2 §5.3) — the persistent, personal statement
 * that a player is out of the current race.
 *
 *  - It takes over the whole screen in burgundy; it is not a toast and it
 *    stays until the host reveals the round.
 *  - Restored from a snapshot after a refresh WITHOUT replaying the collapse:
 *    `playEffect` gates the effect only, never the card.
 *  - `prefers-reduced-motion` gets the settled state at once; a muted phone
 *    still receives the full outcome visually (vibration is the phone's channel).
 *  - No Restart, no "Try again", no enabled pad.
 */
import { Component, effect, input, signal } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-elimination-panel',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <section class="elim" role="alert" aria-live="assertive">
      <div class="avatar" [class.collapse]="collapsing()" aria-hidden="true">{{ avatar() }}</div>

      <h2 class="elim__title outcome-title"><span aria-hidden="true">✕</span> {{ 'elim.title' | t }}</h2>
      <p class="elim__reason">{{ 'elim.reason' | t }}</p>

      <p class="elim__score num">{{ 'elim.thisRace' | t }}</p>

      <p class="elim__safe num">{{ (finalRace() ? 'elim.safe.final' : 'elim.safe') | t: { pts: safePoints() } }}</p>

      @if (aliveCount() !== null) {
        <p class="elim__spectate num">{{ 'elim.spectate' | t: { alive: aliveCount() } }}</p>
      }
    </section>
  `,
  styles: [`
    /* Full takeover: the outcome cannot be missed, whatever else is on screen. */
    .elim {
      position: fixed; inset: 0; z-index: 30;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
      padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
      background: var(--game-stop); color: var(--elm-almost-white); text-align: center;
    }
    .avatar {
      width: 96px; height: 96px; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; font-size: 48px;
      background: var(--elm-almost-white); border: 4px solid var(--elm-navy);
    }
    .avatar.collapse { animation: elim-collapse 900ms ease-in forwards; }
    @keyframes elim-collapse {
      0%   { transform: scale(1) translateY(0) rotate(0); opacity: 1; }
      55%  { transform: scale(.85) translateY(8px) rotate(-8deg); opacity: .9; }
      100% { transform: scale(.55) translateY(22px) rotate(-20deg); opacity: .55; filter: grayscale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .avatar.collapse { animation: none; transform: scale(.55); opacity: .55; filter: grayscale(1); }
    }
    .elim__title { margin: 8px 0 0; font-size: clamp(32px, 9vw, 42px); line-height: 1.15; color: var(--elm-almost-white); }
    .elim__reason { margin: 0; font-size: clamp(18px, 5vw, 22px); font-weight: 700; opacity: .95; }
    .elim__score {
      margin: 8px 0 0; font-size: clamp(22px, 6vw, 28px); font-weight: 800;
      color: var(--game-stop); background: var(--elm-almost-white);
      padding: 8px 20px; border-radius: 999px;
    }
    .elim__safe { margin: 6px 0 0; font-size: 17px; line-height: 1.5; max-width: 34ch; }
    .elim__spectate { margin: 8px 0 0; font-size: 17px; font-weight: 700; }
  `],
})
export class EliminationPanelComponent {
  readonly avatar = input('🙂');
  /** True on the last race of the game, which changes the closing line. */
  readonly finalRace = input(false);
  /** Real count of players still racing, or null when it is not known. */
  readonly aliveCount = input<number | null>(null);
  /** Points earned before this race (tournament total), shown so the loss feels bounded. */
  readonly safePoints = input<number>(0);
  /** False when restored from a snapshot: the card shows, the collapse does not replay. */
  readonly playEffect = input(true);

  readonly collapsing = signal(false);

  constructor() {
    effect(() => {
      if (this.playEffect()) this.collapsing.set(true);
    });
  }
}
