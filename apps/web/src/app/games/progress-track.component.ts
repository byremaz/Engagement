/**
 * Personal race track for the phone (plan v2 §5.1). Physically LTR in both
 * languages; the runner is clamped inside the container so it is never
 * clipped at 0 % or 100 %, and the finish flag marks the goal.
 */
import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-progress-track',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="track ltr-geometry" [class.done]="done()" aria-hidden="true">
      <div class="fill" [style.width.%]="pct()"></div>
      <div class="runner" [class.collapsed]="out()" [style.inset-inline-start]="pos()">{{ avatar() }}</div>
      <span class="flag">🏁</span>
    </div>
    <p class="pct num" role="status">{{ 'race.progress' | t: { n: rounded() } }}</p>
  `,
  styles: [`
    :host { display: block; }
    .track {
      --runner: 44px;
      position: relative; height: 56px; border-radius: 14px; overflow: hidden;
      background: var(--elm-dark-indigo); border: 3px solid var(--elm-navy);
    }
    .fill { position: absolute; inset-block: 0; inset-inline-start: 0; background: var(--elm-royal-blue); transition: width 150ms linear; }
    .done .fill { background: var(--game-go); }
    .runner {
      position: absolute; inset-block-start: 50%; width: var(--runner); height: var(--runner);
      margin-inline-start: calc(var(--runner) / -2); transform: translateY(-50%);
      border-radius: 50%; background: var(--elm-peach); border: 3px solid var(--elm-navy);
      display: flex; align-items: center; justify-content: center; font-size: 24px;
      transition: inset-inline-start 150ms linear;
    }
    .runner.collapsed { filter: grayscale(1); opacity: .5; transform: translateY(-50%) scale(.7); }
    .flag { position: absolute; inset-inline-end: 8px; inset-block-start: 50%; transform: translateY(-50%); font-size: 24px; }
    .pct { text-align: center; margin: 6px 0 0; font-weight: 700; color: var(--elm-navy); }
    @media (prefers-reduced-motion: reduce) { .fill, .runner { transition: none; } }
  `],
})
export class ProgressTrackComponent {
  readonly progress = input(0);
  readonly avatar = input('🙂');
  readonly done = input(false);
  readonly out = input(false);

  readonly pct = computed(() => Math.min(100, Math.max(0, this.progress())));
  readonly rounded = computed(() => Math.round(this.pct()));
  readonly pos = computed(() => `calc(var(--runner) / 2 + (100% - var(--runner)) * ${this.pct() / 100})`);
}
