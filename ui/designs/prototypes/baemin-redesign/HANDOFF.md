# homecook_ × 배민 리디자인 — 개발자 핸드오프

> **REFERENCE ONLY — 이 파일은 production implementation 계약이 아닙니다.**
> `app/globals.css`, 라우트 파일, 공용 컴포넌트를 직접 수정하는 근거로 사용하지 마세요.
> 공식 구현 순서와 승인 기준은 `ui/designs/BAEMIN_STYLE_DIRECTION.md`와
> `docs/workpacks/h6-baemin-style-direction/README.md`를 따릅니다.

> Source: 단일 HTML 프로토타입 (`index.html` + `tokens.jsx`, `components.jsx`, `screens/*.jsx`)
> Target: Next.js 15 + React 19 + Tailwind v4, `app/globals.css`(`@theme inline`) 기반
> 화면정의서: v1.5.0 — 정보구조 변경 없이 **시각/상호작용 톤만 배민 스타일로 교체**가 원칙

---

## 1. 프로토타입 디자인 토큰 표

### 1.1 색상

| Group | Token | Value | 용도 |
|---|---|---|---|
| Brand | `mint` | `#2AC1BC` | 주요 액션, 활성 탭, 강조 텍스트 |
| Brand | `mintDeep` | `#20A8A4` | hover/pressed |
| Brand | `mintSoft` | `#E6F8F7` | 활성 칩 배경, 상태 pill 배경 |
| Accent | `teal` / `tealLight` | `#12B886` / `#20C997` | 보조 (요리완료 배지 등) |
| Semantic | `red` / `redDeep` | `#FF6B6B` / `#E03131` | 좋아요, 인기 배지, 삭제 |
| Semantic | `orange` | `#FFB347` | 평점 별, 알림 |
| Semantic | `blue` | `#74C0FC` | info |
| Semantic | `promo` | `#FF0000` | 한정 프로모션 |
| Text | `ink` | `#212529` | 본문, 헤딩 |
| Text | `text2` | `#495057` | 부제/설명 |
| Text | `text3` | `#868E96` | 보조 메타정보 |
| Text | `text4` | `#ADB5BD` | disabled 텍스트 |
| Line | `border` | `#DEE2E6` | 기본 구분선/카드 보더 |
| Line | `borderStrong` | `#343A40` | 강조 보더(드물게) |
| Surface | `surface` | `#FFFFFF` | 카드/시트 |
| Surface | `surfaceFill` | `#F8F9FA` | 입력 필드, 비활성 칩 |
| Surface | `surfaceSubtle` | `#F1F3F5` | 섹션 배경, 칩 hover |

### 1.2 폰트

| Token | Stack | 용도 |
|---|---|---|
| `fontUI` | `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR"` | 모든 본문/UI |
| `fontBrand` | `"Jua"` (BMJua 대체) | 로고/카테고리 헤딩 |

타입 스케일 (실측):

| 역할 | size / weight | line |
|---|---|---|
| Display(브랜드) | 22 / 700 | 1.2 |
| H1(화면 타이틀) | 22 / 700 | 1.3 |
| H2(섹션) | 18 / 700 | 1.3 |
| Body | 14 / 500 | 1.5 |
| Body emphasis | 14 / 700 | 1.5 |
| Caption | 12 / 500 | 1.4 |
| Meta | 11–12 / 500–700 | 1.3 |

### 1.3 Radius

| Token | Value | 사용처 |
|---|---|---|
| `radius-xs` | 4px | 배지/pill 일부 |
| `radius-sm` | 8px | Button, 입력 필드 |
| `radius-md` | 12px | Card, Compact thumb |
| `radius-lg` | 16px | 큰 카드, 모달 시트 상단 |
| `radius-pill` | 9999px | Chip, Tag |

### 1.4 Shadow

| Token | Value | 용도 |
|---|---|---|
| `shadow-natural` | `0 1px 3px rgba(0,0,0,0.04)` | 카루셀 thumb |
| `shadow-deep` | `0 2px 8px rgba(0,0,0,0.08)` | 기본 카드 |
| `shadow-sharp` | `0 4px 12px rgba(0,0,0,0.10)` | hover 카드 |
| `shadow-outlined` | `0 4px 16px rgba(0,0,0,0.12)` | 플로팅 액션 |
| `shadow-crisp` | `0 8px 24px rgba(0,0,0,0.16)` | 시트, 다이얼로그 |

### 1.5 Spacing

