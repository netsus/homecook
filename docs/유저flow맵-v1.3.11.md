# 유저 Flow맵 v1.3.11

상태: 공식문서
담당자: 채실장
날짜: 5월 30

> 기준 문서: 요구사항 기준선 v1.7.4 / 화면정의서 v1.5.11 / DB 설계 v1.3.10 / API 설계 v1.2.14
>
> 작성: Claude / Codex (H2 Stage 1, Baemin prototype planner contract-evolution)
>
> v1.3.10 → v1.3.11 변경: 레시피 미디어/태그 영속화 flow
> - YouTube register RPC가 세션 `thumbnail_url`을 `recipes.thumbnail_url`에 복사한다
> - YouTube/직접 등록 시 서버가 공유 태그 생성기로 `recipes.tags`를 자동 생성한다
> - 직접 등록 flow에 이미지 업로드 단계를 추가한다 (`POST /api/v1/recipes/images` → `POST /recipes`에 참조 포함)
>
> v1.3.9 → v1.3.10 변경: YouTube 섹션 라벨 영속화 flow
> - extract 결과의 ingredient/step `component_label`을 검수/등록/DB 저장까지 보존
> - RECIPE_DETAIL, COOK_MODE에서 같은 섹션 소제목 표시
> - manual recipe create와 shopping aggregation flow는 변경 없음
>
> v1.3.8 → v1.3.9 변경: Admin Foundation 내부 운영자 플로우 추가
>
> v1.3.7 → v1.3.8 변경: slice27 선행 taxonomy contract lock
> - YouTube/직접등록/팬트리/HOME 흐름의 재료 카테고리는 freeze 기간 동안 legacy 7종 label을 유지
> - 신규 ingredient taxonomy는 기존 flow를 대체하지 않고 shared mapping source / additive shadow metadata로만 해석
> - 조리방법 category는 optional additive metadata이며, 사용자 flow는 기존 label/color_key 기반 선택/표시를 유지
> - 외부 데이터는 production 직적재 없이 staging/review/approved seed gate를 거친 뒤에만 flow에 노출
>
> v1.3.6 → v1.3.7 변경: 회원 탈퇴 데이터 정리 flow
> - SETTINGS 회원 탈퇴 확인 후 사용자 개인 기록 삭제
> - 직접/유튜브 등록 레시피는 작성자 정보 없이 보존
> - 성공 후 HOME 이동, 동일 소셜 계정 재로그인 시 새 사용자 bootstrap 상태로 시작
>
> v1.3.5 → v1.3.6 변경: YT_IMPORT 미등록 재료 등록 흐름
> - YouTube 추출 검수 단계에서 unresolved / needs_review 재료에 [재료 검색으로 교체]와 [새 재료로 등록] 분기 추가
> - extract 결과의 `draft_ingredient_id`로 서버 추출 row를 안정적으로 식별
> - 새 재료 등록 성공 시 클라이언트가 현재 row를 `resolved`로 전환하고 최종 등록 흐름을 계속 진행
> - 데이터 변화에 `ingredients`, `ingredient_synonyms`, `register_youtube_ingredient(...)` RPC 추가
>
> v1.3.3 → v1.3.4 변경: PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로
> - 사용자 승인 (2026-05-18): `MEAL_SCREEN`에서 `shopping_done` 상태 개별 식사의 `[요리하기]` → `COOK_MODE` → `MEAL_SCREEN` 단축 경로 추가
> - ③ 식단 계획 여정과 ⑤ 요리하기 여정에 새 경로 반영
> - `registered` 식사는 대상 제외 — 장보기 우회 불가
> - 독립 요리(⑧)는 변경 없음
> - 신규 엔드포인트/DB 스키마 변경 없음. API v1.2.5에서 기존 `POST /cooking/sessions`의 `MEAL_SCREEN` 단일 meal 호출 패턴을 명시
>
> v1.3.2 → v1.3.3 변경: Wave1 prototype parity contract decisions
> - HOME `좋아요순` 노출을 `최신순`으로 교체하고 기본 `조회수순`은 유지
> - 저장 flow는 여러 `saved/custom` 레시피북 multi-select 저장을 지원
> - 장보기 기록 flow는 완료된 리스트를 `다시열기`로 read-only 재열람
> - 남은요리/다먹은 목록과 레시피북 상세의 카드 메타를 prototype 기준으로 확장
> - LoginGateModal visual은 prototype, return-to-action behavior는 MVP 유지
>
> v1.3.1 → v1.3.2 변경: planner column customization contract
> - 사용자 승인 (2026-05-10): 신규 사용자 기본 끼니 컬럼을 `아침 / 점심 / 저녁` 3개로 변경
> - 설정 화면에서 끼니 컬럼 이름 변경, 추가, 삭제 flow 추가
> - 삭제는 등록된 식사가 없는 컬럼만 허용하고, 최소 1개/최대 5개 정책을 적용
>
> v1.3.0 → v1.3.1 변경: PLANNER_WEEK prototype parity contract
> - 사용자 승인 (2026-04-27): `PLANNER_WEEK`의 "가로 스크롤 없음" 잠금을 제거하고 Baemin prototype planner reference를 우선 기준으로 채택
> - ③ 식단 계획 여정의 탐색 방식은 prototype reference의 스크롤/탐색 모델을 따른다
> - API/DB 계약 및 MEAL_SCREEN 진입 flow는 변경 없음
>
> v1.2.3 → v1.3.0 변경: PLANNER_WEEK day-card slot row 전환에 따른 §③ 갱신
> - 세로 스크롤 중심 탐색 명시 (가로 스크롤 없음, v1.3.1에서 planner-level 잠금은 Baemin prototype parity 기준으로 supersede됨)
> - day card 본문 레이아웃을 세로 slot row 방식으로 명시
> - 탐색 흐름 자체(③ 식단 계획 여정 flow)는 변경 없음

