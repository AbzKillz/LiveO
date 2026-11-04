import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'liveo_session';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(s);
}

/** MVP staff list from STAFF_USERS="a@x.com:pw,b@x.com:pw". Swap for SSO before wider rollout. */
export function checkCredentials(email: string, password: string): boolean {
  const users = (process.env.STAFF_USERS ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return users.some((u) => {
    const i = u.indexOf(':');
    return u.slice(0, i).toLowerCase() === email.trim().toLowerCase() && timingSafeEqual(u.slice(i + 1), password);
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSession(email: string) {
  return new SignJWT({ email }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(secret());
}

export async function readSession(token: string | undefined): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.email === 'string' ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
