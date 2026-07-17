# PLANNER_WEEK — 식단 플래너(위클리)

> 기준 문서: 화면정의서 v1.5.1 §5 / 요구사항기준선 v1.6.4 §1-4 / API v1.2.2 §3
> 갱신일: 2026-04-27
> **Prototype parity supersession**: H2/H4의 planner-level "가로 스크롤 없음", vertical-only day-card overview, 기존 slot-row layout lock은 Baemin prototype planner parity 범위에서 supersede됨.
> **보존**: API/DB/상태 전이/auth/empty/error 계약과 의도치 않은 page-level horizontal overflow 금지는 유지.
> Wave1 mobile 100% parity note: fixed prototype reference and `ui/designs/WAVE1_MOBILE_APP_BASELINE.md` supersede earlier near-parity score gates and approved token divergences for mobile re-porting.

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
- 같은 날짜의 `아침 / 점심 / 간식 / 저녁` 4끼가 같은 카드 안에서 읽힌다.
- 카드 구조, 슬롯 구조, 스크롤 affordance는 Baemin prototype planner reference를 우선한다.
- planner 내부 localized horizontal scroll, swipe, peek affordance는 prototype reference와 일치하는 경우 허용한다.
- 390px 첫 화면의 overview 기준은 prototype reference와 동일한 첫인상을 우선한다.
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
- 5번째 끼니(예: 야식) 추가 시 prototype reference와 동일한 밀도/스크롤 모델로 표시한다.

### 5. Slice06 연결 규칙

- slice06은 `RECIPE_DETAIL`에서 생성한 새 Meal이 목표 날짜/끼니 슬롯에 정확히 보이게 하는 범위만 추가한다.
- planner add 때문에 page-level overflow, 새로운 full-page add flow, 컬럼 CRUD 재도입이 생기면 안 된다.

---

## 상호작용 규칙

- 세로 스크롤은 day card 목록 탐색용이다.
- planner 내부 스크롤/탐색 모델은 Baemin prototype planner reference를 따른다.
- planner-level localized horizontal scroll은 prototype reference와 일치하는 경우 허용한다.
- 의도치 않은 page-level horizontal overflow는 계속 허용하지 않는다.
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
> 상태: 기존 visual retrofit 기록. Baemin prototype parity contract(v1.5.1)가 이 보존 계약을 supersede함.

이 섹션은 PLANNER_WEEK 화면에 배민 스타일 토큰을 적용하는 시각적 리트로핏 기록이다. 당시에는 H2/H4 day-card interaction contract와 기존 정보 구조를 보존했지만, 2026-04-27 사용자 승인으로 Baemin prototype parity가 우선 기준이 됐다.

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

- H2/H4 day-card interaction contract의 세로 스크롤 전용, 가로 스크롤 없음, 2일 이상 mobile overview 잠금은 v1.5.1에서 supersede됨
- 정보 구조: Baemin prototype planner reference가 우선
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

---

## Prepared Food Planner Entry Anchor Extension Addendum

> 추가일: 2026-07-16
> workpack: `prepared-food-planner-entry`
> 상태: Stage 1 design artifact / independent critique·authority pending

### Contract Boundary

- `GET /planner.meals[]`의 Recipe Meal shape/status는 유지하고 additive `product_entries[]`만 client adapter에서 합친다.
- 같은 row를 두 type/array로 중복 표시하지 않는다.
- ProductPlannerEntry는 `workflow_status=null`이며 Recipe status chip, 장보기, 요리하기, 남은요리 action을 갖지 않는다.
- product entry의 이름·브랜드·영양은 생성 순간 pin된 snapshot/version을 표시하며 current product로 조용히 교체하지 않는다.
- missing/partial/unavailable은 0으로 표시하지 않는다.

### 390px / Mobile Baseline 375 Compatibility

