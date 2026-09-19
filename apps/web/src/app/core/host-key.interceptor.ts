/**
 * Attaches the host access key (kept only in sessionStorage, never in code)
 * to host REST calls under /v1/sessions. Participant /v1/join calls are untouched.
 */
import { HttpInterceptorFn } from '@angular/common/http';
import { HOST_KEY_STORAGE } from './storage';

export const hostKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/v1/sessions')) {
    const key = sessionStorage.getItem(HOST_KEY_STORAGE);
    if (key) return next(req.clone({ setHeaders: { 'x-host-key': key } }));
  }
  return next(req);
};
