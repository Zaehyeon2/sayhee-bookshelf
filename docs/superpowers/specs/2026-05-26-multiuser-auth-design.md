# 멀티유저 인증 & 개인 서재/글방 — 설계

- **작성일**: 2026-05-26
- **상태**: 설계 확정, 구현 계획 작성 대기
- **현재 사이트**: 단일 admin(환경변수)로 운영 중. **기존 책 데이터가 있음** — 모두 신규 **member** user `sayhee` 소유로 마이그레이션. admin 역할은 별도 계정으로 분리.

## 1. 배경 & 목표

현재 시스템은 `ADMIN_PASSWORD_HASH` 환경변수 하나로 인증되는 단일 관리자 구조다. 사이트 제목은 "세희의 서재"로 박혀 있고, 모든 책이 한 풀에 들어간다.

이를 **개인 서재(멀티테넌트) + 완전 비공개** 모델로 전환한다. 각 사용자는 본인 서재만 가지며, 다른 사용자의 서재는 일절 열람할 수 없다. 사이트 제목은 로그인 상태에 따라 동적으로 바뀐다.

추가로 **개인 글(시/에세이/일기 등 자유로운 형식)** 작성 기능을 별도 공간(`/writings`)으로 제공한다. 책장과 글방은 *별도 메뉴 / 별도 페이지*로 분리된다.

## 2. 확정된 요구사항

| # | 결정사항 |
|---|---|
| R1 | **데이터 분리(멀티테넌트)** — 각 사용자는 본인의 책만 보고/만들고/수정/삭제 |
| R2 | 사용자 가입은 **관리자 수동 생성**만. 공개 회원가입 UI 없음 |
| R3 | **완전 비공개** — 다른 사용자의 서재는 admin도 열람 불가 |
| R4 | admin이 사용자 생성/reset 시 **기본 비밀번호** 부여, 첫 로그인 시 변경 강제 |
| R5 | 비밀번호 변경 폼은 **새 비번 + 새 비번 확인** 두 필드, 일치 검사 |
| R6 | `username` 한글 허용, 변경 불가. `displayName`은 본인 변경 가능 |
| R7 | 사이트 제목 동적:<br>· 로그인 전 → `누구의 서재`<br>· 로그인 후 → `{displayName}의 서재` |
| R8 | 책 데이터(GET 포함)는 모두 `requireUser` + `WHERE authorUserId = me.id`로 scoping |
| R9 | slug 유일성은 `(authorUserId, slug)` composite UNIQUE — 두 사용자가 같은 책 등록 가능 |
| R10 | 비로그인 진입 시 `/`는 안내 페이지(공개), 보호된 경로는 `/login`으로 redirect |
| R11 | **개인 글(`writings`)** — 책과 별개의 컨텐츠 타입. 형식 자유(시/에세이/일기 등), 종류 구분 컬럼 없음 |
| R12 | 글의 필드: `title` + `body`(마크다운) + `createdAt`. 책의 `genre`/`rating`/`author`/`readDate`는 없음 |
| R13 | 글도 책과 동일 권한 정책: 본인만 보고/만들고/수정/삭제. `requireUser` + `WHERE authorUserId = me.id` |
| R14 | 글 slug 유일성도 `(authorUserId, slug)` composite UNIQUE |
| R15 | 헤더 메뉴: "📚 책장(/books)" + "✏️ 글방(/writings)" 분리. 관리도 `/admin/new-book` / `/admin/new-writing` 분기 |
| R16 | 태그 풀은 책과 글이 *공유* (한 사용자 안에서) — 같은 태그를 책에도 글에도 붙일 수 있음 |

## 3. 데이터 모델

### 3.1 신규: `users`

```ts
users
  id: integer PK
  username: text UNIQUE NOT NULL           // NFC+lowercase 정규화
  displayName: text NOT NULL
  passwordHash: text NOT NULL              // bcrypt
  role: text NOT NULL DEFAULT 'member'     // 'admin' | 'member'
  mustChangePassword: integer NOT NULL DEFAULT 1
  createdAt: integer NOT NULL
```

- UNIQUE index: `username`

### 3.2 변경: `books`

```diff
  books
+   authorUserId: integer NOT NULL REFERENCES users(id) ON DELETE CASCADE
-   slug UNIQUE
+   UNIQUE (authorUserId, slug)
```

- 신규 인덱스: `idx_books_author_user`
- `slug` 단독 UNIQUE 제약 제거 → `(authorUserId, slug)` composite UNIQUE
- 사용자 삭제 시 그 사용자의 책도 CASCADE 삭제 (관리자가 사용자 삭제 시 명확한 동작)

### 3.3 신규: `writings` (개인 글)

