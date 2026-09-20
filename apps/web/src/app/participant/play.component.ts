/**
 * Participant phone (§4.3, plan v2 §4.1): follows the host-selected stage.
 * A fixed header with the player's identity and ONE status chip, a single
 * dominant state panel in the middle, and one control near the bottom.
 * "Answer locked" only after server acknowledgment. Phones are silent by
 * default (§14): vibration is their channel.
 */
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import type { SignalColor, StandingRow } from '@asas/shared';
import { ORDER_POINTS_PER_CARD, ORDER_POINTS_PER_CARD_V2, SCORING_RULE_VERSION, gameTitle } from '@asas/shared';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import type { StringKey } from '../i18n/strings.en';
import { PausedPanelComponent } from '../shared/paused-panel.component';
import { WaitingCardComponent } from '../shared/waiting-card.component';
import { RoundResultCardComponent } from '../shared/round-result-card.component';
import { StandingsTableComponent } from '../shared/standings-table.component';
import { PodiumComponent } from '../shared/podium.component';
import { RealtimeService, emptyMe } from '../core/realtime.service';
import { loadIdentity, clearIdentity, StoredIdentity } from '../core/storage';
import { TimerComponent } from '../shared/timer.component';
import { HowToPlayComponent } from '../shared/how-to-play.component';
import { HoldButtonComponent } from '../games/hold-button.component';
import { RaceStatePanelComponent } from '../games/race-state-panel.component';
import { EliminationPanelComponent } from '../games/elimination-panel.component';
import { RaceChipComponent } from '../games/race-chip.component';
import { ProgressTrackComponent } from '../games/progress-track.component';
import { GlobeComponent } from '../games/globe.component';
import { OrderCardsComponent } from '../games/order-cards.component';
import { PersonalPodiumComponent } from './personal-podium.component';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [
    NgTemplateOutlet, TranslatePipe, TimerComponent, HowToPlayComponent, HoldButtonComponent, RaceStatePanelComponent,
    EliminationPanelComponent, RaceChipComponent, ProgressTrackComponent, GlobeComponent, OrderCardsComponent,
    PausedPanelComponent, WaitingCardComponent, RoundResultCardComponent, StandingsTableComponent, PodiumComponent,
    PersonalPodiumComponent,
  ],
  template: `
    @if (id(); as ident) {
      <main class="page role-participant">
        <header class="row hdr">
          <span class="avatar" aria-hidden="true">{{ ident.avatar }}</span>
          <div class="who">
            <strong><bdi>{{ ident.name }}</bdi></strong>
            <div class="small muted"><bdi>{{ 'play.header.player' | t: { number: ident.number } }}</bdi></div>
          </div>
          <span class="spacer"></span>
          @if (snap(); as s) {
            <app-race-chip [life]="rt.myLife()" [state]="s.state" [paused]="s.paused" [gameType]="s.gameType" [locked]="mine().locked" />
          }
          <span class="pts num" [attr.aria-label]="'common.points' | t"><bdi>{{ myPoints() }}</bdi> <span class="small muted">{{ 'common.pts' | t }}</span></span>
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
            <app-how-to-play [game]="snap()?.gameType ?? 'RLGL'" [showReadyNote]="true" />
            <p class="small muted">{{ 'play.scoring.note' | t }}</p>
            <button class="btn btn-secondary lang" (click)="locale.toggle()" [attr.aria-label]="'common.language' | t">{{ 'common.langToggle' | t }}</button>
            <button class="btn btn-primary" (click)="help.set(false)">{{ 'common.close' | t }}</button>
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
                  <button class="btn btn-secondary" (click)="locale.toggle()">{{ 'common.langToggle' | t }}</button>
                </section>
              }
              @case ('Instructions') {
                <app-how-to-play [game]="s.gameType" [showReadyNote]="true" />
                <button class="btn btn-lg btn-block" [class.btn-primary]="!ready()" [class.btn-secondary]="ready()" (click)="toggleReady()">
                  {{ (ready() ? 'play.ready.done' : 'play.ready') | t }}
                </button>
                <p class="center small muted num">{{ 'play.ready.count' | t: { ready: s.readyCount, total: s.participantCount } }}</p>
              }
              @case ('Ready') {
                <section class="card stack center">
                  <span class="badge badge-stage">{{ gameName() }}</span>
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
                  @if (s.roundPublic?.type === 'RLGL') { <p style="font-size:18px">{{ 'race.countdown.body' | t }}</p> }
                </section>
              }
              @case ('RoundActive') { <ng-container *ngTemplateOutlet="arena" /> }
              @case ('InputLocked') {
                <ng-container *ngTemplateOutlet="arena" />
                <div class="alert alert-info center" role="status">{{ 'play.roundClosed' | t }}</div>
              }
              @case ('Reveal') { <ng-container *ngTemplateOutlet="arena" /> }
              @case ('GameResults') {
                <app-personal-podium
                  [rows]="s.standings ?? []"
                  [tournamentRows]="null"
                  [step]="s.podiumStep ?? 0"
                  [me]="ident.participantId"
                  [game]="s.gameType"
                  [gameIndex]="s.gameIndex" />
                @if (mine().result; as res) {
                  <app-round-result-card [result]="res" [gameType]="s.gameType" [roundNumber]="s.roundCount" [roundCount]="s.roundCount" />
                }
              }
              @case ('TournamentResults') {
                <section class="card stack center">
                  <h2>{{ 'podium.tournament' | t }}</h2>
                  <app-podium [rows]="s.standings ?? []" [step]="s.ceremonyStep" [highlight]="ident.participantId" />
                  @if (myRank(); as r) {
                    <p class="num" style="font-size:44px;font-weight:800;margin:0"><bdi>{{ r.total }}</bdi></p>
                    <p class="num">{{ (r.rank <= 3 ? 'play.podium' : 'play.finished') | t: { rank: r.rank } }}</p>
                    <p class="small muted num"><bdi>{{ 'game.RLGL.short' | t }} {{ r.rlgl }}</bdi> · <bdi>{{ 'game.GEO.short' | t }} {{ r.geo }}</bdi> · <bdi>{{ 'game.ORDER.short' | t }} {{ r.order }}</bdi></p>
                  }
                  <p class="small muted">{{ 'play.thanks' | t }}</p>
                </section>
                @if (s.standings; as rows) {
                  <section class="card stack">
                    <app-standings-table [rows]="rows" [pageSize]="10" [highlight]="ident.participantId" [searchable]="true" [revealed]="true" />
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

        <footer class="center attribution">{{ 'app.builtUsing' | t }}</footer>
      </main>

      <!-- Game arena: shared by RoundActive / InputLocked / Reveal -->
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
                <!-- ONE dominant panel. A confirmed elimination takes over the screen at once (plan v2 §5.3). -->
                @if (rt.amEliminated() && !s.reveal) {
                  <app-elimination-panel
                    [avatar]="ident.avatar"
                    [finalRace]="isFinalRace()"
                    [aliveCount]="aliveCount()"
                    [safePoints]="myPoints()"
                    [playEffect]="rt.personalEliminated() !== null" />
                } @else {
                  <app-race-state-panel
                    [life]="rt.myLife()"
                    [color]="signal()"
                    [holding]="holding()"
                    [paused]="s.paused"
                    [connected]="rt.conn() === 'connected'"
                    [countdown]="s.state === 'Countdown'"
                    [timeEnded]="s.state === 'InputLocked' || s.state === 'Reveal'"
                    [active]="s.state === 'RoundActive'"
                    [progress]="trackPct()" />
                }
                @if (!s.reveal) {
                  <app-progress-track [progress]="mine().race?.progress ?? 0" [avatar]="ident.avatar" [done]="rt.amFinished()" [out]="rt.amEliminated()" />
                }
                @if (padVisible()) {
                  <app-hold-button [color]="signal()" [enabled]="padEnabled()" [overlayOpen]="helpOpen()" (hold)="onHold($event)" />
                }
                @if (s.reveal?.type === 'RLGL' || rt.amEliminated() || rt.amFinished()) {
                  <app-round-result-card
                    [result]="mine().result"
                    [gameType]="'RLGL'"
                    [roundNumber]="s.roundNumber"
                    [roundCount]="s.roundCount"
                    [isPractice]="s.isPractice"
                    [raceOutcome]="raceOutcome()" />
                }
              }
              @case ('GEO') {
                <h2 class="center find"><bdi>{{ 'play.findCountry' | t: { country: geoName() } }}</bdi></h2>
                <p class="center small muted">{{ pinStatusKey() | t: { sec: lockSec() } }}</p>
                <app-globe
                  [interactive]="s.state === 'RoundActive' && !s.paused && !mine().locked"
                  [pin]="mine().pin"
                  [reveal]="geoReveal()"
                  (pinPlaced)="placePin($event)" />
                @if (mine().result; as r) {
                  <app-round-result-card [result]="r" [gameType]="'GEO'" [roundNumber]="s.roundNumber" [roundCount]="s.roundCount" [isPractice]="s.isPractice" [distanceKm]="myDistanceKm()" [pinPlaced]="!!mine().pin" />
                } @else if (mine().locked) {
                  <div class="alert alert-info center" role="status">{{ 'geo.status.lockedIn' | t: { sec: lockSec() } }}</div>
                } @else {
                  <button class="btn btn-primary btn-lg btn-block" [disabled]="!mine().pin || s.state !== 'RoundActive' || s.paused || busy()" (click)="lockPin()">
                    📍 {{ (mine().pin ? 'play.lockPin' : 'play.tapGlobeFirst') | t }}
                  </button>
                }
              }
              @case ('ORDER') {
                <section class="card stack">
                  <h2 style="font-size:22px;margin:0"><bdi>{{ orderPrompt() }}</bdi></h2>
                  <p class="badge badge-lavender" style="align-self:flex-start"><bdi>{{ orderDirection() }}</bdi></p>
                  <p class="small muted" style="margin:0">{{ orderStatusKey() | t: { sec: lockSec() } }}</p>
                </section>
                <app-order-cards
                  [cards]="orderCards()"
                  [locked]="mine().locked || s.state !== 'RoundActive' || s.paused"
                  [reveal]="orderReveal()"
                  [correctOrder]="orderCorrect()"
                  [pointsPerCard]="pointsPerCard()"
                  (orderChange)="changeOrder($event)" />
                @if (mine().result; as r) {
                  <app-round-result-card [result]="r" [gameType]="'ORDER'" [roundNumber]="s.roundNumber" [roundCount]="s.roundCount" [isPractice]="s.isPractice" [correctCount]="orderCorrectCount()" />
                  @if (orderExplanation(); as ex) { <p class="small muted center">{{ ex }}</p> }
                } @else if (mine().locked) {
                  <div class="alert alert-info center" role="status">{{ 'order.status.lockedIn' | t: { sec: lockSec() } }}</div>
                } @else {
                  <button class="btn btn-primary btn-lg btn-block" [disabled]="s.state !== 'RoundActive' || s.paused || busy()" (click)="lockOrder()">✓ {{ 'play.lockOrder' | t }}</button>
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
    .hdr { position: sticky; top: 0; z-index: 5; background: var(--page-bg); padding-block: 4px; }
    .avatar { font-size: 28px; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; background: var(--elm-pale-blue); border-radius: 50%; border: 2px solid var(--elm-light-blue); flex: 0 0 auto; }
    .who { min-width: 0; }
    .who strong { display: block; max-width: 22vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pts { font-weight: 800; font-size: 18px; white-space: nowrap; }
    .help { min-width: 44px; padding: 0; font-weight: 800; }
    .countdown { font-size: 64px; color: var(--elm-peach); }
    .round-timer { font-size: 40px; }
    .find { font-size: clamp(22px, 6vw, 28px); margin: 0; }
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
  readonly holding = signal(false);
  readonly helpOpen = computed(() => this.help());

  /** Last tournament total the server told us (survives across rounds). */
  private readonly lastTotal = signal(0);
  readonly myPoints = computed(() => {
    const row = this.myRank();
    if (row) return row.total;
    const t = this.mine().result?.tournamentTotal;
    return t ?? this.lastTotal();
  });

  /** The pad exists only where movement is genuinely possible. */
  readonly padVisible = computed(() => {
    const s = this.snap();
    if (!s || s.state !== 'RoundActive' || s.paused) return false;
    if (this.rt.conn() !== 'connected') return false;
    return this.rt.myLife() === 'alive';
  });
  /** Enabled whenever visible — INCLUDING on red; the server owns the rule. */
  readonly padEnabled = computed(() => this.padVisible());

  readonly trackPct = computed(() => Math.round(this.mine().race?.progress ?? 0));
  readonly aliveCount = computed(() => {
    const players = this.snap()?.race?.players;
    return players ? players.filter((p) => p.state === 'alive').length : null;
  });
  readonly isFinalRace = computed(() => {
    const s = this.snap();
    return !!s && !s.isPractice && s.roundNumber >= s.roundCount;
  });

  onHold(down: boolean): void {
    this.holding.set(down);
    this.rt.sendHold(down);
  }
  readonly busy = signal(false);
  readonly err = signal<string | null>(null);
  private readonly localOrder = signal<string[] | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly gameName = computed(() => {
    const g = this.snap()?.gameType;
    return g ? gameTitle(g, this.locale.lang()) : '';
  });
  readonly geoName = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'GEO') return '';
    return this.locale.lang() === 'ar' ? rp.countryNameAr || rp.countryName : rp.countryName;
  });
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
  /** Points per card from the frozen rules of THIS session, never hard-coded. */
  readonly pointsPerCard = computed(() => (this.snap()?.scoringRuleVersion === SCORING_RULE_VERSION ? ORDER_POINTS_PER_CARD_V2 : ORDER_POINTS_PER_CARD));

  /** Seconds to the manual lock, shown so the player learns the speed bonus. */
  readonly lockSec = computed(() => {
    const t = this.mine().result?.timeMs ?? this.lockedAtMs();
    return t === null || t === undefined ? '' : (t / 1000).toFixed(1);
  });
  private readonly lockedAtMs = signal<number | null>(null);

  readonly pinStatusKey = computed<StringKey>(() => {
    const me = this.mine();
    const s = this.snap();
    if (s?.reveal?.type === 'GEO') return 'geo.status.revealed';
    const closed = s?.state === 'InputLocked' || s?.state === 'Reveal';
    if (closed) {
      if (me.locked) return 'geo.status.waiting';
      return me.pin ? 'geo.status.acceptedTimeout' : 'geo.status.noAnswerTimeout';
    }
    if (me.locked) return 'geo.status.lockedIn';
    return me.pin ? 'geo.status.saved' : 'geo.status.none';
  });

  readonly orderStatusKey = computed<StringKey>(() => {
    const me = this.mine();
    const s = this.snap();
    if (s?.reveal?.type === 'ORDER') return 'order.status.revealed';
    const closed = s?.state === 'InputLocked' || s?.state === 'Reveal';
    if (closed) {
      if (me.locked) return 'order.status.waiting';
      return me.order ? 'order.status.acceptedTimeout' : 'order.status.noAnswerTimeout';
    }
    if (me.locked) return 'order.status.lockedIn';
    return me.saved || this.localOrder() ? 'order.status.saved' : 'order.status.none';
  });
  readonly orderExplanation = computed<string | null>(() => {
    const rv = this.snap()?.reveal;
    if (rv?.type !== 'ORDER') return null;
    return this.locale.lang() === 'ar' ? rv.explanationAr || rv.explanation : rv.explanation;
  });
  readonly orderCorrect = computed<string[] | null>(() => {
    const rv = this.snap()?.reveal;
    return rv?.type === 'ORDER' ? rv.correctOrder : null;
  });
  readonly orderCorrectCount = computed<number | null>(() => {
    const flags = this.orderReveal();
    return flags ? flags.filter(Boolean).length : null;
  });
  readonly myDistanceKm = computed<number | null>(() => {
    const rv = this.snap()?.reveal;
    const ident = this.id();
    if (rv?.type !== 'GEO' || !ident) return null;
    return rv.pins.find((p) => p.participantId === ident.participantId)?.distanceKm ?? null;
  });
  readonly raceOutcome = computed<'finished' | 'eliminated' | 'timeout' | null>(() => {
    const st = this.rt.myLife();
    if (st === 'finished') return 'finished';
    if (st === 'eliminated') return 'eliminated';
    return this.snap()?.reveal?.type === 'RLGL' ? 'timeout' : null;
  });
  readonly readyLocal = signal(false);
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

  /** Cards in the current arrangement, labelled in the active language (plan v2, BUG-K). */
  readonly orderCards = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'ORDER') return [];
    const ar = this.locale.lang() === 'ar';
    const labelled = rp.options.map((o) => ({ id: o.id, label: ar ? o.labelAr || o.label : o.label }));
    const order = this.localOrder() ?? this.mine().order;
    if (!order) return labelled;
    const byId = new Map(labelled.map((o) => [o.id, o]));
    const arranged = order.map((id) => byId.get(id)).filter((o): o is { id: string; label: string } => !!o);
    // A stale arrangement from another round can never hide the cards.
    return arranged.length === labelled.length ? arranged : labelled;
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
    return {
      geometry: rv.geometry ?? null,
      center: rv.center ?? null,
      pins: rv.pins.map((p) => ({ lat: p.lat, lng: p.lng, correct: p.distanceKm <= 0 })),
    };
  });

  constructor() {
    // New attempt → clear local draft state; reset readiness when instructions reopen.
    effect(() => {
      const s = this.snap();
      s?.attemptId;
      this.localOrder.set(null);
      this.lockedAtMs.set(null);
      if (s?.state !== 'Instructions') this.readyLocal.set(false);
    });
    // Remember the last published total so the header never drops to 0 mid-game.
    effect(() => {
      const t = this.mine().result?.tournamentTotal ?? this.myRank()?.total;
      if (t !== undefined && t !== null) this.lastTotal.set(t);
    });
    // Haptics only (no sound on phones, §14): a strong pattern for elimination, a short one for the finish.
    effect(() => { if (this.rt.personalEliminated() !== null && 'vibrate' in navigator) navigator.vibrate?.([120, 60, 120, 60, 200]); });
    let wasFinished = false;
    effect(() => {
      const fin = this.rt.amFinished();
      if (fin && !wasFinished && 'vibrate' in navigator) navigator.vibrate?.([60]);
      wasFinished = fin;
    });
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
    this.rt.me.set({ ...this.mine(), pin: p });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.rt.sendPin(p.lat, p.lng, false).then((r) => { if (r.ok && r.state) this.rt.me.set(r.state); }), 200);
  }

  /** Active seconds since input opened, for the "locked in n s" feedback. */
  private elapsedActiveMs(): number | null {
    const s = this.snap();
    if (!s?.deadlineAt || !s.roundPublic) return null;
    return Math.max(0, s.roundPublic.durationMs - (s.deadlineAt - this.rt.now()));
  }

  async lockPin(): Promise<void> {
    const pin = this.mine().pin; if (!pin) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.busy.set(true); this.err.set(null);
    const t = this.elapsedActiveMs();
    const r = await this.rt.sendPin(pin.lat, pin.lng, true);
    if (r.ok && r.state) { this.rt.me.set(r.state); this.lockedAtMs.set(t); } else this.err.set(this.locale.t(errorKey(r.error)));
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
    const t = this.elapsedActiveMs();
    const r = await this.rt.sendOrder(order, true);
    if (r.ok && r.state) { this.rt.me.set(r.state); this.lockedAtMs.set(t); } else this.err.set(this.locale.t(errorKey(r.error)));
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
