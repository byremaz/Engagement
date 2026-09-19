/**
 * Host desk — a focused live-event control shell (plan §2).
 *
 * Three zones that fit 1366x768 without page scrolling:
 *   1. status bar   — where are we (title, code, state, clocks, connections)
 *   2. progression  — Lobby → Instructions → Practice → Game → Results
 *   3. live area    — audience preview + ONE primary action (+ RLGL signals)
 *
 * Everything that is not "what do I press next" (exports, session admin,
 * roster, rehearsal) lives in drawers. Signals stay visually separated from
 * progression and never advance the event. The host key is only ever read from
 * sessionStorage and travels in a header via the interceptor [secure-coding].
 */
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import type { HostAction, ParticipantHostView, SignalColor, SignalMode } from '@asas/shared';
import { topThreeTies } from '@asas/shared';
import { ApiService, HostSession } from '../core/api.service';
import { RealtimeService } from '../core/realtime.service';
import { HOST_KEY_STORAGE, HOST_SESSION_STORAGE } from '../core/storage';
import { describe } from '../participant/join.component';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';
import { StandingsTableComponent } from '../shared/standings-table.component';
import { HostStatusBarComponent } from './status-bar.component';
import { ProgressionStripComponent } from './progression-strip.component';
import { PrimaryActionComponent } from './primary-action.component';
import { SecondaryActionsComponent } from './secondary-actions.component';
import { AudiencePreviewComponent } from './audience-preview.component';
import { SignalPanelComponent } from './signal-panel.component';
import { HostDrawerComponent } from './drawer.component';
import { RosterListComponent } from './roster-list.component';
import { RehearsalPanelComponent } from './rehearsal-panel.component';
import { SessionAdminComponent, type ExportKind } from './session-admin.component';
import { HostSigninComponent } from './host-signin.component';

const CEREMONY: StringKey[] = [
  'host.ceremony.intro',
  'host.ceremony.third',
  'host.ceremony.second',
  'host.ceremony.first',
  'host.ceremony.full',
];

