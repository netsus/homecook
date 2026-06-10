# DB 설계 v1.3.12

상태: 공식문서
담당자: 채실장
날짜: 6월 9

> 기준 문서: 요구사항 기준선 v1.7.6 / 화면정의서 v1.5.13 / API 설계 v1.2.16 / 유저 Flow맵 v1.3.13
>
>
> 작성: 킴실장
>
> 리뷰: 채실장
>
> 원칙: **기획(요구사항/화면정의서) ↔ Flow ↔ API ↔ DB가 같은 말을 하도록 유지**
>

---

> **v1.3.11 → v1.3.12 변경 요약**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | 1 | 재료 taxonomy v2를 8대분류/21소분류로 확정한다 | `ingredient_category_groups`, `ingredient_categories`, `ingredients.category_code` additive migration target |
> | 2 | 조리방법 taxonomy v2를 6그룹/20대표 method로 확정한다 | `cooking_method_categories`, `cooking_methods.category_code`, `cooking_method_synonyms`, `cooking_methods.label varchar(20)` additive/widening migration target |
> | 3 | `씻기`는 canonical method seed에서 제외하고, `에어프라이어`는 canonical method seed에 포함한다 | seed/migration 검증 기준 |
> | 4 | v1 category label 8종과 `ingredients.category`는 migration 동안 유지한다 | FK cutover와 string 제거는 후속 승인 전 금지 |
>
> **v1.3.10 → v1.3.11 변경 요약**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `youtube_visual_extraction_cache`, `youtube_visual_extraction_events` 서버 전용 cache/event 테이블을 추가한다 | §4-2e 신규 |
> | 2 | `recipe_sources.extraction_methods` 설명을 실제 YouTube session 값(`description | comment | caption`)에 맞게 정리한다 | §4-3 |
> | 3 | `extraction_meta_json`에 `quantity_enrichment_summary` 필드를 추가한다 | §4-2, §4-3 |

## v1.3.9 → v1.3.10 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | YouTube 등록 시 세션 썸네일을 recipes에 영속화 | `recipes.thumbnail_url`에 세션 `thumbnail_url` 서버 측 복사. 기존 nullable 컬럼 사용, DDL 변경 없음 |
| B | YouTube/직접 등록 시 서버 태그 생성기 결과를 영속화 | `recipes.tags`에 생성기 결과 저장. 기존 text[] 컬럼 사용, DDL 변경 없음 |
| C | 직접 등록 이미지를 Supabase Storage로 업로드 | `recipe-images` 버킷 생성, user-scoped 경로 사용. `recipes.thumbnail_url`에 public Storage URL 저장 |
| D | Supabase Storage 버킷/정책 추가 | `recipe-images` 버킷: 인증 사용자만 자기 경로에 업로드, 읽기는 public |

> 이 버전은 `recipes` 테이블에 새 컬럼을 추가하지 않는다. 기존 `thumbnail_url`과 `tags`를 YouTube register RPC와 manual create에서 채워 넣는 계약 변경이다.
> Supabase Storage `recipe-images` 버킷은 migration으로 생성하거나 초기 설정 스크립트로 생성한다.
> 정규화 태그 테이블(`tags`, `recipe_tags`)과 다중 이미지 테이블(`recipe_images`)은 MVP scope 밖이다.

## v1.3.8 → v1.3.9 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | YouTube 등록 레시피의 재료 섹션 라벨 영속화 | `recipe_ingredients.component_label` nullable 추가 |
| B | YouTube 등록 레시피의 단계 섹션 라벨 영속화 | `recipe_steps.component_label` nullable 추가 |

> `component_label`은 표시용 메타데이터다. 장보기 집계 key, 재료 동일성, step ordering에는 사용하지 않는다. 수동 레시피 작성 입력은 이번 버전에서 섹션 라벨을 받지 않는다.

## v1.3.7 → v1.3.8 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | Admin Foundation 테이블 3종 추가 | `admin_members`, `operational_events`, `admin_audit_logs` 신규 |

> v1.3.8은 Admin Foundation 기반 테이블을 추가한다. 관리자 신원 관리(`admin_members`), 시스템 운영 이벤트 기록(`operational_events`), 관리자 행위 감사 로그(`admin_audit_logs`) 3종이다.

## v1.3.6 → v1.3.7 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | 재료 카테고리 계약 유지 | `ingredients.category`는 `과일` 포함 v1 canonical 8종 문자열을 유지 |
| B | 신규 ingredient taxonomy의 역할 명확화 | DB registry/FK 전환 없이 additive shadow metadata / shared mapping source로만 해석 |
| C | 조리방법 category 범위 잠금 | `cooking_methods.label varchar(5)`는 표시 라벨 유지, taxonomy 코드/분류 저장소로 사용 금지 |
| D | 외부 데이터 ingest 안전장치 | 식약처/농식품올바로 등은 production 직적재 금지, staging/review/approved seed gate 필요 |

> 이 버전은 schema DDL을 추가하지 않는 contract lock이다. `ingredient_categories` / `cooking_method_categories` 같은 registry table은 slice27 이후 필요 증거가 있을 때 별도 ADR/contract-evolution으로 검토한다.

## v1.3.5 → v1.3.6 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | 회원 탈퇴 후 동일 소셜 계정 재가입 시 이전 개인 기록이 보이지 않아야 함 | `delete_user_private_data(p_user_id)` RPC 추가 |
| B | 사용자가 등록한 레시피는 다른 사용자의 저장/플래너 참조를 위해 보존 | `recipes.created_by` FK `ON DELETE SET NULL` 정책 사용 |
| C | 사용자 삭제로 사라진 저장/좋아요 row가 recipe count에 반영되어야 함 | 영향받은 `recipes.save_count`, `recipes.like_count` 재계산 |
| D | 기존 `deleted_at` soft-deleted 사용자와 신규 cleanup 정책 정합화 | migration에서 legacy `users.deleted_at is not null` row를 cleanup RPC로 정리 |

---

## v1.3.4 → v1.3.5 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | YouTube 추출 draft 재료 row의 안정 식별자 필요 | `youtube_extraction_sessions.draft_json.ingredients[]` 각 항목에 `draft_ingredient_id` UUID 저장 |
| B | YT_IMPORT 검수 중 미등록 재료를 사용자 확인으로 표준 재료 등록 | `register_youtube_ingredient(...)` RPC 추가 |
| C | 재료 synonym 중복/경합 정책 명시 | global `UNIQUE(synonym)` 추가 없음. ambiguous synonym은 best-effort skip, 경합 시 기존 matching이 `needs_review` 처리 |

---

## v1.3.2 → v1.3.3 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | HOME `최신순` 정렬 추가 | `recipes.created_at DESC, id DESC` 정렬 인덱스 추가 |
| B | 남은요리 카드에서 요리 인분 표시 필요 | `leftover_dishes.cooking_servings` 추가 |
| C | 남은요리 카드에서 최신 연결 끼니 정보를 표시 | `meals.leftover_dish_id` 기반 조회 정책과 인덱스 추가 |
| D | 장보기 기록 카드 재열람에서 완료 시각 표시 | 기존 `shopping_lists.completed_at`을 `/shopping/lists` 목록 응답에도 사용 |
| E | 레시피북 상세에서 조회수/시간/인분/태그 표시 | 기존 `recipes.view_count/base_servings/tags`와 `recipe_steps.duration_seconds` 합산 사용 |

