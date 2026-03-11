# DB 설계 v1.3

상태: 공식문서
담당자: 채실장
날짜: 3월 9

> 기준 문서: 요구사항 기준선 v1.6 / 화면정의서 v1.2 / API 설계 v1.2.1 / 유저 Flow맵 v1.2
> 
> 
> 작성: 킴실장
> 
> 리뷰: 채실장
> 
> 원칙: **기획(요구사항/화면정의서) ↔ Flow ↔ API ↔ DB가 같은 말을 하도록 유지**
> 

---

## v1.2 → v1.3 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | 장보기 상세에서 카드 드래그&드롭 순서 저장 필요 | **shopping_list_items.sort_order 추가** |
| B | 장보기 완료 후 리스트 read-only 정책 필요 | **shopping_lists.is_completed / completed_at 기준 정책 명시** + 완료 후 item 수정 금지 정책 문서화 |
| C | 장보기 완료 시 팬트리 반영을 선택적으로 분리 | **shopping_list_items.added_to_pantry 의미 명확화** (실제 INSERT 여부와 별개로 “반영 처리됨” 표시) |
| D | 팬트리 제외 섹션 이동 시 체크 자동 해제 필요 | **shopping_list_items CHECK/업데이트 정책 보강** |
| E | cooking_methods의 미배정 색상 처리 필요 | **color_key DEFAULT 'unassigned'** 반영 |
| F | users 소프트 삭제 후 재가입/복구 충돌 방지 | **부분 유니크 인덱스(partial unique index)** 로 정리 |
| G | 상태/시간/양수 제약 보강 | CHECK/INDEX 보강 (`completed_at`, `cooked_at`, 양수 인분 등) |
| H | 시스템 레시피북 id는 uuid로 유지, 구분은 book_type으로만 | DB 원칙 명시 (기존 구조 유지, 문서 정합화) |

---

## ERD 요약 (핵심 관계)

```
users ─┬─< meals >── meal_plan_columns
       │      │  └──> recipes ─┬─< recipe_ingredients ──> ingredients
       │      │                ├─< recipe_steps ──> cooking_methods
       │      │                └── recipe_sources
       │      ├──> shopping_lists
       │      ├──> leftover_dishes
       │      └──< cooking_session_meals >── cooking_sessions
       │
       ├─< pantry_items ──> ingredients
       ├─< shopping_lists ─┬─< shopping_list_items ──> ingredients
       │                   └─< shopping_list_recipes ──> recipes
       ├─< cooking_sessions ─< cooking_session_meals ──> meals
       ├─< leftover_dishes ──> recipes
       ├─< recipe_books ─< recipe_book_items ──> recipes
       └─< recipe_likes ──> recipes

ingredients ─< ingredient_synonyms
ingredient_bundles ─< ingredient_bundle_items ──> ingredients
cooking_methods (독립 마스터 테이블)
```

---

# 1. 사용자 (Users)

## 1-1. users

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| nickname | varchar(30) | NOT NULL | 닉네임 |
| email | varchar(255) | nullable | 소셜 로그인에서 받아옴 |
| profile_image_url | text | nullable | 프로필 이미지 |
| social_provider | enum | NOT NULL | `kakao` / `naver` / `google` |
| social_id | varchar(255) | NOT NULL | 소셜 고유 ID |
| settings_json | jsonb | NOT NULL, DEFAULT '{}' | 유저 설정 (예: `screen_wake_lock`) |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |
| deleted_at | timestamptz | nullable | 소프트 삭제(회원 탈퇴) |

### UNIQUE / INDEX 정책

> **v1.3 변경**: 소프트 삭제 후 재가입/복구 충돌 방지를 위해 일반 UNIQUE 제약 대신 **활성 사용자 기준 부분 유니크 인덱스** 사용
> 

```
CREATEUNIQUE INDEX users_social_unique_active
ON users (social_provider, social_id)
WHERE deleted_atISNULL;

CREATEUNIQUE INDEX users_email_unique_active
ON users (email)
WHERE deleted_atISNULLAND emailISNOTNULL;
```

---

# 2. 재료 마스터 (Ingredients)