| Token | px | 용도 |
|---|---|---|
| `space-1` | 4 | 아이콘-텍스트 간 |
| `space-2` | 8 | 칩 내부 |
| `space-3` | 12 | 카드 내부 컴팩트 |
| `space-4` | 16 | 화면 좌우 패딩 기본 |
| `space-5` | 20 | 섹션 간 |
| `space-6` | 24 | 큰 섹션 간 |
| `space-8` | 32 | 화면 상하 |
| `space-12` | 48 | 큰 분리 |

### 1.6 Surface / Background / Line / Text 계층

```
[App Background]   #FFFFFF
  └─ [Section]     #F8F9FA  (홈 list 배경, 비활성 칩)
       └─ [Card]   #FFFFFF + shadow-deep
             └─ [Inset/Field]  #F1F3F5
[Line]              #DEE2E6 (0.5–1px)
[Text 1] ink   #212529
[Text 2] text2 #495057
[Text 3] text3 #868E96
[Text 4] text4 #ADB5BD (disabled)
```

---

## 2. 현재 프로젝트 토큰 매핑표

기준: 현재 `app/globals.css` (C2 명랑한 주방, 오렌지 베이스)

| Prototype token | 현재 homecook token | 추천 신규 값 | 영향받는 UI | 주의사항 |
|---|---|---|---|---|
| `mint` `#2AC1BC` | `--brand` `#FF6C3C` | `--brand: #2AC1BC` | 모든 primary 버튼, 활성 탭, 활성 칩, 링크 | 기존 오렌지 brand-deep 의존 컴포넌트 전수 검토 필요 |
| `mintDeep` `#20A8A4` | `--brand-deep` `#E05020` | `--brand-deep: #20A8A4` | hover/pressed 상태 | hover 색이 너무 어두우면 채도 +5% |
| `mintSoft` `#E6F8F7` | (없음) | `--brand-soft: #E6F8F7` | 활성 chip bg, status pill | 신규 토큰 |
| `teal` `#12B886` | `--olive` `#1f6b52` | `--accent: #12B886` | 요리완료 상태, 보조 강조 | `olive` 의미가 "허브/식재료 그린" 이면 두 토큰 분리 권장 |
| `red` `#FF6B6B` | (없음, ad-hoc) | `--danger: #FF6B6B` | 좋아요 채우기, 인기 배지 | 기존 destructive 재사용 가능 시 통합 |
| `ink` `#212529` | `--foreground` `#1a1a2e` | `--foreground: #212529` | 본문 전체 | 명도 차이 미세 — 검수 후 결정 |
| `text2/3/4` | `--muted` `#5f6470` | `--text-2/3/4` 3단계 | 메타텍스트, placeholder, disabled | `--muted` 단일 토큰 → 3단계로 확장 |
| `border` `#DEE2E6` | `--line` `rgba(0,0,0,0.07)` | `--line: #DEE2E6` | 카드 보더, divider | rgba → solid로 바꾸면 일부 글래스 패널 톤 변화 |
| `surface` `#FFFFFF` | `--surface` `#FFFFFF` | 동일 | 카드, 시트 | 동일 — 변경 없음 |
| `surfaceFill` `#F8F9FA` | (없음) | `--surface-fill: #F8F9FA` | 입력, 비활성 칩 | 신규 토큰 |
| `surfaceSubtle` `#F1F3F5` | (없음) | `--surface-subtle: #F1F3F5` | 섹션 배경 | 신규 토큰 |
| `background` `#FFFFFF` | `--background` `#fff9f2` | `--background: #FFFFFF` | 앱 전체 베이스 | 따뜻한 크림 → 화이트 변경 = 분위기 큰 변화. **사용자 승인 필요** |
| `cook-*` | `--cook-*` (이미 있음) | 그대로 유지 | 조리방법 step card | 변경 불필요 — 기존 토큰 의미 그대로 |
| `shadow-deep` | `--shadow` `0 2px 10px rgba(0,0,0,0.08)` | `--shadow: 0 2px 8px rgba(0,0,0,0.08)` | 카드 | 거의 동일. 5단 shadow 토큰화 권장 |

---

## 3. Tailwind v4용 CSS variables + @theme inline (검토용)

> **주의**: 아래는 `app/globals.css`에 바로 적용하기 전 **별도 파일(`docs/design/baemin-tokens.preview.css`)에 두고 비교 검토**할 것을 권장합니다.

