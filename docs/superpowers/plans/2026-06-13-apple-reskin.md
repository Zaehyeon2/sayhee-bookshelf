# Apple HIG 리스킨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toss 스타일 디자인 토큰·컴포넌트를 Apple HIG 앱 문법(#f5f5f7 캔버스·무그림자 카드·glass 헤더·pill CTA·단일 액센트)으로 전면 교체.

**Architecture:** 3층 접근 — (1) `globals.css` 토큰 전면 재작성(시맨틱 rename + Apple 값), (2) 68개 파일 기계적 sed 치환, (3) 패턴 변경(pill 버튼·glass 헤더·이모지 제거·차트 팔레트)은 수작업. 스펙: `docs/superpowers/specs/2026-06-13-apple-reskin-design.md`.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`@theme` 토큰), Biome, Vitest, Playwright.

**스펙 대비 변경 2건 (구현 중 발견된 충돌):**
1. 토큰 이름 `--radius-sm/md/lg` → `--radius-field/card/panel` — Tailwind v4는 `@theme`의 `--radius-*`가 `rounded-sm` 등 기본 유틸 스케일을 덮어쓰므로(커버 이미지의 `rounded-sm`이 8px로 변함) 역할 기반 이름으로 회피.
2. GenreBadge pill 유지 — App Store 카테고리 칩이 회색 pill 문법. 색 토큰만 sed로 교체.

**검증 공통 사항:**
- lint는 main에 기존 에러 18건 존재 — **변경 파일의 신규 에러만** 판정 기준.
- e2e는 WSL2에서 dev 서버 선기동 재사용 + `--workers=2` 권장.

---

### Task 1: globals.css 토큰 전면 교체 + icon.tsx 색상

**Files:**
- Modify: `src/app/globals.css` (전체 교체)
- Modify: `src/app/icon.tsx:16` (`#3182F6` → `#0071e3`)

- [ ] **Step 1: globals.css를 아래 내용으로 전체 교체**

