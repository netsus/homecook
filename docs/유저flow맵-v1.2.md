# 유저 Flow맵 v1.2

상태: 공식문서
담당자: 채실장
날짜: 3월 9

> 기준 문서: 요구사항 기준선 v1.6 / 화면정의서 v1.2 / DB 설계 v1.3 / API 설계 v1.2.1
>
> 작성: 킴실장
>
> v1.1 → v1.2 변경: 장보기 UX/API 반영 + 최근 정책 정합화

---

## v1.1 → v1.2 변경 체크리스트

| #   | 변경 내용                                                 | 영향 범위                   | 상태 |
| --- | --------------------------------------------------------- | --------------------------- | ---- |
| 1   | 장보기 목록 생성 후 `SHOPPING_DETAIL`로 자동 이동         | ④ 장보기 여정               | ✅   |
| 2   | `SHOPPING_DETAIL`에 **구매 섹션 / 팬트리 제외 섹션** 분리 | ④ 장보기 여정               | ✅   |
| 3   | 장보기 아이템 **드래그&드롭 순서 변경** 가능              | ④ 장보기 여정               | ✅   |
| 4   | 구매 섹션 ↔ 팬트리 제외 섹션 간 아이템 이동 가능          | ④ 장보기 여정               | ✅   |
| 5   | 제외 섹션으로 이동 시 `is_checked=false` 자동 정리        | ④ 장보기 여정               | ✅   |
| 6   | 장보기 완료 후 **팬트리에 추가할 아이템 선택 팝업** 추가  | ④ 장보기 여정               | ✅   |
| 7   | 장보기 완료 후 리스트는 **read-only**                     | ④ 장보기 / ⑪ 저장·관리 여정 | ✅   |
| 8   | 장보기 공유 텍스트는 **제외 섹션 항목 미포함**            | ④ 장보기 여정               | ✅   |

### 변경에 따른 연쇄 수정

| 연쇄 항목                    | 내용                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| SHOPPING_DETAIL 역할 확대    | 단순 체크리스트 화면이 아니라, **정렬 / 제외 관리 / 완료 후 팬트리 반영 선택**까지 담당 |
| 장보기 완료 정의 보완        | 완료 = meals 상태 전이 + 리스트 완료, 팬트리 반영은 선택적으로 동반                     |
| 장보기 기록 재열람 정책 보완 | 완료된 장보기 리스트는 **기록용 read-only**로 재열람                                    |

---

## 여정 전체 지도

```
┌─────────────────────────────────────────────────────────────────┐
│                         집밥 서비스 사용자 여정                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ① 탐색 ─── ② 로그인 ─── ③ 식단 계획 ─── ④ 장보기             │
│     │                        │                  │               │
│     │                        ├─ ⑨ 유튜브 등록    │               │
│     │                        ├─ ⑩ 직접 등록      │               │
│     │                        │                  │               │
│     │                        │              ⑤ 요리하기           │
│     │                        │                  │               │
│     ├── ⑧ 독립 요리          │              ⑥ 남은요리 관리      │
│     │                        │                                  │
│     └── ⑪ 레시피 저장/관리    ├─ ⑦ 팬트리 관리                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 핵심 사이클 (주 1~2회 반복)

```
③ 식단 계획 → ④ 장보기 → ⑤ 요리하기 → ⑥ 남은요리 관리
     ↑                                        │
     └────────── 남은요리 재등록 ───────────────┘
```

---

## ① 레시피 탐색 여정

> 앱에 처음 들어온 사용자가 레시피를 둘러보고 마음에 드는 걸 찾는 여정

### 진입 조건

- 앱 실행 또는 재방문 (로그인 불필요)

### 플로우

```
앱 실행
  │
  ▼
HOME (홈)
  ├─ 테마 섹션 탐색 (스크롤)
  ├─ 제목 검색 (검색바 입력)
  ├─ 재료 검색 → INGREDIENT_FILTER_MODAL
  │               ├─ 재료 다중 선택 → [적용]
  │               └─ [초기화]
  ├─ 정렬 변경 (조회수순/저장순/좋아요순/플래너등록순)
  │
  └─ 레시피 카드 탭
       │
       ▼
     RECIPE_DETAIL (레시피 상세)
       ├─ 레시피 정보 확인 (재료, 스텝, 인분)
       ├─ 인분 조절 (실시간 재료량 반영)
       ├─ [공유] → Web Share / 링크 복사
       ├─ [요리하기] → ⑧ 독립 요리 여정
       ├─ [좋아요] → ② 로그인 게이트
       ├─ [저장] → ② 로그인 게이트
       └─ [플래너에 추가] → ② 로그인 게이트
