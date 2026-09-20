/**
 * Red Light, Green Light phone pad (§6.3, §14; plan §3).
 *
 * Hold lifecycle is unchanged and deliberate: a 250 ms heartbeat while held,
 * and a release on pointer up / cancel / leave, `window:blur` and
 * `visibilitychange`.
 *
 * Plan §3 adds two things:
 *  1. The LABEL matches the correct action. On RED it reads "DO NOT PRESS" and
 *     never "HOLD TO MOVE" — but the pad stays ENABLED and keeps emitting
 *     input, so a press on red is still reported and the server can still
 *     eliminate. This is a visual change only; removing red input would delete
 *     the core mechanic.
 *  2. Release also fires on locale change, resize/orientation change and when
 *     an overlay opens, so no stuck hold or unintended move command survives
 *     those events.
 *
 * Every string comes from the i18n layer; nothing here is hard-coded English.
 */
import { Component, DestroyRef, HostListener, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { SignalColor } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-hold-button',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <button
      type="button"
      class="hold no-select"
      [class.holding]="holding()"
      [class.hold--red]="color() === 'RED'"
      [disabled]="!enabled()"
      (pointerdown)="down($event)"
      (pointerup)="up()"
      (pointercancel)="up()"
      (pointerleave)="up()"
      (contextmenu)="$event.preventDefault()"
      (keydown.space)="keyDown($event)"
      (keyup.space)="up()"
      [attr.aria-pressed]="holding()"
      [attr.aria-label]="label() | t"
    >
      <span class="label">{{ label() | t }}</span>
    </button>
  `,
  styles: [`
    .hold {
      width: 100%; min-height: 200px; border-radius: 24px; border: 4px solid var(--elm-navy);
      background: var(--elm-blue); color: var(--elm-almost-white); font: inherit; font-weight: 800;
      font-size: clamp(24px, 7vw, 30px);
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 8px 0 var(--elm-royal-blue);
      touch-action: none;
    }
    .hold.holding { background: var(--elm-royal-blue); transform: translateY(6px); box-shadow: 0 2px 0 var(--elm-navy); }
    /*
      On RED the pad becomes a dark, "switched-off" STOP surface (plan v2 §5.2):
      never a blue invitation. It is still a live, pressable control that
      reports input, because the server owns the elimination rule.
    */
    .hold--red {
      background: var(--elm-dark-indigo); color: var(--elm-almost-white);
      border-color: var(--game-stop); box-shadow: 0 8px 0 var(--game-stop);
      background-image: repeating-linear-gradient(135deg, transparent 0 14px, rgba(161, 43, 42, .28) 14px 28px);
    }
    .hold--red.holding { background-color: var(--game-stop); animation: pulse-soft 500ms ease-in-out infinite; }
    .hold:disabled { background: #d5d9e6; color: #5b6078; border-color: #aeb4c9; box-shadow: none; cursor: not-allowed; }
    .hold:focus-visible { outline: 4px solid var(--elm-peach); outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) {
      .hold, .hold.holding { transition: none; transform: none; }
    }
  `],
})
export class HoldButtonComponent {
  readonly color = input<SignalColor>('RED');
  readonly enabled = input(false);
  /** Set by the parent when a modal/overlay opens, which must release the hold. */
  readonly overlayOpen = input(false);
  readonly hold = output<boolean>();

  readonly holding = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly locale = inject(LocaleService);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());

    // Each effect below releases the hold in reaction to ONE signal. The release
    // itself runs `untracked`: `up()` reads `holding`, and a tracked read would
    // re-run the effect on every press and release it again immediately — the
    // "I hold but barely move" bug (progress stalled at a few percent).

    // A language switch re-renders the pad under the player's thumb; release so
    // the hold is deliberate afterwards rather than carried across the change.
    effect(() => { this.locale.lang(); untracked(() => this.up()); });

    // An overlay covering the pad must not leave a move command running.
    effect(() => { if (this.overlayOpen()) untracked(() => this.up()); });

    // Losing eligibility (death, pause, lock) always ends the hold.
    effect(() => { if (!this.enabled()) untracked(() => this.up()); });
  }

  /** The label always names the CORRECT action for the current signal. */
  label(): string {
    if (!this.enabled()) return 'race.pad.waiting';
    if (this.color() === 'RED') return 'race.pad.stop';
    return this.holding() ? 'race.pad.moving' : 'race.pad.hold';
  }

  down(ev: Event): void {
    ev.preventDefault();
    if (!this.enabled() || this.holding()) return;
    this.holding.set(true);
    // Emitted on RED too: the server owns the elimination rule, not the client.
    this.hold.emit(true);
    this.timer = setInterval(() => { if (this.enabled()) this.hold.emit(true); else this.up(); }, 250);
  }

  keyDown(ev: Event): void {
    if (this.holding()) { ev.preventDefault(); return; }
    this.down(ev);
  }

  up(): void {
    if (!this.holding()) return;
    this.stop();
    this.hold.emit(false);
  }

  @HostListener('window:blur') onBlur(): void { this.up(); }
  @HostListener('document:visibilitychange') onVis(): void { if (document.hidden) this.up(); }
  // Rotating the phone or a viewport resize re-lays out the pad under the thumb.
  @HostListener('window:resize') onResize(): void { this.up(); }
  @HostListener('window:orientationchange') onOrientation(): void { this.up(); }

  private stop(): void {
    this.holding.set(false);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
