import { NextResponse } from 'next/server';
import { checkCredentials, createSession, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (!checkCredentials(email, password)) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(email.toLowerCase()), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600,
  });
  return res;
}
