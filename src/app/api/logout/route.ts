import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  const store = await cookies()
  store.set(SESSION.name, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  // Form POST는 Accept: text/html을 보내므로 redirect.
  // fetch() 기본 Accept는 */* 이거나 application/json — 둘 다 JSON 반환.
  const accept = req.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    return NextResponse.redirect(new URL('/', req.url), { status: 303 })
  }
  return NextResponse.json({ ok: true })
}