```

### 종료 조건

- 레시피 상세까지 확인 완료
- 또는 로그인 필요 액션 시도 → ② 로그인 여정으로 분기

### 관련 화면

`HOME` → `INGREDIENT_FILTER_MODAL` → `RECIPE_DETAIL`

---

## ② 로그인 여정

> 비로그인 사용자가 로그인 필요 기능을 만났을 때, 또는 직접 로그인할 때의 여정

### 진입 조건

- (A) 로그인 필요 기능 시도 시 로그인 게이트 작동
- (B) 마이페이지/플래너/팬트리 탭 직접 진입 시도

### 플로우

```
[로그인 필요 액션 시도]
  │
  ▼
안내 모달
  "이 기능은 로그인이 필요해요"
  [로그인] [취소]
  │          │
  │          └─ 이전 화면 유지 (아무 일 없음)
  ▼
LOGIN (로그인 화면)
  ├─ [카카오 로그인]
  ├─ [네이버 로그인]
  └─ [구글 로그인]
       │
       ▼
     소셜 인증 완료
       │
       ├─ (신규 회원) → 닉네임 입력 → 가입 완료
       │    └─ 자동 생성: meal_plan_columns ×3, recipe_books ×3
       │
       └─ (기존 회원) → 로그인 완료
            │
            ▼
          ★ return-to-action
          원래 하려던 작업으로 자동 복귀
```

### 종료 조건

- 로그인 성공 + 원래 액션 자동 수행
- 또는 [취소]로 이전 화면 복귀

### return-to-action 대상 액션

| 원래 시도한 액션   | 복귀 후 자동 수행        |
| ------------------ | ------------------------ |
| 좋아요             | 해당 레시피 좋아요 토글  |
| 저장               | 레시피북 선택 모달 열림  |
| 플래너 추가        | 날짜/끼니 선택 모달 열림 |
| 요리완료 저장      | 요리완료 처리 진행       |
| 플래너 탭 진입     | PLANNER_WEEK 진입        |
| 팬트리 탭 진입     | PANTRY 진입              |
| 마이페이지 탭 진입 | MYPAGE 진입              |

### 관련 화면

안내 모달 → `LOGIN`

---

## ③ 식단 계획 여정

> 로그인한 사용자가 이번 주 뭘 먹을지 플래너에 식사를 채워넣는 여정

### 진입 조건

- 로그인 상태
- 하단 탭 "플래너" 선택

### 플로우

```
PLANNER_WEEK (식단 플래너)
  ├─ 위아래 무한 스크롤로 주차 이동
  ├─ 끼니 컬럼 관리 ([+] 추가, 최대 5개)
  ├─ 식사 상태 뱃지 확인 (등록완료/장보기완료/요리완료)
  │
  └─ 끼니 칸 탭
       │
       ▼
     MEAL_SCREEN (끼니 화면)
       ├─ 등록된 식사 목록 확인
       ├─ 식사별 인분 조절 (+/-)
       ├─ 식사 삭제 → 삭제 확인 모달 → 삭제
       ├─ 식사 탭 → RECIPE_DETAIL (레시피 상세 조회만)
       │
       └─ [식사 추가]
            │
            ▼
          MENU_ADD (식사 추가)
            ├─ 검색창 → RECIPE_SEARCH_PICKER ─────── (③-a)
            ├─ [유튜브 링크] → YT_IMPORT ─────────── ⑨ 유튜브 등록
            ├─ [레시피북에서] → 레시피북 선택 ────────── (③-b)
            ├─ [남은요리에서] → 남은요리 선택 ─────────── (③-c)
            ├─ [팬트리만 이용] → 필터링 결과 ────────── (③-d)
            └─ 직접 등록 → MANUAL_RECIPE_CREATE ──── ⑩ 직접 등록