---

## v1.3.1 → v1.3.2 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | 끼니 컬럼을 4개 고정에서 사용자 설정 가능 목록으로 변경 | `meal_plan_columns` 공개 정책을 기본 3개 + 1~5개 사용자 관리로 갱신 |
| B | 신규 사용자 기본 끼니를 `아침 / 점심 / 저녁` 3개로 변경 | 회원가입 자동 생성 항목 갱신 |
| C | 컬럼 삭제 안전장치 필요 | 연결된 `meals`가 있는 컬럼 삭제 금지, 최소 1개 유지 정책 명시 |

---

## v1.2 → v1.3 변경 요약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| A | 장보기 상세에서 카드 드래그&드롭 순서 저장 필요 | **shopping_list_items.sort_order 추가** |
| B | 장보기 완료 후 리스트 read-only 정책 필요 | **shopping_lists.is_completed / completed_at 기준 정책 명시** + 완료 후 item 수정 금지 정책 문서화 |
| C | 장보기 완료 시 팬트리 반영을 선택적으로 분리 | **shopping_list_items.added_to_pantry 의미 명확화** (실제 INSERT 여부와 별개로 “반영 처리됨” 표시) |
| D | 팬트리 제외 섹션 이동 시 체크 자동 해제 필요 | **shopping_list_items CHECK/업데이트 정책 보강** |
| E | cooking_methods의 미배정 색상 처리 필요 | **color_key DEFAULT 'unassigned'** 반영 |
| F | users 소프트 삭제 후 재가입/복구 충돌 방지 | **부분 유니크 인덱스(partial unique index)** 로 정리. v1.3.6 이후 신규 회원 탈퇴는 private data cleanup 후 `users` row 삭제 |
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

auth.users ─── user_progress_events (1:N, user_id FK)
       └─── user_progress_summary (1:1, user_id FK)

auth.users ─── admin_members (1:1, user_id FK)
auth.users ─<  admin_audit_logs (1:N, actor_admin_user_id FK)
operational_events (독립 운영 이벤트 테이블, FK 없음)
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
| deleted_at | timestamptz | nullable | legacy soft-delete marker. v1.3.6 이후 신규 회원 탈퇴는 private data cleanup 후 `users` row 삭제 |

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

### 회원 탈퇴 cleanup RPC `v1.3.6 신규`

`delete_user_private_data(p_user_id uuid)`는 회원 탈퇴 시 한 transaction 안에서 사용자 개인 데이터를 정리한다.

| 대상 | 처리 |
| --- | --- |
| `users` | 인증된 사용자 row 삭제 |
| `recipe_books`, `meals`, `meal_plan_columns`, `shopping_lists`, `pantry_items`, `cooking_sessions`, `leftover_dishes`, `recipe_likes`, `youtube_extraction_sessions` 등 `user_id` FK를 가진 개인 데이터 | FK `ON DELETE CASCADE`로 삭제 |
| `recipes.created_by = p_user_id` | 레시피 row는 보존, `created_by`는 `ON DELETE SET NULL`로 익명화 |
| 삭제 사용자가 저장했던 recipe | 남은 `recipe_book_items` 기준으로 `recipes.save_count` 재계산 |
| 삭제 사용자가 좋아요한 recipe | 남은 `recipe_likes` 기준으로 `recipes.like_count` 재계산 |

권한 정책:

- authenticated 호출자는 `auth.uid() = p_user_id`인 경우만 허용한다.
- 서버 route는 service role client로 인증된 자기 자신의 `p_user_id`만 전달한다.
- anonymous 호출 권한은 부여하지 않는다.

---

# 2. 재료 마스터 (Ingredients)

## 2-1. ingredients

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| standard_name | varchar(100) | NOT NULL, UNIQUE | 정규화된 재료명 |
| category | varchar(50) | NOT NULL | v1 canonical: 채소 / 과일 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 |
| category_code | varchar(50) | nullable, FK → ingredient_categories(code) | v2 소분류 코드. migration 동안 additive-only |
| default_unit | varchar(20) | nullable | 기본 단위 (g, ml, 개 등) |
| created_at | timestamptz | NOT NULL |  |

> 신규 ingredient taxonomy는 `category` 컬럼을 대체하지 않는다. `category_code`는 코드/seed 기반 shared mapping source 또는 additive shadow metadata로 legacy label을 해석하기 위한 nullable field이며, production FK cutover와 `category` 제거는 이번 계약 범위 밖이다.
> 식약처/농식품올바로 등 외부 raw data는 `ingredients`에 직접 INSERT하지 않는다. raw import → normalization → review → approved seed 절차를 거쳐야 한다.

## 2-2. ingredient_category_groups

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| code | varchar(50) | PK | stable group code |
| label | varchar(50) | NOT NULL, UNIQUE | 사용자 표시 대분류 label |
| display_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| is_active | boolean | NOT NULL, DEFAULT true | 비활성 category 입력 차단 기준 |
| created_at | timestamptz | NOT NULL |  |

### v2 group seed

| code | label | display_order |
| --- | --- | --- |
| grain_noodle_ricecake | 곡류/면/떡 | 10 |
| vegetable_mushroom | 채소/버섯 | 20 |
| fruit_nut | 과일/견과 | 30 |
| protein | 단백질 | 40 |
| seafood | 해산물 | 50 |
| dairy_alternative | 유제품/대체유 | 60 |
| seasoning_condiment | 양념/조미 | 70 |
| processed_other | 가공/기타 | 80 |

## 2-3. ingredient_categories

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| code | varchar(50) | PK | stable 소분류 code |
| group_code | varchar(50) | FK → ingredient_category_groups(code), NOT NULL | 대분류 |
| label | varchar(50) | NOT NULL | 사용자 표시 소분류 label |
| legacy_category | varchar(50) | NOT NULL | v1 canonical fallback label |
| display_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| is_active | boolean | NOT NULL, DEFAULT true | 비활성 category 입력 차단 기준 |
| created_at | timestamptz | NOT NULL |  |

### v2 category seed

