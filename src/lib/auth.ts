import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { users, type User } from '@/lib/db/schema'
import { normalizeUsername } from '@/lib/username-normalize'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7 // 7일
const DUMMY_HASH = '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

export type SessionUser = {
  sub: number
  username: string
  role: 'admin' | 'member'
  mcp: 0 | 1
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
  const payload: SessionUser = {
    sub: user.id,
    username: user.username,
    role: user.role as 'admin' | 'member',
    mcp: (user.mustChangePassword ? 1 : 0) as 0 | 1,
  }
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret())
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'number' || typeof payload.username !== 'string') return null
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role as 'admin' | 'member',
      mcp: (payload.mcp as 0 | 1) ?? 1,
    }
  } catch {
    return null
  }
}

/** 서버 컴포넌트/route handler에서 현재 사용자 조회 (DB hit) */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  const session = await getSessionUser(token)
  if (!session) return null
  const rows = await db.select().from(users).where(eq(users.id, session.sub)).limit(1)
  return rows[0] ?? null
}

export const SESSION = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
