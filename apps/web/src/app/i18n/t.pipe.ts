/**
 * TranslatePipe — `{{ 'play.locked' | t }}` / `{{ 'play.round' | t: { n, total } }}`.
 *
 * The pipe is IMPURE on purpose but cheap: it reads `LocaleService.lang()`, a
 * signal, so Angular re-evaluates it when the language changes and templates
 * re-render WITHOUT a reload and without creating a new identity (plan §1).
 */
import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from './locale.service';
import type { StringKey } from './strings.en';

@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);

  /**
   * `key` is widened to `string` because several templates compose a key from
   * authoritative snapshot enums (`'state.' + s.state`, `'game.' + g`), which
   * TypeScript cannot narrow to a literal. Unknown keys fall back to English
   * and then to the key text itself, so a typo is visible but never fatal.
   */
  transform(key: StringKey | string, params?: Record<string, string | number | null | undefined>): string {
    // Reading the signal registers the dependency for change detection.
    this.locale.lang();
    return this.locale.t(key as StringKey, params);
  }
}
