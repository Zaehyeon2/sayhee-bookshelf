# 독후감 사이트 설계서

- **작성일**: 2026-05-25
- **프로젝트명**: book-report
- **목적**: 본인이 읽은 책의 독후감을 모아 두고, 웹에서 어디서나 열람·작성할 수 있는 1인용 사이트.

---

## 1. 결정 요약

| 영역 | 결정 |
|---|---|
| 사용자 | 단일 운영자(작성자 본인). 읽기는 공개, 쓰기/수정은 본인만. |
| 배포 | Vercel (Hobby 무료) — `git push`로 자동 배포 |
| DB | Turso (libsql, SQLite 호환) 무료 티어 |
| 본문 에디터 | Toast UI Editor — WYSIWYG UI, 마크다운으로 저장 |
| 인증 | 환경변수 비밀번호(bcrypt 해시) + 서명된 HTTP-only 세션 쿠키. NextAuth 미사용. |
| 저장 항목 | 제목, 작가, 장르(고정 14종), 읽은 날짜, 별점(1~5), 태그(다중), 본문(마크다운) |
| 제외 항목 | 책 표지 이미지, 인용문 별도 저장 (필요 시 추후 추가) |

## 2. 기술 스택

- **프레임워크**: Next.js 16 (App Router) + React 19 + TypeScript
- **DB 클라이언트**: `@libsql/client` (Turso 공식)
- **ORM**: Drizzle ORM + `drizzle-kit` (마이그레이션)
- **스타일**: Tailwind CSS v4
- **에디터**: `@toast-ui/react-editor`
- **마크다운 뷰**: Toast UI Editor의 `Viewer` 컴포넌트 (외부 사용자 입력이 없으므로 별도 sanitizer 불필요. 단, 본인이 붙여 넣을 수 있는 위험한 HTML에 대비해 Toast UI 기본 설정의 sanitize를 켠 상태 유지)
- **인증**: 자체 구현. 비밀번호는 `bcrypt`로 해시, 세션은 `jose`로 HS256 서명된 JWT를 HTTP-only/SameSite=Lax 쿠키에 저장. 만료 7일.
- **입력 검증**: Zod (폼·API 양쪽)
- **알림 UI**: `sonner` (가벼운 토스트)
- **테스트**: Vitest + @testing-library/react + Playwright (E2E 1~2개)
- **패키지 매니저**: pnpm (빠르고 디스크 효율적, lockfile은 `pnpm-lock.yaml`)

### 라이브러리 선택 근거

- **Drizzle vs Prisma**: Prisma는 Rust 쿼리 엔진을 번들에 포함시켜 배포 사이즈가 커지고 Edge runtime에서 일부 제약이 있다. Drizzle은 순수 TypeScript이며 libsql/Turso 1급 지원, SQL에 가까운 API라 디버깅이 쉽다.
- **NextAuth 미사용**: 단일 사용자·단일 자격증명이라 NextAuth의 다공급자/세션 추상화는 오버킬이다. 60줄 안팎의 자체 인증이 더 단순하고 명확하다.
- **Toast UI Editor**: WYSIWYG 외관 + 마크다운 저장. 사용자가 마크다운 문법을 외울 필요가 없으면서도 데이터 휴대성이 유지된다.

## 3. 데이터 모델

### 3.1 SQL (개념)

```sql
CREATE TABLE books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  author      TEXT    NOT NULL,
  genre       TEXT    NOT NULL,                 -- 코드의 GENRES 상수로 제한
  read_date   TEXT    NOT NULL,                 -- 'YYYY-MM-DD'
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content     TEXT    NOT NULL DEFAULT '',      -- 마크다운 원문
  slug        TEXT    NOT NULL UNIQUE,          -- URL용
  created_at  INTEGER NOT NULL,                 -- unix epoch (ms)
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_books_title  ON books(title);
CREATE INDEX idx_books_author ON books(author);
CREATE INDEX idx_books_genre  ON books(genre);
CREATE INDEX idx_books_date   ON books(read_date);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE book_tags (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

CREATE INDEX idx_book_tags_tag ON book_tags(tag_id);
```

