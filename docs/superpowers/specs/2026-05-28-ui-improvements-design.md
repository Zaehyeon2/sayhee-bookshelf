# UI 개선 4건 설계서

**Date**: 2026-05-28
**Scope**: 모바일 nav 햄버거, `모두의 *` 카드 한줄평 강조, nav 라벨 변경, 카드 클릭 → 작품 검색

## 배경

`feat/works-search` 머지 후 다음 4개의 UX 이슈가 누적됨:

1. **모바일 nav 줄바꿈** — 헤더에 nav 링크 4개 + UserMenu + ThemeToggle 가 가로 정렬되어 모바일 폭에서 줄바꿈 발생. 사용성 저하.
2. **한줄평 식별 약함** — `PublicReviewCard`/`PublicMovieCard`에서 `oneLineReview`가 평범한 `<p>`로 렌더되어 "한줄평"이라는 신호가 약함. 별점/표지/저자에 비해 시각 위계가 낮음.
3. **nav 라벨 모호** — `책장`/`영화관`이 `모두의 서재`/`모두의 영화관`과 의미적으로 혼동됨.
4. **카드 dead-end** — `모두의 서재`/`모두의 영화관` 카드를 클릭해도 동작이 없음. 같은 작품의 다른 사람 리뷰를 보고 싶다는 자연스러운 needs를 막음.

## 비목표 (Non-goals)

- feed/홈 카드 레이아웃 전체 재설계 — 현재 카드 구조 유지, 시각 위계만 재배치
- 작품별 통합 상세 페이지 신규 구축 — 기존 `/works?q=...` 검색 진입으로 대체
- `WorksSearchCard` 변경 — 이번 작업 범위 밖

## 변경 내역

### 1. nav 라벨 변경 (`src/app/layout.tsx`)

| 현재 | 변경 후 |
|---|---|
| `📚 책장` → `/books` | `📚 내 책장` → `/books` |
| `🎬 영화관` → `/movies` | `🎬 내 영화관` → `/movies` |
| `🔍 작품 검색` → `/works` | 유지 |
| `✏️ 글방` → `/writings` | 유지 |

**이유**: `모두의 서재`/`모두의 영화관` 섹션과 의미 충돌 제거. "내"라는 소유격으로 개인 컬렉션임을 명시.

### 2. 모바일 햄버거 (`src/app/layout.tsx`)

**Breakpoint**: `md` (768px) 기준 분기.

**`md` 이상 (데스크톱)**:
- 현재 레이아웃 유지: 사이트 타이틀 + 4개 링크 + UserMenu + ThemeToggle

**`md` 미만 (모바일)**:
- 좌측: 사이트 타이틀
- 우측: `[테마토글] [☰]`
- `☰` 클릭 시 헤더 바로 아래에 풀폭 패널 펼침
- 패널 내부 (세로 정렬):
  - `📚 내 책장`
  - `🎬 내 영화관`
  - `🔍 작품 검색`
  - `✏️ 글방`
  - `─` 구분선
  - `프로필 변경`
  - `비밀번호 변경`
  - `사용자 관리` (admin only)
  - `로그아웃` (form POST)

**구현**: `<details>` disclosure 패턴 (기존 `UserMenu` 패턴 재활용 — SSR 친화, hydration 비용 0).

```tsx
<details className="md:hidden">
  <summary className="list-none cursor-pointer h-11 w-11 inline-flex items-center justify-center rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)]">
    <span aria-hidden>☰</span>
    <span className="sr-only">메뉴 열기</span>
  </summary>
  <div className="absolute left-0 right-0 top-14 bg-[var(--color-surface)] border-b border-[var(--color-border-subtle)] shadow-[var(--shadow-toss)] py-2">
    {/* nav 링크 + UserMenu 항목 세로 정렬 */}
  </div>
</details>
```

데스크톱 nav는 `<div className="hidden md:flex ...">`로 감싸 모바일에서 숨김.

**a11y**:
- `<summary>`에 `aria-label="메뉴 열기"` 또는 sr-only 텍스트
- `<details>` 기본 키보드 동작 (Enter/Space) 그대로 활용
- ESC 닫힘은 브라우저 기본 미지원이므로 우선순위 낮음 — 필요 시 다음 iteration

### 3. `모두의 *` 카드 한줄평 인용 스타일

**대상 파일**:
- `src/components/PublicReviewCard.tsx`
- `src/components/PublicMovieCard.tsx`

**영향 페이지**: `/` (홈), `/feed` (둘 다 동일 컴포넌트 사용).

**현재 구조**:
```
[별점 ─── 장르]
[<p line-clamp-3>한줄평</p>]
[표지 + 제목/저자]
[─────────────────]
[작성자, 시간]
```

**변경 후 구조**:
```
[표지 + 제목/저자]                ← 상단 식별 정보
[<blockquote> "한줄평" </blockquote>] ← 메인 콘텐츠 (큰 따옴표 + border-l)
[별점 + 장르]                    ← 하단 메타
[─────────────────]
[작성자, 시간]
```

