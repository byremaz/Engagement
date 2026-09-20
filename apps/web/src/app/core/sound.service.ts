/**
 * Event sound design for the shared display (plan v2 §3.2).
 *
 * One cue per game moment, played from the display machine only (phones stay
 * silent — vibration is their channel, §14). Cues are synthesised with
 * WebAudio so the venue needs no binary assets; when a licensed file exists at
 * `sounds/<cue>.mp3` it is used instead (the service tolerates both).
 *
 * `reducedEffects` (auto-enabled by `prefers-reduced-motion`) keeps only the
 * cues that carry meaning (countdown, go, stop, elimination, reveal) and drops
 * the celebratory ones.
 */
import { Injectable, signal } from '@angular/core';

export type SoundCue =
  | 'test'
  | 'countdownTick'
  | 'start'
  | 'go'
  | 'stop'
  | 'elimination'
  | 'eliminationBurst'
  | 'finish'
  | 'reveal'
  | 'podium'
  | 'fanfare';

type Note = [freq: number, durationSec: number];

interface Synth {
  notes: Note[];
  type?: OscillatorType;
  /** Relative loudness 0-1 (fanfares are louder than ticks). */
  level?: number;
}

const SYNTH: Record<SoundCue, Synth> = {
  test: { notes: [[660, 0.12], [880, 0.18]] },
  countdownTick: { notes: [[880, 0.09]], level: 0.7 },
  start: { notes: [[660, 0.1], [880, 0.1], [1175, 0.3]] },
  go: { notes: [[523, 0.1], [784, 0.25]] },
  stop: { notes: [[330, 0.22], [262, 0.12]], type: 'square', level: 0.6 },
  elimination: { notes: [[220, 0.12], [150, 0.28]], type: 'sawtooth' },
  eliminationBurst: { notes: [[196, 0.16], [131, 0.4]], type: 'sawtooth', level: 1 },
  finish: { notes: [[784, 0.12], [1047, 0.3]] },
  reveal: { notes: [[523, 0.1], [659, 0.1], [784, 0.3]] },
  podium: { notes: [[523, 0.15], [659, 0.15], [784, 0.4]] },
  fanfare: { notes: [[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.6]], level: 1 },
};

/** Cues that still play under "reduced effects". */
const ESSENTIAL: ReadonlySet<SoundCue> = new Set(['test', 'countdownTick', 'start', 'go', 'stop', 'elimination', 'eliminationBurst', 'reveal']);

@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<SoundCue, AudioBuffer | null>();
  readonly ready = signal(false);
  readonly muted = signal(false);
  readonly volume = signal(0.7);
  readonly reducedEffects = signal(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** Must be called from a user gesture on the display computer. */
  async init(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.ready.set(true);
  }

  setMuted(m: boolean): void { this.muted.set(m); }
  setVolume(v: number): void { this.volume.set(Math.min(1, Math.max(0, v))); }
  setReducedEffects(v: boolean): void { this.reducedEffects.set(v); }

  play(cue: SoundCue): void {
    if (!this.ctx || !this.ready() || this.muted()) return;
    if (this.reducedEffects() && !ESSENTIAL.has(cue)) return;
    void this.file(cue).then((buf) => (buf ? this.playBuffer(buf, SYNTH[cue].level ?? 0.85) : this.synth(SYNTH[cue])));
  }

  /** A licensed asset at sounds/<cue>.mp3 takes precedence; a miss is cached so it is asked once. */
  private async file(cue: SoundCue): Promise<AudioBuffer | null> {
    if (this.buffers.has(cue)) return this.buffers.get(cue) ?? null;
    this.buffers.set(cue, null);
    try {
      const res = await fetch(`sounds/${cue}.mp3`, { cache: 'force-cache' });
      if (!res.ok || !res.headers.get('content-type')?.startsWith('audio')) return null;
      const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(cue, buf);
      return buf;
    } catch {
      return null;
    }
  }

  private playBuffer(buf: AudioBuffer, level: number): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    gain.gain.value = this.volume() * level;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  private synth(s: Synth): void {
    if (!this.ctx) return;
    let t = this.ctx.currentTime;
    const peak = this.volume() * 0.4 * (s.level ?? 0.85);
    for (const [freq, dur] of s.notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = s.type ?? 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  }
}