```css
/* docs/design/baemin-tokens.preview.css — 검토용 */
@import "tailwindcss";

:root {
  /* ── 배민 민트 베이스 ── */
  --background: #ffffff;
  --foreground: #212529;
  --surface:        #ffffff;
  --surface-fill:   #f8f9fa;
  --surface-subtle: #f1f3f5;
  --panel:          rgba(255, 255, 255, 0.92);

  /* Brand — 배민 민트 */
  --brand:      #2ac1bc;
  --brand-deep: #20a8a4;
  --brand-soft: #e6f8f7;

  /* 보조 (기존 olive 자리, 의미는 "보조 액센트") */
  --accent:       #12b886;
  --accent-light: #20c997;

  /* Semantic */
  --danger:      #ff6b6b;
  --danger-deep: #e03131;
  --warning:     #ffb347;
  --info:        #74c0fc;
  --promo:       #ff0000;

  /* Text scale */
  --text-1: #212529;   /* = foreground */
  --text-2: #495057;
  --text-3: #868e96;
  --text-4: #adb5bd;

  /* Line */
  --line:        #dee2e6;
  --line-strong: #343a40;

  /* ── 요리모드 조리방법 색상 (기존 유지) ── */
  --cook-stir:   #ff8c42;
  --cook-boil:   #e8453c;
  --cook-grill:  #8b5e3c;
  --cook-steam:  #4a90d9;
  --cook-fry:    #f5c518;
  --cook-blanch: #7bc67e;
  --cook-mix:    #2ea67a;
  --cook-etc:    #aaaaaa;

  /* Spacing (기존 유지) */
  --space-1:  4px;  --space-2:  8px;  --space-3:  12px;
  --space-4:  16px; --space-5:  20px; --space-6:  24px;
  --space-8:  32px; --space-12: 48px;

  /* Radius */
  --radius-xs:   4px;
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-pill: 9999px;

  /* Shadow */
  --shadow-natural:  0 1px 3px  rgba(0,0,0,0.04);
  --shadow-deep:     0 2px 8px  rgba(0,0,0,0.08);
  --shadow-sharp:    0 4px 12px rgba(0,0,0,0.10);
  --shadow-outlined: 0 4px 16px rgba(0,0,0,0.12);
  --shadow-crisp:    0 8px 24px rgba(0,0,0,0.16);

  /* Fonts */
  --font-body:
    -apple-system, BlinkMacSystemFont, "Helvetica Neue",
    "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic",
    "Noto Sans KR", sans-serif;
  --font-brand: "Jua", var(--font-body);
}

@theme inline {
  --color-background:    var(--background);
  --color-foreground:    var(--foreground);
  --color-surface:       var(--surface);
  --color-surface-fill:  var(--surface-fill);
  --color-surface-subtle:var(--surface-subtle);

  --color-brand:      var(--brand);
  --color-brand-deep: var(--brand-deep);
  --color-brand-soft: var(--brand-soft);

  --color-accent:       var(--accent);
  --color-accent-light: var(--accent-light);

  --color-danger:      var(--danger);
  --color-danger-deep: var(--danger-deep);
  --color-warning:     var(--warning);
  --color-info:        var(--info);

  --color-text-1: var(--text-1);
  --color-text-2: var(--text-2);
  --color-text-3: var(--text-3);
  --color-text-4: var(--text-4);

  --color-line:        var(--line);
  --color-line-strong: var(--line-strong);

  --radius-xs:   var(--radius-xs);
  --radius-sm:   var(--radius-sm);
  --radius-md:   var(--radius-md);
  --radius-lg:   var(--radius-lg);
  --radius-pill: var(--radius-pill);

  --shadow-natural:  var(--shadow-natural);
  --shadow-deep:     var(--shadow-deep);
  --shadow-sharp:    var(--shadow-sharp);
  --shadow-outlined: var(--shadow-outlined);
  --shadow-crisp:    var(--shadow-crisp);

  --font-sans:  var(--font-body);
  --font-brand: var(--font-brand);
}
```

**검토 절차:**
1. `app/globals.css`는 그대로 두고 `baemin-tokens.preview.css`를 임시로 import하는 별도 라우트(`/__preview/baemin`)에서 시각 비교
2. 충돌 없는 신규 토큰부터 본 파일에 머지(`--surface-fill`, `--surface-subtle`, `--text-2/3/4`, `--radius-*`, `--shadow-*`)
3. 기존 토큰 값 변경(`--brand`, `--background`, `--foreground`)은 **마지막 단계 + 사용자 승인 후**

---

## 4. 공통 컴포넌트 명세

### 4.1 Button

| 상태 | bg | color | border | shadow |
|---|---|---|---|---|
| primary / default | `--brand` | `#fff` | none | none |
| primary / hover | `--brand-deep` | `#fff` | none | `--shadow-deep` |
| primary / pressed | `--brand-deep` (95% opacity) | `#fff` | none | inset 0 1px 0 rgba(0,0,0,0.06) |
| primary / disabled | `--line` | `--text-4` | none | none |
| primary / loading | `--brand` | `transparent` | none | + spinner overlay |
| secondary / default | `transparent` | `--brand` | `1px --brand` | none |
| secondary / hover | `--brand-soft` | `--brand-deep` | `1px --brand-deep` | none |
| neutral | `--surface-fill` | `--text-1` | none | none |
| destructive | `--danger` | `#fff` | none | none |
| dark | `--text-1` | `#fff` | none | none |