---

## v1.3.3 → v1.3.4 변경 체크리스트

| # | 변경 내용 | 영향 범위 | 상태 |
|---|----------|----------|------|
| 1 | `MEAL_SCREEN`에서 `shopping_done` 개별 식사 `[요리하기]` → `COOK_MODE` → `MEAL_SCREEN` 단축 경로 추가 | ③ 식단 계획, ⑤ 요리하기 | ✅ |
| 2 | `registered` 식사는 `[요리하기]` 대상에서 제외 — 장보기 우회 불가 | ③ 식단 계획, ⑤ 요리하기 | ✅ |
| 3 | 독립 요리(⑧)는 변경 없음 — cooking_session 미생성, meal 상태 미변경 유지 | ⑧ 독립 요리 | ✅ |
| 4 | 신규 엔드포인트/DB 스키마 변경 없음 — API v1.2.5에서 기존 `POST /cooking/sessions`의 `MEAL_SCREEN` 단일 meal 호출 패턴을 명시 | — | ✅ |

---

## v1.3.2 → v1.3.3 변경 체크리스트

| # | 변경 내용 | 영향 범위 | 상태 |
|---|----------|----------|------|
| 1 | HOME 정렬을 `조회수순/최신순/저장순/플래너등록순`으로 변경 | ① 탐색 | ✅ |
| 2 | 레시피 저장 모달에서 여러 레시피북 동시 저장 허용 | ⑪ 레시피 저장/관리 | ✅ |
| 3 | 장보기 완료 기록을 `다시열기`로 read-only 재열람 | ④ 장보기, ⑪ 저장/관리 | ✅ |
| 4 | 남은요리/다먹은 목록 카드 메타 확장 | ⑥ 남은요리 관리 | ✅ |
| 5 | 레시피북 상세 카드 메타 확장 | ⑪ 레시피 저장/관리 | ✅ |

---

## v1.3.1 → v1.3.2 변경 체크리스트

