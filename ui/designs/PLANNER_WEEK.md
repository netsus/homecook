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