```ts
writings
  id: integer PK
  authorUserId: integer NOT NULL REFERENCES users(id) ON DELETE CASCADE
  title: text NOT NULL
  body: text NOT NULL DEFAULT ''            // 마크다운
  slug: text NOT NULL
  createdAt: integer NOT NULL
  updatedAt: integer NOT NULL
```

- 인덱스: `idx_writings_author_user`, `idx_writings_created_at`
- UNIQUE: `(authorUserId, slug)` composite
- ON DELETE CASCADE: 사용자 삭제 시 글도 함께 삭제

### 3.4 신규: `writingTags` (조인 테이블)

```ts
writingTags
  writingId: integer NOT NULL REFERENCES writings(id) ON DELETE CASCADE
  tagId: integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE
  PRIMARY KEY (writingId, tagId)
```

- 인덱스: `idx_writing_tags_tag`
- `tags` 테이블은 그대로 재사용 — 책 태그/글 태그가 같은 풀

### 3.5 기존 책 데이터가 있으므로 *3단계 마이그레이션* 필요

기존 책들이 있어 NOT NULL FK를 즉시 부착할 수 없다. 마이그레이션 §7에서 다음 순서로 처리:

1. `books.author_user_id`를 **NULLABLE FK**로 추가
2. 시드 admin user(`sayhee`) 생성 후, `UPDATE books SET author_user_id = sayhee.id`로 모든 행 backfill
3. schema.ts에서 NOT NULL로 변경 → 두 번째 push에서 drizzle-kit이 table-rename 절차로 NOT NULL 재적용

`writings` 테이블은 신설이라 처음부터 NOT NULL FK로 생성 가능.

### 3.6 의도적으로 제외

- `comments` 테이블 — 댓글 기능 폐기
- `users.email` — 비번 재설정이 admin manual reset이라 불필요
- 책/글 공동 저자 — 단일 저자
- 사용자 간 책/글 공유 / 팔로우 / 추천 — 완전 비공개 정책
- 글에 `genre`/`rating`/`readDate`/`author` — 자유 형식
- 글 종류 구분(`type`) 컬럼 — 시/에세이/일기 등 자유 형식, 종류 미구분 (R11)
- 글 본문 검색 — 초기 스코프 단순화 (책은 본문 검색 유지)

## 4. 인증 시스템

### 4.1 JWT 페이로드

```ts
{
  sub: number,                  // user.id
  username: string,
  role: 'admin' | 'member',
  mcp: 0 | 1,                   // mustChangePassword
  iat, exp                      // 만료 7일
}
```

JWT에 `displayName`은 *넣지 않음* — displayName 변경 시 즉시 반영되어야 하는데 JWT는 변경 못 함. 헤더에 표시할 displayName은 서버 컴포넌트에서 매 요청 시 DB 조회 (User 조회 1회는 cold start 외엔 빠름).

### 4.2 `src/lib/auth.ts` 함수 (개편)

| 함수 | 시그니처 | 비고 |
|---|---|---|
| `authenticate` | `(username, password) → User \| null` | bcrypt.compare. 실패 시에도 dummy bcrypt → timing attack 방지. 실패 시 1초 인위 지연(기존 패턴 유지) |
| `signSession` | `(user) → string` | JWT 발급 |
| `getSessionUser` | `(token?) → SessionUser \| null` | JWT verify → 페이로드 추출. **displayName이 필요하면 별도 DB 조회**(`getCurrentUser`) |
| `getCurrentUser` | `() → User \| null` | 쿠키 → JWT → users 테이블 조회. 헤더/페이지에서 사용 |

### 4.3 Middleware (`src/middleware.ts` 신규)

```
matcher: ['/books/:path*', '/writings/:path*', '/admin/:path*', '/settings/:path*']

middleware(req):
  user = getSessionUser(cookie)
  if (!user)
    return redirect('/login')
  if (user.mcp === 1 && !isPasswordChangePath(req.path))
    return redirect('/settings/password')
```

- `/`는 matcher에 *없음* — 비로그인도 진입 가능 (안내 페이지)
- 로그인 사용자가 `/` 진입 시 페이지 컴포넌트가 본인 책 목록 렌더

### 4.4 권한 헬퍼 (`src/lib/auth-helpers.ts` 신규)

```ts
requireUser(): Promise<SessionUser>                          // 미로그인 → 401
requireAdmin(): Promise<SessionUser>                         // 비admin → 403
requireOwnBook(bookId): Promise<{user, book}>                // 미로그인 → 401, 본인 책 아님 → 404
requireOwnWriting(writingId): Promise<{user, writing}>       // 동일 패턴 — 본인 글 아님 → 404
```