| # | 변경 내용 | 영향 범위 | 상태 |
|---|----------|----------|------|
| 1 | 신규 사용자 기본 끼니 컬럼을 `아침 / 점심 / 저녁` 3개로 변경 | ① 가입, ③ 식단 계획 여정 | ✅ |
| 2 | SETTINGS에서 끼니 컬럼 이름 변경/추가/삭제 flow 추가 | ⑨ 마이페이지/설정 | ✅ |
| 3 | 컬럼 삭제는 등록된 식사가 없는 경우만 허용 | ③ 식단 계획 여정, ⑨ 마이페이지/설정 | ✅ |

---

## v1.3.0 → v1.3.1 변경 체크리스트

| # | 변경 내용 | 영향 범위 | 상태 |
|---|----------|----------|------|
| 1 | `PLANNER_WEEK`의 "가로 스크롤 없음" 잠금을 제거하고 Baemin prototype planner reference를 우선 기준으로 채택 | ③ 식단 계획 여정 | ✅ |
| 2 | prototype reference와 동일한 localized scroll/swipe/peek affordance를 허용 | ③ 식단 계획 여정 | ✅ |
| 3 | API/DB 계약 및 MEAL_SCREEN 진입 flow 변경 없음 | — | ✅ |

---

## v1.2.3 → v1.3.0 변경 체크리스트

| # | 변경 내용 | 영향 범위 | 상태 |
|---|----------|----------|------|
| 1 | `PLANNER_WEEK` 탐색 방식을 세로 스크롤로 명시하고 가로 스크롤 없음을 선언 (v1.3.1에서 planner-level 잠금 supersede) | ③ 식단 계획 여정 | ✅ |
| 2 | day card 본문 레이아웃을 `세로 slot row` 방식으로 명시 | ③ 식단 계획 여정 | ✅ |
| 3 | API/DB 계약 변경 없음 — flow 자체(탐색 → MEAL_SCREEN → MENU_ADD)는 동일 | — | ✅ |

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
  ├─ 정렬 변경 (조회수순/최신순/저장순/플래너등록순)
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
       │    └─ 자동 생성: meal_plan_columns ×3(아침/점심/저녁), recipe_books ×3
       │
       └─ (기존 회원) → 로그인 완료
            │
            ▼
          ★ return-to-action
          원래 하려던 작업으로 자동 복귀
```

> LoginGateModal의 visual은 Wave1 prototype reference를 따르지만, 로그인 후 원래 작업으로 돌아오는 return-to-action 동작은 MVP flow를 유지한다.

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

## ③ 식단 계획 여정 `v1.3.0 변경`

> 로그인한 사용자가 이번 주 뭘 먹을지 플래너에 식사를 채워넣는 여정

### 진입 조건

- 로그인 상태
- 하단 탭 "플래너" 선택

### 플로우

```
PLANNER_WEEK (식단 플래너)
  ├─ 주간 범위 확인
  ├─ 요일 스트립을 좌우로 넘겨 이전 주 / 다음 주 이동
  ├─ 필요 시 [이번주로 가기]
  ├─ Baemin prototype planner reference와 동일한 스크롤/탐색 모델로 날짜 카드 탐색
  │    └─ localized horizontal scroll / swipe / peek affordance는 prototype reference와 일치하는 경우 허용
  ├─ 하루 카드 단위로 식단 확인
  │    └─ 카드 안에 사용자가 설정한 끼니 컬럼 노출
  ├─ 식사 상태 표시 확인 (등록/장보기/요리)
  │
  └─ 끼니 칸 탭
       │
       ▼
     MEAL_SCREEN (끼니 화면)
       ├─ 등록된 식사 목록 확인
       ├─ 식사별 인분 조절 (+/-)
       ├─ 식사 삭제 → 삭제 확인 모달 → 삭제
       ├─ 식사 탭 → RECIPE_DETAIL (레시피 상세 조회만)
       ├─ [요리하기] (shopping_done 식사만) → ⑤-b 개별 식사 요리 단축 경로  ← v1.3.4 추가
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

