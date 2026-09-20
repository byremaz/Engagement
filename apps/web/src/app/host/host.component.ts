/**
 * Host desk — a live-event control room (plan v2 §4.2).
 *
 * Fits 1366x768 without page scrolling:
 *   status bar   — where are we (title, code, state, clocks, connections)
 *   progression  — Lobby → Instructions → Practice → Game → Results
 *   NOW & NEXT   — one sentence about the room + ONE primary action
 *   ROOM         — what the room sees, display language, contextual panel
 *                  (race signals / podium stepper / standings pager)
 *   RUNBOOK      — the 30-minute plan with the current step and the drift
 *
 * Everything that is not "what do I press next" lives in drawers. Destructive
 * actions go through an in-app dialog that states the consequence. Signals
 * stay visually separated from progression and never advance the event. The
 * host key is only ever read from sessionStorage and travels in a header via
 * the interceptor [secure-coding].
 */
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import type { HostAction, HostActionPayload, Lang, ParticipantHostView, SignalColor, SignalMode } from '@asas/shared';
import { topThreeTies } from '@asas/shared';
import { ApiService, HostSession } from '../core/api.service';
import { RealtimeService } from '../core/realtime.service';
import { HOST_KEY_STORAGE, HOST_SESSION_STORAGE } from '../core/storage';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import { StandingsTableComponent } from '../shared/standings-table.component';
import { PausedPanelComponent } from '../shared/paused-panel.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';
import { DialogService } from '../shared/dialog.service';
import { HostStatusBarComponent } from './status-bar.component';
import { ProgressionStripComponent } from './progression-strip.component';
import { PrimaryActionComponent, type PrimaryPress } from './primary-action.component';
import { SecondaryActionsComponent } from './secondary-actions.component';
import { AudiencePreviewComponent } from './audience-preview.component';
import { SignalPanelComponent } from './signal-panel.component';
import { HostDrawerComponent } from './drawer.component';
import { RosterListComponent } from './roster-list.component';
import { RehearsalPanelComponent } from './rehearsal-panel.component';
import { SessionAdminComponent, type ExportKind } from './session-admin.component';
import { HostSigninComponent } from './host-signin.component';
import { RunbookRailComponent } from './runbook-rail.component';
import { PodiumStepperComponent } from './podium-stepper.component';
import { StandingsPagerComponent } from './standings-pager.component';
import { DisplaySettingsComponent } from './display-settings.component';
import { primaryActionFor } from './next-action';
import { hostErrorFromHttp, hostErrorFromMessage, type HostError } from './host-errors';

