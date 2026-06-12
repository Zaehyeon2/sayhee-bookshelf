# 미디어 도메인 제네릭 추출 설계

2026-06-12 · 리팩토링 백로그 1번 (books/movies/games 3중 복제 제거)
브레인스토밍 확정 사항: 1번만 단독 선행, 서버+UI 전 레이어, 설정 객체 + 런타임 팩토리 방식(A안).

## 목표

- books/movies/games 도메인당 ~1,500줄 동형 복제를 단일 도메인 설정 객체 + 제네릭 팩토리로 추출.
- 4번째 도메인 추가 비용을 "config 1개 + 얇은 라우트/페이지 셸"로 축소.
- **동작 변화 0** — 기존 단위·통합·e2e 테스트가 그대로 회귀 가드. URL·API 응답 shape·캐시 태그 전부 불변.

## 비목표

- writings는 미디어 팩토리 대상이 아님 (rating/genre/외부 ID 없음 — 구조 비동형).
  단, tags·auth 제네릭 헬퍼는 writings도 공유한다.
- DB 스키마 변경 없음. 컬럼명 통일을 위한 마이그레이션 금지.
- 백로그 6(홈 통계 통합)·7(per-entity 캐시 태그)·9(dead endpoint)·12(AbortSignal)·13(e2e warm-up)은 범위 밖 — 후속 처리.

## 아키텍처

```
src/lib/domains/
├ config.ts      MEDIA_DOMAINS = { books, movies, games }
├ queries.ts     createMediaQueries(cfg)   — 도메인당 18개 쿼리 함수 제네릭화
├ tags.ts        attachTags/attachTagsBatch/replaceTagsTx 제네릭 (writings 포함)
├ auth.ts        requireOwnEntity 팩토리 — HttpError(API)/notFound(page) 변형
├ schemas.ts     createMediaSchemas(cfg)   — Create/Update/List/검색 zod
└ api.ts         createMediaRouteHandlers(cfg) — GET/POST · [id] · by-external
```

### DomainConfig 내용

도메인 키, drizzle 테이블 ref, 태그 junction 테이블 + fk 컬럼 ref,
정규화 컬럼 맵(`cols: { person, date, externalId, ... }` — **구체 컬럼 ref**),
genre enum, UI 레이블(책/영화/게임, 저자/감독/개발사, 읽은 날/본 날/플레이한 날 등),
외부 소스 메타(naver/tmdb/rawg, externalId 타입 string|number),
캐시 태그 문자열(현행 값 그대로), slug 유니크 인덱스 이름(에러 시그니처 매칭용),
라우트 base path.

### 하위 호환 전략 (핵심)

기존 파일은 전부 **얇은 wrapper로 보존**:

```ts
// src/lib/db/queries/books.ts
const q = createMediaQueries(MEDIA_DOMAINS.books)
export const createBook = q.create
export const listBooks = q.list
// ...
```

`auth-helpers.ts`·`validations.ts`·API route 파일들 동일 패턴.
호출부·테스트·import 경로 전부 무변경. 도메인별 결과 타입(`BookWithTags` 등)은
wrapper에서 정규화 shape(`person`/`date`/`externalId`)을 도메인 필드명(author 등)으로
재매핑해 유지.

### Drizzle 타입 전략

drizzle builder는 동적 `SQLiteTable`에서 타입 추론이 붕괴함(CLAUDE.md 명문화,
contentDashboard에서 기경험). 대응:

- config에 테이블이 아닌 **구체 컬럼 ref**를 담아 조건절(`eq(cfg.cols.person, ...)`)의
  타입을 유지.
- select는 컬럼 맵 객체(`db.select({ person: cfg.cols.person, ... })`)로 정규화 shape 반환.
- 추론이 무너지는 지점은 명시 결과 인터페이스(`MediaRecord` 등)로 고정 — any 전파 금지.
- LIKE 검색은 현행대로 raw sql + `ESCAPE '\'` 유지 (invariant 4). 검색 WHERE 절은
  fragment 헬퍼로 공유 (백로그 10 흡수).

### 캐시 키 불변 invariant

`revalidateTag` 문자열·`unstable_cache` 키·`cache()` 인스턴스는 현행 값 그대로
config에 박는다. 키가 바뀌면 stale 캐시 노출 — 각 단계에서 grep으로 기존 키와
대조 검증. `cache()`/`unstable_cache` 래핑 함수는 팩토리 안에서 도메인별 인스턴스로
생성하되 모듈 로드 시 1회 생성(요청마다 재생성 금지 — React cache 동일성).