> **정책 변경 (v1.3.4)**: MEAL_SCREEN에서 `shopping_done` 상태 개별 식사에 `[요리하기]` 단축 경로를 제공한다.
>
> 요리 진입 경로:
> - **플래너 상단 [요리하기]** → `COOK_READY_LIST` → `COOK_MODE` (일괄/레시피 그룹 요리)
> - **MEAL_SCREEN 개별 식사 [요리하기]** → `COOK_MODE` (단일 식사 단축 경로, `shopping_done`만 대상) `v1.3.4 추가`
> - **레시피 상세 [요리하기]** → `COOK_MODE` (독립 요리, planner 무관)
>
> `registered` 상태 식사는 `[요리하기]` 대상이 아니며, 장보기를 거치지 않고 `cook_done`으로 전이할 수 없다.

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
| 끼니 컬럼 추가            | meal_plan_columns                         | INSERT (최대 5개)                                |
| 끼니 컬럼 이름 변경       | meal_plan_columns                         | UPDATE name                                      |
| 끼니 컬럼 삭제            | meal_plan_columns                         | DELETE (연결된 meals가 없고 최소 1개 유지)       |
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
  - 이후 체크/제외 토글, 순서 변경 불가
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
       │    component_label 소제목(있는 경우)
       │
       ├─ (우) 과정 화면
       │    스텝 카드 리스트
       │    카드: 스텝번호 + 조리방법(색상) + 재료/양 + 불세기 + 시간
       │    component_label 소제목(있는 경우)
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

### ⑤-b. MEAL_SCREEN 개별 식사 요리 단축 경로 `v1.3.4 추가`

> MEAL_SCREEN에서 `shopping_done` 상태인 개별 식사를 직접 요리하는 단축 경로

```
MEAL_SCREEN → 개별 식사 [요리하기] (shopping_done만)
  │
  │ cooking_sessions 생성 (meal 1건 단위)
  │ cooking_session_meals INSERT (선택 meal 1건)
  │
  ▼
COOK_MODE (요리모드 — 전체화면)
  │
  ├─ [취소]
  │    → cooking_sessions.status = 'cancelled'
  │    → 상태 변경 없이 MEAL_SCREEN 복귀
  │
  └─ [요리 완료]
       │
       ▼
     소진 재료 체크리스트 팝업
       │
       ▼
     ┌─────────────────────────────────────────┐
     │ cooking_session_meals.is_cooked = true │
     │ cooking_sessions.status = 'completed'  │
     │                                         │
     │ 선택 meal 1건:                           │
     │   meals.status → 'cook_done'            │
     │   meals.cooked_at = now()               │
     │                                         │
     │ leftover_dishes INSERT                  │
     │ pantry_items DELETE (체크된 재료)         │
     │ recipes.cook_count += 1                 │
     └─────────────────────────────────────────┘
       │
       ▼
     MEAL_SCREEN 복귀
     (해당 식사 뱃지가 "요리 완료"로 변경)
```

**대상 제한**: `registered` 상태 식사에는 `[요리하기]`를 노출하지 않는다. 장보기를 우회하여 `cook_done`으로 전이할 수 없다.

**독립 요리(⑧)와의 차이**: 이 경로는 `cooking_session`을 생성하고 `meals.status`를 전이하는 **planner 세션 단축 경로**이다. 독립 요리는 `cooking_session`을 생성하지 않으며 `meals.status`를 변경하지 않는다.

### 종료 조건

- 레시피별 요리 완료 → 세션 completed → COOK_READY_LIST 복귀
- 모든 레시피 완료 시 PLANNER_WEEK 복귀
- 또는 일부만 완료 후 이탈 (미완료 meals는 `shopping_done` 유지)
- 또는 취소 → 세션 cancelled → COOK_READY_LIST 복귀
- MEAL_SCREEN 개별 요리: 완료 → MEAL_SCREEN 복귀 / 취소 → MEAL_SCREEN 복귀 `v1.3.4 추가`