크기: `sm` h36 fs13 / `md` h48 fs16 / `lg` h56 fs17. radius `--radius-sm` 고정.
font-weight 700 고정. full-width prop 지원.
loading 상태: 텍스트 투명화, spinner 16px 중앙. error 상태는 토스트로 별도 처리(버튼 자체는 색 변화 없음).

### 4.2 Chip

| 상태 | bg | color | weight |
|---|---|---|---|
| default | `--surface-subtle` | `--text-2` | 500 |
| hover | `--surface-fill` | `--text-1` | 500 |
| active | `--text-1` (또는 `--brand`) | `#fff` | 700 |
| disabled | `--surface-subtle` | `--text-4` | 500 |

`compact`: padding 6×10, fs12. `default`: padding 8×14, fs13. radius `--radius-pill`.
필터 칩은 `--text-1` active, 셀렉션 칩은 `--brand` active로 의미 구분.

### 4.3 RecipeCard

**Large (홈 피드)**
- shape: `--radius-md`, `--shadow-deep`, surface white
- thumb: aspect 16/9, bg = `recipe.bg`, 이모지/이미지 중앙
- overlay: 우상단 bookmark 36×36 round (`rgba(255,255,255,0.92)`)
- 인기 배지: 좌상단 `--danger` bg, 12 fs / 700w / radius 4
- meta: rating(`--warning`), 저장수, 시간, 인분 한 줄. 구분자 `·`
- tags: pill chip 3개 max

**Compact (카루셀)**
- thumb: aspect 1/1, `--radius-md`, `--shadow-natural`
- 폭 160px 고정, peek 0.5장
- 텍스트 2줄 (이름 / meta)

**상태**
| 상태 | 처리 |
|---|---|
| default | 위 기본 |
| hover (web) | `--shadow-sharp` + `transform: translateY(-2px)` |
| pressed | `transform: scale(0.98)` |
| saved | bookmark 채움(`--brand`) |
| disabled | opacity 0.5, pointer-events none |
| loading (skeleton) | thumb `--surface-fill` 펄스, 텍스트 라인 2개 |
| error (이미지 로드 실패) | 이모지 placeholder + `--surface-fill` |

### 4.4 BottomTab

- 위치: fixed bottom, bg white, border-top `0.5px --line`
- padding: `8px top + 28px bottom` (safe area 포함)
- 4탭: 홈 / 플래너 / 팬트리 / 마이
- 아이콘 24px, 라벨 11px

| 상태 | 아이콘 | 라벨 |
|---|---|---|
| default | stroke `--text-3`, fill none | `--text-3` 500 |
| active | stroke `--brand`, fill `--brand` | `--brand` 700 |
| disabled | `--text-4`, opacity 0.5 | 동일 |
| badge | 우상단 dot 8px `--danger` | — |

loading/error는 탭 자체에 없음(스크린 컨텐츠가 처리).

### 4.5 AppBar

- sticky top, bg white, border-bottom `0.5px --line`, min-height 52
- 좌(32) / 중앙(flex) / 우(32) 3분할
- 일반 타이틀: 18 / 700 / `--text-1`
- 브랜드 모드: `homecook_` (Jua 22 / 700 / `--brand` + `_` `--text-1`)
- left: chev-left 또는 비움 / right: search, bag, more

| 상태 | 처리 |
|---|---|
| default | 위 |
| scrolled (선택) | shadow `--shadow-natural` 추가 |
| transparent (히어로 위) | bg transparent, 아이콘 white, 스크롤 시 fade-in |
| loading | 우측 영역 spinner 16px |

### 4.6 Sheet / Modal (BottomSheet)

- 화면 하단부터 슬라이드업, radius 상단 `--radius-lg`
- bg `--surface`, shadow `--shadow-crisp`
- backdrop: `rgba(0,0,0,0.4)` fade, tap-to-close
- handle bar: 36×4 `--text-4` 중앙 8px top
- header: 56h, 타이틀 16/700, 우측 close 아이콘
- footer: sticky bottom, padding 16, 주요 액션 1–2개 (full-width primary)

| 상태 | 처리 |
|---|---|
| default | 위 |
| opening | translateY 100% → 0, 220ms ease-out |
| closing | 동일 역방향 + backdrop fade-out |
| disabled / non-dismissable | backdrop tap 무시, ESC만 |
| loading | 본문 영역 skeleton, footer 버튼 disabled+spinner |
| error | 본문 상단 inline alert (`--danger-deep` text + `--surface-fill` bg) |