| group label | code | label | legacy_category |
| --- | --- | --- | --- |
| 곡류/면/떡 | rice_meal | 밥/쌀 | 곡류 |
| 곡류/면/떡 | noodle_pasta | 면/파스타 | 곡류 |
| 곡류/면/떡 | bread_ricecake_cereal | 빵/떡/시리얼 | 곡류 |
| 채소/버섯 | leaf_namul | 잎/나물채소 | 채소 |
| 채소/버섯 | root_stem | 뿌리/줄기채소 | 채소 |
| 채소/버섯 | fruiting_vegetable_mushroom | 열매채소/버섯 | 채소 |
| 과일/견과 | fruit | 과일 | 과일 |
| 과일/견과 | nut_seed_dried_fruit | 견과/씨앗/건과일 | 과일 |
| 단백질 | pork_beef_lamb | 돼지/소/양 | 육류 |
| 단백질 | chicken_duck | 닭/오리 | 육류 |
| 단백질 | egg | 달걀 | 기타 |
| 단백질 | tofu_bean | 두부/콩류 | 기타 |
| 해산물 | fish_shellfish_crustacean | 생선/갑각/조개 | 해산물 |
| 해산물 | seaweed_dried_fish_fishcake | 해조/건어물/어묵 | 해산물 |
| 유제품/대체유 | milk_yogurt_cream | 우유/요거트/크림 | 유제품 |
| 유제품/대체유 | cheese_butter_alt_milk | 치즈/버터/대체유 | 유제품 |
| 양념/조미 | paste_sauce | 장류/소스 | 양념 |
| 양념/조미 | spice_herb | 향신료/허브 | 양념 |
| 양념/조미 | oil_vinegar_sugar_stock | 기름/식초/당류/육수 | 양념 |
| 가공/기타 | kimchi_pickle_can | 김치/절임/통조림 | 기타 |
| 가공/기타 | frozen_ready_drink_other | 냉동/간편식/음료/기타 | 기타 |

> 기존 DB 재료 중 `딸기`, `생딸기`, `사과`, `바나나`, `레몬`, `라임`, `오렌지`, `귤`, `배`, `키위`, `복숭아`, `포도`, `블루베리`, `망고`처럼 명확한 과일 row는 `fruit`로 매핑한다.
> 애매한 row는 자동 재분류하지 않고 review 후보 또는 legacy fallback category로 남긴다.
> migration은 idempotent해야 하며 기존 사용자 생성 재료를 잘못 덮어쓰지 않아야 한다.

## 2-4. ingredient_synonyms

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| ingredient_id | uuid | FK → ingredients |  |
| synonym | varchar(100) | NOT NULL | 동의어 |
- **UNIQUE**: `(ingredient_id, synonym)`

> 운영 정책상 synonym 중복 매핑을 엄격히 막으려면 `UNIQUE (synonym)` 도입 검토 가능하나, MVP에서는 `(ingredient_id, synonym)` 유지.
>

## 2-5. ingredient_bundles

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| name | varchar(50) | NOT NULL | 예: 조미료 모음, 야채 모음 |
| display_order | int | NOT NULL, DEFAULT 0 | 노출 순서 |

## 2-6. ingredient_bundle_items

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
| label | varchar(20) | NOT NULL | 한글 표시 라벨 |
| color_key | varchar(20) | NOT NULL, DEFAULT `'unassigned'` | 프론트 색상 매핑 키 |
| category_code | varchar(50) | nullable, FK → cooking_method_categories(code) | v2 조리방법 그룹 코드. migration 동안 additive-only |
| is_system | boolean | NOT NULL, DEFAULT true | 시스템 기본값 여부 |
| display_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| created_at | timestamptz | NOT NULL |  |

> **v1.3 변경**
>
> - `color_key`는 NULL 허용 대신 **DEFAULT `'unassigned'`** 로 통일
> - 프론트는 `unassigned`를 회색 fallback으로 처리
> - `label`은 표시 라벨 용도다. category taxonomy code나 분류 의미를 `label`에 과적재하지 않는다.
> - `category_code`는 `GET /cooking-methods` v1 shape를 깨지 않는 optional additive metadata다.

### 시스템 기본 데이터(seed)

| code | label | category_code | color_key |
| --- | --- | --- | --- |
| slice | 썰기 | prep_handling | gray |
| mince | 다지기 | prep_handling | gray |
| thaw | 해동 | preprocessing | gray |
| pre_season | 밑간 | preprocessing | green |
| pickle | 절이기 | preprocessing | green |
| boil | 끓이기 | moist_heat | red |
| parboil | 삶기 | moist_heat | red |
| blanch | 데치기 | moist_heat | lime |
| steam | 찌기 | moist_heat | blue |
| stir_fry | 볶기 | pan_oil | orange |
| grill | 굽기 | pan_oil | brown |
| pan_fry | 부치기 | pan_oil | yellow |
| deep_fry | 튀기기 | pan_oil | yellow |
| mix | 섞기 | mix_braise | gray |
| toss | 무치기 | mix_braise | green |
| braise | 조리기 | mix_braise | red |
| reduce | 졸이기 | mix_braise | red |
| microwave | 전자레인지 | appliance | gray |
| oven_bake | 오븐굽기 | appliance | brown |
| air_fryer | 에어프라이어 | appliance | yellow |

> `씻기`는 canonical method seed에 포함하지 않는다.
> `채썰기`, `재우기`, `핏물빼기`, `지지기`, `중탕`, `압력솥`, `간보기`, `토핑`, `담기`, `식히기`, `숙성`은 synonym 또는 자유 step text 후보로만 처리한다.

## 3-2. cooking_method_categories

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| code | varchar(50) | PK | stable 조리방법 그룹 code |
| label | varchar(50) | NOT NULL, UNIQUE | 사용자 표시 그룹 label |
| display_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| is_active | boolean | NOT NULL, DEFAULT true | 비활성 group 입력 차단 기준 |
| created_at | timestamptz | NOT NULL |  |

### v2 cooking group seed

| code | label | display_order |
| --- | --- | --- |
| prep_handling | 준비/손질 | 10 |
| preprocessing | 전처리 | 20 |
| moist_heat | 물/수분 조리 | 30 |
| pan_oil | 팬/기름 조리 | 40 |
| mix_braise | 혼합/조림 | 50 |
| appliance | 기기 조리 | 60 |

## 3-3. cooking_method_synonyms

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| method_code | varchar(20) | FK → cooking_methods(code), NOT NULL | canonical method |
| synonym | varchar(50) | NOT NULL | 매칭 후보 표현 |
| match_kind | varchar(20) | NOT NULL | `exact` / `contains` / `regex` 중 하나 |
| is_active | boolean | NOT NULL, DEFAULT true | 비활성 synonym 매칭 차단 기준 |
| created_at | timestamptz | NOT NULL |  |

- **UNIQUE**: `(method_code, synonym)`

> synonym이 여러 method에 매칭되면 자동 승격하지 않고 review 후보로 남긴다.
> `씻기`는 사용자가 제외한 canonical 후보이므로 필요한 경우 자유 step text 또는 비대표 synonym 후보로만 다룬다.

---

# 4. 레시피 (Recipes)

