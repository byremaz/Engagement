import { Routes } from '@angular/router';

/** Three separate entry points: participant phone (/), shared display (/display), protected host (/host). */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./participant/join.component').then((m) => m.JoinComponent) },
  { path: 'join/:code', loadComponent: () => import('./participant/join.component').then((m) => m.JoinComponent) },
  { path: 'play', loadComponent: () => import('./participant/play.component').then((m) => m.PlayComponent) },
  { path: 'display', loadComponent: () => import('./display/display.component').then((m) => m.DisplayComponent) },
  { path: 'host', loadComponent: () => import('./host/host.component').then((m) => m.HostComponent) },
  { path: '**', redirectTo: '' },
];
