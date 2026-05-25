import { NextResponse, type NextRequest } from 'next/server'
import { verifySession, SESSION } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION.name)?.value
  const ok = await verifySession(token)
  if (ok) return NextResponse.next()
  const url = new URL('/login', req.url)
  url.searchParams.set('from', req.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*', '/api/books/:path*', '/api/tags/suggest'],
}