## 2-1. ingredients

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| standard_name | varchar(100) | NOT NULL, UNIQUE | 정규화된 재료명 |
| category | varchar(50) | NOT NULL | 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 |
| default_unit | varchar(20) | nullable | 기본 단위 (g, ml, 개 등) |
| created_at | timestamptz | NOT NULL |  |

## 2-2. ingredient_synonyms

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| ingredient_id | uuid | FK → ingredients |  |
| synonym | varchar(100) | NOT NULL | 동의어 |
- **UNIQUE**: `(ingredient_id, synonym)`

> 운영 정책상 synonym 중복 매핑을 엄격히 막으려면 `UNIQUE (synonym)` 도입 검토 가능하나, MVP에서는 `(ingredient_id, synonym)` 유지.
> 

## 2-3. ingredient_bundles

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| name | varchar(50) | NOT NULL | 예: 조미료 모음, 야채 모음 |
| display_order | int | NOT NULL, DEFAULT 0 | 노출 순서 |

## 2-4. ingredient_bundle_items

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| bundle_id | uuid | FK → ingredient_bundles |  |
| ingredient_id | uuid | FK → ingredients |  |
- **UNIQUE**: `(bundle_id, ingredient_id)`

---

# 3. 조리방법 마스터 (Cooking Methods)

## 3-1. cooking_methods

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| code | varchar(20) | NOT NULL, UNIQUE | 시스템 코드 (예: `stir_fry`) |
| label | varchar(5) | NOT NULL | 한글 라벨 5글자 이내 |
| color_key | varchar(20) | NOT NULL, DEFAULT `'unassigned'` | 프론트 색상 매핑 키 |
| is_system | boolean | NOT NULL, DEFAULT true | 시스템 기본값 여부 |
| display_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| created_at | timestamptz | NOT NULL |  |

> **v1.3 변경**
> 
> - `color_key`는 NULL 허용 대신 **DEFAULT `'unassigned'`** 로 통일
> - 프론트는 `unassigned`를 회색 fallback으로 처리

### 시스템 기본 데이터(seed)

| code | label | color_key |
| --- | --- | --- |
| stir_fry | 볶기 | orange |
| boil | 끓이기 | red |
| deep_fry | 튀기기 | yellow |
| steam | 찌기 | blue |
| grill | 굽기 | brown |
| blanch | 데치기 | lime |
| mix | 무치기 | green |
| prep | 손질 | gray |

---

# 4. 레시피 (Recipes)

## 4-1. recipes

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| title | varchar(200) | NOT NULL | 레시피명 |
| description | text | nullable | 설명 |
| thumbnail_url | text | nullable | 썸네일 |
| base_servings | int | NOT NULL, DEFAULT 2 | 기본 인분 |
| tags | text[] | NOT NULL, DEFAULT '{}' | 태그 배열 |
| source_type | enum | NOT NULL | `system` / `youtube` / `manual` |
| created_by | uuid | FK → users, nullable | 직접/유튜브 등록자 |
| view_count | int | NOT NULL, DEFAULT 0 | 조회수 |
| like_count | int | NOT NULL, DEFAULT 0 | 좋아요 수 |
| save_count | int | NOT NULL, DEFAULT 0 | 저장 수(비정규화) |
| plan_count | int | NOT NULL, DEFAULT 0 | 플래너 등록 수 |
| cook_count | int | NOT NULL, DEFAULT 0 | 요리완료 수 |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

### CHECK

```
CHECK (base_servings>0)
CHECK (view_count>=0AND like_count>=0AND save_count>=0AND plan_count>=0AND cook_count>=0)
```

## 4-2. recipe_sources

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| recipe_id | uuid | FK → recipes, UNIQUE | 1:1 |
| youtube_url | text | nullable | 유튜브 원본 URL |
| youtube_video_id | varchar(20) | nullable | 영상 ID |
| extraction_methods | text[] | NOT NULL, DEFAULT '{}' | `description`, `ocr`, `asr`, `estimation`, `manual` |
| extraction_meta_json | jsonb | NOT NULL, DEFAULT '{}' | 단계별 메타 |
| raw_extracted_text | text | nullable | 원본 추출 텍스트 |

