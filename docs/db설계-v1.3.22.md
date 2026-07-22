# DB 설계 v1.3.22

상태: 공식문서
담당자: 채실장
날짜: 7월 17

> **2026-07-21 contract-evolution — 영양 profile 보완 경계**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | 영양 결측 보완은 기존 source/item/profile/value/link table에 새 immutable version을 append하고 기존 active primary link를 같은 transaction에서 `superseded` 처리한다 | append-only replacement |
> | 2 | 다른 source의 nutrient field를 기존 profile에 합성하지 않으며 profile 하나는 source item 하나의 provenance를 유지한다 | source integrity |
> | 3 | 이번 변경은 신규 table/column/index/enum을 추가하지 않고 target table 수 50개를 유지한다 | schema compatibility |
>
> candidate HTML 검수 전에는 write를 허용하지 않는다. local apply 실패는 신규 row와 active pointer 전환을 모두 rollback하며 같은 승인 bundle replay는 duplicate write를 만들지 않는다.

> **2026-07-21 contract-evolution — 계량 실측값 계산 authority 보정**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `measurement_source_evidence.normalized_g_per_15ml`을 recipe 부피→질량 계산의 값 authority로 사용한다 | measurement evidence |
> | 2 | `ingredient_conversion_assignments`는 ingredient와 승인 evidence를 연결하는 검수 authority이며, 연결된 `measurement_conversion_profiles.representative_weight_g`는 신규 계산값으로 사용하지 않는다 | conversion assignment |
> | 3 | 기존 profile/assignment row와 FK는 과거 감사·호환을 위해 보존하고 이번 보정에서는 table/column/target table 수를 변경하지 않는다 | schema compatibility |
> | 4 | snapshot DB guard는 `normalized_g_per_15ml`을 input guard에 pin하고 `mL→g`와 `g→mL(100mL 영양 profile)` 양방향에서 같은 exactly-one 승인 경로·출처를 검증한다 | immutable input/source guard |
>
> 신규 계산은 `normalized_g_per_15ml > 0`인 active approved evidence와 active current approved source가 exactly one인 경우에만 허용한다. 제품별 값은 recipe ingredient의 product identity가 없으면 generic ingredient 계산에 합성하지 않는다. 아래 대표 profile 제약은 기존 row/import 호환 계약으로 남지만 recipe 계산식의 authority는 아니다.

> **v1.3.21 → v1.3.22 contract-evolution — 사용자 공동 제품·공공 완제품·영양 전수화 확장**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `food_products`는 `manual/public` shared row와 탈퇴 후 `owner_user_id IS NULL`인 anonymized shared row를 허용하고 `moderation_status`를 추가한다 | 완제품 catalog / CHECK / read-only |
> | 2 | `food_product_reports`를 추가해 shared manual 제품 신고 중복을 막고 moderation 근거를 보존한다 | moderation / audit |
> | 3 | legacy `private/manual`은 유지하되 자동 공개하지 않고, shared manual 생성/수정/soft-delete는 owner + `moderation_status='visible'`일 때만 허용한다 | legacy 호환 / owner lock |
> | 4 | public prepared-food stable key는 `external_product_key`에 품목제조보고번호 우선, 없으면 provider food code를 저장한다. manual row는 public stable key를 갖지 않는다 | 공공 완제품 key |
> | 5 | ingredient promotion 후 모든 active recipe snapshot backfill을 허용하되 ingredient coverage 완료 기준을 `approved primary 1개 또는 excluded reason`으로 잠근다 | batch backfill / coverage |
>
> 사용자는 2026-07-17에 이 계약을 승인했다. 신규 table 1개(`food_product_reports`)와 `food_products` column/additive CHECK를 포함하므로 target table 수는 **50개**가 된다. runtime 외부 API 검색은 금지하고, 기존 Recipe Meal / ProductPlannerEntry 분리, shopping/cooking/leftover/XP 제외, immutable version pin, 결측≠0 계약은 유지한다.

> **v1.3.20 → v1.3.21 contract-evolution — recipe 재료 기본 영양 선택의 비스키마 잠금**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `recipe_ingredients.amount + unit`을 조리에 실제 투입하는 가식부 사용량으로 정의한다 | 기존 recipe input 의미 명확화 |
> | 2 | `recipe_ingredients`에 `preparation_state`, `size_code`, `edible_state`를 추가하지 않는다 | schema/migration 비확장 |
> | 3 | 상태 미지정 직접 질량/호환 부피는 자격 있는 active approved primary 영양 link/profile이 전체 상태에서 정확히 1개일 때만 writer가 선택한다 | service selection guard |
> | 4 | 부피 환산도 자격 있는 active approved assignment/evidence 경로가 정확히 1개일 때만 사용하며, piece는 exact 크기·상태 근거 없이는 사용하지 않는다 | fail-closed conversion guard |
> | 5 | API `availability_reason`은 snapshot row 존재/조회 결과에서 파생하며 DB에 저장하지 않는다 | public projection / 컬럼 비추가 |
>
> 사용자는 2026-07-16에 이 최소 계약을 승인했다. 기존 검수 state를 recipe row에 복제하는 대안은 schema와 입력 부담을 늘리므로 거부했고, 여러 상태 후보 중 첫 row를 쓰는 대안은 잘못된 complete 위험 때문에 거부했다. 신규 table·column·enum·index·migration은 없고 target table 수는 **49개로 유지**한다. 기존 snapshot immutable payload와 `sources_json` 단일 authority도 유지한다.

> **v1.3.19 → v1.3.20 contract-evolution — recipe nutrition snapshot 출처 불변 보존 수정**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | 아직 구현되지 않은 `recipe_nutrition_snapshots` target에서 `nutrition_profile_id`를 제거한다 | recipe calculation authority 중복 제거 |
> | 2 | `sources_json jsonb NOT NULL DEFAULT '[]'`을 추가해 계산 당시 실제 기여한 승인 source의 안전한 6-field projection을 불변으로 pin한다 | recipe source attribution / 과거 Meal 안정성 |
> | 3 | `nutrient_status_json`, `scalable_values_json`, `fixed_values_json`, `base_servings`를 recipe 계산 결과의 단일 authority로 고정한다 | snapshot payload / API projection |
> | 4 | `nutrition_profiles`/`nutrition_values`는 read-only predecessor로 유지하고 `recipe_calculation` enum은 이 슬라이스에서 예약·미사용한다 | predecessor 권한 / 스키마 경계 |
>
> 사용자는 2026-07-15에 이 최소 contract-evolution을 명시적으로 승인했다. 실행 시점 current ingredient/source relation에서 attribution을 다시 계산하는 대안은 과거 Meal의 출처가 나중에 바뀌므로 거부했다. `recipe_calculation` profile과 새 연결 table로 표현하는 대안은 다중 source를 기존 profile의 단일 `source_item_id`로 표현하지 못하고, snapshot vector/status authority를 중복하며, predecessor read-only 범위를 넓히므로 거부했다.
>
> 이 target table은 아직 migration으로 구현되지 않아 기존 snapshot row를 변환할 필요가 없다. 신규 table·public endpoint·public field·status는 없고 target table 수는 **49개로 유지**한다. 일반 `anon/authenticated`는 snapshot payload/current pointer를 쓰거나 수정·삭제할 수 없다.

> **v1.3.18 → v1.3.19 contract-evolution — 레시피 영양 snapshot·완제품 catalog·완제품 planner 통합 잠금**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `meals.recipe_id NOT NULL`과 Recipe Meal 상태 전이를 유지하고 완제품은 `food_products` / immutable version / `product_planner_entries`로만 저장한다 | planner storage / 호환 |
> | 2 | recipe snapshot에 API `warnings[]`를 1:1 보존하는 `warnings_json`을 명시한다 | recipe 계산 provenance |
> | 3 | product nutrition version에 공개 `basis_relations[]`의 immutable 저장소 `basis_relations_json`을 추가하고 승인된 직접 관계만 수량 환산에 사용한다 | product quantity/basis |
> | 4 | public read-only, private owner-only, product entry/column owner 일치, immutable pin과 soft-delete 참조 보존을 재잠근다 | RLS / FK / 불변성 |
> | 5 | product entry가 shopping/cooking/leftover/recipe count·XP/activity와 `meals.status` 전이에 들어갈 구조를 두지 않는다 | workflow 구조적 제외 |
>
> 이 버전은 v1.3.18의 active current approved `nutrition_sources`·`nutrition_profiles`·`ingredient_nutrition_profiles`·`ingredient_conversion_assignments`·`piece_unit_weights`를 pinned predecessor로 소비한다. evidence/profile/assignment를 합치거나 미승인 후보를 계산에 사용하는 우회 경로를 추가하지 않는다. 신규 테이블은 없으며 target table 수는 **49개로 유지**한다.

> **v1.3.17 → v1.3.18 contract-evolution — 재료 영양·계량 환산 검수 경계**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `measurement_source_evidence`를 추가해 공공 원문 관측 사실을 서비스 대표 profile 및 재료별 assignment와 분리한다 | 계량 provenance |
> | 2 | nutrition source/item/profile/value에 기준량·1회 제공량·총내용량·가식부·원문 nutrient code/unit·결측 상태·freshness/version을 명시한다 | 영양 normalize |
> | 3 | 재료↔영양 link와 환산 assignment에 candidate/approve/reject/revoke/supersede 이력, confidence, 검수 actor와 active pointer를 추가한다 | 사람 검수 / audit |
> | 4 | piece weight는 evidence와 ingredient의 `size_code + preparation_state`가 정확히 일치하는 active approved row만 소비하도록 고정한다 | `개→g` fail-closed |
> | 5 | source raw artifact와 검수 테이블은 operator/service-role 전용 read-only/append-oriented layer로 두고 public API/UI surface를 추가하지 않는다 | RLS / public contract |
>
> 신규 1개 테이블을 포함한 영양·환산 target은 additive schema다. 15mL 관측값에서 대표 profile 후보를 만들 수 있지만 `<=2.5g` 경계와 동률 검사를 통과해도 사람 승인 전에는 활성화하지 않는다. 기존 public endpoint/response/화면, 레시피 영양 계산, 완제품, 플래너 계약은 이 버전에서 바꾸지 않는다.

> **v1.3.16 → v1.3.17 contract-evolution — 영양·완제품·플래너 snapshot**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | 영양소 정의, source/item provenance, immutable profile/value 5종 테이블을 추가한다 | 영양 공통 |
> | 2 | 재료 영양 연결, 대표 부피 환산 profile/assignment, 개당 중량 4종 테이블을 추가한다 | 재료 영양/환산 |
> | 3 | recipe nutrition snapshot을 추가하고 `meals`가 생성 당시 snapshot을 nullable로 pin한다 | 레시피/식단 플래너 |
> | 4 | `food_products`, immutable `food_product_nutrition_versions`, `product_planner_entries`를 Recipe/Meal과 분리해 추가한다 | 완제품 catalog/플래너 |
> | 5 | private/manual/public 권한, 결측≠0, source/license provenance, key 비노출, workflow 제외 제약을 고정한다 | RLS/보안/무결성 |
>
> 신규 13개 테이블은 additive target이며 기존 `meals.recipe_id NOT NULL`과 `registered → shopping_done → cook_done` 상태 전이를 유지한다. 영양 profile/snapshot/version은 insert 후 불변이다. 공공 source raw artifact와 API key는 이 schema의 사용자-facing row에 저장하지 않으며, 계량 evidence는 필요한 관측 사실과 출처/조회일/변환 결과만 제한 보존한다.

> **2026-07-10 addendum — social auth identity ownership**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | 1 | 새 소셜 로그인 사용자는 정규화된 비어 있지 않은 이메일을 필수로 한다 | DB NOT NULL 전환 없이 OAuth callback/bootstrap 경계에서 강제한다 |
> | 2 | `public.users.social_provider`는 최초 가입/primary provider 의미를 유지한다 | 연결된 identity 목록은 Supabase Auth를 truth로 사용하며 별도 app table/column을 추가하지 않는다 |
> | 3 | 동일 이메일 연결은 app user id와 callback Supabase user id가 같은 경우에만 허용한다 | id가 다르면 bootstrap/merge/delete를 수행하지 않는다 |
> | 4 | auth 실패 이벤트는 PII를 저장하지 않는다 | email, token, authorization code, provider payload, localStorage 값 저장 금지 |

