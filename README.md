# 누구의 서재

멀티유저 독후감/영화/글방 사이트. 각자 본인 서재만 보이는 멀티테넌트 모델 — 리뷰별로 *공개*를 선택하면 공개 피드(`/feed`)와 작품 페이지(`/works`)에 노출됩니다. 사이트 제목은 로그인 상태에 따라 동적으로 바뀝니다 (비로그인 "누구의 서재" / 로그인 "{displayName}의 서재"). 토스 스타일 디자인 시스템 + 다크모드 + 본문 검색 + 페이지네이션.

**Tech**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (CSS-first) · Drizzle ORM · libsql/Turso · Biome · Pretendard · Radix Dialog · sonner · chart.js · Vercel Blob

## 기능

- **독후감 CRUD** — 제목·작가·읽은 날짜·14개 장르·별점·태그·한줄평·마크다운 본문 (Toast UI Editor). ISBN 기반 외부 메타 자동 채우기
- **영화 기록 CRUD (`/movies`)** — 감독·본 날짜·10개 장르·별점·태그·한줄평. TMDB 자동 채우기. 독후감과 동형 구조
- **글방 CRUD** — 책과 분리된 자유 글 — 제목·태그·마크다운 본문 + **대표 이미지** (Vercel Blob 업로드, rate limit, 고아 blob 정리). 독후감·영화와 태그 풀 공유
- **별점 half-star** — 저장은 1~10 정수, 표시는 0.5~5 별점 (반 칸 단위 선택)
- **공개 피드 (`/feed`)** — 리뷰별 공개 토글 → 공개된 책/영화 리뷰가 모두에게 노출. 멀티테넌트의 유일한 의도적 예외
- **통계 대시보드** — 책장/영화관/글방 목록 상단 접이식 패널. chart.js로 별점 분포·장르 도넛·연도 타임라인·태그/저자/감독 Top 5 (글방은 월별 작성·글자수). 펼칠 때만 lazy fetch
- **검색** — 제목·작가·**본문 LIKE** 매칭, 가중치 랭킹(제목→작가→본문), 매칭 부근 스니펫 + `<mark>` 키워드 하이라이트, LIKE 패턴 escape
- **장르/태그 필터링**, 최근/별점 정렬, **페이지네이션** (limit/offset + total count)
- **삭제 모달** — Radix Dialog 기반 focus-trap·Esc·backdrop 모달
- **토스트 피드백** — sonner (등록/수정/삭제 알림)
- **다크모드** — 시스템/라이트/다크 3-state 수동 토글, OS 자동 추종, 0-FOUC inline 부트스트랩
- **인증** — bcrypt + HS256 JWT 쿠키 (issuer/audience 검증) + Next.js proxy (CSRF Origin/Referer 차단·세션 검증·mcp 강제 변경)
- **세션 무효화** — `users.tokenVersion` + JWT `tv` 클레임 매칭 — 비번 변경/admin 리셋 시 이전 토큰 자동 거절
- **권한** — 본인 책/영화/글만 읽기/쓰기/수정/삭제. admin은 사용자 관리(`/admin/users`)와 비번 reset 추가 가능 (마지막 admin 삭제 방지)
- **사용자 관리** — admin이 신규 멤버 생성, 기본 비밀번호로 첫 로그인 → 강제 변경, 비번 reset 지원, `/settings/password`·`/settings/profile`
- **접근성** — focus-visible ring 일관성, 44×44 탭 타겟, `prefers-reduced-motion` 대응, 시각/스크린리더 친화
- **모바일** — iOS 줌 방지 (인풋 16px), 가로 스크롤 chip + PC 마우스 드래그, 안전 영역 padding
- **스켈레톤 로딩** — 홈/목록/상세 라우트에 토스 톤 placeholder
- **작품 검색 (`/works`)** — Naver Book / TMDB로 책·영화를 검색해 사이트 사용자들의 별점·한줄평 묶음을 외부 ID(ISBN/tmdbId) 기반으로 조회

## 로컬 실행