## 4-3. recipe_ingredients

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| recipe_id | uuid | FK → recipes |  |
| ingredient_id | uuid | FK → ingredients |  |
| amount | decimal(10,2) | nullable | 수량 |
| unit | varchar(20) | nullable | 단위 |
| ingredient_type | enum | NOT NULL | `QUANT` / `TO_TASTE` |
| display_text | varchar(200) | nullable | 표시용 원문 |
| sort_order | int | NOT NULL, DEFAULT 0 | 순서 |
| scalable | boolean | NOT NULL, DEFAULT true | 인분 비례 여부 |

### CHECK

```
CHECK (
  (ingredient_type='QUANT'AND amountISNOTNULLAND amount>0AND unitISNOTNULL)
OR
  (ingredient_type='TO_TASTE'AND amountISNULLAND unitISNULLAND scalable=false)
)
```

## 4-4. recipe_steps

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| recipe_id | uuid | FK → recipes |  |
| step_number | int | NOT NULL | 순서 |
| instruction | text | NOT NULL | 조리 설명 |
| cooking_method_id | uuid | FK → cooking_methods, NOT NULL | 조리방법 |
| ingredients_used | jsonb | NOT NULL, DEFAULT '[]' | 사용 재료 [{ingredient_id, amount, unit, cut_size}] |
| heat_level | varchar(20) | nullable | 강/중/약/없음 |
| duration_seconds | int | nullable | 조리시간(초) |
| duration_text | varchar(50) | nullable | 표시용 시간 |

### 제약

- **UNIQUE**: `(recipe_id, step_number)`

### CHECK

```
CHECK (step_number>0)
CHECK (duration_secondsISNULLOR duration_seconds>=0)
```

> **참고**
> 
> - MVP에서는 `recipe_step_ingredients` 별도 테이블 없이 `ingredients_used jsonb` 유지
> - API/프론트도 이 구조를 기준으로 동작

---

# 5. 식단 플래너 (Meal Plan)

## 5-1. meal_plan_columns

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| name | varchar(30) | NOT NULL | 아침 / 점심 / 저녁 / 간식 등 |
| sort_order | int | NOT NULL | 컬럼 순서 |
| created_at | timestamptz | NOT NULL |  |
- 유저당 최대 5개 제한 (애플리케이션 레벨)
- **UNIQUE**: `(user_id, sort_order)`

## 5-2. meals

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| recipe_id | uuid | FK → recipes |  |
| plan_date | date | NOT NULL | 날짜 |
| column_id | uuid | FK → meal_plan_columns | 끼니 컬럼 |
| planned_servings | int | NOT NULL | 계획 인분 |
| status | enum | NOT NULL, DEFAULT 'registered' | `registered` / `shopping_done` / `cook_done` |
| is_leftover | boolean | NOT NULL, DEFAULT false | 남은요리 기반 식사 여부 |
| leftover_dish_id | uuid | FK → leftover_dishes, nullable | 출처 남은요리 |
| shopping_list_id | uuid | FK → shopping_lists, nullable | 장보기 스냅샷 연결 |
| cooked_at | timestamptz | nullable | 요리 완료 시각 |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

### CHECK

```
CHECK (planned_servings>0)

CHECK (
  (is_leftover=trueAND leftover_dish_idISNOTNULL)
OR
  (is_leftover=falseAND leftover_dish_idISNULL)
)

CHECK (
  (status='cook_done'AND cooked_atISNOTNULL)
OR
  (status<>'cook_done'AND cooked_atISNULL)
)
```

### INDEX

- `(user_id, plan_date, column_id)`
- `(user_id, plan_date, status)`
- `(user_id, status)`
- `(shopping_list_id)`

---

# 6. 장보기 (Shopping)

## 6-1. shopping_lists

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| title | varchar(100) | NOT NULL | 예: 3/12 장보기 |
| date_range_start | date | NOT NULL | 대상 시작일 |
| date_range_end | date | NOT NULL | 대상 종료일 |
| is_completed | boolean | NOT NULL, DEFAULT false | 완료 여부 |
| completed_at | timestamptz | nullable | 완료 시각 |
| created_at | timestamptz | NOT NULL |  |

