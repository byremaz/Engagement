/**
 * Controlled celebration confetti (plan v2 §3.2): Peach / Lavender / Light
 * Blue only — never gold, silver or bronze. Purely decorative, disabled under
 * `prefers-reduced-motion`, and it never blocks or advances anything.
 */
import { Component, computed, input } from '@angular/core';

const COLOURS = ['var(--elm-peach)', 'var(--elm-lavender)', 'var(--elm-light-blue)', 'var(--elm-cyan)'];

@Component({
  selector: 'app-confetti',
  standalone: true,
  template: `
    @if (active()) {
      <div class="confetti" aria-hidden="true">
        @for (p of pieces(); track p.i) {
          <span class="piece" [style.left.%]="p.x" [style.background]="p.c" [style.animation-delay.ms]="p.d" [style.animation-duration.ms]="p.t" [style.width.px]="p.w" [style.height.px]="p.h"></span>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .confetti { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 20; }
    .piece { position: absolute; top: -20px; border-radius: 2px; opacity: .9; animation: confetti-fall linear forwards; }
    @media (prefers-reduced-motion: reduce) { .confetti { display: none; } }
  `],
})
export class ConfettiComponent {
  readonly active = input(false);
  readonly count = input(80);

  readonly pieces = computed(() => {
    const n = this.count();
    const out: { i: number; x: number; c: string; d: number; t: number; w: number; h: number }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ i, x: (i * 37) % 100, c: COLOURS[i % COLOURS.length]!, d: (i * 53) % 900, t: 2200 + ((i * 97) % 1400), w: 6 + (i % 3) * 3, h: 10 + (i % 4) * 3 });
    }
    return out;
  });
}
