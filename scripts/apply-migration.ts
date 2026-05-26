import 'dotenv/config'
import { createClient } from '@libsql/client'
import fs from 'node:fs'
import path from 'node:path'

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: apply-migration.ts <relative-path-to-sql-file>')
  process.exit(1)
}

const url = process.env.TURSO_URL
const token = process.env.TURSO_TOKEN
if (!url) throw new Error('TURSO_URL not set')

const client = createClient({ url, authToken: token || undefined })

async function main() {
  const fullPath = path.resolve(process.cwd(), migrationFile)
  const sql = fs.readFileSync(fullPath, 'utf8')
  const cleaned = sql.replace(/-->\s*statement-breakpoint/g, '')
  const stmts = cleaned.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)

  console.log(`Applying ${stmts.length} statements from ${path.basename(fullPath)}...`)
  let applied = 0
  let skipped = 0
  for (const stmt of stmts) {
    try {
      await client.execute(stmt)
      applied++
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e)
      if (/already exists|duplicate column/i.test(msg)) {
        skipped++
        const preview = stmt.slice(0, 60).replace(/\s+/g, ' ')
        console.log(`  [skip] already-applied: ${preview}…`)
      } else {
        console.error(`Failed: ${stmt.slice(0, 200)}`)
        throw e
      }
    }
  }
  console.log(`Done. applied=${applied} skipped=${skipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
