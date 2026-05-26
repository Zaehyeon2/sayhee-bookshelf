import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'

const PASSWORD_PATH = '/settings/password'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value
  const session = await getSessionUser(token)

  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (session.mcp === 1 && req.nextUrl.pathname !== PASSWORD_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = PASSWORD_PATH
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/books/:path*', '/writings/:path*', '/admin/:path*', '/settings/:path*'],
}