**스타일 디테일**:
- 인용 블록: `<blockquote>` semantic
- `border-l-4 border-[var(--color-toss-blue)] pl-3 py-1 my-4`
- 본문: `text-[15px] leading-relaxed font-medium text-[var(--color-text-strong)]`
- prefix: 큰 따옴표 아이콘 (`<span aria-hidden className="text-[24px] text-[var(--color-text-weak)] leading-none mr-1">"</span>`)
- `line-clamp-3` 유지
- `oneLineReview`가 없으면 인용 블록 전체 미렌더 (현재 동작 유지)

### 4. 카드 클릭 → 작품 검색

**구현**:
- `<article>` 래퍼를 `<Link>`로 변환 (또는 카드 전체를 `<Link className="block group ...">`로 래핑)
- target: `/works?type=book&q=${encodeURIComponent(item.title)}` (영화: `type=movie`)
- 기존 `hover:shadow-[var(--shadow-toss-hover)]` 그대로 — 이미 클릭 affordance 있음
- `focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50` 추가

**제약**:
- 카드 내부에 다른 `<Link>` 없음 — 중첩 링크 문제 없음
- `<time>` 요소는 비대화형이라 무관

## 영향 범위

| 파일 | 변경 |
|---|---|
| `src/app/layout.tsx` | 라벨 2건 + 데스크톱/모바일 분기 + 햄버거 disclosure |
| `src/components/PublicReviewCard.tsx` | 카드 내부 레이아웃 재배치 + blockquote + Link 래핑 |
| `src/components/PublicMovieCard.tsx` | 동일 패턴 |
| `tests/e2e/*.spec.ts` | 회귀 가드: 모바일 viewport에서 햄버거 토글 + 카드 클릭 → /works 이동 |

다른 화면 영향:
- `/` (홈): 카드 모양 + 클릭 동작 변경 (의도된 변경)
- `/feed`: 카드 모양 + 클릭 동작 변경 (의도된 변경)
- `/works`, `/books/*`, `/movies/*`, `/writings/*`: 변경 없음 (카드 미사용 또는 다른 카드 사용)

## 테스트 전략

**단위 / 컴포넌트 테스트 (`tests/unit/`)**:
- 신규 없음 — 변경 사항이 마크업/스타일 중심

**통합 테스트 (`tests/integration/`)**:
- 신규 없음 — 데이터/쿼리 변경 없음

**E2E (`tests/e2e/`)**:
- `nav-mobile.spec.ts` 신규 또는 기존 spec에 추가:
  - 모바일 viewport (375x667) 로 navigate
  - 햄버거 버튼 보이는지 확인, 데스크톱 nav 링크 숨김 확인
  - 햄버거 클릭 → 패널 펼침 확인
  - 패널 내 `내 책장` 클릭 → `/books` 이동 확인
- `feed-card-click.spec.ts` 또는 기존 feed spec 확장:
  - `/feed?type=book` 진입 → 첫 카드 클릭 → `/works?type=book&q=<title>` 이동 확인
  - movie 동일

## Edge Cases / Open Questions

- **햄버거 외부 클릭 닫힘**: `<details>` 기본 동작은 외부 클릭 시 안 닫힘. 1차 릴리스에선 사용자가 ☰ 재클릭 또는 메뉴 항목 선택으로 닫는 것으로 충분. UX 피드백 모니터링.
- **카드 제목에 특수문자**: `encodeURIComponent`로 URL 안전 처리. 외부 검색 API는 한글/특수문자 모두 지원.
- **공개되지 않은 다른 사람 리뷰**: 카드 클릭 → `/works`는 외부 검색 결과로 가는 것이므로 다른 사람 리뷰 노출 아님 — 외부 결과 + site 집계만 보임. 별도 privacy 이슈 없음.
- **장르 정보 손실**: 검색은 제목만으로 — 같은 제목의 다른 작품(예: 동명 영화/책) 매칭 시 의도와 다른 결과 가능. 1차 릴리스에선 제목 기반으로 충분, 정밀도 이슈는 추후 ISBN/TMDB ID 직접 라우팅으로 개선 가능.

## 보안 / a11y 체크

- 카드 → Link 변환 시 `<article>` 안에 `<a>` 중첩 가능 (HTML5 valid). `<blockquote>` semantic 추가.
- 햄버거: `<summary>` 키보드 접근, sr-only 텍스트, 충분한 터치 타겟 (44x44px 이상).
- 외부 검색 URL은 `encodeURIComponent`로 안전 — XSS 없음.
- 미들웨어 변경 없음 — 인증/CSRF 영향 없음.

## 후속 작업 (이번 spec 밖)

- 작품 통합 상세 페이지 (`/works/[type]/[id]`)에서 같은 작품의 모든 공개 리뷰 모아 보기 → 카드 클릭이 검색 대신 통합 페이지로 직행
- 햄버거 외부 클릭 닫힘 + ESC 닫힘 (필요 시 `MobileMenu.tsx` 클라이언트 컴포넌트로 분리)
- 카드 long-press / context menu — 자체 별도 액션 (북마크, 공유 등)
