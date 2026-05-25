# 토스 스타일 리디자인 Spec

**작성일:** 2026-05-26
**목표:** 기능 변경 없이, 전체 UI를 토스(Toss) 디자인 언어로 재단장한다.
**적용 범위:** 시각/타이포/모션/레이아웃 — 컴포넌트·페이지 단위로 일관된 디자인 시스템 적용.

---

## 1. 디자인 원칙

토스 디자인의 본질은 "**신뢰감 있는 미니멀 + 큰 글씨 + 한 가지 강렬한 블루**" 다.
복잡한 그라데이션·요란한 일러스트·과한 인터랙션을 배제하고, 정렬·여백·타이포그래피로 정보 위계를 만든다.

- **하나의 블루(`#3182F6`)** 만 CTA/링크/강조에 쓴다. 나머지는 무채색.
- **카드는 흰색, 페이지는 옅은 회색(`#F2F4F6`)** — surface 계층화로 깊이를 만든다.
- **거대한 모서리 라운드(16~24px)** 와 **거의 없는 테두리** — 부드러움·친근함의 핵심.
- **굵은 한글 디스플레이 타이포(Pretendard)** — 큰 제목·큰 숫자가 신뢰감의 원천.
- **모션은 최소** — `active:scale-[0.98]` 같은 절제된 탭 피드백만. 화려한 애니메이션 없음.

---

## 2. 디자인 토큰

`globals.css` 의 `@theme` 블록(Tailwind v4 CSS-first)에 정의한다.

### 2.1 색

| 토큰 | HEX | 용도 |
|---|---|---|
| `--color-toss-blue` | `#3182F6` | Primary CTA, 링크, 강조 |
| `--color-toss-blue-hover` | `#1B64DA` | hover/active |
| `--color-toss-blue-light` | `#E8F2FF` | tag/chip 배경(선택) |
| `--color-toss-yellow` | `#FFB22B` | 별점 채움, 노란 강조 |
| `--color-page-bg` | `#F2F4F6` | 페이지 배경 |
| `--color-surface` | `#FFFFFF` | 카드/입력 표면 |
| `--color-surface-2` | `#F9FAFB` | 보조 표면(hover, suggestion) |
| `--color-text-strong` | `#191F28` | 제목·강조 본문 |
| `--color-text` | `#333D4B` | 일반 본문 |
| `--color-text-muted` | `#4E5968` | 보조 텍스트 |
| `--color-text-weak` | `#8B95A1` | 메타·캡션 |
| `--color-text-placeholder` | `#B0B8C1` | placeholder |
| `--color-border` | `#E5E8EB` | 입력 테두리·디바이더 |
| `--color-border-subtle` | `#F2F4F6` | 카드 내부 디바이더 |
| `--color-danger` | `#F04452` | 에러 |

### 2.2 타이포

- **폰트:** Pretendard (`<link>` CDN 로드, fallback: `system-ui`)
- **숫자:** `font-variant-numeric: tabular-nums` (별점·통계 표시용 유틸 `font-tabular`)
- **사이즈/웨이트 스케일** (Tailwind에 매핑):
  - `text-hero` 32px / 700 / leading-tight
  - `text-h1` 24px / 700
  - `text-h2` 20px / 600
  - `text-h3` 17px / 600
  - `text-body` 15px / 400
  - `text-caption` 13px / 400 / muted
  - `text-meta` 12px / 500 / weak

### 2.3 형태

- **radius:** `rounded-toss` = 16px (카드), `rounded-toss-lg` = 20px (큰 카드/모달), `rounded-toss-sm` = 12px (버튼/인풋), `rounded-full` (pill)
- **shadow:**
  - `shadow-toss` = `0 1px 2px rgba(0,0,0,0.04)` (정적 카드)
  - `shadow-toss-hover` = `0 6px 16px rgba(17,24,39,0.08)` (hover)