- `requireOwnBook` / `requireOwnWriting`은 404를 던짐 (403이 아님) — *리소스의 존재 자체를 노출하지 않기 위해*. 완전 비공개 정책의 자연스러운 귀결.

### 4.5 username 정규화

`src/lib/username-normalize.ts` 신규.

```
normalize(input) = NFC(input).toLowerCase().trim()
```

- 저장 + 조회 시점 둘 다 적용
- 검증: 2~20자, 공백·`/`·`?`·`#`·`@`·`&` 금지

### 4.6 로그인 실패 메시지

`"아이디 또는 비밀번호가 올바르지 않습니다"` — username/password 케이스 통합 (enumeration 방지)

## 5. API 라우트 매트릭스

모든 라우트가 사용자 scoping 또는 권한 검사를 가진다.

### 5.1 인증 / 사용자

| Route | Method | 권한 | 동작 |
|---|---|---|---|
| `/api/login` | POST | public | `{username, password}` |
| `/api/logout` | POST | public | 쿠키 삭제 |
| `/api/users/me/password` | POST | requireUser | `{currentPassword, newPassword, newPasswordConfirm}`. 일치+검증 → 새 hash, `mcp=0`. 신규 JWT 쿠키 재셋팅 |
| `/api/users/me/profile` | POST | requireUser | `{displayName}` 변경 |

### 5.2 책

| Route | Method | 권한 | 동작 |
|---|---|---|---|
| `/api/books` | GET | requireUser | **`WHERE authorUserId = me.id`** 로 본인 책만 |
| `/api/books` | POST | requireUser | `authorUserId = me.id` 자동 주입. slug 충돌 시 `(authorUserId, slug)`에서 발생하므로 본인 서재 내에서만 검사 |
| `/api/books/[id]` | GET | requireOwnBook | 본인 책 아님 → 404 |
| `/api/books/[id]` | PATCH | requireOwnBook | |
| `/api/books/[id]` | DELETE | requireOwnBook | |
| `/api/tags/suggest` | GET | requireUser | 책/글 공통 태그 자동완성. 본인의 책 태그 + 글 태그 합집합 (scoping) |

### 5.3 글 (writings)

| Route | Method | 권한 | 동작 |
|---|---|---|---|
| `/api/writings` | GET | requireUser | `WHERE authorUserId = me.id` ORDER BY createdAt DESC |
| `/api/writings` | POST | requireUser | `{title, body, tags}`. authorUserId = me.id 자동 주입. slug = toSlug(title), 충돌 시 `-2`, `-3` … (책과 동일 패턴, `(authorUserId, slug)` composite 인덱스에서 검사) |
| `/api/writings/[id]` | GET | requireOwnWriting | 본인 글 아님 → 404 |
| `/api/writings/[id]` | PATCH | requireOwnWriting | `{title?, body?, tags?}` |
| `/api/writings/[id]` | DELETE | requireOwnWriting | |

### 5.4 admin (사용자 관리)

| Route | Method | 권한 | 동작 |
|---|---|---|---|
| `/api/admin/users` | GET | requireAdmin | 사용자 목록 (책 개수 포함) |
| `/api/admin/users` | POST | requireAdmin | `{username, displayName?}` → bcrypt(DEFAULT_USER_PASSWORD), `mcp=1` |
| `/api/admin/users/[id]/reset-password` | POST | requireAdmin | passwordHash 초기화, `mcp=1` |
| `/api/admin/users/[id]` | DELETE | requireAdmin | 사용자 삭제 (CASCADE로 본인 책 모두 삭제). **본인 삭제 금지(400)** |

**admin도 다른 사용자의 책 자체는 못 본다** — `/api/books`는 admin이어도 `WHERE authorUserId = me.id` 로 본인 것만. admin 권한은 *사용자 관리*에만 한정.

### 5.5 zod 스키마 (`src/lib/validations.ts` 확장)

- `LoginSchema`: `{ username: 2~20자, password: min 8 }`
- `ChangePasswordSchema`: `{ currentPassword, newPassword: min 8, newPasswordConfirm }` + `.refine(d => d.newPassword === d.newPasswordConfirm, "비밀번호가 일치하지 않습니다")`
- `CreateUserSchema`: `{ username: 2~20자/금지문자, displayName?: 1~30자 }`
- `UpdateProfileSchema`: `{ displayName: 1~30자 }`
- `CreateWritingSchema`: `{ title: 1~200자, body: max 50000자, tags: string[] default [] (책과 동일 normalize) }`
- `UpdateWritingSchema`: 위 필드 모두 `optional()` (책 패턴과 동일)

### 5.6 비밀번호 변경의 세션 재발급

