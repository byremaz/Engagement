/**
 * In-app confirmation dialogs (plan v2 §5.14) — replaces the browser's
 * `prompt()` / `confirm()`, which are unstyled, untranslatable and block the
 * live-event laptop. The service holds the request; `ConfirmDialogComponent`
 * renders it once at the host root.
 */
import { Injectable, signal } from '@angular/core';
import type { StringKey } from '../i18n/strings.en';

export interface DialogRequest {
  titleKey: StringKey;
  bodyKey?: StringKey;
  params?: Record<string, string | number>;
  confirmKey?: StringKey;
  cancelKey?: StringKey;
  /** Burgundy confirm button for destructive actions. */
  danger?: boolean;
  /** Ask for text (void reason, new name). `minLength` gates the confirm button. */
  input?: { labelKey: StringKey; initial?: string; minLength?: number; maxLength?: number };
}

export interface DialogState extends DialogRequest {
  resolve: (value: string | null) => void;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogState | null>(null);

  /** Resolves with the entered text (or '' for a plain confirm), or null when cancelled. */
  confirm(req: DialogRequest): Promise<string | null> {
    this.current()?.resolve(null);
    return new Promise((resolve) => this.current.set({ ...req, resolve }));
  }

  close(value: string | null): void {
    const cur = this.current();
    this.current.set(null);
    cur?.resolve(value);
  }
}
