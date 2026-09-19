/**
 * Discreet display setup overlay (plan §4).
 *
 * Audio and fullscreen chrome used to be permanently visible on the shared
 * screen. It now lives behind a small trigger that is hidden during the show
 * and reachable when needed (pointer move / keyboard focus re-reveals it).
 *
 * Purely presentational: it emits intent and never touches the stage machine.
 */
import { Component, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-setup-overlay',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <!-- Trigger: fades away during presentation, returns on hover/focus. -->
    <button
      type="button"
      class="trigger"
      [class.idle]="!open() && idle()"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'display.setup.open' | t"
      (click)="open.set(true)"
    >⚙</button>

    @if (open()) {
      <div class="scrim" (click)="open.set(false)"></div>
      <section class="panel" role="dialog" aria-modal="true" [attr.aria-label]="'display.setup' | t">
        <header class="panel-head">
          <h2>{{ 'display.setup' | t }}</h2>
          <button type="button" class="btn btn-secondary" (click)="open.set(false)">
            {{ 'display.setup.close' | t }}
          </button>
        </header>

        <div class="field">
          <span class="label">{{ 'display.setup.sound' | t }}</span>
          <button type="button" class="btn" [class.btn-secondary]="muted()" (click)="toggleMute.emit()">
            {{ (muted() ? 'common.off' : 'common.on') | t }}
          </button>
        </div>

        <div class="field">
          <label class="label" for="vol">{{ 'display.setup.volume' | t }}</label>
          <input
            id="vol"
            type="range"
            min="0"
            max="100"
            step="5"
            [value]="volume()"
            (input)="onVolume($event)"
          />
          <span class="num val">{{ volume() }}</span>
        </div>

        <div class="field">
          <span class="label">{{ 'display.setup.fullscreen' | t }}</span>
          <button type="button" class="btn btn-secondary" (click)="toggleFullscreen.emit()">
            {{ (fullscreen() ? 'display.setup.exitFullscreen' : 'display.setup.fullscreen') | t }}
          </button>
        </div>

        <p class="note">{{ 'display.setup.note' | t }}</p>
      </section>
    }
  `,
  styles: [`
    :host { position: fixed; inset-block-start: 0; inset-inline-end: 0; z-index: 40; }

    .trigger {
      position: fixed;
      inset-block-start: 12px;
      inset-inline-end: 12px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid var(--elm-muted-indigo);
      background: rgba(5, 29, 73, 0.65);
      color: var(--elm-light-blue);
      font-size: 1.2rem;
      cursor: pointer;
      opacity: 0.55;
      transition: opacity 180ms ease;
    }
    .trigger:hover, .trigger:focus-visible { opacity: 1; }
    /* Hidden (but focusable) while the room is watching the show. */
    .trigger.idle { opacity: 0; }
    .trigger.idle:focus-visible { opacity: 1; }

    .scrim { position: fixed; inset: 0; background: rgba(5, 29, 73, 0.6); }
    .panel {
      position: fixed;
      inset-block-start: 16px;
      inset-inline-end: 16px;
      width: min(360px, calc(100vw - 32px));
      padding: var(--sp-5, 20px);
      border-radius: 16px;
      background: var(--elm-navy);
      border: 1px solid var(--elm-muted-indigo);
      box-shadow: var(--elev-3, 0 12px 32px rgba(0, 0, 0, 0.45));
      color: var(--elm-almost-white);
      display: flex;
      flex-direction: column;
      gap: var(--sp-4, 16px);
    }
    .panel-head { display: flex; align-items: center; gap: var(--sp-3, 12px); }
    .panel-head h2 { margin: 0; flex: 1; font-size: 1.15rem; }

    .field { display: flex; align-items: center; gap: var(--sp-3, 12px); }
    .label { flex: 1; font-size: 0.95rem; color: var(--elm-light-blue); }
    .val { font-variant-numeric: tabular-nums; min-width: 3ch; text-align: end; }
    input[type='range'] { flex: 2; accent-color: var(--elm-cyan); }
    .note { margin: 0; font-size: 0.85rem; color: var(--elm-light-blue); }
  `],
})
export class SetupOverlayComponent {
  readonly muted = input(false);
  readonly volume = input(70);
  readonly fullscreen = input(false);
  /** True while the show is running, so the trigger fades out of the frame. */
  readonly idle = input(true);

  readonly toggleMute = output<void>();
  readonly toggleFullscreen = output<void>();
  readonly volumeChange = output<number>();

  readonly open = signal(false);

  onVolume(ev: Event): void {
    const raw = Number((ev.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) this.volumeChange.emit(Math.min(100, Math.max(0, raw)));
  }
}
