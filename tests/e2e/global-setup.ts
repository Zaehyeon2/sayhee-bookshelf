import { execSync } from 'node:child_process'

// Playwright globalSetup: provisions fixed e2e users (e2e-alice, e2e-bob) before
// any test runs. Delegates to scripts/seed-e2e.ts to reuse the project's db
// client + bcrypt patterns instead of duplicating connection logic.
//
// dotenv-cli prefix is required because Next.js's automatic .env.local loading
// doesn't propagate to standalone scripts (same gotcha as drizzle-kit per
// CLAUDE.md).
export default async function globalSetup() {
  execSync('pnpm exec dotenv -e .env.local -- pnpm run seed:e2e', {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
}
