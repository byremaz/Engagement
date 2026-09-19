import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { safeEqual } from './host.guard';

export type TokenRole = 'participant' | 'display';

export interface TokenClaims {
  role: TokenRole;
  sessionId: string;
  participantId?: string;
  controllerId?: string;
  iat: number;
}

/** Compact HMAC-SHA256 signed token: base64url(json).base64url(sig). */
export function signToken(claims: Omit<TokenClaims, 'iat'>, secret: string): string {
  const body = Buffer.from(JSON.stringify({ ...claims, iat: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenClaims | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenClaims;
    return parsed.role && parsed.sessionId ? parsed : null;
  } catch {
    return null;
  }
}

/** Unambiguous alphabet (no 0/O/1/I) for codes read aloud or typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function hashRecoveryCode(code: string, sessionId: string): string {
  return createHash('sha256').update(`${sessionId}:${code.toUpperCase()}`).digest('hex');
}

export function newControllerId(): string {
  return randomBytes(12).toString('base64url');
}