키보드 회피: viewport 높이 변화 시 sheet height 자동 축소 + 본문 스크롤 활성.
스크롤 lock: body `overflow:hidden` + 시트 내부만 스크롤.

---

## 5. 화면별 이식 가이드

### 5.1 HOME (`app/(home)/page.tsx` + `components/home/*`)

**유지해야 할 디자인 포인트**
- 브랜드 AppBar(`homecook_`, Jua) — 상단 정체성 핵심
- 재료 필터 chip-rail + 정렬 시트 진입 버튼
- 테마 카루셀: 1.5장 peek, gap 12, snap-x
- 레시피 large card 의 인기/북마크 오버레이 위치
- 섹션 간 24px 간격, 섹션 헤더 18/700

**실제 앱에서 조심해야 할 점**
- 기존 `home-screen.tsx`가 23KB — Server vs Client 경계 우선 파악
- `ingredient-filter-modal.tsx`는 기존 `selection-chip-rail` 재사용 중 → chip 스타일만 교체하면 모달은 그대로
- Supabase 데이터 fetch 형상 변경 금지 (props/타입 동일 유지)
- `components/shared/selection-chip-rail.tsx` 변경 시 다른 화면(MEAL_SCREEN 등) 동시 영향

**먼저 적용할 작은 단위**
1. AppBar 브랜드 모드만 교체 (Jua 폰트 + 민트)
2. Chip 컬러 교체 (filter, theme tab)
3. RecipeCard 카루셀 — large card는 마지막
4. 정렬 시트 (Sheet 컴포넌트 신규)

### 5.2 RECIPE_DETAIL (`app/recipe/[id]/page.tsx` + `components/recipe/*`)

**유지해야 할 디자인 포인트**
- 히어로 이미지 + 투명 AppBar fade
- 인분 스케일러 (numeric-stepper-compact 재사용)
- 재료 / 조리법 / 리뷰 탭
- **조리방법 색상 카드** (`--cook-*`) — 그대로 유지, 시각 정체성의 핵심
- 하단 sticky 액션바: 저장 + 플래너 추가 + 요리 시작

**실제 앱에서 조심해야 할 점**
- 조리방법 색상 토큰 변경 금지 — 의미체계 그대로
- 히어로 이미지 위 AppBar 전환 타이밍 (scroll y > 200)
- 인분 스케일러는 share state — 재료 수량/영양 동시 갱신
- 리뷰 탭 빈 상태/로딩 상태 별도 디자인 필요(프로토타입에는 데모 데이터)

**먼저 적용할 작은 단위**
1. 탭 인디케이터 색만 민트로 교체
2. 액션바 primary 버튼 민트
3. 조리법 step 카드 레이아웃 (색은 기존 토큰)
4. 히어로 + 투명 AppBar (마지막)

### 5.3 PLANNER_WEEK (`app/planner/page.tsx` + `components/planner/*`)

> h7 update: `docs/화면정의서-v1.5.1.md` supersedes the older planner-level "가로 스크롤 없음" lock. For PLANNER_WEEK parity work, follow the h7 workpack and current source-of-truth docs rather than the older v1.5.0 note in this reference-only handoff.

**유지해야 할 디자인 포인트**
- 주간 day-card 가로 스크롤 + 오늘 강조
- 세로 slot row: 아침 / 점심 / 저녁
- 상태 pill: 등록 / 장보기완료 / 요리완료 (3색 의미)
- + 추가 버튼 (빈 슬롯 dashed border)
- PlannerAddPopup 시트

**실제 앱에서 조심해야 할 점**
- `@dnd-kit/core` 사용 중 — 드래그 hit 영역 변경 시 회귀 테스트 필요
- 화면정의서 v1.5.0의 슬롯 데이터 모델(아침/점심/저녁) 그대로 유지
- v2-decision 문서 존재(`PLANNER_WEEK-v2-decision.md`) — 기존 결정사항 우선
- 상태 pill 3색은 의미 토큰화 권장 (`--status-registered/shopped/cooked`)

**먼저 적용할 작은 단위**
1. day-card 활성 색만 민트
2. 상태 pill 3개 색 통일
3. + 추가 버튼 dashed → 민트 dashed
4. PlannerAddPopup 시트 (기존 modal-header 재사용)

### 5.4 PANTRY (현재 `app/`엔 미존재 — 신규)

**유지해야 할 디자인 포인트**
- 섹션별 재료 그룹 (채소/육류/해산물/유제품/조미료/기타)
- 보유 체크 토글 (체크 시 채워진 민트 사각형)
- 상단 검색바 (surface-fill bg)