### 관련 화면

`PLANNER_WEEK` → `COOK_READY_LIST` → `COOK_MODE` → `COOK_READY_LIST` → `PLANNER_WEEK`
`MEAL_SCREEN` → `COOK_MODE` → `MEAL_SCREEN` `v1.3.4 추가`

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

> 위 데이터 변화는 COOK_READY_LIST 경유와 MEAL_SCREEN 개별 경유 모두 동일하다. 차이는 세션에 포함되는 meal 수(일괄 vs 1건)뿐이다. `v1.3.4 참고`

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
  │ 카드: 레시피명 + 썸네일 + 요리완료일 + 끼니명 + 요리 인분
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

> YouTube 등록 레시피의 `component_label`은 독립 요리 COOK_MODE에서도 유지된다. 재료/스텝 목록은 기존 순서를 유지하고 인접 label이 바뀌는 지점에만 소제목을 표시한다.

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

## ⑨ 유튜브 레시피 등록 여정 `v1.3 contract-evolution`

> 유튜브 요리 영상 URL로 레시피를 자동 추출하고, 검수 후 플래너에 등록하는 여정.
> 슬라이스 20에서 실제 YouTube Data API description-first 추출, 3-way classification, 서버 세션, 원자적 RPC 등록으로 확장.

### 진입 조건

- 로그인 상태
- feature flag `youtube_import` on (off → 404 FEATURE_DISABLED)
- MENU_ADD에서 [유튜브 링크로 추가] 선택

### 플로우

```
MENU_ADD → [유튜브 링크로 추가]
  │
  ▼
YT_IMPORT Step 1) URL 입력
  │ 유튜브 URL 붙여넣기 + [가져오기]
  │ → POST /recipes/youtube/validate
  │
  ▼
Step 1.5) 3-way Classification 결과
  │ ┌──────────────────────────────────────────────────┐
  │ │ YouTube oEmbed → title/channel/thumbnail 미리보기   │
  │ │ classification_status=uncertain                     │
  │ │ → Step 2로 진행                                    │
  │ └──────────────────────────────────────────────────┘
  │
  ▼
Step 2) 공개 텍스트 우선 추출
  │ → POST /recipes/youtube/extract
  │ YouTube videos.list API → description/tags/category 분석
  │ recipe/uncertain/non_recipe 판정 (non_recipe → 422 차단)
  │ 서버: youtube_extraction_sessions 생성 (status=draft, 24h TTL)
  │ 설명란 파싱 → 부족하면 공개 작성자 댓글 → 부족하면 공개 caption timedtext 파싱
  │ 재료/스텝 섹션명은 component_label로 응답
  │ extraction_methods: ["description"], ["comment"], ["caption"] 또는 조합
  │ 미분류 조리방법은 이 단계에서 즉시 생성
  │ UI: indeterminate spinner/progress
  │
  ▼
Step 3) 결과 검수/수정
  │ ├─ 레시피명 (편집 가능)
  │ ├─ 기본 인분 (필수, 편집 가능)
  │ ├─ 재료 리스트 (추가/삭제/수정)
  │ │    ├─ component_label 보존, 인접 label 변경 지점에 소제목 표시
  │ │    └─ resolution_status: resolved / needs_review / unresolved
  │ │         각 서버 추출 row는 draft_ingredient_id 보유
  │ │         needs_review → 경고 배지, candidate 선택/검색 교체/새 재료 등록 전 저장 차단
  │ │         unresolved  → 에러 배지, 검색 교체 또는 새 재료 등록 전 저장 차단
  │ │
  │ │         [재료 검색으로 교체]
  │ │            → GET /ingredients 검색 → 기존 표준 재료 선택 → row resolved
  │ │
  │ │         [새 재료로 등록]
  │ │            → 표준명/legacy 7종 카테고리/동의어 확인
  │ │            → POST /recipes/youtube/ingredient-registration
  │ │            → 서버: 소유권 + draft_ingredient_id 검증
  │ │            → RPC register_youtube_ingredient
  │ │            → 응답 ingredient_id / standard_name으로 client row resolved
  │ ├─ 스텝 리스트 (추가/삭제/수정)
  │ │    ├─ component_label 보존, 인접 label 변경 지점에 소제목 표시
  │ │    └─ is_incomplete / missing_fields 표시
  │ │         blocking (instruction, cooking_method) → 빈값 시 저장 차단
  │ │         warning  (duration, ingredients_used) → 빈값 시 경고만
  │ └─ 조리방법 자동 분류 (수동 변경 가능, is_new 라벨)
  │
  │ 저장 활성화: 모든 재료 resolved + blocking incomplete=0
  │
  ▼
Step 4) [레시피 등록]
  │ → POST /recipes/youtube/register (extraction_id 기반)
  │ 서버: RPC register_youtube_recipe_from_session
  │   - 소유권 검증 (cross-user → 404, expired → 410, consumed → 409)
  │   - 원자적 INSERT: recipes + recipe_sources + recipe_ingredients + recipe_steps
  │   - recipes.thumbnail_url ← 세션 thumbnail_url 복사 (클라이언트 오버라이드 불가) `v1.3.11 추가`
  │   - recipes.tags ← 서버 태그 생성기 결과 저장 `v1.3.11 추가`
  │   - recipe_ingredients.component_label / recipe_steps.component_label 저장
  │   - Provenance: session에서 복사 (client body 아님)
  │   - session status → consumed
  │
  ▼
"이 끼니에 추가" → 계획 인분 입력
  │
  ▼
Meal 생성 (status='registered') → MEAL_SCREEN 복귀
```