@Component({
  selector: 'app-host',
  standalone: true,
  imports: [
    TranslatePipe, StandingsTableComponent, PausedPanelComponent, ConfirmDialogComponent, HostSigninComponent,
    HostStatusBarComponent, ProgressionStripComponent, PrimaryActionComponent, SecondaryActionsComponent,
    AudiencePreviewComponent, SignalPanelComponent, HostDrawerComponent, RosterListComponent, RehearsalPanelComponent,
    SessionAdminComponent, RunbookRailComponent, PodiumStepperComponent, StandingsPagerComponent, DisplaySettingsComponent,
  ],
  template: `
    <app-confirm-dialog />
    @if (!hostKey() || !session()) {
      <app-host-signin
        [signedIn]="!!hostKey()"
        [sessions]="sessions()"
        [busy]="busy()"
        [err]="errText()"
        (keyEntered)="signIn($event)"
        (create)="create($event)"
        (open)="open($event)"
        (signOut)="signOut()"
      />
    } @else if (session()) {
      @let ses = session()!;
      <div class="desk role-host">
        <app-host-status-bar
          [snap]="snap()"
          [title]="ses.title"
          [joinCode]="ses.joinCode"
          [conn]="rt.conn()"
          [onlineCount]="onlineCount()"
          [elapsedLabel]="elapsedLabel()"
          [overrun]="elapsedMin() > 30"
        >
          <button type="button" class="btn btn-secondary sm" (click)="locale.toggle()">{{ locale.toggleLabel() }}</button>
          <app-host-drawer titleKey="host.roster" [(open)]="rosterOpen">
            <app-roster-list [players]="roster()" (refresh)="loadRoster()" (rename)="rename($event)" (remove)="remove($event)" />
          </app-host-drawer>
          <app-host-drawer titleKey="host.drawer.session" [(open)]="adminOpen">
            <app-session-admin
              [joinOpen]="ses.joinOpen"
              [closed]="ses.state === 'Closed'"
              [busy]="busy()"
              [canVoid]="canVoid()"
              [copied]="copied()"
              (toggleJoin)="toggleJoin()"
              (openDisplay)="openDisplay()"
              (copyJoin)="copyJoin()"
              (exportCsv)="exportCsv($event)"
              (voidRound)="voidRound()"
              (closeSession)="closeSession()"
            />
          </app-host-drawer>
          <app-host-drawer titleKey="host.drawer.rehearsal" [(open)]="rehearsalOpen">
            <app-rehearsal-panel [count]="simCount()" [simulatedCount]="simulatedCount()" [busy]="simBusy()" (countChange)="setSimCount($event)" (add)="addSimulated()" (clear)="removeSimulated()" />
          </app-host-drawer>
          <button type="button" class="btn btn-secondary sm" (click)="backToSessions()">{{ 'host.backToSessions' | t }}</button>
        </app-host-status-bar>

        <nav class="desk__strip"><app-progression-strip [snap]="snap()" /></nav>

        @if (errText(); as e) { <div class="alert alert-error desk__err" role="alert">{{ e }}</div> }

        <main class="desk__main">
          <!-- NOW & NEXT -->
          <section class="card stack desk__now">
            @if (snap(); as s) {
              @if (s.paused) {
                <app-paused-panel [forHost]="true" [previousSignal]="s.gameType === 'RLGL' && s.race ? s.race.signal : null" />
              }
              <p class="desk__nowline">
                <span class="badge badge-stage">{{ 'host.nowNext.now' | t }}</span>
                <strong class="stage-state">{{ 'state.' + s.state | t }}</strong>
                @if (s.isPractice) { <span class="badge badge-lavender">{{ 'state.Practice' | t }}</span> }
              </p>
              <p class="small muted desk__counts">
                @if (s.state === 'Instructions') {
                  <span><bdi>{{ 'host.readyCount' | t: { ready: s.readyCount, total: s.participantCount } }}</bdi></span>
                }
                @if (s.state === 'RoundActive' || s.state === 'InputLocked') {
                  @if (s.gameType === 'RLGL') {
                    <span><bdi>{{ 'host.race.counts' | t: raceCounts() }}</bdi></span>
                  } @else {
                    <span><bdi>{{ 'host.answerCount' | t: { answers: s.responseCount, total: s.participantCount } }}</bdi></span>
                  }
                }
              </p>
              @if (s.gameType === 'RLGL' && lastSurvivor() && s.state === 'RoundActive') {
                <p class="alert alert-info">{{ 'host.lastSurvivor' | t }}</p>
              }
              @if (s.state === 'InputLocked') { <p class="alert alert-info">{{ 'host.lockedHint' | t }}</p> }
            }

            <app-primary-action [snap]="snap()" [busy]="busy()" (run)="press($event)" />
            <app-secondary-actions [snap]="snap()" [busy]="busy()" [primary]="primaryAction()" (run)="act($event)" />

            @if (snap()?.state === 'GameResults' || snap()?.state === 'TournamentResults') {
              <app-podium-stepper [snap]="snap()" [busy]="busy()" (step)="podiumStep($event)" (tieBreak)="tieBreak()" />
            }
            @if (showPager()) {
              <app-standings-pager [snap]="snap()" [busy]="busy()" (pageChange)="act('STANDINGS_PAGE', { page: $event })" />
            }
          </section>

          <!-- ROOM -->
          <section class="card stack desk__room">
            <app-audience-preview [snap]="snap()" />
            <app-display-settings
              [displayLang]="snap()?.displayLang ?? 'en'"
              [defaultLang]="snap()?.defaultParticipantLang ?? 'en'"
              [busy]="busy()"
              (displayLangChange)="setLanguages({ displayLang: $event })"
              (defaultLangChange)="setLanguages({ defaultParticipantLang: $event })"
            />
            @if (snap()?.gameType === 'RLGL') {
              <app-signal-panel [snap]="snap()" [mode]="ses.signalMode" (signal)="sendSignal($event)" (modeChange)="setMode($event)" />
            }
          </section>

          <!-- RUNBOOK -->
          <aside class="card desk__rail">
            <app-runbook-rail [snap]="snap()" [elapsedMin]="elapsedMin()" />
          </aside>

          @if (snap()?.standings; as rows) {
            <section class="card stack desk__standings">
              <h2 class="desk__h2">{{ (snap()?.state === 'GameResults' ? 'display.currentGame' : 'display.tournament') | t: { game: gameName() } }}</h2>
              <app-standings-table [rows]="rows" [pageSize]="10" />
            </section>
          }
        </main>
      </div>
    }
  `,
  styles: [`
    .desk { display: flex; flex-direction: column; block-size: 100dvh; overflow: hidden; }
    .desk__strip { padding: var(--space-2) var(--space-5); border-block-end: 1px solid var(--elm-light-blue); }
    .desk__err { margin: var(--space-2) var(--space-5) 0; }
    .desk__main {
      flex: 1; min-block-size: 0; overflow: auto;
      display: grid; grid-template-columns: minmax(340px, 1.2fr) minmax(300px, 1fr) minmax(220px, .7fr);
      align-content: start; gap: var(--space-4); padding: var(--space-4) var(--space-5);
    }
    .desk__standings { grid-column: 1 / -1; }
    .desk__h2 { margin: 0; font-size: var(--fs-0); }
    .desk__nowline { display: flex; align-items: center; gap: var(--space-2); margin: 0; flex-wrap: wrap; }
    .desk__counts { display: flex; gap: var(--space-3); margin: 0; min-block-size: 1.4em; }
    .sm { min-block-size: 32px; padding: 2px 10px; }
    @media (max-width: 1100px) {
      .desk__main { grid-template-columns: minmax(320px, 1fr) minmax(300px, 1fr); }
      .desk__rail { grid-column: 1 / -1; }
    }
    @media (max-width: 900px) {
      .desk { block-size: auto; overflow: visible; }
      .desk__main { grid-template-columns: 1fr; }
    }
  `],
})
export class HostComponent implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly rt = inject(RealtimeService);
  readonly locale = inject(LocaleService);
  private readonly dialog = inject(DialogService);

  readonly hostKey = signal<string | null>(sessionStorage.getItem(HOST_KEY_STORAGE));
  readonly sessions = signal<HostSession[]>([]);
  readonly session = signal<HostSession | null>(null);
  readonly roster = signal<ParticipantHostView[]>([]);
  readonly err = signal<HostError | null>(null);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly simCount = signal(20);
  readonly simBusy = signal(false);
  readonly snap = this.rt.snapshot;

  readonly rosterOpen = signal(false);
  readonly adminOpen = signal(false);
  readonly rehearsalOpen = signal(false);

  private rosterTimer: ReturnType<typeof setInterval> | null = null;
  private readonly clock = signal(Date.now());
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  readonly errText = computed(() => {
    this.locale.lang();
    const e = this.err();
    if (!e) return null;
    const text = this.locale.t(e.key, e.params);
    return e.raw && e.key === 'error.generic' ? `${text} (${e.raw})` : text;
  });

  readonly onlineCount = computed(() => this.roster().filter((p) => p.connected).length);
  readonly simulatedCount = computed(() => this.roster().filter((p) => p.isSimulated).length);
  readonly canVoid = computed(() => !!this.snap()?.attemptId && !this.snap()?.isPractice);
  readonly elapsedMin = computed(() => {
    const t = this.snap()?.eventStartedAt;
    return t ? (this.clock() - t) / 60000 : 0;
  });
  readonly elapsedLabel = computed(() => {
    if (!this.snap()?.eventStartedAt) return '';
    const m = Math.floor(this.elapsedMin());
    const s = Math.floor((this.elapsedMin() - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  });
  readonly primaryAction = computed<HostAction | null>(() => primaryActionFor(this.snap()));
  readonly gameName = computed(() => {
    const g = this.snap()?.gameType;
    return g ? this.locale.t(`game.${g}`) : '';
  });
  readonly showPager = computed(() => {
    const s = this.snap();
    if (!s?.standings?.length) return false;
    if (s.state === 'GameResults') return (s.podiumStep ?? 0) >= 4;
    if (s.state === 'TournamentResults') return s.ceremonyStep >= 4;
    return false;
  });

  readonly raceCounts = computed(() => {
    const players = this.snap()?.race?.players ?? [];
    return {
      alive: players.filter((p) => p.state === 'alive').length,
      finished: players.filter((p) => p.state === 'finished').length,
      eliminated: players.filter((p) => p.state === 'eliminated').length,
    };
  });
  readonly lastSurvivor = computed(() => this.raceCounts().alive === 1);

  constructor() {
    // A stage change drops stale feedback AND closes every drawer over the live area.
    let lastState = '';
    effect(() => {
      const s = this.snap();
      if (!s) return;
      void s.seq;
      this.err.set(null);
      this.copied.set(false);
      if (s.state !== lastState) {
        lastState = s.state;
        this.rosterOpen.set(false);
        this.adminOpen.set(false);
        this.rehearsalOpen.set(false);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.locale.init('host');
    this.clockTimer = setInterval(() => this.clock.set(Date.now()), 1000);
    if (this.hostKey()) {
      await this.loadSessions();
      const last = sessionStorage.getItem(HOST_SESSION_STORAGE);
      const s = this.sessions().find((x) => x.id === last);
      if (s) await this.open(s);
    }
  }

  ngOnDestroy(): void {
    this.rt.disconnect();
    if (this.rosterTimer) clearInterval(this.rosterTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  signIn(key: string): void {
    sessionStorage.setItem(HOST_KEY_STORAGE, key);
    this.hostKey.set(key);
    void this.loadSessions();
  }

  signOut(): void {
    sessionStorage.removeItem(HOST_KEY_STORAGE);
    sessionStorage.removeItem(HOST_SESSION_STORAGE);
    this.hostKey.set(null);
    this.session.set(null);
    this.rt.disconnect();
  }

  backToSessions(): void {
    this.session.set(null);
    sessionStorage.removeItem(HOST_SESSION_STORAGE);
    this.rt.disconnect();
    void this.loadSessions();
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    this.busy.set(true);
    this.err.set(null);
    try {
      return await fn();
    } catch (e) {
      this.err.set(hostErrorFromHttp(e));
      if ((e as { status?: number }).status === 401) this.signOut();
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  async loadSessions(): Promise<void> {
    const r = await this.guard(() => this.api.listSessions());
    if (r) this.sessions.set(r.items);
  }

  async create(v: { title: string; capacity: number }): Promise<void> {
    const s = await this.guard(() => this.api.createSession(v.title, v.capacity));
    if (s) await this.open(s);
  }

  async open(s: HostSession): Promise<void> {
    this.session.set(s);
    sessionStorage.setItem(HOST_SESSION_STORAGE, s.id);
    this.rt.connectHost(s.id, this.hostKey()!);
    await this.loadRoster();
    if (this.rosterTimer) clearInterval(this.rosterTimer);
    this.rosterTimer = setInterval(() => void this.loadRoster(), 5000);
  }

  async loadRoster(): Promise<void> {
    const s = this.session();
    if (!s) return;
    try {
      this.roster.set(await this.api.roster(s.id));
      this.session.set(await this.api.getSession(s.id));
    } catch {
      /* transient — the snapshot stream stays authoritative */
    }
  }

  press(p: PrimaryPress): void {
    void this.act(p.action, p.payload ?? {});
  }

  podiumStep(step: number): void {
    const final = this.snap()?.state === 'TournamentResults';
    void this.act(final ? 'CEREMONY_STEP' : 'PODIUM_STEP', { step });
  }

  async act(action: HostAction, payload: HostActionPayload = {}): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.rt.hostAction(action, payload);
      this.err.set(r.ok ? null : hostErrorFromMessage(r.error));
    } finally {
      this.busy.set(false);
    }
  }

  async sendSignal(color: SignalColor): Promise<void> {
    const r = await this.rt.hostSignal(color);
    if (!r.ok) this.err.set(hostErrorFromMessage(r.error));
  }

  async setMode(mode: SignalMode): Promise<void> {
    const s = this.session();
    if (!s) return;
    const u = await this.guard(() => this.api.setSignalMode(s.id, mode));
    if (u) this.session.set(u);
  }

  async setLanguages(langs: { displayLang?: Lang; defaultParticipantLang?: Lang }): Promise<void> {
    const s = this.session();
    if (!s) return;
    await this.guard(() => this.api.setLanguages(s.id, langs));
  }

  async toggleJoin(): Promise<void> {
    const s = this.session();
    if (!s) return;
    const u = await this.guard(() => this.api.setJoinOpen(s.id, !s.joinOpen));
    if (u) this.session.set(u);
  }

  exportCsv(kind: ExportKind): void {
    const s = this.session();
    if (!s) return;
    if (kind === 'rounds') void this.api.download(s.id, 'rounds');
    else void this.api.download(s.id, 'standings', kind === 'standings-private' ? 'private' : 'public');
  }

  async voidRound(): Promise<void> {
    const reason = await this.dialog.confirm({
      titleKey: 'host.void.title', bodyKey: 'host.void.body', confirmKey: 'host.void.confirm', danger: true,
      input: { labelKey: 'host.session.voidReason', minLength: 3, maxLength: 200 },
    });
    if (reason) void this.act('VOID_ROUND', { reason });
  }

  async tieBreak(): Promise<void> {
    const ids = topThreeTies(this.snap()?.standings ?? [])[0];
    if (!ids?.length) return;
    const ok = await this.dialog.confirm({ titleKey: 'host.tiebreak.title', bodyKey: 'host.tiebreak.confirm', params: { count: ids.length }, confirmKey: 'action.START_TIEBREAK' });
    if (ok !== null) void this.act('START_TIEBREAK', { participantIds: ids });
  }

  async closeSession(): Promise<void> {
    const s = this.session();
    if (!s) return;
    const ok = await this.dialog.confirm({ titleKey: 'host.session.closeTitle', bodyKey: 'host.session.closeConsequence', confirmKey: 'host.session.close', danger: true });
    if (ok === null) return;
    const u = await this.guard(() => this.api.closeSession(s.id));
    if (u) this.session.set(u);
  }

  setSimCount(v: string): void {
    const n = Math.round(Number(v));
    this.simCount.set(Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20);
  }

  async addSimulated(): Promise<void> {
    const s = this.session();
    if (!s) return;
    this.simBusy.set(true);
    try {
      await this.guard(() => this.api.addSimulated(s.id, this.simCount()));
      await this.loadRoster();
    } finally {
      this.simBusy.set(false);
    }
  }

  async removeSimulated(): Promise<void> {
    const s = this.session();
    if (!s) return;
    const ok = await this.dialog.confirm({ titleKey: 'host.rehearsal.clearTitle', bodyKey: 'host.rehearsal.clearConfirm', params: { count: this.simulatedCount() }, confirmKey: 'host.rehearsal.clear', danger: true });
    if (ok === null) return;
    this.simBusy.set(true);
    try {
      await this.guard(() => this.api.removeSimulated(s.id));
      await this.loadRoster();
    } finally {
      this.simBusy.set(false);
    }
  }

  async rename(p: ParticipantHostView): Promise<void> {
    const s = this.session();
    if (!s) return;
    const name = await this.dialog.confirm({ titleKey: 'host.roster.renameTitle', params: { name: p.name }, confirmKey: 'host.roster.rename', input: { labelKey: 'host.roster.newName', initial: p.name, minLength: 2, maxLength: 24 } });
    if (name && name.trim().length >= 2) {
      await this.guard(() => this.api.rename(s.id, p.id, name.trim()));
      await this.loadRoster();
    }
  }

  async remove(p: ParticipantHostView): Promise<void> {
    const s = this.session();
    if (!s) return;
    const ok = await this.dialog.confirm({ titleKey: 'host.roster.removeTitle', bodyKey: 'host.roster.removeBody', params: { name: p.name, number: p.number }, confirmKey: 'host.roster.remove', danger: true });
    if (ok === null) return;
    await this.guard(() => this.api.remove(s.id, p.id));
    await this.loadRoster();
  }

  async openDisplay(): Promise<void> {
    const s = this.session();
    if (!s) return;
    const r = await this.guard(() => this.api.displayToken(s.id));
    if (r) window.open(`${location.origin}${location.pathname}#/display?token=${encodeURIComponent(r.token)}`, '_blank');
  }

  copyJoin(): void {
    const s = this.session();
    if (!s) return;
    void navigator.clipboard.writeText(`${location.origin}${location.pathname}#/join/${s.joinCode}`);
    this.copied.set(true);
  }
}