```text
┌─────────────────────────────────────┐
│ 기존 PLANNER_WEEK app bar/주간 이동 │
│ 기존 primary CTA: 장보기/요리/남은요리│
├─────────────────────────────────────┤
│ 오늘 · 계획 항목 2                  │
│ 아침                                │
│  [recipe] 김치찌개 · 2인분 · 등록   │
│  [product] 플레인 요거트 · 1회      │  status chip 없음
│ 점심  + 식사 추가                   │
└─────────────────────────────────────┘
```

- Product row는 별도 card를 중첩하지 않고 기존 slot row 안의 compact secondary entry로 배치한다.
- product type label/icon + product name + quantity만 우선 표시한다. nutrition summary는 후속 `planner-nutrition-summary` 소유이므로 이 addendum에서 새 합계 UI를 만들지 않는다.
- Recipe Meal status hierarchy와 상단 primary CTA를 product label이 압도하지 않는다.

### Narrow 320px

- 한 slot의 recipe/product row는 각자 한 줄 또는 최대 2행이다.
- product name truncate 뒤에도 quantity와 product type 구분이 남는다.
- status 없는 product에 빈 chip/`없음`/`null` 문자열을 표시하지 않는다.
- day-card와 localized planner scroll containment는 기존 prototype authority를 유지하며 page-level horizontal scroll 금지다.

### Desktop 1280px

- 기존 planner week grid/day-card geometry를 유지한다.
- product row density가 recipe row보다 높아져 column height가 급증하지 않게 metadata를 압축한다.
- desktop hover/focus에서 product row는 `MEAL_SCREEN` 진입만 제공하고 Recipe Detail/요리 action으로 오인시키지 않는다.

### States And Interaction

- loading: product projection만 늦을 때 기존 recipe rows를 유지하고 slot 내부 product skeleton/soft error를 사용한다.
- empty: recipe/product 모두 없을 때만 기존 empty affordance. product 배열만 비었다고 전체 slot을 empty로 바꾸지 않는다.
- error: additive product projection 실패가 기존 recipe rows를 사라지게 하지 않는다.
- unauthorized: PLANNER_WEEK auth gate 뒤 날짜/column context를 복원한다.
- partial/unavailable: 이 Stage 4에서는 compact 상태만 표시하고 missing을 0 kcal로 만들지 않는다.
- slot tap → `MEAL_SCREEN`; product 추가는 `MEAL_SCREEN -> MENU_ADD`를 통해 진행한다.

### Primary CTA / Scroll Containment / Anchor Guard

- primary CTA와 week navigation을 변경하지 않는다.
- product row 추가로 first viewport의 day overview가 과도하게 밀리면 row metadata를 줄이지 day-card/scroll mental model을 교체하지 않는다.
- `PLANNER_WEEK` anchor의 current-state before 390/320/desktop을 Stage 4 전에 캡처한다.
- Stage 4 후 mixed recipe/product, product-only slot, empty/error/unauthorized evidence를 같은 viewport로 비교한다.

---

## Planner Nutrition Summary Anchor Extension Addendum

> 추가일: 2026-07-17
> workpack: `planner-nutrition-summary`
> 상태: Stage 1 temporary design contract / independent critique passed / implementation·authority pending

### Information Boundary

- 이 화면의 영양은 실제 섭취·먹음·목표 달성·의료 조언이 아니라 pin된 entry의 `계획 영양`이다.
- 주간 범위와 날짜 카드에는 `energy_kcal` + `incomplete_entry_count`만 compact하게 표시한다.
- 탄수화물·단백질·지방·나트륨 표와 aggregate warning 상세는 `MEAL_SCREEN`이 소유한다. day card마다 macro table을 반복하지 않는다.
- missing/null/unavailable은 0 kcal가 아니다. observed `complete/amount=0`만 0으로 표시한다.
- summary는 기존 Recipe Meal/ProductPlannerEntry row와 별도 read projection이며 같은 entry를 UI에서 다시 합산하지 않는다.

### Compact Copy Contract

