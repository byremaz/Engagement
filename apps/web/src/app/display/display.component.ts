/**
 * Shared large-screen display route (§4.2, plan v2 §4.3).
 *
 * No host controls. Authenticates with a display token (?token=…) issued by the
 * host dashboard. Fixed-viewport 16:9 composition: `height: 100dvh` with
 * `overflow: hidden`, one dominant visual per stage, no document scrolling.
 *
 * Language: the display FOLLOWS the host's `displayLang` from the snapshot; the
 * setup overlay can override it locally. All round content (country names,
 * prompts, cards, explanations) renders in that language.
 *
 * Everything it renders comes from the seq-ordered snapshot, so an animation
 * completing can never advance a stage — only the host can.
 */
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import QRCode from 'qrcode';
import type { GameType, Lang, SignalColor } from '@asas/shared';
import { GAME_ORDER, gameTitle } from '@asas/shared';
import { RealtimeService } from '../core/realtime.service';
import { SoundService } from '../core/sound.service';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import { TimerComponent } from '../shared/timer.component';
import { HowToPlayComponent } from '../shared/how-to-play.component';
import { PausedPanelComponent } from '../shared/paused-panel.component';
import { PodiumComponent } from '../shared/podium.component';
import { GlobeComponent } from '../games/globe.component';
import { LeaderSummaryComponent } from './leader-summary.component';
import { SetupOverlayComponent } from './setup-overlay.component';
import { RaceArenaComponent } from './race-arena.component';

/** Stages where the room is watching the show, so setup chrome fades away. */
const SHOW_STATES = ['Countdown', 'RoundActive', 'InputLocked', 'Reveal'];

