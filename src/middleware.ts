import { NextResponse, type NextRequest } from 'next/server';
import { readSession, SESSION_COOKIE } from './lib/auth';

const PUBLIC = ['/login', '/api/auth/login', '/api/stripe/webhook'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const headers = new Headers(req.headers);
    headers.set('x-user-email', session.email);
    return NextResponse.next({ request: { headers } });
  }
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