### Quick Import 분기: `/recipes/new/youtube` `2026-05-28 addendum`

```
/recipes/new/youtube
  │ URL 붙여넣기 또는 추천 영상 선택
  │ → GET /recipes/youtube/recipio/check
  │
  ├─ duplicate
  │    └─ 저장된 레시피 카드 표시 → /recipes/{recipe_id}
  │
  └─ not duplicate
       │ → POST /recipes/youtube/validate
       │ → oEmbed 미리보기 표시
       │ → POST /recipes/youtube/extract
       │
       ├─ 자동 등록 가능
       │    └─ POST /recipes/youtube/register → /recipes/{recipe_id}
       │
       └─ 검수 필요
            └─ /menu/add/youtube?youtubeUrl=... 로 이동해 기존 Step 3 검수 계속
```

- 자동 등록 가능 조건은 모든 재료 `resolved` + blocking step field 없음 + 기존 register validation 통과다.
- duplicate 분기에서는 extract/register를 호출하지 않는다.
- 진행률은 화면 상태 표시이며 서버-side job/status 계약을 새로 만들지 않는다.
- `non_recipe`, provider error, quota error는 자동 등록하지 않고 재입력/오류 안내를 표시한다.

### 종료 조건

- 레시피 등록 완료 + 플래너에 식사 추가
- 또는 classification에서 `non_recipe` → [다시 입력]으로 재시도 또는 이탈
- 또는 `uncertain` 경고에서 이탈
- 또는 검수 단계에서 이탈 (세션은 24h 후 만료)

### 관련 화면

`MENU_ADD` → `YT_IMPORT` → `MEAL_SCREEN`

### 데이터 변화

| 시점 | 테이블 | 변화 |
| --- | --- | --- |
| 추출 시 | youtube_extraction_sessions | INSERT (status='draft', expires_at=now+24h) |
| 미분류 조리방법 | cooking_methods | INSERT (is_system=false) |
| 미등록 재료 등록 (RPC) | ingredients | INSERT 또는 기존 standard_name row 재사용 |
| 미등록 재료 등록 (RPC) | ingredient_synonyms | optional INSERT, ambiguous synonym은 skip |
| 레시피 등록 (RPC) | recipes | INSERT (source_type='youtube', thumbnail_url=세션값, tags=생성기결과) `v1.3.11` |
| 레시피 등록 (RPC) | recipe_sources | INSERT (youtube_extraction_session_id FK, provenance from session) |
| 레시피 등록 (RPC) | recipe_ingredients | INSERT (복수) |
| 레시피 등록 (RPC) | recipe_steps | INSERT (복수) |
| 레시피 등록 (RPC) | youtube_extraction_sessions | UPDATE status='consumed' |
| 플래너 추가 | meals | INSERT (status='registered') |

