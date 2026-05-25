import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LoginSchema } from '@/lib/validations'
import { verifyPassword, signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '로그인 실패' }, { status: 400 })
  }
  const ok = await verifyPassword(parsed.data.password)
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json({ error: '로그인 실패' }, { status: 401 })
  }
  const token = await signSession()
  const store = await cookies()
  store.set(SESSION.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION.maxAge,
  })
  return NextResponse.json({ ok: true })
}
