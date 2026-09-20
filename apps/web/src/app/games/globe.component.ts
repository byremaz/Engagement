/**
 * Pin the Country globe (§7.2, §13.5): orthographic canvas globe rendered
 * with d3-geo from world-atlas 110m (same dataset the server scores against).
 * Drag rotates, wheel/pinch zooms, tap places the pin. A flat equirectangular
 * fallback is used when the globe cannot render (§7.2).
 */
import { AfterViewInit, Component, DestroyRef, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../i18n/t.pipe';
import { LocaleService } from '../i18n/locale.service';
import { geoOrthographic, geoEquirectangular, geoPath, geoGraticule10, GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

export interface RevealHighlight {
  /** GeoJSON MultiPolygon coordinates of the target country. */
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } | null;
  center: { lat: number; lng: number; zoom?: number } | null;
  /** Other players' pins to draw after reveal. */
  pins: { lat: number; lng: number; correct: boolean }[];
}

interface Land { type: 'FeatureCollection'; features: unknown[] }

let landCache: Promise<Land> | null = null;
function loadLand(): Promise<Land> {
  if (!landCache) {
    landCache = fetch('geo/countries-110m.json')
      .then((r) => r.json())
      .then((topo: Topology) => feature(topo, topo.objects['countries'] as GeometryCollection) as unknown as Land);
  }
  return landCache;
}

@Component({
  selector: 'app-globe',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="globe-wrap" [class.flat]="flat()">
      <canvas #canvas
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="cancel()"
        (wheel)="wheel($event)" role="img" [attr.aria-label]="(pin() ? 'geo.aria.pinned' : 'geo.aria.noPin') | t"></canvas>
      @if (reveal()) {
        <!-- Reveal legend: the dots mean nothing without it (plan v2 §5.8). -->
        <p class="hint small legend">{{ (showYou() ? 'geo.legend' : 'display.legendRoom') | t }}</p>
      }
      @if (interactive()) {
        <!-- Hint sits top-start so it never covers the likely target or the pin (plan §5). -->
        <p class="hint small">{{ 'geo.rotateHint' | t }}</p>
        <div class="controls">
          <button type="button" class="btn btn-secondary" (click)="zoom(1.3)" [attr.aria-label]="'geo.zoomIn' | t">+</button>
          <button type="button" class="btn btn-secondary" (click)="zoom(1/1.3)" [attr.aria-label]="'geo.zoomOut' | t">−</button>
          <button type="button" class="btn btn-secondary" (click)="resetView()">{{ 'geo.resetView' | t }}</button>
          <button type="button" class="btn btn-secondary" (click)="toggleFlat()">{{ (flat() ? 'geo.globeView' : 'geo.flatView') | t }}</button>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Map geometry is physical: pin it LTR so Arabic never mirrors coordinates (plan §1). */
    :host { display: block; direction: ltr; }
    .globe-wrap { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 70dvh; border-radius: 12px; overflow: hidden; background: var(--elm-navy); touch-action: none; }
    .globe-wrap.flat { aspect-ratio: 2 / 1; }
    /* Landscape and short viewports: give the globe height, not width, so controls stay clear. */
    @media (orientation: landscape) and (max-height: 560px) {
      .globe-wrap { aspect-ratio: auto; height: 58dvh; max-height: none; }
    }
    canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
    .hint { position: absolute; top: 8px; left: 8px; right: 8px; margin: 0; color: var(--elm-pale-blue); background: rgba(5,29,73,.66); border-radius: 8px; padding: 4px 8px; pointer-events: none; text-align: center; }
    .legend { top: auto; bottom: 8px; font-weight: 700; }
    .controls { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .controls .btn { min-height: 44px; padding: 6px 12px; font-size: 15px; background: var(--elm-almost-white); }
    @media (prefers-reduced-motion: reduce) { .hint { transition: none; } }
  `],
})
export class GlobeComponent implements AfterViewInit {
  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly interactive = input(true);
  readonly pin = input<{ lat: number; lng: number } | null>(null);
  readonly reveal = input<RevealHighlight | null>(null);
  readonly initialScale = input(1);
  /** Phone: the legend mentions "you"; the shared display has no "you". */
  readonly showYou = input(true);
  readonly pinPlaced = output<{ lat: number; lng: number }>();

  readonly flat = signal(false);
  private readonly locale = inject(LocaleService);
  private land: Land | null = null;
  private rotation: [number, number] = [-45, -25];
  private scale = 1;
  private dragging = false;
  private lastPt: [number, number] | null = null;
  private moved = false;
  private pinchDist: number | null = null;
  private pointers = new Map<number, [number, number]>();
  private raf = 0;
  private ro: ResizeObserver | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { cancelAnimationFrame(this.raf); cancelAnimationFrame(this.flyRaf); this.ro?.disconnect(); });
    effect(() => { this.pin(); this.reveal(); this.schedule(); });
    // Reveal choreography (plan v2 §5.8): the globe FLIES to the country over
    // ~1.2 s instead of snapping, so the room sees where the answer is.
    effect(() => {
      const r = this.reveal();
      if (r?.center) this.flyTo([-r.center.lng, -r.center.lat], Math.max(this.scale, r.center.zoom ? Math.min(3, r.center.zoom / 2) : 1.6));
    });
  }

  private flyRaf = 0;
  private flyTo(target: [number, number], targetScale: number): void {
    cancelAnimationFrame(this.flyRaf);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from: [number, number] = [...this.rotation];
    const fromScale = this.scale;
    // Shortest way round for longitude.
    let dLng = target[0] - from[0];
    dLng = ((dLng + 540) % 360) - 180;
    const dLat = target[1] - from[1];
    if (reduced) { this.rotation = target; this.scale = targetScale; this.schedule(); return; }
    const start = performance.now();
    const dur = 1200;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.rotation = [from[0] + dLng * e, from[1] + dLat * e];
      this.scale = fromScale + (targetScale - fromScale) * e;
      this.draw();
      if (t < 1) this.flyRaf = requestAnimationFrame(step);
    };
    this.flyRaf = requestAnimationFrame(step);
  }

  ngAfterViewInit(): void {
    this.scale = this.initialScale();
    this.ro = new ResizeObserver(() => this.schedule());
    this.ro.observe(this.canvas().nativeElement.parentElement!);
    void loadLand().then((l) => { this.land = l; this.schedule(); }).catch(() => { this.flat.set(true); this.schedule(); });
    this.schedule();
  }

  resetView(): void { this.rotation = [-45, -25]; this.scale = this.initialScale(); this.schedule(); }
  zoom(f: number): void { this.scale = Math.min(8, Math.max(0.8, this.scale * f)); this.schedule(); }
  toggleFlat(): void { this.flat.update((v) => !v); this.schedule(); }

  // ------------------------------------------------------------ interaction
  down(ev: PointerEvent): void {
    if (!this.interactive()) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (this.pointers.size === 1) { this.dragging = true; this.moved = false; this.lastPt = [ev.clientX, ev.clientY]; }
    else if (this.pointers.size === 2) { this.pinchDist = this.pinchDistance(); this.dragging = false; }
  }
  move(ev: PointerEvent): void {
    if (!this.pointers.has(ev.pointerId)) return;
    this.pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (this.pointers.size === 2 && this.pinchDist) {
      const d = this.pinchDistance();
      this.zoom(d / this.pinchDist); this.pinchDist = d; this.moved = true; return;
    }
    if (!this.dragging || !this.lastPt) return;
    const dx = ev.clientX - this.lastPt[0], dy = ev.clientY - this.lastPt[1];
    if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
    const k = 0.25 / this.scale;
    this.rotation = [this.rotation[0] + dx * k, Math.max(-90, Math.min(90, this.rotation[1] - dy * k))];
    this.lastPt = [ev.clientX, ev.clientY];
    this.schedule();
  }
  up(ev: PointerEvent): void {
    const wasTap = this.dragging && !this.moved && this.pointers.size === 1;
    this.pointers.delete(ev.pointerId);
    if (wasTap) this.placeAt(ev);
    this.dragging = false; this.lastPt = null; this.pinchDist = null;
  }
  cancel(): void { this.pointers.clear(); this.dragging = false; this.lastPt = null; this.pinchDist = null; }
  wheel(ev: WheelEvent): void { if (!this.interactive()) return; ev.preventDefault(); this.zoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15); }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a![0] - b![0], a![1] - b![1]) || 1;
  }

  private placeAt(ev: PointerEvent): void {
    const c = this.canvas().nativeElement;
    const rect = c.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (c.width / rect.width);
    const y = (ev.clientY - rect.top) * (c.height / rect.height);
    const proj = this.projection(c.width, c.height);
    const ll = proj.invert?.([x, y]);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
    // For the orthographic globe, ignore taps outside the disc.
    if (!this.flat()) {
      const back = proj([ll[0], ll[1]]);
      if (!back || Math.hypot(back[0] - x, back[1] - y) > 1) return;
    }
    this.pinPlaced.emit({ lat: Math.max(-90, Math.min(90, ll[1])), lng: ((ll[0] + 540) % 360) - 180 });
  }

  // ------------------------------------------------------------- rendering
  private projection(w: number, h: number): GeoProjection {
    if (this.flat()) {
      return geoEquirectangular().scale((w / (2 * Math.PI)) * this.scale).translate([w / 2, h / 2]).rotate([this.rotation[0], 0]);
    }
    return geoOrthographic().scale((Math.min(w, h) / 2 - 8) * this.scale).translate([w / 2, h / 2]).rotate(this.rotation).clipAngle(90);
  }

  private schedule(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    const c = this.canvas()?.nativeElement;
    if (!c) return;
    const parent = c.parentElement!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(parent.clientWidth * dpr));
    const h = Math.max(1, Math.floor(parent.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const proj = this.projection(w, h);
    const path = geoPath(proj, ctx);
    const css = getComputedStyle(document.documentElement);
    const navy = css.getPropertyValue('--elm-navy').trim() || '#051D49';
    const pale = css.getPropertyValue('--elm-pale-blue').trim() || '#E5E9F6';
    const lightBlue = css.getPropertyValue('--elm-light-blue').trim() || '#BDC9E9';
    const peach = css.getPropertyValue('--elm-peach').trim() || '#FFA168';
    const blue = css.getPropertyValue('--elm-blue').trim() || '#0071CE';
    const orange = css.getPropertyValue('--elm-orange').trim() || '#FF5D36';
    const go = css.getPropertyValue('--game-go').trim() || '#15803D';
    const stop = css.getPropertyValue('--game-stop').trim() || '#A12B2A';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = navy; ctx.fillRect(0, 0, w, h);
    // ocean / sphere
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = '#0a2a66'; ctx.fill();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = lightBlue; ctx.stroke();
    // graticule
    ctx.beginPath(); path(geoGraticule10()); ctx.lineWidth = 0.5 * dpr; ctx.strokeStyle = 'rgba(189,201,233,0.25)'; ctx.stroke();
    // land + boundaries
    if (this.land) {
      ctx.beginPath(); path(this.land as never); ctx.fillStyle = pale; ctx.fill();
      ctx.lineWidth = 0.8 * dpr; ctx.strokeStyle = '#464D7E'; ctx.stroke();
    } else {
      // Canvas text cannot use the pipe, so read the dictionary directly.
      ctx.fillStyle = pale; ctx.font = `${14 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(this.locale.t('geo.loadingMap'), w / 2, h / 2);
    }
    // reveal highlight
    const r = this.reveal();
    if (r?.geometry) {
      ctx.beginPath(); path(r.geometry as never); ctx.fillStyle = peach; ctx.fill();
      ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = blue; ctx.stroke();
      for (const p of r.pins) this.drawPin(ctx, proj, p.lng, p.lat, p.correct ? go : stop, dpr, 5, p.correct ? '✓' : '');
    }
    // own pin
    const pin = this.pin();
    // Reveal: where the country really is (a ring) and, on the phone, a dashed
    // great-circle from MY pin to it: "where did I put it, where was it?"
    if (r?.center) {
      if (pin && this.showYou() && this.frontSide(proj, pin.lng, pin.lat) && this.frontSide(proj, r.center.lng, r.center.lat)) {
        ctx.beginPath();
        path({ type: 'LineString', coordinates: [[pin.lng, pin.lat], [r.center.lng, r.center.lat]] } as never);
        ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = '#F7F8FC'; ctx.stroke();
        ctx.setLineDash([]);
      }
      const target = proj([r.center.lng, r.center.lat]);
      if (target && this.frontSide(proj, r.center.lng, r.center.lat)) {
        ctx.beginPath(); ctx.arc(target[0], target[1], 12 * dpr, 0, Math.PI * 2);
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#F7F8FC'; ctx.stroke();
        ctx.beginPath(); ctx.arc(target[0], target[1], 4 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#F7F8FC'; ctx.fill();
      }
    }
    if (pin) this.drawPin(ctx, proj, pin.lng, pin.lat, orange, dpr, 9, '');
  }

  /** True when a point is on the visible hemisphere (always true on the flat map). */
  private frontSide(proj: GeoProjection, lng: number, lat: number): boolean {
    if (this.flat()) return true;
    const pt = proj([lng, lat]);
    if (!pt) return false;
    const inv = proj.invert?.(pt);
    return !!inv && Math.abs(inv[0] - lng) <= 1 && Math.abs(inv[1] - lat) <= 1;
  }

  private drawPin(ctx: CanvasRenderingContext2D, proj: GeoProjection, lng: number, lat: number, color: string, dpr: number, radius: number, mark: string): void {
    const pt = proj([lng, lat]);
    if (!pt) return;
    if (!this.flat()) {
      // hide pins on the far side of the globe
      const inv = proj.invert?.(pt);
      if (!inv || Math.abs(inv[0] - lng) > 1 || Math.abs(inv[1] - lat) > 1) return;
    }
    ctx.beginPath(); ctx.arc(pt[0], pt[1], radius * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#051D49'; ctx.stroke();
    if (mark) { ctx.fillStyle = '#F7F8FC'; ctx.font = `bold ${radius * 1.4 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark, pt[0], pt[1]); }
  }
}
