/**
 * The player's own view of a game's podium (plan v2 §5.7): the top three as
 * the host reveals them, then ALWAYS the player's own rank in the game, the
 * tournament position, and what comes next — even outside the top three.
 */
import { Component, computed, inject, input } from '@angular/core';
import type { GameType, StandingRow } from '@asas/shared';
import { GAME_ORDER, TOURNAMENT_MAX, gameTitle } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import { PodiumComponent } from '../shared/podium.component';

@Component({
  selector: 'app-personal-podium',
  standalone: true,
  imports: [TranslatePipe, PodiumComponent],
  template: `
    <section class="card stack">
      <h2 class="title"><bdi>{{ 'podium.game' | t: { game: gameName() } }}</bdi></h2>
      <app-podium [rows]="rows()" [step]="step()" [highlight]="me()" />
      @if (mine(); as m) {
        <div class="card-white card you rise-in">
          <p class="line num"><strong>{{ 'podium.you' | t: { rank: m.rank, pts: m.total } }}</strong></p>
          @if (tournamentMine(); as tm) {
            <p class="line num">{{ 'podium.youTournament' | t: { rank: tm.rank, pts: tm.total, max: max } }}</p>
          }
          @if (nextGame(); as ng) { <p class="line next">{{ 'wait.next' | t: { next: ng } }}</p> }
        </div>
      }
    </section>
  `,
  styles: [`
    .title { text-align: center; margin: 0; }
    .you { text-align: center; }
    .line { margin: 0 0 4px; }
    .next { color: var(--elm-blue); font-weight: 600; }
  `],
})
export class PersonalPodiumComponent {
  private readonly locale = inject(LocaleService);
  readonly rows = input<StandingRow[]>([]);
  readonly tournamentRows = input<StandingRow[] | null>(null);
  readonly step = input(0);
  readonly me = input<string | null>(null);
  readonly game = input<GameType | null>(null);
  readonly gameIndex = input(0);
  readonly max = TOURNAMENT_MAX;

  readonly gameName = computed(() => (this.game() ? gameTitle(this.game()!, this.locale.lang()) : ''));
  readonly mine = computed(() => this.rows().find((r) => r.participantId === this.me()) ?? null);
  readonly tournamentMine = computed(() => this.tournamentRows()?.find((r) => r.participantId === this.me()) ?? null);
  readonly nextGame = computed(() => {
    this.locale.lang();
    const next = GAME_ORDER[this.gameIndex() + 1];
    return next ? gameTitle(next, this.locale.lang()) : this.locale.t('wait.title.TournamentResults');
  });
}