## 4-1. recipes

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| title | varchar(200) | NOT NULL | 레시피명 |
| description | text | nullable | 설명 |
| thumbnail_url | text | nullable | 썸네일. YouTube: 세션 thumbnail_url 서버 복사. Manual: 업로드 API가 반환한 public Storage URL. 만료 signed URL 금지 `v1.3.10 계약` |
| base_servings | int | NOT NULL, DEFAULT 2 | 기본 인분 |
| tags | text[] | NOT NULL, DEFAULT '{}' | 서버 태그 생성기 결과. 최대 3개. 생성 불가 시 `[]` `v1.3.10 계약` |
| source_type | enum | NOT NULL | `system` / `youtube` / `manual` |
| created_by | uuid | FK → users, nullable, ON DELETE SET NULL | 직접/유튜브 등록자. 회원 탈퇴 시 레시피는 남고 작성자 정보만 비워질 수 있음 |
| view_count | int | NOT NULL, DEFAULT 0 | 조회수 |
| like_count | int | NOT NULL, DEFAULT 0 | 좋아요 수 |
| save_count | int | NOT NULL, DEFAULT 0 | 저장 수(비정규화) |
| plan_count | int | NOT NULL, DEFAULT 0 | 플래너 등록 수 |
| cook_count | int | NOT NULL, DEFAULT 0 | 요리완료 수 |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

### 조회수 증가 RPC

`increment_recipe_view_count(p_recipe_id uuid)`는 `recipes.view_count = recipes.view_count + 1`을 DB에서 원자적으로 실행하고 `id, view_count`를 반환한다.
`GET /recipes/{recipe_id}`는 응답 전 이 RPC를 기다려 HOME의 조회수 정렬/카드 지표가 실제 저장값과 어긋나지 않게 한다.

### CHECK

```
CHECK (base_servings>0)
CHECK (view_count>=0AND like_count>=0AND save_count>=0AND plan_count>=0AND cook_count>=0)
```

## 4-2. youtube_extraction_sessions `v1.3.4 신규`

> 유튜브 레시피 추출 세션. extract 시 생성, register 시 consumed. 24h TTL.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 세션 ID |
| user_id | uuid | FK → users, NOT NULL | 세션 소유자 (서버 설정) |
| youtube_url | text | NOT NULL | 유튜브 원본 URL |
| youtube_video_id | varchar(20) | NOT NULL | 영상 ID |
| video_title | text | nullable | 영상 제목 (videos.list snippet.title) |
| channel_title | text | nullable | 채널명 (videos.list snippet.channelTitle) |
| thumbnail_url | text | nullable | 썸네일 URL |
| provider_version | text | nullable | YouTube provider / extractor version |
| source_providers | text[] | NOT NULL, DEFAULT '{}' | 실제 사용한 source provider (`youtube_videos_list`, `description_parser`, `youtube_comment_threads`, `public_caption_timedtext`, `gemini_structured_extractor` 등) |
| classification_status | varchar(20) | NOT NULL | `recipe` / `uncertain` / `non_recipe` |
| classification_reasons | text[] | NOT NULL, DEFAULT '{}' | 판정 근거 배열 |
| raw_source_text | text | nullable | 원본 설명란, 사용된 공개 작성자 댓글, 사용된 공개 caption text 등 추출 source text |
| extraction_meta_json | jsonb | NOT NULL, DEFAULT '{}' | provider_version, classification, warnings, optional `llm_extractor` 등 |
| draft_json | jsonb | NOT NULL, DEFAULT '{}' | 추출 결과 전체 draft (title, ingredients, steps 등). `ingredients[]` 각 항목은 `draft_ingredient_id` UUID를 포함 |
| extraction_methods | text[] | NOT NULL, DEFAULT '{}' | `description`, `comment`, `caption` |
| session_kind | varchar(20) | NOT NULL, DEFAULT 'single' | `single` / `multi_parent` / `candidate_child` |
| parent_extraction_session_id | uuid | FK → youtube_extraction_sessions, nullable | `candidate_child`가 참조하는 parent multi session |
| parent_candidate_id | text | nullable | parent `recipe_candidates[].candidate_id` |
| status | varchar(20) | NOT NULL, DEFAULT 'draft' | `draft` / `consumed` / `expired` |
| recipe_id | uuid | FK → recipes, nullable | consumed 시 등록된 레시피 ID |
| expires_at | timestamptz | NOT NULL | created_at + 24h |
| consumed_at | timestamptz | nullable | consumed 시각 |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

### CHECK

```
CHECK (status IN ('draft', 'consumed', 'expired'))
CHECK (session_kind IN ('single', 'multi_parent', 'candidate_child'))
CHECK (classification_status IN ('recipe', 'uncertain', 'non_recipe'))
CHECK (expires_at > created_at)
```

### INDEX

```
INDEX idx_youtube_sessions_user_id ON youtube_extraction_sessions (user_id)
INDEX idx_youtube_sessions_status ON youtube_extraction_sessions (status) WHERE status = 'draft'
INDEX idx_youtube_sessions_parent ON youtube_extraction_sessions (parent_extraction_session_id, parent_candidate_id) WHERE parent_extraction_session_id IS NOT NULL
```

### draft_json.ingredients[] 계약 `v1.3.5 변경`

```json
{
  "draft_ingredient_id": "uuid",
  "standard_name": "연겨자",
  "raw_text": "연겨자 0.2스푼",
  "resolution_status": "unresolved"
}
```

- `draft_ingredient_id`는 extract 시 서버가 생성한다.
- 같은 값은 extract API 응답과 `draft_json.ingredients[]`에 함께 저장한다.
- 검수 화면에서 사용자가 재료명/수량/단위/순서를 수정해도 이 ID는 유지한다.
- 미등록 재료 등록 API는 이 ID로 session draft의 unresolved / needs_review row를 확인한다.
- 재료 등록 API는 `draft_json`을 update하지 않는다. draft는 원본 추출 snapshot/provenance로 유지한다.

### 4-2b. youtube_extraction_candidates `2026-05-30 addendum`

> 한 YouTube 영상 안에서 여러 요리 후보가 감지된 경우 parent 추출 세션의 후보 ledger. 후보를 선택하면 child 추출 세션으로 승격하고 기존 register RPC를 사용한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 후보 ledger ID |
| extraction_session_id | uuid | FK → youtube_extraction_sessions, NOT NULL | parent `multi_parent` 세션 |
| candidate_id | text | NOT NULL | extract 응답 후보 ID. parent 안에서 unique |
| status | varchar(20) | NOT NULL, DEFAULT 'draft' | `draft` / `promoted` / `registered` / `skipped` / `expired` |
| child_extraction_session_id | uuid | FK → youtube_extraction_sessions, nullable | 후보 선택 시 생성된 `candidate_child` 세션 |
| recipe_id | uuid | FK → recipes, nullable | 최종 등록된 레시피 ID |
| title | text | NOT NULL | 후보 요리명 |
| start_ms / end_ms | integer | nullable | timedtext evidence 기준 후보 시간 범위 |
| confidence | numeric | nullable | 후보 분리 신뢰도(0~1) |
| draft_ingredient_ids_json | jsonb | NOT NULL, DEFAULT '[]' | 후보 draft ingredient id snapshot |
| source_meta_json | jsonb | NOT NULL, DEFAULT '{}' | evidence_refs, warnings, blocking_issues |
| promoted_at / registered_at | timestamptz | nullable | 승격/등록 시각 |

### CHECK / INDEX / RLS