**실제 앱에서 조심해야 할 점**
- 신규 화면 — 화면정의서 v1.5.0에 명세 확인 필요. 없으면 **사용자 승인 필요**
- Supabase 스키마 신설 vs 클라이언트 only — 의사결정 선행
- 체크 상태가 홈의 "보유 재료 필터"와 연동되는지 확인

**먼저 적용할 작은 단위**
1. 정적 mock 데이터로 UI만 먼저
2. 검색 필터(클라이언트)
3. localStorage 영속화
4. 백엔드 연동 (별도 슬라이스)

### 5.5 MYPAGE (현재 `components/auth/*`만 존재)

**유지해야 할 디자인 포인트**
- 프로필 카드 (아바타 + 이름 + 통계)
- 통계 3개 (저장 / 요리 완료 / 플래너 작성)
- 저장 레시피 horizontal scroll
- 메뉴 리스트 (알림/계정/도움말/로그아웃)

**실제 앱에서 조심해야 할 점**
- 인증 상태 분기 (로그인 전/후) — 기존 `components/auth/` 흐름 우선
- 통계 수치는 실데이터 fetch — 로딩/0건 상태 디자인 추가 필요
- 로그아웃 confirm — 기존 dialog 패턴 재사용

**먼저 적용할 작은 단위**
1. 메뉴 리스트만 (정적)
2. 프로필 카드 (mock)
3. 통계 + 저장 레시피 (실데이터)

---

## 6. 모바일 검증 기준

### 6.1 390px (iPhone 14/15 기준 — 디자인 baseline)

**확인 포인트**
- AppBar 타이틀 중앙 정렬, 좌우 32 영역 침범 없음
- 홈 카루셀 1.5장 peek 정확
- RecipeCard meta 한 줄 유지 (저장수 5자리 미만 가정)
- BottomTab 4탭 균등, 라벨 잘림 없음
- 시트 헤더 close 버튼 우측 16 패딩

**스크린샷 추천**
```
qa/visual/baemin/390-home.png
qa/visual/baemin/390-home-filter-open.png
qa/visual/baemin/390-recipe-detail-hero.png
qa/visual/baemin/390-recipe-detail-cook.png
qa/visual/baemin/390-planner-week.png
qa/visual/baemin/390-planner-add-sheet.png
qa/visual/baemin/390-pantry.png
qa/visual/baemin/390-mypage.png
```

### 6.2 360px (Galaxy S 표준)

**확인 포인트**
- RecipeCard tags 3개 → 2개로 줄어들거나 ellipsis
- 인분 스케일러 + 좋아요 + 저장 수치 한 줄 유지
- 플래너 day-card 7개 horizontal scroll snap 동작
- 모달 footer 버튼 2개일 때 텍스트 2줄 안 됨
- 카루셀 thumb 160px 폭 유지(혹은 비례 축소)

**스크린샷 추천**
```
qa/visual/baemin/360-home.png
qa/visual/baemin/360-recipe-detail-meta-overflow.png
qa/visual/baemin/360-planner-day-cards.png
qa/visual/baemin/360-modal-footer.png
```

### 6.3 320px (iPhone SE 1세대 — 최소 보장)

**확인 포인트**
- 본문 텍스트 어떤 곳도 가로 스크롤 발생하지 않음
- AppBar 타이틀 길면 ellipsis (브랜드 모드는 항상 `homecook_` 고정 길이라 OK)
- BottomTab 라벨 11px 유지, 잘림 없음
- 카루셀 카드 폭 144 정도로 축소
- 시트 footer primary 버튼 한 줄, 글자 크기 14 fallback 허용
- 조리법 step 카드 색 띠 + 텍스트 줄바꿈 정상

**스크린샷 추천**
```
qa/visual/baemin/320-home.png
qa/visual/baemin/320-recipe-detail-cook-step.png
qa/visual/baemin/320-planner-slot-row.png
qa/visual/baemin/320-bottom-tab.png
qa/visual/baemin/320-sheet-footer.png
```

**Playwright viewport 설정 예시**
```ts
// tests/e2e/qa-visual-baemin.spec.ts
test.use({ viewport: { width: 390, height: 844 } });  // baseline
// 별도 describe 블록에서 360 / 320 재정의
```

---

## 7. 화면정의서 v1.5.0 충돌 가능성

### 7.1 단순 스타일 변경 (사용자 통보 + 진행)
- 모든 색상 토큰 교체 (오렌지 → 민트)
- Radius / shadow / spacing 토큰 교체
- Chip / Button / Card 의 시각 표현
- BottomTab 활성 색
- 상태 pill 3색 표현

→ 기능/플로우 영향 없음. PR 설명에 before/after 스크린샷만 첨부.

