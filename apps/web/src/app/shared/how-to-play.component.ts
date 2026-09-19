/**
 * Mandatory "How to Play" template shared by phone and display (§4.4, §13.5).
 *
 * Plan §5: one short sentence, three visual steps, a tiny demonstration, and
 * clear readiness feedback. Copy comes from the i18n dictionaries (`howto.*`),
 * never from hard-coded English, so the same component serves both languages.
 * Readiness is informational only — it never starts play (plan §5).
 */
import { Component, computed, input } from '@angular/core';
import type { GameType } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (game(); as g) {
      <section class="htp" [class.large]="large()">
        <span class="badge badge-stage">{{ 'howto.heading' | t }}</span>
        <h1>{{ titleKey() | t }}</h1>
        <p class="headline">{{ headlineKey() | t }}</p>

        <ol class="steps">
          @for (s of stepKeys(); track s) {
            <li class="card"><span class="n num">{{ $index + 1 }}</span><span>{{ s | t }}</span></li>
          }
        </ol>

        <div class="example card-white card" aria-hidden="true">
          @switch (g) {
            @case ('RLGL') {
              <div class="demo-track"><div class="demo-runner"></div><div class="demo-signal"></div></div>
            }
            @case ('GEO') {
              <div class="demo-globe"><div class="demo-pin"></div></div>
            }
            @case ('ORDER') {
              <div class="demo-cards"><div class="c a"></div><div class="c b"></div><div class="c"></div><div class="c"></div></div>
            }
          }
          <p class="small muted">{{ 'howto.demo' | t }} · {{ 'howto.demoNoPoints' | t }}</p>
        </div>

        <p class="scoring"><strong>{{ 'howto.scoring' | t }}:</strong> {{ scoringKey() | t }}</p>
        <p class="small muted">{{ 'howto.waitHost' | t }}</p>
        @if (showReadyNote()) { <p class="small muted">{{ 'howto.readyNote' | t }}</p> }
      </section>
    }
  `,
  styles: [`
    .htp { display: flex; flex-direction: column; gap: 12px; }
    .headline { font-size: 18px; font-weight: 600; }
    .steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .steps li { display: flex; gap: 12px; align-items: center; font-size: 17px; }
    .n { flex: 0 0 36px; height: 36px; border-radius: 50%; background: var(--elm-blue); color: var(--elm-almost-white); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }
    .large .steps { grid-template-columns: repeat(3, 1fr); }
    .large .steps li { font-size: 30px; flex-direction: column; text-align: center; padding: 24px; }
    .large .n { flex-basis: 56px; width: 56px; height: 56px; font-size: 28px; }
    .large .headline { font-size: 32px; }
    .large .scoring { font-size: 28px; }
    /* The demo is a physical illustration: it stays LTR in both languages (plan §1). */
    .example { overflow: hidden; direction: ltr; }
    .example .small { direction: inherit; }
    .demo-track { position: relative; height: 40px; background: var(--elm-dark-indigo); border-radius: 8px; }
    .demo-runner { position: absolute; top: 8px; left: 4px; width: 24px; height: 24px; border-radius: 50%; background: var(--elm-peach); border: 2px solid var(--elm-navy); animation: run 4s infinite; }
    .demo-signal { position: absolute; right: 8px; top: 8px; width: 24px; height: 24px; border-radius: 50%; animation: sig 4s infinite; }
    @keyframes run { 0%,10% { left: 4px; } 50% { left: 55%; } 75% { left: 55%; } 90% { left: 55%; transform: scale(0.4); opacity: .4; } 100% { left: 4px; opacity: 1; transform: none; } }
    @keyframes sig { 0%,50% { background: var(--game-go); } 51%,100% { background: var(--game-stop); } }
    .demo-globe { width: 96px; height: 96px; margin: 0 auto; border-radius: 50%; background: radial-gradient(circle at 35% 35%, var(--elm-cyan), var(--elm-navy)); position: relative; animation: spin 6s linear infinite; }
    .demo-pin { position: absolute; left: 60%; top: 40%; width: 14px; height: 14px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--elm-orange); border: 2px solid var(--elm-navy); }
    @keyframes spin { from { background-position: 0 0; } to { background-position: 60px 0; } }
    .demo-cards { display: grid; gap: 6px; }
    .c { height: 22px; border-radius: 6px; background: var(--elm-pale-blue); border: 1px solid var(--elm-light-blue); }
    .c.a { border: 2px solid var(--elm-purple); animation: swap 3s infinite; }
    .c.b { animation: swap2 3s infinite; }
    @keyframes swap { 0%,30% { transform: none; } 60%,100% { transform: translateY(28px); } }
    @keyframes swap2 { 0%,30% { transform: none; } 60%,100% { transform: translateY(-28px); } }
  `],
})
export class HowToPlayComponent {
  readonly game = input<GameType | null>(null);
  readonly large = input(false);
  /** Phones show the "ready does not start the game" reassurance; the display does not. */
  readonly showReadyNote = input(false);

  readonly titleKey = computed<StringKey>(() => `game.${this.game() ?? 'RLGL'}` as StringKey);
  readonly headlineKey = computed<StringKey>(() => `howto.${this.game() ?? 'RLGL'}.headline` as StringKey);
  readonly scoringKey = computed<StringKey>(() => `howto.${this.game() ?? 'RLGL'}.scoring` as StringKey);
  readonly stepKeys = computed<StringKey[]>(() => {
    const g = this.game() ?? 'RLGL';
    return [1, 2, 3].map((n) => `howto.${g}.step${n}` as StringKey);
  });
}