```css
@import "tailwindcss";

@theme {
  --color-accent: #0071e3;
  --color-accent-hover: #0077ed;
  --color-accent-soft: #e8f0fd;
  --color-link: #0066cc;
  --color-star: #ff9500;

  --color-canvas: #f5f5f7;
  --color-surface: #ffffff;
  --color-surface-2: #e8e8ed;

  --color-text-strong: #1d1d1f;
  --color-text: #424245;
  --color-text-muted: #6e6e73;
  --color-text-weak: #86868b;
  --color-text-placeholder: #a1a1a6;

  --color-border: #d2d2d7;
  --color-border-subtle: #e8e8ed;
  --color-danger: #ff3b30;
  --color-header-bg: rgba(250, 250, 252, 0.8);

  --radius-field: 8px;
  --radius-card: 12px;
  --radius-panel: 18px;
  --radius-pill: 980px;

  --shadow-float: 0 3px 30px rgba(0, 0, 0, 0.12);

  --font-sans:
    var(--font-pretendard), -apple-system, BlinkMacSystemFont,
    'system-ui', 'Segoe UI', Roboto, sans-serif;
}

html,
body {
  background: var(--color-canvas);
  color: var(--color-text);
  font-family: var(--font-sans);
  letter-spacing: -0.011em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.font-tabular {
  font-variant-numeric: tabular-nums;
}

/* Apple-tone prose for MarkdownViewer */
.prose-apple {
  color: var(--color-text);
  font-size: 17px;
  line-height: 1.47;
  letter-spacing: -0.022em;
}
.prose-apple h1,
.prose-apple h2,
.prose-apple h3 {
  color: var(--color-text-strong);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.15;
}
.prose-apple h1 {
  font-size: 28px;
  margin: 1.5em 0 0.6em;
}
.prose-apple h2 {
  font-size: 22px;
  margin: 1.4em 0 0.5em;
}
.prose-apple h3 {
  font-size: 19px;
  margin: 1.3em 0 0.4em;
}
.prose-apple p {
  margin: 0.8em 0;
}
.prose-apple a {
  color: var(--color-link);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.prose-apple strong {
  color: var(--color-text-strong);
  font-weight: 600;
}
.prose-apple code {
  background: var(--color-surface-2);
  border-radius: 6px;
  padding: 0.1em 0.4em;
  font-size: 0.9em;
}
.prose-apple blockquote {
  border-left: 3px solid var(--color-accent);
  padding: 0.2em 0 0.2em 1em;
  color: var(--color-text-muted);
  margin: 1em 0;
}
.prose-apple ul,
.prose-apple ol {
  padding-left: 1.4em;
  margin: 0.8em 0;
}
.prose-apple li {
  margin: 0.3em 0;
}
.prose-apple hr {
  border-color: var(--color-border);
  margin: 2em 0;
}

/*
 * Dark mode token overrides
 * Resolved theme is driven by [data-theme] on <html>, set by an inline script
 * in <head> before paint (see layout.tsx). The script reads localStorage.theme
 * and falls back to OS preference, so we never need @media here.
 */
:root[data-theme="dark"] {
  --color-canvas: #000000;
  --color-surface: #272729;
  --color-surface-2: #2a2a2d;
  --color-text-strong: #f5f5f7;
  --color-text: #d2d2d7;
  --color-text-muted: #86868b;
  --color-text-weak: #6e6e73;
  --color-text-placeholder: #58585d;
  --color-border: #424245;
  --color-border-subtle: #2c2c2e;
  --color-accent: #0071e3;
  --color-accent-hover: #2987f0;
  --color-accent-soft: #16263d;
  --color-link: #2997ff;
  --color-star: #ff9f0a;
  --color-danger: #ff453a;
  --color-header-bg: rgba(22, 22, 23, 0.8);
  --shadow-float: 0 3px 30px rgba(0, 0, 0, 0.45);
}

/* No-JS / pre-hydration fallback */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-canvas: #000000;
    --color-surface: #272729;
    --color-surface-2: #2a2a2d;
    --color-text-strong: #f5f5f7;
    --color-text: #d2d2d7;
    --color-text-muted: #86868b;
    --color-text-weak: #6e6e73;
    --color-text-placeholder: #58585d;
    --color-border: #424245;
    --color-border-subtle: #2c2c2e;
    --color-accent: #0071e3;
    --color-accent-hover: #2987f0;
    --color-accent-soft: #16263d;
    --color-link: #2997ff;
    --color-star: #ff9f0a;
    --color-danger: #ff453a;
    --color-header-bg: rgba(22, 22, 23, 0.8);
    --shadow-float: 0 3px 30px rgba(0, 0, 0, 0.45);
  }
}

/* ── Global mobile CSS ── */
html {
  -webkit-tap-highlight-color: transparent;
  text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
}

body {
  padding-bottom: env(safe-area-inset-bottom);
}

.scroll-x-touch {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.scroll-x-touch::-webkit-scrollbar {
  display: none;
}

/*
 * Honor OS-level "reduce motion" preference (vestibular disorders, motion
 * sensitivity). Animations and transitions collapse to ~instant.
 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
    transition-duration: 0.01ms;
    scroll-behavior: auto;
  }
}

/* ── Dialog (Radix) enter/exit animations ── */
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes scale-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
@keyframes scale-out {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.96);
  }
}
```

- [ ] **Step 2: icon.tsx 배경색 교체**

`src/app/icon.tsx:16`의 `background: '#3182F6'` → `background: '#0071e3'`. 📚 글리프는 파비콘 식별용이므로 유지.

- [ ] **Step 3: 빌드로 CSS 문법 검증**

Run: `pnpm build 2>&1 | tail -5`
Expected: 성공. (이 시점엔 컴포넌트가 구 토큰을 참조하므로 화면은 일시적으로 fallback 스타일 — Task 2에서 해소. var() 미정의는 CSS에서 무해.)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/icon.tsx
git commit -m "feat(design): Apple HIG 토큰 레이어 — 시맨틱 rename + 팔레트·radius·shadow·prose 교체"
```

---

### Task 2: 전역 기계 치환 (sed) — 토큰 참조·포커스 링·그림자

**Files:**
- Modify: `src/` 하위 `.tsx`/`.ts` 전체 (68개 파일), `tests/` 하위 `prose-toss` 참조 가능성

- [ ] **Step 1: 토큰 rename sed 실행 (순서 중요 — 긴 이름 먼저)**

```bash
cd /home/kjh/workspace/book-report
grep -rl 'toss\|--color-page-bg' src/ tests/ --include='*.tsx' --include='*.ts' | xargs sed -i \
  -e 's/--color-toss-blue-light/--color-accent-soft/g' \
  -e 's/--color-toss-blue-hover/--color-accent-hover/g' \
  -e 's/--color-toss-blue/--color-accent/g' \
  -e 's/--color-toss-yellow/--color-star/g' \
  -e 's/--color-page-bg/--color-canvas/g' \
  -e 's/--radius-toss-sm/--radius-field/g' \
  -e 's/--radius-toss-lg/--radius-panel/g' \
  -e 's/--radius-toss/--radius-card/g' \
  -e 's/--shadow-toss-hover/--shadow-float/g' \
  -e 's/prose-toss/prose-apple/g'