### 7.2 공식 문서 변경 필요 (UX/IA 변경 — workpack 신설)
- **PANTRY 화면 신설** — v1.5.0에 명세 부재면 화면정의서 항목 추가 필요
- AppBar 브랜드 모드 (`homecook_` Jua) — 로고/CI 변경에 해당. 디자인 시스템 문서 업데이트 + CI 가이드 동기화
- 조리방법 색상 step card — 색은 기존이지만 **레이아웃이 step별 컬러 띠로 변경**되면 RECIPE_DETAIL.md 갱신
- PlannerAddPopup의 정보 구조(슬롯/날짜/레시피 3단) 변경 시 PLANNER_WEEK-v2.md 갱신
- 상태 pill 라벨 표현 ("등록/장보기 완료/요리 완료") 변경 시 — 라벨 변경은 플래너 정보구조 단어 통일 필요

→ `docs/workpacks/baemin-redesign-XX/README.md` + `acceptance.md` 작성 필수.

### 7.3 사용자 승인 없이 적용 금지
- `--background` `#fff9f2` → `#ffffff` 전환 (앱 전체 분위기 변화)
- 브랜드 컬러 전환(`--brand` 오렌지 → 민트) — CI 수준 변경
- 폰트 변경 (Pretendard → Jua 브랜드 폰트 도입) — 라이선스/로딩 비용 검토
- 카루셀 도입(현재 없는 패턴이라면) — 기존 GridList와 충돌 가능
- 상태 pill 의미 추가 (예: "장보기 완료" 신규 상태) — 도메인 모델 영향
- PANTRY 신설 자체

→ 결정 전 사용자 컨펌 + AGENTS.md authority gate 통과 필요.

---

## 8. 최종 적용 Phase 제안

### Phase 0 — Reference 정리
**범위**
- `docs/design/baemin-redesign/` 디렉터리 신설
- `HANDOFF.md`(이 문서) 커밋
- 프로토타입 스크린샷 7장 (홈/상세/플래너/팬트리/마이/시트/요리모드) 첨부
- `baemin-tokens.preview.css` 토큰 초안 첨부 (앱 미적용)

**PR 범위** — 문서 only, no source change
**검증** — 리뷰어 시각 컨펌, 화면정의서 v1.5.0과 충돌 항목 정리(섹션 7) 사용자 컨펌

---

### Phase 1 — Tokens
**범위**
- `app/globals.css` 추가 토큰 (충돌 없는 신규만 먼저):
  - `--surface-fill`, `--surface-subtle`
  - `--text-2`, `--text-3`, `--text-4`
  - `--radius-xs/sm/md/lg/pill`
  - `--shadow-natural/deep/sharp/outlined/crisp`
  - `--brand-soft`
- `@theme inline`에 노출

**PR 범위** — `app/globals.css` 단일 파일
**검증**
- `pnpm lint && pnpm typecheck && pnpm build`
- 시각 회귀: Playwright `qa-visual` 스냅샷 변경 0건 (신규 토큰만 추가했으므로)
- Storybook/preview 라우트에서 토큰 viewer로 5단 shadow / 5단 radius 확인

---

### Phase 2 — Common Components
**범위**
- `components/ui/button.tsx` (없으면 신설), `chip.tsx`, `bottom-tab.tsx`, `app-bar.tsx`, `sheet.tsx`
- 기존 `components/shared/*` 와 명확히 역할 분리: shared = 화면 공용 합성, ui = atomic
- 모든 상태(default/hover/pressed/active/disabled/loading) 스토리 작성
- a11y: focus ring (`--brand` outline 2px / offset 2px)

**PR 범위** — `components/ui/*` 신규 + 단위 테스트
**검증**
- `pnpm test` (RTL 단위), `pnpm test:e2e:a11y`
- 컴포넌트 카탈로그 라우트 `/__preview/components` 추가, 시각 스냅샷
- 기존 화면 import 경로 변경 없음(이번 단계에서는 사용처 X)

---

### Phase 3 — HOME
**범위**
- AppBar 브랜드 모드 적용
- Chip 컬러 교체(filter / theme)
- RecipeCard large + compact 마이그레이션
- 정렬 Sheet 도입 (`Sheet` 컴포넌트 첫 사용처)
- `components/home/home-screen.tsx` 의 inline 스타일 → 토큰/Tailwind utility로 치환

**PR 범위**
- `app/page.tsx`, `components/home/*`
- 동일 PR에 비주얼 회귀 스냅샷 갱신 포함

**검증**
- `pnpm test:e2e:smoke` 홈 라우트 통과
- `pnpm test:e2e:visual:update` 후 리뷰
- 390/360/320 3폭 스크린샷 첨부 (섹션 6 파일명 규칙)
- Lighthouse 성능 회귀 -3점 이내

