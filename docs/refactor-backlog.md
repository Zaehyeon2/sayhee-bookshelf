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

## 게임 한국어 검색 (2026-06-12 검토 — 사용자 확정: 꼭 진행)

**문제**: RAWG는 영문 단일 표기 DB라 한국어 게임명 검색 불가 (실측: "엘든 링" 0건,
"젤다의 전설" 오매치). "엘든 링"류는 번역이 아닌 음역이라 어떤 영문 DB에도 직접 매칭 안 됨.

**실측 결과 (2026-06-12)**:
- Steam storesearch(`?term=...&l=koreana&cc=KR`, 비공식·키 불필요): KR 스토어에
  **한국어 표시명이 등록된 게임만** 매치 — ✅ "P의 거짓"·"산나비", ❌ "엘든 링"·"스타듀 밸리"
  (KR 스토어에서도 영문 표기). 커버리지 = 주로 국산 게임.
- IGDB(Twitch): `alternative_names`에 한국어 일부 존재 추정 — **미실측**. Twitch 개발자
  계정 2FA SMS rate limit으로 키 발급 보류 상태. 키 발급되면 `.env.local`에
  `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` 추가 후 "엘든 링"·"젤다의 전설" 등으로 커버리지
  실측 → RAWG 대비 가치 판정.

**IGDB 통합 메모** (전환 결정 시):
- Twitch 앱 등록의 OAuth Redirect URL은 필수 폼 필드일 뿐 — client credentials 플로우라
  실사용 안 됨. `http://localhost` 입력.
- 토큰: `POST https://id.twitch.tv/oauth2/token?client_id=..&client_secret=..&grant_type=client_credentials`,
  ~60일 만료. refresh token 없음 — 만료 시 재발급이 곧 갱신. 발급 함수에
  `'use cache: remote'` + `cacheLife('days')` 붙이면 인스턴스 횡단 캐시로 하루 1회 발급
  (cold start 재발급 문제 소거, `fetchRawgGame` 패턴 동일).

**후보 경로** (커버리지 실측 후 택1):
1. IGDB 전환 또는 RAWG+IGDB 병행 — 한국어 alternative_names 커버리지가 충분할 때.
2. Steam 브리지 보조 — 한글 쿼리 감지 → storesearch(KR) → `appdetails?l=english`로 영문명
   → RAWG 재검색 (rawgId 체계 유지). 2-hop + 비공식 API 의존, 국산 게임만 커버.
3. LLM 음역 복원 레이어 — 정확도 최고지만 검색당 LLM 호출 비용·지연. 개인 규모 과투자.
4. 최소안: 검색창 placeholder "영문 제목으로 검색 (예: Elden Ring)" 안내.
