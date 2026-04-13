# PLANNER_WEEK — 식단 플래너(위클리)

> 기준 문서: 화면정의서 v1.2.3 §5 / 요구사항기준선 v1.6.3 §1-4 / API v1.2.2 §3 / `05-planner-week-core` accepted contract
> 갱신일: 2026-04-13

---

## 레이아웃 와이어프레임

### 기본 화면

```text
┌─────────────────────────────────────┐
│ [장보기] [요리하기] [남은요리]      │
├─────────────────────────────────────┤
│ 4월 12일 ~ 4월 18일   [이번주로 가기]│
│ 일 12  월 13  화 14  수 15  목 16   │
│ 금 17  토 18   ← 좌우 스와이프로 주 이동 │
├─────────────────────────────────────┤
│ [일] 4월 12일                       │
│ 아침   점심   간식   저녁           │
│ 김치찌개  샐러드  비어 있음  비어 있음 │
│ 2인분·등록  1인분·장보기            │
├─────────────────────────────────────┤
│ [월] 4월 13일                       │
│ 아침   점심   간식   저녁           │
│ ... 같은 day card 패턴 반복 ...     │
└─────────────────────────────────────┘
```

### Empty 상태

```text
┌─────────────────────────────────────┐
│ 이번 주 4월 12일 ~ 4월 18일         │
│ 식사 0건                     [이번주]│
├─────────────────────────────────────┤
│ 아직 등록된 식사가 없어요            │
│ 오늘부터 채울 수 있게 planner add를   │
│ 사용할 수 있어요                     │
├─────────────────────────────────────┤
│ [일] 4월 12일                       │
│ 아침   점심   간식   저녁           │
│ 비어 있음 비어 있음 비어 있음 비어 있음 │
└─────────────────────────────────────┘
```

### Unauthorized 상태

```text
┌─────────────────────────────────────┐
│ 이 화면은 로그인이 필요해요           │
│ 플래너를 사용하려면 로그인해주세요     │
│                                     │
│         [로그인] [취소]             │
└─────────────────────────────────────┘
```

---

## 핵심 컴포넌트

### 1. 상단 CTA 그룹

- `[장보기] [요리하기] [남은요리]` 3개 버튼을 항상 노출한다.
- `05-planner-week-core` 이후 실제 이동은 후속 슬라이스에서 닫히며, slice06은 이 CTA 구조를 바꾸지 않는다.

### 2. Week Context Bar + Weekday Strip

- 주간 범위와 주 이동 affordance는 planner 본문 바로 위에 붙어 있어야 한다.
- 요일 스트립은 주 이동 gesture target이며, 범위 메타데이터를 중복 노출하지 않는다.

### 3. Day Card

- 모바일 기본 단위는 날짜별 `day card`다.
- 같은 날짜의 `아침 / 점심 / 간식 / 저녁` 4끼가 같은 카드 안에서 함께 읽힌다.
- planner add 이후에도 이 day-card mental model은 유지된다.

### 4. Meal Slot

- 슬롯에는 끼니명, 식사명 또는 빈 상태, 인분/상태 메타를 압축해 표시한다.
- `status`는 `registered / shopping_done / cook_done` 세 가지다.
- `is_leftover=true` meal은 별도 시각 강조 가능하지만 구조 자체를 바꾸지는 않는다.

### 5. Slice06 연결 규칙

- slice06은 `RECIPE_DETAIL`에서 생성한 새 Meal이 목표 날짜/끼니 슬롯에 정확히 보이게 하는 범위만 추가한다.
- planner add 때문에 page-level overflow, 새로운 full-page add flow, 컬럼 CRUD 재도입이 생기면 안 된다.
- Stage 4 authority evidence에는 `5-column mobile density` 보강 캡처를 반드시 추가한다.

---

## 상호작용 규칙

- 세로 스크롤은 day card 목록 탐색용이다.
- 주 이동은 요일 스트립 스와이프를 우선한다.
- slot 탭 → `MEAL_SCREEN` 진입은 `07-meal-manage`가 닫는다.
- slice06은 planner add 성공 후 `PLANNER_WEEK`에서 결과를 읽는 범위만 담당하며, planner 구조 변경은 하지 않는다.

---

## 접근성 / 토큰 메모

- 페이지 배경은 `--background`, 카드와 slot은 `--surface`를 사용한다.
- 기본 수평 여백은 모바일 `--space-4`.
- 터치 타겟 최소 크기 `44x44`.
- 작은 모바일 sentinel에서도 CTA 잘림, range bar 밀림, slot 정보 붕괴가 없어야 한다.

---

## Stage 4 evidence plan for slice06

- `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile.png`
- `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-5-column-mobile-narrow.png`
- `ui/designs/evidence/06-recipe-to-planner/PLANNER_WEEK-after-add-mobile.png`

이 문서는 slice06이 기대는 planner baseline을 요약한다. 더 공격적인 모바일 리디자인은 `ui/designs/PLANNER_WEEK-v2.md`와 authority preflight 범위로 유지한다.
