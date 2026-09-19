/**
 * Participant phone (§4.3): follows the host-selected stage. Name at the top,
 * task in the centre, one dominant action near the bottom. "Answer locked"
 * only after server acknowledgment. Sound is off by default on phones (§14).
 */
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import type { SignalColor, StandingRow } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';
import { PausedPanelComponent } from '../shared/paused-panel.component';
import { WaitingCardComponent } from '../shared/waiting-card.component';
import { ResultBreakdownComponent } from '../shared/result-breakdown.component';
import { StandingsTableComponent } from '../shared/standings-table.component';
import { RealtimeService, emptyMe } from '../core/realtime.service';
import { loadIdentity, clearIdentity, StoredIdentity } from '../core/storage';
import { TimerComponent } from '../shared/timer.component';
import { HowToPlayComponent } from '../shared/how-to-play.component';
import { HoldButtonComponent } from '../games/hold-button.component';
import { RaceStatePanelComponent } from '../games/race-state-panel.component';
import { EliminationPanelComponent } from '../games/elimination-panel.component';
import { GlobeComponent } from '../games/globe.component';
import { OrderCardsComponent } from '../games/order-cards.component';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    TimerComponent,
    HowToPlayComponent,
    HoldButtonComponent,
    RaceStatePanelComponent,
    EliminationPanelComponent,
    GlobeComponent,
    OrderCardsComponent,
    PausedPanelComponent,
    WaitingCardComponent,
    ResultBreakdownComponent,
    StandingsTableComponent,
  ],
  template: `
    @if (id(); as ident) {
      <!-- role-participant applies the phone type scale (plan section 9). -->
    <main class="page role-participant">
        <header class="row">
          <span class="avatar" aria-hidden="true">{{ ident.avatar }}</span>
          <div>
            <strong>{{ ident.name }}</strong>
            <!--
              §5: a bare "#7" beside a rank badge reads as a rank. The player
              number is now explicitly LABELLED, and the tournament rank is a
              separate labelled badge.
            -->
            <div class="small muted"><bdi>{{ 'play.header.player' | t: { number: ident.number } }}</bdi></div>
          </div>
          <span class="spacer"></span>
          @if (myRank(); as r) {
            <span class="badge badge-warm num">{{ 'play.header.rank' | t: { rank: r.rank, total: r.total } }}</span>
          } @else {
            <!-- Never a stale or invented rank before the reveal. -->
            <span class="badge small">{{ 'play.header.rankPending' | t }}</span>
          }
          <button class="btn btn-secondary lang" (click)="locale.toggle()" [attr.aria-label]="'common.language' | t">{{ 'common.langToggle' | t }}</button>
          <button class="btn btn-secondary help" (click)="help.set(!help())" [attr.aria-label]="'common.help' | t">?</button>
        </header>

        @switch (rt.conn()) {
          @case ('disconnected') { <div class="alert alert-warn" role="alert">⚠ {{ 'play.conn.lost' | t }}</div> }
          @case ('connecting') { <div class="alert alert-info" role="status">{{ 'play.conn.connecting' | t }}</div> }
          @case ('replaced') {
            <div class="alert alert-error" role="alert">{{ 'play.conn.replaced' | t }} <button class="btn btn-secondary" (click)="leave()">{{ 'play.backToJoin' | t }}</button></div>
          }
          @case ('unauthorized') {
            <div class="alert alert-error" role="alert">{{ 'play.conn.unauthorized' | t }} <button class="btn btn-secondary" (click)="leave()">{{ 'play.backToJoin' | t }}</button></div>
          }
        }

        @if (help()) {
          <section class="card stack">
            <app-how-to-play [game]="snap()?.gameType ?? 'RLGL'" />
            <p class="small muted">{{ 'play.scoring.note' | t }}</p>
            <button class="btn btn-secondary" (click)="help.set(false)">{{ 'common.close' | t }}</button>
          </section>
        } @else {
          @if (snap(); as s) {
            @if (s.paused) {
              <app-paused-panel [previousSignal]="s.gameType === 'RLGL' && s.race ? signal() : null" />
            }

            @switch (s.state) {
              @case ('Lobby') {
                <section class="card stack center">
                  <h2>{{ 'play.youreIn' | t }}</h2>
                  <p class="num">{{ 'play.joinedCount' | t: { count: s.participantCount } }}</p>
                  <div class="card-white card">
                    <p class="small" style="margin:0"><strong>{{ 'play.recovery.title' | t }}</strong> — {{ 'play.recovery.note' | t }}</p>
                    <p class="num" style="font-size:24px;letter-spacing:.15em;margin:6px 0 0"><bdi>{{ ident.recoveryCode }}</bdi></p>
                  </div>
                  <p class="small muted">{{ 'play.formatNote' | t }}</p>
                </section>
              }
              @case ('Instructions') {
                <app-how-to-play [game]="s.gameType" />
                <button class="btn btn-lg btn-block" [class.btn-primary]="!ready()" [class.btn-secondary]="ready()" (click)="toggleReady()">
                  {{ (ready() ? 'play.ready.done' : 'play.ready') | t }}
                </button>
                <p class="center small muted num">{{ 'play.ready.count' | t: { ready: s.readyCount, total: s.participantCount } }}</p>
              }
              @case ('Ready') {
                <section class="card stack center">
                  <span class="badge badge-stage">{{ gameTitle() }}</span>
                  <h2>{{ s.isPractice ? ('play.practice' | t) : ('play.round' | t: { n: s.roundNumber, total: s.roundCount }) }}</h2>
                  @if (s.roundPublic?.type === 'GEO') { <p>{{ 'play.getReadyGeo' | t }} <strong><bdi>{{ geoName() }}</bdi></strong></p> }
                  <p class="muted">{{ 'play.waitingHost' | t }}</p>
                </section>
              }
              @case ('Countdown') {
                <section class="card-dark card center stack">
                  <p class="muted" style="color:var(--elm-light-blue)">{{ 'play.startsIn' | t: { label: s.isPractice ? ('play.practice' | t) : ('play.roundShort' | t: { n: s.roundNumber, total: s.roundCount }) } }}</p>
                  <app-timer [endsAt]="s.countdownEndsAt" class="countdown" />
                  @if (s.roundPublic?.type === 'GEO') { <p style="font-size:22px"><bdi>{{ 'play.findCountry' | t: { country: geoName() } }}</bdi></p> }
                </section>
              }
              @case ('RoundActive') { <ng-container *ngTemplateOutlet="arena" /> }
              @case ('InputLocked') {
                <ng-container *ngTemplateOutlet="arena" />
                <div class="alert alert-info center" role="status">{{ 'play.roundClosed' | t }}</div>
              }
              @case ('Reveal') { <ng-container *ngTemplateOutlet="arena" /> }
              @case ('Practice') { <ng-container *ngTemplateOutlet="arena" /> }
              @case ('GameResults') {
                <section class="card stack">
                  <h2><bdi>{{ gameTitle() }}</bdi> — {{ 'state.GameResults' | t }}</h2>
                  @if (mine().result; as res) {
                    <app-result-breakdown
                      [result]="res"
                      [gameType]="snap()?.gameType ?? null"
                      [rankTotal]="s.standings?.length ?? null"
                      [distanceKm]="myDistanceKm()"
                      [pinPlaced]="!!mine().pin"
                      [correctCount]="orderCorrectCount()"
                      [raceOutcome]="raceOutcome()" />
                  }
                  @if (myRank(); as r) {
                    <div class="card-white card center">
                      <p class="muted small" style="margin:0">{{ 'result.tournament' | t }}</p>
                      <p class="num" style="font-size:40px;font-weight:800;margin:0">{{ r.total }}</p>
                      <p class="small num">{{ 'result.rankOf' | t: { rank: r.rank, total: s.standings?.length ?? '–' } }}</p>
                    </div>
                  }
                  <app-waiting-card [state]="s.state" />
                </section>
              }
              @case ('TournamentResults') {
                <section class="card stack center">
                  <h2>{{ 'play.finalHeading' | t }}</h2>
                  @if (myRank(); as r) {
                    <p class="num" style="font-size:44px;font-weight:800;margin:0"><bdi>{{ r.total }}</bdi></p>
                    <p class="num">{{ (r.rank <= 3 ? 'play.podium' : 'play.finished') | t: { rank: r.rank } }}</p>
                    <p class="small muted num"><bdi>{{ 'game.RLGL.short' | t }} {{ r.rlgl }}</bdi> · <bdi>{{ 'game.GEO.short' | t }} {{ r.geo }}</bdi> · <bdi>{{ 'game.ORDER.short' | t }} {{ r.order }}</bdi></p>
                  }
                  <p class="small muted">{{ 'play.thanks' | t }}</p>
                </section>
                <!--
                  §5/§8: final standings always carry the personal card plus
                  search and "Show me", so a player never has to page through
                  50+ rows to find their own result.
                -->
                @if (s.standings; as rows) {
                  <section class="card stack">
                    <app-standings-table
                      [rows]="rows"
                      [pageSize]="10"
                      [highlight]="ident.participantId"
                      [searchable]="true"
                      [revealed]="true" />
                  </section>
                }
              }
              @case ('Closed') {
                <section class="card center stack"><h2>{{ 'play.sessionEnded' | t }}</h2><button class="btn btn-secondary" (click)="leave()">{{ 'play.leave' | t }}</button></section>
              }
              @default {
                <app-waiting-card [state]="s.state" />
              }
            }
          } @else {
            <section class="card center"><p class="muted">{{ 'common.loading' | t }}</p></section>
          }
        }

        <footer class="center small muted">{{ 'app.builtUsing' | t }}</footer>
      </main>

      <!-- Game arena: shared by RoundActive / InputLocked / Reveal / Practice -->
      <ng-template #arena>
        @if (snap(); as s) {
          @if (s.roundPublic; as rp) {
            <div class="row">
              <span class="badge badge-stage num">{{ s.isPractice ? ('play.practice' | t) : ('play.roundShort' | t: { n: s.roundNumber, total: s.roundCount }) }}</span>
              <span class="spacer"></span>
              @if (s.state === 'RoundActive' || s.state === 'Countdown') {
                <app-timer [endsAt]="s.deadlineAt" [frozenMs]="s.paused ? s.remainingMs : null" class="round-timer" />
              }
            </div>

            @switch (rp.type) {
              @case ('RLGL') {
                <!--
                  Plan §3/§4: ONE primary panel. A confirmed elimination
                  replaces the whole game panel immediately — it does not wait
                  for a reveal, a signal change or the end of the round.
                -->
                @if (rt.amEliminated()) {
                  <app-elimination-panel
                    [avatar]="ident.avatar"
                    [finalRace]="isFinalRace()"
                    [aliveCount]="aliveCount()"
                    [playEffect]="rt.personalEliminated() !== null" />
                } @else {
                  <app-race-state-panel
                    [life]="rt.myLife()"
                    [color]="signal()"
                    [holding]="holding()"
                    [paused]="s.paused"
                    [connected]="rt.conn() === 'connected'"
                    [countdown]="s.state === 'Countdown'"
                    [timeEnded]="s.state === 'InputLocked'"
                    [active]="s.state === 'RoundActive'" />

                  <!-- Progress stays visible while the player is still in. -->
                  <div class="track" aria-hidden="true">
                    <div class="fill" [style.width.%]="mine().race?.progress ?? 0"></div>
                    <div class="runner" [style.left.%]="mine().race?.progress ?? 0">{{ ident.avatar }}</div>
                  </div>
                  <p class="center num">{{ 'race.progress' | t: { n: trackPct() } }}</p>

                  <!--
                    The pad is rendered ONLY in states where movement is possible.
                    On RED it is present and enabled (input must still be sent for
                    the elimination rule) but labelled "DO NOT PRESS".
                  -->
                  @if (padVisible()) {
                    <app-hold-button
                      [color]="signal()"
                      [enabled]="padEnabled()"
                      [overlayOpen]="helpOpen()"
                      (hold)="onHold($event)" />
                  }
                }
                @if (s.reveal?.type === 'RLGL') {
                  @if (mine().result; as r) {
                    <div class="card-white card center pop"><strong>{{ r.label }}</strong></div>
                  }
                }
              }
              @case ('GEO') {
                <h2 class="center"><bdi>{{ 'play.findCountry' | t: { country: geoName() } }}</bdi></h2>
                <p class="center small muted">{{ pinStatusKey() | t }}</p>
                <app-globe
                  [interactive]="s.state === 'RoundActive' && !s.paused && !mine().locked"
                  [pin]="mine().pin"
                  [reveal]="geoReveal()"
                  (pinPlaced)="placePin($event)" />
                @if (mine().result; as r) {
                  <div class="card-white card center pop"><strong>{{ r.label }}</strong></div>
                } @else if (mine().locked) {
                  <div class="alert alert-info center" role="status">{{ 'play.locked' | t }}</div>
                } @else {
                  <button class="btn btn-primary btn-lg btn-block" [disabled]="!mine().pin || s.state !== 'RoundActive' || s.paused || busy()" (click)="lockPin()">
                    {{ (mine().pin ? 'play.lockPin' : 'play.tapGlobeFirst') | t }}
                  </button>
                  @if (mine().pin && mine().saved) { <p class="small muted center">{{ 'play.pinSaved' | t }}</p> }
                }
              }
              @case ('ORDER') {
                <section class="card stack">
                  <h2 style="font-size:24px"><bdi>{{ orderPrompt() }}</bdi></h2>
                  <p class="badge badge-lavender" style="align-self:flex-start"><bdi>{{ 'order.direction' | t }}: {{ orderDirection() }}</bdi></p>
                  <p class="small muted" style="margin:0">{{ 'order.firstIsTop' | t }}</p>
                  <!-- Explicit ORDER transition ladder (plan §8). -->
                  <p class="small muted" style="margin:0">{{ orderStatusKey() | t }}</p>
                </section>
                <app-order-cards
                  [cards]="orderCards()"
                  [locked]="mine().locked || s.state !== 'RoundActive' || s.paused"
                  [reveal]="orderReveal()"
                  (orderChange)="changeOrder($event)" />
                @if (mine().result; as r) {
                  <div class="card-white card center pop"><strong>{{ r.label }}</strong>
                    @if (orderExplanation(); as ex) { <p class="small muted" style="margin:6px 0 0">{{ ex }}</p> }
                  </div>
                } @else if (mine().locked) {
                  <div class="alert alert-info center" role="status">{{ 'play.locked' | t }}</div>
                } @else {
                  <button class="btn btn-primary btn-lg btn-block" [disabled]="s.state !== 'RoundActive' || s.paused || busy()" (click)="lockOrder()">{{ 'play.lockOrder' | t }}</button>
                }
              }
            }
            @if (err(); as e) { <div class="alert alert-error" role="alert">{{ e }}</div> }
          }
        }
      </ng-template>
    }
  `,
  styles: [`
    .avatar { font-size: 32px; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; background: var(--elm-pale-blue); border-radius: 50%; border: 2px solid var(--elm-light-blue); }
    .help { min-width: 44px; padding: 0; font-weight: 800; }
    .countdown { font-size: 64px; color: var(--elm-peach); }
    .round-timer { font-size: 40px; }
  `],
})
export class PlayComponent implements OnInit, OnDestroy {
  readonly rt = inject(RealtimeService);
  readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  readonly id = signal<StoredIdentity | null>(null);
  readonly snap = this.rt.snapshot;
  /** Private per-round state for this participant (server-authoritative). */
  readonly mine = computed(() => this.rt.me() ?? emptyMe());
  readonly help = signal(false);

