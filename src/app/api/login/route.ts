import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LoginSchema } from '@/lib/validations'
import { authenticate, signSession, SESSION } from '@/lib/auth'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 400 },
    )
  }
  const user = await authenticate(parsed.data.username, parsed.data.password)
  if (!user) {
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json(
      { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
      { status: 401 },
    )
  }
  const token = await signSession(user)
  const store = await cookies()
  store.set(SESSION.name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION.maxAge,
  })
  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword === 1 })
}