```
UNIQUE (extraction_session_id, candidate_id)
CHECK (status IN ('draft', 'promoted', 'registered', 'skipped', 'expired'))
INDEX youtube_extraction_candidates_session_idx ON youtube_extraction_candidates (extraction_session_id)
INDEX youtube_extraction_candidates_child_idx ON youtube_extraction_candidates (child_extraction_session_id) WHERE child_extraction_session_id IS NOT NULL
```

- RLS select는 parent `youtube_extraction_sessions.user_id = auth.uid()`일 때만 허용한다.
- insert/update는 route handler의 service-role 경로에서만 수행한다.
- `register_youtube_recipe_from_session`은 `multi_parent` 세션 직접 등록을 거부하고, `candidate_child` 등록 성공 시 parent candidate row를 `registered`로 갱신한다.

## 4-2c. youtube_llm_extraction_cache / youtube_llm_extraction_events `2026-06-01 addendum`

> YouTube 공개 텍스트를 Gemini structured fallback으로 구조화할 때만 사용하는 서버 전용 cache/event 테이블. Gemini는 source가 아니라 extractor이므로 `extraction_methods` 값은 늘리지 않는다.

### youtube_llm_extraction_cache

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | cache row ID |
| youtube_video_id | varchar(20) | NOT NULL | 영상 ID |
| source_hash | text | NOT NULL | 공개 source text + schema version 기반 hash |
| schema_version | text | NOT NULL | Gemini 응답 schema version |
| model | text | NOT NULL | cache를 생성한 Gemini model |
| source_kinds | text[] | NOT NULL, DEFAULT '{}' | `description`, `comment`, `caption`, `transcript` |
| result_json | jsonb | NOT NULL | 서버 검증 전 Gemini 구조화 결과. secret/provider raw response는 저장하지 않음 |
| expires_at | timestamptz | NOT NULL | 기본 90일 TTL |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| last_used_at | timestamptz | NOT NULL | 마지막 cache hit 시각 |

```
UNIQUE (youtube_video_id, source_hash, schema_version, model)
INDEX youtube_llm_extraction_cache_lookup_idx ON youtube_llm_extraction_cache (youtube_video_id, source_hash, expires_at DESC, last_used_at DESC)
```

### youtube_llm_extraction_events

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | event row ID |
| user_id | uuid | FK → users, nullable | 요청 사용자. 사용자 삭제 시 null 처리 |
| youtube_video_id | varchar(20) | NOT NULL | 영상 ID |
| provider | text | NOT NULL | `gemini` |
| model | text | nullable | 사용 또는 시도한 Gemini model |
| cache_hit | boolean | NOT NULL, DEFAULT false | cache 사용 여부 |
| status | text | NOT NULL | `success` / `unavailable` / `error` / `skipped` |
| reason | text | nullable | 실패/skip 이유 |
| input_tokens | integer | NOT NULL, DEFAULT 0 | provider usage metadata 기준 best-effort |
| output_tokens | integer | NOT NULL, DEFAULT 0 | provider usage metadata 기준 best-effort |
| estimated_cost_microusd | integer | NOT NULL, DEFAULT 0 | 추정 비용. 무료 tier 사용 시 0 가능 |
| created_at | timestamptz | NOT NULL | 이벤트 시각 |

```
INDEX youtube_llm_extraction_events_provider_day_idx ON youtube_llm_extraction_events (provider, status, created_at DESC)
INDEX youtube_llm_extraction_events_user_day_idx ON youtube_llm_extraction_events (user_id, provider, status, created_at DESC)
```

- 두 테이블 모두 RLS를 켜고 route handler service-role 경로에서만 insert/update한다.
- API key, cookie, provider raw response, 레시피오 결과, 사용자 로그인 세션 secret은 저장하지 않는다.
- 일일/사용자 한도 계산은 `youtube_llm_extraction_events`의 success event를 기준으로 한다.

## 4-2e. youtube_visual_extraction_cache / youtube_visual_extraction_events `2026-06-02 addendum`

> YouTube 화면 속 수량 텍스트를 visual quantity enrichment로 보강할 때 사용하는 서버 전용 cache/event 테이블. 기존 `youtube_llm_extraction_cache` / `youtube_llm_extraction_events`는 텍스트 구조화 fallback 전용이므로 재사용하지 않는다.

### youtube_visual_extraction_cache

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| youtube_video_id | varchar(20) | NOT NULL | 영상 ID |
| provider | text | NOT NULL | adapter provider (예: `gemini_visual_quantity`) |
| schema_version | text | NOT NULL | 요청 스키마 버전 |
| visual_request_hash | text | NOT NULL | adapter kind + URL/video id + prompt/schema version + candidate time range + trigger context의 해시 |
| result_json | jsonb | NOT NULL | sanitized structured result (raw video/frame/provider response/secret/레시피오 data 금지) |
| expires_at | timestamptz | NOT NULL | cache 만료 시각 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

```
UNIQUE (youtube_video_id, provider, schema_version, visual_request_hash)
INDEX youtube_visual_extraction_cache_lookup_idx ON youtube_visual_extraction_cache (youtube_video_id, provider, schema_version, expires_at DESC)
```

### youtube_visual_extraction_events

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| user_id | uuid | NOT NULL, FK → auth.users | 요청 사용자 |
| youtube_video_id | varchar(20) | NOT NULL | 영상 ID |
| provider | text | NOT NULL | adapter provider |
| event_type | varchar(20) | NOT NULL | `attempted` / `cache_hit` / `quota_denied` / `success` / `error` |
| trigger_reason | text | nullable | enrichment 트리거 사유 |
| schema_version | text | NOT NULL | 스키마 버전 |
| usage_json | jsonb | NOT NULL, DEFAULT '{}' | 토큰/비용 사용량 요약 |
| error_code | text | nullable | 에러 코드 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | 이벤트 시각 |

```
INDEX youtube_visual_extraction_events_provider_day_idx ON youtube_visual_extraction_events (provider, event_type, created_at DESC)
INDEX youtube_visual_extraction_events_user_day_idx ON youtube_visual_extraction_events (user_id, provider, event_type, created_at DESC)
```

- 두 테이블 모두 RLS를 켜고 route handler service-role 경로에서만 insert/update한다.
- API key, provider raw response, raw video, raw frame, secret, 레시피오 결과는 저장하지 않는다.
- 일일/사용자 한도 계산은 `youtube_visual_extraction_events`의 `attempted` + `success` event를 기준으로 한다.

## 4-2d. register_youtube_ingredient(...) RPC `v1.3.5 신규`

> YT_IMPORT 검수 단계에서 DB에 없는 재료를 사용자 확인 후 표준 재료로 등록하거나 기존 표준 재료를 재사용한다. `ingredients`와 optional `ingredient_synonyms` 처리를 하나의 transaction 안에서 수행한다.

### 입력

| 파라미터 | 타입 | 설명 |
| --- | --- | --- |
| p_standard_name | text | trim/collapse 후 표준 재료명 |
| p_category | text | v1 canonical 카테고리 8종(`채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`) |
| p_category_code | text nullable | v2 `ingredient_categories.code`. 없으면 `p_category`로 fallback 매핑 |
| p_default_unit | text nullable | 기본 단위 |
| p_synonym | text nullable | optional synonym |