> 재료 카테고리는 freeze 기간 동안 legacy 7종 label을 유지한다. 외부 데이터 raw row는 이 flow에서 production ingredient로 자동 승격되지 않으며, 별도 staging/review/approved seed gate를 거친 뒤에만 검색/매칭 대상이 된다.

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
  │   이미지 (선택) → POST /api/v1/recipes/images 로 즉시 업로드 `v1.3.11 추가`
  │   레시피명 (필수)
  │   기본 인분 (필수)
  │   재료 추가 (QUANT: 수량+단위 필수 / TO_TASTE 가능)
  │   스텝 추가 (텍스트 + 조리방법 선택)
  │
  └─ [저장]
       │
       ▼
     POST /recipes (thumbnail_url=업로드된 이미지 참조 또는 미전달)
     recipes + recipe_ingredients + recipe_steps INSERT
     (source_type='manual', thumbnail_url=업로드값, tags=생성기결과) `v1.3.11`
       │
       ▼
     계획 인분 입력 → Meal 생성 → MEAL_SCREEN 복귀
```

### 종료 조건

- 레시피 등록 + 플래너 식사 추가 완료

### 관련 화면

`MENU_ADD` → `MANUAL_RECIPE_CREATE` → `MEAL_SCREEN`

### 데이터 변화 `v1.3.11 추가`

| 시점 | 테이블 | 변화 |
| --- | --- | --- |
| 이미지 업로드 | Supabase Storage (`recipe-images`) | 사용자별 경로에 파일 저장 |
| 레시피 저장 | recipes | INSERT (source_type='manual', thumbnail_url=업로드URL 또는 null, tags=생성기결과) |
| 레시피 저장 | recipe_ingredients | INSERT (복수) |
| 레시피 저장 | recipe_steps | INSERT (복수) |
| 플래너 추가 | meals | INSERT (status='registered') |

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
       ├─ 기존 레시피북 여러 개 선택 → recipe_book_items INSERT
       │   (saved / custom만 저장 대상, 이미 저장된 책은 건너뜀)
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
       ├─ 카드: 태그 + 조회수 + 조리시간 + 기본 인분
       ├─ 레시피 탭 → RECIPE_DETAIL
       └─ 레시피 제거
            ├─ liked 책: 좋아요 해제
            ├─ saved/custom: 책에서 제거
            └─ my_added 책: 제거 불가

MYPAGE → 장보기 기록 탭
  │
  └─ 저장된 장보기 리스트 (최신순)
       │
       ├─ 완료 시각 표시
       ├─ 완료된 리스트 [다시열기]
       │
       ▼
     SHOPPING_DETAIL
       └─ 완료된 장보기 리스트는 read-only 재열람

MYPAGE → SETTINGS
  │
  ├─ 요리모드 화면 꺼짐 방지 토글
  │
  ├─ 끼니 컬럼 관리
  │    ├─ 이름 변경 → meal_plan_columns.name UPDATE
  │    ├─ 컬럼 추가 → 최대 5개까지 meal_plan_columns INSERT
  │    └─ 컬럼 삭제 → 연결된 meals가 없고 최소 1개가 남을 때만 DELETE
  │
  └─ 닉네임 변경 / 로그아웃 / 회원탈퇴
       └─ 회원탈퇴 확인
            ├─ 레시피북/플래너/장보기/팬트리/좋아요/남은요리 등 개인 기록 삭제
            ├─ 직접/유튜브 등록 레시피는 recipes.created_by = null 상태로 보존
            ├─ HOME 이동
            └─ 같은 소셜 계정 재로그인 시 새 사용자 bootstrap 상태
```

