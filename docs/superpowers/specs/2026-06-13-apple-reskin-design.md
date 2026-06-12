# Apple HIG 리스킨 설계 (앱 문법)

날짜: 2026-06-13
소스: `DESIGN.md` (Apple HIG 토큰 추출본, OmD v0.1)
범위: 토큰 전면 교체 + 컴포넌트 리스킨 (전 페이지)

## 목표

현행 Toss 스타일 디자인 시스템을 Apple HIG 기반으로 교체한다.
**마케팅 문법(흑백 교차 풀블리드)이 아닌 앱 문법**(iCloud/App Store 스타일)을 따른다:
`#f5f5f7` 단일 캔버스 + 무그림자 화이트 카드(색 대비 lift) + glass 헤더 + pill CTA +
타이트 타이포 + Apple Blue 단일 액센트.

확정 사항 (브레인스토밍 합의):

- 적용 범위: 토큰 + 컴포넌트 리스킨, 전 페이지 (admin/settings 포함)
- 토큰 이름: `toss-*` → 시맨틱 이름으로 전수 rename (브랜드 종속 제거)
- 다크모드: 기존 토글/OS 연동 유지, 값만 Apple 다크 팔레트 (`#000000` 캔버스)
- 폰트: Pretendard 유지, Apple 타이포 스케일(타이트 LH·음수 트래킹)만 적용
- UI 크롬 이모지 제거 (네비 "📚 내 책장", 헤더 로고, 배지 등) — DESIGN.md voice 규칙 준수

## 1. 토큰 레이어 — `src/app/globals.css`

Tailwind v4 `@theme` 블록 + `[data-theme="dark"]` 오버라이드 + no-JS fallback
3곳 모두 동일 매핑으로 교체. 구조(테마 부트스트랩 스크립트, media query fallback)는 유지.

### 색상 매핑

| 현행 토큰 | 신규 토큰 | 라이트 | 다크 |
|---|---|---|---|
| `--color-toss-blue` | `--color-accent` | `#0071e3` | `#0071e3` |
| `--color-toss-blue-hover` | `--color-accent-hover` | `#0077ed` | `#2987f0` |
| `--color-toss-blue-light` | `--color-accent-soft` | `#e8f0fd` | `#16263d` |
| (신규) | `--color-link` | `#0066cc` | `#2997ff` |
| `--color-page-bg` | `--color-canvas` | `#f5f5f7` | `#000000` |
| `--color-surface` | `--color-surface` | `#ffffff` | `#272729` |
| `--color-surface-2` | `--color-surface-2` | `#e8e8ed` | `#2a2a2d` |
| `--color-text-strong` | (유지) | `#1d1d1f` | `#f5f5f7` |
| `--color-text` | (유지) | `#424245` | `#d2d2d7` |
| `--color-text-muted` | (유지) | `#6e6e73` | `#86868b` |
| `--color-text-weak` | (유지) | `#86868b` | `#6e6e73` |
| `--color-text-placeholder` | (유지) | `#a1a1a6` | `#58585d` |
| `--color-border` | (유지) | `#d2d2d7` | `#424245` |
| `--color-border-subtle` | (유지) | `#e8e8ed` | `#2c2c2e` |
| `--color-danger` | (유지) | `#ff3b30` | `#ff453a` |
| `--color-toss-yellow` | `--color-star` | `#ff9500` | `#ff9f0a` |
| `--color-header-bg` | (유지) | `rgba(250,250,252,0.8)` | `rgba(22,22,23,0.8)` |

`--color-link`는 본문 인라인 링크(prose a, "더 보기"류)에 사용.
버튼/포커스/액티브 액센트는 `--color-accent`. 두 토큰 용도 혼용 금지
(DESIGN.md: `#0066cc`는 link color, never a button background).

### 반경·그림자·기타

| 현행 | 신규 | 값 | 용도 |
|---|---|---|---|
| `--radius-toss-sm` | `--radius-sm` | `8px` | 버튼(비-pill)·인풋·소형 요소 |
| `--radius-toss` | `--radius-md` | `12px` | 카드·패널 |
| `--radius-toss-lg` | `--radius-lg` | `18px` | 대형 패널·다이얼로그 |
| (신규) | `--radius-pill` | `980px` | primary/secondary CTA |
| `--shadow-toss` | **삭제** | — | 정적 카드는 무그림자 (색 대비 lift) |
| `--shadow-toss-hover` | `--shadow-float` | `rgba(0,0,0,0.12) 3px 5px 30px 0px` (다크: `rgba(0,0,0,0.45)`) | 드롭다운·다이얼로그·카드 hover 전용 |

헤더 glass: `backdrop-filter: saturate(180%) blur(20px)` (현행 `backdrop-blur` 기본값 강화).

### 타이포그래피

Pretendard 유지. Apple 스케일을 em 단위로 환산 적용 (px 트래킹은 한글에 과함):

