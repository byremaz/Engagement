/**
 * Display-machine audio (AC-25): initialised by a local click, testable,
 * mutable, volume-adjustable. Synthesised with WebAudio so no binary assets
 * are needed. Phones never use this service (§14: phone sound off).
 */
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DisplayAudioService {
  private ctx: AudioContext | null = null;
  readonly ready = signal(false);
  readonly muted = signal(false);
  readonly volume = signal(0.7);

  /** Must be called from a user gesture on the display computer. */
  async init(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.ready.set(true);
  }

  setMuted(m: boolean): void { this.muted.set(m); }
  setVolume(v: number): void { this.volume.set(Math.min(1, Math.max(0, v))); }

  test(): void { this.beep([[660, 0.12], [880, 0.18]]); }
  countdownTick(): void { this.beep([[880, 0.08]]); }
  go(): void { this.beep([[523, 0.1], [784, 0.25]]); }
  red(): void { this.beep([[330, 0.15]]); }
  /** One short elimination sound per event, regardless of how many players fell. */
  elimination(): void { this.beep([[220, 0.12], [150, 0.28]], 'sawtooth'); }
  reveal(): void { this.beep([[523, 0.1], [659, 0.1], [784, 0.3]]); }
  fanfare(): void { this.beep([[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.45]]); }

  private beep(notes: [number, number][], type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.ready() || this.muted()) return;
    let t = this.ctx.currentTime;
    for (const [freq, dur] of notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(this.volume() * 0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  }
}
