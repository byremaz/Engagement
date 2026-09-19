import { Component, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { LocaleService, type LangRole } from './i18n/locale.service';

/**
 * Root shell. Its only job beyond hosting the outlet is to bind THIS TAB to a
 * language role and keep `<html lang>`/`<html dir>` in sync, so CSS logical
 * properties flip for Arabic (plan §1).
 *
 * The role is derived from the route, because the three surfaces persist their
 * language independently: `/host` -> host, `/display` -> display, everything
 * else (join / play) -> participant. A participant switching language therefore
 * never switches the room.
 */
function roleForUrl(url: string): LangRole {
  const path = url.split('?')[0].split('#')[0];
  if (path.startsWith('/host')) return 'host';
  if (path.startsWith('/display')) return 'display';
  return 'participant';
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);

  private readonly role = signal<LangRole>(roleForUrl(this.router.url));

  constructor() {
    // `effect` below performs the initial bind too, so no eager call is needed.

    // Re-bind if the tab navigates between surfaces (e.g. join -> play stays
    // 'participant'; opening /display in the same tab switches to the display
    // preference) without touching the stored identity or session.
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.role.set(roleForUrl(e.urlAfterRedirects));
    });

    effect(() => {
      const role = this.role();
      this.locale.init(role);
    });
  }
}