@Component({
  selector: 'app-display',
  standalone: true,
  imports: [
    TranslatePipe, TimerComponent, HowToPlayComponent, PausedPanelComponent, GlobeComponent,
    LeaderSummaryComponent, SetupOverlayComponent, RaceArenaComponent, PodiumComponent,
  ],
  template: `
      <div class="display-root role-display">
      @if (!audio.ready()) {
        <div class="gate">
          <h1>{{ 'display.gate.title' | t }}</h1>
          <p>{{ 'display.gate.body' | t }}</p>
          <button type="button" class="btn btn-primary btn-lg" (click)="start()">{{ 'display.gate.start' | t }}</button>
          @if (!token) { <p class="alert alert-error">{{ 'display.gate.missingToken' | t }}</p> }
        </div>
      } @else if (snap()) {
        @let s = snap()!;
        <app-setup-overlay
          [muted]="audio.muted()"
          [volume]="volumePct()"
          [idle]="isShowing()"
          [fullscreen]="fullscreen()"
          [lang]="lang()"
          [followingHost]="langOverride() === null"
          [reducedEffects]="audio.reducedEffects()"
          (toggleMute)="audio.setMuted(!audio.muted())"
          (volumeChange)="audio.setVolume($event / 100)"
          (toggleFullscreen)="toggleFullscreen()"
          (langChange)="setLang($event)"
          (effectsChange)="audio.setReducedEffects($event)"
        />

        <header class="bar">
          <span class="brand">Elm · <bdi>{{ s.title }}</bdi></span>
          <span class="spacer"></span>
          @if (s.gameType && s.state !== 'Lobby') { <span class="badge badge-stage">{{ gameName() }}</span> }
          @if (rt.conn() !== 'connected') { <span class="badge badge-stop">⚠ {{ 'display.reconnecting' | t }}</span> }
        </header>

        <main class="stage">
          @if (s.paused) {
            <app-paused-panel [previousSignal]="signal()" />
          }

          @switch (s.state) {
            @case ('Lobby') {
              <section class="lobby">
                <div>
                  <h1><bdi>{{ s.title }}</bdi></h1>
                  <p>{{ 'display.scanToJoin' | t }}</p>
                  <p class="code num">{{ s.joinCode }}</p>
                  <p class="num">{{ 'display.joined' | t: { count: s.participantCount } }}{{ s.joinOpen ? '' : ' · ' + ('display.joiningClosed' | t) }}</p>
                  <p class="sub">{{ 'display.format' | t }}</p>
                </div>
                <div class="qr-frame">@if (qr(); as q) { <img [src]="q" [alt]="'display.qrAlt' | t" /> }</div>
              </section>
            }
            @case ('Instructions') {
              <app-how-to-play [game]="s.gameType" [large]="true" />
              <p class="wait num">{{ 'display.readyCount' | t: { ready: s.readyCount, total: s.participantCount } }}</p>
            }
            @case ('Ready') {
              <section class="center">
                <h1>{{ roundLabel() }}</h1>
                @if (geoName()) { <h2>{{ 'display.find' | t: { country: geoName() } }}</h2> }
                <p class="wait">{{ 'display.waitingHostRound' | t }}</p>
              </section>
            }
            @case ('Countdown') {
              <section class="center">
                <h2>{{ 'display.startsIn' | t: { label: roundLabel() } }}</h2>
                <app-timer [endsAt]="s.countdownEndsAt" class="cd" (secondChanged)="onCountdownSecond($event)" />
                @if (geoName()) { <h2>{{ 'display.find' | t: { country: geoName() } }}</h2> }
              </section>
            }
            @case ('GameResults') {
              <section class="results">
                @if ((s.podiumStep ?? 0) < 4) {
                  <h1 class="center title"><bdi>{{ 'podium.game' | t: { game: gameName() } }}</bdi></h1>
                  <app-podium [rows]="s.standings ?? []" [step]="s.podiumStep ?? 0" [large]="true" />
                } @else {
                  <app-leader-summary scope="game" [gameLabel]="gameName()" [rows]="s.standings ?? []" [page]="s.standingsPage" [playedGames]="playedGames()" />
                }
              </section>
            }
            @case ('TournamentResults') {
              <section class="results">
                @if (s.ceremonyStep < 4) {
                  <h1 class="center title">{{ 'podium.tournament' | t }}</h1>
                  <app-podium [rows]="s.standings ?? []" [step]="s.ceremonyStep" [large]="true" />
                } @else {
                  <app-leader-summary scope="final" [rows]="s.standings ?? []" [page]="s.standingsPage" [playedGames]="playedGames()" />
                }
              </section>
            }
            @case ('Closed') { <h1 class="center">{{ 'display.thanks' | t }}</h1> }
            @default {
              @if (s.roundPublic; as rp) {
                <div class="round-bar">
                  <span class="num">{{ roundLabel() }}</span>
                  @if (s.state === 'RoundActive') {
                    <app-timer [endsAt]="s.deadlineAt" [frozenMs]="s.paused ? s.remainingMs : null" (secondChanged)="onRoundSecond($event)" />
                  }
                  @if (rp.type !== 'RLGL') {
                    <span class="num">{{ 'display.answers' | t: { count: s.responseCount, total: s.participantCount } }}</span>
                  }
                </div>

                @switch (rp.type) {
                  @case ('RLGL') {
                    <!-- The signal is only meaningful while the race runs: a closed round shows no GO/STOP. -->
                    @if (!s.paused && s.state === 'RoundActive') {
                      <div class="signal huge" [class.signal-green]="signal() === 'GREEN'" [class.signal-red]="signal() === 'RED'">
                        <span aria-hidden="true">{{ signal() === 'GREEN' ? '▶' : '■' }}</span>
                        {{ (signal() === 'GREEN' ? 'signal.green.go' : 'signal.red.stop') | t }}
                      </div>
                    }
                    <app-race-arena [race]="s.race" [burst]="burst()" />
                  }
                  @case ('GEO') {
                    <div class="geo">
                      <div>
                        <h1>{{ 'display.find' | t: { country: geoName() } }}</h1>
                        @if (geoInsideCount() !== null) {
                          <p class="num big">{{ 'display.insideCount' | t: { count: geoInsideCount() } }}</p>
                        }
                        @if (fastestLock(); as f) { <p class="num sub">{{ 'display.speedBonus' | t: { sec: f } }}</p> }
                      </div>
                      <app-globe [interactive]="false" [reveal]="geoReveal()" [initialScale]="1" [showYou]="false" />
                    </div>
                  }
                  @case ('ORDER') {
                    <h1 class="prompt"><bdi>{{ orderPrompt() }}</bdi></h1>
                    <p class="badge badge-lavender"><bdi>{{ orderDirection() }}</bdi></p>
                    <ol class="cards">
                      @for (o of orderRows(); track o.id; let i = $index) {
                        <li [class.correct]="o.revealed" class="rise-in" [style.animation-delay.ms]="o.revealed ? i * 180 : 0">
                          <span class="n num">{{ i + 1 }}</span><bdi>{{ o.label }}</bdi>
                          @if (o.revealed) { <span class="chk">✓</span> }
                        </li>
                      }
                    </ol>
                    @if (orderRevealInfo(); as orv) {
                      <p class="sub big"><bdi>{{ orv.explanation }}</bdi> · {{ 'display.perfectAnswers' | t: { count: orv.perfectCount } }}</p>
                    }
                  }
                }

                @if (s.state === 'InputLocked' && !s.paused) { <p class="wait">{{ 'display.roundClosed' | t }}</p> }
                @if (s.reveal && topFive().length) {
                  <div class="row top5">
                    <span class="cap">{{ 'display.topFive' | t }}</span>
                    @for (t of topFive(); track $index) {
                      <span class="badge badge-warm num rise-in" [style.animation-delay.ms]="$index * 150"><bdi>{{ t.name }}</bdi> · {{ t.score }} {{ 'common.pts' | t }}</span>
                    }
                  </div>
                }
              }
            }
          }
        </main>

        <footer class="foot">{{ 'app.builtUsing' | t }}</footer>
      } @else {
        <div class="gate"><p>{{ 'display.connecting' | t }}</p></div>
      }
    </div>
  `,
  styles: [`
    .display-root { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; background: var(--page-bg); }
    .gate { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
    .bar {
      display: flex; align-items: center; gap: 16px;
      padding: 10px 32px; padding-inline-end: 72px;
      background: var(--elm-navy); color: var(--elm-almost-white); font-size: clamp(18px, 1.6vw, 26px);
    }
    .brand { font-weight: 700; unicode-bidi: isolate; }
    .spacer { flex: 1; }
    .stage { flex: 1; min-height: 0; padding: clamp(16px, 2.4vh, 32px) clamp(20px, 3vw, 48px); display: flex; flex-direction: column; gap: clamp(10px, 1.6vh, 20px); overflow: hidden; }
    .foot { text-align: center; padding: 6px; color: var(--elm-muted-indigo); font-size: 16px; }
    .center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
    .title { margin: 0; }
    .lobby { display: grid; grid-template-columns: 1fr auto; gap: clamp(24px, 4vw, 48px); align-items: center; flex: 1; min-height: 0; }
    .code { font-size: clamp(56px, 8vw, 96px); font-weight: 800; letter-spacing: .2em; color: var(--elm-blue); margin: 8px 0; font-variant-numeric: tabular-nums; }
    .sub { color: var(--elm-muted-indigo); }
    .big { font-size: clamp(24px, 2.6vw, 40px); font-weight: 700; }
    .qr-frame { padding: 20px; background: #fff; border: 8px solid var(--elm-blue); border-radius: 16px; }
    .qr-frame img { width: min(34vw, 380px); height: min(34vw, 380px); display: block; }
    .wait { text-align: center; color: var(--elm-purple); font-weight: 600; margin: 0; }
    .cd { font-size: clamp(90px, 16vh, 160px); color: var(--elm-peach); animation: pulse-soft 1s ease-in-out infinite; }
    .round-bar { display: flex; justify-content: space-between; align-items: center; font-size: clamp(20px, 2.2vw, 32px); font-weight: 600; }
    .huge { font-size: clamp(36px, 5vw, 64px); padding: 14px; text-align: center; border-radius: 14px; }
    .geo { display: grid; grid-template-columns: 1fr minmax(0, 58%); gap: 32px; flex: 1; min-height: 0; align-items: center; }
    .geo app-globe { direction: ltr; }
    .prompt { margin: 0; font-size: clamp(24px, 3vw, 44px); }
    .cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; max-width: 900px; min-height: 0; }
    .cards li { display: flex; align-items: center; gap: 20px; background: var(--elm-pale-blue); border: 2px solid var(--elm-light-blue); border-radius: 12px; padding: 12px 20px; font-size: clamp(20px, 2.4vw, 36px); font-weight: 600; }
    .cards li.correct { background: var(--game-go); color: var(--elm-almost-white); border-color: var(--game-go); }
    .n { width: 48px; height: 48px; border-radius: 50%; background: var(--elm-navy); color: var(--elm-almost-white); display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
    .chk { margin-inline-start: auto; }
    .top5 { justify-content: center; flex-wrap: wrap; align-items: center; }
    .cap { font-size: 0.85em; text-transform: uppercase; letter-spacing: .06em; color: var(--elm-muted-indigo); }
    .results { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; }
    app-leader-summary, app-race-arena { flex: 1; min-height: 0; }
    app-podium { flex: 1; min-height: 0; display: flex; align-items: flex-end; }
    @media (prefers-reduced-motion: reduce) { .cd { animation: none; } }
  `],
})
export class DisplayComponent implements OnInit, OnDestroy {
  readonly rt = inject(RealtimeService);
  readonly audio = inject(SoundService);
  private readonly locale = inject(LocaleService);
  private readonly route = inject(ActivatedRoute);

