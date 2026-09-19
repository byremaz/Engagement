/**
 * Host sign-in + session picker.
 *
 * Split out of the host desk so the live workspace file only contains the live
 * event. The access key is held by the parent in sessionStorage only and is
 * never echoed back into the DOM [secure-coding].
 */
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { HostSession } from '../core/api.service';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-host-signin',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!signedIn()) {
      <main class="page">
        <h1>{{ 'host.signin.title' | t }}</h1>
        <section class="card stack">
          <label for="hk">{{ 'host.signin.key' | t }}</label>
          <input
            id="hk"
            class="input"
            type="password"
            autocomplete="off"
            [value]="keyInput()"
            (input)="keyInput.set($any($event.target).value)"
          />
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="keyInput().trim().length < 16"
            (click)="submitKey()"
          >
            {{ 'host.signin.continue' | t }}
          </button>
          <p class="small muted">{{ 'host.signin.note' | t }}</p>
        </section>
      </main>
    } @else {
      <main class="page page--sessions">
        <h1>{{ 'host.sessions.title' | t }}</h1>
        @if (err(); as e) { <div class="alert alert-error">{{ e }}</div> }

        <section class="card stack">
          <h2>{{ 'host.sessions.create' | t }}</h2>
          <label for="t">{{ 'host.sessions.eventTitle' | t }}</label>
          <input id="t" class="input" maxlength="60" [(ngModel)]="title" />
          <label for="c">{{ 'host.sessions.capacity' | t }}</label>
          <input id="c" class="input num" type="number" min="1" max="200" [(ngModel)]="capacity" />
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="emitCreate()">
            {{ 'host.sessions.createBtn' | t }}
          </button>
        </section>

        <section class="card stack">
          <h2>{{ 'host.sessions.existing' | t }}</h2>
          @for (s of sessions(); track s.id) {
            <div class="row">
              <strong><bdi>{{ s.title }}</bdi></strong>
              <bdi class="badge badge-neutral num">{{ s.joinCode }}</bdi>
              <span class="muted small">{{ 'state.' + s.state | t }}</span>
              <span class="spacer"></span>
              <button type="button" class="btn btn-secondary" (click)="open.emit(s)">
                {{ 'host.sessions.open' | t }}
              </button>
            </div>
          } @empty {
            <p class="muted">{{ 'host.sessions.empty' | t }}</p>
          }
        </section>

        <button type="button" class="btn btn-secondary" (click)="signOut.emit()">{{ 'host.signOut' | t }}</button>
      </main>
    }
  `,
  styles: [
    `
      .page--sessions {
        max-inline-size: 800px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        flex-wrap: wrap;
      }
      .spacer {
        flex: 1;
      }
    `,
  ],
})
export class HostSigninComponent {
  readonly signedIn = input<boolean>(false);
  readonly sessions = input<HostSession[]>([]);
  readonly busy = input<boolean>(false);
  readonly err = input<string | null>(null);

  readonly keyEntered = output<string>();
  readonly create = output<{ title: string; capacity: number }>();
  readonly open = output<HostSession>();
  readonly signOut = output<void>();

  /** Kept in a signal so it can be cleared the instant it is handed over. */
  readonly keyInput = signal('');
  title = 'ASAS Challenge';
  capacity = 100;

  submitKey(): void {
    const key = this.keyInput().trim();
    if (key.length < 16) return;
    this.keyEntered.emit(key);
    this.keyInput.set('');
  }

  emitCreate(): void {
    const title = this.title.trim() || 'ASAS Challenge';
    const capacity = Math.min(200, Math.max(1, Math.round(Number(this.capacity) || 100)));
    this.create.emit({ title, capacity });
  }
}
