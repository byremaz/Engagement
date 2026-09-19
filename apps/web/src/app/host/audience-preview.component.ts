/**
 * A small, non-interactive render of what the room currently sees.
 *
 * It is deliberately read-only: the host uses it to confirm the big screen and
 * the phones are showing the expected thing before pressing the primary action.
 * It never issues commands and never reveals a solution the snapshot has not
 * already published (`reveal` is only populated in reveal/result states by the
 * API) [secure-coding].
 */
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { SessionSnapshot } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';

@Component({
  selector: 'app-audience-preview',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="preview" aria-live="polite">
      <h3 class="preview__label small muted">{{ 'host.audiencePreview' | t }}</h3>

      @if (snap(); as s) {
        <div class="preview__screen" [class.preview__screen--paused]="s.paused">
          @if (s.paused) {
            <!-- PAUSED is the dominant instruction; the previous signal is context only. -->
            <p class="preview__headline">{{ 'signal.paused.title' | t }}</p>
            @if (s.race; as r) {
              <p class="preview__sub small">{{ 'signal.paused.wasBefore' | t: { signal: signalLabel(r.signal) } }}</p>
            }
          } @else {
            <p class="preview__headline">{{ headline() }}</p>
            @if (subLine(); as sub) { <p class="preview__sub small">{{ sub }}</p> }
          }
        </div>

        <p class="preview__meta small muted">
          <span>{{ 'state.' + s.state | t }}</span>
          @if (s.gameType; as g) { <span aria-hidden="true">·</span> <span>{{ 'game.' + g + '.short' | t }}</span> }
          @if (s.roundPublic && !s.isPractice) {
            <span aria-hidden="true">·</span>
            <bdi class="num">{{ s.roundNumber }}/{{ s.roundCount }}</bdi>
          }
          @if (s.isPractice) { <span aria-hidden="true">·</span> <span>{{ 'state.Practice' | t }}</span> }
        </p>
      } @else {
        <p class="preview__screen muted">{{ 'common.loading' | t }}</p>
      }
    </section>
  `,
  styles: [
    `
      .preview {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        min-inline-size: 0;
      }
      .preview__label {
        margin: 0;
        font-size: var(--fs-xs, 0.75rem);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      /* 16:9 stand-in for the shared screen so the host reads it as "the room". */
      .preview__screen {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
        justify-content: center;
        align-items: center;
        text-align: center;
        aspect-ratio: 16 / 9;
        max-block-size: 168px;
        padding: var(--space-3, 12px);
        border-radius: var(--radius-md, 10px);
        background: var(--elm-navy);
        color: #fff;
        overflow: hidden;
      }
      .preview__screen--paused {
        background: var(--elm-deep-purple, #5a2c83);
      }
      .preview__headline {
        margin: 0;
        font-size: var(--fs-lg, 1.125rem);
        font-weight: 700;
        line-height: 1.2;
        /* Long country names / prompts must not leave the frame. */
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .preview__sub {
        margin: 0;
        opacity: 0.85;
      }
      .preview__meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1, 4px);
        margin: 0;
      }
    `,
  ],
})
export class AudiencePreviewComponent {
  private readonly locale = inject(LocaleService);

  readonly snap = input<SessionSnapshot | null>(null);

  private tr(key: string, params?: Record<string, string | number>): string {
    return this.locale.t(key as StringKey, params);
  }

  signalLabel(signal: 'RED' | 'GREEN'): string {
    return this.tr(signal === 'GREEN' ? 'signal.green' : 'signal.red');
  }

  /** The one dominant line the room is currently reading. */
  readonly headline = computed(() => {
    const s = this.snap();
    if (!s) return '';
    switch (s.state) {
      case 'Lobby':
        return this.tr('display.joinPrompt');
      case 'Instructions':
        return s.gameType ? this.tr(`game.${s.gameType}`) : this.tr('state.Instructions');
      case 'Practice':
      case 'Ready':
        return this.tr('state.Ready');
      case 'Countdown':
        return this.tr('play.startsIn');
      case 'RoundActive':
        return this.activeHeadline(s);
      case 'InputLocked':
        return this.tr('play.roundClosed');
      case 'Reveal':
        return this.revealHeadline(s);
      case 'GameResults':
        return this.tr('display.currentGame');
      case 'TournamentResults':
        return this.tr('display.finalStandings');
      case 'Closed':
        return this.tr('play.sessionEnded');
      default:
        return this.tr(`state.${s.state}`);
    }
  });

  /** Secondary context — counts and progress, never an answer. */
  readonly subLine = computed(() => {
    const s = this.snap();
    if (!s) return '';
    switch (s.state) {
      case 'Lobby':
        return this.tr('display.joined', { count: s.participantCount });
      case 'Instructions':
      case 'Practice':
        return this.tr('host.readyCount', { ready: s.readyCount, total: s.participantCount });
      case 'RoundActive':
      case 'InputLocked':
        return `${this.tr('host.answerCount')} ${s.responseCount}/${s.participantCount}`;
      case 'Reveal':
        return this.tr('wait.next.nextRound');
      case 'TournamentResults':
        return `${this.tr('host.ceremony.step')} ${s.ceremonyStep}`;
      default:
        return '';
    }
  });

  private activeHeadline(s: SessionSnapshot): string {
    const rp = s.roundPublic;
    if (!rp) return this.tr('state.RoundActive');
    const ar = this.locale.lang() === 'ar';
    if (rp.type === 'RLGL') {
      const sig = s.race?.signal ?? 'RED';
      return this.tr(sig === 'GREEN' ? 'signal.green.go' : 'signal.red.stop');
    }
    if (rp.type === 'GEO') return ar ? rp.countryNameAr : rp.countryName;
    return ar ? rp.promptAr : rp.prompt;
  }

  private revealHeadline(s: SessionSnapshot): string {
    const rv = s.reveal;
    if (!rv) return this.tr('state.Reveal');
    const ar = this.locale.lang() === 'ar';
    if (rv.type === 'GEO') return ar ? rv.countryNameAr : rv.countryName;
    if (rv.type === 'ORDER') return ar ? rv.explanationAr : rv.explanation;
    return this.tr('state.Reveal');
  }
}