- body: `17px / 1.47 / -0.022em` (현행 prose 16px → 17px)
- 헤딩(h1–h3): weight 600(현행 700에서 완화), LH 1.1–1.2, tracking `-0.01em`
- `prose-toss` 클래스 → `prose-apple`로 rename, 위 규칙 반영. 링크 색 `--color-link`.
- 버튼 텍스트: 17px/400 (pill CTA), 14px/400 (compact)

## 2. 컴포넌트 레이어

### 2-1. 기계적 치환 (68개 파일)

`var(--color-toss-*)`, `var(--radius-toss*)`, `shadow-toss`/`shadow-toss-hover`,
`prose-toss` 참조를 신규 토큰명으로 전수 치환. sed + `pnpm lint`로 잔존 검증
(`grep -r toss src/` 결과 0이 완료 조건).

### 2-2. 패턴 변경 (수작업)

- **카드** (`MediaCard`, `PublicReviewCard`, `PublicMovieCard`, `PublicGameCard`,
  `BookCard` 계열 래퍼 등): 기본 그림자 제거. `hover:shadow-[var(--shadow-float)]` +
  기존 `active:scale-[0.99]` 유지. radius `--radius-md`.
- **버튼**: primary CTA(저장·로그인·`FormActionBar` 제출) = pill
  (`rounded-[var(--radius-pill)]`, bg `--color-accent`, 17px/400, padding 11px 21px).
  secondary = outline pill (border `--color-border`, text `--color-text-strong`).
  destructive = 현행 danger 톤 유지, pill 형태.
  compact 버튼(테이블 액션·admin) = `--radius-sm`, 14px.
- **헤더** (`layout.tsx`): 높이 h-14(56px) → h-12(48px), glass 토큰 적용.
  로고 "📚 누구의 서재" → "누구의 서재".
- **포커스 링**: 전 컴포넌트 `focus-visible:ring-2 ring-[var(--color-accent)]`
  불투명 통일 (현행 `/50` 제거).
- **인풋** (`SearchBox`, 폼 인풋, `TagInput`): bg `--color-surface-2`(#e8e8ed) 무border,
  focus 시 ring 2px accent. radius `--radius-sm`.
- **배지** (`GenreBadge`, 공개 배지): pill 배경 최소화 — 소형 텍스트 라벨 톤
  (12px/600). "🌐 공개" → "공개".
- **이모지 제거**: 네비 라벨(내 책장·내 영화관·내 게임·글방·작품 검색),
  `MobileMenu` 동일 라벨, `EmptyState`·버튼·배지 등 UI 크롬 전반.
  사용자 콘텐츠(독후감 본문 등)는 건드리지 않음.
- **별점** (`RatingStars`, `RatingScore`): 색만 `--color-star`(오렌지)로.
  ÷2 표시 관례(`rating.ts`) 무관 — 색 토큰만.

### 2-3. 서드파티 표면

- **chart.js** (stats 차트): 색상 하드코딩 여부 확인, Toss 블루 하드코딩 시
  `#0071e3` 계열 팔레트로 교체.
- **Toast UI Editor/Viewer**: 다크 테마 remount 로직 유지. 커스텀 CSS 오버라이드에
  toss 토큰 참조 있으면 신규 토큰으로.
- **sonner Toaster**: `theme="system"` 유지, richColors가 자체 팔레트라 변경 불요.

## 3. 다크모드

`[data-theme="dark"]` + `@media prefers-color-scheme` fallback 두 블록 모두
위 다크 컬럼 값으로 교체. 토글 메커니즘(`themeBootstrap` 인라인 스크립트,
`ThemeToggle`) 변경 없음. 캔버스 `#000000` / surface `#272729`는 DESIGN.md 원안 그대로.

## 4. 검증

1. `grep -r toss src/` → 0건
2. `pnpm lint` (변경 파일 — main에 기존 lint 에러 18건 있으므로 변경분만 판정)
3. `pnpm test` (vitest 전체)
4. `pnpm build`
5. e2e: `golden-path`, `stats-panel` 최소 (셀렉터가 클래스 비의존인지 확인,
   이모지 제거로 텍스트 셀렉터 `📚 내 책장` 류 깨질 수 있음 — e2e 텍스트 매칭 전수 점검)
6. 수동 시각 QA: 홈·목록·상세·폼·stats·feed·works·admin 라이트/다크

## 리스크

- **e2e 텍스트 셀렉터**: 이모지 포함 라벨 매칭 시 깨짐 — 검증 5에서 함께 수정.
- **다크 `#000000`**: OLED 대비 강함. 원안 채택, 불편 시 `#161617`로 완화 (후속 결정).
- **17px body**: 카드 밀도 미세 변화 — 시각 QA에서 판단.
- 별점 노랑→오렌지: 단일 지점(`RatingStars`) 변경이라 회귀 범위 좁음.

## 비범위 (YAGNI)

- 흑백 교차 마케팅 섹션, 56px 디스플레이 헤딩, 28px 대형 카드 (접근안 B 기각)
- SF Pro 도입, 폰트 변경
- 레이아웃/정보구조 변경 (max-w-5xl 컨테이너, 그리드 유지)
- 모션 시스템 개편 (기존 reduced-motion 처리 충분)
