/** Local persistence keys (spec §5.1.6): recovery credential stays on the device. */
export const HOST_KEY_STORAGE = 'asas.hostKey';
export const HOST_SESSION_STORAGE = 'asas.hostSessionId';

export interface StoredIdentity {
  joinCode: string;
  sessionId: string;
  participantId: string;
  token: string;
  recoveryCode: string;
  name: string;
  number: number;
  avatar: string;
}

const IDENTITY_KEY = 'asas.identity';

export function loadIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as StoredIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(id: StoredIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

// ---------------------------------------------------------------- language
/**
 * Language preference is persisted PER ROLE, so the host dashboard, the shared
 * display, and each participant phone are independent: a participant switching
 * language must never switch the room (plan §1).
 */
export type Lang = 'en' | 'ar';
export type LangRole = 'participant' | 'host' | 'display';

const LANG_PREFIX = 'asas.lang.';

/** Only 'en'/'ar' are accepted; anything else is treated as absent. */
export function loadLang(role: LangRole): Lang | null {
  try {
    const raw = localStorage.getItem(`${LANG_PREFIX}${role}`);
    return raw === 'en' || raw === 'ar' ? raw : null;
  } catch {
    return null;
  }
}

export function saveLang(role: LangRole, lang: Lang): void {
  try {
    localStorage.setItem(`${LANG_PREFIX}${role}`, lang);
  } catch {
    /* private mode / storage disabled: keep the in-memory preference only */
  }
}

export function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}
