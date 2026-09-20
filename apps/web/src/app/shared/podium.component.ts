/**
 * Podium (plan v2 §5.7 / §5.12) — shared by the phone (small) and the
 * display (large). Reveals third → second → champion as the host steps
 * `podiumStep` / `ceremonyStep`; ties are ONE band per rank, nobody is hidden.
 * Places are told apart by number, height and label — Peach / Light Blue /
 * Lavender are decoration only, never gold/silver/bronze.
 */
import { Component, computed, input } from '@angular/core';
import type { StandingRow } from '@asas/shared';
import { podiumBands, podiumRevealRanks } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';
import { ConfettiComponent } from './confetti.component';

const MAX_FACES = 6;

@Component({
  selector: 'app-podium',
  standalone: true,
  imports: [TranslatePipe, ConfettiComponent],
  template: `
    <app-confetti [active]="celebrate()" />
    <div class="podium" [class.large]="large()">
      @for (b of ordered(); track b.rank) {
        <section class="place rise-in" [class]="'place rise-in p' + b.rank" [attr.data-rank]="b.rank" [style.order]="order(b.rank)">
          <span class="num rank" aria-hidden="true">{{ b.rank }}</span>
          <span class="label">{{ b.rows.length > 1 ? ('display.tiedBand' | t: { rank: b.rank }) : ('podium.place.' + b.rank | t) }}</span>
          <ul class="faces">
            @for (r of b.rows.slice(0, maxFaces); track r.participantId) {
              <li class="face" [class.me]="r.participantId === highlight()">
                <span class="avatar" aria-hidden="true">{{ r.avatar }}</span>
                <bdi class="name">{{ r.name }}</bdi>
              </li>
            }
            @if (b.rows.length > maxFaces) { <li class="face more num">{{ 'display.andMore' | t: { count: b.rows.length - maxFaces } }}</li> }
          </ul>
          <span class="pts num"><bdi>{{ b.rows[0]!.total }}</bdi></span>
        </section>
      } @empty {
        <p class="waiting">{{ 'podium.waiting' | t }}</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .podium { display: flex; align-items: flex-end; justify-content: center; gap: 10px; min-height: 180px; }
    .place {
      display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
      flex: 1 1 0; max-width: 34%; padding: 12px 8px 14px; border-radius: 14px 14px 4px 4px;
      color: var(--elm-navy); border: 3px solid var(--elm-navy);
    }
    .p1 { background: var(--elm-peach); min-height: 170px; }
    .p2 { background: var(--elm-light-blue); min-height: 140px; }
    .p3 { background: var(--elm-lavender); min-height: 120px; }
    .rank { font-size: 28px; font-weight: 900; line-height: 1; }
    .label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .faces { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .face { display: flex; flex-direction: column; align-items: center; gap: 2px; max-width: 100%; }
    .face.me { outline: 3px solid var(--elm-purple); border-radius: 10px; padding: 2px 6px; }
    .avatar { font-size: 32px; line-height: 1; }
    .name { font-weight: 800; font-size: 15px; max-width: 12ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .face.more { font-size: 13px; font-weight: 700; }
    .pts { font-size: 22px; font-weight: 900; }
    .waiting { color: var(--elm-muted-indigo); text-align: center; margin: auto; }

    .large .podium, .large { gap: 24px; min-height: 0; }
    .large .place { max-width: 30%; padding: 24px 18px 28px; border-width: 4px; }
    .large .p1 { min-height: 340px; }
    .large .p2 { min-height: 280px; }
    .large .p3 { min-height: 240px; }
    .large .rank { font-size: 64px; }
    .large .label { font-size: 22px; }
    .large .avatar { font-size: 64px; }
    .large .name { font-size: clamp(22px, 2vw, 34px); max-width: 14ch; }
    .large .pts { font-size: clamp(32px, 3vw, 48px); }
    .large .faces { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 10px 18px; }
  `],
})
export class PodiumComponent {
  readonly rows = input<StandingRow[]>([]);
  /** 0 none, 1 third, 2 + second, 3 + first, 4 table (same as the host stepper). */
  readonly step = input(0);
  readonly highlight = input<string | null>(null);
  readonly large = input(false);
  readonly maxFaces = MAX_FACES;

  readonly bands = computed(() => podiumBands(this.rows(), this.step()));
  /** Champion in the middle, second on the start side, third on the end side. */
  readonly ordered = computed(() => this.bands());
  readonly celebrate = computed(() => podiumRevealRanks(this.rows(), this.step()).includes(1));

  order(rank: number): number {
    return rank === 2 ? 0 : rank === 1 ? 1 : 2;
  }
}
