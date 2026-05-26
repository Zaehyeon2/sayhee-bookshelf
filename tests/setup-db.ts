import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import fs from 'node:fs'
import path from 'node:path'

export type TestDb = LibSQLDatabase<typeof schema>

/**
 * In-memory SQLite database with all migrations applied.
 * Use in integration tests for full isolation.
 */
export async function makeTestDb(): Promise<{ db: TestDb; client: Client }> {
  const client = createClient({ url: ':memory:' })
  const db = drizzle(client, { schema })

  // PRAGMA foreign_keys must be enabled per-connection
  await client.execute('PRAGMA foreign_keys = ON')

  // Apply all migration SQL files in order
  const migrationsDir = path.resolve(process.cwd(), 'drizzle')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const cleaned = sql.replace(/-->\s*statement-breakpoint/g, '')
    for (const stmt of cleaned
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.execute(stmt)
    }
  }

  return { db, client }
}