- **spacing 기준:** 8px grid (Tailwind 기본)

### 2.4 모션

- **transition default:** `200ms cubic-bezier(0.2, 0.8, 0.2, 1)`
- **tap feedback:** `active:scale-[0.98]` (버튼·카드 링크)
- **focus ring:** `focus-visible:ring-2 ring-[--color-toss-blue]/30 outline-none`

---

## 3. 컴포넌트 가이드

각 컴포넌트는 토큰만 사용 — 하드코딩된 색·반경 금지.

### 3.1 Button (인라인 className 패턴)

- **Primary**: `bg-[var(--color-toss-blue)] text-white rounded-toss-sm h-12 px-5 font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 transition`
- **Secondary**: `bg-[var(--color-surface-2)] text-[var(--color-text-strong)] rounded-toss-sm h-12 px-5 font-semibold hover:bg-[var(--color-border-subtle)]`
- **Ghost**: 텍스트만, `text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)]`

### 3.2 Card

- `bg-[var(--color-surface)] rounded-toss p-5 shadow-toss hover:shadow-toss-hover transition`
- 테두리 사용 안 함 (shadow 로 분리).

### 3.3 Input / Textarea

- `bg-[var(--color-surface)] border border-[var(--color-border)] rounded-toss-sm h-12 px-4 text-body placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition`
- date/select 도 동일한 높이·radius.

### 3.4 GenreBadge (pill)

- `inline-flex items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)] px-3 py-1 text-meta font-medium`
- 활성화 변형: `bg-[var(--color-toss-blue-light)] text-[var(--color-toss-blue)]`

### 3.5 RatingStars

- 채움: `text-[var(--color-toss-yellow)]`, 비움: `text-[var(--color-border)]`
- 사이즈: sm 16px / md 20px / lg 28px
- 편집 가능 시 `hover:scale-110 transition`

### 3.6 BookCard

- Card 베이스 + 상단행: 제목(text-h3 strong) ↔ GenreBadge
- 작가 한 줄 (text-caption muted)
- 하단 행: RatingStars(sm) ↔ 읽은 날짜(text-meta weak)
- 태그(최대 3개): 작은 회색 텍스트 `#태그`

### 3.7 TagInput

- 입력 인풋은 Input 규격 그대로.
- 선택된 태그: pill 형 `bg-[var(--color-surface-2)] rounded-full px-3 py-1 text-meta` + 닫기 ×
- suggestion 드롭다운: Card 규격, 항목 hover 시 `bg-[var(--color-surface-2)]`

### 3.8 MarkdownEditor / Viewer

- Toast UI 의 기본 스킨은 그대로 두되, **편집기 컨테이너만** Card 형태로 감싼다(`bg-white rounded-toss border border-[var(--color-border)] overflow-hidden`).
- Viewer 는 `prose` 클래스 + 토스 톤(제목 strong, 본문 text, 링크는 toss-blue) — `globals.css` 에 `.prose-toss` 정의.

---

## 4. 페이지 가이드

### 4.1 RootLayout (`src/app/layout.tsx`)

- `<head>` 에 Pretendard CDN `<link>`.
- `<body>` 클래스: `bg-[var(--color-page-bg)] text-[var(--color-text)] antialiased font-sans min-h-screen`.
- **Header**: 흰 배경, sticky, 하단 `border-b border-[var(--color-border-subtle)]`. 좌측 로고("📚 독후감", text-h3 strong), 우측 `목록` `관리` 링크.
- **Main**: `max-w-5xl mx-auto px-5 py-8`.

### 4.2 Home (`src/app/page.tsx`)

