# PLANNER_WEEK — 식단 플래너(위클리)

> 기준 문서: 화면정의서 v1.3.0 §5 / 요구사항기준선 v1.6.3 §1-4 / API v1.2.2 §3
> 갱신일: 2026-04-17
> **H2 Stage 4 적용**: 2×2 grid → 세로 slot row 전환 완료 (branch: `feature/fe-planner-week-v2`)

---

## 레이아웃 와이어프레임

### 기본 화면 (390px)

```text
┌─────────────────────────────────────┐
│ HOMECOOK                            │  ← 공통 브랜드 헤더
├─────────────────────────────────────┤
│ [장보기] [요리하기] [남은요리]      │  ← compact secondary toolbar
├─────────────────────────────────────┤
│ 4월 14일 ~ 4월 20일  [이번주로 가기]│
│ 화 14  수 15  목 16  금 17  토 18   │  ← 요일 스트립 (스와이프로 주 이동)
├─────────────────────────────────────┤
│ [금] 4월 17일                  ...  │  ← day card header
│ 아침  김치찌개           2인분 등록  │  ← slot row
│ 점심  샐러드             1인분 장보기│
│ 간식  과일볼             1인분 요리  │
│ 저녁  된장찌개           2인분 등록  │
├─────────────────────────────────────┤
│ [토] 4월 18일                  ...  │  ← 2번째 day card (첫 화면에서 상단 노출)
│ 아침  순두부찌개         2인분 등록  │
│ 점심  ─ 비어 있음 ─               │
│ 간식  ─ 비어 있음 ─               │
│ 저녁  ─ 비어 있음 ─               │
└─────────────────────────────────────┘
```

### Empty 상태

```text
┌─────────────────────────────────────┐
│ 이번 주 4월 14일 ~ 4월 20일  식사 0건│
├─────────────────────────────────────┤
│ 아직 등록된 식사가 없어요            │
├─────────────────────────────────────┤
│ [금] 4월 17일                       │
│ 아침  ─ 비어 있음 ─               │
│ 점심  ─ 비어 있음 ─               │
│ 간식  ─ 비어 있음 ─               │
│ 저녁  ─ 비어 있음 ─               │
└─────────────────────────────────────┘
```

### Unauthorized 상태

```text
┌─────────────────────────────────────┐
│ [플래너 접근]                       │  ← shared state shell eyebrow
│ 이 화면은 로그인이 필요해요           │
│ 플래너를 사용하려면 로그인해주세요     │
│ 로그인하면 원래 주간 범위로 복귀       │
│                                     │
│          [로그인 버튼들]             │
│        [홈으로 돌아가기]             │
└─────────────────────────────────────┘
```

---

## 핵심 컴포넌트

### 0. 공통 브랜드 헤더

- `HOMECOOK` 로고는 HOME과 동일한 `AppHeader`를 사용한다.
- 로고는 `/` 링크로 동작하고, 제품 화면마다 별도 브랜드 블록을 다시 만들지 않는다.

### 상태 셸 규칙

- `unauthorized`, `loading`, fetch `error`는 shared `ContentState` shell 톤을 따른다.
- eyebrow pill + restrained headline + 설명 + CTA 구조를 유지해 HOME / RECIPE_DETAIL과 시각 위계를 맞춘다.
- 게스트 CTA가 있는 상태 셸은 하단 탭바 safe-area 위에서 읽히도록 `action-safe-bottom-panel` 여백 규칙을 공유한다.

### 1. 상단 CTA 그룹

- `[장보기] [요리하기] [남은요리]` 3개 버튼을 항상 노출한다.
- CTA는 독립 hero button 3개가 아니라 compact secondary toolbar처럼 묶여 보이게 정리한다.
- HOME 대비 상단 타이포가 갑자기 커 보이지 않도록, 화면 제목과 range title은 restrained scale을 유지한다.

### 2. Week Context Bar + Weekday Strip

- 주간 범위와 주 이동 affordance는 planner 본문 바로 위에 붙어 있어야 한다.
- 요일 스트립은 주 이동 gesture target이며, 범위 메타데이터를 중복 노출하지 않는다.

### 3. Day Card

- 모바일 기본 단위는 날짜별 `day card`다.
- 같은 날짜의 `아침 / 점심 / 간식 / 저녁` 4끼가 같은 카드 안에서 **세로 slot row**로 나열된다.
- **가로 스크롤 없음** — 세로 스크롤만 사용한다.
- 390px 첫 화면에서 스크롤 없이 2일 이상 overview가 자연스럽게 보인다.
- 320px narrow에서도 레이아웃 붕괴 없이 slot row가 안정적으로 표시된다.

### 4. Meal Slot Row

