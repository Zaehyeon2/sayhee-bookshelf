# 세희의 서재

1인용 독후감/독서 기록 사이트. 토스 스타일 디자인 시스템 + 다크모드 + 본문 검색.

**Tech**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · Drizzle ORM · libsql/Turso · Pretendard · Radix Dialog · sonner

## 기능

- **독후감 CRUD** — 제목·작가·읽은 날짜·14개 장르·별점·태그·마크다운 본문 (Toast UI Editor)
- **검색** — 제목·작가·**본문 LIKE** 매칭, 가중치 랭킹(제목→작가→본문), 매칭 부근 스니펫 + `<mark>` 키워드 하이라이트
- **장르/태그 필터링**, 최근/별점 정렬
- **삭제 모달** — Radix Dialog 기반 focus-trap·Esc·backdrop 모달
- **토스트 피드백** — sonner (등록/수정/삭제 알림)
- **다크모드** — 시스템/라이트/다크 3-state 수동 토글, OS 자동 추종, 0-FOUC inline 부트스트랩
- **인증** — bcrypt + HS256 JWT 쿠키 (읽기는 공개, 쓰기/수정/삭제는 관리자만)
- **접근성** — focus-visible ring 일관성, 44×44 탭 타겟, `prefers-reduced-motion` 대응, 시각/스크린리더 친화
- **모바일** — iOS 줌 방지 (인풋 16px), 가로 스크롤 chip + PC 마우스 드래그, 안전 영역 padding
- **스켈레톤 로딩** — 홈/목록/상세 3개 라우트에 토스 톤 placeholder

## 로컬 실행

```bash
pnpm install
cp .env.example .env.local
# .env.local에 ADMIN_PASSWORD_HASH, AUTH_SECRET 채우기:
node -e "console.log(require('bcryptjs').hashSync('내비밀번호', 10))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ⚠️ bcrypt 해시($2b$10$…)의 모든 $는 .env.local에 \$ 로 escape 필수
#    예: ADMIN_PASSWORD_HASH=\$2b\$10\$abcdef…

pnpm exec dotenv -e .env.local -- drizzle-kit push   # 로컬 SQLite 마이그레이션
pnpm dev
```

## 테스트

```bash
pnpm test         # Vitest 단위 (36개)
pnpm e2e          # Playwright E2E (3개 — 인증 차단 + 등록·열람 골든패스 + 삭제 모달)
```

### E2E 환경 준비 (Linux/WSL2)

Playwright Chromium은 시스템 공유 라이브러리(`libnspr4`, `libnss3` 등)가 필요합니다.

```bash
# 최초 1회 (sudo 필요):
sudo pnpm exec playwright install-deps chromium
# 또는 수동:
sudo apt install libnspr4 libnss3 libasound2t64
```

macOS/CI 환경에선 별도 설정 없이 동작합니다.

### 로컬 dev 캐시 트러블슈팅

WSL2에서 `next dev`가 60s 안에 안 뜨거나 stale libsql 클라이언트로 인해 API 500이 나면:

```bash
pkill -f "next-server" || true
rm -f local.db
pnpm exec dotenv -e .env.local -- drizzle-kit push
pnpm e2e   # 또는 pnpm dev
```

## Vercel 배포

1. **GitHub 저장소 push**
   ```bash
   gh repo create 세희의-서재 --private --source . --remote origin --push
   # 또는 GitHub 웹에서 repo 만들고 `git remote add origin … && git push -u origin main`
   ```
2. **Turso prod DB 생성**
   ```bash
   turso db create book-report
   turso db show book-report --url      # → TURSO_URL
   turso db tokens create book-report   # → TURSO_TOKEN
   ```
3. **Vercel 프로젝트 연결** (vercel.com → New Project → GitHub repo 선택)
4. **환경변수 등록** (Vercel Project Settings → Environment Variables)
   - `TURSO_URL` (libsql://...)
   - `TURSO_TOKEN` (Turso CLI 출력값)
   - `ADMIN_PASSWORD_HASH` (`$` 그대로 입력 — Vercel은 escape 불필요)
   - `AUTH_SECRET` (`$` 그대로)
5. **첫 배포 후 운영 DB에 스키마 push**
   ```bash
   TURSO_URL=libsql://... TURSO_TOKEN=... pnpm exec drizzle-kit push
   ```
6. 이후 `git push origin main` → Vercel 자동 빌드/배포

## 구조

```
src/
├ app/
│  ├ layout.tsx            ─ RootLayout (Pretendard·테마 부트스트랩·Toaster·헤더)
│  ├ globals.css           ─ Tailwind v4 @theme 토큰 + 다크모드 + 모션 안정성
│  ├ icon.tsx              ─ 📚 emoji 동적 favicon
│  ├ page.tsx              ─ 홈 (hero·통계·장르 그리드·최근 책)
│  ├ books/                ─ 목록·상세 (검색·필터·하이라이트·동적 메타)
│  ├ admin/                ─ /admin/new, /admin/edit/[id] (proxy 보호)
│  ├ login/                ─ 로그인 페이지
│  ├ error.tsx
│  ├ not-found.tsx
│  └ api/                  ─ login/logout/books/tags/suggest
├ components/
│  ├ BookCard, BookForm, GenreBadge, RatingStars, TagInput
│  ├ SearchBox, Filters    ─ 드래그 스크롤 chip
│  ├ MarkdownEditor·Viewer ─ Toast UI + 다크 동기화
│  ├ ThemeToggle           ─ 3-state 사이클 + storage 동기화
│  ├ ConfirmDialog         ─ Radix Dialog 토스 래퍼
│  ├ EmptyState
│  └ Skeleton              ─ 로딩 placeholder primitive
├ lib/
│  ├ auth.ts               ─ bcrypt + HS256 JWT (DUMMY_HASH 패턴)
│  ├ db/                   ─ Drizzle 스키마/클라이언트/쿼리 (slug 충돌 retry·N+1 방지)
│  ├ excerpt.ts            ─ 마크다운 노이즈 제거 후 매치 부근 발췌
│  ├ highlight.tsx         ─ <mark> 키워드 강조
│  ├ slug.ts, genres.ts, validations.ts
└ proxy.ts                 ─ /admin/*·/api/books/*·/api/tags/suggest 보호 (Next.js 16)

drizzle/                   ─ 마이그레이션
tests/
├ unit/                    ─ Vitest (36개)
└ e2e/                     ─ Playwright (3개)
docs/superpowers/          ─ 설계서·구현 계획서·plans (히스토리 reference)
public/fonts/              ─ Pretendard Variable woff2 (로컬 호스팅)
```

## 디자인 토큰 한눈에

```
--color-toss-blue   #3182F6 (light) / #6BA1FF (dark)   ──→ CTA, 링크, 강조
--color-toss-yellow #FFB22B (light) / #FFC247 (dark)   ──→ 별점
--color-page-bg     #F2F4F6 / #17171C                  ──→ 페이지 배경
--color-surface     #FFFFFF / #1E1E24                  ──→ 카드
--radius-toss-sm/-/-lg                                  12px / 16px / 20px
--shadow-toss / --shadow-toss-hover                     1px sm / 6px hover
```

다크모드는 `:root[data-theme="dark"]` 셀렉터로 토큰 값만 swap — 컴포넌트는 모두 `var(--color-...)` 참조라 자동 반영.