성공 시 새 JWT(`mcp=0`) 발급 후 쿠키 재셋팅 → 사용자가 즉시 다른 페이지 진입 가능.

## 6. UI

### 6.1 페이지

| Path | 권한 | 내용 |
|---|---|---|
| `/` | public | **비로그인**: 안내 페이지 (사이트 제목 "누구의 서재" + 짧은 소개 + 로그인 CTA).<br>**로그인**: 본인 책 그리드 (현재 홈 UI 유지) |
| `/login` | public | `{username, password}` 입력. 성공+`mcp=1` → `/settings/password`. 성공+`mcp=0` → 이전 URL 또는 `/` |
| `/books` | requireUser (middleware) | 본인 책 그리드 + 필터/검색 (현재 UI 유지, scoping만 추가) |
| `/books/[slug]` | requireOwnBook | 본인 책 상세. 다른 사람 책이면 404 |
| `/writings` | requireUser (middleware) | 본인 글 목록 — 카드 그리드 (제목 + 본문 첫 1~2줄 미리보기 + 작성일 + 태그). 필터/검색은 *초기 스코프에서 없음* (R12, 글 본문 검색 OOS) |
| `/writings/[slug]` | requireOwnWriting | 본인 글 상세 — `MarkdownViewer` 재사용. 헤더에 수정/삭제 버튼 |
| `/admin/new-book` | requireUser (middleware) | 책 생성 폼 (기존 `/admin/new` 이름 변경) |
| `/admin/edit-book/[id]` | requireOwnBook | 기존 `/admin/edit/[id]` 이름 변경 |
| `/admin/new-writing` | requireUser (middleware) | 글 생성 폼 (제목 + 본문 + 태그) |
| `/admin/edit-writing/[id]` | requireOwnWriting | 글 수정 폼 |
| `/admin/users` | requireAdmin | 사용자 목록 + 신규 생성 모달 + 비번 reset + 삭제 |
| `/settings/password` | requireUser | 현재/새/새 확인 3필드. 클라이언트 일치 검사 + submit disable |
| `/settings/profile` | requireUser | displayName 변경 |

폐기되는 페이지:

- `/users/[username]` — 다른 사람 서재 열람이 없으므로 불필요
- `/me` — `/`가 곧 본인 서재이므로 alias 불필요

### 6.2 컴포넌트

| Component | 변경 |
|---|---|
| 헤더 (`layout.tsx`) | 사이트 제목 동적:<br>· 비로그인 → "누구의 서재"<br>· 로그인 → "{displayName}의 서재" (서버 컴포넌트에서 `getCurrentUser()` 호출)<br><br>중앙/우측 메뉴 영역:<br>· 비로그인: "로그인" 링크<br>· 로그인: `📚 책장(/books)`, `✏️ 글방(/writings)`, `[displayName ▼]` 드롭다운 → 프로필 변경 / 비번 변경 / [admin] 사용자 관리 / 로그아웃 |
| `BookCard` | 변경 **없음** — 본인 책만 보이므로 작성자 표시 불필요 |
| `BookForm` | 변경 없음 (authorUserId는 서버에서 자동 주입) |
| `Filters`, `SearchBox` | 변경 없음 (책 페이지 전용 유지) |
| `WritingCard` (신규) | 글 카드 — 제목 + 본문 첫 1~2줄(plain text 추출, 80자 cut) + 작성일 + 태그 칩. 클릭 시 `/writings/[slug]` |
| `WritingForm` (신규) | 제목 input + `MarkdownEditor`(기존 재사용) + `TagInput`(기존 재사용) + 저장/삭제 버튼. 책 BookForm보다 단순 (장르/별점/이자/날짜 필드 없음) |
| `MarkdownEditor`, `MarkdownViewer`, `TagInput` | 변경 없음 — 책/글 양쪽 재사용 |
| `PasswordChangeForm` (신규) | client + server 둘 다 일치 검사 |
| `UserAdminTable` (신규) | 기존 `ConfirmDialog` (radix) 패턴 재사용 |
| `EmptyState` | `/writings` 빈 상태에 재사용 — "아직 쓴 글이 없어요" + "첫 글 쓰기" CTA → `/admin/new-writing` |

### 6.3 reset 비밀번호 UX

admin이 "비밀번호 재설정" → confirm dialog → 실행 → toast: *"초기화되었습니다. 사용자에게 기본 비밀번호로 로그인하라고 안내하세요."* (비번 값 화면 노출 없음 — admin이 환경변수로 알고 별도 채널로 전달)

### 6.4 mustChangePassword 흐름

