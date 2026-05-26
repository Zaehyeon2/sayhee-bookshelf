import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type TestDb = LibSQLDatabase<typeof schema>

/**
 * 임시 파일 기반 SQLite database with all migrations applied.
 *
 * `:memory:` URL은 @libsql/client v0.17.x에서 transaction 시 별도 connection을 생성해
 * 테이블이 보이지 않는 이슈가 있어, 파일 기반 임시 DB를 사용한다. 테스트 종료 시 client.close()로
 * 파일을 닫고, OS가 알아서 청소하거나 명시적으로 unlink하면 된다.
 */
export async function makeTestDb(): Promise<{ db: TestDb; client: Client }> {
  const tmpPath = path.join(os.tmpdir(), `book-report-test-${randomUUID()}.db`)
  const client = createClient({ url: `file:${tmpPath}` })
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
