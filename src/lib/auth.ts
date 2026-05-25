import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7  // 7일

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be ≥32 chars')
  return new TextEncoder().encode(s)
}

const DUMMY_HASH = '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

export async function verifyPassword(input: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH ?? DUMMY_HASH
  const result = await bcrypt.compare(input, hash)
  return Boolean(process.env.ADMIN_PASSWORD_HASH) && result
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    return true
  } catch {
    // Returns false on signature failure, malformed token, OR misconfigured AUTH_SECRET.
    // AUTH_SECRET validation should happen at deploy time.
    return false
  }
}

export const SESSION = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SEC,
}
