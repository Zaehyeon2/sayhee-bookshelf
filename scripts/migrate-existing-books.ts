import 'dotenv/config'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../src/lib/db/client'
import { users, books } from '../src/lib/db/schema'
import { normalizeUsername, isValidUsername } from '../src/lib/username-normalize'

async function main() {
  const usernameRaw = process.env.LEGACY_OWNER_USERNAME
  const passwordHash = process.env.LEGACY_OWNER_PASSWORD_HASH
  if (!usernameRaw || !passwordHash) {
    throw new Error('LEGACY_OWNER_USERNAME and LEGACY_OWNER_PASSWORD_HASH must be set')
  }
  if (
    !passwordHash.startsWith('$2a$') &&
    !passwordHash.startsWith('$2b$') &&
    !passwordHash.startsWith('$2y$')
  ) {
    throw new Error('LEGACY_OWNER_PASSWORD_HASH must be a bcrypt hash ($2a$/$2b$/$2y$)')
  }
  const username = normalizeUsername(usernameRaw)
  if (!isValidUsername(username)) {
    throw new Error(`Invalid username: ${usernameRaw}`)
  }

  // 1) 사용자 존재 확인. 없으면 INSERT.
  let owner = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0]
  if (!owner) {
    const [inserted] = await db
      .insert(users)
      .values({
        username,
        displayName: usernameRaw.trim(),
        passwordHash, // 해시 그대로 저장 (bcrypt 재실행 X)
        role: 'member',
        mustChangePassword: 0,
        createdAt: Date.now(),
      })
      .returning()
    owner = inserted
    console.log(`Inserted legacy owner: ${owner.username} (id=${owner.id})`)
  } else {
    console.log(`Legacy owner already exists: ${owner.username} (id=${owner.id})`)
  }

  // 2) author_user_id가 NULL인 책 backfill.
  const orphans = await db.select({ id: books.id }).from(books).where(isNull(books.authorUserId))
  if (orphans.length === 0) {
    console.log('All books already have an author_user_id; nothing to backfill.')
    return
  }
  await db.update(books).set({ authorUserId: owner.id }).where(isNull(books.authorUserId))
  console.log(`Backfilled ${orphans.length} books with author_user_id=${owner.id}`)

  // 3) 검증.
  const remaining = await db.select({ id: books.id }).from(books).where(isNull(books.authorUserId))
  if (remaining.length > 0) {
    throw new Error(`Backfill incomplete: ${remaining.length} books still NULL`)
  }
  console.log('Verified: no NULL author_user_id remaining.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
