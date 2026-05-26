// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import migration0 from '../../drizzle/0000_yummy_goliath.sql?raw'
import migration1 from '../../drizzle/0001_mixed_blazing_skull.sql?raw'

const TEST_SECRET = 'a'.repeat(32)

// Build an in-memory DB with all migrations applied
function applyMigration(sql: string, client: ReturnType<typeof createClient>) {
  const cleaned = sql.replace(/-->\s*statement-breakpoint/g, '')
  return Promise.all(
    cleaned
      .split(/;\s*\n/)
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((s: string) => client.execute(s)),
  )
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
  await applyMigration(migration0, client)
  await applyMigration(migration1, client)

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
