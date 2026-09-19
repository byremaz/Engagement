/**
 * Shared large-screen display route (§4.2, plan §4).
 *
 * No host controls. Authenticates with a display token (?token=…) issued by the
 * host dashboard. Fixed-viewport 16:9 composition: `height: 100dvh` with
 * `overflow: hidden`, one dominant visual per stage, no document scrolling.
 *
 * Everything it renders comes from the seq-ordered snapshot, so an animation
 * completing can never advance a stage — only the host can (plan §4).
 */
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import QRCode from 'qrcode';
import type { GameType, SignalColor } from '@asas/shared';
import { GAME_ORDER, gameTitle } from '@asas/shared';
import { RealtimeService } from '../core/realtime.service';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/t.pipe';
import { TimerComponent } from '../shared/timer.component';
import { HowToPlayComponent } from '../shared/how-to-play.component';
import { PausedPanelComponent } from '../shared/paused-panel.component';
import { GlobeComponent } from '../games/globe.component';
import { DisplayAudioService } from './display-audio.service';
import { LeaderSummaryComponent } from './leader-summary.component';
import { TiedLeadersComponent } from './tied-leaders.component';
import { SetupOverlayComponent } from './setup-overlay.component';
import { RaceArenaComponent } from './race-arena.component';

/** Stages where the room is watching the show, so setup chrome fades away. */
const SHOW_STATES = ['Countdown', 'RoundActive', 'InputLocked', 'Reveal'];