> 기준 문서: 요구사항 기준선 v1.7.21 / 화면정의서 v1.5.27 / API 설계 v1.2.26 / 유저 Flow맵 v1.3.24
>
>
> 작성: 킴실장
>
> 리뷰: 채실장
>
> 원칙: **기획(요구사항/화면정의서) ↔ Flow ↔ API ↔ DB가 같은 말을 하도록 유지**
>

---

> **v1.3.15 → v1.3.16 변경 요약**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `tags`와 `recipe_tags` additive table을 추가해 레시피 태그 canonical 관계를 정규화한다 | 4 레시피 |
> | 2 | 기존 `recipes.tags`는 카드/레거시 API projection으로 유지한다. canonical write는 `recipe_tags` 기준이다 | 4-1 recipes |
> | 3 | 사용자 자유 태그와 시스템 의미 태그의 정책 경계를 위해 `kind`, `is_system`, `theme_eligible`, `visibility`, `review_status`를 정의한다 | 4-1a/4-1b |
> | 4 | 태그 검색/테마용 인덱스와 projection writer RPC 책임을 추가한다 | 15 인덱스 |
>

> **2026-06-20 addendum — LEFTOVERS 오래 보관 확인 서버 동기화**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | A | `계속 보관` 확인 시각을 서버 truth로 저장한다 | `leftover_dishes.stale_reviewed_at timestamptz nullable` 추가 |
> | B | 남은요리 상태 enum은 유지한다 | `leftover` / `eaten`만 유지하고 `discarded` / `expired` 상태는 추가하지 않는다 |

> **2026-06-16 addendum — planner column reorder**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | A | SETTINGS 끼니 컬럼 순서 변경을 공식화한다 | 기존 `meal_plan_columns.sort_order` 업데이트로 처리한다. 신규 테이블/컬럼 없음 |
> | B | 사용자별 순서 정합성을 명시한다 | 변경 후 같은 사용자 컬럼은 0부터 연속 정렬되며 `(user_id, sort_order)` UNIQUE를 유지한다 |

> **v1.3.14 → v1.3.15 변경 요약**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | 업적 앨범의 사용자별 획득 상태를 저장하는 `user_achievement_awards` additive table을 추가한다 | 11-2 사용자 성장/업적 |
> | 2 | 퀘스트를 튜토리얼 전용으로 축소하고, 업적 달성은 XP 지급과 분리한다 | 11-2 사용자 성장 |
> | 3 | 등급 band label을 `Clay`부터 `Titanium`까지로 갱신한다 | 11-2 사용자 진도 |
> | 4 | backfill 시 achievement state만 반영하고 historical toast/archive row를 만들지 않는 기준을 추가한다 | 11-2 사용자 성장 |
>
> **v1.3.13 → v1.3.14 변경 요약**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | `user_progress_events`에 `planner_registered`와 `source_meta_json`을 추가하고 XP ledger 전용 계약을 유지한다 | 11-2 사용자 진도 |
> | 2 | XP가 없는 성장 활동 ledger `user_growth_activity_events`를 추가한다 | 11-2 사용자 진도 |
> | 3 | `user_progress_summary`에 level curve version과 planner count 기준을 추가한다 | 11-2 사용자 진도 |
> | 4 | `user_progress_notifications`에 `level_up`, priority, delivery channel, toast eligibility, group key를 추가한다 | 11-2 사용자 성장 알림 |
>
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
> 정규화 태그 테이블(`tags`, `recipe_tags`)은 v1.3.16에서 scope 안으로 이동한다. 다중 이미지 테이블(`recipe_images`)은 계속 scope 밖이다.

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

nutrition_sources ─< nutrition_source_items ─< nutrition_profiles ─< nutrition_values
ingredients ─< ingredient_nutrition_profiles >── nutrition_profiles
nutrition_sources ─< measurement_source_evidence
measurement_source_evidence ─< ingredient_conversion_assignments
ingredients ─< ingredient_conversion_assignments >── measurement_conversion_profiles
measurement_source_evidence ─< piece_unit_weights >── ingredients
recipes ─< recipe_nutrition_snapshots <── meals (nullable pinned snapshot)
food_products ─< food_product_nutrition_versions >── nutrition_profiles
users ─< product_planner_entries >── food_products / food_product_nutrition_versions / meal_plan_columns

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
| email | varchar(255) | nullable | 소셜 로그인에서 받아오며 신규 social OAuth callback에서는 `trim().toLowerCase()` 후 비어 있지 않은 값을 필수로 함. QA/legacy 호환 때문에 이 slice에서는 DB NOT NULL 전환 없음 |
| profile_image_url | text | nullable | 프로필 이미지 |
| social_provider | enum | NOT NULL | 최초 가입/primary provider: `kakao` / `naver` / `google`. 연결 provider 로그인/수동 연결로 변경하지 않음 |
| social_id | varchar(255) | NOT NULL | 최초 가입/primary provider의 소셜 고유 ID. 추가 identity의 truth로 사용하지 않음 |
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

### Social identity linking 정책 `2026-07-10 추가`

- 연결된 provider identity의 canonical truth는 Supabase Auth의 현재 user identities다. `public.users`에 provider별 identity row나 연결 테이블을 중복 생성하지 않는다.
- 일반 OAuth callback은 정규화 이메일로 활성 `public.users`를 조회한다.
    - row 없음: callback Supabase user id로 신규 `public.users` bootstrap 허용
    - row 있음 + `users.id = auth.users.id`: 기존/연결 identity 로그인 허용
    - row 있음 + `users.id != auth.users.id`: conflict로 차단, INSERT/UPDATE/DELETE/merge 금지
- `users_email_unique_active`는 duplicate app row 생성을 막는 최종 DB 안전장치이며, 동일 이메일 문자열만으로 auth user를 merge하는 근거가 아니다.
- 수동 identity link callback은 기존 `public.users` row 생성/수정 없이 같은 Supabase user id에 identity가 추가됐는지만 검증한다.
- provider unlink, duplicate auth user merge, identity ownership 강제 이전은 이번 계약 범위 밖이다.

### 회원 탈퇴 cleanup RPC `v1.3.6 신규`

`delete_user_private_data(p_user_id uuid)`는 회원 탈퇴 시 한 transaction 안에서 사용자 개인 데이터를 정리한다. 이 RPC는 application-controlled `SECURITY DEFINER` 함수로 분류하며 service-role만 실행할 수 있다. service-role이 아닌 호출은 fail closed하고, exact signature / grant / owner / safe `search_path` inventory를 통과한 경우에만 유지한다.

| 대상 | 처리 |
| --- | --- |
| `users` | 인증된 사용자 row 삭제 |
| `recipe_books`, `meals`, `meal_plan_columns`, `shopping_lists`, `pantry_items`, `cooking_sessions`, `leftover_dishes`, `recipe_likes`, `youtube_extraction_sessions` 등 `user_id` FK를 가진 개인 데이터 | FK `ON DELETE CASCADE`로 삭제 |
| `recipes.created_by = p_user_id` | 레시피 row는 보존, `created_by`는 `ON DELETE SET NULL`로 익명화 |
| `food_products.owner_user_id = p_user_id AND source_type='manual' AND visibility='public'` | shared manual 제품은 보존, `owner_user_id=NULL`로 익명화하고 `moderation_status`/current version은 유지 |
| `food_product_nutrition_versions.created_by = p_user_id` | shared manual version provenance의 작성자 FK는 `NULL`로 익명화 |
| 삭제 사용자가 저장했던 recipe | 남은 `recipe_book_items` 기준으로 `recipes.save_count` 재계산 |
| 삭제 사용자가 좋아요한 recipe | 남은 `recipe_likes` 기준으로 `recipes.like_count` 재계산 |

권한 정책:

- authenticated의 직접 RPC 실행 권한은 부여하지 않는다.
- 서버 route가 authenticated caller와 `p_user_id`의 일치를 먼저 검증한 뒤 service-role client로 호출하며 authenticated fallback으로 우회하지 않는다.
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

# 2A. 영양 원본·profile·환산 (Nutrition)

> 공공 데이터는 운영자 batch에서 raw artifact와 manifest를 외부 artifact storage에 불변·read-only로 보존한 뒤, 제한된 정규화 row만 아래 검수 테이블에 append한다. API key, 인증 query, cookie, secret, raw provider response·원문 row는 DB, manifest URL, log, report에 저장하지 않는다. 아래 테이블은 public API가 아닌 internal/admin import contract다.

## 2A-1. nutrient_definitions

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| code | varchar(50) | PK | 내부 stable nutrient code |
| label | varchar(50) | NOT NULL | 사용자 표시명 |
| unit | varchar(10) | NOT NULL | `kcal / g / mg` |
| display_order | int | NOT NULL | 표시 순서 |
| is_core | boolean | NOT NULL, DEFAULT false | MVP 핵심 5종 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

MVP seed:

| code | label | unit | is_core |
| --- | --- | --- | --- |
| energy_kcal | 열량 | kcal | true |
| carbohydrate_g | 탄수화물 | g | true |
| protein_g | 단백질 | g | true |
| fat_g | 지방 | g | true |
| sodium_mg | 나트륨 | mg | true |
| sugars_g | 당류 | g | false |
| saturated_fat_g | 포화지방 | g | false |
| fiber_g | 식이섬유 | g | false |