```

> **정책 유지**: MEAL_SCREEN에서는 개별 식사의 [요리하기] 버튼 없음.
>
> 요리는 **플래너 상단 [요리하기]** 또는 **레시피 상세 [요리하기]** 에서만 진입.

### ③-a. 검색해서 추가

```
RECIPE_SEARCH_PICKER
  │ 검색 입력 → 결과 리스트
  │ 레시피 선택
  │    ▼
  │ 계획 인분 입력 모달
  │    ▼
  └─ Meal 생성 (status='registered') → MEAL_SCREEN 복귀
```

### ③-b. 레시피북에서 추가

```
레시피북 목록 → 레시피 선택 → 계획 인분 입력 → Meal 생성 → MEAL_SCREEN 복귀
```

### ③-c. 남은요리에서 추가

```
남은요리 리스트 → 선택 → 계획 인분 입력
  → Meal 생성 (status='registered', is_leftover=true, leftover_dish_id 세팅)
  → MEAL_SCREEN 복귀
```

### ③-d. 팬트리만 이용

```
팬트리 보유 재료 기반 레시피 필터링/스코어링 → 결과 리스트
  → 레시피 선택 → 계획 인분 입력 → Meal 생성 → MEAL_SCREEN 복귀
```

### 종료 조건

- 식사가 1개 이상 등록된 상태로 PLANNER_WEEK 복귀
- 등록된 Meal: status='registered'

### 관련 화면

`PLANNER_WEEK` → `MEAL_SCREEN` → `MENU_ADD` → `RECIPE_SEARCH_PICKER` / `YT_IMPORT` / `MANUAL_RECIPE_CREATE`

### 데이터 변화

| 시점                      | 테이블                                    | 변화                                             |
| ------------------------- | ----------------------------------------- | ------------------------------------------------ |
| 식사 추가                 | meals                                     | INSERT (status='registered')                     |
| 남은요리에서 추가         | meals                                     | INSERT (is_leftover=true, leftover_dish_id 세팅) |
| 인분 변경                 | meals                                     | UPDATE planned_servings                          |
| 식사 삭제                 | meals                                     | DELETE                                           |
| 레시피 등록 (직접/유튜브) | recipes, recipe_ingredients, recipe_steps | INSERT                                           |

---

## ④ 장보기 여정 `v1.2 변경`

> 식단이 완성된 사용자가 장볼 재료를 확인하고, 순서를 정리하고, 제외 재료를 관리하고, 완료 후 팬트리 반영까지 처리하는 여정

### 진입 조건

- 로그인 상태
- PLANNER_WEEK에 `status='registered' AND shopping_list_id IS NULL` 식사가 1개 이상 존재
- 플래너 상단 [장보기] 버튼 클릭

### 플로우

```
PLANNER_WEEK → [장보기]
  │
  ▼
SHOPPING_FLOW Step A) 대상 자동 취합
  │ 범위: 오늘 ~ 마지막 등록일
  │ 대상: status='registered' AND shopping_list_id IS NULL
  │ 레시피별 계획 인분 합산
  │
  ▼
Step B) 레시피 선택/해제
  │ 체크로 포함/제외 가능
  │ (해제된 레시피의 meals는 이번 장보기에서 제외)
  │
  ▼
Step C) 장보기 기준 인분 오버라이드
  │ 각 레시피별 +/- 로 인분 조정 가능
  │ (기본값 = planned_servings_total)
  │
  ▼
[장보기 목록 만들기]
  │
  │ ⚠️ 이 시점에:
  │   shopping_lists 생성
  │   shopping_list_recipes 생성
  │   shopping_list_items 생성
  │   팬트리 보유 재료는 is_pantry_excluded=true 자동 세팅
  │   선택된 meals에 shopping_list_id 미리 세팅
  │   (status는 registered 유지)
  │
  ▼