slot row 구조: `[끼니명 고정폭] [식사명 flex-1 truncate] [인분 chip] [상태 chip]`

- **끼니명**: `아침 / 점심 / 간식 / 저녁` — 생략 금지, muted color
- **식사명**: flex-1, 1행 truncate, 전체 row가 tap target
- **빈 슬롯**: `─ 비어 있음 ─` — muted, separator 스타일
- **인분 chip**: `N인분`, text-xs, secondary variant
- **상태 chip**: 상태별 색상
- **터치 타겟**: 각 slot row 최소 height 44px

| status | label | 방향 |
|--------|-------|------|
| `registered` | 등록 | neutral / muted |
| `shopping_done` | 장보기 | primary (브랜드 포인트) |
| `cook_done` | 요리 | success / green |

- `is_leftover=true` meal은 별도 시각 강조 가능하지만 구조 자체를 바꾸지는 않는다.
- 5번째 끼니(예: 야식) 추가 시 slot row 1행을 추가 — 가로 밀도 영향 없음.

### 5. Slice06 연결 규칙

- slice06은 `RECIPE_DETAIL`에서 생성한 새 Meal이 목표 날짜/끼니 슬롯에 정확히 보이게 하는 범위만 추가한다.
- planner add 때문에 page-level overflow, 새로운 full-page add flow, 컬럼 CRUD 재도입이 생기면 안 된다.

---

## 상호작용 규칙

- 세로 스크롤은 day card 목록 탐색용이다.
- 가로 스크롤 없음 — page-level / planner-level 모두 제거.
- 주 이동은 요일 스트립 스와이프를 우선한다.
- slot row 탭 (식사 있음) → `MEAL_SCREEN` 진입 (`07-meal-manage`가 닫는다).
- slot row 탭 (빈 슬롯) → 현재 interaction 유지, 후속 slice에서 결정.

---

## 접근성 / 토큰 메모

| 항목 | 값 |
|------|----|
| 페이지 배경 | `--background` |
| 카드 배경 | `--surface` |
| 카드 외부 수평 여백 | `--space-4` (16px) |
| slot row 최소 height | 44px |
| 끼니명 색상 | `--muted-foreground` |
| empty pill 색상 | `--muted-foreground` |

- 터치 타겟 최소 크기 `44×44px`.
- 작은 모바일 sentinel에서도 CTA 잘림, range bar 밀림, slot 정보 붕괴가 없어야 한다.

---

## H2 Stage 4 Authority Evidence

경로: `ui/designs/evidence/H2-planner-week-v2/`

| artifact | 파일 | 상태 |
|----------|------|------|
| before (현행 2×2 grid) | `PLANNER_WEEK-before-mobile.png` | ✅ |
| mobile default 390px | `PLANNER_WEEK-v2-mobile.png` | ✅ |
| 2일 이상 overview | `PLANNER_WEEK-v2-2day-overview.png` | ✅ |
| 세로 스크롤 중간 | `PLANNER_WEEK-v2-mobile-scrolled.png` | ✅ |
| narrow 320px | `PLANNER_WEEK-v2-mobile-narrow.png` | ✅ |
| 4끼 filled day card | `PLANNER_WEEK-v2-day-card-filled.png` | ✅ |

---

## Slice06 Evidence Plan

- `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile.png`
- `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile-narrow.png`
- `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-after-add-mobile.png`

---

## Baemin-Style Visual Retrofit Addendum

> 추가일: 2026-04-27
> 관련 workpack: `docs/workpacks/baemin-style-planner-week-retrofit/README.md`
> 상태: Stage 1 문서화 완료, Stage 4 구현 대기

이 섹션은 PLANNER_WEEK 화면에 배민 스타일 토큰을 적용하는 시각적 리트로핏 계획이다. H2/H4 day-card interaction contract와 기존 정보 구조를 보존하면서, 승인된 CSS 변수 토큰과 공유 UI 프리미티브로 교체한다.

### 리트로핏 대상 파일

| 파일 | 리트로핏 범위 |
|------|-------------|
| `components/planner/planner-week-screen.tsx` | Hero section, CTA toolbar, week context bar, weekday strip, day cards, slot rows, status chips, loading skeleton, empty state, unauthorized state — `glass-panel` 제거, hardcoded rgba/hex/bg-white → 토큰 기반, STATUS_META rgba → `color-mix()` 재파생 |

### 토큰 교체 와이어프레임