---

### Phase 4 — RECIPE_DETAIL + Sheets
**범위**
- 히어로 + 투명 AppBar fade
- 탭 인디케이터 민트
- 조리방법 step 카드 (색은 기존 `--cook-*` 유지)
- 인분 스케일러 (기존 `numeric-stepper-compact` 스타일만 갱신)
- 액션바 sticky bottom + 저장/플래너 추가 시트
- SavePopup, PlannerAddPopup 두 시트 구체 구현

**PR 범위**
- `app/recipe/[id]/*`, `components/recipe/*`, `components/planner/planner-add-popup.tsx`(신규)

**검증**
- `pnpm test:e2e:smoke` recipe 슬라이스
- 시트 키보드 회피 시뮬레이션 (Playwright + viewport resize)
- 조리방법 8색 모두 렌더되는 step 카탈로그 페이지 시각 확인
- 화면정의서 RECIPE_DETAIL.md 와 매핑표 acceptance.md 동봉

---

### Phase 5 — PLANNER_WEEK
**범위**
- day-card 활성 민트
- slot row(아침/점심/저녁) 레이아웃
- 상태 pill 3색 (`--status-*` 토큰화)
- + 추가 dashed 버튼
- 드래그앤드롭 (`@dnd-kit`) 스타일 갱신만, 동작 보존

**PR 범위**
- `app/planner/*`, `components/planner/*`

**검증**
- 기존 `PLANNER_WEEK-v2.md` 결정사항 위반 없음 체크리스트 첨부
- 드래그앤드롭 e2e (`tests/e2e/slice-planner-*.spec.ts`) 회귀 0건
- 7일 day-card 320px에서 가로 스크롤 동작 확인

---

### Phase 6 — 나머지 화면 (PANTRY 신설 + MYPAGE)
**범위**
- **PANTRY**: 신규 라우트 `app/pantry/page.tsx`, 클라이언트 mock → localStorage → Supabase 순으로 점증 (PR 분할 권장)
- **MYPAGE**: 신규 라우트 `app/mypage/page.tsx`, 인증 상태 분기, 메뉴 리스트
- BottomTab에 두 탭 노출 (Phase 2에서 비활성으로 두었다면 활성화)

**PR 범위**
- 화면별 분리: `feat/pantry-mock`, `feat/pantry-persist`, `feat/mypage-static`, `feat/mypage-data`

**검증**
- 각 라우트 smoke test 추가
- PANTRY 신설은 화면정의서 v1.5.0 항목 추가 PR과 페어링 (섹션 7.2)
- 인증 미들웨어 영향 회귀 (`tests/e2e/qa-security.spec.ts`)

---

## 부록 A — 마이그레이션 Quick Map

| 프로토타입 파일 | 실제 프로젝트 대상 |
|---|---|
| `tokens.jsx` | `app/globals.css` (CSS vars + `@theme inline`) |
| `components.jsx::Button` | `components/ui/button.tsx` (신규) |
| `components.jsx::Chip` | `components/ui/chip.tsx` (신규) |
| `components.jsx::RecipeCard` | `components/home/recipe-card.tsx` (교체) |
| `components.jsx::BottomTab` | `components/layout/bottom-tab.tsx` (신규) |
| `components.jsx::AppBar` | `components/layout/app-bar.tsx` (신규) |
| `components.jsx::StatusPill` | `components/planner/status-pill.tsx` (신규) |
| `screens/home.jsx` | `app/page.tsx` + `components/home/home-screen.tsx` |
| `screens/detail.jsx` | `app/recipe/[id]/page.tsx` + `components/recipe/*` |
| `screens/planner.jsx` | `app/planner/page.tsx` + `components/planner/*` |
| `screens/pantry.jsx` | `app/pantry/page.tsx` (신규) |
| `screens/mypage.jsx` | `app/mypage/page.tsx` (신규) |
| `screens/modals.jsx` | `components/ui/sheet.tsx` + 화면별 `*-popup.tsx` |

## 부록 B — 변경 영향 체크리스트 (PR 템플릿용)

```md
- [ ] 화면정의서 v1.5.0과 충돌 항목 표시 (섹션 7 참조)
- [ ] 변경된 토큰 / 신규 토큰 명시
- [ ] 시각 회귀 스냅샷 갱신 (390/360/320)
- [ ] a11y: focus ring, 명도대비 4.5:1 (text on brand)
- [ ] 다크모드: 본 redesign 1차 범위 외 (별도 phase)
- [ ] 성능: Lighthouse 모바일 점수 회귀 -3점 이내
- [ ] 워크팩 문서 동기화 여부
```
