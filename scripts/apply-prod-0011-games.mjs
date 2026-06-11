// games 도메인 마이그레이션(drizzle/0011)을 prod Turso에 직접 적용 + 실측 검증.
// drizzle-kit push/migrate는 Turso에서 신뢰 불가(CLAUDE.md gotcha) — raw client로 적용한다.
// 실행: pnpm exec dotenv -e .env.prod -- node scripts/apply-prod-0011-games.mjs
// 재실행 안전: games 테이블이 이미 있으면 CREATE를 건너뛰고 검증만 수행.
import { createClient } from '@libsql/client'
import fs from 'node:fs'

const url = process.env.TURSO_URL
const authToken = process.env.TURSO_TOKEN
if (!url || !authToken) {
  console.error('TURSO_URL/TURSO_TOKEN missing — run with: pnpm exec dotenv -e .env.prod --')
  process.exit(1)
}
const c = createClient({ url, authToken })

const pre = await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='games'")
if (pre.rows.length > 0) {
  console.log('games table already exists — skipping CREATE statements')
} else {
  const sql = fs.readFileSync('drizzle/0011_nostalgic_molten_man.sql', 'utf8')
  // tests/setup-db.ts와 동일한 분할 로직 (검증된 패턴)
  const stmts = sql
    .replace(/-->\s*statement-breakpoint/g, '')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  console.log('applying', stmts.length, 'statements')
  for (const [i, stmt] of stmts.entries()) {
    await c.execute(stmt)
    console.log(`ok ${i + 1}/${stmts.length}:`, stmt.slice(0, 60).replace(/\n/g, ' '))
  }
}

// exit code를 적용 성공의 증거로 믿지 말 것 — PRAGMA 실측 (CLAUDE.md gotcha)
const cols = await c.execute('PRAGMA table_info(games)')
console.log('games columns:', cols.rows.map((r) => r.name).join(','))
const tcols = await c.execute('PRAGMA table_info(game_tags)')
console.log('game_tags columns:', tcols.rows.map((r) => r.name).join(','))
const idx = await c.execute(
  "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_game%' ORDER BY name",
)
console.log(`indexes (${idx.rows.length}):`, idx.rows.map((r) => r.name).join(','))
if (cols.rows.length !== 17 || idx.rows.length !== 9) {
  console.error('VERIFY FAILED — expected 17 columns / 9 indexes')
  process.exit(1)
}
console.log('VERIFY OK')
c.close()
