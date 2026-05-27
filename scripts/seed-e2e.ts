import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../src/lib/db/schema'
import { normalizeUsername } from '../src/lib/username-normalize'

// Inline db client (rather than importing ../src/lib/db/client) so this script
// can run under tsx's CJS transform — db/client.ts uses top-level await for the
// PRAGMA call, which CJS doesn't support.

const E2E_USERS = [
  { username: 'e2e-alice', displayName: '앨리스', password: 'e2etestpass1234' },
  { username: 'e2e-bob', displayName: '밥', password: 'e2etestpass1234' },
] as const

// 5 movies per user — gives the feed tab spec enough seed data to verify
// visibility without depending on dynamically created entries.
const MOVIE_COUNT = 5

async function main() {
  const url = process.env.TURSO_URL
  if (!url) throw new Error('TURSO_URL is not set')

  const libsql = createClient({ url, authToken: process.env.TURSO_TOKEN || undefined })
  await libsql.execute('PRAGMA foreign_keys = ON')
  const db = drizzle(libsql, { schema })

  for (const u of E2E_USERS) {
    const username = normalizeUsername(u.username)
    const hash = await bcrypt.hash(u.password, 10)
    await db
      .insert(schema.users)
      .values({
        username,
        displayName: u.displayName,
        passwordHash: hash,
        role: 'member',
        mustChangePassword: 0,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.users.username,
        set: { passwordHash: hash, mustChangePassword: 0 },
      })
    console.log(`[e2e seed] provisioned: ${username}`)

    // Look up the user id (may have just been inserted or already existed)
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, username))
    if (!user) throw new Error(`[e2e seed] could not find user: ${username}`)

    // Seed movies — idempotent via unique slug; skip if already present.
    const displayShort = u.username.replace('e2e-', '') // 'alice' | 'bob'
    const genres = ['SF', '드라마', '액션', '로맨스', '스릴러'] as const
    const now = Date.now()
    for (let i = 0; i < MOVIE_COUNT; i++) {
      const slug = `${displayShort}-movie-${i + 1}-seed`
      const month = String((i % 12) + 1).padStart(2, '0')
      const day = String((i % 28) + 1).padStart(2, '0')
      await db
        .insert(schema.movies)
        .values({
          authorUserId: user.id,
          title: `${u.displayName} movie ${i + 1}`,
          director: `감독 ${i + 1}`,
          genre: genres[i % genres.length],
          watchedDate: `2026-${month}-${day}`,
          rating: 6 + (i % 4), // 6-9
          content: '',
          oneLineReview: null,
          isPublic: 1,
          publishedAt: now + i,
          slug,
          createdAt: now + i,
          updatedAt: now + i,
        })
        .onConflictDoNothing()
      console.log(`[e2e seed] movie ${i + 1}/${MOVIE_COUNT} for ${username}`)
    }
  }

  await libsql.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