1. **Hero 섹션**: `text-hero` 큰 제목 "내가 읽은 책" + 보조 한 줄 "장르별로 모아둔 독서 기록".
2. **통계 행** (간단): 총 권수 / 올해 권수 / 평균 별점 — 카드 3개, 큰 숫자(`text-hero`, tabular-nums) + 라벨(meta).
3. **장르 그리드**: 14개 장르 카드, 각 카드는 흰 배경 라운드 + 장르명(h3) + 권수(caption). 0권 장르는 살짝 흐릿(`opacity-60`).
4. **최근 읽은 책**: 섹션 헤더 "최근 읽은 책" + 카드 그리드.

### 4.3 Books list (`src/app/books/page.tsx`)

1. **SearchBox** (Toss 스타일 큰 검색): 인풋 안에 🔍 아이콘 좌측, placeholder "제목·작가 검색".
2. **장르 chip 행**: 가로 스크롤 chip — "전체" + 14개. 현재 선택된 chip 은 toss-blue 배경.
3. **정렬 셀렉트**: 오른쪽 ghost 스타일.
4. **결과 헤더**: "전체 책" / "장르: X" / "검색 결과" + 권수(약하게).
5. **카드 그리드**.

### 4.4 Book detail (`src/app/books/[slug]/page.tsx`)

1. **메타 헤더**: GenreBadge + 읽은 날짜(meta).
2. **제목**: `text-hero` (32px, bold).
3. **작가**: `text-h2` muted.
4. **별점**: lg 사이즈.
5. **태그**: pill 행, 클릭 가능.
6. **본문**: `.prose-toss` 컨테이너 (배경 흰 카드, 패딩 32px, 라운드 16px).

### 4.5 Login (`src/app/login/page.tsx`)

- 화면 중앙 고정 카드 (`max-w-sm`), 큰 자물쇠 이모지(🔒) + "관리자 로그인" + 큰 input + 큰 primary 버튼.

### 4.6 Admin Form (`src/app/admin/new`, `src/app/admin/edit/[id]`)

- 페이지 제목 `text-hero` ("새 독후감 / 독후감 수정").
- 폼은 카드 1개로 통합 (`bg-surface rounded-toss p-6`):
  - 기본정보 (제목·작가·장르·읽은 날짜·별점·태그)
  - 본문 (Markdown editor)
- 하단: primary 버튼 + ghost 취소 링크 (오른쪽 정렬).

---

## 5. 비-목표 (Out of Scope)

- **DB 스키마·API endpoint 변경 금지** — 시각만 바꾼다.
- **새 dependency 추가 금지** — Pretendard 는 CDN `<link>`, 기존 Tailwind v4 / React 만으로 구현.
- **다크모드** — 이번 phase 에서는 light 단일.
- **신규 기능**(통계 페이지·차트 등) — 기존 홈에 통계 카드 정도만(`listBooks` 데이터 재활용, 신규 쿼리 없음).
- **Toast UI Editor 내부 스킨** — 외곽 wrapping 만 토스 톤으로 맞춤.

---

## 6. 수용 기준 (Acceptance Criteria)

- `pnpm build` 통과 (TS 0 errors).
- `pnpm test` 29개 단위 테스트 모두 그대로 통과(시각 변경이므로 회귀 없어야 함).
- `pnpm e2e` 2개 E2E 모두 그대로 통과(selector 가 시각 토큰 이름에 영향받지 않아야 함).
- 모든 페이지의 색·radius·typography 가 토큰만 사용(하드코딩 `#xxxxxx` 검색 시 토큰 정의 파일 외 0건).
- 모바일(375px)·태블릿(768px)·데스크탑(1280px) 3개 브레이크포인트에서 깨짐 없음(육안 검수).

---

## 7. 참고 — 토스 디자인 레퍼런스 키워드

- **Toss Slash 23/24 키노트**, Toss 앱 홈탭, Toss 송금 폼.
- **Pretendard 폰트** (gh: orioncactus/pretendard) — 한국어 토스류 디지털 폰트의 사실상 표준.
- **컬러 시스템**: 토스 브랜드 페이지의 `Blue 500 = #3182F6` 가 디자인 토큰의 중심.
