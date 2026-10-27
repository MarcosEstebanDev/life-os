import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

/**
 * Atajo de UX, no de seguridad: sin cookie no tiene sentido mostrar la app.
 * Quien decide si la sesión vale es la API (la cookie puede estar vencida).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.has('lifeos_session')) return NextResponse.next();
  const login = new URL('/login', req.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