### CHECK

```
CHECK (date_range_start<= date_range_end)

CHECK (
  (is_completed=trueAND completed_atISNOTNULL)
OR
  (is_completed=falseAND completed_atISNULL)
)
```

> **정책**
> 
> - `is_completed=false` 리스트는 수정/재진입 가능
> - `is_completed=true` 리스트는 기록용 read-only
> - read-only 차단은 서비스 레이어에서 409로 처리하고, 필요 시 DB trigger로 보강 가능

## 6-2. shopping_list_items `v1.3 핵심 변경`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| shopping_list_id | uuid | FK → shopping_lists |  |
| ingredient_id | uuid | FK → ingredients |  |
| display_text | varchar(200) | NOT NULL | 표시용 (복합 표기 포함) |
| amounts_json | jsonb | NOT NULL | 단위별 수량 [{amount, unit}] |
| is_pantry_excluded | boolean | NOT NULL, DEFAULT false | 팬트리 제외 섹션 여부 |
| is_checked | boolean | NOT NULL, DEFAULT false | 구매 체크 여부 |
| added_to_pantry | boolean | NOT NULL, DEFAULT false | 팬트리 반영 처리 여부 |
| sort_order | int | NOT NULL, DEFAULT 0 | 드래그 정렬 순서 |
- **UNIQUE**: `(shopping_list_id, ingredient_id)`

### CHECK

```
CHECK (sort_order>=0)

CHECK (
  added_to_pantry=false
OR
  (is_checked=trueAND is_pantry_excluded=false)
)
```

> **v1.3 의미 정리**
> 
> - `added_to_pantry=true`는 **팬트리 반영 처리됨** 을 의미
> - 해당 ingredient가 이미 pantry_items에 존재해 실제 INSERT가 생략되더라도,
>     
>     사용자가 “팬트리에 추가” 대상으로 선택했고 완료 처리되었다면 true로 마킹 가능
>     

> **업데이트 정책**
> 
> - `is_pantry_excluded=true`로 바뀌는 순간 `is_checked=false` 자동 정리
> - `shopping_lists.is_completed=true`인 경우 `is_checked / is_pantry_excluded / sort_order` 수정 불가(서비스 레이어 409)

## 6-3. shopping_list_recipes

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| shopping_list_id | uuid | FK → shopping_lists |  |
| recipe_id | uuid | FK → recipes |  |
| shopping_servings | int | NOT NULL | 장보기 기준 인분 |
| planned_servings_total | int | NOT NULL | 합산 계획 인분 |
- **UNIQUE**: `(shopping_list_id, recipe_id)`

### CHECK

```
CHECK (shopping_servings>0)
CHECK (planned_servings_total>0)
```

---

# 7. 요리 세션 (Cooking Sessions)

> **Flow 기준**
> 
> - cooking_session 1개 = 레시피 1개
> - `COOK_READY_LIST`에서 특정 레시피 [요리하기] 클릭 시 세션 생성
> - 대상 `shopping_done` meals를 세션 생성 시점에 스냅샷 고정

## 7-1. cooking_sessions

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| status | enum | NOT NULL, DEFAULT 'in_progress' | `in_progress` / `completed` / `cancelled` |
| created_at | timestamptz | NOT NULL | 세션 생성 시각 |
| completed_at | timestamptz | nullable | 완료 시각 |

### CHECK

```
CHECK (
  (status='completed'AND completed_atISNOTNULL)
OR
  (status<>'completed'AND completed_atISNULL)
)
```

## 7-2. cooking_session_meals

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| session_id | uuid | FK → cooking_sessions |  |
| meal_id | uuid | FK → meals |  |
| recipe_id | uuid | FK → recipes | 조회 편의용 비정규화 |
| cooking_servings | int | NOT NULL | 이번 요리 인분 |
| is_cooked | boolean | NOT NULL, DEFAULT false | 요리 완료 여부 |
| cooked_at | timestamptz | nullable | 요리 완료 시각 |
- **UNIQUE**: `(session_id, meal_id)`

### CHECK

