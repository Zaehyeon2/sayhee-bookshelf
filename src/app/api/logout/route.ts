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
  // form POST 호출 시 redirect, fetch 호출 시 JSON. Accept 헤더로 판단.
  const accept = req.headers.get('accept') ?? ''
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(new URL('/', req.url), { status: 303 })
  }
  return NextResponse.json({ ok: true })
}
