/**
 * Rehearsal tools — simulated players only.
 *
 * Kept in a visually separated drawer, OUT of the live workspace, so nobody
 * adds twenty fake players mid-event by mistake. Simulated players are flagged
 * everywhere (roster badge + every export), and destructive removal always
 * confirms with the real count.
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-rehearsal-panel',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rehearsal stack">
      <h3 class="rehearsal__title">{{ 'host.rehearsal.title' | t }}</h3>
      <p class="small muted rehearsal__note">{{ 'host.rehearsal.note' | t }}</p>

      <label class="rehearsal__count">
        <span class="small">{{ 'host.rehearsal.count' | t }}</span>
        <input
          class="input num"
          type="number"
          min="1"
          max="100"
          [value]="count()"
          (change)="countChange.emit($any($event.target).value)"
        />
      </label>

      <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="add.emit()">
        {{ 'host.rehearsal.add' | t }}
      </button>
      <button
        type="button"
        class="btn btn-danger"
        [disabled]="busy() || simulatedCount() === 0"
        (click)="clear.emit()"
      >
        {{ 'host.rehearsal.clear' | t }} (<bdi class="num">{{ simulatedCount() }}</bdi>)
      </button>
    </section>
  `,
  styles: [
    `
      .rehearsal__title {
        margin: 0;
        font-size: var(--fs-md, 1rem);
      }
      .rehearsal__note {
        margin: 0;
      }
      .rehearsal__count {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }
      .rehearsal__count .input {
        max-inline-size: 8ch;
      }
    `,
  ],
})
export class RehearsalPanelComponent {
  readonly count = input<number>(20);
  readonly simulatedCount = input<number>(0);
  readonly busy = input<boolean>(false);

  readonly countChange = output<string>();
  readonly add = output<void>();
  readonly clear = output<void>();
}