```
CHECK (cooking_servings>0)
CHECK (
  (is_cooked=trueAND cooked_atISNOTNULL)
OR
  (is_cooked=falseAND cooked_atISNULL)
)
```

> **비정규화 주의**
> 
> - `recipe_id`는 `meal_id`의 recipe_id와 일치해야 함
> - 서비스 레이어/trigger에서 불일치 방지 필요

---

# 8. 팬트리 (Pantry)

## 8-1. pantry_items

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| ingredient_id | uuid | FK → ingredients |  |
| created_at | timestamptz | NOT NULL | 추가 시각 |
- **UNIQUE**: `(user_id, ingredient_id)`

> 수량 저장 없이 “보유 여부”만 관리
> 
> 
> 삭제 = 행 삭제
> 

---

# 9. 남은요리 (Leftovers)

## 9-1. leftover_dishes

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| recipe_id | uuid | FK → recipes |  |
| status | enum | NOT NULL, DEFAULT 'leftover' | `leftover` / `eaten` |
| cooked_at | timestamptz | NOT NULL | 요리 완료 시각 |
| eaten_at | timestamptz | nullable | 다먹음 시각 |
| auto_hide_at | timestamptz | nullable | eaten_at + 30일 |
| created_at | timestamptz | NOT NULL |  |

### CHECK

```
CHECK (
  (status='eaten'AND eaten_atISNOTNULLAND auto_hide_atISNOTNULL)
OR
  (status='leftover'AND eaten_atISNULL)
)
```

> `leftover` 상태에서 `auto_hide_at`는 NULL 유지 권장
> 

---

# 10. 레시피북 (Recipe Books)

## 10-1. recipe_books

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| name | varchar(50) | NOT NULL | 레시피북 이름 |
| book_type | enum | NOT NULL | `my_added` / `saved` / `liked` / `custom` |
| sort_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

> **v1.3 정합화**
> 
> - 시스템 레시피북도 **실제 row로 존재**
> - `id`는 시스템/커스텀 모두 uuid
> - 구분은 오직 `book_type`으로만 수행

### 회원가입 시 자동 생성

- `my_added`
- `saved`
- `liked`

## 10-2. recipe_book_items

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| book_id | uuid | FK → recipe_books |  |
| recipe_id | uuid | FK → recipes |  |
| added_at | timestamptz | NOT NULL | 저장 시각 |
- **UNIQUE**: `(book_id, recipe_id)`

> **정책**
> 
> - `saved` / `custom`만 recipe_book_items를 통해 저장
> - `liked`는 `recipe_likes`가 source of truth
> - `my_added`는 `recipes.created_by`가 source of truth

---

# 11. 좋아요 (User Actions)

## 11-1. recipe_likes

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| recipe_id | uuid | FK → recipes |  |
| created_at | timestamptz | NOT NULL |  |
- **UNIQUE**: `(user_id, recipe_id)`

---

# 12. 테이블 관계 요약

