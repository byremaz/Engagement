/**
 * Renders the current `DialogService` request as a modal: title, consequence,
 * optional required input, cancel / confirm. Focus is trapped inside, Escape
 * cancels, and the destructive button is burgundy so it never looks like the
 * primary progression action (plan v2 §5.14).
 */
import { Component, ElementRef, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';
import { DialogService } from './dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (dlg.current(); as d) {
      <div class="scrim" (click)="dlg.close(null)"></div>
      <section class="dialog" role="dialog" aria-modal="true" [attr.aria-labelledby]="'dlg-title'">
        <h2 id="dlg-title" class="title">{{ d.titleKey | t: d.params }}</h2>
        @if (d.bodyKey) { <p class="body">{{ d.bodyKey | t: d.params }}</p> }
        @if (d.input; as inp) {
          <label class="label" for="dlg-input">{{ inp.labelKey | t }}</label>
          <input
            #field
            id="dlg-input"
            class="input"
            [value]="text()"
            [attr.maxlength]="inp.maxLength ?? 200"
            (input)="text.set($any($event.target).value)"
            (keydown.enter)="submit()"
          />
        }
        <div class="actions">
          <button #cancel type="button" class="btn btn-secondary" (click)="dlg.close(null)">{{ (d.cancelKey ?? 'common.cancel') | t }}</button>
          <button type="button" class="btn" [class.btn-danger]="d.danger" [class.btn-primary]="!d.danger" [disabled]="!canSubmit()" (click)="submit()">
            {{ (d.confirmKey ?? 'common.confirm') | t }}
          </button>
        </div>
      </section>
    }
  `,
  styles: [`
    .scrim { position: fixed; inset: 0; background: rgba(5, 29, 73, 0.55); z-index: 90; }
    .dialog {
      position: fixed; inset-block-start: 50%; inset-inline-start: 50%; transform: translate(-50%, -50%);
      z-index: 91; inline-size: min(460px, calc(100vw - 32px));
      background: var(--elm-almost-white); color: var(--elm-navy);
      border-radius: var(--radius-card); padding: var(--space-5);
      box-shadow: var(--elev-overlay); display: flex; flex-direction: column; gap: var(--space-3);
    }
    :host-context([dir="rtl"]) .dialog { transform: translate(50%, -50%); }
    .title { margin: 0; font-size: var(--fs-2); }
    .body { margin: 0; color: var(--elm-muted-indigo); }
    .label { margin: 0; }
    .actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-block-start: var(--space-2); }
  `],
})
export class ConfirmDialogComponent {
  readonly dlg = inject(DialogService);
  readonly text = signal('');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly cancel = viewChild<ElementRef<HTMLButtonElement>>('cancel');

  readonly canSubmit = computed(() => {
    const d = this.dlg.current();
    if (!d?.input) return true;
    return this.text().trim().length >= (d.input.minLength ?? 1);
  });

  constructor() {
    effect(() => {
      const d = this.dlg.current();
      this.text.set(d?.input?.initial ?? '');
      // Move focus into the dialog once it renders.
      setTimeout(() => (this.field()?.nativeElement ?? this.cancel()?.nativeElement)?.focus(), 0);
    });
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.dlg.close(this.text().trim());
  }

  @HostListener('document:keydown.escape') onEsc(): void {
    if (this.dlg.current()) this.dlg.close(null);
  }
}