```

- [ ] **Step 2: 정적 카드 그림자 제거 (hover 변형은 Step 1에서 이미 `--shadow-float`로 rename됨)**

```bash
grep -rl 'shadow-toss' src/ --include='*.tsx' | xargs sed -i \
  -e 's/shadow-\[var(--shadow-toss)\] //g' \
  -e 's/ shadow-\[var(--shadow-toss)\]//g' \
  -e 's/shadow-\[var(--shadow-toss)\]//g'
```

- [ ] **Step 3: 포커스 링 불투명화 (Apple 문법: 불투명 2px)**

```bash
grep -rl 'accent)\]\/50\|danger)\]\/50' src/ --include='*.tsx' | xargs sed -i \
  -e 's/ring-\[var(--color-accent)\]\/50/ring-[var(--color-accent)]/g' \
  -e 's/ring-\[var(--color-danger)\]\/50/ring-[var(--color-danger)]/g'
```

- [ ] **Step 4: 드롭다운 그림자 복원 — Step 2가 플로팅 요소의 정적 그림자도 지웠으므로**

`src/components/UserMenu.tsx:57`와 `src/components/MobileMenu.tsx:53`의 드롭다운 패널 div(`absolute right-0 mt-1 ... bg-[var(--color-surface)]`)에 `shadow-[var(--shadow-float)]` 클래스 추가. 그 외 파일에서 `absolute` + `bg-[var(--color-surface)]` 패널인데 그림자 없는 곳이 있으면 동일 추가:

```bash
grep -rn 'absolute.*bg-\[var(--color-surface)\]' src/components/ --include='*.tsx'
```

- [ ] **Step 5: 잔존 검증**

Run: `grep -rn 'toss' src/ tests/ --include='*.tsx' --include='*.ts' --include='*.css'`
Expected: 0건 (`@toast-ui` import의 "toast"는 매칭 안 됨 — 패턴은 "toss").

Run: `pnpm test 2>&1 | tail -5`
Expected: 전체 PASS (스냅샷·클래스 단언 깨지면 해당 단언을 새 토큰명으로 갱신).

- [ ] **Step 6: lint + commit**

```bash
pnpm lint 2>&1 | tail -20   # 변경 파일 신규 에러만 확인 (main 기존 18건 무시)
git add -A src/ tests/
git commit -m "refactor(design): 토큰 참조 전수 치환 — 시맨틱 이름·무그림자 카드·불투명 포커스 링"
```

---

### Task 3: 헤더 glass + 48px + 네비 이모지 제거 (+ e2e nav spec 갱신)

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/MobileMenu.tsx` (메뉴 라벨 5곳)
- Test: `tests/e2e/nav-labels.spec.ts`, `tests/e2e/nav-mobile.spec.ts`

- [ ] **Step 1: e2e 기대값 먼저 갱신 (이모지 제거 후 라벨)**

`tests/e2e/nav-labels.spec.ts`와 `tests/e2e/nav-mobile.spec.ts`의 정규식에서 이모지 프리픽스 제거:

```
/📚 내 책장/ → /내 책장/
/🎬 내 영화관/ → /내 영화관/
/🎮 내 게임/ → /내 게임/
```

- [ ] **Step 2: layout.tsx 헤더 교체**

`<header>`와 `<nav>` 시작 부분 (39-46행):

```tsx
<header className="sticky top-0 z-10 bg-[var(--color-header-bg)] backdrop-blur-[20px] backdrop-saturate-[1.8] border-b border-[var(--color-border-subtle)]">
  <nav className="mx-auto max-w-5xl px-5 h-12 flex items-center justify-between">
    <Link
      href="/"
      className="text-[17px] font-semibold text-[var(--color-text-strong)] tracking-tight rounded-[var(--radius-field)] px-2 py-1 -mx-2 -my-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      누구의 서재
    </Link>
```

NavUser 내 데스크톱 링크 5개의 라벨에서 이모지 제거 (클래스는 Task 2 치환 결과 유지):
`📚 내 책장`→`내 책장`, `🎬 내 영화관`→`내 영화관`, `🎮 내 게임`→`내 게임`, `✏️ 글방`→`글방`, `🔍 작품 검색`→`작품 검색`.

- [ ] **Step 3: MobileMenu.tsx 라벨 5곳 동일 제거**

```bash
sed -i -e 's/📚 //g' -e 's/🎬 //g' -e 's/🎮 //g' -e 's/✏️ //g' -e 's/🔍 //g' src/components/MobileMenu.tsx
```

