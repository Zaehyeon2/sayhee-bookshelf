// 외부 API(네이버/TMDB/RAWG) fetch 공통 타임아웃 단일 소스.
// 검색은 route-factory의 AbortController가, lookup은 'use cache' 함수 내부의
// AbortSignal.timeout이 같은 값을 사용한다 — 한쪽만 바꾸면 도메인별 타임아웃이 어긋남.
export const EXTERNAL_FETCH_TIMEOUT_MS = 5000
