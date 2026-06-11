# 리팩토링 백로그

games 도메인 추가(2026-06-12, feature/games-domain) 코드 리뷰에서 나온 후보들.
전부 "동작엔 문제 없음 — 유지보수·효율 개선" 버킷. 별도 브랜치에서 묶어서 처리 권장.

## 도메인 일반화 (4번째 도메인 추가 전 처리 권장)

1. **books/movies/games 3중 복제 제네릭 추출** — 게임 spec에서 의도적으로 미룬 본건.
   쿼리·폼·페이지·API가 도메인당 ~1,500줄씩 동형 복제 상태. 도메인 팩토리/설정 객체로 추출.
2. **`DOMAIN_TYPES` 단일 소스** — `validations.ts`의 `FeedQuerySchema`·`WorksSearchQuerySchema`가
   `z.enum(['book', 'movie', 'game'])`을 각각 하드코딩. `DOMAIN_TYPES as const` 하나로 통합.
3. **StatsDashboard 도메인 맵화** — `person`/`timelineTitle`이 3단 삼항 체인.
   `{ books: {...}, movies: {...}, games: {...} }` 맵 lookup으로 교체하면 도메인 추가가 O(1)
   + 누락 시 타입 에러로 잡힘 (현재는 else로 silent fallthrough).
4. **WorksDetailHeader byline 일반화** — `director?`/`developer?` prop이 도메인마다 누적되는 중.
   단일 `byline?: { label: string; value: string }` prop으로 올리고 호출 측에서 조합.
5. **WorksSearchBar 도메인 분기 통합** — aria-label과 placeholder가 각각 독립 3단 삼항.
   도메인 맵 하나로.

## 효율 (개인 규모에선 급하지 않음 — Turso 부하 증가 시)

6. **홈 통계 쿼리 통합** — `getUserStats`+`getUserMovieStats`+`getUserGameStats` = Turso 왕복 3회.
   단일 스칼라 서브쿼리로 합치면 1회. (보류 중인 user-scoped DB cache 검토와 같이 진행)
7. **works-detail-cache per-entity 태그** — `WORKS_GAME_TAG` 등이 도메인 전체 단일 태그라
   게임 하나 수정해도 전 게임 상세 캐시 flush. `works-game-${rawgId}` 식 엔티티별 태그로.
8. **list/count tag lookup 중복** — `listGames`+`countGames`가 같은 tag name→id 조회를 각각 수행
   (Promise.all로 2회 병렬). tagId 선조회 후 양쪽에 전달. books/movies 동일.
9. **`/api/works/*` 라우트 캐시 우회** — 페이지는 `get*Cached` 쓰는데 API 라우트는 쿼리 직접 호출.
   현재 이 라우트들 호출자 없음(dead endpoint 의심) — 캐시 함수 재사용 or 라우트 제거 검토.

## 소소한 정리

10. **search/countSearch LIKE 절 공유** — `searchGames`/`countSearchGames`(books/movies 동일)가
    3컬럼 LIKE WHERE를 복붙. sql fragment const로 추출해 drift 방지.
11. **폼 `externalSource` 파생 상태 제거** — `rawgId != null ? 'rawg' : null`로 계산 가능한데
    독립 useState. Book/Movie/GameForm 공통.
12. **lookup 어댑터 AbortSignal 미전달** — `lookupGameByRawgId(_opts.signal)`이 `'use cache'`
    함수(`fetchRawgGame`)에 전달 안 됨 → 라우트의 5초 AbortController 무효.
    movie-lookup도 동일. 'use cache' 제약이라 signal 전달 불가 — 타임아웃 설계 재검토 필요.
13. **e2e 콜드 컴파일 근본 대응** — login 헬퍼·골든패스 타임아웃 상향(10→30s)은 증상 완화.
    playwright `global-setup`에서 주요 라우트 warm-up 요청을 쏘면 타임아웃 원복 가능.
