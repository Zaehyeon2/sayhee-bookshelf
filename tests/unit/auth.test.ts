// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'

const TEST_SECRET = 'a'.repeat(32)

// 모든 migration을 순서대로 적용한다. 신규 컬럼(token_version 등)이 추가될 때마다 본 테스트가
// 자동으로 따라가도록 drizzle/ 디렉터리를 직접 읽는다.
async function applyAllMigrations(client: ReturnType<typeof createClient>) {
  const dir = path.resolve(process.cwd(), 'drizzle')
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    const cleaned = sql.replace(/-->\s*statement-breakpoint/g, '')
    for (const stmt of cleaned
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.execute(stmt)
    }
  }
}

let testDb: ReturnType<typeof drizzle>

// Mock @/lib/db/client so auth.ts uses our in-memory DB
vi.mock('@/lib/db/client', () => ({ db: null as unknown as ReturnType<typeof drizzle> }))
// Mock next/headers — getCurrentUser uses it, but tests don't call getCurrentUser
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) }),
}))

beforeAll(async () => {
  process.env.AUTH_SECRET = TEST_SECRET

  // Set up in-memory SQLite
  const client = createClient({ url: ':memory:' })
  testDb = drizzle(client, { schema })
  await applyAllMigrations(client)

  // Patch the mocked module's db export to point at our in-memory DB
  const clientModule = await import('@/lib/db/client')
  ;(clientModule as { db: unknown }).db = testDb

  // Seed a test user
  await testDb.delete(schema.users)
  const hash = await bcrypt.hash('password123', 10)
  await testDb.insert(schema.users).values({
    username: 'sehee',
    displayName: '세희',
    passwordHash: hash,
    role: 'admin',
    mustChangePassword: 0,
    createdAt: Date.now(),
  })
})

describe('authenticate', () => {
  it('returns user on correct password', async () => {
    const { authenticate } = await import('@/lib/auth')
    const u = await authenticate('sehee', 'password123')
    expect(u).not.toBeNull()
    expect(u?.username).toBe('sehee')
    expect(u?.role).toBe('admin')
  })

  it('returns null on wrong password', async () => {
    const { authenticate } = await import('@/lib/auth')
    expect(await authenticate('sehee', 'wrong____')).toBeNull()
  })

  it('returns null on missing user', async () => {
    const { authenticate } = await import('@/lib/auth')
    expect(await authenticate('ghost', 'whatever_')).toBeNull()
  })

  it('NFC + lowercase normalizes username at lookup', async () => {
    const { authenticate } = await import('@/lib/auth')
    expect(await authenticate('  SEHEE  ', 'password123')).not.toBeNull()
  })
})

describe('signSession + getSessionUser', () => {
  it('round-trips user identity', async () => {
    const { authenticate, signSession, getSessionUser } = await import('@/lib/auth')
    const u = await authenticate('sehee', 'password123')
    expect(u).not.toBeNull()
    const token = await signSession(u!)
    const back = await getSessionUser(token)
    expect(back?.sub).toBe(u!.id)
    expect(back?.username).toBe('sehee')
    expect(back?.role).toBe('admin')
    expect(back?.mcp).toBe(0)
  })

  it('returns null for missing token', async () => {
    const { getSessionUser } = await import('@/lib/auth')
    expect(await getSessionUser(undefined)).toBeNull()
  })

  it('returns null for tampered token', async () => {
    const { authenticate, signSession, getSessionUser } = await import('@/lib/auth')
    const u = await authenticate('sehee', 'password123')
    const token = `${await signSession(u!)}x`
    expect(await getSessionUser(token)).toBeNull()
  })
})