### 3.2 장르 상수 (코드에서 강제)

```ts
// src/lib/genres.ts
export const GENRES = [
  '소설', '추리/스릴러', '판타지/SF', '시', '에세이',
  '인문/철학', '역사', '사회/경제', '과학/IT', '자기계발',
  '예술', '종교', '만화', '기타',
] as const

export type Genre = typeof GENRES[number]
```

DB 컬럼은 `TEXT`이며 CHECK 제약을 두지 않는다 — 장르 추가/변경 시 마이그레이션 없이 코드만 수정하면 된다. 입력은 Zod 스키마(`z.enum(GENRES)`)와 폼 dropdown으로 강제한다.

### 3.3 관계도

```
┌──────────┐         ┌───────────┐         ┌────────┐
│  books   │ 1 ── N  │ book_tags │  N ── 1 │  tags  │
└──────────┘         └───────────┘         └────────┘
```

### 3.4 설계 메모

- `read_date`는 ISO 문자열 `'YYYY-MM-DD'`. SQLite에 native date 타입이 없고, 사전식 비교/정렬로 충분하다.
- `slug`는 비어 있을 수 없다(UNIQUE). 한국어 제목은 `lib/slug.ts`에서 공백→하이픈, 특수문자 제거, 길이 제한 50자, 중복 시 `-2`, `-3` suffix 부여.
- 모든 타임스탬프는 unix epoch milliseconds(integer) 저장. 표시는 클라이언트에서 포맷.
- 향후 표지/인용문 필요 시 컬럼 추가 또는 `quotes` 테이블 추가로 확장.

## 4. 라우팅

| URL | 설명 | 인증 |
|---|---|---|
| `/` | 홈 — 장르 그리드(14개) + 최근 읽은 6권 | 공개 |
| `/books` | 책 목록 — 필터(`?genre=`, `?tag=`, `?year=`) + 검색(`?q=`) + 정렬(`?sort=date|rating`) | 공개 |
| `/books/[slug]` | 책 상세 (본문 마크다운 렌더링) | 공개 |
| `/login` | 비밀번호 입력 폼 | 공개 |
| `/admin/new` | 새 독후감 작성 | 🔒 |
| `/admin/edit/[id]` | 독후감 수정 | 🔒 |
| `/api/login`      `POST` | 비밀번호 검증 → 세션 쿠키 발급 | 공개 |
| `/api/logout`     `POST` | 세션 쿠키 삭제 | 공개 (멱등) |
| `/api/books`      `POST` | 책 생성 | 🔒 |
| `/api/books/[id]` `PUT/DELETE` | 책 수정/삭제 | 🔒 |
| `/api/tags/suggest?q=` | 태그 자동완성 (LIKE 부분일치, 상위 8개) | 🔒 |

### 검색 구현

- **범위**: 제목·작가 부분일치만. 본문은 검색에서 제외한다.
- **SQL**: `WHERE title LIKE '%'||?||'%' OR author LIKE '%'||?||'%'`
- `idx_books_title`, `idx_books_author` 인덱스로 책 수가 늘어도 빠르게 유지.
- FTS5는 도입하지 않는다 (당분간).

## 5. 인증 흐름

```
1. /admin/* 접근
   └─ middleware.ts: 'session' 쿠키의 JWT 서명·만료 검증
       ├─ 무효 → /login?from=<원래 경로>로 리다이렉트
       └─ 유효 → 통과

2. /login에서 비밀번호 제출
   └─ POST /api/login
       ├─ bcrypt.compare(input, env.ADMIN_PASSWORD_HASH)
       ├─ 일치 → jose로 HS256 JWT 발급 (만료 7일) → HTTP-only 쿠키 세팅
       └─ 불일치 → setTimeout(1000) 후 401 응답 (브루트포스 완화)

3. /api/logout
   └─ 'session' 쿠키 만료 처리 → /로 리다이렉트
```

### 보안 메모

