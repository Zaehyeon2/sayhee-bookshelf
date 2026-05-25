import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION } from '@/lib/auth'

export async function POST() {
  const store = await cookies()
  store.set(SESSION.name, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return NextResponse.json({ ok: true })
}