SHOPPING_DETAIL (장보기 리스트 상세)로 자동 이동
  │
  ├─ [구매 섹션]
  │    ├─ 카드형 아이템 리스트
  │    ├─ 왼쪽 체크박스 = 구매 완료
  │    ├─ 드래그&드롭으로 순서 변경
  │    └─ 아래로 이동 시 팬트리 제외 섹션으로 보냄
  │
  ├─ [팬트리 제외 섹션]
  │    ├─ 팬트리에 있어 자동 제외된 재료
  │    ├─ 위로 이동 시 구매 섹션으로 복귀
  │    └─ 제외 섹션에 들어가면 is_checked=false 자동 정리
  │
  ├─ [공유]
  │    └─ 텍스트 체크리스트 공유
  │       (is_pantry_excluded=false 항목만 포함)
  │
  └─ [장보기 완료]
       │
       ▼
     "팬트리에 추가할 아이템" 팝업
       │
       │ 표시 대상:
       │   구매 체크된 아이템(is_checked=true) 중
       │   제외 섹션이 아닌 항목(is_pantry_excluded=false)
       │
       ├─ 기본 전체 선택
       ├─ 체크 해제로 팬트리 추가 제외 가능
       ├─ [팬트리에 추가]
       └─ [추가 안 함]
            │
            ▼
          ┌────────────────────────────────────┐
          │ shopping_lists.is_completed = true │
          │ meals.status: registered           │
          │   → shopping_done                  │
          │                                    │
          │ 선택된 item만 pantry_items INSERT   │
          │ + shopping_list_items              │
          │   .added_to_pantry = true          │
          └────────────────────────────────────┘
            │
            ▼
          PLANNER_WEEK 복귀
          (대상 식사 뱃지가 "장보기 완료"로 변경)
```

### 장보기 상세 화면 동작 원칙

- **구매 섹션 ↔ 팬트리 제외 섹션** 간 이동 가능
- **팬트리 제외 섹션으로 이동 시** 해당 item은 자동으로 `is_checked=false`
- **드래그 순서 변경 결과는 서버 저장** → 재진입 시 그대로 유지
- **장보기 완료 후 리스트는 read-only**
  - 이후 8-4(체크/제외 토글), 8-4b(순서 변경) 불가
  - 장보기 기록 재열람 시에도 수정 불가

### 종료 조건

- [장보기 완료] 클릭 → 대상 meals가 `shopping_done` 상태
- 또는 중간 이탈
  - 미완료 리스트는 저장된 상태로 남아 이후 다시 진입 가능
  - 완료된 리스트는 기록용 read-only

### 관련 화면

`PLANNER_WEEK` → `SHOPPING_FLOW` → `SHOPPING_DETAIL` → `PLANNER_WEEK`

### 데이터 변화

| 시점           | 테이블                | 변화                                                                 |
| -------------- | --------------------- | -------------------------------------------------------------------- |
| 목록 생성      | shopping_lists        | INSERT                                                               |
| 목록 생성      | shopping_list_recipes | INSERT                                                               |
| 목록 생성      | shopping_list_items   | INSERT (`is_pantry_excluded`, `sort_order`, `added_to_pantry=false`) |
| 목록 생성      | meals                 | UPDATE shopping_list_id (미리 세팅)                                  |
| 체크/제외 변경 | shopping_list_items   | UPDATE `is_checked`, `is_pantry_excluded`                            |
| 순서 변경      | shopping_list_items   | UPDATE `sort_order`                                                  |
| 장보기 완료    | meals                 | UPDATE status → `shopping_done`                                      |
| 장보기 완료    | pantry_items          | INSERT (선택된 item만)                                               |
| 장보기 완료    | shopping_list_items   | UPDATE `added_to_pantry=true` (선택된 item만)                        |
| 장보기 완료    | shopping_lists        | UPDATE `is_completed=true`                                           |

---

## ⑤ 요리하기 여정 (플래너 경유)

> 장을 본 사용자가 플래너에서 요리할 레시피를 하나 골라서 요리모드로 요리하는 여정

### 진입 조건

- 로그인 상태
- PLANNER_WEEK에 `status='shopping_done'` 식사가 1개 이상 존재
- 플래너 상단 [요리하기] 버튼 클릭

### 플로우

```
PLANNER_WEEK → [요리하기]
  │
  ▼