- middleware가 `/settings/password` 외 보호된 경로 진입 차단
- 페이지 상단 안내: *"기본 비밀번호를 사용 중입니다. 변경 후 다른 기능을 이용할 수 있어요."*
- 변경 완료 → toast → `/`

### 6.5 사이트 제목 표시의 디테일

- 페이지 `<title>` (head): 비로그인 = "누구의 서재", 로그인 = "{displayName}의 서재"
- 책 상세 페이지 `<title>`: "{책 제목} | {displayName}의 서재"
- 글 상세 페이지 `<title>`: "{글 제목} | {displayName}의 서재"
- OG metadata: 비로그인 진입(=`/`만 가능)에서 "누구의 서재" 그대로. 책/글 상세는 보호된 경로라 OG 노출 안 됨 — `generateMetadata`는 그대로 두되 SEO 의미는 없음

## 7. 마이그레이션 & 시드

### 7.1 Drizzle 마이그레이션 (`drizzle/0001_multiuser.sql`)

```sql
-- 1) users 신설
CREATE TABLE users (
  id, username, display_name, password_hash,
  role DEFAULT 'member', must_change_password DEFAULT 1, created_at
);
CREATE UNIQUE INDEX idx_users_username ON users(username);

-- 2) books 변경 — 3단계 (책 데이터 존재)

-- 2a) NULLABLE FK로 컬럼 추가 + composite UNIQUE만 먼저
ALTER TABLE books DROP INDEX (slug);   -- 기존 slug 단독 UNIQUE 제거
ALTER TABLE books ADD COLUMN author_user_id INTEGER NULL
  REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_books_author_user ON books(author_user_id);
CREATE UNIQUE INDEX idx_books_user_slug ON books(author_user_id, slug);

-- 2b) 별도 SQL/스크립트로 backfill (sayhee 시드 *후* 실행)
-- UPDATE books SET author_user_id = (SELECT id FROM users WHERE username = 'sayhee') WHERE author_user_id IS NULL;

-- 2c) schema.ts에서 NOT NULL로 변경 후 두 번째 drizzle-kit push
-- drizzle-kit이 SQLite의 ALTER 제약을 우회해 table-rename + INSERT SELECT 절차로 NOT NULL 재적용

-- 3) writings 신설
CREATE TABLE writings (
  id, author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title, body DEFAULT '', slug, created_at, updated_at
);
CREATE INDEX idx_writings_author_user ON writings(author_user_id);
CREATE INDEX idx_writings_created_at ON writings(created_at);
CREATE UNIQUE INDEX idx_writings_user_slug ON writings(author_user_id, slug);

-- 4) writing_tags 신설
CREATE TABLE writing_tags (
  writing_id INTEGER NOT NULL REFERENCES writings(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (writing_id, tag_id)
);
CREATE INDEX idx_writing_tags_tag ON writing_tags(tag_id);
```

> SQLite는 ALTER로 컬럼 추가 + FK는 즉시 동작하지만, 기존 `slug` UNIQUE 제약 제거는 드리즐 마이그레이션 파일의 정확한 SQL로 별도 처리(SQLite의 인덱스 DROP).

### 7.2 적용 순서 (기존 책 데이터 backfill 포함)

1. `SELECT COUNT(*) FROM books;` → 결과 기록 (예: N권)
2. `pnpm drizzle-kit generate` → `pnpm drizzle-kit push`
   - users 신설 + writings/writingTags 신설 + books에 NULLABLE `author_user_id` + composite UNIQUE 추가
3. `pnpm run seed:admin` — `hammer_turtle` admin user INSERT (평문 비번을 환경변수로 받아 bcrypt)
4. `pnpm run migrate:existing-books` — `sayhee` member user INSERT (해시 직접 주입) + 모든 책의 `author_user_id`를 `sayhee.id`로 UPDATE. 멱등 (이미 sayhee가 있거나 모든 책이 backfill 되어있으면 no-op).
5. schema.ts에서 `author_user_id`를 NOT NULL로 변경 → `pnpm drizzle-kit generate` → `pnpm drizzle-kit push`
   - drizzle-kit이 table-rename 절차로 NOT NULL 제약 적용

### 7.3 시드 / 마이그레이션 스크립트 (신규 2개)

#### `scripts/seed-admin.ts`

```ts
// 읽음: INITIAL_ADMIN_USERNAME (예: hammer_turtle), INITIAL_ADMIN_PASSWORD (평문)
// 멱등성: 같은 username의 사용자가 이미 있으면 no-op
// INSERT: role='admin', mustChangePassword=0
```

#### `scripts/migrate-existing-books.ts`

