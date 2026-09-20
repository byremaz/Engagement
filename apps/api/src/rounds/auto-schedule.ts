/**
 * Auto signal schedule for Red Light, Green Light (spec §6.7).
 * Server-generated, seeded per attempt so a replay is reproducible in logs.
 * Guarantees at least RLGL_AUTO_MIN_GREEN_MS of total green over a full race.
 */
import type { RaceContent } from '@asas/shared';
import { RLGL_AUTO_MIN_GREEN_FRACTION, RLGL_AUTO_MIN_GREEN_MS } from '@asas/shared';

export interface ScheduledSignal {
  color: 'RED' | 'GREEN';
  /** Offset in ms from race start (or from resume when regenerated). */
  atMs: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

function pick(r: () => number, [lo, hi]: [number, number]): number {
  return Math.round(lo + r() * (hi - lo));
}

/** Builds alternating GREEN/RED segments covering `totalMs`, starting with GREEN. */
export function buildAutoSchedule(content: RaceContent, totalMs: number, seed: number): ScheduledSignal[] {
  const minGreen = Math.min(RLGL_AUTO_MIN_GREEN_MS, Math.floor(totalMs * RLGL_AUTO_MIN_GREEN_FRACTION));
  for (let attempt = 0; attempt < 32; attempt++) {
    const r = rng(seed + attempt * 7919);
    const out: ScheduledSignal[] = [];
    let t = 0;
    let green = 0;
    let color: 'GREEN' | 'RED' = 'GREEN';
    let lastWasFakeout = false;
    while (t < totalMs) {
      out.push({ color, atMs: t });
      let len: number;
      if (color === 'GREEN') {
        // Fake-out: a GREEN so short that anyone who presses on reflex is still
        // holding when the RED lands (owner request: people must actually fall).
        // Never two in a row, so the race stays winnable.
        const fake: boolean = !lastWasFakeout && !!content.autoFakeoutChance && !!content.autoFakeoutGreenMs && r() < content.autoFakeoutChance;
        len = pick(r, fake ? content.autoFakeoutGreenMs! : content.autoGreenMs);
        lastWasFakeout = fake;
      } else {
        len = pick(r, content.autoRedMs);
      }
      if (color === 'GREEN') green += Math.min(len, totalMs - t);
      t += len;
      color = color === 'GREEN' ? 'RED' : 'GREEN';
    }
    if (green >= minGreen) return out;
  }
  // Deterministic fallback: long green blocks separated by short reds.
  const out: ScheduledSignal[] = [];
  for (let t = 0; t < totalMs; t += content.autoGreenMs[1] + content.autoRedMs[0]) {
    out.push({ color: 'GREEN', atMs: t });
    out.push({ color: 'RED', atMs: t + content.autoGreenMs[1] });
  }
  return out;
}
