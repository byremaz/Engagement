/**
 * Host control of the shared display's language and the default language for
 * new phones (plan v2 §4.3). The host desk's own language stays independent.
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Lang } from '@asas/shared';
import { TranslatePipe } from '../i18n/t.pipe';

@Component({
  selector: 'app-display-settings',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ds">
      <div class="ds__row">
        <span class="small muted">{{ 'host.display.language' | t }}</span>
        <div class="segmented" role="radiogroup">
          <button type="button" class="btn" role="radio" [attr.aria-checked]="displayLang() === 'ar'" [attr.aria-pressed]="displayLang() === 'ar'" [disabled]="busy()" (click)="displayLangChange.emit('ar')">العربية</button>
          <button type="button" class="btn" role="radio" [attr.aria-checked]="displayLang() === 'en'" [attr.aria-pressed]="displayLang() === 'en'" [disabled]="busy()" (click)="displayLangChange.emit('en')">English</button>
        </div>
      </div>
      <div class="ds__row">
        <span class="small muted">{{ 'host.display.defaultLang' | t }}</span>
        <div class="segmented" role="radiogroup">
          <button type="button" class="btn" role="radio" [attr.aria-checked]="defaultLang() === 'ar'" [attr.aria-pressed]="defaultLang() === 'ar'" [disabled]="busy()" (click)="defaultLangChange.emit('ar')">العربية</button>
          <button type="button" class="btn" role="radio" [attr.aria-checked]="defaultLang() === 'en'" [attr.aria-pressed]="defaultLang() === 'en'" [disabled]="busy()" (click)="defaultLangChange.emit('en')">English</button>
        </div>
      </div>
      <p class="small muted ds__note">{{ 'host.display.follow' | t }}</p>
    </div>
  `,
  styles: [`
    .ds { display: flex; flex-direction: column; gap: var(--space-2); }
    .ds__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
    .ds__note { margin: 0; }
  `],
})
export class DisplaySettingsComponent {
  readonly displayLang = input<Lang>('en');
  readonly defaultLang = input<Lang>('en');
  readonly busy = input(false);
  readonly displayLangChange = output<Lang>();
  readonly defaultLangChange = output<Lang>();
}