COOK_READY_LIST (요리하기 준비 리스트)
  │ 범위: 오늘 ~ 마지막 등록일
  │ 대상: status='shopping_done' 식사만
  │ 레시피별 인분 합산 → 리스트 구성
  │
  │ 레시피 카드 리스트:
  │   레시피명 + 합산 인분 + [요리하기]
  │
  └─ 레시피 카드에서 [요리하기] 클릭
       │
       │ cooking_sessions 생성 (레시피 1개 단위)
       │ 해당 레시피의 shopping_done meals
       │   → cooking_session_meals INSERT (스냅샷)
       │
       ▼
     COOK_MODE (요리모드 — 전체화면)
       │
       ├─ (좌) 재료 화면
       │    조리 인분 (읽기 전용)
       │    재료 전체 목록 + 수량/단위
       │
       ├─ (우) 과정 화면
       │    스텝 카드 리스트
       │    카드: 스텝번호 + 조리방법(색상) + 재료/양 + 불세기 + 시간
       │
       ├─ [취소]
       │    → cooking_sessions.status = 'cancelled'
       │    → 상태 변경 없이 COOK_READY_LIST 복귀
       │
       └─ [요리 완료]
            │
            ▼
          소진 재료 체크리스트 팝업
            │ (기본 체크 해제)
            │ 체크한 재료 = 팬트리에서 제거
            │
            ▼
          ┌─────────────────────────────────────────┐
          │ cooking_session_meals.is_cooked = true │
          │ cooking_sessions.status = 'completed'  │
          │                                         │
          │ 해당 meal_id들:                          │
          │   meals.status → 'cook_done'            │
          │   meals.cooked_at = now()               │
          │                                         │
          │ leftover_dishes INSERT                  │
          │ pantry_items DELETE (체크된 재료)         │
          │ recipes.cook_count += 1                 │
          └─────────────────────────────────────────┘
            │
            ▼
          COOK_READY_LIST 복귀
          (완료된 레시피는 리스트에서 사라짐)
            │
            ▼
          [리스트가 비면] PLANNER_WEEK 복귀
          [남은 레시피 있으면] 다음 레시피 선택 가능
```

### 종료 조건

- 레시피별 요리 완료 → 세션 completed → COOK_READY_LIST 복귀
- 모든 레시피 완료 시 PLANNER_WEEK 복귀
- 또는 일부만 완료 후 이탈 (미완료 meals는 `shopping_done` 유지)
- 또는 취소 → 세션 cancelled → COOK_READY_LIST 복귀

### 관련 화면

`PLANNER_WEEK` → `COOK_READY_LIST` → `COOK_MODE` → `COOK_READY_LIST` → `PLANNER_WEEK`

### 데이터 변화

| 시점            | 테이블                | 변화                                              |
| --------------- | --------------------- | ------------------------------------------------- |
| [요리하기] 클릭 | cooking_sessions      | INSERT (레시피 1개 단위, status='in_progress')    |
| [요리하기] 클릭 | cooking_session_meals | INSERT (해당 레시피의 shopping_done meals 스냅샷) |
| 요리 완료       | cooking_session_meals | UPDATE is_cooked=true                             |
| 요리 완료       | cooking_sessions      | UPDATE status='completed'                         |
| 요리 완료       | meals                 | UPDATE status → 'cook_done', cooked_at            |
| 요리 완료       | leftover_dishes       | INSERT (status='leftover')                        |
| 요리 완료       | pantry_items          | DELETE (소진 체크된 재료)                         |
| 요리 완료       | recipes               | UPDATE cook_count += 1                            |
| 취소            | cooking_sessions      | UPDATE status='cancelled'                         |

---

## ⑥ 남은요리 관리 여정

> 요리가 끝난 후 남은 음식을 관리하고, 다 먹거나 플래너에 재등록하는 여정

### 진입 조건

- 로그인 상태
- PLANNER_WEEK 상단 [남은요리] 버튼 클릭

### 플로우

```
PLANNER_WEEK → [남은요리]
  │
  ▼
LEFTOVERS (남은요리 목록)
  │ 최근순 정렬
  │ 카드: 레시피명 + 요리완료일
  │
  ├─ [다먹음]
  │    │
  │    ▼
  │  leftover_dishes.status → 'eaten'
  │  leftover_dishes.eaten_at = now()
  │  leftover_dishes.auto_hide_at = now() + 30일
  │    │
  │    ▼
  │  ATE_LIST (다먹은 목록)으로 이동
  │    ├─ [덜먹음] → status → 'leftover' 복귀
  │    └─ 30일 후 자동 숨김
  │
  └─ [플래너에 추가]
       │
       ▼
     날짜/끼니 선택 + 계획 인분 입력
       │
       ▼
     Meal 생성 (status='registered', is_leftover=true, leftover_dish_id=해당 ID)
       │
       ▼
     ★ 이 식사는 플래너에서 색상 구분 표시