```text
┌─────────────────────────────────────┐
│ HOMECOOK                            │  ← AppHeader (변경 없음)
├─────────────────────────────────────┤
│ ┌─ Hero Section ──────────────────┐ │
│ │ Planner Week / 식단 플래너      │ │  glass-panel → --panel + --line + --shadow-2
│ │ [장보기] [요리하기] [남은요리]  │ │  bg-white/76 → --surface-fill
│ │  장보기: --brand + --surface     │ │  text-white → --surface
│ │  비활성: --surface + --muted     │ │  rgba shadows → color-mix() / --shadow-1
│ └─────────────────────────────────┘ │  rounded-[clamp] → --radius-xl
│                                     │
│ ┌─ Week Context Bar (sticky) ─────┐ │
│ │ 이번 주 · 식사 N건              │ │  glass-panel → --panel + --line + --shadow-2
│ │ 현재 범위                        │ │  bg-white/88 → --panel (with backdrop-blur)
│ │ 4월 14일 ~ 4월 20일             │ │  rgba shadow → --shadow-2
│ │ [화] [수] [목] [금] [토] [일]   │ │  rounded-[13px] → --radius-md
│ └─────────────────────────────────┘ │  rounded-[clamp] → --radius-xl
│                                     │
│ ┌─ Day Card ──────────────────────┐ │
│ │ [금] 4월 17일              ⋯   │ │  glass-panel → --panel + --line + --shadow-2
│ │─────────────────────────────────│ │  rounded-[clamp] → --radius-xl
│ │ 아침  김치찌개    2인분  등록   │ │  bg-white → --surface (serving chip)
│ │ 점심  샐러드      1인분  장보기 │ │  STATUS_META rgba → color-mix()
│ │ 간식  ─ 비어 있음 ─            │ │  leftover rgb(46,166,122) → --olive
│ │ 저녁  된장찌개    2인분  등록   │ │  rounded-[11px] weekday badge → --radius-md
│ └─────────────────────────────────┘ │  text-white badge → --surface
│                                     │
│ ┌─ Loading Skeleton ──────────────┐ │
│ │ ████████████████████████████████│ │  glass-panel → --panel + --line + --shadow-2
│ │ ████████████████████████████████│ │  bg-white/70 → --surface-fill
│ └─────────────────────────────────┘ │  rounded-[20px] → --radius-xl
│                                     │
│ ┌─ Empty State ───────────────────┐ │
│ │ 아직 등록된 식사가 없어요.      │ │  glass-panel → --panel + --line + --shadow-2
│ └─────────────────────────────────┘ │  rounded-[18px] → --radius-lg
└─────────────────────────────────────┘
```

### STATUS_META `color-mix()` 전환

| Status | 현재 배경 | 토큰 전환 | 텍스트 색상 (변경 없음) |
|--------|-----------|-----------|----------------------|
| `registered` | `rgba(255,108,60,0.12)` | `color-mix(in srgb, var(--brand) 12%, transparent)` | `var(--brand-deep)` |
| `shopping_done` | `rgba(46,166,122,0.12)` | `color-mix(in srgb, var(--olive) 12%, transparent)` | `var(--olive)` |
| `cook_done` | `rgba(30,30,30,0.08)` | `color-mix(in srgb, var(--foreground) 8%, transparent)` | `var(--foreground)` |

### Radius 매핑 참조

| 현재 | 토큰 | 사용처 |
|------|------|--------|
| `12px` | `--radius-md` | CTA class, weekday badge |
| `13px` | `--radius-md` | weekday strip item |
| `16px` | `--radius-lg` | CTA group |
| `18px` | `--radius-lg` | unauthorized info, empty message |
| `20px`+ / `clamp(...)` | `--radius-xl` | hero, week context, day cards, skeleton |
| `full` | `--radius-full` | range navigation buttons, serving chip |

### 보존 계약

- H2/H4 day-card interaction contract: 세로 스크롤 전용, 가로 스크롤 없음, 2일 이상 mobile overview
- 정보 구조: hero → CTA toolbar → week context bar → weekday strip → day cards → slot rows
- Weekday strip swipe gesture 및 keyboard navigation
- 모든 상태: checking / authenticated / unauthorized / loading / ready / empty / error
- ContentState 컴포넌트 소비 패턴 (checking, unauthorized, error)

### Evidence Plan

경로: `ui/designs/evidence/baemin-style/planner-week-retrofit/`

| artifact | 파일 |
|----------|------|
| before — mobile default (390px) | `PLANNER_WEEK-before-mobile.png` |
| after — mobile default (390px) | `PLANNER_WEEK-after-mobile.png` |
| after — narrow (320px) | `PLANNER_WEEK-after-narrow-320.png` |
| loading state | `PLANNER_WEEK-loading-state.png` |
| empty state | `PLANNER_WEEK-empty-state.png` |
| unauthorized state | `PLANNER_WEEK-unauthorized-state.png` |
| scrolled day cards | `PLANNER_WEEK-scrolled-day-cards.png` |