@Component({
  selector: 'app-display',
  standalone: true,
  imports: [
    TranslatePipe, TimerComponent, HowToPlayComponent, PausedPanelComponent, GlobeComponent,
    LeaderSummaryComponent, TiedLeadersComponent, SetupOverlayComponent, RaceArenaComponent,
  ],
  template: `
      <!-- role-display: back-of-room type scale (plan section 9). -->
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
          (toggleMute)="audio.setMuted(!audio.muted())"
          (volumeChange)="audio.setVolume($event / 100)"
          (toggleFullscreen)="toggleFullscreen()"
        />

        <header class="bar">
          <span class="brand">Elm · <bdi>{{ s.title }}</bdi></span>
          <span class="spacer"></span>
          @if (s.gameType && s.state !== 'Lobby') { <span class="badge badge-stage">{{ gameName() }}</span> }
          @if (rt.conn() !== 'connected') { <span class="badge badge-stop">⚠ {{ 'display.reconnecting' | t }}</span> }
        </header>

        <main class="stage">
          <!-- PAUSED is the dominant instruction, above every game visual (plan §3). -->
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
                <app-timer [endsAt]="s.countdownEndsAt" class="cd" />
                @if (geoName()) { <h2>{{ 'display.find' | t: { country: geoName() } }}</h2> }
              </section>
            }
            @default {
              @if (s.roundPublic; as rp) {
                <div class="round-bar">
                  <span class="num">{{ roundLabel() }}</span>
                  @if (s.state === 'RoundActive') {
                    <app-timer [endsAt]="s.deadlineAt" [frozenMs]="s.paused ? s.remainingMs : null" />
                  }
                  @if (rp.type !== 'RLGL') {
                    <span class="num">{{ 'display.answers' | t: { count: s.responseCount, total: s.participantCount } }}</span>
                  }
                </div>

                @switch (rp.type) {
                  @case ('RLGL') {
                    <!-- Signal keeps dominance only while NOT paused. -->
                    @if (!s.paused) {
                      <div class="signal huge" [class.signal-green]="signal() === 'GREEN'" [class.signal-red]="signal() === 'RED'">
                        {{ (signal() === 'GREEN' ? 'signal.green.go' : 'signal.red.stop') | t }}
                      </div>
                    }
                    <app-race-arena [race]="s.race" />
                  }
                  @case ('GEO') {
                    <div class="geo">
                      <div>
                        <h1>{{ 'display.find' | t: { country: rp.countryName } }}</h1>
                        @if (geoInsideCount() !== null) {
                          <p class="num">{{ 'display.insideCount' | t: { count: geoInsideCount() } }}</p>
                        }
                      </div>
                      <app-globe [interactive]="false" [reveal]="geoReveal()" [initialScale]="1" />
                    </div>
                  }
                  @case ('ORDER') {
                    <h1 class="prompt">{{ rp.prompt }}</h1>
                    <p class="badge badge-lavender">{{ rp.direction }}</p>
                    <ol class="cards">
                      @for (o of orderRows(); track o.id; let i = $index) {
                        <li [class.correct]="o.revealed">
                          <span class="n num">{{ i + 1 }}</span><bdi>{{ o.label }}</bdi>
                          @if (o.revealed) { <span class="chk">✓</span> }
                        </li>
                      }
                    </ol>
                    @if (orderRevealInfo(); as orv) {
                      <p class="sub">{{ orv.explanation }} · {{ 'display.perfectAnswers' | t: { count: orv.perfectCount } }}</p>
                    }
                  }
                }

                @if (s.state === 'InputLocked' && !s.paused) { <p class="wait">{{ 'display.roundClosed' | t }}</p> }
                @if (s.reveal && topFive().length) {
                  <div class="row top5">
                    @for (t of topFive(); track $index) {
                      <span class="badge badge-warm num"><bdi>{{ t.name }}</bdi> {{ t.score }}</span>
                    }
                  </div>
                }
              }

              @if (s.state === 'GameResults') {
                <app-leader-summary
                  scope="game"
                  [gameLabel]="gameName()"
                  [rows]="s.standings ?? []"
                  [page]="s.standingsPage"
                  [playedGames]="playedGames()"
                />
              }

              @if (s.state === 'TournamentResults') {
                @if (s.ceremonyStep < 4) {
                  <section class="ceremony">
                    <h1>{{ 'display.finalResults' | t }}</h1>
                    <!-- Real ranks: ten tied leaders render as a tied band, not a fake podium. -->
                    <app-tied-leaders [rows]="s.standings ?? []" [depth]="ceremonyDepth()" />
                  </section>
                } @else {
                  <app-leader-summary
                    scope="final"
                    [rows]="s.standings ?? []"
                    [page]="s.standingsPage"
                    [playedGames]="playedGames()"
                  />
                }
              }

              @if (s.state === 'Closed') { <h1 class="center">{{ 'display.thanks' | t }}</h1> }
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
    /* Fixed-viewport composition: the display never scrolls in normal flow. */
    .display-root {
      height: 100dvh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--page-bg);
    }
    .gate { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }

    .bar {
      display: flex; align-items: center; gap: 16px;
      padding: 10px 32px; padding-inline-end: 72px; /* clear of the setup trigger */
      background: var(--elm-navy); color: var(--elm-almost-white); font-size: clamp(18px, 1.6vw, 26px);
    }
    .brand { font-weight: 700; unicode-bidi: isolate; }
    .spacer { flex: 1; }

    .stage {
      flex: 1;
      min-height: 0;
      padding: clamp(16px, 2.4vh, 32px) clamp(20px, 3vw, 48px);
      display: flex; flex-direction: column; gap: clamp(10px, 1.6vh, 20px);
      overflow: hidden;
    }
    .foot { text-align: center; padding: 6px; color: var(--elm-muted-indigo); font-size: 16px; }

    .center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; }
    .lobby { display: grid; grid-template-columns: 1fr auto; gap: clamp(24px, 4vw, 48px); align-items: center; flex: 1; min-height: 0; }
    .code { font-size: clamp(56px, 8vw, 96px); font-weight: 800; letter-spacing: .2em; color: var(--elm-blue); margin: 8px 0; font-variant-numeric: tabular-nums; }
    .sub { color: var(--elm-muted-indigo); }
    .qr-frame { padding: 20px; background: #fff; border: 8px solid var(--elm-blue); border-radius: 16px; }
    .qr-frame img { width: min(34vw, 380px); height: min(34vw, 380px); display: block; }

    .wait { text-align: center; color: var(--elm-purple); font-weight: 600; margin: 0; }
    .cd { font-size: clamp(90px, 16vh, 160px); color: var(--elm-peach); }
    .round-bar { display: flex; justify-content: space-between; align-items: center; font-size: clamp(20px, 2.2vw, 32px); font-weight: 600; }
    .huge { font-size: clamp(36px, 5vw, 64px); padding: 14px; text-align: center; border-radius: 14px; }

    .geo { display: grid; grid-template-columns: 1fr minmax(0, 58%); gap: 32px; flex: 1; min-height: 0; align-items: center; }
    /* Globe geometry stays physically LTR in both languages (plan §1). */
    .geo app-globe { direction: ltr; }

    .prompt { margin: 0; font-size: clamp(24px, 3vw, 44px); }
    /* ORDER stays top-to-bottom and LTR-anchored so "first" never flips. */
    .cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; max-width: 900px; min-height: 0; }
    .cards li {
      display: flex; align-items: center; gap: 20px;
      background: var(--elm-pale-blue); border: 2px solid var(--elm-light-blue);
      border-radius: 12px; padding: 12px 20px;
      font-size: clamp(20px, 2.4vw, 36px); font-weight: 600;
    }
    .cards li.correct { background: var(--game-go); color: var(--elm-almost-white); }
    .n { width: 48px; height: 48px; border-radius: 50%; background: var(--elm-navy); color: var(--elm-almost-white); display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
    .chk { margin-inline-start: auto; }

    .top5 { justify-content: center; flex-wrap: wrap; }
    .ceremony { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px; }
    .ceremony h1 { text-align: center; margin: 0; }

    app-leader-summary, app-tied-leaders { flex: 1; min-height: 0; }
    app-race-arena { flex: 1; min-height: 0; }
  `],
})
export class DisplayComponent implements OnInit, OnDestroy {
  readonly rt = inject(RealtimeService);
  readonly audio = inject(DisplayAudioService);
  private readonly locale = inject(LocaleService);
  private readonly route = inject(ActivatedRoute);