```

### 종료 조건

- 남은요리 처리 완료 (다먹음 또는 플래너 재등록)
- 또는 확인만 하고 이탈

### 관련 화면

`PLANNER_WEEK` → `LEFTOVERS` ↔ `ATE_LIST`

### 데이터 변화

| 시점          | 테이블          | 변화                                                       |
| ------------- | --------------- | ---------------------------------------------------------- |
| 다먹음        | leftover_dishes | UPDATE status='eaten', eaten_at, auto_hide_at              |
| 덜먹음        | leftover_dishes | UPDATE status='leftover', eaten_at=NULL, auto_hide_at=NULL |
| 플래너 재등록 | meals           | INSERT (is_leftover=true, leftover_dish_id)                |

---

## ⑦ 팬트리 관리 여정

> 집에 있는 재료를 등록/관리하여 장보기 자동 제외 혜택을 받는 여정

### 진입 조건

- 로그인 상태
- 하단 탭 "팬트리" 선택

### 플로우

```
PANTRY (팬트리)
  │
  ├─ [재료 추가] → 직접 검색/입력 → pantry_items INSERT
  │
  ├─ [묶음 추가] → PANTRY_BUNDLE_PICKER
  │    │
  │    ▼
  │  묶음 카테고리 선택 (조미료 모음 / 야채 모음 / …)
  │    │
  │    ▼
  │  해당 묶음 재료 체크리스트
  │  집에 있는 것만 체크
  │    │
  │    ▼
  │  [팬트리에 추가] → pantry_items INSERT (체크된 것만)
  │
  ├─ [선택 삭제] → pantry_items DELETE
  │
  ├─ 검색/필터
  │
  └─ (선택) [이 재료로 레시피 보기] → HOME 재료 필터로 이동
```

### 종료 조건

- 팬트리 재료 목록 업데이트 완료
- 이후 장보기 시 팬트리 재료가 자동 제외됨

### 관련 화면

`PANTRY` → `PANTRY_BUNDLE_PICKER`

### 데이터 변화

| 시점      | 테이블       | 변화          |
| --------- | ------------ | ------------- |
| 재료 추가 | pantry_items | INSERT        |
| 묶음 추가 | pantry_items | INSERT (복수) |
| 재료 삭제 | pantry_items | DELETE        |

---

## ⑧ 독립 요리 여정 (플래너 미경유)

> 플래너를 거치지 않고 레시피 상세에서 바로 요리하는 여정

### 진입 조건

- RECIPE_DETAIL에서 [요리하기] 클릭
- 로그인 불필요 (요리모드 진입까지)

### 플로우

```
RECIPE_DETAIL → [요리하기]
  │
  │ (인분: 상세에서 마지막으로 설정한 인분)
  │
  ▼
COOK_MODE (요리모드 — 전체화면)
  │
  ├─ [취소] → RECIPE_DETAIL 복귀
  │
  └─ [요리 완료]
       │
       ├─ (비로그인) → 안내 모달 → 로그인 → return-to-action
       │
       └─ (로그인)
            │
            ▼
          소진 재료 체크리스트 팝업
            │
            ▼
          ┌──────────────────────────────────────┐
          │ leftover_dishes INSERT               │
          │ pantry_items DELETE (체크된 재료)      │
          │ recipes.cook_count += 1              │
          │                                      │
          │ ⚠️ cooking_session 생성 안 함         │
          │ ⚠️ meals 상태 변경 안 함              │
          │ (플래너 미경유이므로)                 │
          └──────────────────────────────────────┘
            │
            ▼
          RECIPE_DETAIL 복귀
```

### 종료 조건

- 요리 완료 → 남은요리 저장 + 팬트리 업데이트 → 이전 화면 복귀
- 또는 취소 → 이전 화면 복귀

### ⑤ 플래너 요리와의 차이

| 항목            | ⑤ 플래너 요리                  | ⑧ 독립 요리          |
| --------------- | ------------------------------ | -------------------- |
| 진입            | PLANNER_WEEK → COOK_READY_LIST | RECIPE_DETAIL        |
| 요리 세션       | cooking_sessions 생성          | 생성 안 함           |
| 식사 상태 전이  | meals.status → 'cook_done'     | 변경 없음            |
| 남은요리 저장   | O                              | O                    |
| 팬트리 업데이트 | O                              | O                    |
| 인분 기준       | 합산 인분(세션 기준)           | 상세에서 설정한 인분 |

### 관련 화면

`RECIPE_DETAIL` → `COOK_MODE` → `RECIPE_DETAIL`

---

## ⑨ 유튜브 레시피 등록 여정

> 유튜브 요리 영상 URL로 레시피를 자동 추출하고, 검수 후 플래너에 등록하는 여정

### 진입 조건

- 로그인 상태
- MENU_ADD에서 [유튜브 링크로 추가] 선택

### 플로우

```
MENU_ADD → [유튜브 링크로 추가]
  │
  ▼
