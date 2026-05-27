/**
 * Edge-runtime-safe session helpers.
 *
 * This module intentionally does NOT import db/client so it can be bundled
 * in the Next.js edge runtime (middleware). Only pure JWT operations here.
 */
import { jwtVerify } from 'jose'

export type SessionUser = {
  sub: number
  username: string
  role: 'admin' | 'member'
  mcp: 0 | 1
  tv: number
}

const JWT_ISSUER = 'book-report'
const JWT_AUDIENCE = 'book-report-web'

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be ≥32 chars')
  return new TextEncoder().encode(s)
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
    const role: 'admin' | 'member' = payload.role === 'admin' ? 'admin' : 'member'
    const mcp: 0 | 1 = payload.mcp === 0 ? 0 : 1
    const tv = typeof payload.tv === 'number' ? payload.tv : -1
    return { sub: payload.sub, username: payload.username, role, mcp, tv }
  } catch {
    return null
  }
}