- [ ] **Step 4: e2e nav spec 실행**

Run: `pnpm e2e -- tests/e2e/nav-labels.spec.ts tests/e2e/nav-mobile.spec.ts --workers=2`
Expected: PASS (WSL2: dev 서버 선기동 재사용)

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/components/MobileMenu.tsx tests/e2e/nav-labels.spec.ts tests/e2e/nav-mobile.spec.ts
git commit -m "feat(design): glass 헤더 48px + 네비 이모지 제거"
```

---

### Task 4: pill CTA 전환 — FormActionBar·SearchBox·기타 primary 버튼

**Files:**
- Modify: `src/components/FormActionBar.tsx`
- Modify: `src/components/SearchBox.tsx`
- Modify: `grep -rln 'bg-\[var(--color-accent)\]' src/`로 찾은 나머지 primary 버튼

- [ ] **Step 1: FormActionBar 버튼 3개 교체 (47-84행의 버튼 className만)**

삭제 버튼:
```tsx
className="mr-auto h-11 px-5 rounded-[var(--radius-pill)] text-[14px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]"
```

취소 버튼 (outline pill):
```tsx
className="h-11 px-5 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-[15px] font-medium text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
```

제출 버튼 (primary pill, 17px/400 — Apple 마케팅 pill 문법):
```tsx
className="inline-flex items-center gap-2 h-11 px-[21px] rounded-[var(--radius-pill)] bg-[var(--color-accent)] text-white text-[17px] font-normal hover:bg-[var(--color-accent-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
```

- [ ] **Step 2: SearchBox — 이모지 아이콘 제거 + frosted input + compact 제출 버튼**

🔍 span 블록 전체 삭제, input/button 교체:

```tsx
<form onSubmit={submit} className="relative">
  <input
    type="search"
    value={q}
    onChange={(e) => setQ(e.target.value)}
    placeholder={placeholder}
    className="w-full h-12 pl-4 pr-24 rounded-[var(--radius-field)] bg-[var(--color-surface-2)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none transition"
  />
  <button
    type="submit"
    disabled={isPending}
    aria-busy={isPending}
    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 min-w-[64px] rounded-[var(--radius-field)] bg-[var(--color-accent)] text-white text-[14px] font-medium hover:bg-[var(--color-accent-hover)] active:scale-[0.97] transition disabled:opacity-70 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] inline-flex items-center justify-center gap-1"
  >
```
(버튼 내부 Spinner/검색 텍스트는 현행 유지.)

- [ ] **Step 3: 일반 폼 인풋 frosted 전환**

```bash
grep -rln 'border border-\[var(--color-border)\]' src/components/ src/app/ --include='*.tsx'
```

`<input>`/`<textarea>`/`<select>` 요소 한정 (카드·패널의 border는 제외): `bg-[var(--color-surface)] border border-[var(--color-border)]` → `bg-[var(--color-surface-2)]` (border 제거), `focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15` → `focus:ring-2 focus:ring-[var(--color-accent)]`. 대상 예상: BookForm/MovieForm/GameForm/MediaForm 텍스트 인풋, WritingForm, TagInput, login 폼, PasswordChangeForm, ProfileForm, Filters select.

- [ ] **Step 4: 나머지 primary 버튼 pill 전환**

```bash
grep -rln 'bg-\[var(--color-accent)\]' src/ --include='*.tsx'
```

각 파일에서 **독립 CTA 버튼**(폼 제출·로그인·새 글 등)은 `rounded-[var(--radius-field)]` → `rounded-[var(--radius-pill)]`, `font-semibold` → `font-medium`. **인풋에 부착된 compact 버튼**(SearchBox류)·**테이블/리스트 내 소형 액션**은 `--radius-field` 유지 (Apple commerce compact 문법). 판단 기준: 단독으로 떠 있으면 pill, 다른 요소에 붙어 있으면 compact.

- [ ] **Step 5: 단위 테스트 + lint**

Run: `pnpm test 2>&1 | tail -5` → PASS
Run: `pnpm lint 2>&1 | tail -10` → 변경 파일 신규 에러 0

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "feat(design): primary CTA pill 전환 + frosted 검색 인풋"
```

---

### Task 5: 잔여 UI 이모지 제거 (페이지·컴포넌트·테스트)

