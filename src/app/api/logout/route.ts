import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidateTag } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { getCurrentUser, SESSION, SESSION_CACHE_TAG } from '@/lib/auth'

export async function POST(req: Request) {
  // tokenVersion을 올려 발급된 JWT를 서버측에서 즉시 무효화 — 쿠키 삭제만으로는
  // 탈취된 토큰이 7일 TTL 동안 유효하게 남는 결함을 막는다 (비번 변경 플로우와 동일).
  // best-effort: DB 장애로 bump이 실패해도 아래 쿠키 삭제는 반드시 수행돼야 logout이
  // 깨지지 않는다. 실패 시 토큰은 TTL로 자연 만료 = 수정 전 동작으로 graceful degrade.
  // bump을 쿠키 삭제보다 먼저 두는 이유: getCurrentUser가 같은 요청의 session 쿠키를
  // 읽으므로, 쿠키를 먼저 비우면 me=null이 되어 bump이 스킵된다.
  try {
    const me = await getCurrentUser()
    if (me) {
      await db
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, me.id))
      revalidateTag(SESSION_CACHE_TAG, 'max')
    }
  } catch {
    // 서버측 무효화 실패는 무시 — 로컬 세션은 아래에서 삭제되고 토큰은 TTL로 만료된다.
  }
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
