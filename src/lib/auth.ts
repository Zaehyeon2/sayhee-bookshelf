import { cache } from 'react'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db/client'
import { users, type User } from '@/lib/db/schema'
import { normalizeUsername } from '@/lib/username-normalize'

export const SESSION_CACHE_TAG = 'user-session'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7 // 7일
const DUMMY_HASH = '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const JWT_ISSUER = 'book-report'
const JWT_AUDIENCE = 'book-report-web'

export type SessionUser = {
  sub: number
  username: string
  role: 'admin' | 'member'
  mcp: 0 | 1
  tv: number
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be ≥32 chars')
  return new TextEncoder().encode(s)
}

export async function authenticate(usernameInput: string, password: string): Promise<User | null> {
  const username = normalizeUsername(usernameInput)
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1)
  const user = rows[0]
  // timing-attack 방지: 사용자 미존재여도 bcrypt 한 번 실행
  const hash = user?.passwordHash ?? DUMMY_HASH
  const ok = await bcrypt.compare(password, hash)
  if (!user || !ok) return null
  return user
}

export async function signSession(user: User): Promise<string> {
  const role: 'admin' | 'member' = user.role === 'admin' ? 'admin' : 'member'
  const payload: SessionUser = {
    sub: user.id,
    username: user.username,
    role,
    mcp: (user.mustChangePassword ? 1 : 0) as 0 | 1,
    tv: user.tokenVersion ?? 0,
  }
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret())
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    if (typeof payload.sub !== 'number' || typeof payload.username !== 'string') return null
    // role을 화이트리스트로 검증 — 어떤 문자열도 그대로 'admin'으로 캐스팅하지 않도록.
    const role: 'admin' | 'member' = payload.role === 'admin' ? 'admin' : 'member'
    const mcp: 0 | 1 = payload.mcp === 0 ? 0 : 1
    const tv = typeof payload.tv === 'number' ? payload.tv : -1
    return {
      sub: payload.sub,
      username: payload.username,
      role,
      mcp,
      tv,
    }
  } catch {
    return null
  }
}

// Token 기반 user lookup. token이 cache key 일부 → user별 자동 분리.
// stale 10s — 비번 변경 시 password endpoint가 revalidateTag로 invalidate.
// 사용자 삭제 같은 드문 케이스는 10s window 안에 stale user 객체가 잠시 노출될 수 있음.
const cachedUserByToken = unstable_cache(
  async (token: string): Promise<User | null> => {
    const session = await getSessionUser(token)
    if (!session) return null
    const rows = await db.select().from(users).where(eq(users.id, session.sub)).limit(1)
    const user = rows[0]
    if (!user) return null
    if (session.tv !== (user.tokenVersion ?? 0)) return null
    return user
  },
  ['current-user-by-token'],
  { revalidate: 10, tags: [SESSION_CACHE_TAG] },
)

/**
 * 서버 컴포넌트/route handler에서 현재 사용자 조회.
 *
 * 두 단계 cache: React.cache로 same-request dedup + unstable_cache로
 * 잇따른 navigation에서 DB hit 회피 (10s revalidate).
 * tokenVersion 검증은 cache 안에서 — 비번 변경 후 revalidateTag('user-session')
 * 호출 시 즉시 다음 요청부터 새 DB lookup.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return cachedUserByToken(token)
})

export const SESSION = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