  // ------------------------------------------------ race pad state (plan §3)
  /** Mirrors the pad's hold state so the panel can say "You're moving…". */
  readonly holding = signal(false);

  /** The help sheet is an overlay: opening it must release any active hold. */
  readonly helpOpen = computed(() => this.help());

  /**
   * The pad exists only where movement is genuinely possible. Countdown,
   * pause, death, finish, reconnect and time-up remove it entirely rather
   * than showing a dead control (plan §3).
   */
  readonly padVisible = computed(() => {
    const s = this.snap();
    if (!s || s.state !== 'RoundActive') return false;
    if (s.paused) return false;
    if (this.rt.conn() !== 'connected') return false;
    return this.rt.myLife() === 'alive';
  });

  /**
   * Enabled whenever it is visible — INCLUDING on red. The label changes, the
   * input does not: the server owns the elimination rule and must still see a
   * press on red (plan Notes/Risks).
   */
  readonly padEnabled = computed(() => this.padVisible());

  /** Whole-number track progress for the localized "{n}% of the track" line. */
  readonly trackPct = computed(() => Math.round(this.mine().race?.progress ?? 0));

  /** Real count of players still racing, or null when the race is unknown. */
  readonly aliveCount = computed(() => {
    const players = this.snap()?.race?.players;
    if (!players) return null;
    return players.filter((p) => p.state === 'alive').length;
  });

