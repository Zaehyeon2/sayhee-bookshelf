import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../src/lib/db/schema'
import { normalizeUsername } from '../src/lib/username-normalize'

// Inline db client (rather than importing ../src/lib/db/client) so this script
// can run under tsx's CJS transform — db/client.ts uses top-level await for the
// PRAGMA call, which CJS doesn't support.

const E2E_USERS = [
  { username: 'e2e-alice', displayName: '앨리스', password: 'e2etestpass1234' },
  { username: 'e2e-bob', displayName: '밥', password: 'e2etestpass1234' },
] as const

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
  }

  await libsql.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