@Component({
  selector: 'app-host',
  standalone: true,
  imports: [
    TranslatePipe,
    StandingsTableComponent,
    HostSigninComponent,
    HostStatusBarComponent,
    ProgressionStripComponent,
    PrimaryActionComponent,
    SecondaryActionsComponent,
    AudiencePreviewComponent,
    SignalPanelComponent,
    HostDrawerComponent,
    RosterListComponent,
    RehearsalPanelComponent,
    SessionAdminComponent,
  ],
  template: `
    @if (!hostKey() || !session()) {
      <app-host-signin
        [signedIn]="!!hostKey()"
        [sessions]="sessions()"
        [busy]="busy()"
        [err]="err()"
        (keyEntered)="signIn($event)"
        (create)="create($event)"
        (open)="open($event)"
        (signOut)="signOut()"
      />
    } @else if (session()) {
      @let ses = session()!;
      <!-- role-host: desk type scale (plan section 9). -->
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
          <button type="button" class="btn btn-secondary sm" (click)="locale.toggle()">
            {{ locale.toggleLabel() }}
          </button>
          <app-host-drawer titleKey="host.roster" [(open)]="rosterOpen">
            <app-roster-list
              [players]="roster()"
              (refresh)="loadRoster()"
              (rename)="rename($event)"
              (remove)="remove($event)"
            />
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
            <app-rehearsal-panel
              [count]="simCount()"
              [simulatedCount]="simulatedCount()"
              [busy]="simBusy()"
              (countChange)="setSimCount($event)"
              (add)="addSimulated()"
              (clear)="removeSimulated()"
            />
          </app-host-drawer>
          <button type="button" class="btn btn-secondary sm" (click)="backToSessions()">
            {{ 'host.backToSessions' | t }}
          </button>
        </app-host-status-bar>

        <nav class="desk__strip"><app-progression-strip [snap]="snap()" /></nav>

        <!-- Real failures only; cleared whenever the authoritative state moves. -->
        @if (err(); as e) { <div class="alert alert-error desk__err">{{ e }}</div> }

        <main class="desk__main">
          <section class="card stack desk__stage">
            <h2 class="desk__h2">{{ 'host.stage' | t }}</h2>
            @if (snap(); as s) {
              <p class="small muted desk__counts">
                @if (s.state === 'Instructions' || s.state === 'Practice') {
                  <span><bdi>{{ 'host.readyCount' | t: { ready: s.readyCount, total: s.participantCount } }}</bdi></span>
                }
                <!--
                  Plan §2: counters are stage- AND game-aware. A race has no
                  "answers", so RLGL reports racing/finished/out from the
                  authoritative race snapshot; only GEO/ORDER count responses.
                -->
                @if (s.state === 'RoundActive' || s.state === 'InputLocked') {
                  @if (s.gameType === 'RLGL') {
                    <span><bdi>{{ 'host.race.counts' | t: raceCounts() }}</bdi></span>
                  } @else {
                    <span><bdi>{{ 'host.answerCount' | t: { answers: s.responseCount, total: s.participantCount } }}</bdi></span>
                  }
                }
              </p>
              <!-- §4: describe the last racer; never call them a winner. -->
              @if (s.gameType === 'RLGL' && lastSurvivor() && s.state === 'RoundActive') {
                <p class="alert alert-info">{{ 'host.lastSurvivor' | t }}</p>
              }
              @if (s.state === 'InputLocked') { <p class="alert alert-info">{{ 'host.lockedHint' | t }}</p> }
            }

            <app-primary-action [snap]="snap()" [busy]="busy()" (run)="act($event)" />
            <app-secondary-actions [snap]="snap()" [busy]="busy()" [primary]="primaryAction()" (run)="act($event)" />

            @if (snap()?.state === 'TournamentResults') {
              <h3 class="desk__h3">{{ 'host.ceremony.title' | t }}</h3>
              <div class="desk__row">
                @for (k of ceremony; track k; let i = $index) {
                  <button
                    type="button"
                    class="btn"
                    [class.btn-stage]="snap()?.ceremonyStep === i"
                    [class.btn-secondary]="snap()?.ceremonyStep !== i"
                    (click)="act('CEREMONY_STEP', { step: i })"
                  >
                    {{ k | t }}
                  </button>
                }
                @if (tiedCount() > 0) {
                  <button type="button" class="btn btn-warm" (click)="tieBreak()">
                    {{ 'host.tiebreak' | t: { count: tiedCount() } }}
                  </button>
                }
              </div>
            }
          </section>

          <section class="card stack desk__room">
            <app-audience-preview [snap]="snap()" />
            @if (snap()?.gameType === 'RLGL') {
              <app-signal-panel
                [snap]="snap()"
                [mode]="ses.signalMode"
                (signal)="sendSignal($event)"
                (modeChange)="setMode($event)"
              />
            }
          </section>

          @if (snap()?.standings; as rows) {
            <section class="card stack desk__standings">
              <h2 class="desk__h2">{{ 'host.standings' | t }}</h2>
              <app-standings-table [rows]="rows" [pageSize]="10" />
            </section>
          }
        </main>
      </div>
    }
  `,
  styles: [
    `
      .desk {
        display: flex;
        flex-direction: column;
        block-size: 100dvh;
        overflow: hidden;
      }
      .desk__strip {
        padding: var(--space-2, 8px) var(--space-5, 20px);
        border-block-end: 1px solid var(--elm-light-blue, #bdc9e9);
      }
      .desk__err {
        margin: var(--space-2, 8px) var(--space-5, 20px) 0;
      }
      .desk__main {
        flex: 1;
        min-block-size: 0;
        overflow: auto;
        display: grid;
        grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);
        align-content: start;
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px) var(--space-5, 20px);
      }
      .desk__standings {
        grid-column: 1 / -1;
      }
      .desk__h2 {
        margin: 0;
        font-size: var(--fs-md, 1rem);
      }
      .desk__h3 {
        margin: var(--space-2, 8px) 0 0;
        font-size: var(--fs-sm, 0.875rem);
      }
      .desk__counts {
        display: flex;
        gap: var(--space-3, 12px);
        margin: 0;
      }
      .desk__row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
      }
      .sm {
        min-block-size: 32px;
        padding: 2px 10px;
      }
      @media (max-width: 900px) {
        .desk {
          block-size: auto;
          overflow: visible;
        }
        .desk__main {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class HostComponent implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  readonly rt = inject(RealtimeService);
  readonly locale = inject(LocaleService);

  readonly ceremony = CEREMONY;

  readonly hostKey = signal<string | null>(sessionStorage.getItem(HOST_KEY_STORAGE));
  readonly sessions = signal<HostSession[]>([]);
  readonly session = signal<HostSession | null>(null);
  readonly roster = signal<ParticipantHostView[]>([]);
  readonly err = signal<string | null>(null);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly simCount = signal(20);
  readonly simBusy = signal(false);
  readonly snap = this.rt.snapshot;

  /** Drawers are two-way bound; all of them close on a stage change. */
  readonly rosterOpen = signal(false);
  readonly adminOpen = signal(false);
  readonly rehearsalOpen = signal(false);

  private rosterTimer: ReturnType<typeof setInterval> | null = null;
  private readonly clock = signal(Date.now());
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  readonly onlineCount = computed(() => this.roster().filter((p) => p.connected).length);
  readonly simulatedCount = computed(() => this.roster().filter((p) => p.isSimulated).length);
  readonly canVoid = computed(() => !!this.snap()?.attemptId && !this.snap()?.isPractice);
  readonly tiedCount = computed(() => topThreeTies(this.snap()?.standings ?? [])[0]?.length ?? 0);
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

  /** Mirrors `PrimaryActionComponent` so the secondary row never repeats it. */
  readonly primaryAction = signal<HostAction | null>(null);

  /**
   * Live race counts from the authoritative snapshot (plan §2/§4). Returns
   * real numbers only — never a fabricated zero — so the host can see at a
   * glance how many players are still racing.
   */
  readonly raceCounts = computed(() => {
    const players = this.snap()?.race?.players ?? [];
    return {
      alive: players.filter((p) => p.state === 'alive').length,
      finished: players.filter((p) => p.state === 'finished').length,
      eliminated: players.filter((p) => p.state === 'eliminated').length,
    };
  });

  /** §4: one remaining racer is described, never announced as a "winner". */
  readonly lastSurvivor = computed(() => this.raceCounts().alive === 1);

  constructor() {
    // Stale feedback cannot survive an authoritative state change: whenever the
    // snapshot moves (`seq`/`state`), old errors are dropped and drawers close.
    effect(() => {
      const s = this.snap();
      if (!s) return;
      void s.seq;
      void s.state;
      this.err.set(null);
      this.copied.set(false);
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

  private tr(key: StringKey, params?: Record<string, string | number>): string {
    return this.locale.t(key, params);
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
      this.err.set(describe(e));
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

  async act(action: HostAction, payload: Record<string, unknown> = {}): Promise<void> {
    this.primaryAction.set(action);
    const r = await this.rt.hostAction(action, payload);
    this.err.set(r.ok ? null : (r.error ?? this.tr('error.generic')));
  }

  async sendSignal(color: SignalColor): Promise<void> {
    const r = await this.rt.hostSignal(color);
    if (!r.ok) this.err.set(r.error ?? this.tr('error.generic'));
  }

  async setMode(mode: SignalMode): Promise<void> {
    const s = this.session();
    if (!s) return;
    const u = await this.guard(() => this.api.setSignalMode(s.id, mode));
    if (u) this.session.set(u);
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

  voidRound(): void {
    const reason = prompt(`${this.tr('host.session.voidConsequence')}\n${this.tr('host.session.voidReason')}`);
    if (reason && reason.trim().length >= 3) void this.act('VOID_ROUND', { reason: reason.trim() });
  }

  tieBreak(): void {
    const ids = topThreeTies(this.snap()?.standings ?? [])[0];
    if (ids?.length && confirm(this.tr('host.tiebreak.confirm', { count: ids.length }))) {
      void this.act('START_TIEBREAK', { participantIds: ids });
    }
  }

  async closeSession(): Promise<void> {
    const s = this.session();
    if (!s) return;
    if (!confirm(`${this.tr('host.session.closeConfirm')}\n${this.tr('host.session.closeConsequence')}`)) return;
    if (!confirm(this.tr('host.session.closeConfirm2'))) return;
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
    if (!confirm(this.tr('host.rehearsal.clearConfirm', { count: this.simulatedCount() }))) return;
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
    const name = prompt(this.tr('host.roster.renamePrompt', { name: p.name }), p.name);
    if (s && name && name.trim().length >= 2) {
      await this.guard(() => this.api.rename(s.id, p.id, name.trim()));
      await this.loadRoster();
    }
  }

  async remove(p: ParticipantHostView): Promise<void> {
    const s = this.session();
    if (s && confirm(this.tr('host.roster.removeConfirm', { name: p.name, number: p.number }))) {
      await this.guard(() => this.api.remove(s.id, p.id));
      await this.loadRoster();
    }
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