### 처리

1. `p_category_code`가 있으면 active `ingredient_categories.code`인지 검증하고, 없으면 `p_category` v1 label로 fallback 매핑
2. `ingredients(standard_name, category, category_code, default_unit)` INSERT. `standard_name` conflict 시 기존 row 재사용
3. 생성/재사용된 ingredient row 조회
4. synonym이 null/빈값이면 `not_requested`
5. `lower(trim(p_synonym)) === lower(trim(p_standard_name))`이면 `skipped_same_as_standard`
6. 같은 normalized synonym이 다른 ingredient에 이미 있으면 best-effort advisory query로 `skipped_ambiguous`
7. 안전하면 `ingredient_synonyms(ingredient_id, synonym)` INSERT, `(ingredient_id, synonym)` conflict는 `already_attached`

### 반환

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| ingredient_id | uuid | 생성/재사용된 재료 ID |
| standard_name | text | canonical 표준명 |
| category | text | 카테고리 |
| category_code | text nullable | v2 소분류 코드 |
| default_unit | text nullable | 기본 단위 |
| synonym_status | text | `attached` / `already_attached` / `skipped_same_as_standard` / `skipped_ambiguous` / `not_requested` |

> `ingredient_synonyms`에는 global `UNIQUE(synonym)`을 추가하지 않는다. 경합으로 같은 synonym이 여러 ingredient에 연결돼도 기존 `findIngredientIds` matching은 multi-candidate를 `needs_review`로 반환한다.

## 4-3. recipe_sources `v1.3.4 변경`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| recipe_id | uuid | FK → recipes, UNIQUE | 1:1 |
| youtube_url | text | nullable | 유튜브 원본 URL |
| youtube_video_id | varchar(20) | nullable | 영상 ID |
| youtube_extraction_session_id | uuid | FK → youtube_extraction_sessions, nullable | 추출 세션 참조 (provenance) |
| extraction_methods | text[] | NOT NULL, DEFAULT '{}' | `description`, `comment`, `caption` (YouTube session에서 복사. v1.3.11 정리: 실제 YouTube 추출에서 사용하는 공개 텍스트 source만 기록. `ocr`/`asr`/`estimation`/`manual`은 v1 미사용) |
| extraction_meta_json | jsonb | NOT NULL, DEFAULT '{}' | 단계별 메타 |
| raw_extracted_text | text | nullable | 원본 추출 텍스트 |

## 4-4. recipe_ingredients

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| recipe_id | uuid | FK → recipes |  |
| ingredient_id | uuid | FK → ingredients |  |
| amount | decimal(10,2) | nullable | 수량 |
| unit | varchar(20) | nullable | 단위 |
| ingredient_type | enum | NOT NULL | `QUANT` / `TO_TASTE` |
| display_text | varchar(200) | nullable | 표시용 원문 |
| component_label | text | nullable | YouTube 설명란 섹션 라벨. 예: `빵 반죽`, `커스터드 필링`. `display_text`에 같은 `[섹션명]` prefix를 중복 저장하지 않음 |
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

## 4-5. recipe_steps

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
| component_label | text | nullable | YouTube 설명란 단계 섹션 라벨. 예: `빵 성형`, `마무리`. `instruction`에 같은 `[섹션명]` prefix를 중복 저장하지 않음 |

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
| name | varchar(30) | NOT NULL | 끼니 컬럼명 |
| sort_order | int | NOT NULL | 컬럼 순서 |
| created_at | timestamptz | NOT NULL |  |
- 공개 제품 계약상 신규 사용자 기본 planner slot은 `아침 / 점심 / 저녁` 3개다.
- 사용자는 설정 화면에서 끼니 컬럼 이름 변경, 추가, 삭제를 할 수 있다.
- 사용자별 컬럼 수는 최소 1개, 최대 5개다.
- 기존 사용자에게 이미 생성된 컬럼은 자동 삭제하지 않는다.
- 컬럼 삭제는 해당 컬럼에 연결된 `meals`가 없을 때만 허용한다.
- 순서 변경 API는 1차 구현 범위가 아니다. 신규 컬럼은 현재 마지막 `sort_order + 1`로 생성하고, 삭제 후 남은 컬럼은 `sort_order ASC, id ASC` 기준으로 0부터 재정렬한다.
- **UNIQUE**: `(user_id, sort_order)`