## 2A-2. nutrition_sources

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | source version ID |
| provider_code | varchar(50) | NOT NULL | 제공기관 stable code |
| dataset_name | text | NOT NULL | dataset명 |
| source_kind | varchar(30) | NOT NULL | `nutrition_dataset / measurement_reference` |
| source_version | text | NOT NULL | 배포 version 또는 기준일 |
| data_basis_date | date | nullable | 데이터 기준일 |
| fetched_at | timestamptz | NOT NULL | 수집 시각 |
| freshness_checked_at | timestamptz | NOT NULL | 최신성 확인 시각 |
| freshness_status | varchar(20) | NOT NULL | `current / stale / drifted / unknown` |
| priority_rank | smallint | nullable | 호환 nutrition 후보 내부 우선순위. MFDS `1`, RDA 10.4 `2` |
| source_url | text | NOT NULL | API key/query를 제거한 공식 URL |
| license_name | text | NOT NULL | 확인한 이용조건/공공누리 유형 |
| license_url | text | nullable | 이용조건 URL |
| manifest_sha256 | text | NOT NULL | raw snapshot manifest checksum |
| review_status | varchar(20) | NOT NULL | `pending / approved / rejected / needs_source_check / superseded` |
| decision_reason | text | nullable | 승인/거절/source check/supersede 근거 |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| is_active | boolean | NOT NULL, DEFAULT false | 신규 후보 생성 가능 여부 |
| superseded_by_id | uuid | FK → nutrition_sources, nullable | 대체 source version |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
UNIQUE (provider_code, dataset_name, source_version, manifest_sha256)
CHECK (source_kind IN ('nutrition_dataset', 'measurement_reference'))
CHECK (freshness_status IN ('current', 'stale', 'drifted', 'unknown'))
CHECK (priority_rank IS NULL OR priority_rank > 0)
CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_source_check', 'superseded'))
CHECK (review_status NOT IN ('approved', 'rejected', 'superseded')
    OR (NULLIF(BTRIM(decision_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
CHECK (NOT is_active OR (review_status = 'approved' AND freshness_status = 'current'))
UNIQUE (provider_code, dataset_name) WHERE is_active
```

- source drift는 기존 row를 수정하지 않고 새 version을 `is_active=false`, `needs_source_check`로 append한다. 승인된 새 version을 활성화하고 이전 version을 supersede하는 변경은 한 transaction에서 수행한다.
- 우선순위는 재료명·조리상태·가식부·기준량이 호환되는 nutrition 후보끼리만 적용한다. rank가 승인이나 active 전환을 자동 수행하지 않는다.

## 2A-3. nutrition_source_items

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | source item ID |
| source_id | uuid | FK → nutrition_sources, NOT NULL | source version |
| external_item_key | text | NOT NULL | source food code 등 stable key |
| external_name | text | NOT NULL | 원본 식품명 |
| preparation_state | text | nullable | 생/조리/건조/형태 |
| source_basis_text | text | nullable | 원문 기준량. 파싱 실패를 `100g`으로 추정하지 않음 |
| source_basis_amount | numeric(12,4) | nullable | 안전하게 파싱된 원문 기준량 |
| source_basis_unit | varchar(20) | nullable | 원문 기준량 단위 |
| source_serving_amount | numeric(12,4) | nullable | 파싱된 1회 제공량 |
| source_serving_unit | varchar(20) | nullable | 원문 제공량 단위 |
| source_serving_text | text | nullable | 제한된 원문 제공량 표시 |
| source_total_content_amount | numeric(12,4) | nullable | 파싱된 총내용량 |
| source_total_content_unit | varchar(20) | nullable | 원문 총내용량 단위 |
| source_total_content_text | text | nullable | 제한된 원문 총내용량 표시 |
| edible_portion_percent | numeric(6,3) | nullable | 명시된 가식부 비율 |
| edible_portion_text | text | nullable | 제한된 원문 가식부 표시 |
| stable_fingerprint | text | NOT NULL | deterministic identity hash |
| review_status | varchar(20) | NOT NULL | `pending / approved / rejected / needs_review / needs_source_check / superseded` |
| decision_reason | text | nullable | 검수 결정 근거 |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| provenance_json | jsonb | NOT NULL, DEFAULT '{}' | 제한된 parse/missing reason. secret/raw payload 금지 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
UNIQUE (source_id, external_item_key)
UNIQUE (source_id, stable_fingerprint)
CHECK (edible_portion_percent IS NULL OR (edible_portion_percent > 0 AND edible_portion_percent <= 100))
CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_review', 'needs_source_check', 'superseded'))
CHECK (review_status NOT IN ('approved', 'rejected', 'superseded')
    OR (NULLIF(BTRIM(decision_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
```

- 원문 기준량·1회 제공량·총내용량·가식부는 서로 대체하지 않는다. 파싱하지 못한 값은 nullable parsed column과 제한된 원문 text/missing reason으로 보존한다.

## 2A-4. nutrition_profiles

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | immutable profile ID |
| source_item_id | uuid | FK → nutrition_source_items, nullable | 공공 source profile이면 필수 |
| profile_kind | varchar(30) | NOT NULL | `ingredient_source / product_label / recipe_calculation` |
| normalization_method | varchar(30) | NOT NULL | `mass_100g / volume_100ml / as_labeled / recipe_calculation` |
| basis_amount | numeric(12,4) | NOT NULL | 정규화 기준량 |
| basis_unit | varchar(20) | NOT NULL | `g / ml / serving / package / recipe` |
| version | int | NOT NULL, DEFAULT 1 | 대상별 immutable version |
| review_status | varchar(20) | NOT NULL | `pending / approved / rejected / revoked / superseded / self_reported` |
| decision_reason | text | nullable | 검수/철회/대체 근거 |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| is_active | boolean | NOT NULL, DEFAULT false | 신규 소비 가능 여부 |
| superseded_by_id | uuid | FK → nutrition_profiles, nullable | 대체 profile |
| created_by | uuid | FK → users, nullable | private manual profile 작성자 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
CHECK (basis_amount > 0)
CHECK (basis_unit IN ('g', 'ml', 'serving', 'package', 'recipe'))
CHECK (profile_kind IN ('ingredient_source', 'product_label', 'recipe_calculation'))
CHECK (normalization_method IN ('mass_100g', 'volume_100ml', 'as_labeled', 'recipe_calculation'))
CHECK (review_status IN ('pending', 'approved', 'rejected', 'revoked', 'superseded', 'self_reported'))
CHECK (review_status NOT IN ('approved', 'rejected', 'revoked', 'superseded')
    OR (NULLIF(BTRIM(decision_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
CHECK (NOT is_active OR review_status IN ('approved', 'self_reported'))
UNIQUE (source_item_id, profile_kind, version) WHERE source_item_id IS NOT NULL
UNIQUE (source_item_id, profile_kind) WHERE source_item_id IS NOT NULL AND is_active
```

- 안전하게 질량 정규화한 `ingredient_source` profile은 `basis_amount=100`, `basis_unit='g'`, `normalization_method='mass_100g'`다. source가 부피 기준만 제공하면 `100mL`를 유지하며 임의 밀도나 범용 개당 중량을 사용하지 않는다.
- basis/source/value payload는 insert 후 수정·삭제하지 않는다. 정정은 새 version을 append하고 기존 row를 revoke/supersede한 뒤 active pointer를 transaction으로 전환한다.
- `recipe_calculation` profile/normalization enum은 후속 명시 승인 계약을 위해 예약하되, `recipe-nutrition-calculation` 슬라이스는 해당 profile/value row를 생성·수정하지 않는다. recipe 집계의 authority는 `recipe_nutrition_snapshots` payload다.

## 2A-5. nutrition_values

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| profile_id | uuid | FK → nutrition_profiles, NOT NULL | profile |
| nutrient_code | varchar(50) | FK → nutrient_definitions(code), NOT NULL | 내부 영양소 code |
| source_nutrient_code | text | nullable | 제한된 원문 nutrient code |
| source_unit | varchar(20) | nullable | 원문 단위 |
| amount | numeric(14,6) | nullable | 기준량당 값. 원문 0은 `0`, 결측은 `null` |
| value_status | varchar(20) | NOT NULL | `observed / missing / trace / parse_error` |
| source_token | text | nullable | 제한된 원문 숫자 token. raw row 금지 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
PRIMARY KEY (profile_id, nutrient_code)
CHECK ((value_status = 'observed' AND amount IS NOT NULL AND amount >= 0)
    OR (value_status <> 'observed' AND amount IS NULL))
CHECK (value_status IN ('observed', 'missing', 'trace', 'parse_error'))
```

- 숫자 `0`과 결측은 row와 `value_status`로 구분한다. `missing / trace / parse_error`를 0으로 바꾸지 않으며 모든 value row는 profile과 함께 immutable하다.

## 2A-6. ingredient_nutrition_profiles

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 후보/결정 link ID |
| ingredient_id | uuid | FK → ingredients, NOT NULL | canonical ingredient |
| nutrition_profile_id | uuid | FK → nutrition_profiles, NOT NULL | 후보 profile |
| preparation_state | text | NOT NULL | 생/조리/건조/가식부 상태 |
| match_method | varchar(30) | NOT NULL | exact/synonym/normalized/manual 등 |
| confidence_score | numeric(5,4) | nullable | `0..1` 검수 참고값 |
| candidate_rank | int | nullable | 호환 후보 내부 순위 |
| is_primary | boolean | NOT NULL, DEFAULT false | 해당 상태의 active primary 여부 |
| review_status | varchar(20) | NOT NULL | `pending / needs_review / approved / rejected / revoked / superseded` |
| decision_reason | text | nullable | 승인/거절/대체 근거 |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| version | int | NOT NULL | link version |
| is_active | boolean | NOT NULL, DEFAULT false | 후속 소비 가능 여부 |
| superseded_by_id | uuid | FK → ingredient_nutrition_profiles, nullable | 대체 link |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
UNIQUE (ingredient_id, nutrition_profile_id, preparation_state, version)
UNIQUE (ingredient_id, preparation_state) WHERE is_primary AND is_active AND review_status = 'approved'
CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
CHECK (review_status IN ('pending', 'needs_review', 'approved', 'rejected', 'revoked', 'superseded'))
CHECK (review_status NOT IN ('approved', 'rejected', 'revoked', 'superseded')
    OR (NULLIF(BTRIM(decision_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
CHECK (NOT is_active OR (is_primary AND review_status = 'approved'))
```

- 후보 생성은 `pending` 또는 `needs_review`까지만 수행한다. source priority와 confidence는 사람 승인을 대신하지 않는다.
- 상태 전이는 `pending/needs_review → approved|rejected`, `approved → revoked|superseded`만 허용한다. 대체 시 새 row를 먼저 기록하고 이전 active row를 supersede하는 transaction을 사용한다.

## 2A-7. measurement_conversion_profiles

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | profile ID |
| code | varchar(30) | NOT NULL | `VOLUME_G6/G10/G15/G20/G25` |
| basis_volume_ml | numeric(8,3) | NOT NULL, DEFAULT 15 | 공통 기준 부피 |
| representative_weight_g | numeric(8,3) | NOT NULL | legacy 후보 분류·감사용 대표 g; 신규 계산에는 사용하지 않음 |
| display_rounding_g | numeric(8,3) | NOT NULL, DEFAULT 1 | 표시 반올림 단위 |
| display_qualifier | varchar(20) | NOT NULL, DEFAULT 'approximate' | 후속 소비자의 `약` 표시 신호 |
| version | int | NOT NULL | profile version |
| is_active | boolean | NOT NULL, DEFAULT true | 신규 후보 생성 가능 여부 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
CHECK (basis_volume_ml = 15)
CHECK (code IN ('VOLUME_G6', 'VOLUME_G10', 'VOLUME_G15', 'VOLUME_G20', 'VOLUME_G25'))
CHECK (representative_weight_g IN (6, 10, 15, 20, 25))
CHECK ((code = 'VOLUME_G6' AND representative_weight_g = 6)
    OR (code = 'VOLUME_G10' AND representative_weight_g = 10)
    OR (code = 'VOLUME_G15' AND representative_weight_g = 15)
    OR (code = 'VOLUME_G20' AND representative_weight_g = 20)
    OR (code = 'VOLUME_G25' AND representative_weight_g = 25))
CHECK (display_qualifier = 'approximate')
UNIQUE (code, version)
UNIQUE (code) WHERE is_active
```

- profile payload는 insert 후 수정·삭제하지 않는다. 새 version 활성화 transaction에서 기존 `is_active`만 `true → false`로 바꿀 수 있다.
- 기존 assignment는 과거 profile을 계속 참조하고 신규 후보만 현재 active version을 사용한다.

## 2A-8. measurement_source_evidence

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | immutable evidence ID |
| source_id | uuid | FK → nutrition_sources, NOT NULL | license/version 확인 source |
| source_item_id | uuid | FK → nutrition_source_items, nullable | 연관 source item |
| evidence_kind | varchar(20) | NOT NULL | `volume_weight / piece_weight` |
| source_subject | text | NOT NULL | 원문 재료명 또는 대상명 |
| preparation_state | text | NOT NULL | 형태/손질/가식부 상태 |
| size_code | varchar(20) | nullable | piece evidence의 크기 code |
| source_observed_unit | text | NOT NULL | 원래 계량 단위 |
| source_observed_amount | numeric(12,4) | NOT NULL | 원래 계량 수량 |
| observed_volume_ml | numeric(12,4) | nullable | volume evidence의 정규화 부피 |
| observed_weight_g | numeric(12,4) | NOT NULL | 원문 관측 질량 |
| normalized_g_per_15ml | numeric(12,4) | nullable | volume evidence만 사용 |
| source_url | text | NOT NULL | 인증 query가 없는 공식 URL |
| source_accessed_at | date | NOT NULL | 확인일 |
| evidence_fingerprint | text | NOT NULL | source/version/대상/값 deterministic hash |
| review_status | varchar(20) | NOT NULL | `pending / approved / rejected / needs_source_check / superseded` |
| decision_reason | text | nullable | evidence 검수/대체 근거 |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| version | int | NOT NULL | evidence version |
| is_active | boolean | NOT NULL, DEFAULT false | 신규 검수 근거로 사용 가능 여부 |
| superseded_by_id | uuid | FK → measurement_source_evidence, nullable | 대체 evidence |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
UNIQUE (source_id, evidence_fingerprint, version)
CHECK (source_observed_amount > 0 AND observed_weight_g > 0)
CHECK ((evidence_kind = 'volume_weight' AND observed_volume_ml > 0 AND normalized_g_per_15ml > 0 AND size_code IS NULL)
    OR (evidence_kind = 'piece_weight' AND observed_volume_ml IS NULL AND normalized_g_per_15ml IS NULL AND size_code IS NOT NULL))
CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_source_check', 'superseded'))
CHECK (review_status NOT IN ('approved', 'rejected', 'superseded')
    OR (NULLIF(BTRIM(decision_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
CHECK (NOT is_active OR review_status = 'approved')
```

- 농촌진흥청 양념재료 계량표 evidence는 자동 수집 원천이 아니라 제한된 사람 검수 근거다. 원문 표·문장·행/열 배치·페이지 이미지·전체 dataset은 저장하지 않는다.
- evidence 승인은 관측 사실을 검수 근거로 사용할 수 있다는 뜻일 뿐 profile 선택이나 재료 assignment 승인이 아니다.

## 2A-9. ingredient_conversion_assignments

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 후보/결정 assignment ID |
| ingredient_id | uuid | FK → ingredients, NOT NULL | 재료 |
| conversion_profile_id | uuid | FK → measurement_conversion_profiles, NOT NULL | 후보 대표 profile |
| evidence_id | uuid | FK → measurement_source_evidence, NOT NULL | 분리 보존된 원문 evidence |
| preparation_state | text | NOT NULL | 재료 형태/손질 상태 |
| distance_g_per_15ml | numeric(8,4) | NOT NULL | evidence와 대표값 절대 차이 |
| candidate_rank | int | NOT NULL | 최소 거리 rank. 동률 가능 |
| confidence_score | numeric(5,4) | nullable | `0..1` 검수 참고값 |
| assignment_reason | text | nullable | 승인/거절/대체 근거 |
| review_status | varchar(20) | NOT NULL | `pending / needs_review / approved / rejected / revoked / superseded` |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| version | int | NOT NULL | assignment version |
| is_active | boolean | NOT NULL, DEFAULT false | 후속 환산 사용 여부 |
| superseded_by_id | uuid | FK → ingredient_conversion_assignments, nullable | 대체 assignment |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
UNIQUE (ingredient_id, evidence_id, conversion_profile_id, version)
UNIQUE (ingredient_id, preparation_state) WHERE is_active AND review_status = 'approved'
CHECK (distance_g_per_15ml >= 0 AND distance_g_per_15ml <= 2.5)
CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
CHECK (review_status IN ('pending', 'needs_review', 'approved', 'rejected', 'revoked', 'superseded'))
CHECK (review_status NOT IN ('approved', 'rejected', 'revoked', 'superseded')
    OR (NULLIF(BTRIM(assignment_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
CHECK (NOT is_active OR review_status = 'approved')
```

- 후보 생성기는 최소 거리 `<=2.5g/15mL`만 append한다. 정확한 중간값은 같은 `candidate_rank`의 두 row를 `needs_review`, `is_active=false`로 남기며 하나를 임의 선택하지 않는다. 범위 내 후보가 없으면 assignment를 만들지 않고 import report에 `NO_PROFILE_WITHIN_DISTANCE`를 기록한다.
- 상태 전이는 `pending/needs_review → approved|rejected`, `approved → revoked|superseded`만 허용한다. 승인·대체는 한 transaction에서 active uniqueness를 보존하며 confidence가 자동 전이를 일으키지 않는다.

## 2A-10. piece_unit_weights

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 후보/결정 row ID |
| ingredient_id | uuid | FK → ingredients, NOT NULL | 재료 |
| evidence_id | uuid | FK → measurement_source_evidence, NOT NULL | `piece_weight` evidence |
| size_code | varchar(20) | NOT NULL | `small / medium / large` 등 승인 code |
| preparation_state | text | NOT NULL | 손질·가식부 상태 |
| weight_g | numeric(10,3) | NOT NULL | 1개당 g |
| review_status | varchar(20) | NOT NULL | `pending / needs_review / approved / rejected / revoked / superseded` |
| decision_reason | text | nullable | 승인/거절/철회/대체 근거 |
| reviewed_by | uuid | nullable | service-role 검수 actor 식별자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| version | int | NOT NULL | immutable version |
| is_active | boolean | NOT NULL, DEFAULT false | 후속 환산 사용 여부 |
| superseded_by_id | uuid | FK → piece_unit_weights, nullable | 대체 row |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
CHECK (weight_g > 0)
UNIQUE (ingredient_id, evidence_id, size_code, preparation_state, version)
UNIQUE (ingredient_id, size_code, preparation_state) WHERE is_active AND review_status = 'approved'
CHECK (review_status IN ('pending', 'needs_review', 'approved', 'rejected', 'revoked', 'superseded'))
CHECK (review_status NOT IN ('approved', 'rejected', 'revoked', 'superseded')
    OR (NULLIF(BTRIM(decision_reason), '') IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
CHECK (NOT is_active OR review_status = 'approved')
```

- `개→g`는 ingredient, `size_code`, `preparation_state`가 모두 일치하는 active approved row만 사용한다. 불일치·미승인·철회 시 `PIECE_WEIGHT_REQUIRED`로 fail-closed한다.

### 영양 테이블 권한/불변 정책

- raw artifact는 최초 capture 후 importer에게도 read-only이며, `nutrition_sources`부터 `piece_unit_weights`까지 ingestion/검수 write는 service-role/operator capability 전용이다. 기존 `admin_members` viewer 권한은 write 권한을 뜻하지 않는다.
- `anon`과 일반 `authenticated` 사용자는 raw/source/item/evidence/candidate table을 직접 조회·수정·삭제할 수 없다. 향후 public consumer는 approved attribution/profile의 최소 projection만 서버 계약을 통해 사용하며 이번 버전은 endpoint를 추가하지 않는다.
- payload row는 append-only다. 허용되는 UPDATE는 검수 결정, active pointer, superseded/revoked 연결과 감사 actor/time으로 제한하고 DELETE는 금지한다.
- 각 review decision table은 자신의 enum이 허용하는 `approved / rejected / revoked / superseded` 결정 상태에서만 공백이 아닌 reason과 `reviewed_by`, `reviewed_at` 전체를 CHECK로 강제한다. `pending / needs_review / needs_source_check / self_reported`는 이 triplet을 강제하지 않으며, `needs_source_check`에 남긴 drift 사유는 보존할 수 있다.
- source/license/freshness가 승인되지 않았거나 `needs_source_check/stale/drifted/unknown`이면 후보 생성과 production 소비에서 제외한다.
- production coverage gate는 모든 active canonical ingredient가 `approved primary 1개` 또는 operator-authored excluded decision artifact 중 하나를 가져야 통과한다. excluded는 `0` 영양 row나 가짜 active profile로 표현하지 않는다.
- production import는 별도 승인 전 0 writes다. dry-run, 실패, 재시도, 중복 input은 승인 row나 active pointer를 바꾸지 않는다.

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
| tags | text[] | NOT NULL, DEFAULT '{}' | 카드/레거시 API용 tag label projection. canonical truth는 `recipe_tags`. projection 갱신 실패 시 `recipe_tags`를 우선 source로 repair한다 `v1.3.16 계약` |
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

`increment_recipe_view_count(p_recipe_id uuid)`는 `recipes.view_count = recipes.view_count + 1`을 DB에서 원자적으로 실행하고 `id, view_count`를 반환하는 application-controlled `SECURITY DEFINER` 함수다. PUBLIC/anon/authenticated 실행은 회수하고 service-role에만 허용하며 안전한 `search_path` inventory를 통과해야 한다.
`GET /recipes/{recipe_id}`는 service-role client가 있을 때 응답 전 이 RPC를 기다려 HOME의 조회수 정렬/카드 지표가 실제 저장값과 어긋나지 않게 한다. service-role client가 없으면 공개 read availability를 유지하고 조회수 mutation 없이 현재 저장값을 반환한다.

### CHECK

```
CHECK (base_servings>0)
CHECK (view_count>=0AND like_count>=0AND save_count>=0AND plan_count>=0AND cook_count>=0)
```

## 4-1a. tags `v1.3.16 신규`

> 레시피 태그 dictionary. 시스템 의미 태그, source 태그, 사용자 자유 태그의 정책 경계를 저장한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| normalized_key | varchar(50) | NOT NULL, UNIQUE | 정규화 key. P0에서는 한글 label을 그대로 사용한다. 자동 로마자 변환 금지 |
| label | varchar(50) | NOT NULL | 사용자 표시 label |
| slug | varchar(80) | nullable, UNIQUE | URL-friendly 값이 필요한 seed/system tag에만 수동 지정 |
| kind | varchar(20) | NOT NULL | `semantic` / `ingredient` / `method` / `source` / `user` |
| is_system | boolean | NOT NULL, DEFAULT false | 서버 seed 또는 운영 승인 tag |
| theme_eligible | boolean | NOT NULL, DEFAULT false | HOME theme seed 사용 가능 여부 |
| usage_count | int | NOT NULL, DEFAULT 0 | `recipe_tags` public/approved 관계 기준 projection count |
| created_by | uuid | FK → users, nullable | 사용자 자유 tag 최초 생성자. 시스템 tag는 null |
| created_at | timestamptz | NOT NULL |  |
| updated_at | timestamptz | NOT NULL |  |

### tags seed policy

- P0 semantic seed 35개는 `kind='semantic'`, `is_system=true`, `theme_eligible=true`로 생성할 수 있다.
- `유튜브레시피` 1개는 `kind='source'`, `is_system=true`, `theme_eligible=true`로 생성한다. P0 semantic/source seed 합계는 36개다.
- 사용자 자유 tag는 기본 `kind='user'`, `is_system=false`, `theme_eligible=false`이다.
- `normalized_key`는 lowercase/trim 같은 ASCII 변환보다 한글 label 보존을 우선한다. 예: `한식` → `한식`, `김치` → `김치`.
- `slug`는 자동 romanization으로 만들지 않는다. 필요한 시스템 tag만 seed 또는 운영 승인으로 입력한다.

## 4-1b. recipe_tags `v1.3.16 신규`

> recipe와 tag의 canonical 관계. 표시/검색/테마 정책은 이 테이블의 상태를 기준으로 한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| recipe_id | uuid | FK → recipes, NOT NULL |  |
| tag_id | uuid | FK → tags, NOT NULL |  |
| source | varchar(20) | NOT NULL | `system_suggested` / `user_reviewed` / `provider` / `backfill` / `admin` |
| confidence | numeric(4,3) | nullable | 서버 추천 confidence. 사용자 입력은 null 가능 |
| visibility | varchar(20) | NOT NULL, DEFAULT 'public_pending' | `public` / `private` / `public_pending` |
| review_status | varchar(20) | NOT NULL, DEFAULT 'pending' | `approved` / `pending` / `rejected` |
| sort_order | int | NOT NULL, DEFAULT 0 | recipe card projection 순서 |
| created_by | uuid | FK → users, nullable | 사용자 검수/추가 주체 |
| created_at | timestamptz | NOT NULL |  |

- **PK**: `(recipe_id, tag_id)`
- **CHECK**: `visibility IN ('public', 'private', 'public_pending')`
- **CHECK**: `review_status IN ('approved', 'pending', 'rejected')`
- **CHECK**: `source IN ('system_suggested', 'user_reviewed', 'provider', 'backfill', 'admin')`

### Tag projection writer

`set_recipe_tags(p_recipe_id uuid, p_tags jsonb, p_actor_user_id uuid, p_source text)` 같은 RPC 또는 동등한 DB transaction writer가 아래 작업을 한 번에 처리한다.

1. tag label 정규화와 `tags` UPSERT
2. `recipe_tags` 관계 upsert/delete
3. `recipes.tags` projection 갱신
4. `tags.usage_count` 재계산 또는 delta 갱신

API route에서 `recipe_tags`만 쓰고 `recipes.tags` projection을 나중에 맞추는 비동기 방식은 P0에서 금지한다.
시스템 semantic/source tag writer는 `visibility='public'`, `review_status='approved'`를 명시해야 한다. 사용자 자유 tag writer는 운영 승인 전 `public_pending/pending` 또는 `private/pending`을 유지한다.

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

> YT_IMPORT 검수 단계에서 DB에 없는 재료를 사용자 확인 후 표준 재료로 등록하거나 기존 표준 재료를 재사용한다. `ingredients`와 optional `ingredient_synonyms` 처리를 하나의 transaction 안에서 수행한다. 동일 이름의 두 오버로드가 있더라도 모두 service-role 전용이며, exact signature / grant / owner / safe `search_path` inventory를 통과한 application-controlled `SECURITY DEFINER` 함수만 유지한다. anon/authenticated 직접 실행은 fail closed한다.

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
> 두 RPC 오버로드는 service-role only다. Route Handler가 authenticated caller, extraction session 소유권/상태, 사용자별 최근 10분 20회 한도를 검증하고 caller/session provenance를 `operational_events`에 저장한 뒤에만 호출한다. authenticated/anon 직접 RPC와 provenance 저장 실패 시 mutation을 거부한다.

### taxonomy mutation rate-limit RPC `v1.3.22 보안 보강`

`consume_youtube_ingredient_registration_rate_limit(p_user_id uuid, p_extraction_id uuid, p_draft_ingredient_id uuid, p_request_path text)`는 application-controlled `SECURITY DEFINER` service-internal 함수다. PUBLIC/anon/authenticated 실행은 회수하고 service-role에만 허용한다.

- `p_user_id`별 transaction advisory lock을 먼저 획득한다.
- 같은 transaction에서 `youtube_ingredient_registration_attempt` provenance를 `operational_events`에 append하고 최근 10분 attempt 수를 계산한다.
- `attempt_count <= 20`이면 `allowed=true`, 21번째부터 `allowed=false`를 반환한다.
- `(actor_user_id, created_at DESC)` partial index는 해당 event type에만 적용한다.
- Route Handler는 authenticated caller와 extraction session을 검증한 뒤 이 RPC를 호출하며, 오류·결과 없음·`allowed=false`이면 taxonomy mutation RPC를 호출하지 않는다.

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
| recipe_id | uuid | FK → recipes, NOT NULL | Recipe Meal 전용. 완제품을 nullable recipe로 저장하지 않음 |
| ingredient_id | uuid | FK → ingredients |  |
| amount | decimal(10,2) | nullable | 정량 재료는 조리에 실제 투입하는 가식부 사용량. 껍질·뼈 포함 구매 총중량 아님 |
| unit | varchar(20) | nullable | `amount`의 실제 투입량 단위 |
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

- recipe 계산을 위해 `preparation_state`, `size_code`, `edible_state` 컬럼을 추가하지 않는다. 정량 `amount + unit`에 별도 가식부율을 다시 적용하지 않는다.
- 상태 미지정 직접 질량/호환 부피는 current approved source/profile에 연결된 `is_active=true AND review_status='approved' AND is_primary=true` link 후보가 전체 `preparation_state`에서 정확히 1개일 때만 service writer가 선택한다. 0개 또는 복수면 DB 정렬 순서로 고르지 않고 partial/unavailable reason을 기록한다.
- 부피 환산도 자격 있는 active approved assignment와 evidence/source 경로가 전체 상태에서 정확히 1개일 때만 사용한다. `개/장`은 exact size/preparation 근거가 recipe 입력에 없으면 piece weight를 사용하지 않으며, 직접 질량 입력에는 piece size를 요구하지 않는다.

## 4-5. recipe_steps

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| recipe_id | uuid | FK → recipes, NOT NULL | Recipe Meal 전용. 완제품 연결 금지 |
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

## 4-6. recipe_nutrition_snapshots `v1.3.17 신규`, `v1.3.20 수정`, `v1.3.21 계약 명확화`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | immutable snapshot ID |
| recipe_id | uuid | FK → recipes, NOT NULL | 대상 recipe |
| base_servings | numeric(8,2) | NOT NULL | 계산 당시 기본 인분 |
| input_hash | text | NOT NULL | 재료/profile/환산/version deterministic hash |
| calculation_version | varchar(50) | NOT NULL | 계산기/등급 version |
| scalable_values_json | jsonb | NOT NULL, DEFAULT '{}' | 인분 비례 영양 숫자 map; API `scalable_values`와 같은 nutrient key |
| fixed_values_json | jsonb | NOT NULL, DEFAULT '{}' | `scalable=false` 고정 영양 숫자 map; API `fixed_values`와 같은 nutrient key |
| nutrient_status_json | jsonb | NOT NULL, DEFAULT '{}' | API `values`의 영양소별 amount/known_amount/status/display_mode 단일 authority |
| calculation_status | varchar(20) | NOT NULL | 핵심 5종 요약 상태 |
| calculation_quality | varchar(20) | nullable | 계산 가능 시 `direct/estimated/mixed`, 전체 unavailable이면 null |
| reflected_ingredient_count | int | NOT NULL | 반영한 정량 재료 수 |
| target_ingredient_count | int | NOT NULL | 대상 정량 재료 수 |
| missing_reasons | text[] | NOT NULL, DEFAULT '{}' | nutrient completeness의 누락 reason code |
| warnings_json | jsonb | NOT NULL, DEFAULT '[]' | API `warnings[]`를 순서·code 그대로 1:1 보존 |
| sources_json | jsonb | NOT NULL, DEFAULT '[]' | 계산 당시 실제 기여한 승인 source의 canonical 6-field attribution 배열 |
| is_current | boolean | NOT NULL, DEFAULT true | recipe current snapshot 여부 |
| calculated_at | timestamptz | NOT NULL | 계산 시각 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
CHECK (base_servings > 0)
CHECK (reflected_ingredient_count >= 0)
CHECK (target_ingredient_count >= reflected_ingredient_count)
CHECK (jsonb_typeof(scalable_values_json) = 'object')
CHECK (jsonb_typeof(fixed_values_json) = 'object')
CHECK (jsonb_typeof(warnings_json) = 'array')
CHECK (jsonb_typeof(sources_json) = 'array')
CHECK (
  (calculation_status = 'unavailable' AND calculation_quality IS NULL)
  OR
  (
    calculation_status IN ('complete', 'partial')
    AND calculation_quality IN ('direct', 'estimated', 'mixed')
  )
)
UNIQUE (recipe_id, input_hash, calculation_version)
UNIQUE (recipe_id) WHERE is_current = true
```

- snapshot 계산 payload는 `nutrient_status_json`, vector, `warnings_json`, `sources_json`을 포함해 UPDATE/DELETE하지 않는다. 새 input 또는 calculation version은 새 row를 만들고 기존 row에서는 `is_current`만 false로 전환하는 원자 transaction을 사용한다.
- recipe 계산 결과의 단일 authority는 `base_servings`, `nutrient_status_json`, `scalable_values_json`, `fixed_values_json`다. 이 슬라이스는 별도 `recipe_calculation` nutrition profile/value row를 쓰지 않고 read 시 current predecessor로 결과를 재계산하지 않는다.
- `scalable_values_json`과 `fixed_values_json`은 기본 인분 전체의 계산 가능한 amount 구성요소만 nutrient key별 숫자로 보존한다. complete nutrient의 두 vector 합은 `nutrient_status_json.amount`, partial nutrient의 합은 `nutrient_status_json.known_amount`와 일치해야 한다. optional nutrient도 존재할 때 같은 key를 사용한다. 계산 불가능한 nutrient key는 양쪽 object에서 생략하고 0으로 날조하지 않으며, 검증된 실제 기여값 0만 숫자 0으로 저장한다.
- `nutrient_status_json`에서 unavailable amount와 known_amount는 null이고 전체 unavailable snapshot의 `calculation_quality`도 null이다. partial은 `known_amount`와 `display_mode='minimum'`을 보존하며 결측을 0으로 저장하지 않는다. unavailable/partial의 `missing_reasons`는 그대로 보존한다.
- `sources_json` item은 `provider`, `dataset`, `source_version`, `data_basis_date`, `license`, `source_url` 정확히 6개 key만 가진 object다. public source의 `provider/dataset/source_version/license/source_url`은 비어 있지 않아야 하고 `data_basis_date`만 원 source에 없으면 null이다. DB CHECK는 최상위 array type을 강제하고, writer/service validation은 각 item의 object 타입·exact key set·필수 비공백 값을 snapshot insert 전에 검증한다.
- attribution은 실제로 영양값에 기여한 active current approved `nutrition_sources`를 pin한다. 대표 부피 assignment 또는 exact piece weight가 해당 기여를 가능하게 했다면, 실제 사용한 assignment/weight와 연결된 evidence가 active approved이고 그 `measurement_source_evidence.source_id`가 active current approved일 때만 해당 source attribution도 함께 pin한다. 계산에 쓰지 않은 후보·미승인·철회·대체·stale source는 넣지 않는다.
- 중복 판정 tuple은 `(provider, dataset, source_version, data_basis_date, license, source_url)`다. exact tuple을 하나로 줄인 뒤 같은 field 순서로 null을 문자열보다 먼저 두고 Unicode ordinal 오름차순 정렬한 canonical 배열을 저장한다. locale·DB query 반환 순서에 의존하지 않는다.
- `source_url`은 API key·token·인증 query를 제거한 공식 URL만 허용한다. exact 6-field 이외 raw fetch URL/row/payload, cookie, secret, auth query, manifest checksum, 내부 filesystem/storage path, 검수 actor나 다른 사용자 식별자는 `sources_json`·log·report·API에 저장하지 않는다.
- 이미 Meal에 pin된 snapshot은 current 전환과 무관하게 계속 조회 가능해야 한다.

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
- 사용자는 설정 화면에서 끼니 컬럼 이름 변경, 추가, 삭제, 순서 변경을 할 수 있다.
- 사용자별 컬럼 수는 최소 1개, 최대 5개다.
- 기존 사용자에게 이미 생성된 컬럼은 자동 삭제하지 않는다.
- 컬럼 삭제는 해당 컬럼에 연결된 `meals`와 `product_planner_entries`가 모두 없을 때만 허용한다.
- 신규 컬럼은 현재 마지막 `sort_order + 1`로 생성한다.
- 순서 변경과 삭제 후 재정렬은 사용자 소유 컬럼 전체가 0부터 연속 `sort_order`를 갖도록 저장한다.
- 순서 변경 저장 중에는 `(user_id, sort_order)` UNIQUE 충돌을 피하기 위해 임시 순서/복구 가능한 재정렬 절차를 사용한다.
- **UNIQUE**: `(user_id, sort_order)`

## 5-2. meals

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK |  |
| user_id | uuid | FK → users |  |
| recipe_id | uuid | FK → recipes, NOT NULL | Recipe Meal 전용. 완제품 연결 금지 |
| plan_date | date | NOT NULL | 날짜 |
| column_id | uuid | FK → meal_plan_columns | 시스템 고정 끼니 슬롯 |
| planned_servings | int | NOT NULL | 계획 인분 |
| status | enum | NOT NULL, DEFAULT 'registered' | `registered` / `shopping_done` / `cook_done` |
| is_leftover | boolean | NOT NULL, DEFAULT false | 남은요리 기반 식사 여부 |
| leftover_dish_id | uuid | FK → leftover_dishes, nullable | 출처 남은요리 |
| shopping_list_id | uuid | FK → shopping_lists, nullable | 장보기 스냅샷 연결 |
| recipe_nutrition_snapshot_id | uuid | FK → recipe_nutrition_snapshots, nullable | Meal 생성 당시 recipe nutrition snapshot pin |
| nutrition_snapshot_origin | varchar(20) | nullable | `created / backfill`; snapshot null이면 null |
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

CHECK (
  (recipe_nutrition_snapshot_id IS NULL AND nutrition_snapshot_origin IS NULL)
  OR
  (recipe_nutrition_snapshot_id IS NOT NULL AND nutrition_snapshot_origin IN ('created', 'backfill'))
)
```

### INDEX

- `(user_id, plan_date, column_id)`
- `(user_id, plan_date, status)`
- `(user_id, status)`
- `(shopping_list_id)`
- `(recipe_nutrition_snapshot_id)`

### Recipe snapshot pin 정책

- 신규 Meal은 생성 시 current recipe snapshot이 있으면 `recipe_nutrition_snapshot_id`와 `nutrition_snapshot_origin='created'`를 저장한다. snapshot이 없어도 Meal 생성은 성공한다.
- summary 출시 전 기존 Meal은 당시 current snapshot을 한 번만 pin하고 `backfill`을 기록한다. 계산 가능한 snapshot이 없으면 null을 유지한다.
- `planned_servings` 변경은 pin을 바꾸지 않고 snapshot의 scalable/fixed 벡터로 다시 계산한다.
- recipe/source/profile 갱신은 기존 Meal을 자동 repin하지 않는다.

## 5-3. food_products `v1.3.17 신규`, `v1.3.22 확장`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 제품 ID |
| owner_user_id | uuid | FK → users, nullable | `public_dataset`는 null. shared manual은 owner 또는 탈퇴 후 null |
| visibility | varchar(20) | NOT NULL | `public / private` |
| source_type | varchar(20) | NOT NULL | `public_dataset / manual` |
| moderation_status | varchar(20) | NOT NULL, DEFAULT 'visible' | `visible / hidden_by_report / hidden_by_operator` |
| name | varchar(200) | NOT NULL | 제품명 |
| brand | varchar(200) | nullable | 브랜드/업체명 |
| external_product_key | text | nullable | `public_dataset` 전용 stable key. 품목제조보고번호 우선, 없으면 provider food code |
| barcode | text | nullable | future-compatible metadata. MVP UI 입력/스캔 없음 |
| image_url | text | nullable | 제품 이미지 |
| current_nutrition_version_id | uuid | NOT NULL, deferred FK → food_product_nutrition_versions | current immutable version |
| deleted_at | timestamptz | nullable | soft-delete 시각 |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | metadata 갱신 시각 |

```
CHECK (visibility IN ('public', 'private'))
CHECK (source_type IN ('public_dataset', 'manual'))
CHECK (moderation_status IN ('visible', 'hidden_by_report', 'hidden_by_operator'))
CHECK (
  (visibility='public' AND source_type='public_dataset' AND owner_user_id IS NULL)
  OR
  (visibility='private' AND source_type='manual' AND owner_user_id IS NOT NULL)
  OR
  (visibility='public' AND source_type='manual')
)
CHECK (visibility='public' OR moderation_status='visible')
CHECK (source_type='manual' OR moderation_status IN ('visible', 'hidden_by_operator'))
CHECK (source_type='public_dataset' OR external_product_key IS NULL)
UNIQUE (source_type, external_product_key)
  WHERE source_type='public_dataset' AND external_product_key IS NOT NULL
```

- public catalog는 승인 source의 기준량·핵심 영양값·stable product key가 온전한 subset만 등록한다. 제품명+업체명 유사성만으로 merge하지 않는다.
- 신규 manual 제품은 `visibility='public'`, `source_type='manual'`, `moderation_status='visible'`, `owner_user_id=auth.uid()`로 생성한다. client는 owner/source/moderation/public stable key를 주입하지 못한다.
- legacy `private/manual` 제품은 유지하지만 자동 공개하지 않는다. 별도 owner opt-in 계약 전까지 owner에게만 보인다.
- shared manual 제품은 owner만 수정/soft-delete할 수 있다. `hidden_by_report` 또는 `hidden_by_operator` row는 새 검색/새 planner 추가에서 제외되고 일반 사용자에게 read-only이며, owner도 moderation lock이 풀리기 전에는 수정하지 않는다.
- 탈퇴 후 shared manual 제품은 `owner_user_id=NULL`, `visibility='public'`, `source_type='manual'`로 남는 anonymized read-only row다. 기존 planner entry와 current version pin은 유지한다.
- product row와 첫 nutrition version은 미리 생성한 UUID와 deferred FK를 사용해 한 transaction으로 만들며, commit된 product에는 current version이 반드시 존재한다.

## 5-4. food_product_nutrition_versions `v1.3.17 신규`, `v1.3.22 확장`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | immutable version ID |
| product_id | uuid | FK → food_products, NOT NULL | 대상 제품 |
| nutrition_profile_id | uuid | FK → nutrition_profiles, NOT NULL | label/source profile |
| version | int | NOT NULL | 제품별 증가 version |
| label_basis_text | text | nullable | 제품 라벨 기준량 원문. 예: `1회(40g)` |
| basis_relations_json | jsonb | NOT NULL, DEFAULT '[]' | 공개 `basis_relations[]`; item은 `{from:{amount,unit},to:{amount,unit}}` 직접 관계 |
| source_item_id | uuid | FK → nutrition_source_items, nullable | public provenance; manual이면 null |
| created_by | uuid | FK → users, nullable | manual version 작성자 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

```
UNIQUE (product_id, version)
UNIQUE (product_id, nutrition_profile_id)
CHECK (jsonb_typeof(basis_relations_json) = 'array')
```

- version/profile/value와 `basis_relations_json`은 insert 후 수정·삭제하지 않는다. `food_products.current_nutrition_version_id`만 새 version을 가리키도록 원자적으로 전환한다.
- manual 제품 수정은 새 version을 만들며 기존 planner entry는 이전 version을 유지한다.
- `basis_relations_json` item의 `from.amount`/`to.amount`는 양수이고 unit은 `serving / package / g / ml` 중 하나다. 같은 단위 pair, 0/음수, 동일 pair 중복은 저장하지 않는다.
- public dataset version은 운영자가 source/label을 검수한 직접 관계만 저장한다. shared manual/legacy private manual 생성·수정 API는 relation 입력을 받지 않으며 해당 version의 `basis_relations_json`은 빈 배열이다. 승인 상태는 해당 immutable version의 profile/source 검수 경계를 따르며 client가 관계를 임의 주입할 수 없다.
- product entry 수량 환산은 pin된 version의 같은 단위 direct scale 또는 `basis_relations_json`에 있는 직접 pair와 역방향만 사용한다. 관계 연쇄, 범용 밀도, 다른 product/current version의 관계, 임의 `g↔ml` 추정은 금지하며 관계가 없으면 `NUTRITION_BASIS_MISMATCH`다.

## 5-5. food_product_reports `v1.3.22 신규`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | 신고 ID |
| product_id | uuid | FK → food_products, NOT NULL | 대상 shared manual 제품 |
| reporter_user_id | uuid | FK → users, NOT NULL | 신고자 |
| reason_code | varchar(30) | NOT NULL | `spam / incorrect_nutrition / duplicate / rights / unsafe / other` |
| detail_text | text | nullable | 선택 자유 서술 |
| report_status | varchar(20) | NOT NULL, DEFAULT 'pending' | `pending / acknowledged / resolved / dismissed` |
| reviewed_by | uuid | FK → users, nullable | 운영 검수자 |
| reviewed_at | timestamptz | nullable | 검수 시각 |
| created_at | timestamptz | NOT NULL | 신고 시각 |

```
UNIQUE (product_id, reporter_user_id)
CHECK (reason_code IN ('spam', 'incorrect_nutrition', 'duplicate', 'rights', 'unsafe', 'other'))
CHECK (report_status IN ('pending', 'acknowledged', 'resolved', 'dismissed'))
CHECK (report_status = 'pending'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
```

- 신고 대상은 `visibility='public' AND source_type='manual'` 제품만 허용한다. `public_dataset`, legacy private, 자기 own product 신고는 route/service guard로 차단한다.
- 같은 사용자·같은 제품 재신고는 `UNIQUE`와 API guard로 막는다.
- 신고 생성은 append-only다. 일반 사용자는 INSERT만 가능하고, `report_status` 변경과 `hidden_by_report`/`hidden_by_operator` 전환은 operator/service-role 전용이다.

## 5-6. product_planner_entries `v1.3.17 신규`

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | entry ID |
| user_id | uuid | FK → users, NOT NULL | 소유자 |
| plan_date | date | NOT NULL | 계획 날짜 |
| column_id | uuid | FK → meal_plan_columns, NOT NULL | 끼니 컬럼 |
| product_id | uuid | FK → food_products, NOT NULL | 제품 |
| product_nutrition_version_id | uuid | FK → food_product_nutrition_versions, NOT NULL | 생성 당시 pin |
| quantity_amount | numeric(12,4) | NOT NULL | 계획 수량 |
| quantity_unit | varchar(20) | NOT NULL | `serving / package / g / ml` |
| product_name_snapshot | text | NOT NULL | soft-delete 후 표시용 이름 snapshot |
| product_brand_snapshot | text | nullable | soft-delete 후 표시용 브랜드 snapshot |
| created_at | timestamptz | NOT NULL | 생성 시각 |
| updated_at | timestamptz | NOT NULL | 수량 수정 시각 |

```
CHECK (quantity_amount > 0)
CHECK (quantity_unit IN ('serving', 'package', 'g', 'ml'))
```

- route와 DB guard는 `product_planner_entries.user_id = meal_plan_columns.user_id`를 모두 강제한다. composite FK `(column_id, user_id) → meal_plan_columns(id, user_id)` 또는 동등한 trigger/RPC guard를 사용한다.
- private product는 `food_products.owner_user_id = product_planner_entries.user_id`일 때만 연결할 수 있다. public product는 모든 로그인 사용자가 연결할 수 있다.
- pin된 version은 product 수정/삭제 후에도 바꾸지 않는다. 수량 변경은 pin을 교체하지 않는다.
- 이 테이블에는 recipe workflow status, `shopping_list_id`, `cooked_at`, `leftover_dish_id`를 추가하지 않는다.
- shopping/cooking/leftover/recipe count와 XP/activity writer는 이 테이블을 source로 사용하지 않는다.

### 완제품 RLS / 삭제 / 컬럼 guard

- `food_products`: `deleted_at IS NULL`이고 `moderation_status='visible'`인 public row + 본인 manual row만 기본 SELECT 대상이다. 검색 endpoint는 hidden row를 노출하지 않는다. manual INSERT는 owner 자신의 shared/legacy private row만 허용하고, PATCH/soft-delete는 `owner_user_id=auth.uid()`이면서 `moderation_status='visible'`인 manual row만 허용한다. public_dataset write와 moderation 상태 변경은 operator/service-role 전용이다.
- `food_product_nutrition_versions`: visible public 제품 version 또는 본인 manual 제품 version만 SELECT한다. 일반 사용자의 UPDATE/DELETE는 금지한다.
- `food_product_reports`: `auth.uid() = reporter_user_id`인 사용자는 own report INSERT만 가능하고 UPDATE/DELETE는 금지한다. review와 moderation 전환은 operator/service-role 전용이다.
- `product_planner_entries`: `auth.uid() = user_id`인 row만 CRUD한다.
- planner column 삭제는 연결된 `meals` 또는 `product_planner_entries`가 하나라도 있으면 기존 `409 COLUMN_HAS_MEALS`로 차단한다.

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
  is_checked=true
OR
  is_pantry_excluded=true
)
```

> **v1.3 의미 정리**
>
> - `added_to_pantry=true`는 **팬트리 반영 처리됨** 을 의미
> - 해당 ingredient가 이미 pantry_items에 존재해 실제 INSERT가 생략되더라도,
>
>     사용자가 “팬트리에 추가” 대상으로 선택했고 완료 처리되었다면 true로 마킹 가능
> - `이미있음`으로 표시된 `is_pantry_excluded=true` 항목도 완료 시 팬트리 반영 후보가 될 수 있으며, 이 경우 `is_checked=false`여도 `added_to_pantry=true`가 가능
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
| stale_reviewed_at | timestamptz | nullable | 사용자가 오래 보관 안내에서 `계속 보관`을 누른 마지막 시각 |
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
| event_type | text | NOT NULL | `cooking_completed` / `shopping_completed` / `recipe_saved` / `custom_book_created` / `planner_registered` |
| source_key | text | NOT NULL | 멱등성 키. 형식: `{event_type}:{source_id}` 또는 `recipe_saved:{user_id}:{recipe_id}` |
| source_table | text | NOT NULL | source of truth 테이블명 (예: `leftover_dishes`, `shopping_lists`, `recipe_book_items`, `recipe_books`) |
| source_id | uuid | NOT NULL | source 테이블의 PK |
| xp_delta | integer | NOT NULL, CHECK (xp_delta > 0) | 이 이벤트로 획득한 XP |
| source_meta_json | jsonb | NOT NULL, DEFAULT '{}' | 첫/반복 XP, cap window, backfill 여부 등 source metadata |
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
| `planner_registered` | `meals.id` | `POST /api/v1/meals`에서 meal INSERT 성공 직후 | first: `planner_registered:first:{user_id}`, repeat: `planner_registered:{meal_id}` | 최초 XP와 반복 XP 분리. 반복 XP는 KST 3/day, 12/week cap. PATCH/status transition/shopping/cooking transition은 award 금지 |

### XP Policy Map `growth-leveling-v2`

| event_type | first XP | repeat XP | repeat cap / idempotency |
| --- | ---: | ---: | --- |
| `recipe_saved` | 15 | 8 | user+recipe distinct-ever. unsave/resave 재적립 금지 |
| `custom_book_created` | 25 | 10 | KST 2/day repeat cap. system book 제외 |
| `shopping_completed` | 40 | 25 | `shopping_completed:{shopping_list_id}` 1회 |
| `cooking_completed` | 60 | 45 | `cooking_completed:{leftover_dish_id}` 1회 |
| `planner_registered` | 25 | 5 | KST 3/day, 12/week repeat cap. first는 repeat cap 미소비 |

`source_meta_json`에는 최소 `xp_kind`(`first`/`repeat`), `level_curve_version`, cap 적용 여부와 cap window key를 기록해 backfill/recompute와 live writer가 같은 정책으로 검증될 수 있게 한다.

### Backfill Policy

- legacy backfill은 surviving rows 기준 lower-bound이다.
- 삭제된 custom book, 저장 해제된 recipe membership, 삭제된 과거 활동은 복원됐다고 주장하지 않는다.
- 33a 배포 이후 live writer로 기록되는 신규 활동부터 forward-accurate하다.
- 34 시리즈 backfill은 surviving source row를 deterministic order로 처리한다. 플래너 등록은 `meals.created_at ASC, meals.id ASC` 순서로 최초 XP와 cap 적용 반복 XP를 계산한다.
- backfill/recompute는 `user_progress_notifications` row를 만들지 않는다. 기존 유저에게 과거 toast burst가 발생하면 안 된다.

## 11-2a-2. user_growth_activity_events (non-XP activity ledger) `growth-leveling-v2`

XP가 없는 배지/퀘스트/최근 성장 지표용 활동 ledger. 이 테이블은 XP를 지급하지 않으며, `user_progress_events`의 XP 경제를 과도하게 확장하지 않기 위해 분리한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | |
| user_id | uuid | FK → users, NOT NULL | |
| activity_type | text | NOT NULL | `shopping_bundle_prepared` / `pantry_item_added` / `leftover_eaten` / `meal_add_path_used` / `recipebook_created` / `recipebook_recipe_added` / `recipebook_recipe_removed` |
| category | text | NOT NULL | `recipe` / `planner` / `shopping` / `cooking` / `pantry` / `leftovers` / `recipebook` |
| source_table | text | NOT NULL | source of truth 테이블명 |
| source_id | uuid | NOT NULL | source 테이블의 PK 또는 대표 source id |
| source_key | text | NOT NULL | 멱등성 키 |
| source_meta_json | jsonb | NOT NULL, DEFAULT '{}' | meal ids, path, distinct metric key, backfill 여부 등 |
| occurred_at | timestamptz | NOT NULL | source row 또는 action 발생 시각 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | ledger 기록 시각 |

- **UNIQUE**: `(user_id, activity_type, source_key)` — 같은 활동 중복 기록 방지
- **인덱스**: `(user_id, activity_type, occurred_at DESC)` — category/quest별 활동 조회
- **인덱스**: `(user_id, category, occurred_at DESC)` — 최근 성장 기록과 category별 badge/quest 조회

### Non-XP Activity Map

| activity_type | source of truth | idempotency key | count 기준 |
| --- | --- | --- | --- |
| `shopping_bundle_prepared` | `shopping_lists` 또는 pantry-only `completed_without_list` action | sorted affected meal ids + action kind hash | 장보기 끼니 묶음 기준 quest. list 완료 수와 분리 |
| `pantry_item_added` | `pantry_items.id` | `pantry_item_added:{pantry_item_id}` | 실제 inserted pantry row만 count |
| `leftover_eaten` | `leftover_dishes.id` | `leftover_eaten:{leftover_id}` | 첫 `leftover -> eaten` transition만 count. `uneat` 후 재-eat은 중복 아님 |
| `meal_add_path_used` | `meals.id` + client path metadata | `meal_add_path:{user_id}:{path}` | user별 distinct path diversity |
| `recipebook_created` | `recipe_books.id` | `recipebook_created:{recipe_book_id}` | custom book only. system books 제외 |
| `recipebook_recipe_added` | `recipe_book_items.id` | `recipebook_recipe_added:{recipe_book_item_id}` | distinct book-recipe metric은 `{book_id}:{recipe_id}`로 dedupe |
| `recipebook_recipe_removed` | recipebook remove action | `recipebook_recipe_removed:{user_id}:{book_id}:{recipe_id}:{removed_at_epoch_ms}` | live-only removal activity. backfill 없음 |

## 11-2b. user_progress_summary (projection/read model)

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| user_id | uuid | PK, FK → users | |
| total_xp | integer | NOT NULL, DEFAULT 0 | 누적 총 XP |
| current_level | integer | NOT NULL, DEFAULT 1 | 현재 레벨 |
| event_counts | jsonb | NOT NULL, DEFAULT '{}' | `{ cooking_completed, shopping_completed, recipe_saved_distinct_ever, custom_book_created, planner_registered_first, planner_registered_repeat }` |
| level_curve_version | text | NOT NULL, DEFAULT 'v1' | `v1` / `v2` curve 구분 |
| last_event_at | timestamptz | NULL | 마지막 XP 이벤트 발생 시각 |
| last_updated_at | timestamptz | NOT NULL, DEFAULT now() | projection 갱신 시각 |

- XP curve와 level 계산은 server authority이다. 클라이언트에 XP curve 공식을 복제하지 않는다.
- `event_counts.recipe_saved_distinct_ever`는 ledger 기준 distinct-ever이며, 현재 membership 수나 `recipes.save_count`가 아니다.
- v2 curve 공식은 `levelStartXp(level) = 40 * (level - 1) ** 2 + 60 * (level - 1)`이다.
- v2.1 등급 band는 level 1-3 `Clay`, 4-7 `Wood`, 8-12 `Steel`, 13-20 `Silver`, 21-34 `Gold`, 35-49 `Diamond`, 50+ `Titanium`이다.
- 33a는 season reset, streak multiplier, XP decay, leaderboard, 대표 배지 선택을 포함하지 않는다.

## 11-2c. user_badge_awards `33c-gamification`

사용자별 badge unlock 상태. Badge definition은 MVP에서 서버 코드 상수로 관리하며, 운영 중 편집이 필요하면 후속 definition table로 분리한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | |
| user_id | uuid | FK → users, NOT NULL | |
| badge_key | text | NOT NULL | 서버 badge definition key |
| source_event_id | uuid | FK → user_progress_events(id), NULL 허용 | badge unlock 근거가 된 progress event |
| idempotency_key | text | NOT NULL | 중복 unlock 방지 키. 예: `badge:first_cook_done:{user_id}` |
| earned_at | timestamptz | NOT NULL, DEFAULT now() | 획득 시각 |
| seen_at | timestamptz | NULL | 사용자가 new 상태를 확인한 시각 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

- **UNIQUE**: `(user_id, badge_key)` — 같은 badge는 사용자별 1회만 획득
- **UNIQUE**: `(user_id, idempotency_key)` — retry/reconcile 중복 방지
- badge award 생성 실패는 원래 source action 실패로 전파하지 않는다.

## 11-2c-2. user_achievement_awards `growth-achievement-album`

사용자별 achievement/stamp 획득 상태. 업적 정의는 MVP에서 서버 코드 상수로 관리하며, 운영 중 편집이 필요하면 후속 definition table로 분리한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | |
| user_id | uuid | FK → users, NOT NULL | |
| achievement_key | text | NOT NULL | 서버 achievement definition key |
| category_key | text | NOT NULL | `tutorial` / `recipe` / `planner` / `shopping` / `cooking` / `pantry` / `leftovers` / `recipebook` |
| track_key | text | NULL | 같은 category 안의 세부 track. 예: `recipe_saved`, `recipe_registered` |
| target_value | integer | NOT NULL | 달성 기준 |
| achieved_value | integer | NOT NULL | 달성 당시 서버 계산값 |
| badge_key | text | NULL | 연결 badge/stamp key. badge award와 UI metadata 공유 가능 |
| source_event_id | uuid | FK → user_progress_events(id), NULL 허용 | XP source event 근거 |
| source_activity_id | uuid | FK → user_growth_activity_events(id), NULL 허용 | non-XP activity 근거 |
| idempotency_key | text | NOT NULL | 중복 unlock 방지 키. 예: `achievement:tutorial_recipe_saved:{user_id}` |
| earned_at | timestamptz | NOT NULL, DEFAULT now() | 획득 시각 |
| seen_at | timestamptz | NULL | 사용자가 new 상태를 확인한 시각 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

- **UNIQUE**: `(user_id, achievement_key)` — 같은 achievement는 사용자별 1회만 획득
- **UNIQUE**: `(user_id, idempotency_key)` — retry/reconcile/backfill 중복 방지
- `source_event_id`와 `source_activity_id`는 둘 다 NULL일 수 있다. 예: silent backfill에서 surviving row aggregate로 반영된 경우.
- 업적 획득은 XP를 추가 지급하지 않는다. XP 지급은 `user_progress_events`만 authority다.
- 튜토리얼 completion badge는 6개 tutorial achievement가 모두 earned인 경우 서버가 1회 생성한다.
- legacy/backfill은 `user_achievement_awards`를 만들 수 있지만, `user_progress_notifications` row는 만들지 않는다.

## 11-2d. user_quest_progress `33c-gamification`

사용자별 tutorial quest 진행 상태. 35 시리즈 이후 standard quest expansion은 중단하며, tutorial 상태는 achievement album의 `tutorial` category projection과 동기화한다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | |
| user_id | uuid | FK → users, NOT NULL | |
| quest_key | text | NOT NULL | 서버 quest definition key |
| quest_type | text | NOT NULL | `tutorial` 기본. 기존 `standard` row는 호환 조회만 허용 |
| status | text | NOT NULL | `active` / `completed` / `dismissed` |
| progress_current | integer | NOT NULL, DEFAULT 0 | 현재 진행값 |
| progress_target | integer | NOT NULL | 목표값 |
| source_event_id | uuid | FK → user_progress_events(id), NULL 허용 | 마지막 progress 근거 |
| completed_at | timestamptz | NULL | 완료 시각 |
| dismissed_at | timestamptz | NULL | tutorial quest 숨김 시각 |
| seen_at | timestamptz | NULL | completed/new 상태 확인 시각 |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

- **UNIQUE**: `(user_id, quest_key)` — 같은 quest progress row는 사용자별 1개
- tutorial dismiss는 XP, level, achievement award를 변경하지 않는다.
- quest completion은 별도 XP reward나 claim reward를 만들지 않는다.
- 신규 장기 목표는 `user_achievement_awards`로 관리한다.

## 11-2e. user_progress_notifications `33c-gamification`

XP toast와 achievement/badge new 상태 표시를 위한 사용자별 notification outbox. Source action 성공 피드백을 보강하지만, notification 생성/seen 실패는 원래 action 결과를 바꾸지 않는다.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() | |
| user_id | uuid | FK → users, NOT NULL | |
| notification_key | text | NOT NULL | 중복 방지 키. 예: `xp-toast:{progress_event_id}` |
| notification_type | text | NOT NULL | `level_up` / `xp_awarded` / `achievement_unlocked` / `badge_unlocked` |
| source_event_id | uuid | FK → user_progress_events(id), NULL 허용 | XP source event |
| payload_json | jsonb | NOT NULL, DEFAULT '{}' | toast 표시용 label/xp/achievement/badge 요약 |
| priority | integer | NOT NULL, DEFAULT 4 | 표시 우선순위. `level_up=1`, `achievement_unlocked/badge_unlocked=2`, `xp_awarded=4` |
| delivery_channel | text | NOT NULL, DEFAULT 'toast' | `toast` / `archive_only` / `silent` |
| toast_eligible | boolean | NOT NULL, DEFAULT true | toast stack 표시 후보 여부 |
| group_key | text | NULL | 같은 source action에서 나온 notification group |
| created_at | timestamptz | NOT NULL, DEFAULT now() | 생성 시각 |
| seen_at | timestamptz | NULL | 사용자가 확인한 시각 |

- **UNIQUE**: `(user_id, notification_key)` — 같은 source event toast 중복 생성 방지
- `payload_json`은 user-facing 요약만 저장한다. 비밀정보, OAuth code, raw YouTube source text, query string을 저장하지 않는다.
- seen 처리는 멱등해야 한다.
- toast stack 우선순위는 서버가 정렬한다. 클라이언트는 `level_up > achievement_unlocked/badge_unlocked > xp_awarded` 순서를 바꾸지 않는다.
- `quest_completed` notification row는 만들지 않는다. 퀘스트 완료 상태는 `user_quest_progress`와 업적 앨범 tutorial projection으로만 표시한다.
- archive는 v1에서 live non-silent notification row의 append-only read이다. Historical/backfill recompute는 archive row도 만들지 않는다.
- `seen_at`은 사용자가 toast/card를 확인했다는 뜻이며 archive에서 제거한다는 뜻이 아니다.


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
| metadata_json | jsonb | NULL 허용, default '{}' | 추가 메타데이터 (PII 포함 금지: 이메일 원문, OAuth 토큰, OAuth code/next/error 쿼리 값, provider payload, localStorage 값, YouTube URL, YouTube 자막/소스 텍스트, 관리자 검색어/닉네임, 비공개 장보기/팬트리 상세 금지) |
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
| meals N — 1 recipe_nutrition_snapshots (nullable) | N:1 | Meal 생성 당시 영양 snapshot pin |
| users 1 — N food_product_reports | 1:N | 사용자 등록 완제품 신고 |
| users 1 — N product_planner_entries | 1:N | 유저별 완제품 계획 항목 |
| product_planner_entries N — 1 meal_plan_columns | N:1 | 같은 사용자 끼니 컬럼 guard |
| product_planner_entries N — 1 food_products | N:1 | 완제품 참조 |
| product_planner_entries N — 1 food_product_nutrition_versions | N:1 | 생성 당시 영양 version pin |
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
| recipes 1 — N recipe_nutrition_snapshots | 1:N | 불변 계산 snapshot |
| recipe_steps N — 1 cooking_methods | N:1 | 조리방법 참조 |
| recipes 1 — 1 recipe_sources | 1:1 | 출처 |
| recipes 1 — N recipe_tags | 1:N | canonical tag 관계 |
| tags 1 — N recipe_tags | 1:N | tag별 레시피 역검색 |
| ingredients 1 — N ingredient_synonyms | 1:N | 동의어 |
| ingredients 1 — N ingredient_nutrition_profiles | 1:N | 승인 영양 profile 연결 |
| nutrition_sources 1 — N nutrition_source_items | 1:N | source version item |
| nutrition_source_items 1 — N nutrition_profiles | 1:N | source 기반 영양 profile |
| nutrition_profiles 1 — N nutrition_values | 1:N | 영양소별 값; 결측은 `value_status`로 구분 |
| nutrition_sources 1 — N measurement_source_evidence | 1:N | 제한 보존된 계량 원문 evidence |
| measurement_source_evidence 1 — N ingredient_conversion_assignments | 1:N | evidence와 서비스 assignment 분리 |
| ingredients 1 — N ingredient_conversion_assignments | 1:N | 승인 계량 evidence 연결·검수 |
| measurement_conversion_profiles 1 — N ingredient_conversion_assignments | 1:N | legacy 후보 분류·감사 연결 |
| measurement_source_evidence 1 — N piece_unit_weights | 1:N | 개당 중량 provenance |
| ingredients 1 — N piece_unit_weights | 1:N | 승인 개당 중량 |
| food_products 1 — N food_product_nutrition_versions | 1:N | 제품 불변 영양 version |
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
     - 기본 후보: 구매 체크된 구매 섹션 item + 이미있음(is_pantry_excluded=true) item
     - 이미 pantry_items에 있으면 중복 INSERT 생략
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

## 13-4. 완제품 계획 흐름

```text
[public + 본인 private 제품 검색]
  food_products WHERE deleted_at IS NULL
    AND (visibility='public' OR owner_user_id=auth.uid())

[완제품 플래너 추가]
  1. product/column 소유권과 current nutrition version 확인
  2. product_planner_entries INSERT
     - product_nutrition_version_id = 생성 당시 current version
     - quantity_amount/unit 저장

[수량 변경]
  quantity만 UPDATE
  pinned nutrition version 변경 없음

[제품 수정/삭제]
  새 nutrition version 생성 또는 food_products.deleted_at 설정
  기존 product_planner_entries와 pin된 version 유지

  ⚠️ meals INSERT/status 전이 없음
  ⚠️ shopping_lists/cooking_sessions/leftover_dishes 연동 없음
  ⚠️ recipe count / planner_registered XP / meal_add_path_used activity 없음
```

---

# 15. 인덱스 권장

| 테이블 | 인덱스 | 용도 |
| --- | --- | --- |
| nutrition_sources | `(provider_code, dataset_name, source_version)` | source/version 조회 |
| nutrition_source_items | `(source_id, external_item_key)` UNIQUE | source item dedupe |
| nutrition_source_items | `(stable_fingerprint)` | cross-source reconciliation 후보 |
| nutrition_values | `(profile_id, nutrient_code)` UNIQUE | profile 영양 벡터 조회 |
| ingredient_nutrition_profiles | `(ingredient_id, preparation_state, is_active, review_status)` | active approved 재료 profile 선택 |
| measurement_source_evidence | `(source_id, evidence_fingerprint, version)` UNIQUE | evidence import 멱등성 |
| ingredient_conversion_assignments | `(ingredient_id, preparation_state, is_active, review_status)` | active approved 계량 evidence 선택 |
| piece_unit_weights | `(ingredient_id, size_code, preparation_state, is_active, review_status)` | 승인 `개→g` 선택 |
| recipe_nutrition_snapshots | `(recipe_id, is_current, calculated_at DESC)` | current/이력 snapshot 조회 |
| recipe_nutrition_snapshots | `(recipe_id, input_hash, calculation_version)` UNIQUE | 계산 idempotency |
| food_products | `(visibility, moderation_status, deleted_at, name)` | visible public/shared catalog 검색 |
| food_products | `(owner_user_id, visibility, deleted_at, updated_at DESC)` | 본인 legacy private/shared 관리 |
| food_product_nutrition_versions | `(product_id, version DESC)` UNIQUE | current/과거 version 조회 |
| food_product_reports | `(product_id, reporter_user_id)` UNIQUE | 중복 신고 차단 |
| product_planner_entries | `(user_id, plan_date, column_id)` | 끼니/날짜/주간 조회 |
| product_planner_entries | `(product_nutrition_version_id)` | pinned version 역참조 |
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
| tags | `(normalized_key)` UNIQUE | tag 정확 필터 / upsert |
| tags | `(theme_eligible, usage_count DESC)` | HOME theme 후보 산정 |
| recipe_tags | `(tag_id, recipe_id)` | tag → recipe id lookup |
| recipe_tags | `(recipe_id, sort_order)` | recipe card projection |
| recipe_tags | `(visibility, review_status, tag_id)` | public/approved tag 검색/테마 필터 |
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
| user_growth_activity_events | `(user_id, activity_type, source_key)` UNIQUE | non-XP activity 중복 기록 방지 `growth-leveling-v2` |
| user_growth_activity_events | `(user_id, activity_type, occurred_at DESC)` | activity type별 quest/badge projection `growth-leveling-v2` |
| user_growth_activity_events | `(user_id, category, occurred_at DESC)` | category별 최근 성장 기록 조회 `growth-leveling-v2` |
| user_badge_awards | `(user_id, badge_key)` UNIQUE | 사용자별 badge 중복 unlock 방지 `33c-gamification` |
| user_badge_awards | `(user_id, idempotency_key)` UNIQUE | retry/reconcile 중복 방지 `33c-gamification` |
| user_badge_awards | `(user_id, earned_at DESC)` | 사용자별 최근 badge 조회 `33c-gamification` |
| user_achievement_awards | `(user_id, achievement_key)` UNIQUE | 사용자별 achievement 중복 unlock 방지 `growth-achievement-album` |
| user_achievement_awards | `(user_id, idempotency_key)` UNIQUE | retry/reconcile/backfill 중복 방지 `growth-achievement-album` |
| user_achievement_awards | `(user_id, category_key, earned_at DESC)` | category별 achievement album 조회 `growth-achievement-album` |
| user_achievement_awards | `(user_id, seen_at, earned_at DESC)` | 새 achievement 표시/seen 처리 `growth-achievement-album` |
| user_quest_progress | `(user_id, quest_key)` UNIQUE | 사용자별 quest 상태 단일 row `33c-gamification` |
| user_quest_progress | `(user_id, status, updated_at DESC)` | active/completed quest 조회 `33c-gamification` |
| user_progress_notifications | `(user_id, notification_key)` UNIQUE | notification 중복 생성 방지 `33c-gamification` |
| user_progress_notifications | `(user_id, seen_at, priority ASC, created_at DESC)` | priority unseen toast queue 조회 `growth-leveling-v2` |
| user_progress_notifications | `(user_id, delivery_channel, created_at DESC, id DESC)` | archive 조회 `growth-leveling-v2` |
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

# 17. 전체 테이블 목록 (50개)

| # | 테이블 | 구분 |
| --- | --- | --- |
| 1 | users | 사용자 |
| 2 | ingredients | 재료 마스터 |
| 3 | ingredient_synonyms | 재료 마스터 |
| 4 | ingredient_bundles | 재료 마스터 |
| 5 | ingredient_bundle_items | 재료 마스터 |
| 6 | cooking_methods | 조리방법 마스터 |
| 7 | recipes | 레시피 |
| 8 | tags | 레시피 태그 `v1.3.16` |
| 9 | recipe_tags | 레시피 태그 `v1.3.16` |
| 10 | recipe_sources | 레시피 |
| 11 | recipe_ingredients | 레시피 |
| 12 | recipe_steps | 레시피 |
| 13 | meal_plan_columns | 식단 플래너 |
| 14 | meals | 식단 플래너 |
| 15 | shopping_lists | 장보기 |
| 16 | shopping_list_items | 장보기 |
| 17 | shopping_list_recipes | 장보기 |
| 18 | cooking_sessions | 요리 세션 |
| 19 | cooking_session_meals | 요리 세션 |
| 20 | pantry_items | 팬트리 |
| 21 | leftover_dishes | 남은요리 |
| 22 | recipe_books | 레시피북 |
| 23 | recipe_book_items | 레시피북 |
| 24 | recipe_likes | 좋아요 |
| 25 | user_progress_events | 사용자 진도 `user-progress 예정` |
| 26 | user_progress_summary | 사용자 진도 `user-progress 예정` |
| 27 | user_growth_activity_events | 사용자 성장/activity `growth-leveling-v2` |
| 28 | user_badge_awards | 사용자 성장/배지 `33c-gamification` |
| 29 | user_achievement_awards | 사용자 성장/업적 `growth-achievement-album` |
| 30 | user_quest_progress | 사용자 성장/튜토리얼 퀘스트 `33c-gamification` |
| 31 | user_progress_notifications | 사용자 성장/notification `33c-gamification` |
| 32 | admin_members | Admin Foundation `v1.3.8` |
| 33 | operational_events | Admin Foundation `v1.3.8` |
| 34 | admin_audit_logs | Admin Foundation `v1.3.8` |
| 35 | youtube_extraction_candidates | YouTube 다중 후보 `2026-05-30` |
| 36 | nutrient_definitions | 영양 공통 `v1.3.18` |
| 37 | nutrition_sources | 영양 provenance/license/freshness `v1.3.18` |
| 38 | nutrition_source_items | 영양 source item·원문 기준 보존 `v1.3.18` |
| 39 | nutrition_profiles | immutable 영양 profile `v1.3.18` |
| 40 | nutrition_values | 영양소별 값·결측 상태 `v1.3.18` |
| 41 | ingredient_nutrition_profiles | 재료 영양 후보/승인 연결 `v1.3.18` |
| 42 | measurement_conversion_profiles | legacy 부피 후보 분류·감사 record `v1.3.18` |
| 43 | measurement_source_evidence | 원문 계량 evidence `v1.3.18` |
| 44 | ingredient_conversion_assignments | 재료별 계량 evidence 연결/검수 `v1.3.18` |
| 45 | piece_unit_weights | 승인 개당 중량 `v1.3.18` |
| 46 | recipe_nutrition_snapshots | 레시피 영양 snapshot `v1.3.17` |
| 47 | food_products | 완제품 catalog `v1.3.17` |
| 48 | food_product_nutrition_versions | 완제품 영양 version `v1.3.17` |
| 49 | food_product_reports | 완제품 신고 `v1.3.22` |
| 50 | product_planner_entries | 완제품 플래너 entry `v1.3.17` |

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
