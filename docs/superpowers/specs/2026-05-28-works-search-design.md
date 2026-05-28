# /works — 외부 API 검색 + 사이트 한줄평·별점 묶음 디자인

작성일: 2026-05-28
상태: 디자인 승인 대기 (사용자 리뷰)

## 1. 배경·동기

기존 `/feed`는 사이트 사용자들이 최근 공개한 책·영화를 시간순으로 보여주는 timeline. 이번 기능은 다른 의도:

> "어떤 작품을 외부 API(Naver Book / TMDB)에서 검색해 그 작품에 대해 사이트 사용자들이 남긴 별점·한줄평 모음을 본다."

`feed` = timeline metaphor (push). `/works` = lookup metaphor (pull). URL·정체성 분리.

## 2. 범위

**포함**
- 외부 API 키워드 검색 (책/영화 탭 분리)
- 검색 결과 카드: 외부 메타(표지·제목·저자/감독·외부 평점) + 사이트 집계(평균 별점·기록 수) 뱃지
- 작품 상세 페이지: 외부 메타 + 사이트 별점 분포 + 한줄평 리스트(페이지네이션)

**제외 (YAGNI)**
- 외부 평점 사이트 DB 저장
- 인기순/추천 정렬
- 댓글·좋아요
- 검색어 자동완성
- 외부 API 응답 캐싱 (별도 후속 PR)

## 3. URL 구조

```
/works?type=book|movie&q=<keyword>&page=N      검색
/works/book/<isbn>?page=N                       책 상세
/works/movie/<tmdbId>?page=N                    영화 상세
```

대응 API (server component 직접 호출 외 client 인터랙션·E2E 용):

```
GET /api/external/books/lookup?isbn=<isbn>
GET /api/external/movies/lookup?tmdbId=<id>
GET /api/works/search?type=&q=&page=
GET /api/works/book/<isbn>?page=N
GET /api/works/movie/<tmdbId>?page=N
```

## 4. 데이터 흐름

### 검색 페이지

```
1. requireUser()
2. q 비어있으면 EmptyState (외부 API 호출 안 함)
3. 외부 API search (Naver/TMDB) → K개 외부 items
4. items의 isbn[] | tmdbId[] 묶음 → 1-shot 집계 쿼리
     SELECT <key>, AVG(rating) avg, COUNT(*) cnt
     FROM books|movies
     WHERE isPublic=1 AND publishedAt IS NOT NULL AND <key> IN (?)
     GROUP BY <key>
5. 외부 결과 ↔ 사이트 집계 Map merge (코드상 LEFT JOIN)
6. Card grid 렌더 + Pagination
```

### 작품 상세 페이지

```
1. requireUser()
2. Path param 검증 (IsbnParamSchema | TmdbIdParamSchema) → 실패 시 notFound()
3. 외부 lookup + DB 쿼리 3종 병렬:
   a. /api/external/<kind>/lookup → 외부 메타 1건
   b. listReviewsByExternalId(key, { limit:24, offset })
   c. countReviewsByExternalId(key)
   d. getRatingDistributionByExternalId(key) → { avg, cnt, buckets:Record<1..10,number> }
4. 헤더(외부 메타+별점) + 별점 분포 + 리뷰 리스트(publishedAt DESC) + Pagination
```

## 5. 신규 DB 쿼리 (멀티테넌트 invariant 예외)

`src/lib/db/queries/books.ts`, `movies.ts` 에 4종씩 추가. 모두 `// MULTITENANT INVARIANT EXCEPTION:` 주석 명시 — `authorUserId` 필터 의도적 부재.

```ts
type SiteAggregate = { avg: number; cnt: number }

async function getBookAggregatesByIsbns(db, isbns: string[]): Promise<Map<string, SiteAggregate>>
async function listBookReviewsByIsbn(db, isbn, opts: { limit; offset? }): Promise<BookReviewItem[]>
async function countBookReviewsByIsbn(db, isbn): Promise<number>
async function getBookRatingDistributionByIsbn(db, isbn):
  Promise<{ avg: number; cnt: number; buckets: Record<1|2|3|4|5|6|7|8|9|10, number> }>

type BookReviewItem = {
  id: number
  slug: string
  oneLineReview: string | null   // ← null 허용 (한줄평 없어도 별점만 있음)
  rating: number
  publishedAt: number
  authorUsername: string
  authorDisplayName: string
}
```

영화 동등물은 `Isbn`/`isbn: string` → `TmdbId`/`tmdbId: number` 치환.

**모든 신규 쿼리 WHERE 표준 (강제 invariant):**

```sql
isPublic = 1
  AND publishedAt IS NOT NULL
  AND <isbn|tmdbId> = ?
```

`oneLineReview IS NOT NULL` 절 **추가 금지**. 한줄평 없는 published도 별점 집계·리스트 노출 대상. 한줄평 비면 카드에서 quote 블록만 숨기고 별점 행은 유지.

**인덱스**: `(isPublic, isbn)`, `(isPublic, tmdbId)` 기존 복합 인덱스로 lookup·집계 모두 hit. 마이그레이션 없음.

## 6. Validation