## 5-2. meals

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| recipe_id | uuid | FK → recipes |  |
| plan_date | date | NOT NULL | 날짜 |
| column_id | uuid | FK → meal_plan_columns | 시스템 고정 끼니 슬롯 |
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
> - `MEAL_SCREEN`에서 `shopping_done` 상태의 개별 식사 [요리하기] 클릭 시 세션 생성
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
| cooking_servings | int | NOT NULL, DEFAULT 1 | 남은요리를 만든 요리 인분 |
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
CHECK (cooking_servings>0)
```

> `source_meal_label`과 `source_planned_servings` API 응답은 별도 컬럼을 추가하지 않고, `meals.leftover_dish_id`와 `meal_plan_columns`를 조인해 최신 연결 meal 기준으로 계산한다.

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
| cover_color_key | varchar(20) | NULL | 레시피북 커버 색상. `sage` / `sky` / `coral` / `lavender` / `sand` |
| cover_image_url | text | NULL | 사용자가 지정한 커버 이미지 URL |
| sort_order | int | NOT NULL, DEFAULT 0 | 표시 순서 |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

> **v1.3 정합화**
>
> - 시스템 레시피북도 **실제 row로 존재**
> - `id`는 시스템/커스텀 모두 uuid
> - 구분은 오직 `book_type`으로만 수행
> - 커버 색상/이미지는 레시피북 다이어리 UI 전용 메타데이터이며 레시피 저장 정책에는 영향을 주지 않는다.

### CHECK

```
CHECK (cover_color_key IS NULL OR cover_color_key IN ('sage','sky','coral','lavender','sand'))
CHECK (cover_image_url IS NULL OR char_length(cover_image_url) <= 2048)
```

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


# 11-2. 사용자 진도 (User Progress) `user-progress 예정`

> `operational_events`는 시스템 운영 로그이며, 사용자 보상 truth로 재사용하지 않는다.
> 사용자 진도는 전용 ledger/read model을 사용한다.

## 11-2a. user_progress_events (전용 ledger)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| user_id | uuid | FK → users, NOT NULL | |
| event_type | text | NOT NULL | `cooking_completed` / `shopping_completed` / `recipe_saved` / `custom_book_created` |
| source_key | text | NOT NULL | 멱등성 키. 형식: `{event_type}:{source_id}` 또는 `recipe_saved:{user_id}:{recipe_id}` |
| source_table | text | NOT NULL | source of truth 테이블명 (예: `leftover_dishes`, `shopping_lists`, `recipe_book_items`, `recipe_books`) |
| source_id | uuid | NOT NULL | source 테이블의 PK |
| xp_delta | integer | NOT NULL, CHECK (xp_delta > 0) | 이 이벤트로 획득한 XP |
| occurred_at | timestamptz | NOT NULL | source row의 발생 시각 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | ledger 기록 시각 |

- **UNIQUE**: `(user_id, event_type, source_key)` — 중복 award 방지
- **인덱스**: `(user_id, created_at DESC)` — 사용자별 이벤트 이력

### Canonical Event Map

| event_type | source of truth | award moment | idempotency key | exclusions |
| --- | --- | --- | --- | --- |
| `cooking_completed` | `leftover_dishes.id` | planner/standalone cooking completion이 leftover_dishes row를 확정한 직후 | `cooking_completed:{leftover_dish_id}` | `cooking_sessions.status` 단독, `meals.status` 단독 기준 award 금지 |
| `shopping_completed` | `shopping_lists.is_completed=true` and `completed_at IS NOT NULL` | 미완료 list가 완료로 전환된 직후 | `shopping_completed:{shopping_list_id}` | 이미 완료된 retry 재적립 금지 |
| `recipe_saved` | user+recipe saved/custom membership transition `0 → ≥1` | 저장 성공 후 최초 savable membership이 생긴 직후 | `recipe_saved:{user_id}:{recipe_id}` | `liked`, `my_added`, 추가 saved/custom membership, duplicate insert, ledger 존재 후 unsave/resave 재적립 제외 |
| `custom_book_created` | `recipe_books.book_type='custom'` | custom book INSERT 성공 직후 | `custom_book_created:{recipe_book_id}` | `my_added`/`saved`/`liked` bootstrap system books 제외 |

### Backfill Policy

- legacy backfill은 surviving rows 기준 lower-bound이다.
- 삭제된 custom book, 저장 해제된 recipe membership, 삭제된 과거 활동은 복원됐다고 주장하지 않는다.
- 33a 배포 이후 live writer로 기록되는 신규 활동부터 forward-accurate하다.

## 11-2b. user_progress_summary (projection/read model)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| user_id | uuid | PK, FK → users | |
| total_xp | integer | NOT NULL, DEFAULT 0 | 누적 총 XP |
| current_level | integer | NOT NULL, DEFAULT 1 | 현재 레벨 |
| event_counts | jsonb | NOT NULL, DEFAULT '{}' | `{ cooking_completed, shopping_completed, recipe_saved_distinct_ever, custom_book_created }` |
| last_event_at | timestamptz | NULL | 마지막 XP 이벤트 발생 시각 |
| last_updated_at | timestamptz | NOT NULL, DEFAULT now() | projection 갱신 시각 |

- XP curve와 level 계산은 server authority이다. 클라이언트에 XP curve 공식을 복제하지 않는다.
- `event_counts.recipe_saved_distinct_ever`는 ledger 기준 distinct-ever이며, 현재 membership 수나 `recipes.save_count`가 아니다.
- 33a는 season reset, streak multiplier, XP decay, leaderboard, 대표 배지 선택을 포함하지 않는다.


---

# 12. Admin Foundation `v1.3.8 신규`

## 12-1. admin_members

관리자 신원의 단일 진실 소스. OAuth 로그인 사용자 중 관리자 권한이 부여된 사용자 목록.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | 레코드 ID |
| user_id | uuid | FK → auth.users(id), UNIQUE, NOT NULL | Supabase Auth 사용자 ID |
| role | text | NOT NULL, default 'viewer' | 관리자 역할 (MVP: 'viewer'만 사용) |
| granted_by | uuid | FK → auth.users(id), NULL 허용 | 권한 부여자 (최초 등록 시 NULL) |
| granted_at | timestamptz | NOT NULL, default now() | 권한 부여 시각 |
| created_at | timestamptz | NOT NULL, default now() | 레코드 생성 시각 |

- **인덱스**: `idx_admin_members_user_id` ON (user_id) — UNIQUE
- **RLS**: service-role만 접근 가능. anon/authenticated 직접 접근 금지
- **최초 admin 등록**: Supabase SQL (`INSERT INTO admin_members (user_id, role) VALUES ('<operator-uuid>', 'viewer')`) 또는 service-role API로 직접 등록. 환경변수 허용목록(allowlist) 우회 패턴 사용 금지

## 12-2. operational_events

시스템 수준 운영 이벤트 기록. 관리자 대시보드에서 조회.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | 이벤트 ID |
| event_type | text | NOT NULL | 이벤트 유형 (예: 'auth_failure', 'youtube_provider_failure', 'account_delete_success', 'account_delete_failure', 'admin_service_role_missing', 'unhandled_server_error') |
| severity | text | NOT NULL, default 'info' | 심각도 ('info', 'warn', 'error', 'critical') |
| source | text | NOT NULL | 이벤트 발생 소스 (예: 'auth', 'youtube', 'admin', 'api') |
| actor_user_id | uuid | NULL 허용 | 행위자 사용자 ID (시스템 이벤트 시 NULL) |
| target_user_id | uuid | NULL 허용 | 대상 사용자 ID |
| request_path | text | NULL 허용 | 요청 경로 (pathname만, 쿼리스트링 제외) |
| http_status | integer | NULL 허용 | HTTP 상태 코드 |
| error_code | text | NULL 허용 | 에러 코드 |
| message_summary | text | NULL 허용 | 이벤트 요약 메시지 |
| metadata_json | jsonb | NULL 허용, default '{}' | 추가 메타데이터 (PII 포함 금지: OAuth 토큰, OAuth code/next/error 쿼리 값, YouTube URL, YouTube 자막/소스 텍스트, 관리자 검색어/이메일/닉네임, 비공개 장보기/팬트리 상세 금지) |
| created_at | timestamptz | NOT NULL, default now() | 이벤트 발생 시각 |

- **인덱스**:
  - `idx_operational_events_type` ON (event_type)
  - `idx_operational_events_severity` ON (severity)
  - `idx_operational_events_created_at` ON (created_at DESC)
  - `idx_operational_events_source` ON (source)
- **RLS**: service-role만 INSERT/SELECT 가능. anon/authenticated 직접 접근 금지
- **최소 이벤트 소스**: OAuth/인증 콜백 실패, YouTube validate/extract/register 프로바이더 실패, 계정 삭제 성공/실패, Admin API service-role 누락 실패, 선별된 라우트 핸들러 미처리 서버 에러

## 12-3. admin_audit_logs

관리자 행위 감사 로그. 모든 관리자 API 호출과 관리 페이지 접근을 기록.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | 감사 로그 ID |
| actor_admin_user_id | uuid | FK → auth.users(id), NOT NULL | 행위 관리자의 사용자 ID |
| action | text | NOT NULL | 수행 동작 (예: 'admin_page_view', 'list_users', 'list_operational_events', 'list_audit_logs') |
| target_type | text | NULL 허용 | 대상 유형 (예: 'user_list', 'operational_event_list', 'audit_log_list', 'user_search') |
| target_id | text | NULL 허용 | 대상 ID (user_search 시 NULL — 검색어 저장 금지) |
| request_path | text | NOT NULL | 요청 경로 (pathname만, 쿼리스트링 제외) |
| result | text | NOT NULL, default 'success' | 결과 ('success', 'failure', 'forbidden') |
| ip_hash | text | NULL 허용 | IP 주소 해시 (원본 IP 저장 금지) |
| user_agent_hash | text | NULL 허용 | User-Agent 해시 (원본 UA 저장 금지) |
| created_at | timestamptz | NOT NULL, default now() | 감사 로그 생성 시각 |

- **인덱스**:
  - `idx_admin_audit_logs_actor` ON (actor_admin_user_id)
  - `idx_admin_audit_logs_action` ON (action)
  - `idx_admin_audit_logs_created_at` ON (created_at DESC)
  - `idx_admin_audit_logs_target_type` ON (target_type)
- **RLS**: service-role만 INSERT/SELECT 가능. anon/authenticated 직접 접근 금지
- **규칙**: 모든 `/api/v1/admin/*` 읽기는 감사 기록 작성. `/admin` 페이지 진입 시 `admin_page_view` 감사 기록 작성; 실패 시 fail closed
- **검색어 저장 금지**: target_type='user_search' 시 target_id=NULL 사용
- **ip_hash, user_agent_hash**: 원본 값이 아닌 해시 값만 저장하여 프라이버시 보호

---

# 13. 테이블 관계 요약

| 관계 | 카디널리티 | 설명 |
| --- | --- | --- |
| auth.users 1 — 1 admin_members | 1:1 | 관리자 신원 (user_id FK) `v1.3.8` |
| auth.users 1 — N admin_audit_logs | 1:N | 관리자 감사 로그 (actor_admin_user_id FK) `v1.3.8` |
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

# 14. 상태 전이와 관련 테이블 흐름

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
  leftover_dishes INSERT (cooking_servings = 세션 요리 인분)
  pantry_items DELETE (소진 체크 재료)
  recipes.cook_count += 1
```

## 13-3. 독립 요리 흐름

```
[RECIPE_DETAIL → 요리하기]
  session 없이 COOK_MODE 진입

[요리 완료]
  leftover_dishes INSERT (cooking_servings = 독립 요리 인분)
  pantry_items DELETE (선택 재료)
  recipes.cook_count += 1

  ⚠️ meals 상태 변경 없음
  ⚠️ cooking_sessions 생성 없음
```

---

# 15. 인덱스 권장

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
| recipes | `(created_at DESC, id DESC)` | 최신순 |
| recipes | `(save_count DESC)` | 저장순 |
| recipes | `(plan_count DESC)` | 플래너 등록순 |
| recipe_ingredients | `(recipe_id)` | 재료 조회 |
| recipe_ingredients | `(ingredient_id)` | 재료 역검색 |
| recipe_steps | `(recipe_id, step_number)` | 스텝 순서 조회 |
| pantry_items | `(user_id, ingredient_id)` | 팬트리 조회/제외 |
| leftover_dishes | `(user_id, status, cooked_at DESC)` | 남은요리 목록 |
| meals | `(leftover_dish_id, cooked_at DESC)` | 남은요리 카드의 최신 연결 끼니 메타 조회 |
| ingredient_synonyms | `(synonym)` | 동의어 검색 |
| recipe_book_items | `(book_id)` | 레시피북 상세 |
| recipe_book_items | `(recipe_id)` | 저장 수 집계 |
| cooking_methods | `(code)` | 조리방법 조회 |
| youtube_extraction_candidates | `(extraction_session_id)` | 다중 요리 후보 조회 |
| youtube_extraction_candidates | `(child_extraction_session_id)` | 선택 후보 child 세션 역조회 |
| user_progress_events | `(user_id, event_type, source_key)` UNIQUE | 중복 award 방지 `user-progress 예정` |
| user_progress_events | `(user_id, created_at DESC)` | 사용자별 이벤트 이력 `user-progress 예정` |
| admin_members | `(user_id)` UNIQUE | 관리자 조회 `v1.3.8` |
| operational_events | `(event_type)` | 이벤트 유형별 조회 `v1.3.8` |
| operational_events | `(severity)` | 심각도별 조회 `v1.3.8` |
| operational_events | `(created_at DESC)` | 시간순 조회 `v1.3.8` |
| operational_events | `(source)` | 소스별 조회 `v1.3.8` |
| admin_audit_logs | `(actor_admin_user_id)` | 관리자별 감사 조회 `v1.3.8` |
| admin_audit_logs | `(action)` | 동작별 감사 조회 `v1.3.8` |
| admin_audit_logs | `(created_at DESC)` | 시간순 감사 조회 `v1.3.8` |
| admin_audit_logs | `(target_type)` | 대상 유형별 감사 조회 `v1.3.8` |

---

# 16. 회원가입 시 자동 생성 항목

| 대상 | 내용 |
| --- | --- |
| meal_plan_columns × 3 | 아침 / 점심 / 저녁 |
| recipe_books × 3 | 내가 추가한 레시피 / 저장한 레시피 / 좋아요한 레시피 |

---

# 17. 전체 테이블 목록 (28개)

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
| 23 | user_progress_events | 사용자 진도 `user-progress 예정` |
| 24 | user_progress_summary | 사용자 진도 `user-progress 예정` |
| 25 | admin_members | Admin Foundation `v1.3.8` |
| 26 | operational_events | Admin Foundation `v1.3.8` |
| 27 | admin_audit_logs | Admin Foundation `v1.3.8` |
| 28 | youtube_extraction_candidates | YouTube 다중 후보 `2026-05-30` |

---

## 13. Supabase Storage `v1.3.10 추가`

### recipe-images 버킷

| 항목 | 값 |
| --- | --- |
| 버킷 이름 | `recipe-images` |
| 공개 여부 | public (읽기는 공개, 업로드는 인증 필수) |
| 경로 규칙 | `{user_id}/{uuid}.{ext}` |
| 허용 MIME | `image/jpeg`, `image/png`, `image/webp` |
| 최대 파일 크기 | 5MB |
| RLS | 인증 사용자는 자기 `user_id/` 하위에만 INSERT/DELETE 가능 |
| 목적 | 직접 등록 레시피의 사용자 업로드 이미지 저장 |

> YouTube 레시피 썸네일은 Storage에 저장하지 않는다 (원본 URL 보존).
> 저장 전 제거/교체된 미사용 객체의 정리 경로를 문서화해야 한다.

---

## v1.3 핵심 결정 로그 요약

- `shopping_list_items.sort_order` 추가 → 장보기 상세 드래그 정렬 지원
- 장보기 완료 후 리스트는 `shopping_lists.is_completed=true` 기준 read-only
- `added_to_pantry`는 “팬트리 반영 처리됨” 의미
- 팬트리 제외 섹션 이동 시 `is_checked=false` 자동 정리
- `color_key`는 `'unassigned'` 기본값 허용
- users는 soft delete 전제에 맞게 partial unique index 사용
- recipe_books id는 시스템/커스텀 모두 uuid, 구분은 book_type만 사용