**Files:**
- Modify: `src/app/page.tsx`, `src/app/feed/page.tsx`, `src/app/works/page.tsx`, `src/app/works/{book,movie,game}/*/page.tsx`, `src/app/writings/page.tsx`
- Modify: `src/components/MediaCard.tsx`, `src/components/media/mediaPageConfig.tsx`, `src/components/media/MediaDetailArticle.tsx`, `src/components/External{Book,Movie,Game,Media}SearchBar.tsx`, `src/components/external/SelectedChip.tsx`, `src/components/works/WorksSearchCard.tsx`
- Test: `tests/unit/components.test.tsx`, `tests/e2e/works-search.spec.ts`

- [ ] **Step 1: 대상 라인 전수 확인**

```bash
grep -rn '📚\|🎬\|🎮\|✏️\|🔍\|🌐\|⭐\|✨\|📝\|🏆\|🎯' src/ tests/ --include='*.tsx' --include='*.ts' | grep -v 'icon.tsx'
```

- [ ] **Step 2: 일괄 제거 (icon.tsx 제외 — 파비콘 글리프는 유지)**

```bash
grep -rl '📚\|🎬\|🎮\|✏️\|🔍\|🌐' src/ tests/ --include='*.tsx' --include='*.ts' | grep -v 'icon.tsx' | xargs sed -i \
  -e 's/📚 //g' -e 's/🎬 //g' -e 's/🎮 //g' -e 's/✏️ //g' -e 's/🔍 //g' -e 's/🌐 //g' \
  -e 's/📚//g' -e 's/🎬//g' -e 's/🎮//g' -e 's/✏️//g' -e 's/🔍//g' -e 's/🌐//g'
```

후처리: Step 1 출력과 대조해 이모지가 **단독 콘텐츠**였던 곳(빈 상태 일러스트 대용, 탭 아이콘 등)은 빈 문자열이 남지 않는지 해당 파일 직접 확인. 빈 JSX 텍스트·`'' +` 잔재 발견 시 정리. `tests/e2e/works-search.spec.ts:41`의 `/📚 책/` → `/책/` 정규식이 다른 요소와 모호해지면 `{ exact: true }` 또는 testid로 좁힘.

- [ ] **Step 3: 테스트로 회귀 확인**

Run: `pnpm test 2>&1 | tail -5` → PASS (`tests/unit/components.test.tsx`의 라벨 단언은 새 라벨로 갱신)
Run: `pnpm e2e -- tests/e2e/works-search.spec.ts --workers=2` → PASS

- [ ] **Step 4: Commit**

```bash
git add -A src/ tests/
git commit -m "feat(design): UI 크롬 이모지 제거 — Apple voice 규칙 (사용자 콘텐츠 무관)"
```

---

### Task 6: 차트 팔레트 Apple 시스템 컬러로

**Files:**
- Modify: `src/components/stats/charts.tsx:17-28`

- [ ] **Step 1: PALETTE 교체**

```tsx
const PALETTE = [
  '#0071e3',
  '#ff3b30',
  '#ff9500',
  '#30b0c7',
  '#af52de',
  '#ff2d55',
  '#34c759',
  '#5e5ce6',
  '#a2845e',
  '#ffd60a',
]
```

(Apple 시스템 컬러: blue·red·orange·teal·purple·pink·green·indigo·brown·yellow — 도넛 차트 10개 슬롯 유지.)

- [ ] **Step 2: stats 단위 테스트 + commit**

Run: `pnpm test -- stats 2>&1 | tail -5` → PASS

```bash
git add src/components/stats/charts.tsx
git commit -m "feat(design): 통계 차트 팔레트 Apple 시스템 컬러"
```

---

### Task 7: 최종 검증

- [ ] **Step 1: 잔존 토큰 0 확인**

Run: `grep -rn 'toss' src/ tests/ --include='*.tsx' --include='*.ts' --include='*.css'`
Expected: 0건

- [ ] **Step 2: 전체 게이트**

```bash
pnpm lint 2>&1 | tail -20      # 변경 파일 신규 에러 0
pnpm test                       # vitest 전체 PASS
pnpm build                      # 성공
pnpm e2e -- tests/e2e/golden-path.spec.ts tests/e2e/stats-panel.spec.ts tests/e2e/public-feed.spec.ts --workers=2
```

- [ ] **Step 3: 수동 시각 QA 체크리스트 (dev 서버)**

홈·books 목록·상세(prose-apple 렌더)·new 폼(pill CTA)·stats(차트 색)·feed·works 검색·admin/users·settings — 라이트/다크 각 1회. 다크 `#000000` 캔버스 체감 과하면 후속 결정(스펙 리스크 항목).

- [ ] **Step 4: 마무리**

브랜치 정리는 superpowers:finishing-a-development-branch 스킬로. 머지 전 `/code-review` 실행 (프로젝트 관례). push는 사용자 안내 후.
