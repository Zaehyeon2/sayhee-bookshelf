import bcrypt from 'bcryptjs'
import { users, books, writings } from '@/lib/db/schema'
import { normalizeUsername } from '@/lib/username-normalize'
import type { TestDb } from './setup-db'

export async function createUser(
  db: TestDb,
  opts: {
    username: string
    displayName?: string
    role?: 'admin' | 'member'
    mustChangePassword?: 0 | 1
    password?: string
  },
) {
  const hash = await bcrypt.hash(opts.password ?? 'password1234', 4) // low cost for tests
  const [u] = await db
    .insert(users)
    .values({
      username: normalizeUsername(opts.username),
      displayName: opts.displayName ?? opts.username,
      passwordHash: hash,
      role: opts.role ?? 'member',
      mustChangePassword: opts.mustChangePassword ?? 0,
      createdAt: Date.now(),
    })
    .returning()
  return u
}

export async function createBook(
  db: TestDb,
  authorUserId: number,
  overrides: Partial<typeof books.$inferInsert> = {},
) {
  const now = Date.now()
  const [b] = await db
    .insert(books)
    .values({
      authorUserId,
      title: overrides.title ?? '테스트 책',
      author: overrides.author ?? '저자',
      genre: overrides.genre ?? '소설',
      readDate: overrides.readDate ?? '2025-01-01',
      rating: overrides.rating ?? 4,
      content: overrides.content ?? '',
      slug: overrides.slug ?? `test-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    })
    .returning()
  return b
}

export async function createWriting(
  db: TestDb,
  authorUserId: number,
  overrides: Partial<typeof writings.$inferInsert> = {},
) {
  const now = Date.now()
  const [w] = await db
    .insert(writings)
    .values({
      authorUserId,
      title: overrides.title ?? '테스트 글',
      body: overrides.body ?? '',
      slug: overrides.slug ?? `writing-${now}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    })
    .returning()
  return w
}
