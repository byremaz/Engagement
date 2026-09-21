/**
 * Avatar catalogue — the single source of truth for BOTH the API and the web
 * app. The server only ever accepts avatars from this allow-list (a free-form
 * string from a client must never reach the public display) and the join
 * screen renders its picker from the same list.
 */
export const AVATARS = [
  '🦊',
  '🐼',
  '🦁',
  '🐸',
  '🐙',
  '🦉',
  '🐧',
  '🦄',
  '🐢',
  '🐝',
  '🦋',
  '🐬',
  '🦜',
  '🐨',
  '🦖',
  '🐳',
] as const;

export type Avatar = (typeof AVATARS)[number];

/** True when the value is one of the sanctioned avatars (server-side allow-list check). */
export function isAllowedAvatar(value: unknown): value is Avatar {
  return typeof value === 'string' && (AVATARS as readonly string[]).includes(value);
}

/** Deterministic fallback used when the participant did not pick one (legacy behaviour). */
export function defaultAvatarFor(number: number): Avatar {
  return AVATARS[(number - 1) % AVATARS.length] ?? AVATARS[0];
}