  /**
   * True on the last race of the game, which changes the elimination closing
   * line so we never promise a next race that does not exist (plan §4).
   */
  readonly isFinalRace = computed(() => {
    const s = this.snap();
    if (!s || s.isPractice) return false;
    return s.roundNumber >= s.roundCount;
  });

  /** Keeps the panel's holding state in step with the pad. */
  onHold(down: boolean): void {
    this.holding.set(down);
    this.rt.sendHold(down);
  }
  readonly busy = signal(false);
  readonly err = signal<string | null>(null);
  /** Local pending order before server save (keeps UI snappy while throttled). */
  private readonly localOrder = signal<string[] | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly gameTitle = computed(() => {
    this.locale.lang();
    const g = this.snap()?.gameType;
    return g ? this.locale.t(`game.${g}` as StringKey) : '';
  });
  /** Country name in the active language (Arabic label travels in the snapshot). */
  readonly geoName = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'GEO') return '';
    return this.locale.lang() === 'ar' ? rp.countryNameAr || rp.countryName : rp.countryName;
  });

  /** ORDER prompt/direction in the active language; option IDs stay untranslated. */
  readonly orderPrompt = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'ORDER') return '';
    return this.locale.lang() === 'ar' ? rp.promptAr || rp.prompt : rp.prompt;
  });
  readonly orderDirection = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'ORDER') return '';
    return this.locale.lang() === 'ar' ? rp.directionAr || rp.direction : rp.direction;
  });

  /** Explicit pin status (plan §5): not placed / saved / locked. */
  readonly pinStatusKey = computed<StringKey>(() => {
    const me = this.mine();
    const s = this.snap();
    // Explicit ladder (plan §8):
    //   No pin -> saved -> locked | accepted at timeout -> waiting -> explained.
    // "Saved" describes DELIVERY only; it is never a correctness hint, and a
    // timeout is explained in words so a zero is never an unexplained failure.
    if (s?.reveal?.type === 'GEO') return 'geo.status.revealed';
    const closed = s?.state === 'InputLocked' || s?.state === 'Reveal';
    if (closed) {
      if (me.locked) return 'geo.status.waiting';
      return me.pin ? 'geo.status.acceptedTimeout' : 'geo.status.noAnswerTimeout';
    }
    if (me.locked) return 'geo.status.locked';
    return me.pin ? 'geo.status.saved' : 'geo.status.none';
  });

  /** The same explicit ladder for ORDER (plan §8). */
  readonly orderStatusKey = computed<StringKey>(() => {
    const me = this.mine();
    const s = this.snap();
    if (s?.reveal?.type === 'ORDER') return 'order.status.revealed';
    const closed = s?.state === 'InputLocked' || s?.state === 'Reveal';
    if (closed) {
      if (me.locked) return 'order.status.waiting';
      return me.order ? 'order.status.acceptedTimeout' : 'order.status.noAnswerTimeout';
    }
    if (me.locked) return 'order.status.locked';
    return me.saved ? 'order.status.saved' : 'order.status.none';
  });
  readonly orderExplanation = computed<string | null>(() => {
    const rv = this.snap()?.reveal;
    if (rv?.type !== 'ORDER') return null;
    return this.locale.lang() === 'ar' ? rv.explanationAr || rv.explanation : rv.explanation;
  });

  /** How many cards ended in the right place — drives the outcome sentence. */
  readonly orderCorrectCount = computed<number | null>(() => {
    const flags = this.orderReveal();
    return flags ? flags.filter(Boolean).length : null;
  });

  /** Distance of my pin from the target country (km); 0 when inside. */
  readonly myDistanceKm = computed<number | null>(() => {
    const rv = this.snap()?.reveal;
    const ident = this.id();
    if (rv?.type !== 'GEO' || !ident) return null;
    return rv.pins.find((p) => p.participantId === ident.participantId)?.distanceKm ?? null;
  });

  /** My end-of-race outcome, for the RLGL outcome sentence. */
  readonly raceOutcome = computed<'finished' | 'eliminated' | 'timeout' | null>(() => {
    const st = this.mine().race?.state;
    if (st === 'finished') return 'finished';
    if (st === 'eliminated') return 'eliminated';
    return this.snap()?.reveal?.type === 'RLGL' ? 'timeout' : null;
  });
  readonly readyLocal = signal(false);
  /** Readiness is server-side; we mirror our last acknowledged toggle locally. */
  readonly ready = computed(() => this.readyLocal());

  readonly signal = computed<SignalColor>(() => {
    const s = this.snap();
    const live = this.rt.lastSignal();
    if (live && s?.race && live.eventId >= s.race.signalEventId) return live.color;
    return s?.race?.signal ?? 'RED';
  });

  readonly myRank = computed<StandingRow | null>(() => {
    const rows = this.snap()?.standings; const ident = this.id();
    return rows && ident ? rows.find((r) => r.participantId === ident.participantId) ?? null : null;
  });

  readonly orderCards = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'ORDER') return [];
    const order = this.localOrder() ?? this.mine().order;
    if (!order) return rp.options;
    const byId = new Map(rp.options.map((o) => [o.id, o]));
    return order.map((id) => byId.get(id)!).filter(Boolean);
  });

  readonly orderReveal = computed<boolean[] | null>(() => {
    const rv = this.snap()?.reveal;
    if (rv?.type !== 'ORDER') return null;
    const ours = this.mine().order ?? this.orderCards().map((c) => c.id);
    return rv.correctOrder.map((id, i) => ours[i] === id);
  });

  readonly geoReveal = computed(() => {
    const rv = this.snap()?.reveal;
    if (rv?.type !== 'GEO') return null;
    const g = (rv as unknown as { geometry?: { type: 'MultiPolygon'; coordinates: number[][][][] } | null; center?: { lat: number; lng: number } | null });
    return {
      geometry: g.geometry ?? null,
      center: g.center ?? null,
      pins: rv.pins.map((p) => ({ lat: p.lat, lng: p.lng, correct: p.distanceKm <= 0 })),
    };
  });

  constructor() {
    // New attempt → clear local draft state; reset readiness when instructions reopen.
    effect(() => {
      const s = this.snap();
      s?.attemptId;
      this.localOrder.set(null);
      if (s?.state !== 'Instructions') this.readyLocal.set(false);
    });
    // Personal elimination event: brief haptic (no sound on phones by default, §14).
    effect(() => { if (this.rt.personalEliminated() !== null && 'vibrate' in navigator) navigator.vibrate?.([120, 60, 120]); });
  }

  ngOnInit(): void {
    const id = loadIdentity();
    if (!id) { void this.router.navigateByUrl('/'); return; }
    this.id.set(id);
    this.rt.connectParticipant(id.token, id.participantId);
  }

  ngOnDestroy(): void { this.rt.disconnect(); }

  async toggleReady(): Promise<void> {
    const next = !this.readyLocal();
    const r = await this.rt.setReady(next);
    if (r.ok) this.readyLocal.set(next);
  }

  placePin(p: { lat: number; lng: number }): void {
    // optimistic draft, then save (throttled server-side; debounce here)
    this.rt.me.set({ ...this.mine(), pin: p });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.rt.sendPin(p.lat, p.lng, false).then((r) => { if (r.ok && r.state) this.rt.me.set(r.state); }), 200);
  }

  async lockPin(): Promise<void> {
    const pin = this.mine().pin; if (!pin) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.busy.set(true); this.err.set(null);
    const r = await this.rt.sendPin(pin.lat, pin.lng, true);
    if (r.ok && r.state) this.rt.me.set(r.state); else this.err.set(this.locale.t(errorKey(r.error)));
    this.busy.set(false);
  }

  changeOrder(order: string[]): void {
    this.localOrder.set(order);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.rt.sendOrder(order, false).then((r) => { if (r.ok && r.state) this.rt.me.set(r.state); }), 250);
  }

  async lockOrder(): Promise<void> {
    const order = this.localOrder() ?? this.mine().order ?? this.orderCards().map((c) => c.id);
    if (order.length !== 4) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.busy.set(true); this.err.set(null);
    const r = await this.rt.sendOrder(order, true);
    if (r.ok && r.state) this.rt.me.set(r.state); else this.err.set(this.locale.t(errorKey(r.error)));
    this.busy.set(false);
  }

  leave(): void { this.rt.disconnect(); clearIdentity(); void this.router.navigateByUrl('/'); }
}

function errorKey(e?: string): StringKey {
  if (!e) return 'error.send';
  if (/too late|closed/i.test(e)) return 'error.tooLate';
  if (/already locked/i.test(e)) return 'error.alreadyLocked';
  if (/too many/i.test(e)) return 'error.slowDown';
  if (/controller/i.test(e)) return 'error.notController';
  return 'error.generic';
}
