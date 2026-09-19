/** Server-synchronised countdown; displays only, never advances stages (§4.5). */
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RealtimeService } from '../core/realtime.service';

@Component({
  selector: 'app-timer',
  standalone: true,
  template: `<span class="timer num" [class.urgent]="seconds() <= 5" [attr.aria-label]="seconds() + ' seconds remaining'">{{ label() }}</span>`,
  styles: [`
    :host { display: inline-block; }
    .urgent { color: var(--elm-orange); }
  `],
})
export class TimerComponent {
  /** Absolute server timestamp (ms) when the timer ends; null hides/holds. */
  readonly endsAt = input<number | null>(null);
  /** Frozen remaining ms while paused. */
  readonly frozenMs = input<number | null>(null);
  readonly seconds = signal(0);
  readonly label = signal('--');
  private readonly rt = inject(RealtimeService);

  constructor() {
    const destroy = inject(DestroyRef);
    const id = setInterval(() => this.tick(), 100);
    destroy.onDestroy(() => clearInterval(id));
    effect(() => { this.endsAt(); this.frozenMs(); this.tick(); });
  }

  private tick(): void {
    const frozen = this.frozenMs();
    const end = this.endsAt();
    let ms: number | null = null;
    if (frozen !== null && frozen !== undefined) ms = frozen;
    else if (end !== null && end !== undefined) ms = end - this.rt.now();
    if (ms === null) { this.label.set('--'); this.seconds.set(0); return; }
    const s = Math.max(0, Math.ceil(ms / 1000));
    this.seconds.set(s);
    this.label.set(s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`);
  }
}