YT_IMPORT Step 1) URL 입력
  │ 유튜브 URL 붙여넣기 + [가져오기]
  │
  ▼
Step 1.5) 레시피 영상 검증
  │ ┌──────────────────────────────────────────────┐
  │ │ 해당 유튜브 영상이 요리/레시피 영상인지 확인    │
  │ │ - 제목/설명란/카테고리/키워드 분석            │
  │ │                                              │
  │ │ (A) 레시피 영상 확인됨 → Step 2로 진행         │
  │ │ (B) 레시피 영상 아님 판정                      │
  │ │     → "이 영상은 요리 레시피가 아닌 것 같아요" │
  │ │     → [다시 입력] [그래도 진행]               │
  │ └──────────────────────────────────────────────┘
  │
  ▼
Step 2) 자동 추론 진행
  │ 단계별 Progress 표시:
  │   ① 설명란/고정댓글 파싱 ✓
  │   ② OCR ✓ / ✗
  │   ③ ASR ✓ / ✗
  │   ④ 추정 레이어 ✓ / ✗
  │
  │ + 추출 방식(extraction_methods) 표시
  │ + 미분류 조리방법은 이 단계에서 즉시 생성
  │
  ▼
Step 3) 결과 검수/수정
  │ ├─ 기본 인분 (필수, 편집 가능)
  │ ├─ 레시피명 (편집 가능)
  │ ├─ 재료 리스트 (추가/삭제/수정)
  │ └─ 스텝 리스트 (추가/삭제/수정)
  │      └─ 조리방법 자동 분류 (수동 변경 가능)
  │
  ▼
Step 4) [레시피 등록]
  │ recipes + recipe_sources + recipe_ingredients + recipe_steps INSERT
  │
  ▼
"이 끼니에 추가" → 계획 인분 입력
  │
  ▼
Meal 생성 (status='registered') → MEAL_SCREEN 복귀
```

### 종료 조건

- 레시피 등록 완료 + 플래너에 식사 추가
- 또는 검증 단계에서 "레시피 아님" → [다시 입력]으로 재시도 또는 이탈
- 또는 검수 단계에서 이탈 (레시피 미등록)

### 관련 화면

`MENU_ADD` → `YT_IMPORT` → `MEAL_SCREEN`

### 데이터 변화

| 시점            | 테이블             | 변화                              |
| --------------- | ------------------ | --------------------------------- |
| 레시피 등록     | recipes            | INSERT (source_type='youtube')    |
| 레시피 등록     | recipe_sources     | INSERT (extraction_methods, meta) |
| 레시피 등록     | recipe_ingredients | INSERT (복수)                     |
| 레시피 등록     | recipe_steps       | INSERT (복수)                     |
| 미분류 조리방법 | cooking_methods    | INSERT (is_system=false)          |
| 플래너 추가     | meals              | INSERT (status='registered')      |

---

## ⑩ 직접 레시피 등록 여정

> 사용자가 직접 레시피를 수동 입력하여 등록하고 플래너에 추가하는 여정

### 진입 조건

- 로그인 상태
- MENU_ADD에서 "직접 등록" 선택

### 플로우

```
MENU_ADD → 직접 등록
  │
  ▼
MANUAL_RECIPE_CREATE
  │ 입력:
  │   레시피명 (필수)
  │   기본 인분 (필수)
  │   재료 추가 (QUANT: 수량+단위 필수 / TO_TASTE 가능)
  │   스텝 추가 (텍스트 + 조리방법 선택)
  │
  └─ [저장]
       │
       ▼
     recipes + recipe_ingredients + recipe_steps INSERT
     (source_type='manual')
       │
       ▼
     계획 인분 입력 → Meal 생성 → MEAL_SCREEN 복귀