```ts
// src/lib/validations.ts 추가
export const WorksSearchQuerySchema = z.object({
  type: z.enum(['book', 'movie']).default('book'),
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const IsbnParamSchema = z.string().regex(/^\d{10}(\d{3})?$/)
export const TmdbIdParamSchema = z.coerce.number().int().positive()
```

기존 `FeedQuerySchema` 패턴 일치. API route + form 양쪽 재사용.

## 7. UI 컴포넌트

```
src/components/works/
├ WorksSearchBar.tsx          controlled input → router.push(?q=&type=)  (디바운스 없음, submit-only)
├ WorksSearchCard.tsx         외부 메타 + 사이트 집계 뱃지
├ WorksDetailHeader.tsx       표지·제목·저자/감독·외부 평점·사이트 평균★
├ RatingDistribution.tsx      1~10 가로 막대 (server component, JS 페이로드 절약)
└ ReviewListItem.tsx          ★rating + (oneLineReview 있으면) 인용문 + by displayName
```

페이지 컴포넌트:
```
src/app/works/page.tsx                          (검색)
src/app/works/book/[isbn]/page.tsx              (책 상세)
src/app/works/movie/[tmdbId]/page.tsx           (영화 상세)
src/app/api/works/search/route.ts
src/app/api/works/book/[isbn]/route.ts
src/app/api/works/movie/[tmdbId]/route.ts
src/app/api/external/books/lookup/route.ts
src/app/api/external/movies/lookup/route.ts
```

기존 글로벌 nav 컴포넌트에 `/works` 메뉴 항목 추가.

## 8. 빈 상태·에러

| 상황 | 처리 |
|---|---|
| 검색어 비어있음 | EmptyState "키워드로 검색해보세요" (외부 API 호출 안 함) |
| 외부 API 0건 | EmptyState "검색 결과가 없어요" + 검색어 echo |
| 외부 API 5xx/네트워크 실패 | EmptyState "📡 외부 검색 서비스 일시 불가" |
| 상세 0 리뷰 | 헤더 정상 + 분포 영역 숨김 + 리뷰 자리 EmptyState |
| 상세 외부 lookup 실패 | 사이트 데이터 정상 노출 + 외부 메타 자리 placeholder (notFound 아님) |
| Path param 형식 오류 | `notFound()` |
| 외부 응답 ISBN 결측 | 카드 사이트 집계 0 처리, detail 링크 비활성 |
| 외부 응답 ISBN 중복 | `new Set` dedupe |
| Naver Book API 외부 평점 부재 | 카드·헤더에서 외부 평점 영역 숨김, 사이트 평균만 표시 (영화는 TMDB `vote_average` 사용) |

## 9. 보안

- **인증**: 모든 페이지·API `requireUser()` 첫 줄.
- **외부 키 보호**: 외부 호출은 server-side 전용 (기존 proxy 패턴 재사용).
- **CSRF**: 신규는 GET 전용 — 미들웨어 게이트 영향 없음.
- **Path param**: dynamic segments는 zod `safeParse` → 실패 시 `notFound()`. raw string SQL injection 표면 차단(drizzle parameterized로도 막혀 있으나 fail-fast 명시).
- **LIKE escape 불필요**: 모든 신규 쿼리 `eq()` 비교만.
- **멀티테넌트 invariant 예외 마커**: 4×2 = 8 함수 모두 주석 부착.

## 10. 테스트

**Unit (`tests/unit/`)**
- `validations.test.ts` — `WorksSearchQuerySchema`, `IsbnParamSchema`, `TmdbIdParamSchema`.

**Integration (`tests/integration/works-aggregation.test.ts`)**
- 한 ISBN/tmdbId에 user A·B·C 3명 published → cnt=3, avg 정확.
- `isPublic=0` 제외.
- `publishedAt IS NULL` 제외.
- **`oneLineReview` null인 published 포함** (← 핵심 회귀 가드).
- 평점 분포 buckets(1~10) 정확.
- Cross-user isolation 가드 — A의 private은 다른 유저 조회에 등장 X.

**Integration (`tests/integration/works-listing.test.ts`)**
- `listBookReviewsByIsbn` 페이지네이션, `publishedAt DESC`, displayName join.

**E2E (`tests/e2e/`)**
- `works-search.spec.ts` — 검색 입력 → 결과 카드 → 클릭 → 상세 → 한줄평·평점 노출.
- `works-detail-empty.spec.ts` — 0 리뷰 ISBN deep link → 외부 메타 정상, empty state.

## 11. 마이그레이션·환경

- DB 마이그레이션 없음.
- 환경 변수 추가 없음.
- README — `/works` 섹션 한 문단 추가.

## 12. 비결정·후속 분리

- **외부 API 응답 캐싱**: lookup endpoint는 고정 키 → Next.js `revalidate` 또는 in-memory LRU 후보. 별도 PR.
- **별 5개 UI 매핑**: 기존 카드 컴포넌트(`PublicReviewCard` / `PublicMovieCard`)의 별 표기 컴포넌트 그대로 재사용. 기존 패턴 fork 없음.
- **혼합 검색 (책+영화 동시)**: 외부 API가 둘로 갈라져 있어 본 스펙 범위 외. 사용자 요청 들어오면 별도 검토.
