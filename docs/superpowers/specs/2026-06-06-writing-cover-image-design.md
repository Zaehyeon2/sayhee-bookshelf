# 글방 대표 이미지(cover) 첨부 설계

- **작성일**: 2026-06-06
- **상태**: 설계 합의 완료, 구현 계획 대기
- **범위**: 글방(writings)에 글당 대표 이미지 1장. Vercel Blob 무료 티어 사용.

## 1. 배경 / 목표

글방 글에 이미지를 첨부하고 싶다. 본문에 여러 장을 inline으로 박는 것이 아니라,
책(`books.coverUrl`)·영화(`movies.coverUrl`)처럼 **글당 대표 이미지 1장**을 두고
목록 카드와 상세 페이지에 썸네일로 보여준다.

차이점: 책/영화 cover는 외부 API(TMDB·네이버)에서 받은 URL이지만, 글방 cover는
사용자가 **직접 업로드**한다. Vercel 서버리스는 파일시스템이 비영구이므로 별도
오브젝트 스토리지가 필요하다 → **Vercel Blob** (Hobby 무료 ~1GB, 가족/지인 소규모엔 수년치).

### 비목표 (YAGNI)
- 본문 inline 다중 이미지 ❌ (대표 1장으로 충분)
- 서버 측 리사이즈/압축 ❌ (5MB 제한으로 갈음)
- 책/영화 직접 업로드 ❌ (외부검색 URL 유지 — 업로드 API만 범용으로 열어둠)

## 2. 핵심 결정

| 항목 | 결정 |
|---|---|
| 스토리지 | Vercel Blob (`@vercel/blob`, `access: 'public'`) |
| 모델 | `writings.coverUrl` nullable text 컬럼 1개 |
| 업로드 시점 | **글 submit 시점** (파일 선택 시 즉시 업로드 ❌) |
| 제한 | 최대 5MB, MIME `image/jpeg|png|webp|gif`만, **서버가 최종 검증** |
| 고아 정리 | edit 교체·제거 시 + 글 삭제 시 옛 Blob `del` |
| 업로드 게이트 | `requireUser` (mustChangePassword 차단) |
| Blob 경로 | `writings/{userId}/{rand}.{ext}` (멀티테넌트 분리) |

### 업로드를 submit 시점에 하는 이유
파일 선택 즉시 업로드하면 작성 취소·이미지 교체마다 Blob에 고아가 쌓인다.
submit 시점으로 미루면 그 둘은 클라이언트 `File` 객체 state 교체일 뿐 Blob을 건드리지 않는다.

### 고아 시나리오별 결과
| 시나리오 | 결과 |
|---|---|
| 작성 취소 | 고아 없음 (업로드 자체가 안 일어남) |
| 작성 중 이미지 교체 | 고아 없음 (File state만 교체) |
| edit에서 기존 이미지 교체/제거 | `updateWriting`이 옛 Blob `del` |
| 글 삭제 | `deleteWriting`이 cover Blob `del` |
| 업로드 성공 직후 DB 저장 실패 | 고아 (드묾, 이번 범위 밖 — 허용) |

cover가 본문 inline이 아니라 **DB 컬럼 1개**라 어느 Blob이 살아있는지 정확히 추적된다.
본문 마크다운 파싱이 필요 없어 정리가 단순하다.

## 3. 데이터 흐름

```
WritingForm 대표이미지 위젯에서 파일 선택
  → File 객체 state 보관 + URL.createObjectURL 로 미리보기 (업로드 안 함)
"등록/수정" 클릭
  → (새 File 있으면) POST /api/uploads  (multipart, 파일 1개)
        ├ requireUser()                인증 게이트
        ├ MIME ∈ {jpeg,png,webp,gif}, size ≤ 5MB  검증
        └ put(`writings/{userId}/{rand}.{ext}`, file, { access:'public' })
        → { url }
  → payload.coverUrl = url (또는 제거 시 null, 변경 없으면 기존 값)
  → POST /api/writings  또는  PATCH /api/writings/{id}
        └ createWriting / updateWriting 가 writings.coverUrl 저장 (기존 트랜잭션 내)
            updateWriting: 옛 coverUrl 이 Blob host && 새 값과 다르면 del(옛 url)
조회
  → WritingCard / 글 상세: coverUrl && <Image>  (BookCard 패턴, 80×120)
글 삭제
  → deleteWriting: cover Blob host 면 del
```

## 4. 변경 목록

