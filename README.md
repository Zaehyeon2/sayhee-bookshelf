# 독후감 사이트

1인용 독후감/독서 기록 사이트. Next.js 16 + Drizzle + Turso + Vercel.

## 로컬 실행

```bash
pnpm install
cp .env.example .env.local
# .env.local 안의 ADMIN_PASSWORD_HASH, AUTH_SECRET 채우기
node -e "console.log(require('bcryptjs').hashSync('내비밀번호', 10))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

pnpm exec dotenv -e .env.local -- drizzle-kit push   # 로컬 SQLite 마이그레이션
pnpm dev
```

## 테스트

```bash
pnpm test         # Vitest 단위 (29개)
pnpm e2e          # Playwright E2E (2개 — 인증 차단 + 골든 패스)
```

### E2E 환경 준비

Playwright의 Chromium은 Linux/WSL2에서 시스템 공유 라이브러리(`libnspr4`, `libnss3` 등)를 요구합니다.

```bash
# 최초 1회 (sudo 필요):
sudo pnpm exec playwright install-deps chromium
# 또는 수동:
sudo apt install libnspr4 libnss3 libasound2t64
```

macOS/CI 환경에서는 별도 설정 없이 동작합니다.

## Vercel 배포

1. GitHub 저장소 생성 후 main 브랜치 push
2. Turso CLI로 prod DB 생성:
   ```bash
   turso db create book-report
   turso db show book-report --url      # → TURSO_URL
   turso db tokens create book-report   # → TURSO_TOKEN
   ```
3. Vercel에서 GitHub 저장소 연결
4. 환경변수 등록: `TURSO_URL`, `TURSO_TOKEN`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`
5. 첫 배포 후 운영 DB에 스키마 push:
   ```bash
   TURSO_URL=libsql://... TURSO_TOKEN=... pnpm exec drizzle-kit push
   ```
6. 이후 `git push origin main` → Vercel 자동 빌드/배포

## 구조

- `src/app/` — Next.js App Router 페이지/API
- `src/components/` — UI 컴포넌트 (BookForm, BookCard, RatingStars, TagInput 등)
- `src/lib/db/` — Drizzle 스키마·클라이언트·쿼리
- `src/lib/auth.ts` — 인증 (bcrypt + HS256 JWT)
- `src/lib/genres.ts` — 14개 장르 enum
- `src/proxy.ts` — `/admin/*`, `/api/books/*`, `/api/tags/suggest` 보호 (Next.js 16 명명)
- `drizzle/` — 마이그레이션
- `tests/unit/` — Vitest 단위 테스트
- `tests/e2e/` — Playwright E2E
- `docs/superpowers/` — 설계서/구현 계획서
