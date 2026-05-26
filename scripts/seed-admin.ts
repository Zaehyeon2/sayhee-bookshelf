import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from '../src/lib/db/client'
import { users } from '../src/lib/db/schema'
import { normalizeUsername, isValidUsername } from '../src/lib/username-normalize'

async function main() {
  const usernameRaw = process.env.INITIAL_ADMIN_USERNAME
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!usernameRaw || !password) {
    throw new Error('INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be set')
  }
  const username = normalizeUsername(usernameRaw)
  if (!isValidUsername(username)) {
    throw new Error(`Invalid username: ${usernameRaw}`)
  }
  if (password.length < 8) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be ≥8 chars')
  }

  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing.length > 0) {
    console.log('Users already exist; seed is a no-op.')
    return
  }

  const hash = await bcrypt.hash(password, 10)
  const [inserted] = await db
    .insert(users)
    .values({
      username,
      displayName: usernameRaw.trim(),
      passwordHash: hash,
      role: 'admin',
      mustChangePassword: 0,
      createdAt: Date.now(),
    })
    .returning()
  console.log(`Seeded admin user: ${inserted.username} (id=${inserted.id})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
