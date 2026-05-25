// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { verifyPassword, signSession, verifySession } from '@/lib/auth'

beforeAll(() => {
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('s3cret', 10)
  process.env.AUTH_SECRET = 'a'.repeat(64)
})

describe('verifyPassword', () => {
  it('맞으면 true', async () => {
    expect(await verifyPassword('s3cret')).toBe(true)
  })
  it('틀리면 false', async () => {
    expect(await verifyPassword('nope')).toBe(false)
  })
})

describe('session JWT', () => {
  it('서명/검증 라운드트립', async () => {
    const token = await signSession()
    const ok = await verifySession(token)
    expect(ok).toBe(true)
  })
  it('잘못된 토큰은 false', async () => {
    expect(await verifySession('garbage')).toBe(false)
  })
})