```ts
// 읽음: LEGACY_OWNER_USERNAME (예: sayhee), LEGACY_OWNER_PASSWORD_HASH ($2a$12$... 해시 직접 주입)
// 1) LEGACY_OWNER_USERNAME 사용자가 없으면 INSERT
//    - role='member', mustChangePassword=0
//    - passwordHash = LEGACY_OWNER_PASSWORD_HASH (해시 그대로 저장, bcrypt 재실행 X)
// 2) UPDATE books SET author_user_id = <legacy.id> WHERE author_user_id IS NULL
// 3) 영향받은 책 수를 로그로 출력
// 멱등성: 두 번 실행해도 no-op (행 0개 영향)
```

`package.json`:
```json
"seed:admin": "tsx scripts/seed-admin.ts",
"migrate:existing-books": "tsx scripts/migrate-existing-books.ts"
```

### 7.4 환경변수

| 변수 | Before | After |
|---|---|---|
| `AUTH_SECRET` | ✓ | ✓ |
| `ADMIN_PASSWORD_HASH` | ✓ | **제거** (DB로 이전) |
| `INITIAL_ADMIN_USERNAME` | - | ✓ (seed:admin — 예: `hammer_turtle`) |
| `INITIAL_ADMIN_PASSWORD` | - | ✓ (seed:admin, 평문 → 스크립트가 bcrypt) |
| `LEGACY_OWNER_USERNAME` | - | ✓ (migrate:existing-books — 예: `sayhee`) |
| `LEGACY_OWNER_PASSWORD_HASH` | - | ✓ (migrate:existing-books, bcrypt 해시 직접 주입. `\$` escape 주의) |
| `DEFAULT_USER_PASSWORD` | - | ✓ (신규 멤버/reset 초기 비번) |

`.env.example` 업데이트.

### 7.5 Vercel + Turso prod 배포

```
1. Vercel 환경변수 추가/수정 (위 표 — 6개 신규/변경)
2. 로컬에서 prod 자격증명으로 (TURSO_URL + TURSO_TOKEN을 prod로 임시 셋팅):
     pnpm drizzle-kit push                  (1차: users + writings + books NULLABLE FK)
     pnpm run seed:admin                    (hammer_turtle admin 생성)
     pnpm run migrate:existing-books        (sayhee member 생성 + 기존 책 backfill)
     # schema.ts 에서 author_user_id를 NOT NULL로 토글한 커밋이 main에 들어있어야 함
     pnpm drizzle-kit generate              (NOT NULL 변경분의 마이그레이션 파일)
     pnpm drizzle-kit push                  (2차: NOT NULL 재적용 — table-rename)
3. git push main → Vercel auto-deploy
4. 동작 확인:
   - sayhee로 로그인 → 헤더 "sayhee의 서재" → 본인의 기존 책들 보임
   - 로그아웃 → hammer_turtle로 로그인 → 헤더 "hammer_turtle의 서재" → 빈 서재(본인 책 없음)
   - hammer_turtle → /admin/users → sayhee + 본인이 보임. sayhee의 책 개수가 N으로 정확.
```

### 7.6 Rollback

기존 책 데이터를 보존해야 하므로 *부분 rollback* 위주.

- **코드**: Vercel 이전 deploy로 promote (즉시 옛 환경변수 ADMIN_PASSWORD_HASH 흐름 복원, 단 그 env가 Vercel에 남아있어야 함 — 배포 전 백업 필수)
- **DB rollback (필요 시)**:
  - 신규 사용자가 추가한 *그 사용자의* 책 데이터는 손실 가능 (sayhee 외 사용자가 만든 책)
  - books.author_user_id DROP → 모든 책이 다시 "주인 없는" 상태로 복구. 단, drizzle-kit이 자동 table-rename 한 결과를 되돌리는 SQL은 수동으로 작성 필요
  - users / writings / writingTags DROP → 멀티유저 기능만 제거
- **안전한 사전 준비**: 배포 직전 `turso db dump` 또는 sqlite `.backup`으로 prod DB 스냅샷

## 8. 테스트

### 8.1 Unit (vitest)

| 대상 | 케이스 |
|---|---|
| `authenticate` | 정상 / 잘못된 비번 / 미존재 username (timing ≈ 1초 일정) |
| `signSession` + `getSessionUser` | 라운드트립 / 만료 / 위조 / 변조된 mcp |
| `getCurrentUser` | 정상 / 미로그인 / 존재하지 않는 sub |
| validation 스키마들 | 길이 / 금지 문자 / confirm 불일치 |
| `username-normalize` | NFC + lowercase / 한영 혼합 / 중복 판정 |
| 권한 헬퍼 | `requireOwnBook`이 타인 책에 대해 404 반환 검증 |

### 8.2 Integration (vitest, 로컬 sqlite) — 데이터 격리 매트릭스

