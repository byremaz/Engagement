/**
 * Order It! four vertical cards (§8.2, §13.5, plan §5).
 *
 * The list is a physical, top-to-bottom sequence, so it stays visually LTR-
 * anchored in both languages: "first" is always the TOP card and the position
 * marker is always the leading number (plan §1). Reordering is possible three
 * ways so nobody is blocked: pointer drag (with an explicit handle), the
 * up/down buttons, and the keyboard (arrow keys on a focused card).
 *
 * Correctness is rendered only when the host has revealed (`reveal` non-null);
 * before that the component has no idea which position is right.
 */
import { Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

export interface OrderCard { id: string; label: string; }

@Component({
  selector: 'app-order-cards',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <ol class="cards" [class.locked]="locked()" [attr.aria-label]="'order.direction' | t">
      @for (c of cards(); track c.id; let i = $index; let first = $first; let last = $last) {
        <!-- Insertion marker: where the dragged card would land. -->
        @if (dropIndex() === i && dragId()) { <li class="drop-marker" aria-hidden="true">{{ 'order.dropHere' | t }}</li> }
        <li class="card-item"
            [class.selected]="selected() === c.id && !locked()"
            [class.correct]="reveal() && reveal()![i]"
            [class.wrong]="reveal() && !reveal()![i]"
            [class.dragging]="dragId() === c.id"
            [attr.data-index]="i"
            [attr.tabindex]="locked() || reveal() ? -1 : 0"
            [attr.aria-label]="('order.position' | t: { n: i + 1 }) + ': ' + c.label"
            (keydown)="onKey($event, i)"
            (pointermove)="dragMove($event)"
            (pointerup)="dragEnd()"
            (pointercancel)="dragEnd()">
          <span class="pos num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="label"><bdi>{{ c.label }}</bdi></span>
          @if (reveal()) {
            <span class="mark num" [attr.aria-label]="(reveal()![i] ? 'order.correctPosition' : 'order.wrongPosition') | t">{{ reveal()![i] ? ('order.mark.correct' | t: { pts: pointsPerCard() }) : '✗' }}</span>
            @if (!reveal()![i] && correctIndexOf(c.id) !== null) {
              <span class="goes num" aria-hidden="true">→ {{ correctIndexOf(c.id)! + 1 }}</span>
            }
          } @else {
            <span class="controls">
              <button type="button" class="btn btn-primary mv" [disabled]="locked() || first" (click)="move(i, -1)" [attr.aria-label]="'order.moveUp' | t">▲</button>
              <button type="button" class="btn btn-primary mv" [disabled]="locked() || last" (click)="move(i, 1)" [attr.aria-label]="'order.moveDown' | t">▼</button>
            </span>
            <span class="handle" [attr.aria-label]="'order.dragHandle' | t" role="button"
                  (pointerdown)="dragStart($event, c.id)">⠿</span>
          }
        </li>
      }
      @if (dropIndex() === cards().length && dragId()) { <li class="drop-marker" aria-hidden="true">{{ 'order.dropHere' | t }}</li> }
    </ol>
  `,
  styles: [`
    /* The sequence is physical: top = first in both languages (plan §1). */
    :host { display: block; }
    .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; touch-action: pan-y; }
    .card-item { display: flex; align-items: center; gap: 12px; background: var(--elm-pale-blue); border: 2px solid var(--elm-light-blue); border-radius: 12px; padding: 14px 12px; min-height: 76px; user-select: none; -webkit-user-select: none; }
    .card-item:focus-visible { outline: 3px solid var(--elm-purple); outline-offset: 2px; }
    .card-item.selected { border-color: var(--elm-purple); box-shadow: 0 0 0 2px var(--elm-purple) inset; }
    .card-item.dragging { opacity: .7; border-color: var(--elm-blue); }
    .card-item.correct { background: var(--game-go); color: var(--elm-almost-white); border-color: var(--game-go); }
    .card-item.wrong { background: #fff; border-color: var(--elm-burgundy); }
    .drop-marker { height: 28px; border: 2px dashed var(--elm-blue); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--elm-blue); font-size: 13px; font-weight: 700; background: rgba(0,113,206,.08); }
    .pos { flex: 0 0 32px; height: 32px; border-radius: 50%; background: var(--elm-navy); color: var(--elm-almost-white); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }
    .correct .pos { background: var(--elm-almost-white); color: var(--game-go); }
    .label { flex: 1; font-size: 18px; font-weight: 600; }
    .controls { display: flex; flex-direction: column; gap: 4px; }
    .mv { min-height: 34px; min-width: 44px; padding: 2px 8px; font-size: 14px; border-radius: 8px; }
    .handle { flex: 0 0 32px; text-align: center; font-size: 22px; color: var(--elm-muted-indigo); cursor: grab; touch-action: none; line-height: 1; }
    .mark { font-weight: 800; font-size: 18px; }
    .wrong .mark { color: var(--elm-burgundy); }
    /* Where a misplaced card should have gone: a small hint, never a second score. */
    .goes { font-size: 14px; font-weight: 700; color: var(--elm-muted-indigo); }
    .locked .card-item { opacity: .92; }
    @media (prefers-reduced-motion: reduce) { .card-item { transition: none; } }
  `],
})
export class OrderCardsComponent {
  readonly cards = input<OrderCard[]>([]);
  readonly locked = input(false);
  /** Per-position correctness after reveal; null before reveal. */
  readonly reveal = input<boolean[] | null>(null);
  /** The correct order after reveal, so a misplaced card can point to its slot. */
  readonly correctOrder = input<string[] | null>(null);
  /** Points per correctly placed card (from the session's frozen rules). */
  readonly pointsPerCard = input(20);
  readonly orderChange = output<string[]>();

  correctIndexOf(id: string): number | null {
    const idx = this.correctOrder()?.indexOf(id) ?? -1;
    return idx >= 0 ? idx : null;
  }

  readonly selected = signal<string | null>(null);
  readonly dragId = signal<string | null>(null);
  /** Index the dragged card would drop into, for the insertion marker. */
  readonly dropIndex = signal<number | null>(null);
  private dragStartY = 0;
  private dragFromIndex = -1;

  readonly ids = computed(() => this.cards().map((c) => c.id));

  /** Buttons and keys INSERT (remove + splice), exactly like a drag, so every input agrees. */
  move(index: number, delta: number): void {
    if (this.locked() || this.reveal()) return;
    const ids = [...this.ids()];
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    const [id] = ids.splice(index, 1);
    ids.splice(j, 0, id!);
    this.selected.set(id!);
    this.orderChange.emit(ids);
  }

  /** Keyboard alternative: ArrowUp/ArrowDown move the focused card (plan §5). */
  onKey(ev: KeyboardEvent, index: number): void {
    if (this.locked() || this.reveal()) return;
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    this.move(index, ev.key === 'ArrowUp' ? -1 : 1);
  }

  dragStart(ev: PointerEvent, id: string): void {
    if (this.locked() || this.reveal()) return;
    ev.preventDefault();
    this.dragId.set(id);
    this.selected.set(id);
    this.dragStartY = ev.clientY;
    this.dragFromIndex = this.ids().indexOf(id);
    this.dropIndex.set(this.dragFromIndex);
    const row = (ev.target as HTMLElement).closest('li');
    row?.setPointerCapture(ev.pointerId);
  }

  dragMove(ev: PointerEvent): void {
    const id = this.dragId();
    if (!id) return;
    const rowH = (ev.currentTarget as HTMLElement).offsetHeight + 10;
    const steps = Math.round((ev.clientY - this.dragStartY) / rowH);
    const target = Math.max(0, Math.min(this.ids().length - 1, this.dragFromIndex + steps));
    this.dropIndex.set(target);
    const cur = this.ids().indexOf(id);
    if (target !== cur) {
      const ids = [...this.ids()];
      ids.splice(cur, 1);
      ids.splice(target, 0, id);
      this.orderChange.emit(ids);
    }
  }

  /** Always clears drag state, so resizing or a lost pointer never sticks. */
  dragEnd(): void { this.dragId.set(null); this.dropIndex.set(null); }
}