- **환경변수**: `ADMIN_PASSWORD_HASH`(bcrypt 해시), `AUTH_SECRET`(JWT 서명 키, 32바이트 이상)
- 평문 비밀번호는 어디에도 저장하지 않는다.
- 쿠키 속성: `HttpOnly`, `Secure`(prod), `SameSite=Lax`, `Path=/`.
- 실패 응답은 일관된 메시지("로그인 실패")로 정보 노출 최소화.
- middleware는 Edge runtime에서 동작하므로 DB 접근 없이 쿠키 서명 검증만 한다.

## 6. 폴더 구조

```
book-report/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                  # 홈
│  │  ├─ books/
│  │  │  ├─ page.tsx               # 목록 + 필터 + 검색
│  │  │  └─ [slug]/page.tsx        # 상세
│  │  ├─ login/page.tsx
│  │  ├─ admin/
│  │  │  ├─ new/page.tsx
│  │  │  └─ edit/[id]/page.tsx
│  │  ├─ api/
│  │  │  ├─ login/route.ts
│  │  │  ├─ logout/route.ts
│  │  │  ├─ books/route.ts             # POST
│  │  │  ├─ books/[id]/route.ts        # PUT, DELETE
│  │  │  └─ tags/suggest/route.ts
│  │  ├─ layout.tsx
│  │  ├─ not-found.tsx
│  │  ├─ error.tsx
│  │  └─ globals.css
│  ├─ components/
│  │  ├─ BookCard.tsx
│  │  ├─ BookForm.tsx              # 작성/수정 공용 (Toast UI 포함)
│  │  ├─ RatingStars.tsx
│  │  ├─ GenreBadge.tsx
│  │  ├─ TagInput.tsx              # 다중 입력 + 자동완성
│  │  ├─ SearchBox.tsx
│  │  └─ Filters.tsx
│  ├─ lib/
│  │  ├─ db/
│  │  │  ├─ schema.ts              # Drizzle 스키마
│  │  │  ├─ client.ts              # libsql 클라이언트 (env로 url/token)
│  │  │  └─ queries.ts             # 자주 쓰는 쿼리 함수들
│  │  ├─ auth.ts                   # 쿠키 발급/검증, bcrypt 비교
│  │  ├─ genres.ts                 # GENRES, Genre 타입
│  │  ├─ slug.ts                   # 제목 → slug 변환 + 중복 처리
│  │  └─ validations.ts            # Zod 스키마 (CreateBookSchema 등)
│  └─ middleware.ts                # /admin/* 보호
├─ drizzle/                        # 마이그레이션 파일 자동 생성
├─ tests/
│  ├─ unit/                        # Vitest
│  └─ e2e/                         # Playwright
├─ .env.local                      # ADMIN_PASSWORD_HASH, AUTH_SECRET, TURSO_URL, TURSO_TOKEN
├─ .env.example
├─ .gitignore                      # .env.local, .superpowers/, node_modules/, .next/
├─ drizzle.config.ts
├─ next.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
└─ package.json
```

## 7. 오류 처리

| 영역 | 처리 |
|---|---|
| 폼 입력 | Zod로 검증, 필드 옆에 에러 메시지 표시 |
| API 4xx/5xx | `app/error.tsx`(라우트 단위) + sonner 토스트 |
| 404 (책 없음) | `app/not-found.tsx`에서 친화적 메시지 |
| DB 연결 실패 | 일반 에러 페이지 + Vercel 로그에 자세히 기록 |
| 로그인 실패 | 일관된 "로그인 실패" 메시지 + 1초 인공 지연 |
| slug 충돌 | `-2`, `-3` suffix 자동 부여 후 재시도 (`lib/slug.ts` 내부) |
| 태그 중복 입력 | 동일 이름 태그는 1개로 자동 deduplicate (대소문자 보존, 앞뒤 공백 제거) |

## 8. 테스트 전략

