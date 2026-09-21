/**
 * Participant join / restore screen (§5.1, plan §3).
 *
 * Name is the only required input. A stored identity on this device is
 * restored automatically; a recovery code can move the identity to a new
 * device. The avatar is auto-assigned by the server and never blocks entry.
 *
 * This is the participant's FIRST screen, so the language toggle lives here:
 * a player must be able to choose Arabic before typing anything. The choice is
 * persisted under the `participant` role, so switching language on a phone
 * never affects the host desk or the shared display (plan §1).
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import type { Lang } from '@asas/shared';
import { AVATARS } from '@asas/shared';
import { ApiService, PublicSession } from '../core/api.service';
import { loadIdentity, saveIdentity, clearIdentity, loadLang } from '../core/storage';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <main class="page role-participant">
      <header class="center">
        <!--
          §5: a labelled bilingual control. Each option is written in its OWN
          language so it is recognisable whichever language is active — never a
          single ambiguous letter.
        -->
        <div class="lang-row">
          <span class="lang-label small muted">{{ 'common.language' | t }}</span>
          <div class="lang" role="group" [attr.aria-label]="'common.language' | t">
            <button type="button" class="lang-btn" [class.on]="locale.lang() === 'ar'"
              [attr.aria-pressed]="locale.lang() === 'ar'" (click)="locale.set('ar')">العربية</button>
            <button type="button" class="lang-btn" [class.on]="locale.lang() === 'en'"
              [attr.aria-pressed]="locale.lang() === 'en'" (click)="locale.set('en')">English</button>
          </div>
        </div>
        <p class="small muted" style="margin:0"><bdi>Elm</bdi></p>
        <h1>{{ 'app.title' | t }}</h1>
        <p class="muted">{{ 'play.formatNote' | t }}</p>
      </header>

      <!--
        §5: identity confirmation. After the server assigns the avatar and the
        stable short number, the player SEES exactly what the host roster and
        the display will show, so duplicate names are disambiguated by number
        before the game starts rather than during it.
      -->
      @if (confirming(); as who) {
        <section class="card stack center" aria-live="polite">
          <h2>{{ 'join.confirm.title' | t }}</h2>
          <span class="confirm-avatar" aria-hidden="true">{{ who.avatar }}</span>
          <p class="confirm-name"><bdi>{{ who.name }}</bdi></p>
          <p class="confirm-number"><bdi>{{ 'play.header.player' | t: { number: who.number } }}</bdi></p>
          <p class="small muted">{{ 'join.confirm.note' | t }}</p>
          <button class="btn btn-primary btn-lg btn-block" (click)="confirmIdentity()">
            {{ 'join.confirm.go' | t }}
          </button>
        </section>
      } @else if (existing()) {
        <!-- NG5002: "as" is only allowed on the primary @if, so read the
             signal directly via @let in this branch. -->
        @let ex = existing()!;
        <section class="card stack" aria-live="polite">
          <h2>{{ 'join.welcomeBack' | t: { name: ex.name } }}</h2>
          <p>{{ 'join.alreadyJoined' | t: { code: ex.joinCode } }}</p>
          <button class="btn btn-primary btn-lg btn-block" (click)="continueExisting()">
            {{ 'join.continueAs' | t: { avatar: ex.avatar, name: ex.name } }}
          </button>
          <button class="btn btn-secondary btn-block" (click)="forget()">{{ 'join.joinAsSomeoneElse' | t }}</button>
        </section>
      }

      @if (!confirming()) {
      <section class="card stack">
        <h2>{{ 'join.heading' | t }}</h2>
        <div>
          <label for="code">{{ 'join.codeLabel' | t }}</label>
          <!-- Join codes are machine identity: always LTR, never localized. -->
          <input id="code" class="input num" dir="ltr" [(ngModel)]="code" (ngModelChange)="onCodeChange()"
            autocapitalize="characters" autocomplete="off" inputmode="text" maxlength="8"
            [attr.placeholder]="'join.codePlaceholder' | t" />
        </div>
        @if (session(); as s) {
          <p class="small" aria-live="polite">
            <span class="badge badge-neutral"><bdi>{{ s.title }}</bdi></span>
            <span class="muted"> · {{ 'join.joinedCount' | t: { count: count() } }} ·
              {{ (s.joinOpen ? 'join.open' : 'join.closed') | t }}</span>
          </p>
        }
        <div>
          <label for="name">{{ 'join.nameLabel' | t }}</label>
          <input id="name" class="input" [(ngModel)]="name" autocomplete="nickname" maxlength="24"
            [attr.placeholder]="'join.namePlaceholder' | t" />
        </div>
        <div>
          <span class="small" style="font-weight:600">{{ 'join.avatar.label' | t }}</span>
          <div class="avatar-grid" role="radiogroup" [attr.aria-label]="'join.avatar.label' | t">
            <button type="button" class="avatar-cell" [class.on]="avatar() === null" role="radio"
              [attr.aria-checked]="avatar() === null" (click)="avatar.set(null)">
              <span aria-hidden="true">🎲</span>
              <span class="avatar-cell-label">{{ 'join.avatar.random' | t }}</span>
            </button>
            @for (a of avatars; track a) {
              <button type="button" class="avatar-cell" [class.on]="avatar() === a" role="radio"
                [attr.aria-checked]="avatar() === a" (click)="avatar.set(a)">{{ a }}</button>
            }
          </div>
        </div>
        @if (error(); as e) { <div class="alert alert-error" role="alert">{{ e }}</div> }
        <button class="btn btn-primary btn-lg btn-block" [disabled]="busy() || !canJoin()" (click)="join()">
          {{ (busy() ? 'join.joining' : 'join.submit') | t }}
        </button>
        <p class="small muted">{{ 'join.privacyNote' | t }}</p>
      </section>
      }

      @if (!confirming()) {
      <details class="card">
        <summary style="font-weight:600;cursor:pointer">{{ 'join.recoverLink' | t }}</summary>
        <div class="stack" style="margin-top:12px">
          <label for="rc">{{ 'join.recoveryLabel' | t }}</label>
          <input id="rc" class="input num" dir="ltr" [(ngModel)]="recovery" autocapitalize="characters"
            autocomplete="off" maxlength="8" [attr.placeholder]="'join.recoveryPlaceholder' | t" />
          <button class="btn btn-secondary btn-block"
            [disabled]="busy() || code.length < 4 || recovery.length < 6" (click)="restore()">
            {{ 'join.recoverSubmit' | t }}
          </button>
        </div>
      </details>
      }

      <footer class="center small muted">{{ 'app.builtUsing' | t }}</footer>
    </main>
  `,
  styles: [`
    .lang-row {
      display: flex; justify-content: flex-end; align-items: center;
      gap: var(--space-1); margin-block-end: var(--space-1);
    }
    .lang-label { font-weight: var(--fw-bold); }
    .lang { display: inline-flex; gap: 2px; background: var(--elm-pale-blue); border-radius: var(--radius-pill); padding: 2px; }
    .lang-btn {
      min-width: 72px; min-height: 40px; padding: 0 var(--space-2); border: 0; background: transparent;
      border-radius: var(--radius-pill); font-weight: var(--fw-bold); cursor: pointer;
      color: var(--elm-muted-indigo); font-family: inherit; font-size: var(--fs-0);
    }
    .lang-btn.on { background: var(--elm-navy); color: var(--elm-almost-white); }
    /* §5: identity confirmation — the number is as prominent as the name. */
    .confirm-avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 96px; height: 96px; margin: 0 auto; font-size: 52px;
      background: var(--elm-peach); border: 3px solid var(--elm-navy); border-radius: 50%;
    }
    .confirm-name { margin: var(--space-1) 0 0; font-size: clamp(24px, 7vw, 30px); font-weight: var(--fw-bold); color: var(--elm-navy); }
    .confirm-number { margin: 0; font-size: 20px; font-weight: var(--fw-bold); color: var(--elm-navy); }
    .lang-btn:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring-color);
      outline-offset: var(--focus-ring-offset);
    }
    /* Avatar picker: 16 characters + "random", touch-sized cells. */
    .avatar-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
      gap: var(--space-1); margin-top: var(--space-1);
    }
    .avatar-cell {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 52px; padding: 4px; font-size: 26px; cursor: pointer; font-family: inherit;
      background: var(--elm-pale-blue); border: 2px solid transparent; border-radius: var(--radius-md, 12px);
    }
    .avatar-cell.on { border-color: var(--elm-navy); background: var(--elm-peach); }
    .avatar-cell:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring-color);
      outline-offset: var(--focus-ring-offset);
    }
    .avatar-cell-label { font-size: 11px; font-weight: 600; color: var(--elm-muted-indigo); }
  `],
})
export class JoinComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** Public so the template can read and set the language. */
  readonly locale = inject(LocaleService);

  code = '';
  name = '';
  recovery = '';
  readonly session = signal<PublicSession | null>(null);
  readonly count = signal(0);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly existing = signal(loadIdentity());
  /** The shared allow-list — same source the server validates against. */
  readonly avatars = AVATARS;
  /** null = let the server assign one (the "random" default). */
  readonly avatar = signal<string | null>(null);

  /**
   * Set after a successful join/restore so the player can confirm the identity
   * the rest of the event will show them by (§5). The identity is already
   * saved at this point, so a refresh here still lands correctly in /play.
   */
  readonly confirming = signal<{ name: string; number: number; avatar: string } | null>(null);

  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // Bind this tab to the participant role so the language choice is stored
    // separately from the host desk and the shared display.
    this.locale.init('participant');
    const fromRoute =
      this.route.snapshot.paramMap.get('code') ?? this.route.snapshot.queryParamMap.get('code');
    if (fromRoute) { this.code = fromRoute.toUpperCase(); void this.preview(); }
  }

  /** A phone with no saved choice starts in the host's default language. */
  private applyDefaultLang(lang: Lang | undefined): void {
    if (lang && !loadLang('participant')) this.locale.set(lang);
  }

  canJoin(): boolean {
    const n = this.name.trim();
    return this.code.trim().length >= 4 && n.length >= 2 && n.length <= 24;
  }

  onCodeChange(): void {
    this.code = this.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.preview(), 400);
  }

  private async preview(): Promise<void> {
    if (this.code.length < 4) { this.session.set(null); return; }
    try {
      const r = await this.api.preview(this.code);
      this.session.set(r.session);
      this.count.set(r.participantCount);
      this.applyDefaultLang(r.session.defaultParticipantLang);
      this.error.set(null);
    } catch {
      this.session.set(null);
    }
  }

  async join(): Promise<void> {
    if (!this.canJoin()) return;
    this.busy.set(true); this.error.set(null);
    try {
      const r = await this.api.join(this.code, this.name.trim(), this.avatar() ?? undefined);
      const s = this.session() ?? (await this.api.preview(this.code)).session;
      saveIdentity({
        joinCode: this.code, sessionId: s.id, participantId: r.participant.id, token: r.token,
        recoveryCode: r.recoveryCode, name: r.participant.displayName,
        number: r.participant.number, avatar: r.participant.avatar,
      });
      // Show the assigned avatar + number before entering the game.
      this.confirming.set({
        name: r.participant.displayName,
        number: r.participant.number,
        avatar: r.participant.avatar,
      });
    } catch (e) {
      this.error.set(this.describeLocalized(e));
    } finally { this.busy.set(false); }
  }

  async restore(): Promise<void> {
    this.busy.set(true); this.error.set(null);
    try {
      const rc = this.recovery.trim().toUpperCase();
      const r = await this.api.restore(this.code, rc);
      const s = (await this.api.preview(this.code)).session;
      saveIdentity({
        joinCode: this.code, sessionId: s.id, participantId: r.participant.id, token: r.token,
        recoveryCode: rc, name: r.participant.displayName,
        number: r.participant.number, avatar: r.participant.avatar,
      });
      // A restored identity is confirmed the same way, so a player moving to a
      // new device can verify they kept the same number.
      this.confirming.set({
        name: r.participant.displayName,
        number: r.participant.number,
        avatar: r.participant.avatar,
      });
    } catch (e) {
      this.error.set(this.describeLocalized(e));
    } finally { this.busy.set(false); }
  }

  /**
   * Map a transport error to a LOCALIZED message. The server may also return a
   * human-readable message, but that text is English-only and not translatable,
   * so it is used only as a last resort after the known status codes.
   */
  private describeLocalized(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return this.locale.t('error.network');
      if (e.status === 404) return this.locale.t('join.error.notFound');
      if (e.status === 403) return this.locale.t('join.error.closed');
      if (e.status === 409) return this.locale.t('join.error.full');
      if (e.status === 401) return this.locale.t('join.error.badRecovery');
      const msg = (e.error as { message?: string | string[] })?.message;
      const text = Array.isArray(msg) ? msg.join(' ') : msg;
      return text ?? this.locale.t('join.error.generic');
    }
    return this.locale.t('error.generic');
  }

  /** Leaves the confirmation step and enters the game. */
  confirmIdentity(): void { void this.router.navigateByUrl('/play'); }

  continueExisting(): void { void this.router.navigateByUrl('/play'); }
  forget(): void { clearIdentity(); this.existing.set(null); }
}