```

### 종료 조건

- 레시피 등록 + 플래너 식사 추가 완료

### 관련 화면

`MENU_ADD` → `MANUAL_RECIPE_CREATE` → `MEAL_SCREEN`

---

## ⑪ 레시피 저장/관리 여정 `v1.2 보완`

> 마음에 드는 레시피를 좋아요하거나 레시피북에 저장하고, 마이페이지에서 레시피북/장보기 기록을 관리하는 여정

### 진입 조건

- 로그인 상태
- RECIPE_DETAIL에서 [좋아요] 또는 [저장] 클릭
- 또는 MYPAGE 진입

### 플로우

```
RECIPE_DETAIL
  │
  ├─ [좋아요] → recipe_likes INSERT/DELETE (토글)
  │              → recipes.like_count 업데이트
  │
  └─ [저장] → 레시피북 선택 모달
       │
       ├─ 기존 레시피북 선택 → recipe_book_items INSERT
       │   (saved / custom만 저장 대상)
       │
       └─ [+ 새 레시피북] → 이름 입력 → recipe_books INSERT
            → recipe_book_items INSERT
       │
       ▼
     recipes.save_count 업데이트
```

### 마이페이지에서 관리

```
MYPAGE → 레시피북 탭
  │
  ├─ 시스템 레시피북
  │    ├─ 내가 추가한 레시피
  │    ├─ 저장한 레시피
  │    └─ 좋아요한 레시피
  │
  └─ 커스텀 레시피북
       │
       ▼
     RECIPEBOOK_DETAIL (레시피 리스트)
       ├─ 레시피 탭 → RECIPE_DETAIL
       └─ 레시피 제거
            ├─ liked 책: 좋아요 해제
            ├─ saved/custom: 책에서 제거
            └─ my_added 책: 제거 불가

MYPAGE → 장보기 기록 탭
  │
  └─ 저장된 장보기 리스트 (최신순)
       │
       ▼
     SHOPPING_DETAIL
       └─ 완료된 장보기 리스트는 read-only 재열람
```

### 종료 조건

- 좋아요/저장 완료
- 또는 마이페이지에서 레시피북/장보기 기록 확인 완료

### 관련 화면

`RECIPE_DETAIL` → 저장 모달 / `MYPAGE` → `RECIPEBOOK_DETAIL` / `SHOPPING_DETAIL`

---

## 전체 화면 ↔ 여정 매핑

| 화면 ID                 | 소속 여정                                     |
| ----------------------- | --------------------------------------------- |
| HOME                    | ① 탐색                                        |
| INGREDIENT_FILTER_MODAL | ① 탐색                                        |
| RECIPE_DETAIL           | ① 탐색, ⑧ 독립 요리, ⑪ 저장/관리              |
| LOGIN                   | ② 로그인                                      |
| PLANNER_WEEK            | ③ 식단 계획, ④ 장보기, ⑤ 요리하기, ⑥ 남은요리 |
| MEAL_SCREEN             | ③ 식단 계획                                   |
| MENU_ADD                | ③ 식단 계획                                   |
| RECIPE_SEARCH_PICKER    | ③ 식단 계획                                   |
| MANUAL_RECIPE_CREATE    | ⑩ 직접 등록                                   |
| YT_IMPORT               | ⑨ 유튜브 등록                                 |
| SHOPPING_FLOW           | ④ 장보기                                      |
| SHOPPING_DETAIL         | ④ 장보기, ⑪ 저장/관리(기록 재열람)            |
| COOK_READY_LIST         | ⑤ 요리하기                                    |
| COOK_MODE               | ⑤ 요리하기, ⑧ 독립 요리                       |
| LEFTOVERS               | ⑥ 남은요리                                    |
| ATE_LIST                | ⑥ 남은요리                                    |
| PANTRY                  | ⑦ 팬트리                                      |
| PANTRY_BUNDLE_PICKER    | ⑦ 팬트리                                      |
| MYPAGE                  | ⑪ 저장/관리                                   |
| SETTINGS                | ⑪ 저장/관리                                   |
| RECIPEBOOK_DETAIL       | ⑪ 저장/관리                                   |

---

다음으로 이어서 반영할 공식문서는 **요구사항 기준선 v1.5**가 우선입니다.