| 관계 | 카디널리티 | 설명 |
| --- | --- | --- |
| users 1 — N meals | 1:N | 유저별 식사 |
| users 1 — N meal_plan_columns | 1:N | 유저별 끼니 컬럼 |
| meals N — 1 meal_plan_columns | N:1 | 식사가 끼니 컬럼에 속함 |
| meals N — 1 recipes | N:1 | 식사가 레시피 참조 |
| meals N — 1 shopping_lists (nullable) | N:1 | 장보기 스냅샷 연결 |
| meals N — 1 leftover_dishes (nullable) | N:1 | 남은요리 출처 추적 |
| users 1 — N pantry_items | 1:N | 유저별 보유 재료 |
| pantry_items N — 1 ingredients | N:1 | 재료 참조 |
| users 1 — N shopping_lists | 1:N | 유저별 장보기 |
| shopping_lists 1 — N shopping_list_items | 1:N | 장보기 아이템 |
| shopping_list_items N — 1 ingredients | N:1 | 재료 참조 |
| shopping_lists 1 — N shopping_list_recipes | 1:N | 장보기 대상 레시피 |
| shopping_list_recipes N — 1 recipes | N:1 | 레시피 참조 |
| users 1 — N cooking_sessions | 1:N | 유저별 요리 세션 |
| cooking_sessions 1 — N cooking_session_meals | 1:N | 세션 대상 식사 스냅샷 |
| cooking_session_meals N — 1 meals | N:1 | 식사 참조 |
| users 1 — N leftover_dishes | 1:N | 유저별 남은요리 |
| leftover_dishes N — 1 recipes | N:1 | 레시피 참조 |
| users 1 — N recipe_books | 1:N | 유저별 레시피북 |
| recipe_books 1 — N recipe_book_items | 1:N | 커스텀/저장 책 구성 |
| recipe_book_items N — 1 recipes | N:1 | 레시피 참조 |
| users 1 — N recipe_likes | 1:N | 좋아요 |
| recipe_likes N — 1 recipes | N:1 | 레시피 참조 |
| recipes 1 — N recipe_ingredients | 1:N | 레시피 재료 |
| recipe_ingredients N — 1 ingredients | N:1 | 재료 참조 |
| recipes 1 — N recipe_steps | 1:N | 조리 단계 |
| recipe_steps N — 1 cooking_methods | N:1 | 조리방법 참조 |
| recipes 1 — 1 recipe_sources | 1:1 | 출처 |
| ingredients 1 — N ingredient_synonyms | 1:N | 동의어 |
| ingredient_bundles 1 — N ingredient_bundle_items | 1:N | 묶음 구성 |
| ingredient_bundle_items N — 1 ingredients | N:1 | 재료 참조 |

---

# 13. 상태 전이와 관련 테이블 흐름

## 13-1. 장보기 흐름 `v1.3 정합화`

```
[식사 등록]
  meals 행 생성 (status='registered')
      │
      ▼
[플래너 → 장보기 버튼 클릭]
  meals WHERE status='registered'
    AND shopping_list_id IS NULL
    AND plan_date BETWEEN today AND 마지막등록일
  → 레시피별 인분 합산 → SHOPPING_FLOW 표시
      │
      ▼
[장보기 목록 생성]
  1. shopping_lists 생성
  2. shopping_list_recipes 생성
  3. shopping_list_items 생성
     - 팬트리 보유 재료는 is_pantry_excluded=true
     - sort_order 기본값 부여
     - added_to_pantry=false
  4. 선택된 meals.shopping_list_id = 해당 list_id
     (status는 registered 유지)
      │
      ▼
[SHOPPING_DETAIL 편집]
  - is_checked 토글
  - is_pantry_excluded 토글
  - sort_order 변경
  - 제외 시 is_checked=false 자동 정리
      │
      ▼
[장보기 완료]
  1. shopping_lists.is_completed = true
  2. shopping_lists.completed_at = now()
  3. 해당 list_id 연결 meals.status:
       registered → shopping_done
  4. 선택된 item만 pantry_items 반영
  5. 해당 item.added_to_pantry = true
      │
      ▼
[완료 후]
  SHOPPING_DETAIL read-only
```

## 13-2. 요리 흐름

```
[플래너 → 요리하기 버튼 클릭]
  meals WHERE status='shopping_done'
    AND plan_date BETWEEN today AND 마지막등록일
  → 레시피별 리스트 표시

[레시피 카드에서 요리하기 클릭]
  1. cooking_sessions 생성
  2. 해당 레시피의 shopping_done meals
     → cooking_session_meals INSERT (스냅샷)

[COOK_MODE]

[취소]
  cooking_sessions.status = 'cancelled'
  meals 상태 변경 없음

[요리 완료]
  cooking_session_meals.is_cooked = true
  cooking_sessions.status = 'completed'
  해당 meal_id들:
    meals.status → 'cook_done'
    meals.cooked_at → now()
  leftover_dishes INSERT
  pantry_items DELETE (소진 체크 재료)
  recipes.cook_count += 1
```

## 13-3. 독립 요리 흐름

```
[RECIPE_DETAIL → 요리하기]
  session 없이 COOK_MODE 진입

[요리 완료]
  leftover_dishes INSERT
  pantry_items DELETE (선택 재료)
  recipes.cook_count += 1

  ⚠️ meals 상태 변경 없음
  ⚠️ cooking_sessions 생성 없음
```