  readonly token = this.route.snapshot.queryParamMap.get('token');
  readonly snap = this.rt.snapshot;
  readonly qr = signal<string | null>(null);
  readonly fullscreen = signal(false);
  /** Local language override from the setup overlay; null = follow the host. */
  readonly langOverride = signal<Lang | null>(null);
  readonly lang = computed<Lang>(() => this.langOverride() ?? this.snap()?.displayLang ?? 'en');
  /** Aggregated elimination burst shown by the arena (plan v2 §5.11). */
  readonly burst = signal<{ names: string[]; count: number; at: number } | null>(null);

  readonly volumePct = computed(() => Math.round(this.audio.volume() * 100));
  readonly isShowing = computed(() => {
    const s = this.snap();
    return !!s && SHOW_STATES.includes(s.state);
  });

  readonly gameName = computed(() => {
    const g = this.snap()?.gameType;
    return g ? gameTitle(g, this.locale.lang()) : '';
  });

  readonly roundLabel = computed(() => {
    const s = this.snap();
    if (!s) return '';
    if (s.isPractice) return this.locale.t('play.practice');
    return this.locale.t('play.round', { n: s.roundNumber, total: s.roundCount });
  });

  private ar(): boolean { return this.locale.lang() === 'ar'; }

  readonly geoName = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'GEO') return '';
    return this.ar() ? rp.countryNameAr || rp.countryName : rp.countryName;
  });
  readonly orderPrompt = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'ORDER') return '';
    return this.ar() ? rp.promptAr || rp.prompt : rp.prompt;
  });
  readonly orderDirection = computed(() => {
    const rp = this.snap()?.roundPublic;
    if (rp?.type !== 'ORDER') return '';
    return this.ar() ? rp.directionAr || rp.direction : rp.direction;
  });

  readonly signal = computed<SignalColor>(() => {
    const s = this.snap();
    const live = this.rt.lastSignal();
    if (live && s?.race && live.eventId >= s.race.signalEventId) return live.color;
    return s?.race?.signal ?? 'RED';
  });

  readonly topFive = computed(() => {
    const r = this.snap()?.reveal;
    return r && r.type !== 'RLGL' ? r.topFive : [];
  });

  readonly geoInsideCount = computed<number | null>(() => {
    const r = this.snap()?.reveal;
    return r?.type === 'GEO' ? r.insideCount : null;
  });

  /** Fastest manual lock among in-country pins, in seconds — the speed bonus made visible. */
  readonly fastestLock = computed<string | null>(() => {
    const r = this.snap()?.reveal;
    if (r?.type !== 'GEO') return null;
    const times = r.pins.filter((p) => p.inside && typeof p.timeMs === 'number').map((p) => p.timeMs as number);
    return times.length ? (Math.min(...times) / 1000).toFixed(1) : null;
  });

  readonly orderRevealInfo = computed<{ explanation: string; perfectCount: number } | null>(() => {
    const r = this.snap()?.reveal;
    if (r?.type !== 'ORDER') return null;
    return { explanation: this.ar() ? r.explanationAr || r.explanation : r.explanation, perfectCount: r.perfectCount };
  });

  readonly orderRows = computed(() => {
    const s = this.snap();
    const rp = s?.roundPublic;
    if (rp?.type !== 'ORDER') return [];
    const ar = this.ar();
    const label = (o: { label: string; labelAr: string }) => (ar ? o.labelAr || o.label : o.label);
    if (s?.reveal?.type === 'ORDER') {
      const byId = new Map(rp.options.map((o) => [o.id, label(o)]));
      return s.reveal.correctOrder.map((id) => ({ id, label: byId.get(id) ?? '', revealed: true }));
    }
    return rp.options.map((o) => ({ id: o.id, label: label(o), revealed: false }));
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

  readonly playedGames = computed<GameType[]>(() => {
    const s = this.snap();
    if (!s) return [];
    const done = ['GameResults', 'TournamentResults', 'Closed'].includes(s.state);
    return GAME_ORDER.filter((_g, i) => i < s.gameIndex || (i === s.gameIndex && done));
  });

  constructor() {
    this.locale.init('display');
    let lastSig = -1;
    let lastState = '';
    let lastStep = -1;
    let lastPodium = -1;
    let lastJoin = '';
    let lastFinished = 0;
    let burstTimer: ReturnType<typeof setTimeout> | null = null;
    let lastElimEvent = -1;
    let pendingBurst: { names: string[]; count: number } | null = null;
    let burstDebounce: ReturnType<typeof setTimeout> | null = null;

    // The display's language follows the host unless overridden locally.
    effect(() => { const l = this.lang(); if (l !== this.locale.lang()) this.locale.set(l); });

    effect(() => {
      const ev = this.rt.lastSignal();
      if (ev && ev.eventId !== lastSig) {
        lastSig = ev.eventId;
        this.audio.play(ev.color === 'GREEN' ? 'go' : 'stop');
      }
    });
    // Simultaneous deaths aggregate into ONE burst + one sound (plan v2 §5.11).
    effect(() => {
      const ev = this.rt.elimination();
      const feed = this.snap()?.race?.eliminationsFeed ?? [];
      if (!ev || ev.eventId === lastElimEvent) return;
      lastElimEvent = ev.eventId;
      const names = feed.find((f) => f.eventId === ev.eventId)?.names ?? [];
      pendingBurst = { names: [...(pendingBurst?.names ?? []), ...names], count: (pendingBurst?.count ?? 0) + ev.count };
      if (burstDebounce) clearTimeout(burstDebounce);
      burstDebounce = setTimeout(() => {
        const b = pendingBurst; pendingBurst = null;
        if (!b) return;
        this.audio.play(b.count >= 3 ? 'eliminationBurst' : 'elimination');
        this.burst.set({ ...b, at: Date.now() });
        if (burstTimer) clearTimeout(burstTimer);
        burstTimer = setTimeout(() => this.burst.set(null), 1800);
      }, 300);
    });
    effect(() => {
      const s = this.snap();
      if (!s) return;
      if (s.state !== lastState) {
        lastState = s.state;
        if (s.state === 'Reveal') this.audio.play('reveal');
        if (s.state === 'RoundActive') this.audio.play('start');
        if (s.state === 'GameResults' || s.state === 'TournamentResults') { lastPodium = -1; lastStep = -1; }
      }
      const finished = s.race?.players.filter((p) => p.state === 'finished').length ?? 0;
      if (s.state === 'RoundActive' && finished > lastFinished) this.audio.play('finish');
      lastFinished = s.state === 'RoundActive' ? finished : 0;
      if (s.state === 'TournamentResults' && s.ceremonyStep !== lastStep) {
        lastStep = s.ceremonyStep;
        if (s.ceremonyStep === 3) this.audio.play('fanfare');
        else if (s.ceremonyStep >= 1 && s.ceremonyStep <= 2) this.audio.play('podium');
      }
      const ps = s.podiumStep ?? 0;
      if (s.state === 'GameResults' && ps !== lastPodium) {
        lastPodium = ps;
        if (ps === 3) this.audio.play('fanfare');
        else if (ps >= 1 && ps <= 2) this.audio.play('podium');
      }
      // The QR follows the join code (a reopened session must never show a stale code).
      if (s.state === 'Lobby' && s.joinCode !== lastJoin) { lastJoin = s.joinCode; void this.makeQr(s.joinCode); }
    });
  }

  ngOnInit(): void {
    if (this.token) this.rt.connectDisplay(this.token);
    document.addEventListener('fullscreenchange', () => this.fullscreen.set(!!document.fullscreenElement));
  }

  ngOnDestroy(): void {
    this.rt.disconnect();
  }

  onCountdownSecond(s: number): void {
    if (s >= 1 && s <= 3) this.audio.play('countdownTick');
  }

  onRoundSecond(s: number): void {
    if (s >= 1 && s <= 3) this.audio.play('countdownTick');
  }

  setLang(l: Lang | null): void {
    this.langOverride.set(l);
  }

  async start(): Promise<void> {
    await this.audio.init();
    this.audio.play('test');
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* optional */
    }
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.();
    } catch {
      /* optional */
    }
  }

  private async makeQr(code: string): Promise<void> {
    const url = `${location.origin}${location.pathname}#/join/${code}`;
    this.qr.set(await QRCode.toDataURL(url, { width: 420, margin: 1, color: { dark: '#051D49', light: '#FFFFFF' } }));
  }
}