| 파일 | 변경 |
|---|---|
| `src/lib/db/schema.ts` | `writings.coverUrl: text('cover_url')` (nullable) 추가 |
| 마이그레이션 | `drizzle-kit generate` → `push` (dotenv prefix 필수) |
| `src/app/api/uploads/route.ts` | **신규** POST: requireUser + MIME/size 검증 + Blob put → `{url}` (고아 정리는 글 mutation이 담당하므로 DELETE 엔드포인트 없음) |
| `src/lib/validations.ts` | writing 스키마에 `coverUrl` optional(nullable url) 추가. 이미지 제약 상수(MAX_BYTES, ALLOWED_MIME) |
| `src/lib/db/queries/writings.ts` | `createWriting`/`updateWriting` 가 coverUrl 저장. `updateWriting`·`deleteWriting` 에 옛 Blob `del` 로직 |
| `src/lib/blob.ts` | **신규** 헬퍼: `isManagedBlobUrl(url)` (hostname `*.public.blob.vercel-storage.com` 판별), `deleteBlobIfManaged(url)` |
| `src/components/WritingForm.tsx` | 대표 이미지 위젯: 파일 선택 → File state + 미리보기 → 제거 버튼. submit 시 업로드 후 coverUrl payload 구성 |
| `src/components/WritingCard.tsx` | `writing.coverUrl &&` `next/image` 썸네일 (BookCard와 동일 80×120) |
| `src/app/writings/[slug]/...` 상세 | cover 표시 (책 상세 패턴 따름) |
| `next.config.*` | `images.remotePatterns` 에 `{ protocol:'https', hostname:'*.public.blob.vercel-storage.com' }` 추가 |
| `package.json` | `@vercel/blob` 의존성 추가 |
| `.env.local` / Vercel | `BLOB_READ_WRITE_TOKEN` (Vercel은 Blob 연결 시 자동 주입, 로컬은 수동) |

## 5. 멀티테넌트 / 보안 (CLAUDE.md invariant 준수)

- `/api/uploads` 첫 줄 `requireUser()` — mustChangePassword 사용자 차단. 미들웨어 CSRF(Origin==host)는 same-origin fetch라 자동 통과.
- Blob 경로 `writings/{userId}/...` — 사용자별 prefix 분리.
- 글 저장/수정/삭제는 기존 `requireOwnWriting` 경계 그대로. coverUrl은 본문과 동일 권한.
- Blob 삭제(`del`)는 `isManagedBlobUrl`로 우리 store 호스트인 것만 — 외부 URL·조작된 URL은 건드리지 않는다.
- public Blob URL이라 글이 공개되면 이미지도 노출 — 의도된 동작.

## 6. 검증

- 클라이언트: 파일 선택 시 type/size 1차 체크 (UX용 즉시 피드백).
- 서버: `/api/uploads`가 **최종 권위**. MIME(`file.type`) 화이트리스트 + byte size ≤ 5MB. 위반 시 400 + 메시지.
- zod: writing payload의 `coverUrl`은 optional + nullable + url 형식.

## 7. 에러 처리

| 상황 | 동작 |
|---|---|
| 비로그인 / mustChangePassword | `requireUser` throw → 401/403 |
| MIME·size 위반 | 400 + 토스트 |
| Blob put 실패 | 500. 클라는 글 저장 진행 안 하고 실패 토스트 |
| Blob del 실패 (정리 중) | 글 mutation은 성공 처리. del 실패는 로그만 (고아 1개 허용, 본문 저장을 막지 않음) |

## 8. 테스트

- **unit**: 업로드 검증 거부(잘못된 MIME, 초과 size), `isManagedBlobUrl` 판별, writingSchema coverUrl.
- **integration** (실제 SQLite, Blob `put`/`del` mock):
  - `/api/uploads` 인증 게이트 — 비로그인 401, mustChangePassword 403.
  - `createWriting` coverUrl 저장.
  - `updateWriting` 이미지 교체 시 옛 Blob `del` 호출.
  - `deleteWriting` cover Blob `del` 호출.
  - **cross-user 격리** 케이스 1개 (다른 사용자 글 cover 수정 불가).
- **e2e**: 선택 — 실제 Blob 토큰 필요 → 기본 skip.

## 9. 마이그레이션 / 배포 노트

- `writings.coverUrl` nullable이라 기존 글은 NULL → 카드/상세에서 `coverUrl &&` 가드로 안전.
- Vercel 대시보드에서 Blob store 생성 → 프로젝트 연결 시 `BLOB_READ_WRITE_TOKEN` 자동 주입.
- 로컬 개발은 `.env.local`에 토큰 수동 추가 (없으면 업로드 경로만 비동작, 나머지 영향 없음).
- 마이그레이션 명령은 반드시 `pnpm exec dotenv -e .env.local -- drizzle-kit ...` prefix.