  readonly token = this.route.snapshot.queryParamMap.get('token');
  readonly snap = this.rt.snapshot;
  readonly qr = signal<string | null>(null);

  readonly volumePct = computed(() => Math.round(this.audio.volume() * 100));
  readonly isShowing = computed(() => {
    const s = this.snap();
    return !!s && SHOW_STATES.includes(s.state);
  });

  readonly gameName = computed(() => {
    const g = this.snap()?.gameType;
    return g ? gameTitle(g, this.locale.lang()) : '';
  });

  /** Localized "Practice" / "Round n of m" heading. */
  readonly roundLabel = computed(() => {
    const s = this.snap();
    if (!s) return '';
    if (s.isPractice) return this.locale.t('play.practice');
    return this.locale.t('play.round', { n: s.roundNumber, total: s.roundCount });
  });

  readonly geoName = computed(() => {
    const rp = this.snap()?.roundPublic;
    return rp?.type === 'GEO' ? rp.countryName : '';
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

  readonly orderRevealInfo = computed<{ explanation: string; perfectCount: number } | null>(() => {
    const r = this.snap()?.reveal;
    return r?.type === 'ORDER' ? { explanation: r.explanation, perfectCount: r.perfectCount } : null;
  });

  readonly orderRows = computed(() => {
    const s = this.snap();
    const rp = s?.roundPublic;
    if (rp?.type !== 'ORDER') return [];
    // Correct order is only known after the host reveals [secure-coding].
    if (s?.reveal?.type === 'ORDER') {
      const byId = new Map(rp.options.map((o) => [o.id, o.label]));
      return s.reveal.correctOrder.map((id) => ({ id, label: byId.get(id) ?? '', revealed: true }));
    }
    return rp.options.map((o) => ({ ...o, revealed: false }));
  });

  readonly geoReveal = computed(() => {
    const rv = this.snap()?.reveal;
    if (rv?.type !== 'GEO') return null;
    const g = rv as unknown as {
      geometry?: { type: 'MultiPolygon'; coordinates: number[][][][] } | null;
      center?: { lat: number; lng: number } | null;
    };
    return {
      geometry: g.geometry ?? null,
      center: g.center ?? null,
      pins: rv.pins.map((p) => ({ lat: p.lat, lng: p.lng, correct: p.distanceKm <= 0 })),
    };
  });

  /**
   * Which games have actually been played. An unplayed game shows "—" on the
   * standings while still contributing its real 0 to `total` (plan §4).
   */
  readonly playedGames = computed<GameType[]>(() => {
    const s = this.snap();
    if (!s) return [];
    const done = ['GameResults', 'TournamentResults', 'Closed'].includes(s.state);
    return GAME_ORDER.filter((_g, i) => i < s.gameIndex || (i === s.gameIndex && done));
  });

  /** Ceremony steps 1-3 reveal third, second, then first place. */
  readonly ceremonyDepth = computed(() => {
    const step = this.snap()?.ceremonyStep ?? 0;
    if (step <= 0) return 0;
    return Math.min(3, step);
  });

  constructor() {
    this.locale.init('display');
    let lastSig = -1;
    let lastElim = -1;
    let lastState = '';
    let lastStep = -1;

    effect(() => {
      const ev = this.rt.lastSignal();
      if (ev && ev.eventId !== lastSig) {
        lastSig = ev.eventId;
        if (ev.color === 'GREEN') this.audio.go();
        else this.audio.red();
      }
    });
    effect(() => {
      const ev = this.rt.elimination();
      if (ev && ev.eventId !== lastElim) {
        lastElim = ev.eventId;
        this.audio.elimination();
      }
    });
    effect(() => {
      const s = this.snap();
      if (!s) return;
      if (s.state !== lastState) {
        lastState = s.state;
        if (s.state === 'Reveal') this.audio.reveal();
        if (s.state === 'RoundActive') this.audio.go();
      }
      if (s.state === 'TournamentResults' && s.ceremonyStep !== lastStep) {
        lastStep = s.ceremonyStep;
        if (s.ceremonyStep >= 1 && s.ceremonyStep <= 3) this.audio.fanfare();
      }
      if (s.state === 'Lobby' && !this.qr()) void this.makeQr(s.joinCode);
    });
  }

  ngOnInit(): void {
    if (this.token) this.rt.connectDisplay(this.token);
  }

  ngOnDestroy(): void {
    this.rt.disconnect();
  }

  async start(): Promise<void> {
    await this.audio.init();
    this.audio.test();
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