| API 상태 | 주간/날짜 표시 | 금지 |
| --- | --- | --- |
| complete + amount | `계획 영양 1,800 kcal` | `섭취`, `달성` |
| partial + known_amount | `계획 영양 최소 1,800 kcal` | 일반 총량처럼 표시 |
| unavailable | `계획 영양 정보 준비 중` | `0 kcal` |
| incomplete_entry_count > 0 | `N개 항목 확인 필요` | nutrient별 중복 count |

- `estimated/mixed`가 포함된 값은 접근 가능한 보조 문구에 `예상 포함` 의미를 유지한다.
- week summary와 day summary에 같은 장문의 설명을 중복하지 않는다. 범위 label은 `계획 영양` 한 번, 날짜 card는 compact 수치/상태를 우선한다.

### 390px / Mobile Baseline 375 Compatibility

```text
┌─────────────────────────────────────┐
│ 기존 app bar / primary CTA / 주 이동│
├─────────────────────────────────────┤
│ 7월 13일 ~ 7월 19일                 │
│ 계획 영양 최소 8,320 kcal · 2개 확인│  ← 한 줄 우선
│ 월  화  수  목  금  토  일          │
├─────────────────────────────────────┤
│ [금] 7월 17일                       │
│ 최소 1,800 kcal · 1개 확인 필요     │  ← compact day summary
│ 아침  김치찌개 · 2인분 · 등록       │
│       플레인 요거트 · 1회 · 완제품  │
│ 점심  비어 있음                     │
└─────────────────────────────────────┘
```

- week summary는 week context 안의 보조 1행 또는 폭이 좁을 때 최대 2행이다. 별도 대형 hero/card를 추가하지 않는다.
- day summary는 card header 바로 아래의 muted metadata 1행이다. slot row보다 시각적 무게가 크지 않다.
- 390px 첫 화면에서 기존 day overview가 과도하게 밀리면 설명 문구를 줄이고 card/slot/scroll model은 바꾸지 않는다.

### Narrow 320px

- 수치와 indicator가 함께 한 줄에 들어가지 않으면 `계획 영양` 수치와 `N개 확인 필요`를 최대 2행으로만 분리한다.
- summary 때문에 끼니명, product type, Recipe status, week navigation을 생략하지 않는다.
- page-level horizontal overflow를 만들지 않고 기존 localized planner scroll containment를 유지한다.
- 색상만으로 incomplete를 표현하지 않고 문구 또는 아이콘의 accessible label을 함께 제공한다.

### Desktop 1280px

- 기존 desktop planner geometry와 day-card width를 유지한다.
- range summary를 별도 dashboard 통계 영역으로 확장하지 않는다.
- hover-only detail을 만들지 않고 day/slot tap으로 기존 `MEAL_SCREEN` 진입을 유지한다.

### Soft Loading / Error / Race

- nutrition loading 중에도 week navigation, day cards, Recipe Meal/ProductPlannerEntry rows, primary CTA는 그대로 보인다. summary 자리만 짧은 skeleton을 쓴다.
- nutrition error는 summary 영역 inline `계획 영양을 불러오지 못했어요 · 다시 시도`로 제한하고 기존 planner content를 지우지 않는다.
- 주 이동 시 이전 range 요청을 abort하거나 request key를 비교해 늦은 이전 응답이 현재 주 summary를 덮지 않는다.
- no-entry range를 false `0 kcal`로 만들지 않는다. 기존 planner empty state를 유지하고 summary는 `계획 영양 정보 없음` 또는 비노출 중 구현 단계에서 공식 상태 의미를 해치지 않는 compact 표현을 선택한다.

### Stage 4 Evidence Plan

- before/after 각각 `390`, `320`, `desktop 1280`을 `ui/designs/evidence/planner-nutrition-summary/{before,after}/`에 저장한다.
- complete, partial/minimum, unavailable, mixed, loading, error/retry, empty/no-entry, stale-range guard를 포함한다.
- 같은 viewport의 before/after를 나란히 비교해 first viewport day overview, week controls, primary CTA, localized scroll, page overflow를 판정한다.
- 최종 authority report 전까지 이 addendum은 `temporary`이며 구현 pass나 `confirmed`를 의미하지 않는다.