---

# 14. 인덱스 권장

| 테이블 | 인덱스 | 용도 |
| --- | --- | --- |
| meals | `(user_id, plan_date, status)` | 플래너 조회 / 장보기·요리 대상 필터 |
| meals | `(user_id, status)` | 상태별 빠른 조회 |
| meals | `(shopping_list_id)` | 장보기 완료 시 대상 meals 조회 |
| shopping_lists | `(user_id, is_completed, created_at DESC)` | 장보기 기록 조회 |
| shopping_list_items | `(shopping_list_id, sort_order, id)` | 장보기 상세 정렬 |
| shopping_list_items | `(shopping_list_id, is_pantry_excluded)` | 구매/제외 섹션 분리 조회 |
| shopping_list_recipes | `(shopping_list_id)` | 목록별 레시피 조회 |
| cooking_session_meals | `(session_id, recipe_id)` | 요리 완료 시 대상 조회 |
| recipes | `(view_count DESC)` | 홈 기본 정렬 |
| recipes | `(like_count DESC)` | 좋아요순 |
| recipes | `(save_count DESC)` | 저장순 |
| recipes | `(plan_count DESC)` | 플래너 등록순 |
| recipe_ingredients | `(recipe_id)` | 재료 조회 |
| recipe_ingredients | `(ingredient_id)` | 재료 역검색 |
| recipe_steps | `(recipe_id, step_number)` | 스텝 순서 조회 |
| pantry_items | `(user_id, ingredient_id)` | 팬트리 조회/제외 |
| leftover_dishes | `(user_id, status, cooked_at DESC)` | 남은요리 목록 |
| ingredient_synonyms | `(synonym)` | 동의어 검색 |
| recipe_book_items | `(book_id)` | 레시피북 상세 |
| recipe_book_items | `(recipe_id)` | 저장 수 집계 |
| cooking_methods | `(code)` | 조리방법 조회 |

---

# 15. 회원가입 시 자동 생성 항목

| 대상 | 내용 |
| --- | --- |
| meal_plan_columns × 3 | 아침 / 점심 / 저녁 |
| recipe_books × 3 | 내가 추가한 레시피 / 저장한 레시피 / 좋아요한 레시피 |

---

# 16. 전체 테이블 목록 (22개)

| # | 테이블 | 구분 |
| --- | --- | --- |
| 1 | users | 사용자 |
| 2 | ingredients | 재료 마스터 |
| 3 | ingredient_synonyms | 재료 마스터 |
| 4 | ingredient_bundles | 재료 마스터 |
| 5 | ingredient_bundle_items | 재료 마스터 |
| 6 | cooking_methods | 조리방법 마스터 |
| 7 | recipes | 레시피 |
| 8 | recipe_sources | 레시피 |
| 9 | recipe_ingredients | 레시피 |
| 10 | recipe_steps | 레시피 |
| 11 | meal_plan_columns | 식단 플래너 |
| 12 | meals | 식단 플래너 |
| 13 | shopping_lists | 장보기 |
| 14 | shopping_list_items | 장보기 |
| 15 | shopping_list_recipes | 장보기 |
| 16 | cooking_sessions | 요리 세션 |
| 17 | cooking_session_meals | 요리 세션 |
| 18 | pantry_items | 팬트리 |
| 19 | leftover_dishes | 남은요리 |
| 20 | recipe_books | 레시피북 |
| 21 | recipe_book_items | 레시피북 |
| 22 | recipe_likes | 좋아요 |

---

## v1.3 핵심 결정 로그 요약

- `shopping_list_items.sort_order` 추가 → 장보기 상세 드래그 정렬 지원
- 장보기 완료 후 리스트는 `shopping_lists.is_completed=true` 기준 read-only
- `added_to_pantry`는 “팬트리 반영 처리됨” 의미
- 팬트리 제외 섹션 이동 시 `is_checked=false` 자동 정리
- `color_key`는 `'unassigned'` 기본값 허용
- users는 soft delete 전제에 맞게 partial unique index 사용
- recipe_books id는 시스템/커스텀 모두 uuid, 구분은 book_type만 사용