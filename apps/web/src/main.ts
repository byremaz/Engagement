import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZoneChangeDetection } from '@angular/core';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { hostKeyInterceptor } from './app/core/host-key.interceptor';

/**
 * Clean path -> hash route, e.g. `/host` -> `/#/host`.
 *
 * The router uses hash locations so the bundle can be served as plain files.
 * Someone typing `/display` on the venue machine would otherwise be handed
 * index.html with an empty hash and land on the participant join screen.
 *
 * This lives in the bundle, not in an inline `<script>` in index.html: an
 * inline script is refused by the `script-src 'self'` policy the API sends
 * when it serves this bundle (single-origin deployment, see apps/api/src/main.ts).
 * That server also answers the clean path with a redirect, so this only runs
 * when the bundle is hosted somewhere that does not.
 */
function normalizeLocation(): boolean {
  const base = new URL(document.baseURI).pathname;
  const path = location.pathname;
  if (location.hash || path.indexOf(base) !== 0) return false;
  const rest = path.slice(base.length).replace(/^\/+/, '');
  if (!rest || rest.includes('.')) return false;
  location.replace(`${base}#/${rest}${location.search}`);
  return true;
}

if (!normalizeLocation()) {
  bootstrapApplication(AppComponent, {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes, withHashLocation()),
      provideHttpClient(withInterceptors([hostKeyInterceptor])),
    ],
  }).catch((err: unknown) => console.error(err));
}