| 종류 | 도구 | 대상 |
|---|---|---|
| 단위 | Vitest | `lib/auth.ts`, `lib/slug.ts`, `lib/validations.ts`, `lib/db/queries.ts`(in-memory libsql) |
| 컴포넌트 | Vitest + Testing Library | `RatingStars`, `TagInput`, `BookForm` 렌더링/유효성 |
| E2E | Playwright (2개) | (a) 로그인→새 글 작성→목록에 노출 (골든 패스), (b) 잘못된 비밀번호 차단 |
| 수동 | 브라우저 | 마크다운 렌더 결과 시각 확인 |

원칙: 로직이 있는 코드 중심으로 단위 테스트, 시스템 통합 확인은 E2E 1~2개로 충분히 둔다.

## 9. 배포

1. GitHub 저장소 생성, `main`에 push.
2. Turso CLI로 prod DB 생성 → `TURSO_URL`, `TURSO_TOKEN` 발급.
3. Vercel에서 GitHub 저장소 연결 → 자동 빌드/배포.
4. Vercel 환경변수 등록: `TURSO_URL`, `TURSO_TOKEN`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`.
5. 첫 배포 직후 `drizzle-kit push`(또는 마이그레이션) 실행으로 prod 스키마 생성.
6. 이후 `git push` 자동 배포 (PR마다 Preview, main 머지 시 Production).

### 환경별 DB

- **로컬 개발**: `libsql://file:./local.db` (SQLite 파일 1개)
- **Vercel Preview**: prod와 동일한 Turso DB를 사용하거나, 필요 시 별도 dev Turso DB 분리
- **Vercel Production**: Turso prod DB

## 10. 구현 마일스톤

각 마일스톤은 "동작하는 상태"를 유지한다. PR 단위로 분리해 리뷰 용이.

```
M1. 부트스트랩
    Next.js 16 + Tailwind + TypeScript 초기화
    홈 페이지에 "Hello" 표시, npm run dev 동작

M2. DB & 모델
    Drizzle 스키마 (books, tags, book_tags) + 인덱스
    queries.ts: createBook, listBooks, getBookBySlug, listTags 등
    Vitest로 in-memory libsql 단위 테스트

M3. 공개 페이지
    /, /books, /books/[slug]
    BookCard, RatingStars, GenreBadge 구현
    더미 시드 데이터로 화면 검증

M4. 인증
    /login, /api/login, /api/logout, middleware.ts
    bcrypt 해시 + HS256 JWT 쿠키
    Playwright E2E: 비밀번호 오류 차단

M5. 작성/수정 (보호)
    /admin/new, /admin/edit/[id]
    BookForm + Toast UI Editor + TagInput 자동완성
    POST/PUT/DELETE API + Zod 검증

M6. 필터·검색
    /books?genre=&tag=&year=&q=&sort=
    Filters, SearchBox 컴포넌트, 인덱스 활용 쿼리

M7. 배포
    Turso prod DB, Vercel 연결, 환경변수
    E2E 골든 패스 통과 후 production 머지
```

## 11. 미래에 열어둔 결정

다음은 의도적으로 지금 만들지 않지만, 데이터/구조가 차후 확장에 열려 있다:

- 책 표지 이미지: `books.cover_url` 컬럼 추가 + Vercel Blob 연동
- 인용문 영역: `quotes(book_id, text, page)` 별도 테이블
- 본문 풀텍스트 검색: SQLite FTS5 가상 테이블 추가
- 통계 페이지: 연도별·장르별 카운트 (기존 데이터에서 집계만 하면 됨)
- 외부 공유용 OG 이미지: 책 상세 페이지에 동적 OG 이미지 (Next.js `opengraph-image`)

## 12. 비기능 요건

- **성능**: 책 수 1,000권 이하 가정 시 모든 페이지 LCP < 1.5s 목표.
- **접근성**: 별점·태그 입력에 키보드 조작 지원, 색에 의존하지 않는 표시.
- **모바일**: 모든 페이지가 320px~ 너비에서 깨지지 않게 Tailwind responsive utility 일관 적용.
- **로그**: 로그인 실패·DB 오류는 Vercel 로그에 자세히, 사용자 화면엔 일반 메시지.