```bash
pnpm install
cp .env.example .env.local
# .env.local에 채우기:
#   AUTH_SECRET             — 32자 이상 무작위 키
#   INITIAL_ADMIN_USERNAME  — admin 로그인 ID (예: hammer_turtle)
#   INITIAL_ADMIN_PASSWORD  — admin 초기 비밀번호 (8자 이상, 평문)
#   DEFAULT_USER_PASSWORD   — 신규 멤버 초기 비밀번호 (8자 이상)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # AUTH_SECRET용

pnpm exec dotenv -e .env.local -- drizzle-kit push   # 로컬 SQLite 마이그레이션
pnpm exec dotenv -e .env.local -- pnpm run seed:admin  # 첫 admin 계정 생성
pnpm dev
```

### 기존 책 데이터 마이그레이션 (운영 중인 사이트만)

이전에 단일 admin으로 운영되던 책 데이터가 있다면, `sayhee` 같은 member 계정을 만들어서 한 번에 옮길 수 있습니다.

```bash
# .env.local에 추가:
#   LEGACY_OWNER_USERNAME=sayhee
#   LEGACY_OWNER_PASSWORD_HASH=\$2a\$12\$...  (bcrypt 해시, $ 모두 \$ escape)

pnpm exec dotenv -e .env.local -- pnpm run migrate:existing-books
```

마이그레이션 후 schema의 `author_user_id`를 NOT NULL로 토글 (drizzle-kit이 table-rename으로 처리).

### 사용자 추가 / 비번 reset

admin으로 로그인 → 우측 메뉴 → "사용자 관리" → "신규 사용자" 또는 "비번 reset".
새/reset된 사용자는 `DEFAULT_USER_PASSWORD`로 첫 로그인 후 강제 변경됩니다.

### 외부 작품 검색 API (선택)

리뷰 작성 시 책·영화 메타데이터 자동 채우기를 사용하려면:

- `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` — [네이버 개발자센터](https://developers.naver.com/apps/#/register?api=search)에서 발급 (비로그인 오픈 API, 책 검색만 사용)
- `TMDB_API_KEY` — [TMDB v3](https://www.themoviedb.org/settings/api)의 **API Read Access Token (v4)** (Bearer 헤더로 전송하므로 짧은 v3 키가 아닌 긴 JWT 형식 사용)

키 없이도 사이트는 정상 작동합니다 — 검색 바에서만 503 에러 toast가 표시되고, 사용자는 폼 필드를 직접 입력할 수 있습니다.

### `/works` — 작품 검색

외부 API(Naver Book Search / TMDB)로 책·영화를 검색하면, 사이트 사용자들이 그 작품에 남긴 별점·한줄평을 모아 볼 수 있습니다. URL 영구화를 위해 외부 ID(ISBN, tmdbId)를 사용합니다.

- `/works?type=book&q=어린왕자` — 검색
- `/works/book/<isbn>` — 책 상세 (사이트 별점 분포 + 한줄평 리스트)
- `/works/movie/<tmdbId>` — 영화 상세

요구 환경 변수는 위 외부 작품 검색 API 섹션과 동일 — `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`, `TMDB_API_KEY`. DB 마이그레이션 없음.

## 테스트

```bash
pnpm test         # Vitest 단위 + 통합 (292개)
pnpm e2e          # Playwright E2E (골든패스·공개 피드·작품 검색·통계 패널 등 15 spec)
pnpm lint         # Biome check (lint + format 검사)
pnpm format       # Biome 자동 수정 (safe)
```

통합 테스트(`tests/integration/`)는 실제 libSQL(임시 파일)을 띄워 멀티테넌트 격리·페이지네이션·통계 대시보드·공개 피드를 검증합니다.

E2E는 `tests/e2e/global-setup.ts`가 표준 계정(`e2e-alice`/`e2e-bob`)을 자동 시드합니다 — 별도 계정 준비 불필요. 로그인 헬퍼는 `tests/e2e/helpers.ts`.

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
   - `AUTH_SECRET` (`$` 그대로 입력 — Vercel은 escape 불필요)
   - `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` / `DEFAULT_USER_PASSWORD`
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` / `TMDB_API_KEY` (작품 검색용, 선택)
   - `BLOB_READ_WRITE_TOKEN` — Vercel Blob store 연결 시 자동 주입 (글방 대표 이미지)
5. **첫 배포 후 운영 DB에 초기 스키마 push**
   ```bash
   TURSO_URL=libsql://... TURSO_TOKEN=... pnpm exec drizzle-kit push
   ```
   ⚠️ **빈 DB 초기 생성만 push 사용.** 이후 스키마 변경은 Turso에서 push가 실패하고
   `drizzle-kit migrate`도 silent no-op이 됩니다 — raw `@libsql/client` ALTER + `PRAGMA table_info`
   검증으로 적용하세요 (자세한 내용은 `CLAUDE.md` Gotchas).
6. 이후 `git push origin main` → Vercel 자동 빌드/배포

## 구조

```
src/
├ app/
│  ├ layout.tsx            ─ RootLayout (Pretendard·테마 부트스트랩·Toaster·헤더)
│  ├ globals.css           ─ Tailwind v4 @theme 토큰 + 다크모드 + 모션 안정성
│  ├ icon.tsx              ─ 📚 emoji 동적 favicon
│  ├ page.tsx              ─ 홈 (getUserStats 단일 쿼리·KST 연도·최근 책/영화/글)
│  ├ books/, movies/       ─ 목록(+접이식 통계 패널)·상세·new·edit
│  ├ writings/             ─ 글방 목록·상세·new·edit (대표 이미지)
│  ├ feed/                 ─ 공개 피드 (책/영화 탭)
│  ├ works/                ─ 작품 검색 + book/[isbn]·movie/[tmdbId] 공개 집계
│  ├ admin/users/, settings/, login/
│  ├ error.tsx, not-found.tsx, loading.tsx
│  └ api/
│     ├ books/, movies/, writings/  ─ CRUD + stats/ (대시보드 집계)
│     ├ uploads/           ─ 글방 cover 업로드/보상삭제 (Vercel Blob, rate limit)
│     ├ external/          ─ 외부 검색 프록시 (Naver Book / TMDB)
│     ├ users/, admin/     ─ 사용자 관리 (admin-only) + me/password, me/profile
│     ├ login/, logout/    ─ 세션 발급/말소
│     └ tags/              ─ 태그 자동완성
├ components/
│  ├ BookCard·Form, MovieCard·Form, WritingCard·Form, GenreBadge, RatingStars·Score, TagInput
│  ├ stats/                ─ StatsPanel(접이식)·StatsDashboard·charts (chart.js lazy)
│  ├ works/                ─ 작품 검색·상세 카드, RatingDistribution
│  ├ ExternalBook·MovieSearchBar ─ 외부 메타 자동 채우기
│  ├ SearchBox, Filters, Pagination, MarkdownEditor·Viewer, ThemeToggle, ConfirmDialog
│  ├ UserAdminTable, PasswordChangeForm, ProfileForm
│  └ LocalDate, Spinner, EmptyState, Skeleton
├ lib/
│  ├ auth.ts / auth-edge.ts ─ bcrypt + HS256 JWT (issuer/audience·tokenVersion·DUMMY_HASH)
│  ├ auth-helpers.ts        ─ requireUser/Admin/OwnBook/OwnWriting + HttpError
│  ├ db/                    ─ schema + client + queries/ (books·movies·writings·tags·stats·shared)
│  ├ external/              ─ 외부 API lookup·rate-limit·route-factory
│  ├ rating.ts              ─ 별점 ÷2 표시 변환 단일 지점 (저장 1~10 → 표시 0.5~5)
│  ├ kst.ts                 ─ KST 기준 "올해" 연도 단일 소스
│  ├ stats-types.ts         ─ 대시보드 공유 타입 (서버/클라이언트 계약)
│  ├ blob.ts, image-constraints.ts ─ Vercel Blob 업로드·제약
│  ├ excerpt.ts, highlight.tsx, slug.ts, genres.ts, isbn.ts, validations.ts, username-normalize.ts
│  └ public-feed-cache.ts, works-detail-cache.ts
└ proxy.ts                  ─ CSRF (Origin/Referer) + 세션 검증 + mcp 강제 변경 게이트

drizzle/                    ─ 마이그레이션 SQL
tests/
├ unit/                     ─ Vitest (auth·validations·blob·uploads/stats 라우트·components 등)
├ integration/              ─ Vitest + 실제 libSQL (멀티테넌트 scoping·통계·공개 피드·works 집계)
└ e2e/                      ─ Playwright (골든패스·공개 피드·작품 검색·통계 패널 등 15 spec)
docs/superpowers/           ─ 설계서·구현 계획서·plans (히스토리 reference)
public/fonts/               ─ Pretendard Variable woff2 (로컬 호스팅)
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