```
GET /api/books:
  · 비로그인 → 401
  · 로그인 A → A의 책만 반환
  · 로그인 B → B의 책만 반환 (A의 책 보이지 않음)

GET /api/books/[id]:
  · 비로그인 → 401
  · 로그인 A, A의 책 id → 200
  · 로그인 B, A의 책 id → 404 (403 아님)
  · 로그인 admin, 타인 책 id → 404 (admin도 못 봄)

POST /api/books:
  · 비로그인 → 401
  · 로그인 A → 201, 응답의 authorUserId === A.id
  · 두 사용자가 같은 slug → 둘 다 성공 (composite UNIQUE)

DELETE /api/admin/users/[id]:
  · 비로그인 → 401
  · member → 403
  · admin + 타인 → 200, 그 사용자의 책 모두 삭제됨 (CASCADE)
  · admin + 본인 → 400

POST /api/users/me/password:
  · 비로그인 → 401
  · current 틀림 → 400
  · confirm 불일치 → 400
  · 정상 → 200, mcp=0, 새 쿠키

GET /api/writings:
  · 비로그인 → 401
  · A 로그인 → A의 글만 (B의 글 보이지 않음)

GET /api/writings/[id]:
  · A의 글 id, A 로그인 → 200
  · A의 글 id, B 로그인 → 404 (admin도 동일)

POST /api/writings:
  · 두 사용자가 같은 slug → 둘 다 성공 (composite UNIQUE)
  · authorUserId 응답 검증

PATCH/DELETE /api/writings/[id]:
  · 타인 글 → 404
```

### 8.3 E2E (playwright) 시나리오

| # | 시나리오 |
|---|---|
| 기존 | admin 로그인 → 책 CRUD + 삭제 modal (login 폼에 username 필드 추가) |
| 신규 1 | **비로그인 안내 페이지** — `/` 진입 시 "누구의 서재" 헤더 + 로그인 CTA. `/books` 등 진입 시 `/login`으로 redirect |
| 신규 2 | **신규 사용자 온보딩** — admin이 멤버 생성 → 멤버 기본 비번 로그인 → 강제 redirect → confirm 불일치 에러 → 일치 시 변경 성공 → 헤더에 "{본인 displayName}의 서재" 확인 |
| 신규 3 | **데이터 격리** — A로 책 생성 → 로그아웃 → B 로그인 → B의 홈에 A의 책 없음 → B가 A의 책 slug로 URL 직접 진입 → 404 → B가 같은 책 제목/slug로 생성 시도 → 성공 |
| 신규 4 | **사이트 제목 동적** — 비로그인 / → "누구의 서재" / 로그인 후 → "{displayName}의 서재" / displayName 변경 → 헤더 즉시 반영 |
| 신규 5 | **비번 reset & 사용자 삭제** — admin이 멤버 reset → 멤버가 기본 비번 재로그인 → 강제 변경 페이지 진입 / admin이 사용자 삭제 → 그 사용자의 책+글 모두 사라짐 (직접 SQL 확인 또는 admin이 그 username으로 다시 만들었을 때 책/글 빈 상태) |
| 신규 6 | **글방 CRUD + 격리** — A 로그인 → `/admin/new-writing` → 글 작성 → `/writings`에 표시 → `/writings/[slug]` 상세 → 수정 → 삭제 modal → 삭제. B 로그인 시 A의 글 URL 직접 진입 시 404. 같은 slug로 B도 글 작성 가능. |
| 신규 7 | **태그 공유** — A가 책에 `#철학` 태그 → A가 글 작성 시 `#철` 입력하면 `#철학` 자동완성 노출. B가 같은 태그명 입력 시 — 본인 풀에 자동완성 후보로 안 나옴 (B는 그 태그 안 씀) |

### 8.4 통과 기준

- 모든 unit/integration 통과
- E2E 8 시나리오 통과 (기존 1 + 신규 7)
- `pnpm build` 성공, `pnpm lint` 무에러
- prod에서 시드 admin 로그인 1회 smoke test (사이트 제목 동적 변환 + 본인 책/글만 보이는지)

### 8.5 인프라

- `tests/setup-db.ts` (신규): 각 통합 테스트 전후 sqlite truncate + admin seed
- `tests/factories.ts` (신규): `createUser({role})`, `createBook({authorUserId})`, `createWriting({authorUserId})` 헬퍼

## 9. 의도적으로 제외 (Out of Scope)

