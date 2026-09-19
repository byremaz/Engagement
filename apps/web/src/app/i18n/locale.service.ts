/**
 * LocaleService — signal-backed language + direction state, persisted PER ROLE
 * (`asas.lang.participant`, `asas.lang.host`, `asas.lang.display`) through the
 * existing `core/storage.ts` helpers, so the host dashboard, the shared display
 * and each phone are independent. A participant switching language must never
 * switch the room.
 */
import { Injectable, computed, signal } from '@angular/core';
import { EN, type StringDict, type StringKey } from './strings.en';
import { AR } from './strings.ar';
import { type Lang, type LangRole, loadLang, saveLang } from '../core/storage';

export type { Lang, LangRole };

const DICTS: Record<Lang, StringDict> = { en: EN, ar: AR };

/**
 * Tokens that stand for a number. A missing count renders as an en dash rather
 * than a blank, so "Racing —" reads as "not known yet" instead of looking like
 * a truncated sentence.
 */
const COUNT_TOKENS = new Set([
  'count', 'total', 'n', 'answers', 'racing', 'finished', 'eliminated',
  'alive', 'out', 'rank', 'points', 'score', 'seconds', 'remaining',
  'number', 'shown', 'players',
]);

const NEUTRAL_COUNT = '—';

/** `ngDevMode` is undefined in a production build; treat that as prod. */
const IS_PROD = typeof ngDevMode !== 'undefined' && !ngDevMode;

@Injectable({ providedIn: 'root' })
export class LocaleService {
  /** The role this browser tab acts as; set once by the route component. */
  private role: LangRole = 'participant';

  /** De-duplicates the dev placeholder warnings. */
  private readonly warned = new Set<string>();

  readonly lang = signal<Lang>('en');
  readonly dir = computed<'ltr' | 'rtl'>(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  readonly isRtl = computed(() => this.dir() === 'rtl');

  /** Short label for the toggle button: shows the language you would switch TO. */
  readonly toggleLabel = computed(() => (this.lang() === 'en' ? 'ع' : 'EN'));

  /**
   * Binds this tab to a role and restores its saved preference.
   * `fallback` lets the host push a default language for new participants.
   */
  init(role: LangRole, fallback: Lang = 'en'): void {
    this.role = role;
    this.lang.set(loadLang(role) ?? fallback);
    this.apply();
  }

  set(lang: Lang): void {
    if (lang === this.lang()) return;
    this.lang.set(lang);
    saveLang(this.role, lang);
    this.apply();
  }

  toggle(): void {
    this.set(this.lang() === 'en' ? 'ar' : 'en');
  }

  /**
   * Translate. Missing keys fall back to English and then to the key itself
   * (visible in dev, never crashes a live event).
   *
   * Placeholder safety (plan §2): a `{token}` is NEVER rendered to a player.
   * A missing or null param collapses to an empty string, or to a neutral dash
   * for count-like tokens, so a screen can read "Racing —" but never
   * "Racing {total}". Every substitution miss logs once in dev with the key
   * name so the gap is fixed rather than shipped.
   */
  t(key: StringKey, params?: Record<string, string | number | null | undefined>): string {
    const dict = DICTS[this.lang()];
    const raw = dict[key] ?? EN[key] ?? key;
    if (!raw.includes('{')) return raw;
    return raw.replace(/\{(\w+)\}/g, (_whole, name: string) => {
      const v = params?.[name];
      if (v !== undefined && v !== null && v !== '') return String(v);
      this.warnMissing(key, name);
      return COUNT_TOKENS.has(name) ? NEUTRAL_COUNT : '';
    });
  }

  /** Dev-only, once per key+token, so a live event is never spammed. */
  private warnMissing(key: StringKey, token: string): void {
    const id = `${key}:${token}`;
    if (this.warned.has(id)) return;
    this.warned.add(id);
    if (typeof console !== 'undefined' && !IS_PROD) {
      console.warn(`[i18n] missing param "{${token}}" for key "${key}" — rendered as a placeholder-safe blank.`);
    }
  }

  /** Applies `lang`/`dir` to <html> so CSS logical properties flip correctly. */
  private apply(): void {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    el.setAttribute('lang', this.lang());
    el.setAttribute('dir', this.dir());
  }
}