## UI 레이어

- **MediaForm** 1개 + 도메인 필드 config (레이블·placeholder·외부 검색 어댑터 연결).
  `externalSource` 파생 useState 제거 — `externalId != null ? source : null`로 계산
  (백로그 11 흡수).
- **MediaCard** 1개 — BookCard/MovieCard/GameCard 통합 (필드 accessor는 config).
- **ExternalSearchBar** 제네릭 — externalId `string | number` 타입 파라미터.
- **페이지 4종**(list/detail/edit/stats)을 공유 컴포넌트로 추출. Next 라우트 세그먼트
  (`/books`, `/movies`, `/games`)는 유지 — 라우트 파일은 config 넘기는 5~10줄 셸.
  edit/new 페이지의 `FreshOnVisible` 래핑 유지 (Next 16 세그먼트 보존 대응).
- **StatsDashboard**: `person`/`timelineTitle` 3단 삼항 → 도메인 맵 lookup
  (백로그 3 흡수, 누락 시 타입 에러).
- **WorksDetailHeader**: `director?`/`developer?` prop 누적 → 단일
  `byline?: { label, value }` prop (백로그 4 흡수).
- **WorksSearchBar**: aria-label·placeholder 삼항 → 도메인 맵 (백로그 5 흡수).

## 백로그 흡수 매핑

| 항목 | 처리 |
|---|---|
| 2 DOMAIN_TYPES 단일 소스 | schemas.ts에서 `DOMAIN_TYPES as const` 정의, FeedQuery/WorksSearchQuery가 참조 |
| 3 StatsDashboard 맵화 | UI 단계에서 흡수 |
| 4 WorksDetailHeader byline | UI 단계에서 흡수 |
| 5 WorksSearchBar 맵 | UI 단계에서 흡수 |
| 8 list/count tag lookup 중복 | 쿼리 팩토리에서 tagId 선조회 후 양쪽 전달 |
| 10 LIKE 절 공유 | 검색 fragment 헬퍼로 흡수 |
| 11 externalSource 파생 제거 | MediaForm에서 흡수 |
| 6·7·9·12·13 | 잔존 — 본건 머지 후 별도 처리 |

## 실행 순서

feature 브랜치(`refactor/media-domain-generics`), 단계별 테스트 통과 + 독립 커밋.
실패 시 해당 단계만 롤백.

1. **config + 쿼리 팩토리** — 위험 최대라 최선두. 통합 테스트(멀티테넌트 scoping ·
   stats · public-feed · works-aggregation)가 가드.
2. **tags + auth 제네릭** — writings 포함.
3. **validations 팩토리 + DOMAIN_TYPES** — 단위 테스트 가드.
4. **API route 팩토리** — wrapper 미적용 예외(login, works/search, external lookup,
   by-external 커스텀 쿼리 shape)는 현행 유지.
5. **UI: MediaForm/MediaCard/ExternalSearchBar** — 컴포넌트 단위 테스트 가드.
6. **페이지 4종 + Stats/Works 맵화** — e2e 가드.
7. **마무리**: tsc + lint(변경 파일만 — main 기존 에러 18건 제외) + 전체 test + e2e
   + `/code-review`.

## 검증 전략

- 기존 테스트 무수정 통과가 1차 회귀 기준 — 테스트를 고쳐야 통과한다면 동작이
  바뀌었다는 신호이므로 원인 규명 우선.
- 새 테스트는 최소: config 정합성(3도메인 config가 스키마 컬럼과 일치), 제네릭
  코어의 도메인 간 격리(한 도메인 config로 다른 도메인 데이터 접근 불가) 정도.
- 멀티테넌트 invariant: 제네릭 쿼리도 전 함수 `authorUserId` 필터 필수. 공개 피드
  예외는 `isPublic = 1 AND publishedAt IS NOT NULL` 조건을 제네릭 코어에 강제.

## 위험과 완화

| 위험 | 완화 |
|---|---|
| drizzle 타입 추론 붕괴 | 구체 컬럼 ref + 명시 인터페이스 (위 전략) |
| 캐시 태그/키 변형으로 stale 노출 | config에 현행 문자열 고정 + 단계별 grep 대조 |
| cache() 인스턴스 재생성 | 팩토리 모듈 로드 시 1회 생성 |
| slug 충돌 retry 시그니처 누락 | 인덱스 이름을 config에 포함, isSlugUniqueViolation 제네릭화 시 3도메인 패턴 모두 보존 |
| UI 회귀 (폼·페이지) | e2e golden-path(책/영화) + stats-panel + public-feed + works-search |