- 댓글 / 답글 / 좋아요 / 별점 공유
- 다른 사용자 서재 열람 (admin 포함)
- 사용자 팔로우 / 친구 / 추천
- 이메일 기반 비번 재설정
- 공개 회원가입 / 이메일 verification
- username 변경
- 책 공동 저자
- 사용자 아바타 / 자기소개
- moderation / 신고 / 차단 (다른 사람 콘텐츠 노출이 없으므로 불필요)
- audit log
- 글 종류 구분(시/에세이/일기 등) — 자유 형식, 컬럼 없음
- 글 본문 검색 (책 본문 검색은 유지)
- 책+글 통합 피드 / 통합 검색 — 별도 메뉴 / 별도 페이지로 분리
- 글에 별점/장르/이자/작성일(readDate) 같은 책 전용 필드

## 10. 알려진 위험 & 결정 근거

| 위험 | 완화 |
|---|---|
| 기본 비번이 모든 신규 계정에 같음 | `mustChangePassword=1` 미들웨어 강제. 기본 비번 그대로 다른 페이지 진입 불가 |
| `ADMIN_PASSWORD_HASH` 제거로 기존 admin 잠금 | seed 스크립트가 `INITIAL_ADMIN_USERNAME/PASSWORD`로 admin 1명 보장. 배포 절차에 포함 |
| admin 본인 삭제 시 lockout | DELETE 라우트에서 본인 id 검사 시 400 |
| 한글 username의 중복 등록 (NFC 미정규화) | `username-normalize`로 저장/조회 시점 둘 다 NFC + lowercase |
| username enumeration | 로그인 실패 메시지 통합 |
| 타인 책 존재 enumeration | `requireOwnBook`이 403 대신 **404** 반환 — 책의 존재 자체 노출 X |
| slug 충돌로 두 번째 사용자가 책 생성 실패 | `(authorUserId, slug)` composite UNIQUE — 다른 사용자가 같은 slug 등록 OK |
| 사용자 삭제 시 책 고아 데이터 | `books.authorUserId`에 `ON DELETE CASCADE` |
| displayName 변경 후 헤더 갱신 안 됨 | JWT에 displayName 안 넣고 매 요청 시 `getCurrentUser`로 조회 — 변경 즉시 반영 |
| Turso cold start로 매 요청 DB 조회 부담 | 기존 Spinner UI + Next.js 캐싱. 라이트 워크로드 + 서비스 성격(친한 사람들끼리)상 허용 가능 |
| 책/글 합쳐서 본인 데이터가 많아질 때 단일 사용자 삭제 시 CASCADE 부담 | `users.id` FK가 books / writings / bookTags(간접) / writingTags(간접) 모두에 걸려 있어 한 트랜잭션으로 처리. 라이트 워크로드라 허용 가능 |
| 태그 풀이 글로벌이라 다른 사용자의 태그 이름이 자동완성에 노출될 우려 | `/api/tags/suggest`가 `bookTags`+`writingTags`를 `authorUserId = me.id`로 JOIN scoping → 본인이 한 번이라도 쓴 태그만 반환 |
| 기존 책 backfill 중 NULL 잔존 → 2차 NOT NULL push가 실패 | `migrate:existing-books` 끝나면 `SELECT COUNT(*) FROM books WHERE author_user_id IS NULL` 결과가 0인지 검증. 0이 아니면 NOT NULL push 중단하고 원인 파악 |
| 해시 환경변수에 `$` 잘림 (dotenv-expand가 `$2a`, `$12`를 변수 참조로 해석) | `.env.local`에 hash 적을 때 모든 `$`를 `\$`로 escape. CI/Vercel 환경변수에는 그대로 OK (dotenv 안 거침) |
| Vercel에 옛 `ADMIN_PASSWORD_HASH`가 남아 있어 코드 rollback 시 어떻게 동작할지 불확실 | 배포 전 그 env를 *복사해서 백업*만 하고 제거. rollback 필요해질 때 복원 |

## 11. 다음 단계

이 spec이 승인되면 `writing-plans` 스킬로 phase 단위 구현 계획을 작성한다. 예상 phase:

1. **DB & auth 코어** — users 테이블 + auth.ts 개편 + middleware + seed 스크립트
2. **책 scoping** — 모든 책 라우트에 `authorUserId` 주입/검사, slug 인덱스 변경
3. **UI 동적 제목 + 비로그인 안내** — 헤더 컴포넌트, `/` 페이지의 두 가지 렌더
4. **비번 변경 + 프로필** — `/settings/*` 페이지, 라우트, 폼 일치 검사
5. **admin 사용자 관리** — `/admin/users` + 4개 API 라우트
6. **글방(writings)** — writings/writingTags 스키마, API 5개, UI 페이지 4개, 컴포넌트 2개
7. **테스트** — unit + integration + E2E 시나리오 8개
8. **마이그레이션 & 배포** — prod schema push + admin seed + smoke test
