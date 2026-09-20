/**
 * Always-visible personal status chip for the race (plan v2 §5.1):
 * ALIVE / OUT / FINISHED / WAITING / PAUSED — colour + word + icon, so the
 * player never has to infer their own state from the arena.
 */
import { Component, computed, input } from '@angular/core';
import type { MyLife, SessionState } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

type Chip = 'alive' | 'out' | 'finished' | 'waiting' | 'paused' | 'playing' | 'locked';

const ICON: Record<Chip, string> = { alive: '●', out: '✕', finished: '🏁', waiting: '…', paused: '⏸', playing: '●', locked: '✓' };

@Component({
  selector: 'app-race-chip',
  standalone: true,
  imports: [TranslatePipe],
  template: `<span class="chip-status" [class]="'chip-status chip-status--' + chip()" role="status"><span aria-hidden="true">{{ icon() }}</span> {{ 'status.' + chip() | t }}</span>`,
})
export class RaceChipComponent {
  readonly life = input<MyLife>('unknown');
  readonly state = input<SessionState | null>(null);
  readonly paused = input(false);
  readonly gameType = input<string | null>(null);
  readonly locked = input(false);

  readonly chip = computed<Chip>(() => {
    const st = this.state();
    if (this.paused()) return 'paused';
    const live = st === 'RoundActive' || st === 'Countdown';
    if (this.gameType() === 'RLGL') {
      const life = this.life();
      if (life === 'eliminated') return 'out';
      if (life === 'finished') return 'finished';
      if (live && life === 'alive') return 'alive';
      return 'waiting';
    }
    if (live) return this.locked() ? 'locked' : 'playing';
    return 'waiting';
  });

  readonly icon = computed(() => ICON[this.chip()]);
}