### 종료 조건

- 좋아요/저장 완료
- 또는 마이페이지에서 레시피북/장보기 기록/설정 변경 완료

### 관련 화면

`RECIPE_DETAIL` → 저장 모달 / `MYPAGE` → `RECIPEBOOK_DETAIL` / `SHOPPING_DETAIL`

---

## ⑫ 내부 운영 관리 (Admin Foundation)

> 내부 운영자 전용 플로우 — 일반 사용자에게는 노출되지 않음

### 사전 조건

- 운영자가 일반 사용자로서 OAuth 로그인 완료 상태
- `admin_members` 테이블에 해당 user_id가 등록되어 있음
- 최초 admin 등록은 Supabase SQL 또는 service-role API로 직접 수행

### 플로우

1. **관리 대시보드 진입** (`/admin`)
   - OAuth 인증 확인 → admin_members 조회
   - 미등록 시 → 403 Forbidden (fail closed)
   - 성공 시 → `admin_page_view` 감사 로그 기록 → 대시보드 표시
   - 대시보드: 사용자 통계 요약, 운영 이벤트 요약, 각 관리 화면 링크

2. **사용자 목록 조회** (`/admin/users`)
   - 사용자 목록 테이블 표시 (승인된 요약 정보만)
   - 표시 항목: user id, 마스킹된 이메일, provider, nickname, created_at, 고수준 카운트/상태
   - 검색/필터 가능 (검색어는 로그에 기록하지 않음)
   - 페이지네이션 지원
   - API: `GET /api/v1/admin/users` → 감사 로그 기록

3. **운영 이벤트 조회** (`/admin/events`)
   - 시스템 운영 이벤트 목록 표시
   - 필터: event_type, severity, source, 날짜 범위
   - 이벤트 상세 보기 (metadata_json 포함)
   - 페이지네이션 지원
   - API: `GET /api/v1/admin/operational-events` → 감사 로그 기록

4. **감사 로그 조회** (`/admin/audit-logs`)
   - 관리자 행위 감사 로그 목록 표시
   - 필터: action, actor, target_type, 날짜 범위
   - 페이지네이션 지원
   - API: `GET /api/v1/admin/audit-logs` → 감사 로그 기록

### 에러 처리

- 인증 실패 → 로그인 페이지로 리다이렉트
- admin_members 미등록 → 403 Forbidden (제어된 에러)
- service-role 부재 → 제어된 서버 에러 (fail closed)
- API 에러 → 에러 상태 표시 (기존 `{ success, data, error }` 래퍼 형식)

### 관련 화면

`ADMIN_DASHBOARD` → `ADMIN_USERS` / `ADMIN_EVENTS` / `ADMIN_AUDIT_LOGS`

---

## 전체 화면 ↔ 여정 매핑

| 화면 ID                 | 소속 여정                                     |
| ----------------------- | --------------------------------------------- |
| HOME                    | ① 탐색                                        |
| INGREDIENT_FILTER_MODAL | ① 탐색                                        |
| RECIPE_DETAIL           | ① 탐색, ⑧ 독립 요리, ⑪ 저장/관리              |
| LOGIN                   | ② 로그인                                      |
| PLANNER_WEEK            | ③ 식단 계획, ④ 장보기, ⑤ 요리하기, ⑥ 남은요리 |
| MEAL_SCREEN             | ③ 식단 계획, ⑤ 요리하기(개별 단축) `v1.3.4`  |
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
| ADMIN_DASHBOARD         | ⑫ 내부 운영 관리                               |
| ADMIN_USERS             | ⑫ 내부 운영 관리                               |
| ADMIN_EVENTS            | ⑫ 내부 운영 관리                               |
| ADMIN_AUDIT_LOGS        | ⑫ 내부 운영 관리                               |
