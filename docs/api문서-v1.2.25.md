# API\_설계\_v1.2.25

상태: 공식문서
담당자: 킴실장
날짜: 7월 16

> **2026-07-16 contract-evolution — recipe 기본 영양 선택과 nutrition 가용성 이유**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | recipe 정량 `amount + unit`은 실제 투입 가식부 사용량이며, 직접 질량/호환 부피의 상태 미지정 영양 후보는 완전한 승인 primary chain이 전체 상태에서 정확히 1개일 때만 선택한다 | snapshot writer input |
> | 2 | 부피 환산도 자격 있는 승인 경로가 정확히 1개일 때만 사용하고, `개/장`은 exact `size_code + preparation_state`가 증명된 piece weight 없이는 계산하지 않는다 | fail-closed conversion |
> | 3 | `GET /recipes/{id}` nutrition에 nullable `availability_reason`을 additive 제공하며 값은 `missing`, `temporarily_unavailable`, `null` 중 하나다 | Recipe Detail soft state |
>
> `missing`은 current snapshot row가 실제로 없을 때, `temporarily_unavailable`은 snapshot query가 throw/DB error로 실패하거나 row payload가 읽을 수 없는 malformed 상태일 때다. 정상 snapshot row를 읽었으면 그 row의 `calculation_status`가 `unavailable`이어도 `availability_reason=null`이다. 모든 경우 기존 성공 wrapper와 HTTP 200을 유지하며 새 endpoint·HTTP status·error code를 만들지 않는다. 영양 조회 일시 실패는 기존 recipe 상세 필드를 성공 반환하고 nutrition 영역에서만 재시도한다. endpoint 총계는 **81개(active 80개 + tombstone 1개)**다.

> **2026-07-15 contract-evolution — recipe nutrition snapshot 출처 pin 수정**
>
> | # | 변경 내용 | 영향 범위 |
> | --- | --- | --- |
> | 1 | recipe `sources[]`는 immutable `recipe_nutrition_snapshots.sources_json`에 계산 시점에 pin된 값만 투영하고 read 시 current source relation으로 재생성하지 않는다 | `GET /recipes/{id}` / planner aggregate |
> | 2 | attribution item은 기존 6개 field만 유지하고, 실제 기여한 영양 source와 대표 부피/exact piece evidence source를 canonical tuple로 stable dedupe/order한다 | 출처 안정성 / 재현성 |
> | 3 | API key·인증 query·cookie·raw provider row/payload·내부 path·검수 actor를 응답하지 않는다 | public API 보안 |
>
> 사용자는 2026-07-15에 이 최소 contract-evolution을 명시적으로 승인했다. 실행 시점 current relation에서 attribution을 다시 만드는 대안은 과거 Meal 출처를 바꾸고, 별도 recipe calculation profile 관계는 source를 완전하게 표현하지 못해 둘 다 거부했다. public endpoint·response field·status·error code는 추가하지 않고 총계 **81개(active 80개 + tombstone 1개)**를 유지한다.

> **2026-07-15 contract-evolution — 영양 계산·완제품 플래너 predecessor 소비 잠금**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | 1 | public data pilot PR #1005의 merge commit `3866952c3e81bedfd80593f576e5ed6183ec7538`(reviewed head `028c6e8f13d3c8586bbbfaa9dad42f0ae65c1420`)을 영양 source/profile/assignment 선행 계약으로 고정한다 | 승인된 current source/profile/assignment만 계산·catalog에 사용 |
> | 2 | `POST /meals`와 기존 `meals`/`items`는 recipe workflow 전용으로 유지하고, 완제품은 additive `product_entries`에서만 반환한다 | 기존 소비자 호환 + recipe/product 중복 반환 금지 |
> | 3 | 제품 수량과 label basis 사이 변환은 pin된 immutable nutrition version의 승인된 `basis_relations[]`가 직접 증명할 때만 허용한다 | 관계 부재·불일치 시 422 `NUTRITION_BASIS_MISMATCH` |
> | 4 | recipe snapshot의 warning reason code를 불변 `recipe_nutrition_snapshots.warnings_json`에 보존하고 API `warnings[]`와 순서·값까지 1:1로 반환한다 | current 전환·Meal pin 이후 재작성 금지 |
> | 5 | 기존 wrapper/error/RLS/소유권/read-only/멱등성/status 불변식과 상태 UI 계약을 유지한다 | `loading / empty / error / read-only / partial / unavailable`, 보호 액션 return-to-action |
>
> 이 버전은 2026-07-13에 추가된 `GET /planner/nutrition` 1개와 완제품 catalog/entry 7개를 재잠글 뿐 endpoint를 추가·삭제하지 않는다. 총계는 81개(active 80개 + 삭제된 `2-4` tombstone 1개)로 유지한다. `GET /planner`의 `meals[]`와 `GET /meals`의 `items[]`는 기존 recipe-only shape를 유지하고 `product_entries[]`만 additive로 제공한다. 같은 recipe Meal이나 product entry를 두 배열 또는 두 entry type으로 중복 반환하지 않는다.
>
> 승인되지 않았거나 current가 아닌 source/profile/ingredient assignment, `revoked / superseded / stale / drifted / unknown / needs_source_check` record는 신규 계산·catalog·basis relation에 사용할 수 없다. source/profile/assignment와 product nutrition version을 사용자 요청 시 runtime public API로 갱신하거나 무검수 승격하지 않는다. 모든 JSON endpoint는 `{ success, data, error }`, error는 `{ code, message, fields[] }`를 유지하며 private product/entry owner 경계, public product 일반 사용자 read-only, column ownership DB guard, 삭제/완료성 API의 기존 멱등성과 Recipe Meal의 `registered → shopping_done → cook_done` 전이를 완화하지 않는다.
>
> `basis_relations[]` item은 `{ from: { amount, unit }, to: { amount, unit } }` shape다. `unit`은 `serving / package / g / ml` 중 하나이며, 관계는 해당 `product_nutrition_version_id`의 immutable `food_product_nutrition_versions.basis_relations_json`에 귀속된 approved record의 최소 projection이다. 같은 관계의 정방향·역방향 산술만 허용하고 관계 chaining, 다른 version의 관계, 제품명·브랜드 유사성, 임의 밀도 추정으로 변환하지 않는다. 관계가 없는 제품은 label basis와 같은 단위에서만 수량을 계산한다.
>
> API 소비 화면은 `loading / empty / error / read-only / partial / unavailable`을 구분하고, 결측을 `0`으로 대체하지 않는다. 비로그인 사용자가 완제품 등록·플래너 추가 등 보호 액션을 선택하면 기존 로그인 안내와 return-to-action을 유지한다. `cook_done`을 섭취 완료로 해석하지 않으며 의료 처방·질환 코칭·실제 섭취 기록·OCR·바코드·외식·밀키트는 이 버전의 endpoint/field 추가 범위가 아니다. 삭제된 `DELETE /recipes/{id}/save`는 복원하지 않는다.

> **2026-07-13 contract-evolution — 영양·완제품·계획 영양 API**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | 1 | 공통 Nutrition payload에 핵심 5종, 영양소별 completeness, 계산 quality, 결측≠0, 안전한 source attribution을 고정한다 | 공통 규약 / recipe/product/planner |
> | 2 | `GET /recipes/{id}`에 immutable recipe snapshot 기반 nutrition을 additive로 추가하고 `POST /meals`가 생성 당시 snapshot을 pin한다 | 기존 endpoint 확장 |
> | 3 | `GET /planner`, `GET /meals`에 additive `product_entries`를 추가하고 `GET /planner/nutrition` 계획 합계를 추가한다 | planner read model |
> | 4 | public + 본인 private 완제품 검색/CRUD와 product planner entry CRUD 7개 endpoint를 추가한다 | 완제품 catalog/entry |
> | 5 | 완제품은 shopping/cooking/leftover/recipe metrics/XP에서 제외하고 public read-only·private owner-only를 강제한다 | 권한/상태 경계 |
>
> 신규 endpoint는 총 8개다. 기존 문서의 삭제된 `2-4` tombstone까지 포함하는 목록 집계는 73→81개이며, 실제 active endpoint는 72→80개다. 외부 API key, 인증 query, secret, raw provider response는 request/response/provenance/log/browser bundle에 포함하지 않는다. 농촌진흥청 계량자료는 원문 표가 아니라 필요한 관측값·출처·조회일·`g/15mL` 변환·대표 등급 검수 결과만 내부 evidence로 보존한다.

> **2026-07-13 contract-evolution — 서비스 브랜드 호환 계약**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | 1 | 정식 서비스명 `무엇을 먹든`, 짧은 표시명 `무먹`을 API 소비자 copy 기준으로 고정한다 | API shape 변화 없음 |
> | 2 | 신규 bootstrap의 nickname이 없거나 trim 후 빈 값일 때만 `무먹러` fallback을 사용한다 | 기존 저장 nickname 불변 |
> | 3 | system notification의 과거 브랜드 고정 copy를 조회 시점에 canonicalize한다 | DB row/payload rewrite 금지 |
> | 4 | 조리 업적 표시 copy를 `첫 요리 완성`으로 갱신한다 | 기존 field/key/type 유지 |
>
> 신규 endpoint, request/response field, enum, status, DB migration은 없다. `homecook:*`, `HOMECOOK_*`, cookie/header/event/storage/package/repository/Supabase/OMO/stored key는 호환 식별자로 유지하며 사용자 콘텐츠와 일반명사 `집밥`은 변환하지 않는다.

> **2026-07-10 addendum — social auth callback / identity linking**
>
> | # | 변경 내용 | 조치 |
> | --- | --- | --- |
> | 1 | 일반 OAuth callback에 이메일 필수·same-email/same-user·same-email/different-user 분기를 고정한다 | `/auth/callback` web route 계약 추가 |
> | 2 | 로그인된 사용자의 provider 연결은 일반 callback과 분리한다 | `/auth/link/callback` web route 계약 추가 |
> | 3 | Kakao는 Supabase built-in `kakao`를 우선하고, Naver custom provider는 표준 `sub/email/email_verified` 산출을 E3에서 검증한다 | provider configuration gate 추가 |
> | 4 | 실제 로그인 provider는 `app_metadata.provider`만으로 판정하지 않는다 | 검증된 attempt와 실제 identity evidence를 결합해 결정 |
> | 5 | provider memory는 일반 로그인 성공 후에만 갱신한다 | `localStorage` primary + cookie fallback, link callback은 갱신 금지 |
> | 6 | auth/link 오류 로그에서 PII와 credential을 금지한다 | 이메일, token, code, provider payload, localStorage 값 비로그 |
>
> 두 callback은 `/api/v1/*` public JSON API가 아닌 Supabase OAuth용 web route이므로 active API endpoint 수와 `{ success, data, error }` JSON endpoint 목록은 변경하지 않는다.

# 무엇을 먹든 서비스 — API 설계 v1.2.25

> 기준 문서: 요구사항 기준선 v1.7.20 / 화면정의서 v1.5.26 / DB 설계 v1.3.21 / 유저 Flow맵 v1.3.23
> v1.2.24 → v1.2.25: recipe 실제 투입량 의미, 상태 전체의 exactly-one 승인 기본 profile/conversion 선택, exact piece fail-closed를 잠그고 Recipe Detail nutrition에 nullable `availability_reason`을 additive 추가한다. endpoint/HTTP status/error code는 변경 없음. 총계 81개(active 80개 + tombstone 1개) 유지.
> v1.2.23 → v1.2.24: recipe snapshot attribution을 `sources_json`에 불변 pin하고 exact 6-field projection·실제 기여 source·canonical stable dedupe/order를 고정한다. public endpoint/field/status/error는 변경 없음. 총계 81개(active 80개 + tombstone 1개) 유지.
> v1.2.22 → v1.2.23: PR #1005 predecessor를 고정 소비하고 recipe/product read-model 호환, 승인된 version-pinned `basis_relations[]`, snapshot `warnings[]` 1:1 보존, 기존 권한·상태·멱등성·상태 UI를 증분 재잠근다. 신규 endpoint 없음. 총계 81개(active 80개 + 삭제 tombstone 1개) 유지.
> v1.2.21 → v1.2.22: 재료 영양·완제품·플래너 계획 영양 contract-evolution. Nutrition 공통 shape, recipe/product immutable snapshot pin, 완제품 catalog/entry CRUD, planner nutrition aggregate를 추가한다. 엔드포인트 수 73 → 81.
> v1.2.20 → v1.2.21: 서비스 브랜드 copy contract-evolution. endpoint/field/DB shape는 유지하고, 신규·빈 nickname fallback과 system notification read-time canonicalization만 고정한다.
> 작성: 킴실장
> 2026-06-20 LEFTOVERS stale review server-sync addendum: `leftover_dishes.stale_reviewed_at`을 목록 응답에 추가하고 `POST /leftovers/{leftover_id}/keep`을 추가한다. `leftover` / `eaten` 상태 계약은 유지한다. 엔드포인트 수 72 → 73.
> 2026-06-20 404 feedback addendum: `POST /api/v1/feedback/404` 추가. 404 페이지 인라인 피드백을 기존 `operational_events`에 `not_found_feedback` 이벤트로 저장한다. 신규 DB table 없음. 엔드포인트 수 71 → 72.
> v1.2.19 → v1.2.20: recipe tags v2 contract-evolution. `tags` / `recipe_tags` 정규화 모델, `GET /recipes?tag=<normalized_key>`, 제목+승인 tag 검색, `GET /tags`, `POST /recipes/tag-suggestions`, YouTube/manual register의 reviewed tags body를 추가한다. 서버 자동 추천은 유지한다. 엔드포인트 수 69 → 71.
> 2026-06-16 launch-readiness addendum: `PATCH /shopping/lists/{list_id}/items/bulk` 일괄 체크 API와 `POST /api/v1/admin/page-view` 관리자 진입 감사 API를 공식화한다. 엔드포인트 수 67 → 69.
> 2026-06-16 addendum: SETTINGS 끼니 컬럼 순서 변경을 공식화한다. `PATCH /planner/columns/{column_id}`는 기존 이름 변경에 더해 optional `sort_order`를 받는다. 해당 addendum 자체의 신규 endpoint 없음.
> v1.2.18 → v1.2.19: 35a growth-achievement-album contract-evolution. `GET /users/me/gamification`에 achievement album, tutorial category, spoon grade image fields를 additive 확장한다. 신규 endpoint 없음. 기존 `quests` field는 호환 유지하되 standard quest expansion은 중단한다.
> v1.2.17 → v1.2.18: 34a growth-leveling-v2 contract-evolution. `planner_registered` XP source, `POST /meals.source_path` activity metadata, `user_growth_activity_events`, level curve v2/grade, gamification priority notifications, archive endpoint, badge shape/locked hint, MYPAGE profile integration contract 추가
> v1.1 → v1.2: 채실장 2차 리뷰 A1~A4 + 장보기 구현 아이디어 반영
> v1.2 → v1.2.1: 채실장 3차 리뷰 P0 4건 + P1 3건 (예시 수정 + 정책 문구 추가, 엔드포인트 변경 없음)
> v1.2.1 → v1.2.2: `PLANNER_WEEK` 끼니 컬럼 CRUD 제거, 4끼 고정 슬롯 정책 반영
> v1.2.2 → v1.2.3: 기본 끼니 컬럼을 3개로 변경하고 `/planner/columns` 조회/추가/이름변경/삭제 계약 재도입
> v1.2.3 → v1.2.4: Wave1 prototype parity 계약 반영. HOME `latest` 정렬, multi-save, 장보기 기록 `completed_at`, 남은요리 카드 메타, 레시피북 상세 메타 확장
> v1.2.4 → v1.2.5: PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로. 신규 엔드포인트 없음 — 기존 9-2 `POST /cooking/sessions`를 `MEAL_SCREEN`에서 단일 `meal_id`로 호출하는 사용 패턴 공식화
> v1.2.5 → v1.2.6: 슬라이스 20 YouTube 실제 API 기반 추출 contract-evolution. §6 전면 개정: 3-way classification, 서버 세션 기반 추출, ingredient resolution, step incomplete, 원자적 RPC 등록, provenance session FK, provider 에러(502/429), feature flag guard(404)
> v1.2.6 → v1.2.7: 슬라이스 22 YouTube 미등록 재료 등록 contract-evolution. Extract ingredient에 `draft_ingredient_id` 추가, `POST /recipes/youtube/ingredient-registration` 추가, `register_youtube_ingredient(...)` RPC로 표준 재료/동의어 등록 후 클라이언트 row resolved 전환
> v1.2.7 → v1.2.8: MVP 1 계약 위험 잠금. 실제 route/화면/테스트 소비자가 없는 `POST /auth/refresh`를 제거하고, 세션 갱신은 Supabase SDK / `@supabase/ssr` 세션 관리에 위임
> v1.2.8 → v1.2.9: MVP 1 계약 위험 잠금 CR-002. 웹에서 직접 소비하지 않는 `POST /auth/login`, `PATCH /auth/profile`을 public API 계약에서 제거. 로그인은 Supabase OAuth callback, 신규/기존 사용자 bootstrap은 callback 및 `PATCH /users/me` 계열로 정리
> v1.2.9 → v1.2.10: RC-MO-06 회원 탈퇴 정책 확정. `DELETE /users/me`는 사용자 개인 데이터를 삭제하고, 사용자가 직접 등록한 레시피는 작성자 정보 없이 보존한다. 엔드포인트 수 변경 없음
> v1.2.10 → v1.2.11: slice27 선행 taxonomy contract lock. `GET /ingredients?category=`와 YouTube ingredient registration은 당시 legacy 7종 category label을 유지하고, cooking method category는 optional additive metadata로만 취급한다. 2026-06-08 follow-up에서 ingredient category label은 `과일` 포함 8종으로 확장한다. 엔드포인트 수 변경 없음
> v1.2.11 → v1.2.12: Admin Foundation 읽기 전용 엔드포인트 3종 추가. `GET /api/v1/admin/users`, `GET /api/v1/admin/operational-events`, `GET /api/v1/admin/audit-logs`. `createServiceRoleClient()` 필수, 감사 로그 기록, PII 최소화. 엔드포인트 수 55 → 58
> 2026-05-28 addendum: 레시피오형 quick import 중복 확인 `GET /api/v1/recipes/youtube/recipio/check` 추가. 기존 validate/extract/register 계약 재사용, DB 변경 없음. 엔드포인트 수 58 → 59
> v1.2.12 → v1.2.13: YouTube section label persistence. `component_label` nullable field를 extract/register/detail/cook-mode ingredient/step 계약에 추가. `POST /recipes` manual body는 6-4 참조에서 분리하고 `component_label` 비허용을 명시. 엔드포인트 수 변경 없음
> 2026-05-30 addendum: 한 영상에 여러 요리가 있는 YouTube 영상은 공개 설명란/작성자 댓글/caption timedtext에서 후보를 분리해 `multi_parent` 세션으로 저장한다. 사용자는 `POST /recipes/youtube/candidate-drafts`로 후보 하나를 `candidate_child` 세션으로 승격한 뒤 기존 register 계약을 사용한다. 엔드포인트 수 59 → 60
> v1.2.13 → v1.2.14: Recipe media/tags contract. `POST /api/v1/recipes/images` 이미지 업로드 endpoint 추가, YouTube register가 session thumbnail/tags를 서버에서 저장, manual `POST /recipes`가 current-user upload reference만 허용하고 tags는 서버 생성. 엔드포인트 수 60 → 61
> v1.2.14 → v1.2.15: YouTube visual quantity enrichment contract. `POST /recipes/youtube/extract` 응답에 `quantity_*` review fields를 추가하고, `POST /recipes/youtube/register`가 `draft_ingredient_id`와 `quantity_confirmation_status`를 서버 draft 기준으로 검증한다. 신규 엔드포인트 없음
> v1.2.15 → v1.2.16: taxonomy v2 contract. 재료는 8대분류/21소분류, 조리방법은 6그룹/20대표 method로 확장하되, v1 category label query/body와 `GET /cooking-methods` v1 shape는 유지한다. 신규 엔드포인트 없음

---

## v1.2.19 → v1.2.20 변경

### Recipe tags v2 계약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| TAG-V2-1 | 서버 태그 자동 추천은 유지한다 | YouTube extract/manual suggestion에서 `suggested_tags`를 만든다. 사용자가 수정하지 않으면 추천값을 저장한다 |
| TAG-V2-2 | 사용자가 태그를 검수/수정할 수 있다 | YouTube register와 manual `POST /recipes`에 optional `tags` body를 허용한다 |
| TAG-V2-3 | 정규화 tag model을 canonical로 둔다 | DB는 `tags` / `recipe_tags`를 source of truth로 쓰고 `recipes.tags`는 projection으로 유지한다 |
| TAG-V2-4 | HOME 테마는 승인된 semantic/source tag만 seed로 쓴다 | `theme_eligible=true`, `visibility='public'`, `review_status='approved'`만 theme 후보 |
| TAG-V2-5 | 검색은 cursor pagination을 깨지 않는다 | title/tag match recipe id를 dedupe한 뒤 기존 stable sort와 cursor를 적용한다 |
| TAG-V2-6 | 한글 normalized key를 사용한다 | P0에서 `normalized_key='한식'`처럼 한글 key를 그대로 사용. 자동 romanization 금지 |

P0 semantic/source tag seed:

`자취요리`, `초보가능`, `밀프렙`, `도시락반찬`, `냉털요리`, `아이반찬`, `술안주`, `캠핑요리`, `10분컷`, `30분이내`, `간단요리`, `원팬요리`, `에어프라이어`, `전자레인지`, `불없이`, `노오븐`, `고단백`, `다이어트`, `저당`, `저탄수`, `채식한끼`, `발효한끼`, `한식`, `국물요리`, `밑반찬`, `디저트`, `K디저트`, `면요리`, `분식`, `샐러드`, `한그릇요리`, `해장요리`, `매콤`, `바삭`, `밥도둑`, `유튜브레시피`

> `유명셰프요리`, `SNS화제`, `검증된레시피`는 검증 가능한 provider metadata/allowlist/운영 승인 전까지 P1 후보이며 P0 자동 부여 대상이 아니다.

## v1.2.15 → v1.2.16 변경

### Taxonomy v2 additive API 계약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| TAXONOMY-V2-1 | 재료 taxonomy target은 8대분류/21소분류다 | `GET /ingredients`에 `category_group_code`, `category_code`, `category_label` optional field를 additive로 허용 |
| TAXONOMY-V2-2 | v1 category label 8종은 계속 호환한다 | `GET /ingredients?category=<v1 label>`와 `POST /recipes/youtube/ingredient-registration.category` 유지 |
| TAXONOMY-V2-3 | YouTube 미등록 재료 등록은 v2 code를 받을 수 있다 | `category_code` optional body field. 없으면 v1 `category`로 fallback 매핑 |
| TAXONOMY-V2-4 | 조리방법 taxonomy target은 6그룹/20대표 method다 | `GET /cooking-methods`에 `category_code`, `category_label`, `synonyms` optional field를 additive로 허용 |
| TAXONOMY-V2-5 | `씻기`는 canonical method가 아니고 `에어프라이어`는 canonical method다 | seed/source 검증 기준. `씻기`는 synonym 또는 자유 step text 후보 |

재료 taxonomy v2 source:

| 대분류 | 소분류 |
| --- | --- |
| 곡류/면/떡 | 밥/쌀, 면/파스타, 빵/떡/시리얼 |
| 채소/버섯 | 잎/나물채소, 뿌리/줄기채소, 열매채소/버섯 |
| 과일/견과 | 과일, 견과/씨앗/건과일 |
| 단백질 | 돼지/소/양, 닭/오리, 달걀, 두부/콩류 |
| 해산물 | 생선/갑각/조개, 해조/건어물/어묵 |
| 유제품/대체유 | 우유/요거트/크림, 치즈/버터/대체유 |
| 양념/조미 | 장류/소스, 향신료/허브, 기름/식초/당류/육수 |
| 가공/기타 | 김치/절임/통조림, 냉동/간편식/음료/기타 |

조리방법 taxonomy v2 source:

| 그룹 | 대표 method |
| --- | --- |
| 준비/손질 | 썰기, 다지기 |
| 전처리 | 해동, 밑간, 절이기 |
| 물/수분 조리 | 끓이기, 삶기, 데치기, 찌기 |
| 팬/기름 조리 | 볶기, 굽기, 부치기, 튀기기 |
| 혼합/조림 | 섞기, 무치기, 조리기, 졸이기 |
| 기기 조리 | 전자레인지, 오븐굽기, 에어프라이어 |

> 모든 응답은 `{ success, data, error }` envelope를 유지한다.
> v2 field는 additive-only이며, v1 consumer가 모르는 field를 무시해도 기존 동작이 깨지면 안 된다.
> `채썰기`, `재우기`, `핏물빼기`, `지지기`, `중탕`, `압력솥`, `간보기`, `토핑`, `담기`, `식히기`, `숙성`은 canonical method가 아니라 synonym 또는 자유 step text 후보로 둔다.

## v1.2.14 → v1.2.15 변경

### YouTube visual quantity enrichment 계약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| YT-QTY-1 | 공개 텍스트 추출과 기존 Gemini text structured fallback 이후에도 재료 수량이 부족하면 조건부 visual quantity enrichment를 실행할 수 있다 | provider boundary는 `visual_quantity_extractor`; 첫 adapter는 Gemini video understanding/public YouTube URL |
| YT-QTY-2 | extract 응답 재료 row에 수량 출처와 검수 필요 여부를 노출한다 | `quantity_source`, `quantity_confidence`, `quantity_raw_text`, `quantity_evidence_refs`, `quantity_review_required`, `quantity_user_confirmed` optional fields |
| YT-QTY-3 | visual enrichment는 원천 source가 아니라 보조 enrichment이다 | `extraction_methods`에는 추가하지 않고 `source_providers`와 `extraction_meta_json.visual_quantity_extractor`에 기록 |
| YT-QTY-4 | 추정 수량은 사용자 확인 없이 등록할 수 없다 | register body의 `quantity_confirmation_status`를 서버가 session draft의 `draft_ingredient_id` 기준으로 검증 |
| YT-QTY-5 | provider/cache/event 저장 범위 제한 | raw video/frame/provider response, API key, secret, 레시피오 data 저장/반환 금지 |

`YoutubeQuantitySource`:

```ts
type YoutubeQuantitySource =
  | "text_explicit"
  | "visual_explicit"
  | "unit_normalized"
  | "ingredient_default"
  | "recipe_inferred"
  | "user_entered"
  | "unknown";
```

`quantity_confirmation_status`:

```ts
type YoutubeQuantityConfirmationStatus =
  | "not_required"
  | "confirmed_suggestion"
  | "edited_quantity"
  | "cleared_to_taste";
```

검증 우선순위:

1. `text_explicit`: 공개 텍스트에 명시된 수량
2. `visual_explicit`: 화면 속 명시 수량
3. `unit_normalized`: raw explicit evidence 기반 단위 변환
4. `ingredient_default`: 명시 count evidence 기반 기본값
5. `recipe_inferred`: 추론 수량, 항상 review-required

---

## v1.2.13 → v1.2.14 변경

### 레시피 미디어/태그 계약

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| MEDIA-TAG-1 | YouTube 등록 레시피 상세에 영상 썸네일을 표시 | extract session의 `thumbnail_url`을 register 시 `recipes.thumbnail_url`에 서버가 복사. 클라이언트 override 금지 |
| MEDIA-TAG-2 | 직접 등록 레시피에 사용자 이미지 업로드 지원 | `POST /api/v1/recipes/images` 추가. Supabase Storage `recipe-images/{user_id}/{uuid}.{ext}`에 저장 |
| MEDIA-TAG-3 | 임의 외부 이미지 URL과 cross-user 이미지 참조 차단 | `POST /recipes`는 현재 사용자 업로드 API가 반환한 참조만 허용 |
| MEDIA-TAG-4 | YouTube/직접 등록 모두 자동 태그 생성 | 공유 결정론 tag generator가 `recipes.tags`를 최대 3개 생성. 클라이언트 임의 태그 입력 금지 |
| MEDIA-TAG-5 | MVP 범위 보호 | YouTube 썸네일 다운로드/리호스팅/압축, DB binary 저장, generated/AI image fallback은 scope 밖. normalized tag table은 v1.2.20에서 scope 안으로 이동 |

---

## v1.2.12 → v1.2.13 변경

### YouTube 섹션 라벨 영속화

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| YT-SECTION-1 | 설명란의 재료/단계 섹션 라벨을 등록 후에도 유지 | `component_label` nullable field를 YouTube extract/register, recipe detail, cook-mode 응답에 추가 |
| YT-SECTION-2 | 섹션 라벨과 본문 prefix 중복 표시 방지 | `component_label`이 있으면 `display_text`, `instruction`은 같은 `[섹션명]` prefix를 포함하지 않음 |
| YT-SECTION-3 | 직접 레시피 등록 계약 보호 | `POST /recipes` manual body를 §6-4 참조에서 분리하고 `component_label` 비허용 명시 |

---

## v1.2.11 → v1.2.12 변경

### Admin Foundation 읽기 전용 내부 운영 API

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| ADMIN-1 | 내부 운영자가 `/admin`에서 사용자 목록, 운영 이벤트, 감사 로그를 읽기 전용으로 조회해야 함 | `/api/v1/admin/*` 3개 GET endpoint와 page-view audit POST 추가 |
| ADMIN-2 | 관리자 권한은 일반 사용자 권한과 분리되어야 함 | `admin_members`를 단일 진실 소스로 사용하고 서버에서 `requireAdminUser` 검증 |
| ADMIN-3 | 교차 사용자 조회는 user-scoped client로 처리하면 안 됨 | `createServiceRoleClient()` 필수, service role 부재 시 fail closed, `routeClient` fallback 금지 |
| ADMIN-4 | 운영자 조회 행위는 추적 가능해야 함 | 모든 Admin API read와 `/admin` 진입은 `admin_audit_logs`에 기록 |
| ADMIN-5 | 로그가 민감정보 저장소가 되면 안 됨 | `request_path`는 pathname만 저장하고 OAuth code/next/error, YouTube URL/source text, admin search term/email/nickname 저장 금지 |

---

## v1.2.10 → v1.2.11 변경

### Taxonomy contract lock (slice27 선행)

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| TAXONOMY-1 | 재료 category query/validation은 `과일` 포함 v1 canonical 8종 label을 유지 | `GET /ingredients?category=<category label>`, `POST /recipes/youtube/ingredient-registration.category` 계약 명시 |
| TAXONOMY-2 | ingredient taxonomy v2는 API field replacement가 아님 | `category_code` 같은 additive field만 허용하고 v1 `category`는 migration 동안 유지 |
| TAXONOMY-3 | `GET /cooking-methods` v1 shape 유지 | category는 optional additive metadata이며 기존 필수 필드 삭제 금지 |
| TAXONOMY-4 | 외부 데이터는 production API로 직수입하지 않음 | 식약처/농식품올바로 raw import API는 이번 계약 범위 밖, staging/review/approved seed gate 필요 |

---

## v1.2.9 → v1.2.10 변경

### 회원 탈퇴 데이터 정리 정책

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| ACCOUNT-DELETE-1 | 회원 탈퇴는 기존 `users.deleted_at` soft-delete만으로 처리하지 않는다. 같은 소셜 계정으로 다시 로그인해도 이전 개인 기록이 보이지 않아야 한다. | `DELETE /users/me`에서 `delete_user_private_data(p_user_id)` DB RPC 호출 |
| ACCOUNT-DELETE-2 | 레시피북, 플래너, 장보기, 팬트리, 좋아요, 남은요리, cooking session 등 사용자 소유 개인 데이터는 삭제한다. | `public.users` row 삭제와 FK cascade로 정리 |
| ACCOUNT-DELETE-3 | 사용자가 직접/유튜브로 등록한 레시피는 다른 사용자의 저장/플래너 참조를 깨지 않도록 DB에 남긴다. | `recipes.created_by`는 FK `ON DELETE SET NULL`에 따라 작성자 정보 없이 보존 |
| ACCOUNT-DELETE-4 | 삭제된 사용자의 저장/좋아요 row가 사라진 뒤 레시피 카운트가 남은 참조 기준과 맞아야 한다. | 영향받은 recipe의 `save_count`, `like_count` 재계산 |
| ACCOUNT-DELETE-5 | public API surface는 그대로 유지한다. | endpoint active count 55개 유지 |

---

## v1.2.8 → v1.2.9 변경

### legacy auth login/profile endpoint 제거

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| AUTH-LEGACY-1 | `POST /auth/login`은 실제 route와 테스트는 있었지만 현재 웹 LOGIN 화면에서 직접 호출하지 않는다. 웹 로그인은 Supabase browser client의 `signInWithOAuth`와 `/auth/callback`에서 처리한다. | endpoint 제거 |
| AUTH-LEGACY-2 | `PATCH /auth/profile`은 신규 회원 닉네임 설정 용도였지만, 현재 사용자 프로필 수정 API는 `PATCH /users/me`가 담당한다. | `PATCH /auth/profile` 대체: `PATCH /users/me` |
| AUTH-LEGACY-3 | 신규/기존 사용자 bootstrap은 `/auth/callback`, `GET /users/me`, `PATCH /users/me`, settings/account 계열 API에서 `ensurePublicUserRow` / `ensureUserBootstrapState`로 보정한다. | 별도 auth profile API를 유지하지 않는다 |
| AUTH-LEGACY-4 | endpoint 전체 목록의 active method/path 수를 실제 route 수와 맞춘다. | active 55개 |

---

## v1.2.7 → v1.2.8 변경

### 인증 refresh endpoint 제거

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| AUTH-REFRESH-1 | `POST /auth/refresh`가 API 문서에는 있었지만 실제 `app/api/v1/auth/refresh/route.ts`, 화면 호출, 테스트가 없었다. | endpoint 제거 |
| AUTH-REFRESH-2 | 현재 웹 인증은 Supabase OAuth callback, `getSession()`, `onAuthStateChange()`, `@supabase/ssr` cookie 기반 세션 관리에 의존한다. | 별도 public refresh API를 만들지 않는다 |
| AUTH-REFRESH-3 | refresh token을 body로 받는 새 public API를 만들면 불필요한 token handling surface가 늘어난다. | Supabase SDK 세션 갱신에 위임 |
| AUTH-REFRESH-4 | endpoint 전체 목록의 active method/path 수를 실제 route 수와 맞춘다. | active 57개 |

---

## v1.2.4 → v1.2.5 변경 (엔드포인트 변경 없음)

### PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로

| # | 변경 내용 | 조치 |
| --- | --- | --- |
| PL-03-1 | `MEAL_SCREEN`에서 `shopping_done` 식사의 개별 `[요리하기]` 진입 경로 공식화 | 9-2 `POST /cooking/sessions`의 허용 호출자에 `MEAL_SCREEN` 추가, `meal_ids`에 단일 ID 허용 명시 |
| PL-03-2 | 서버 검증 규칙은 기존과 동일 — 소유자, `status='shopping_done'`, `recipe_id` 일치 | 변경 없음 |
| PL-03-3 | `registered` 식사는 `meal_ids`에 포함될 수 없음 — 서버가 409 반환 | 기존 검증으로 자연 차단됨 |
| PL-03-4 | 엔드포인트 수 유지 (51개), DB 변경 없음 | 변경 없음 |

---

## v1.1 → v1.2 변경 체크리스트

### 채실장 2차 리뷰 반영 (4건)

| #   | 이슈                                               | 조치                                                                                                |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A-1 | recipe_books id 타입 충돌 (시스템 책 id가 문자열)  | 모든 recipe_books의 id를 uuid로 통일. 시스템/커스텀 구분은 book_type으로만                          |
| A-2 | DELETE /recipes/{id}/save가 Body를 요구하는 구조   | **2-4 엔드포인트 삭제**. 저장 해제는 12-7 `DELETE /recipe-books/{book_id}/recipes/{recipe_id}` 사용 |
| A-3 | shopping_list_items.added_to_pantry가 API에 미노출 | 8-2/8-3 item 응답에 `added_to_pantry` 필드 추가                                                     |
| A-4 | share-text 제외 항목 포함 여부 미정의              | `is_pantry_excluded=false` 항목만 포함하는 정책 명시                                                |

### 장보기 구현 아이디어 반영 (2건 → API 변경 4건)

| #         | 아이디어                      | API 변경                                                                                   |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| 장보기-1a | 생성 후 상세 자동 이동        | 클라이언트 로직 (8-2 응답의 id로 이동, API 변경 없음)                                      |
| 장보기-1b | 카드 드래그&드롭 순서 변경    | `sort_order` 필드 추가 + **8-4b 순서 변경 API 신규**                                       |
| 장보기-1c | 팬트리 제외 섹션 넣었다 뺐다  | 기존 8-4 `is_pantry_excluded` 토글 활용 + **제외 시 is_checked=false 자동 정리 규칙** 추가 |
| 장보기-2  | 완료 후 팬트리 반영 선택 팝업 | 8-5에 `add_to_pantry_item_ids` 파라미터 추가 (팬트리 반영 분리)                            |

### 연쇄 수정

| 항목           | 내용                                                               |
| -------------- | ------------------------------------------------------------------ |
| 엔드포인트 수  | 50개 유지 (2-4 삭제 -1 + 8-4b 신규 +1)                             |
| 12-7 역할 확대 | 레시피북 제거 + 레시피 저장 해제 겸용                              |
| DB 참고        | shopping_list_items에 sort_order 컬럼 필요 (DB v1.3에서 반영 필요) |

---

## v1.2 → v1.2.1 패치 (엔드포인트 변경 없음)

### P0 (구현 전 고정 필수) — 4건

| #    | 이슈                                     | 조치                                                 |
| ---- | ---------------------------------------- | ---------------------------------------------------- |
| P0-1 | 8-5 응답 pantry_added=6인데 item_ids 2개 | 예시 수정 + `pantry_added = item_ids 길이` 정의 고정 |
| P0-2 | 8-5 미전달 vs 빈배열 구분 없음           | null=기본값 적용, []=팬트리 반영 안 함               |
| P0-3 | 8-5 서버 검증 규칙 없음                  | 4단계 검증 + 무효 항목 무시하고 진행                 |
| P0-4 | 완료 후 리스트 수정 가능 여부 미정의     | 완료 후 read-only (8-4/8-4b → 409)                   |

### P1 (애매함 해소) — 3건

| #    | 이슈                               | 조치                            |
| ---- | ---------------------------------- | ------------------------------- |
| P1-1 | 8-3 동일 sort_order 시 정렬 불안정 | tie-breaker: `id ASC`           |
| P1-2 | 2-3 저장 시 book_type 무제한       | saved/custom만 허용, 나머지 409 |
| P1-3 | 12-7 삭제 시 카운트 갱신 미언급    | like_count/save_count 갱신 명시 |

---

## 공통 규약

### Base URL

```
/api/v1
```

### 인증

| 구분 | 설명                            |
| ---- | ------------------------------- |
| 방식 | Bearer Token (JWT)              |
| 헤더 | `Authorization: Bearer {token}` |
| 🔓   | 비로그인 허용 (토큰 없어도 200) |
| 🔒   | 로그인 필수 (토큰 없으면 401)   |
| 🔐   | 관리자 전용 (`admin_members` 등록 필요, 미등록 시 403) |

### 공통 응답 형식

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "레시피를 찾을 수 없습니다.",
    "fields": []
  }
}
```

> **문서 예시 표기 규칙**
> 이 문서의 각 엔드포인트 응답 예시는 가독성을 위해 `data` 래퍼를 생략하고 내부 payload만 표시한다.
> 실제 API 응답은 항상 위 공통 응답 형식으로 래핑된다.

### 브랜드 copy 호환 규칙

- response shape, endpoint, enum을 추가하지 않는다.
- system notification의 과거 브랜드 고정 copy는 read model 반환 직전에 다음 exact mapping만 적용한다: `집밥 기록` → `끼니 기록`, `집밥 활동` → `끼니 활동`, `집밥 성장` → `끼니 성장`, `첫 집밥 완성` → `첫 요리 완성`.
- 저장된 notification row/payload는 rewrite하지 않는다. nickname, 사용자 작성 콘텐츠, 일반명사 `집밥`, mapping에 없는 문자열에는 substring/global replacement를 적용하지 않는다.
- `homecook:*`, `HOMECOOK_*`, cookie/header/event/storage/package/repository/Supabase/OMO/stored key는 호환 식별자로 유지한다.

### 공통 에러 코드

| HTTP | code               | 설명                                   |
| ---- | ------------------ | -------------------------------------- |
| 400  | INVALID_REQUEST    | 요청 파라미터 오류                     |
| 401  | UNAUTHORIZED       | 인증 필요                              |
| 403  | FORBIDDEN          | 권한 없음 (다른 유저 리소스 접근 포함) |
| 404  | RESOURCE_NOT_FOUND | 리소스 없음                            |
| 409  | CONFLICT           | 중복/충돌/이미 완료                    |
| 422  | VALIDATION_ERROR   | 데이터 검증 실패                       |
| 500  | INTERNAL_ERROR     | 서버 오류                              |

**Validation Error 필드별 상세**

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해주세요.",
    "fields": [
      { "field": "planned_servings", "message": "1 이상이어야 합니다." }
    ]
  }
}
```

### 페이지네이션

```
?cursor={cursor}&limit=20
```

> `cursor`는 **opaque string** (정렬키 포함). 클라이언트는 파싱하지 않고 그대로 전달.

```json
{
  "items": [...],
  "next_cursor": "opaque-cursor-or-null",
  "has_next": true
}
```

### 멱등성 규칙

> complete / cancel 등 상태 전이 엔드포인트는 멱등하게 동작한다.
> 이미 완료/취소된 리소스에 다시 호출하면 200 + 동일 결과 반환.

### 서버 검증 공통 규칙

> `meal_ids`를 받는 모든 엔드포인트에서 서버는 다음을 검증한다.

1. **소유자 일치**: meal_id의 user_id = 요청 유저
2. **status 조건 일치**: 해당 액션에 필요한 status
3. **recipe_id 일치**: 요리 세션 시
4. **shopping_list_id 미할당**: 장보기 생성 시
   > 검증 실패: 403 (소유자 불일치), 409 (상태 충돌), 422 (파라미터 오류)

### Nutrition 공통 payload `v1.2.22`, `v1.2.23`, `v1.2.24`, `v1.2.25` 보강

아래 예시는 `GET /recipes/{id}`의 recipe nutrition context다. product/planner aggregate context는 recipe 전용 `availability_reason`을 포함하지 않는다.

레시피, 완제품, planner aggregate는 아래 영양 field 구조를 재사용하되 context 전용 field는 해당 API에서만 제공한다.

```json
{
  "basis": { "amount": 2, "unit": "serving" },
  "base_servings": 2,
  "values": {
    "energy_kcal": { "amount": 480, "known_amount": null, "status": "complete", "display_mode": "total" },
    "carbohydrate_g": { "amount": 62, "known_amount": null, "status": "complete", "display_mode": "total" },
    "protein_g": { "amount": 22, "known_amount": null, "status": "complete", "display_mode": "total" },
    "fat_g": { "amount": 15, "known_amount": null, "status": "complete", "display_mode": "total" },
    "sodium_mg": { "amount": null, "known_amount": 730, "status": "partial", "display_mode": "minimum" }
  },
  "scalable_values": {
    "energy_kcal": 440,
    "carbohydrate_g": 56,
    "protein_g": 20,
    "fat_g": 13,
    "sodium_mg": 680
  },
  "fixed_values": {
    "energy_kcal": 40,
    "carbohydrate_g": 6,
    "protein_g": 2,
    "fat_g": 2,
    "sodium_mg": 50
  },
  "calculation_status": "partial",
  "calculation_quality": "mixed",
  "availability_reason": null,
  "reflected_ingredient_count": 8,
  "target_ingredient_count": 10,
  "warnings": ["TO_TASTE_EXCLUDED", "UNIT_CONVERSION_MISSING"],
  "sources": [
    { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
  ],
  "snapshot_id": "uuid",
  "calculated_at": "2026-07-13T00:00:00Z"
}
```

**고정 규칙**

- MVP 핵심 key는 `energy_kcal`, `carbohydrate_g`, `protein_g`, `fat_g`, `sodium_mg`다. optional `sugars_g`, `saturated_fat_g`, `fiber_g`는 존재할 때만 추가한다.
- `status`는 영양소별 `complete / partial / unavailable`이다. unavailable은 `amount=null`, partial은 `amount=null` + `known_amount` + `display_mode='minimum'`이다.
- 결측 nutrient를 `amount=0`으로 만들어 반환하지 않는다. 실제 source 값 0만 `amount=0, status='complete'`가 될 수 있다.
- 계산 가능한 값이 하나 이상 있으면 `calculation_quality`는 `direct / estimated / mixed`이며 completeness와 독립이다. 대표 `VOLUME_G6/G10/G15/G20/G25` 환산을 하나라도 사용하면 `direct`가 될 수 없다. 전체 `calculation_status='unavailable'`이면 `calculation_quality=null`이다.
- `availability_reason`은 `GET /recipes/{id}`의 recipe nutrition context에만 항상 포함하는 nullable field다. 값은 정확히 `missing`, `temporarily_unavailable`, `null` 중 하나이며 product/planner aggregate nutrition에는 추가하지 않는다.
- current snapshot row가 없으면 `availability_reason='missing'`, snapshot query throw/DB error 또는 malformed/unreadable snapshot payload면 `temporarily_unavailable`, 정상 snapshot row를 읽었으면 그 row의 `calculation_status`와 무관하게 null이다. 이 field는 계산 completeness가 아니라 조회 가용성을 표현한다.
- 대표 환산값은 충분한 내부 정밀도로 계산하고 표시 직전에 g 정수 반올림한다. UI는 `약/예상`을 붙인다.
- aggregate에서 partial `known_amount`를 합산하면 결과도 `partial/minimum`이다. unavailable entry는 0으로 합산하지 않고 `incomplete_entry_count`에 포함한다.
- `sources[]` item은 `provider`, `dataset`, `source_version`, `data_basis_date`, `license`, `source_url` 6개 field로 구성된 승인 attribution 요약이다. API key, 인증 query, raw fetch URL, raw provider response, 내부 manifest storage path는 반환하지 않는다.
- recipe context의 `sources[]`는 `recipe_nutrition_snapshots.sources_json`에 계산 당시 pin된 배열을 그대로 투영한다. read/current switch/Meal pin/planner aggregate 시점에 ingredient·source·profile relation을 다시 조회해 과거 attribution을 추가·삭제·교체하지 않는다.
- recipe snapshot writer는 실제 영양값에 기여한 active current approved nutrition source를 pin한다. 대표 부피 assignment 또는 exact piece weight가 해당 기여를 가능하게 했다면, 실제 사용한 assignment/weight와 연결된 evidence가 active approved이고 그 source가 active current approved일 때만 해당 attribution도 함께 pin한다. 사용하지 않은 후보·미승인·철회·대체·stale source는 제외한다.
- attribution 중복 판정 tuple은 `(provider, dataset, source_version, data_basis_date, license, source_url)` 순서다. exact tuple을 하나로 줄인 뒤 같은 field 순서로 null을 문자열보다 먼저 두고 Unicode ordinal 오름차순으로 stable sort한다. locale·DB 무순서 결과에 의존하지 않는다.
- public recipe snapshot에 계산 가능한 공공 source 값이 실제 기여했다면 `sources` 는 non-empty다. snapshot 부재 또는 attribution 가능한 source가 실제로 하나도 기여하지 않은 unavailable context에서만 `[]`를 반환한다.
- item은 정확히 6개 field만 가지며 raw provider row/payload, auth query/token/cookie, API key/secret, manifest checksum, 내부 filesystem/storage path, 검수 actor, 다른 사용자 식별자를 추가하지 않는다. `source_url`은 인증 query를 제거한 승인 공식 URL이다.
- `visibility='public' AND source_type='public_dataset'` 제품의 영양에 공공 dataset 값이 직접 기여했다면 `sources`는 반드시 non-empty이며, 승인된 실제 attribution만 반환한다. `sources=[]`는 attribution 가능한 public source가 실제로 하나도 기여하지 않은 경우에만 허용한다.
- public source의 `source_version`은 non-null이며 pin된 `nutrition_sources.source_version`을 그대로 반환한다. `data_basis_date`는 같은 pin row의 값이고 원 source가 별도 기준일을 제공하지 않으면 null이다. 응답 시 live source 페이지를 다시 조회하거나 현재값으로 재작성하지 않는다. 아래 public 예시의 `source_version='2025-12-05'`도 승인·pin된 `nutrition_sources` 예시이며 runtime live 조회값이 아니다.
- private manual 제품은 `sources`에 `{ "provider": "user_label", "dataset": null, "source_version": null, "data_basis_date": null, "license": null, "source_url": null }`만 반환하고 다른 사용자 식별자는 포함하지 않는다.
- planner aggregate는 pin된 recipe/product 영양의 `sources`를 합집합하고 `(provider, dataset, source_version, data_basis_date, license, source_url)` stable tuple로 중복 제거한다. 같은 tuple이 여러 entry에 기여해도 각 range/day/column payload에는 한 번만 반환하며, `source_version`이 다른 pin source는 절대 합치지 않는다.
- 공통 필수 field는 `basis`, 핵심 5종 `values`, `calculation_status`, `calculation_quality`, `warnings`, `sources`다. immutable snapshot이 존재하는 recipe detail context는 additive `base_servings`, `scalable_values`, `fixed_values`를 함께 제공하며 `base_servings > 0`이고 `basis.amount = base_servings`, `basis.unit='serving'`이어야 한다. 이 context의 `values`는 기본 인분 전체 결과다. `reflected_ingredient_count`/`target_ingredient_count`/`snapshot_id`/`calculated_at`도 recipe context에서만, `incomplete_entry_count`는 aggregate context에서만 제공하며 적용되지 않는 context에서 거짓 0이나 임의 ID로 채우지 않는다. Product version 식별자는 parent의 `nutrition_version_id`로 제공한다.
- `scalable_values`와 `fixed_values`는 각각 `recipe_nutrition_snapshots.scalable_values_json`, `fixed_values_json`에 pin된 숫자 map을 그대로 투영한다. key는 `values`와 같은 nutrient key를 쓰고 optional nutrient도 존재할 때 같은 key를 쓴다. 각 숫자는 기본 인분 전체에서 계산 가능한 amount 구성요소이며 complete nutrient는 두 vector의 합이 `values.amount`, partial nutrient는 합이 `values.known_amount`와 일치한다. 계산 불가능한 nutrient key를 0으로 만들지 않고 두 vector에서 생략하며, 검증된 실제 기여값 0만 숫자 0으로 둘 수 있다.
- 선택 인분 `selected_servings`의 계산 가능한 nutrient 값은 `scalable_values[key] × selected_servings / base_servings + fixed_values[key]`다. fixed 값은 인분 증가와 무관하고 scalable 값만 비례한다. complete는 계산 결과를 `amount`에, partial은 `amount=null`을 유지한 채 `known_amount`에 적용하며 기존 `partial/minimum` 상태와 warning을 유지한다. unavailable은 `amount/known_amount=null`이고 vector 계산을 적용하지 않는다. 영양소별 `values.status`, `display_mode`, `warnings[]`가 completeness authority이며 client는 누락 vector를 0으로 보충하거나 단순 1인분 곱셈을 해서는 안 된다. `COOK_MODE` 인분 조절 금지와 snapshot 불변성은 그대로 유지한다.
- recipe context의 `warnings[]`는 해당 immutable recipe snapshot의 `recipe_nutrition_snapshots.warnings_json` warning reason code 배열과 순서·값까지 1:1이어야 한다. current snapshot 전환, Meal pin, planner 조회 시점에 warning을 재생성·추가·삭제·재정렬하지 않는다. aggregate는 각 pin된 entry warning을 안정적으로 합치되 원 snapshot payload를 수정하지 않는다.
- recipe 계산은 PR #1005 predecessor가 제공하는 approved/current source, active approved nutrition profile, active approved ingredient conversion assignment 또는 piece weight만 사용한다. 승인되지 않았거나 철회·대체·freshness 확인 실패 상태를 fallback으로 소비하지 않는다. 상태 미지정 직접 질량/호환 부피의 완전한 승인 primary chain과 부피 conversion chain은 canonical ingredient의 전체 상태에서 각각 정확히 1개일 때만 선택한다. 0개/복수 후보는 임의 정렬·이름·첫 row로 고르지 않는다.

**단위 우선순위**

1. recipe 정량 `amount + unit`은 껍질·뼈 포함 구매 총중량이 아니라 실제 투입 가식부 사용량이며 가식부율을 다시 곱하지 않는다.
2. g/kg은 상태 전체에서 완전한 승인 primary chain이 정확히 1개인 질량 profile로 직접 계산한다.
3. 같은 exactly-one 규칙으로 선택된 profile 기준이 `100mL`이고 입력이 mL/L/tbsp/tsp/cup이면 부피로 직접 계산한다.
4. 사용자가 입력한 정확한 g과 제품 표시 중량을 대표 등급보다 우선한다.
5. 그 외 부피는 `tbsp=15mL`, `tsp=5mL`, `cup=200mL`로 정규화한 뒤 자격 있는 승인 conversion path가 전체 상태에서 정확히 1개일 때만 대표 등급으로 계산한다.
6. `개/장`은 recipe 입력과 `size_code + preparation_state`가 정확히 일치하는 승인 piece weight가 있을 때만 계산한다. recipe row가 exact 크기/상태를 제공하지 않으면 fail-closed이며, 직접 g/kg 입력에는 piece 크기가 필요 없다.
7. 후보 또는 변환 경로가 없거나 복수이면 추측하지 않고 partial/unavailable을 반환한다.

---

## 0. 인증 (LOGIN)

> 화면: `LOGIN` / Flow: ② 로그인 여정

> `LOGIN` 화면의 소셜 로그인은 public `/api/v1/auth/login` endpoint가 아니라 Supabase browser client OAuth + `/auth/callback`으로 처리한다.
> 신규/기존 사용자 row와 기본 recipe book / planner column bootstrap은 callback 및 users/me 계열 API에서 보정한다.
> 닉네임 설정/변경은 `PATCH /auth/profile` 대체 API인 `PATCH /users/me`를 사용한다.

### 0-1. Provider configuration 계약

- Kakao는 Supabase 공식 built-in provider id `kakao`를 우선 사용한다. 현재 `custom:kakao` 기본값은 호환 fallback일 뿐이며, built-in 전환이 E1-E3에서 검증되면 최종 기본값으로 유지하지 않는다.
- Kakao Developers의 `account_email` 동의항목은 필수로 구성한다. Supabase/Kakao metadata에서 `is_email_valid` / `is_email_verified` 같은 명시적 신호를 확인할 수 있으면 false인 값을 동일 이메일 자동 연결 후보로 사용하지 않는다.
- Naver `custom:naver`의 UserInfo URL은 이미 구현된 no-store `GET /api/auth/oauth-userinfo/naver` adapter를 사용한다. 이 route는 Naver `response.id` / `response.email`을 top-level `sub` / `email` / `email_verified`와 승인된 최소 profile claim으로 변환하며 raw token/profile과 upstream error payload를 저장·반환하지 않는다.
- E3는 위 adapter를 경유한 `auth.users.email`과 identity `sub`를 실측한다. 실패 시 새 proxy를 추가하지 않고 기존 adapter URL/config/normalization을 복구한 뒤 재검증한다.
- 기존 `GET /api/auth/oauth-userinfo/kakao` proxy는 `custom:kakao` compatibility fallback에만 남긴다. 최종 기본 Kakao provider는 built-in `kakao`다.
- Naver `sub`는 비어 있지 않고 같은 QA identity 재로그인에서 안정적이며, 서로 다른 QA identity 사이에서 달라야 한다. email만 맞아도 `sub`가 잘못됐으면 E3 실패다.

### 0-2. 일반 OAuth callback

```http
GET /auth/callback?code=<oauth_code>&next=<safe_path>
```

- 책임: OAuth code 교환 → auth user 확인 → email 정책 검증 → 활성 `public.users` 동일 이메일 조회 → 신규 bootstrap 또는 기존 user 확인 → nickname onboarding / safe `next` 복귀 → 마지막 성공 provider 갱신
- provider는 `google | naver | kakao`만 허용하고 custom provider id는 canonical app provider로 정규화한다.
- **실제 로그인 provider 판정**: `app_metadata.provider`는 최초 가입 provider 의미이므로 단독 사용하지 않는다. callback 시작 시 서버가 검증한 provider attempt와 callback user의 identities를 대조하고, 해당 attempt와 일치하는 identity의 sign-in evidence(예: provider identity의 최신 `last_sign_in_at`)를 사용한다. 둘이 일치하지 않거나 여러 identity 중 실제 provider를 유일하게 판정할 수 없으면 성공 memory를 쓰지 않고 fail closed 한다.
- 이메일은 `trim().toLowerCase()` 후 사용한다. 비어 있으면 부분 세션을 sign out하고 `authError=email_required`로 LOGIN에 복귀하며 `public.users`와 기본 recipe book/planner column을 만들지 않는다.
- 신규 bootstrap에서 provider nickname이 없거나 trim 후 빈 문자열이면 `무먹러`를 fallback으로 사용한다. 기존 활성 `public.users.nickname`은 브랜드 전환을 이유로 덮어쓰지 않는다.
- provider/Supabase identity metadata에 명시적 email valid/verified 신호가 있고 false이면 동일 이메일 자동 연결 후보로 사용하지 않는다.
- 동일 이메일 분기:

| 활성 `public.users` 조회 | callback Supabase user id 비교 | 결과 |
| --- | --- | --- |
| 없음 | 해당 없음 | callback user id로 신규 bootstrap |
| 있음 | `existing.id === auth.user.id` | 기존/연결 identity 로그인 허용, `social_provider` 유지 |
| 있음 | `existing.id !== auth.user.id` | sign out, `authError=account_conflict`, bootstrap/merge/delete 금지 |

- provider 이름이 `public.users.social_provider`와 다르다는 이유만으로 차단하지 않는다. 기존 `provider_mismatch` / `expectedProvider` 오류 계약은 `account_conflict`로 대체하며 expected/attempted provider를 오류 URL이나 사용자 메시지에 노출하지 않는다.
- 성공한 일반 로그인만 `homecook:last-auth-provider:v1`과 compatibility cookie를 갱신한다. 버튼 클릭, OAuth 취소/실패, link callback은 갱신하지 않는다.
- 실패 event는 `email_required`, `account_conflict`, `oauth_failed`, `provider_resolution_failed` 같은 bounded code만 기록한다. email, access/refresh token, OAuth code, provider payload, user id, localStorage 값을 기록하지 않는다.

### 0-3. 로그인된 계정 provider 연결 callback

```http
GET /auth/link/callback?code=<oauth_code>&next=/mypage
```

- 진입 전제: 이미 로그인된 현재 사용자만 Supabase `linkIdentity()` 계열 흐름으로 시작할 수 있다. 일반 `signInWithOAuth()` 로그인 흐름으로 대체하지 않는다.
- 책임: link OAuth code 처리 → 현재 인증된 Supabase user id 유지 확인 → 요청 provider identity가 **같은 user id**의 identities 목록에 추가됐는지 확인 → MYPAGE 연결 상태로 복귀
- 금지: `public.users` bootstrap/merge/update/delete, `social_provider` 변경, 마지막 로그인 provider 변경, identity unlink, duplicate account merge
- callback user id가 시작 user id와 다르거나 identity가 다른 Supabase user에 속하면 안전한 conflict로 실패하며 자동 이전/삭제/merge하지 않는다.
- 취소/실패/충돌 후에도 기존 로그인 계정과 기존 identity 목록은 유지한다. 성공/실패 메시지에는 email, user id, token, OAuth code, provider payload를 포함하지 않는다.
- normal callback과 link callback은 서로의 success marker를 소비하지 않으며, link callback에서 신규 app user bootstrap으로 fallback하지 않는다.

### 0-3-a. Provider memory 브라우저 계약

- primary key: `localStorage["homecook:last-auth-provider:v1"]`
- 허용값: `google | naver | kakao`; 이외 값은 제거하고 무시한다.
- localStorage가 비어 있을 때만 유효한 `homecook-last-auth-provider` cookie를 fallback/migration source로 사용한다. 둘이 충돌하면 localStorage가 우선한다.
- 기억값은 안내용이며 인증/인가/identity linking 판단에 사용하지 않는다.
- logout은 유지하고, 확인된 `DELETE /users/me` 성공은 localStorage와 cookie를 모두 삭제한다.

### 0-4. 로그아웃

```
POST /auth/logout
```

🔒 로그인 필수

---

## 1. 홈 — 레시피 탐색 (HOME)

> 화면: `HOME`, `INGREDIENT_FILTER_MODAL` / Flow: ① 레시피 탐색 여정

### 1-1. 레시피 목록 조회

```
GET /recipes
```

🔓 비로그인

| 구분  | 필드           | 타입    | 설명                                                            |
| ----- | -------------- | ------- | --------------------------------------------------------------- |
| Query | q              | string? | 제목 또는 public/approved tag label 검색어                      |
| Query | tag            | string? | 정확 태그 필터. P0에서는 한글 `normalized_key`를 그대로 사용      |
| Query | ingredient_ids | string? | 재료 ID 콤마 구분 (AND 필터)                                    |
| Query | sort           | string? | `view_count`(기본) / `latest` / `save_count` / `plan_count` / `cook_count` |
| Query | cursor         | string? | opaque 커서                                                     |
| Query | limit          | int?    | 기본 20                                                         |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "김치찌개",
      "thumbnail_url": "https://...",
      "tags": ["한식", "찌개"],
      "base_servings": 2,
      "view_count": 1520,
      "like_count": 340,
      "save_count": 210,
      "source_type": "youtube",
      "user_status": {
        "is_saved": true,
        "saved_book_ids": ["uuid"]
      }
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": true
}
```

> 로그인 사용자는 목록/테마 카드에 `user_status`가 포함된다. 비로그인 또는 저장 없음은 `user_status: null` 또는 `{ "is_saved": false, "saved_book_ids": [] }`로 처리할 수 있다.
> `latest`는 `recipes.created_at DESC, id DESC` 기준이다. `cook_count`는 요리완료 수 기준이다. `like_count`는 응답 지표와 좋아요 토글에는 남지만 HOME 노출 정렬 키에서는 제외한다.
> `q`는 제목과 `recipe_tags.visibility='public'`, `recipe_tags.review_status='approved'`인 tag label을 검색한다. 사용자 private/pending tag는 전역 검색 대상이 아니다.
> `tag`는 `tags.normalized_key` 정확 필터다. 예: `GET /recipes?tag=한식`. 자동 romanization된 `hansik` 같은 key는 P0에서 지원하지 않는다.
> tag 검색/필터 구현은 `recipe_tags` join으로 row를 중복시키면 안 된다. DB function/view 또는 2단계 recipe id lookup + dedupe 후 기존 sort/cursor를 적용해 cursor pagination의 stable order를 보장한다.

### 1-2. 테마 섹션 조회

```
GET /recipes/themes
```

🔓 비로그인

**응답 (200)**

```json
{
  "themes": [
    {
      "id": "recent-planner",
      "title": "요즘 플래너에 많이 담은 메뉴",
      "recipes": [
        /* 최근 3일 플래너 등록 수 기준 레시피 카드 배열 (최대 10개) */
      ]
    },
    {
      "id": "no-flame-appliance",
      "title": "불 없이 만드는 요리",
      "recipes": [
        /* 전자레인지/오븐/에어프라이어 조리법만 쓰는 레시피 카드 배열 (최대 10개) */
      ]
    }
  ]
}
```

> 테마는 이름과 포함 기준이 명확히 일치하는 경우에만 반환한다. 빈 테마는 숨긴다.
> 기본 큐레이션 테마는 `recent-planner`(최근 3일 `meals.created_at` 기준 플래너 등록 수), `youtube`(`recipes.source_type='youtube'`), `no-flame-appliance`(모든 step 조리법이 전자레인지/오븐/에어프라이어 또는 준비/섞기 계열이며 화구 조리법 없음), `hearty-main`(`한그릇요리`/`고단백` tag가 있고 `밑반찬`/`디저트`/`샐러드` tag 없음)이다.
> 로그인 사용자의 팬트리 재료로 매칭 가능한 레시피가 있으면 `pantry-cleanout`(팬트리 매칭률, 부족 재료 수, 매칭 재료 수 순 정렬)을 함께 반환한다. 비로그인 사용자는 이 테마를 받지 않을 수 있다.
> 추가 tag theme는 `theme_eligible=true`인 public/approved semantic/source tag 기반 분류 결과가 있으면 `korean`, `bowl-meal`, `soup`, `youtube` 같은 형태로 함께 반환한다.
> 사용자 자유 입력 tag는 표시/검색 가능하더라도 `theme_eligible=true`와 `review_status='approved'`가 되기 전에는 HOME theme seed로 사용하지 않는다.
> theme가 특정 tag에서 파생된 경우 응답 item에 `tag_key`와 `tag_label`을 additive로 포함할 수 있다.

### 1-2b. 태그 목록 조회

```
GET /tags
```

🔓 비로그인

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Query | q | string? | label 검색어 |
| Query | kind | string? | `semantic` / `ingredient` / `method` / `source` / `user` |
| Query | theme_eligible | boolean? | HOME theme 후보만 조회 |
| Query | limit | int? | 기본 30, 최대 100 |

**응답 (200)**

```json
{
  "items": [
    {
      "normalized_key": "한식",
      "label": "한식",
      "slug": "korean",
      "kind": "semantic",
      "is_system": true,
      "theme_eligible": true,
      "usage_count": 120
    }
  ]
}
```

> `GET /tags`는 공개 검색/autocomplete용이다. private/pending user tag는 반환하지 않는다.
> `slug`는 optional이다. P0 클라이언트는 정확 필터에 `normalized_key`를 사용한다.

### 1-3. 재료 목록 조회 (재료 필터용)

```
GET /ingredients
```

🔓 비로그인

| 구분  | 필드     | 타입    | 설명                          |
| ----- | -------- | ------- | ----------------------------- |
| Query | q        | string? | 재료명 검색 (표준명 + 동의어) |
| Query | category | string? | v1 canonical 8종 카테고리 label 필터 (`채소` / `과일` / `육류` / `해산물` / `양념` / `유제품` / `곡류` / `기타`) |
| Query | category_code | string? | v2 `ingredient_categories.code` 필터. 있으면 v2 code를 우선 적용 |
| Query | category_group_code | string? | v2 `ingredient_category_groups.code` 필터 |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "standard_name": "양파",
      "category": "채소",
      "category_group_code": "vegetable_mushroom",
      "category_code": "root_stem",
      "category_label": "뿌리/줄기채소"
    }
  ]
}
```

> `category_group_code`, `category_code`, `category_label`은 v2 additive field다. 기존 소비자는 `category`만으로도 계속 동작해야 한다.

---

## 2. 레시피 상세 (RECIPE_DETAIL) `v1.2 변경`

> 화면: `RECIPE_DETAIL` / Flow: ① 탐색, ⑧ 독립 요리, ⑪ 저장/관리

### 2-1. 레시피 상세 조회

```
GET /recipes/{recipe_id}
```

🔓 비로그인 (로그인 시 좋아요/저장 여부 포함)

**응답 (200)**

```json
{
  "id": "uuid",
  "title": "김치찌개",
  "description": "...",
  "thumbnail_url": "https://...",
  "photos": [
    {
      "url": "https://...",
      "role": "primary",
      "label": null,
      "width": 552,
      "height": 534
    },
    {
      "url": "https://...",
      "role": "step",
      "label": "조리 과정",
      "width": 119,
      "height": 80
    }
  ],
  "base_servings": 2,
  "tags": ["한식", "찌개"],
  "source_type": "youtube",
  "source": {
    "youtube_url": "https://youtube.com/watch?v=...",
    "youtube_video_id": "abc123"
  },
  "view_count": 1520,
  "like_count": 340,
  "save_count": 210,
  "plan_count": 150,
  "cook_count": 89,
  "ingredients": [
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "component_label": "찌개 재료",
      "scalable": true,
      "sort_order": 1
    },
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "amount": null,
      "unit": null,
      "ingredient_type": "TO_TASTE",
      "display_text": "소금 약간",
      "component_label": "간 맞추기",
      "scalable": false,
      "sort_order": 5
    }
  ],
  "steps": [
    {
      "id": "uuid",
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
      "component_label": "재료 손질",
      "cooking_method": {
        "id": "uuid",
        "code": "prep",
        "label": "손질",
        "color_key": "gray"
      },
      "ingredients_used": [
        {
          "ingredient_id": "uuid",
          "amount": 200,
          "unit": "g",
          "cut_size": "한입 크기"
        }
      ],
      "heat_level": null,
      "duration_seconds": null,
      "duration_text": null
    }
  ],
  "nutrition": {
    "basis": { "amount": 2, "unit": "serving" },
    "base_servings": 2,
    "values": {
      "energy_kcal": { "amount": 480, "known_amount": null, "status": "complete", "display_mode": "total" },
      "carbohydrate_g": { "amount": 62, "known_amount": null, "status": "complete", "display_mode": "total" },
      "protein_g": { "amount": 22, "known_amount": null, "status": "complete", "display_mode": "total" },
      "fat_g": { "amount": 15, "known_amount": null, "status": "complete", "display_mode": "total" },
      "sodium_mg": { "amount": null, "known_amount": 730, "status": "partial", "display_mode": "minimum" }
    },
    "scalable_values": {
      "energy_kcal": 440,
      "carbohydrate_g": 56,
      "protein_g": 20,
      "fat_g": 13,
      "sodium_mg": 680
    },
    "fixed_values": {
      "energy_kcal": 40,
      "carbohydrate_g": 6,
      "protein_g": 2,
      "fat_g": 2,
      "sodium_mg": 50
    },
    "calculation_status": "partial",
    "calculation_quality": "mixed",
    "availability_reason": null,
    "reflected_ingredient_count": 8,
    "target_ingredient_count": 10,
    "warnings": ["TO_TASTE_EXCLUDED"],
    "sources": [
      { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
    ],
    "snapshot_id": "uuid",
    "calculated_at": "2026-07-13T00:00:00Z"
  },
  "user_status": {
    "is_liked": false,
    "is_saved": false,
    "saved_book_ids": []
  }
}
```

> 비로그인 시 `user_status`는 null. 조회 시 `increment_recipe_view_count(p_recipe_id)`로 `view_count += 1`을 원자적으로 반영한 뒤 응답한다.
> `component_label`은 nullable이다. 값이 있으면 UI는 인접 항목의 label 변경 지점에만 섹션 소제목을 표시한다. 같은 label prefix가 본문에 있으면 중복 표시하지 않는다.
> `photos`는 상세 화면 갤러리용 additive 필드다. `thumbnail_url`을 대표 후보로 포함하고, 공공 레시피는 `recipe_sources.extraction_meta_json.image_candidates`의 license-cleared public image 후보를 중복 제거해 함께 내려줄 수 있다. `role`은 `primary` / `alternate` / `step` / `unknown` 중 하나다.
> `nutrition`은 additive object field이며 null을 반환하지 않는다. current snapshot이 없어도 아래 공통 필수 payload 객체를 반환하고 `0 kcal`로 대체하지 않는다. 기존 client는 additive `nutrition`과 `availability_reason`을 무시해도 레시피 상세 동작이 유지돼야 한다.
>
> ```json
> {
>   "basis": { "amount": 1, "unit": "serving" },
>   "values": {
>     "energy_kcal": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "carbohydrate_g": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "protein_g": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "fat_g": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "sodium_mg": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null }
>   },
>   "calculation_status": "unavailable",
>   "calculation_quality": null,
>   "availability_reason": "missing",
>   "warnings": ["RECIPE_NUTRITION_SNAPSHOT_MISSING"],
>   "sources": []
> }
> ```
>
> snapshot이 없으므로 `snapshot_id`, `calculated_at`, 반영/대상 수 등 존재하지 않는 recipe context metadata는 생략한다. `missing`은 조회 실패가 아니라 no-row 정상 상태다.
>
> snapshot subquery가 throw/DB error로 실패하거나 반환 row payload가 malformed/unreadable이면 recipe 상세 자체는 기존 성공 wrapper와 HTTP 200으로 반환하고 nutrition만 아래 soft state를 사용한다. 새 warning/error code를 만들지 않으며 영양 영역 재시도는 같은 `GET /recipes/{id}`를 다시 조회한다.
>
> ```json
> {
>   "basis": { "amount": 1, "unit": "serving" },
>   "values": {
>     "energy_kcal": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "carbohydrate_g": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "protein_g": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "fat_g": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null },
>     "sodium_mg": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null }
>   },
>   "calculation_status": "unavailable",
>   "calculation_quality": null,
>   "availability_reason": "temporarily_unavailable",
>   "warnings": [],
>   "sources": []
> }
> ```
>
> 정상 snapshot row를 읽었으면 그 row의 `calculation_status='unavailable'`이어도 `availability_reason=null`이다. malformed row를 정상 unavailable로 위장하거나 `missing`으로 축소하지 않는다.

### 2-2. 좋아요 토글

```
POST /recipes/{recipe_id}/like
```

🔒 로그인 필수

**응답 (200)**

```json
{ "is_liked": true, "like_count": 341 }
```

### 2-3. 레시피 저장 (레시피북에 추가) `v1.2.4 멀티 저장`

```
POST /recipes/{recipe_id}/save
```

🔒 로그인 필수

| 구분 | 필드     | 타입   | 설명                                      |
| ---- | -------- | ------ | ----------------------------------------- |
| Body | book_ids | uuid[] | 저장할 레시피북 ID 목록. 1개 이상 필수    |

**응답 (200)**

```json
{
  "saved": true,
  "save_count": 213,
  "book_ids": ["uuid-1", "uuid-2"],
  "created_book_ids": ["uuid-2"],
  "already_saved_book_ids": ["uuid-1"]
}
```

> **저장 가능 book_type 제한** `v1.2.1 추가book_type`이 `saved` 또는 `custom`인 레시피북만 허용한다.
> `book_type='my_added'` 또는 `'liked'`에 저장 시 **409 CONFLICT** 반환.
> (my_added는 레시피 생성 시 자동 포함, liked는 좋아요 토글로만 관리)
> `book_ids` 내 중복 ID는 1개로 정규화한다. 이미 저장된 레시피북은 오류가 아니라 `already_saved_book_ids`에 포함하고 200으로 응답한다.
> `save_count`는 새로 생성된 `recipe_book_items` 수만큼 증가한다.

### ~~2-4. 레시피 저장 해제~~ `v1.2 삭제`

> **v1.2 변경**: 삭제. HTTP DELETE + Body는 호환 이슈가 있으므로 제거.
> 저장 해제는 12-7 `DELETE /recipe-books/{book_id}/recipes/{recipe_id}`를 사용.

### 2-5. 플래너에 추가

```
POST /meals
```

🔒 로그인 필수

| 구분 | 필드             | 타입  | 설명                 |
| ---- | ---------------- | ----- | -------------------- |
| Body | recipe_id        | uuid  | 레시피 ID            |
| Body | plan_date        | date  | 날짜 (YYYY-MM-DD)    |
| Body | column_id        | uuid  | 끼니 컬럼 ID         |
| Body | planned_servings | int   | 계획 인분 (1 이상)   |
| Body | leftover_dish_id | uuid? | 남은요리에서 추가 시 |
| Body | source_path      | enum? | 식사 추가 경로 metadata. `search` / `recipebook` / `pantry` / `leftover` / `youtube` / `manual` |

**응답 (201)**

```json
{
  "id": "uuid",
  "recipe_id": "uuid",
  "plan_date": "2026-03-01",
  "column_id": "uuid",
  "planned_servings": 2,
  "status": "registered",
  "is_leftover": false,
  "leftover_dish_id": null,
  "recipe_nutrition_snapshot_id": "uuid"
}
```

> `leftover_dish_id`가 있으면 서버에서 `is_leftover=true` 자동 세팅
> `source_path`는 성장 activity `meal_add_path_used` 기록용 optional metadata다. 알 수 없거나 누락된 값은 meal 생성 실패로 처리하지 않고 activity row만 만들지 않는다.
> 생성 시 current recipe nutrition snapshot이 있으면 `recipe_nutrition_snapshot_id`를 pin한다. 없으면 null이어도 Meal 생성은 성공하며 영양은 unavailable이다. 이후 recipe/source/profile 갱신으로 기존 Meal을 자동 repin하지 않는다.
> 이 endpoint는 Recipe Meal 전용이다. `product_id`, `product_nutrition_version_id`, product `quantity`를 받거나 완제품을 가짜 Recipe로 생성하지 않는다. 완제품 플래너 등록은 `POST /product-planner-entries`만 사용하며 잘못 섞인 body는 422 `VALIDATION_ERROR`다.

---

## 3. 식단 플래너 (PLANNER_WEEK)

> 화면: `PLANNER_WEEK` / Flow: ③ 식단 계획 여정

### 3-1. 플래너 조회 (주간)

```
GET /planner
```

🔒 로그인 필수

| 구분  | 필드       | 타입 | 설명   |
| ----- | ---------- | ---- | ------ |
| Query | start_date | date | 시작일 |
| Query | end_date   | date | 종료일 |

**응답 (200)**
공통 응답 래퍼 `{ success, data, error }`의 `data` payload:

```json
{
  "columns": [
    { "id": "uuid", "name": "아침", "sort_order": 0 },
    { "id": "uuid", "name": "점심", "sort_order": 1 },
    { "id": "uuid", "name": "저녁", "sort_order": 2 }
  ],
  "meals": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "plan_date": "2026-03-01",
      "column_id": "uuid",
      "planned_servings": 2,
      "status": "registered",
      "is_leftover": false,
      "recipe_nutrition_snapshot_id": "uuid"
    }
  ],
  "product_entries": [
    {
      "entry_type": "product",
      "id": "uuid",
      "product_id": "uuid",
      "product_name": "플레인 요거트",
      "product_brand": "브랜드",
      "plan_date": "2026-03-01",
      "column_id": "uuid",
      "quantity": { "amount": 1, "unit": "serving" },
      "workflow_status": null,
      "product_nutrition_version_id": "uuid",
      "basis_relations": [
        {
          "from": { "amount": 1, "unit": "serving" },
          "to": { "amount": 150, "unit": "g" }
        }
      ],
      "nutrition": {
        "basis": { "amount": 1, "unit": "serving" },
        "values": {
          "energy_kcal": { "amount": 105, "known_amount": null, "status": "complete", "display_mode": "total" },
          "carbohydrate_g": { "amount": 7.5, "known_amount": null, "status": "complete", "display_mode": "total" },
          "protein_g": { "amount": 6, "known_amount": null, "status": "complete", "display_mode": "total" },
          "fat_g": { "amount": 6, "known_amount": null, "status": "complete", "display_mode": "total" },
          "sodium_mg": { "amount": 82.5, "known_amount": null, "status": "complete", "display_mode": "total" }
        },
        "calculation_status": "complete",
        "calculation_quality": "direct",
        "warnings": [],
        "sources": [
          { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
        ]
      }
    }
  ]
}
```

> 끼니 컬럼은 사용자별 동적 목록이다. 신규 사용자 기본값은 `아침 / 점심 / 저녁` 3개이며, 기존 사용자에게 이미 있는 컬럼은 자동 삭제하지 않는다.
> 컬럼 수는 최소 1개, 최대 5개다. 신규 컬럼은 현재 마지막 `sort_order + 1`로 생성한다. 컬럼 순서 변경은 `PATCH /planner/columns/{column_id}`의 `sort_order`로 처리한다.
> `meals`는 기존 recipe-only 배열을 유지하고 `product_entries`만 additive로 추가한다. 같은 recipe Meal을 두 배열에 중복 반환하지 않는다. 새 client는 두 배열을 local `PlannerEntry[]`로 합치며 기존 client는 `meals`만 계속 소비할 수 있다.

### 3-2. 끼니 컬럼 목록 조회

```
GET /planner/columns
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "columns": [
    { "id": "uuid", "name": "아침", "sort_order": 0 },
    { "id": "uuid", "name": "점심", "sort_order": 1 },
    { "id": "uuid", "name": "저녁", "sort_order": 2 }
  ]
}
```

### 3-3. 끼니 컬럼 추가

```
POST /planner/columns
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| ---- | ---- | ---- | ---- |
| Body | name | string | 새 끼니 컬럼명 (1~30자) |

**응답 (201)**

```json
{
  "column": { "id": "uuid", "name": "간식", "sort_order": 3 }
}
```

**정책**
- 사용자별 컬럼 수가 이미 5개면 409 `COLUMN_LIMIT_REACHED`
- 같은 사용자 안에서 공백을 trim한 이름이 중복되면 409 `COLUMN_NAME_DUPLICATE`

### 3-4. 끼니 컬럼 수정

```
PATCH /planner/columns/{column_id}
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| ---- | ---- | ---- | ---- |
| Path | column_id | uuid | 끼니 컬럼 ID |
| Body | name | string? | 변경할 끼니 컬럼명 (1~30자) |
| Body | sort_order | int? | 변경할 표시 순서. 0 이상의 정수이며, 서버는 사용자 소유 컬럼 범위 안에서 0부터 연속 정렬되도록 저장 |

**응답 (200)**

```json
{
  "column": { "id": "uuid", "name": "브런치", "sort_order": 0 }
}
```

**정책**
- 다른 사용자의 컬럼이면 403
- 존재하지 않는 컬럼이면 404
- 같은 사용자 안에서 공백을 trim한 이름이 중복되면 409 `COLUMN_NAME_DUPLICATE`
- `name`과 `sort_order` 중 최소 하나는 있어야 하며, 없으면 422
- `sort_order`는 사용자 소유 컬럼만 대상으로 한다. 이동 후 전체 컬럼의 `sort_order`는 0부터 연속 값으로 다시 저장한다

### 3-5. 끼니 컬럼 삭제

```
DELETE /planner/columns/{column_id}
```

🔒 로그인 필수

**응답 (200)**

```json
{ "deleted": true }
```

**정책**
- 컬럼이 1개만 남은 상태면 409 `MIN_COLUMN_REQUIRED`
- 해당 컬럼에 연결된 `meals` 또는 `product_planner_entries`가 1건 이상 있으면 409 `COLUMN_HAS_MEALS`
- 삭제 후 남은 컬럼은 `sort_order ASC, id ASC` 기준으로 0부터 다시 정렬한다

### 3-6. 플래너 계획 영양 조회

```
GET /planner/nutrition
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Query | start_date | date | 시작일 |
| Query | end_date | date | 종료일. 포함 범위, 최대 7일 |

**응답 (200)**

```json
{
  "range": { "start_date": "2026-03-01", "end_date": "2026-03-07" },
  "summary": {
    "nutrition": {
      "basis": { "amount": 1, "unit": "range" },
      "values": {
        "energy_kcal": { "amount": null, "known_amount": 8320, "status": "partial", "display_mode": "minimum" },
        "carbohydrate_g": { "amount": null, "known_amount": 1030, "status": "partial", "display_mode": "minimum" },
        "protein_g": { "amount": null, "known_amount": 410, "status": "partial", "display_mode": "minimum" },
        "fat_g": { "amount": null, "known_amount": 290, "status": "partial", "display_mode": "minimum" },
        "sodium_mg": { "amount": null, "known_amount": 11800, "status": "partial", "display_mode": "minimum" }
      },
      "calculation_status": "partial",
      "calculation_quality": "mixed",
      "incomplete_entry_count": 2,
      "warnings": [],
      "sources": [
        { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
      ]
    },
    "recipe_entry_count": 12,
    "product_entry_count": 4
  },
  "days": [
    {
      "plan_date": "2026-03-01",
      "nutrition": {
        "basis": { "amount": 1, "unit": "range" },
        "values": {
          "energy_kcal": { "amount": 1800, "known_amount": null, "status": "complete", "display_mode": "total" },
          "carbohydrate_g": { "amount": 230, "known_amount": null, "status": "complete", "display_mode": "total" },
          "protein_g": { "amount": 90, "known_amount": null, "status": "complete", "display_mode": "total" },
          "fat_g": { "amount": 60, "known_amount": null, "status": "complete", "display_mode": "total" },
          "sodium_mg": { "amount": 2200, "known_amount": null, "status": "complete", "display_mode": "total" }
        },
        "calculation_status": "complete",
        "calculation_quality": "mixed",
        "incomplete_entry_count": 0,
        "warnings": [],
        "sources": [
          { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
        ]
      },
      "columns": [
        {
          "column_id": "uuid",
          "nutrition": {
            "basis": { "amount": 1, "unit": "range" },
            "values": {
              "energy_kcal": { "amount": 600, "known_amount": null, "status": "complete", "display_mode": "total" },
              "carbohydrate_g": { "amount": 75, "known_amount": null, "status": "complete", "display_mode": "total" },
              "protein_g": { "amount": 30, "known_amount": null, "status": "complete", "display_mode": "total" },
              "fat_g": { "amount": 20, "known_amount": null, "status": "complete", "display_mode": "total" },
              "sodium_mg": { "amount": 700, "known_amount": null, "status": "complete", "display_mode": "total" }
            },
            "calculation_status": "complete",
            "calculation_quality": "mixed",
            "incomplete_entry_count": 0,
            "warnings": [],
            "sources": [
              { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
            ]
          }
        }
      ]
    }
  ]
}
```

**계약**

- Recipe Meal은 `recipe_nutrition_snapshot_id`, product entry는 `product_nutrition_version_id`의 pin된 값만 합산한다. current profile을 다시 조회해 과거 계획을 바꾸지 않는다.
- Meal snapshot이 null이거나 product nutrient가 결측이면 해당 nutrient/entry를 0으로 더하지 않는다.
- partial `known_amount`가 하나라도 포함되면 결과는 `partial/minimum`이다. 모든 entry가 unavailable이면 nutrient amount와 known_amount는 null이다.
- 계산 가능한 entry가 있을 때 `calculation_quality`는 모두 direct이면 direct, 모두 estimated이면 estimated, 나머지는 mixed다. 모든 entry가 unavailable이면 null이다.
- `sources`는 각 범위에 실제로 포함된 pin된 recipe/product attribution의 합집합이다. 동일 `(provider, dataset, source_version, data_basis_date, license, source_url)` tuple은 range/day/column별로 한 번만 반환하고 `source_version`이 다른 pin source는 합치지 않으며, attribution 가능한 public source가 하나도 기여하지 않은 범위에서만 `[]`를 반환한다.
- 범위는 최대 7일이며 서버는 batch query로 계산한다. 날짜/끼니별 N+1 query를 허용하지 않는다.
- 응답과 UI label은 `계획 영양`이며 실제 섭취·목표 달성·의료 조언을 뜻하지 않는다.

---

## 4. 끼니 화면 (MEAL_SCREEN)

> 화면: `MEAL_SCREEN` / Flow: ③ 식단 계획 여정

### 4-1. 특정 끼니의 식사 목록 조회

```
GET /meals
```

🔒 로그인 필수

| 구분  | 필드      | 타입 | 설명         |
| ----- | --------- | ---- | ------------ |
| Query | plan_date | date | 날짜         |
| Query | column_id | uuid | 끼니 컬럼 ID |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "planned_servings": 2,
      "status": "registered",
      "is_leftover": false,
      "recipe_nutrition_snapshot_id": "uuid",
      "nutrition": {
        "basis": { "amount": 2, "unit": "serving" },
        "values": {
          "energy_kcal": { "amount": null, "known_amount": 900, "status": "partial", "display_mode": "minimum" },
          "carbohydrate_g": { "amount": null, "known_amount": 100, "status": "partial", "display_mode": "minimum" },
          "protein_g": { "amount": null, "known_amount": 45, "status": "partial", "display_mode": "minimum" },
          "fat_g": { "amount": null, "known_amount": 30, "status": "partial", "display_mode": "minimum" },
          "sodium_mg": { "amount": null, "known_amount": 1500, "status": "partial", "display_mode": "minimum" }
        },
        "calculation_status": "partial",
        "calculation_quality": "mixed",
        "warnings": ["UNIT_CONVERSION_MISSING"],
        "sources": [
          { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
        ]
      }
    }
  ],
  "product_entries": [
    {
      "entry_type": "product",
      "id": "uuid",
      "product_id": "uuid",
      "product_name": "플레인 요거트",
      "product_brand": "브랜드",
      "quantity": { "amount": 1, "unit": "serving" },
      "workflow_status": null,
      "product_nutrition_version_id": "uuid",
      "basis_relations": [
        {
          "from": { "amount": 1, "unit": "serving" },
          "to": { "amount": 150, "unit": "g" }
        }
      ],
      "nutrition": {
        "basis": { "amount": 1, "unit": "serving" },
        "values": {
          "energy_kcal": { "amount": 105, "known_amount": null, "status": "complete", "display_mode": "total" },
          "carbohydrate_g": { "amount": 7.5, "known_amount": null, "status": "complete", "display_mode": "total" },
          "protein_g": { "amount": 6, "known_amount": null, "status": "complete", "display_mode": "total" },
          "fat_g": { "amount": 6, "known_amount": null, "status": "complete", "display_mode": "total" },
          "sodium_mg": { "amount": 82.5, "known_amount": null, "status": "complete", "display_mode": "total" }
        },
        "calculation_status": "complete",
        "calculation_quality": "direct",
        "warnings": [],
        "sources": [
          { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
        ]
      }
    }
  ]
}
```

> `items`는 기존 recipe-only 배열을 유지하고 `product_entries`를 additive로 제공한다. 같은 recipe row를 두 배열에 중복 반환하지 않는다. Product entry에는 status, recipe_id, shopping_list_id, cooked_at, leftover_dish_id를 추가하지 않는다.

### 4-2. 식사 인분 변경

```
PATCH /meals/{meal_id}
```

🔒 로그인 필수

| 구분 | 필드             | 타입 | 설명                 |
| ---- | ---------------- | ---- | -------------------- |
| Body | planned_servings | int  | 변경할 인분 (1 이상) |

### 4-3. 식사 삭제

```
DELETE /meals/{meal_id}
```

🔒 로그인 필수

**응답 (204)**: No Content

---

## 5. 식사 추가 (MENU_ADD, RECIPE_SEARCH_PICKER)

> 화면: `MENU_ADD`, `RECIPE_SEARCH_PICKER` / Flow: ③ 식단 계획 여정

### 5-1. 레시피 검색 (식사 추가용)

> 1-1 `GET /recipes` 재사용

### 5-2. 레시피북에서 추가

> 12-2 → 12-6 → 2-5 `POST /meals` 순서

### 5-3. 남은요리에서 추가

> 2-5 `POST /meals`에 `leftover_dish_id` 포함

### 5-4. 팬트리 기반 레시피 추천

```
GET /recipes/pantry-match
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명         |
| ----- | ------ | ------- | ------------ |
| Query | cursor | string? | 페이지네이션 |
| Query | limit  | int?    | 기본 20      |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "김치찌개",
      "thumbnail_url": "https://...",
      "match_score": 0.85,
      "matched_ingredients": 5,
      "total_ingredients": 6,
      "missing_ingredients": [{ "id": "uuid", "standard_name": "두부" }]
    }
  ]
}
```

### 5-5. 완제품 검색

```
GET /food-products
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Query | q | string? | 제품명/브랜드 검색어 |
| Query | cursor | string? | opaque cursor |
| Query | limit | int? | 기본 20, 최대 50 |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "플레인 요거트",
      "brand": "브랜드",
      "visibility": "public",
      "source_type": "public_dataset",
      "editable": false,
      "nutrition_version_id": "uuid",
      "basis_relations": [
        {
          "from": { "amount": 1, "unit": "serving" },
          "to": { "amount": 150, "unit": "g" }
        }
      ],
      "nutrition": {
        "basis": { "amount": 100, "unit": "g" },
        "values": {
          "energy_kcal": { "amount": 70, "known_amount": null, "status": "complete", "display_mode": "total" },
          "carbohydrate_g": { "amount": 5, "known_amount": null, "status": "complete", "display_mode": "total" },
          "protein_g": { "amount": 4, "known_amount": null, "status": "complete", "display_mode": "total" },
          "fat_g": { "amount": 4, "known_amount": null, "status": "complete", "display_mode": "total" },
          "sodium_mg": { "amount": 55, "known_amount": null, "status": "complete", "display_mode": "total" }
        },
        "calculation_status": "complete",
        "calculation_quality": "direct",
        "warnings": [],
        "sources": [
          { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
        ]
      }
    }
  ],
  "next_cursor": null,
  "has_next": false
}
```

- 결과 범위는 active `public` 제품과 현재 사용자 소유 active `private` 제품이다. 다른 사용자의 private 제품은 scope-filtered 404/검색 비노출로 존재 여부를 숨긴다.
- soft-deleted 제품은 검색과 신규 entry 생성에서 제외한다.
- public catalog는 승인 source/제품 식별자/기준량/핵심 영양값이 온전한 검수 subset만 노출한다. 이름+브랜드 유사성만으로 제품을 합치지 않는다.
- `visibility='public' AND source_type='public_dataset'` 제품의 `nutrition.sources`는 해당 영양값에 직접 기여한 승인 공공 attribution을 반드시 한 건 이상 포함한다. raw fetch URL, API key/인증 query, 내부 manifest path는 포함하지 않는다.
- `basis_relations[]`는 응답의 `nutrition_version_id`에 직접 귀속된 approved immutable relation만 포함한다. 승인 관계가 없으면 빈 배열이며, 다른 version의 relation이나 inferred relation을 섞지 않는다.

### 5-6. 내 완제품 등록

```
POST /food-products
```

🔒 로그인 필수

**Body**

```json
{
  "name": "내가 먹는 요거트",
  "brand": "브랜드",
  "nutrition": {
    "basis": { "amount": 1, "unit": "serving" },
    "values": {
      "energy_kcal": 120,
      "carbohydrate_g": 14,
      "protein_g": 8,
      "fat_g": 4,
      "sodium_mg": null
    }
  }
}
```

**응답 (201)**

```json
{
  "product": {
    "id": "uuid",
    "name": "내가 먹는 요거트",
    "brand": "브랜드",
    "visibility": "private",
    "source_type": "manual",
    "editable": true,
    "nutrition_version_id": "uuid",
    "basis_relations": [],
    "nutrition": {
      "basis": { "amount": 1, "unit": "serving" },
      "values": {
        "energy_kcal": { "amount": 120, "known_amount": null, "status": "complete", "display_mode": "total" },
        "carbohydrate_g": { "amount": 14, "known_amount": null, "status": "complete", "display_mode": "total" },
        "protein_g": { "amount": 8, "known_amount": null, "status": "complete", "display_mode": "total" },
        "fat_g": { "amount": 4, "known_amount": null, "status": "complete", "display_mode": "total" },
        "sodium_mg": { "amount": null, "known_amount": null, "status": "unavailable", "display_mode": null }
      },
      "calculation_status": "partial",
      "calculation_quality": "direct",
      "warnings": [],
      "sources": [
        { "provider": "user_label", "dataset": null, "source_version": null, "data_basis_date": null, "license": null, "source_url": null }
      ]
    }
  }
}
```

- 수동 제품은 항상 owner-only `private/manual`로 생성한다. public 전환 body field는 받지 않는다.
- `basis.amount > 0`, `basis.unit IN ('serving','package','g','ml')`이다.
- private manual create/PATCH는 `basis_relations` 입력을 받지 않으며 새 version의 관계는 빈 배열이다. 일반 사용자의 label 입력을 승인 관계로 승격하지 않는다.
- `energy_kcal`은 필수이며 0 이상이다. 나머지 핵심/optional nutrient는 생략 또는 null 가능하고, 누락 row를 0으로 저장하지 않는다.
- nutrient 값은 음수일 수 없고 정의되지 않은 code는 422 `UNSUPPORTED_NUTRIENT`다.
- 첫 nutrition profile/value/version과 product current version 전환은 하나의 transaction으로 처리한다.

### 5-7. 내 완제품 수정

```
PATCH /food-products/{product_id}
```

🔒 로그인 필수

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Body | name | string? | 제품명 |
| Body | brand | string/null? | 브랜드 |
| Body | nutrition | object? | 새 전체 라벨 기준량/값. 포함 시 immutable version 생성 |

**응답 (200)**: 5-6의 `product` shape

- 본인 private/manual 제품만 수정할 수 있다. public 제품은 403 `FORBIDDEN`이다.
- `nutrition`을 보낼 때는 5-6과 같은 전체 basis/value 규칙을 적용하며 `basis_relations=[]`인 새 version을 생성한다. 기존 version/value/relation row를 UPDATE하지 않는다.
- metadata만 바꾸면 nutrition version은 유지한다. 기존 planner entry의 이름/브랜드 snapshot과 pin된 nutrition version은 바꾸지 않는다.
- current version 경합은 409 `NUTRITION_VERSION_CONFLICT`다.

### 5-8. 내 완제품 삭제

```
DELETE /food-products/{product_id}
```

🔒 로그인 필수

**응답 (200)**

```json
{ "deleted": true }
```

- 본인 private 제품만 soft-delete한다. public 제품은 403이다.
- 이미 삭제된 본인 제품은 같은 결과를 반환해 멱등하게 동작한다.
- 기존 `product_planner_entries`와 pin된 nutrition version은 보존한다. 삭제된 제품으로 새 entry 생성은 409 `PRODUCT_DELETED`다.

### 5-9. 완제품을 플래너에 추가

```
POST /product-planner-entries
```

🔒 로그인 필수

**Body**

```json
{
  "product_id": "uuid",
  "plan_date": "2026-03-01",
  "column_id": "uuid",
  "quantity": { "amount": 1, "unit": "serving" }
}
```

**응답 (201)**

```json
{
  "entry": {
    "entry_type": "product",
    "id": "uuid",
    "product_id": "uuid",
    "product_name": "플레인 요거트",
    "product_brand": "브랜드",
    "plan_date": "2026-03-01",
    "column_id": "uuid",
    "quantity": { "amount": 1, "unit": "serving" },
    "workflow_status": null,
    "product_nutrition_version_id": "uuid",
    "basis_relations": [
      {
        "from": { "amount": 1, "unit": "serving" },
        "to": { "amount": 150, "unit": "g" }
      }
    ],
    "nutrition": {
      "basis": { "amount": 1, "unit": "serving" },
      "values": {
        "energy_kcal": { "amount": 105, "known_amount": null, "status": "complete", "display_mode": "total" },
        "carbohydrate_g": { "amount": 7.5, "known_amount": null, "status": "complete", "display_mode": "total" },
        "protein_g": { "amount": 6, "known_amount": null, "status": "complete", "display_mode": "total" },
        "fat_g": { "amount": 6, "known_amount": null, "status": "complete", "display_mode": "total" },
        "sodium_mg": { "amount": 82.5, "known_amount": null, "status": "complete", "display_mode": "total" }
      },
      "calculation_status": "complete",
      "calculation_quality": "direct",
      "warnings": [],
      "sources": [
        { "provider": "식품의약품안전처", "dataset": "식품영양성분DB정보", "source_version": "2025-12-05", "data_basis_date": null, "license": "이용허락범위 제한 없음", "source_url": "https://www.data.go.kr/data/15127578/openapi.do" }
      ]
    }
  }
}
```

- `quantity.amount > 0`, unit은 `serving / package / g / ml` 중 하나다.
- unit이 current product nutrition version의 label basis와 같으면 직접 계산한다. 서로 다른 `serving / package / g / ml` 단위는 그 version에 귀속된 approved immutable `basis_relations[]` item이 두 basis를 직접 연결할 때만 정방향 또는 역방향으로 계산한다.
- 관계 chaining, 다른 product/version의 relation, 제품명·브랜드·일반 밀도 기반 추정은 금지한다. 직접 승인 관계가 없거나 amount/unit이 관계와 호환되지 않으면 422 `NUTRITION_BASIS_MISMATCH`다.
- `column_id`는 현재 사용자 소유여야 하며 route 검증과 DB guard를 모두 적용한다. 다른 사용자 column/product/entry는 403 또는 scope-filtered 404다.
- private 제품은 owner만 추가할 수 있다. public 제품은 로그인 사용자가 추가할 수 있다.
- 생성 당시 current product nutrition version을 pin한다. current version이 없거나 경합하면 409 `NUTRITION_VERSION_CONFLICT`다.
- 이 endpoint는 Meal, recipe status, shopping/cooking/leftover row, recipe count, `planner_registered` XP, `meal_add_path_used` activity를 만들지 않는다.

### 5-10. 완제품 플래너 수량 변경

```
PATCH /product-planner-entries/{entry_id}
```

🔒 로그인 필수

**Body**

```json
{ "quantity": { "amount": 0.5, "unit": "serving" } }
```

**응답 (200)**: 5-9의 `entry` shape

- owner entry만 수정한다. quantity만 변경하며 pin된 nutrition version과 product snapshot을 바꾸지 않는다.
- basis/dimension 검증은 5-9와 동일하되 product의 현재 version이 아니라 entry에 이미 pin된 `product_nutrition_version_id`의 `basis_relations[]`만 사용한다. product current version이 바뀌어도 기존 entry의 허용 환산과 계산값은 조용히 변하지 않는다.

### 5-11. 완제품 플래너 항목 삭제

```
DELETE /product-planner-entries/{entry_id}
```

🔒 로그인 필수

**응답 (200)**: 공통 wrapper의 `data` payload

```json
{ "deleted": true, "entry_id": "uuid" }
```

- owner entry만 삭제한다. Recipe Meal과 product catalog/version은 변경하지 않는다.

### 완제품 오류/권한 요약

| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 로그인 없이 private product/entry 접근 |
| 403 | FORBIDDEN | 다른 사용자 리소스 또는 public product 수정/삭제 |
| 404 | RESOURCE_NOT_FOUND | 접근 가능한 product/entry/version 없음 |
| 409 | PRODUCT_DELETED | soft-deleted 제품으로 새 entry 생성 |
| 409 | NUTRITION_VERSION_CONFLICT | current version 경합/부재 |
| 422 | NUTRITION_BASIS_MISMATCH | 수량 단위가 label basis와 다르고 pin된 version의 승인 direct `basis_relations[]`로 변환할 수 없음 |
| 422 | UNSUPPORTED_NUTRIENT | 허용되지 않은 nutrient code |
| 422 | VALIDATION_ERROR | 날짜·수량·기준량·음수 값 오류 |

---

## 6. 유튜브 레시피 등록 (YT_IMPORT) `v1.2.7 contract-evolution`

> 화면: `YT_IMPORT` / Flow: ⑨ 유튜브 등록 여정
> 슬라이스 20: URL 미리보기는 YouTube oEmbed로 quota 없이 확인하고, 실제 추출 단계에서 YouTube Data API `videos.list` 기반 3-way classification과 description-first 추출을 수행한다. 서버 세션, ingredient resolution, step incomplete, 원자적 RPC 등록을 포함한다.

### 공통 정책

- **Feature flag**: `youtube_import` off → 모든 §6 엔드포인트 404 `FEATURE_DISABLED`
- **인증**: 모든 엔드포인트 🔒 로그인 필수 (미인증 → 401)
- **Provider 에러**: oEmbed/YouTube API 장애 → 502 `PROVIDER_ERROR`, YouTube API quota 초과 → 429 `QUOTA_EXCEEDED`
- **YouTube API key**: 서버 환경변수 `YOUTUBE_API_KEY`, 클라이언트 노출 금지

### 6-1. 유튜브 URL 검증 + oEmbed 미리보기 (Step 1)

```
POST /api/v1/recipes/youtube/validate
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Body | youtube_url | string | 유튜브 URL |

**처리**: URL에서 video_id 파싱 → YouTube oEmbed 호출(제목/채널/썸네일 미리보기) → `classification_status='uncertain'`으로 반환. 설명란/태그/카테고리 기반 3-way classification은 quota 절약을 위해 §6-2 extract 단계에서만 수행한다.

**응답 (200)**

```json
{
  "is_valid_url": true,
  "is_recipe_video": true,
  "classification_status": "uncertain",
  "classification_reasons": ["미리보기 단계에서는 요리 여부를 확정하지 않아요. 추출 단계에서 설명란으로 확인해요."],
  "video_info": {
    "video_id": "abc123",
    "title": "백종원 김치찌개",
    "channel": "백종원의 요리비책",
    "thumbnail_url": "https://..."
  }
}
```

| classification_status | 의미 | 프론트 행동 |
| --- | --- | --- |
| `uncertain` | oEmbed 미리보기만 완료, 요리 여부 미확정 | extract 진행 |

> `recipe`/`non_recipe` 판정은 §6-2 extract 단계에서 `videos.list` 설명란/태그/카테고리를 확인한 뒤 수행한다. `non_recipe`는 extract에서 422 `NOT_RECIPE_VIDEO`로 차단한다.

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 422 | INVALID_URL | 유튜브 URL 형식 아님 또는 video_id 파싱 실패 |
| 404 | VIDEO_NOT_FOUND | oEmbed에서 영상 미리보기 조회 불가 |
| 404 | FEATURE_DISABLED | feature flag off |
| 502 | PROVIDER_ERROR | oEmbed 호출 실패 |

### 6-2. 유튜브 레시피 추출 + 세션 생성 (Step 2)

```
POST /api/v1/recipes/youtube/extract
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Body | youtube_url | string | 유튜브 URL |

**처리**: video_id 파싱 → YouTube `videos.list` 호출 → description/tags/category 기반 3-way classification → 설명란 파싱으로 재료/스텝 추출 → 부족하면 공개 작성자 댓글 후보와 공개 caption timedtext를 순서대로 보조 source로 파싱 → 그래도 부족하고 env/API key/cache/한도/근거 검증 조건을 만족하면 Gemini structured fallback으로 공개 텍스트를 JSON 구조화 → 여전히 재료 수량이 부족하고 `YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=true`, provider config/API key, 사용자/일일 한도, cache miss, timeout budget 조건을 만족하면 `visual_quantity_extractor`로 화면 속 명시 수량을 보강 → 한 영상에서 여러 요리 후보가 감지되면 `multi_parent` 세션과 `recipe_candidates[]`를 생성 → 그 외에는 단일 draft 세션 생성 → 추출 결과 반환

`YOUTUBE_RECIPE_SINGLE_ONLY=1` addendum (2026-07-11): 새 extract 요청에서 다중 레시피 신호가 감지되면 `multi_parent`/candidate row를 만들지 않고 422 `UNSUPPORTED_MULTI_RECIPE_VIDEO`를 반환한다. 단일 레시피 성공 응답은 기존 필드를 유지하면서 `multi_recipe_status="single"`, `primary_candidate_id=null`, `recipe_candidates=[]`를 포함한다. flag가 꺼져 있으면 기존 다중 후보 흐름을 유지하며, flag 상태와 관계없이 이미 생성된 `multi_parent`/`candidate_child` 세션의 후보 승격·재조회·등록 재시도 계약은 유지한다.

`extraction_methods` 허용값:
- `description`: YouTube 설명란
- `comment`: 공개 작성자 top-level 댓글 후보
- `caption`: 공개 caption timedtext

Gemini는 원천 source가 아니라 구조화 보조 extractor이므로 `extraction_methods`에 별도 값을 추가하지 않는다.
Gemini 사용 시 `source_providers`에는 `gemini_structured_extractor` 또는 `gemini_structured_extractor_cache`를 추가하고, `extraction_meta_json.llm_extractor`에 `provider`, `model`, `fallback_model`, `schema_version`, `status`, `cache_hit`, `retry_count`, `fallback_used`, `input_tokens`, `output_tokens`, `reason`, `parser_quality`를 저장한다.
Visual quantity enrichment 사용 시 `source_providers`에는 `visual_quantity_extractor` 또는 `visual_quantity_extractor_cache`를 추가하고, `extraction_meta_json.visual_quantity_extractor`에 `provider`, `model`, `schema_version`, `status`, `cache_hit`, `trigger_reason`, `enriched_count`, `review_required_count`를 저장한다.
`raw_source_text`에는 설명란/작성자 댓글/caption 같은 공개 텍스트만 저장하고 API key, provider raw response, secret, 레시피오 결과는 저장하지 않는다.
raw video, raw frame, raw provider response, API key, secret, 레시피오 data는 저장하거나 응답하지 않는다.

레시피오 quick import 중복 확인을 제외한 추출 단계는 특정 `youtube_video_id`별 고정 recipe fixture를 반환하지 않고 항상 provider/parser 경로를 거친다.

**다중 레시피 응답 규칙 (2026-05-30 addendum)**

- `multi_recipe_status`: `single` / `multiple` / `ambiguous`
- `recipe_candidates[]`: 후보별 title, time range, confidence, ingredients, steps, warnings, blocking_issues, evidence_refs
- `source_segments_summary[]`: 후보 분리에 사용한 공개 source(`description`/`comment`/`caption`), 언어, track kind, segment count
- top-level `ingredients` / `steps`는 비워 두고 `blocking_issues=["MULTI_CANDIDATE_REVIEW_REQUIRED"]`를 반환한다.
- 저장하려면 먼저 §6-3b 후보 초안 API로 하나를 선택해야 한다. `multi_parent` 세션은 §6-4 register와 §6-3 ingredient-registration에서 409 `CANDIDATE_PROMOTION_REQUIRED`로 거부된다.

**응답 (200)**

```json
{
  "extraction_id": "uuid",
  "title": "백종원 김치찌개",
  "base_servings": 2,
  "thumbnail_url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  "tags": ["한식", "찌개"],
  "extraction_methods": ["description", "comment", "caption"],
  "ingredients": [
    {
      "draft_ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "component_label": "찌개 재료",
      "quantity_source": "text_explicit",
      "quantity_confidence": 0.95,
      "quantity_raw_text": "김치 200g",
      "quantity_evidence_refs": [
        {
          "source_method": "description",
          "source_provider": "youtube_description_parser",
          "line_index": 12,
          "snippet": "김치 200g"
        }
      ],
      "quantity_review_required": false,
      "quantity_user_confirmed": false,
      "ingredient_id": "uuid",
      "resolution_status": "resolved",
      "confidence": 0.95
    },
    {
      "draft_ingredient_id": "uuid",
      "standard_name": "소금",
      "amount": null,
      "unit": null,
      "ingredient_type": "TO_TASTE",
      "display_text": "소금 약간",
      "component_label": "간 맞추기",
      "quantity_source": "unknown",
      "quantity_confidence": null,
      "quantity_raw_text": null,
      "quantity_evidence_refs": [],
      "quantity_review_required": false,
      "quantity_user_confirmed": false,
      "ingredient_id": "uuid",
      "resolution_status": "resolved",
      "confidence": 0.80
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "instruction": "김치를 한입 크기로 썬다",
      "component_label": "재료 손질",
      "cooking_method": {
        "id": "uuid",
        "code": "prep",
        "label": "손질",
        "color_key": "gray",
        "is_new": false
      },
      "duration_text": null,
      "is_incomplete": false,
      "missing_fields": []
    }
  ],
  "new_cooking_methods": [
    {
      "id": "uuid",
      "code": "auto_1710000000",
      "label": "절이기",
      "color_key": "unassigned",
      "is_new": true
    }
  ],
  "draft_warnings": ["일부 재료의 수량이 불확실합니다"],
  "blocking_issues": []
}
```

**ingredient resolution_status**

| 값 | 의미 | UI |
| --- | --- | --- |
| `resolved` | 정상 매칭 | 표시 없음 |
| `needs_review` | 불확실 매칭 | 경고 배지, candidate 선택/교체 전 저장 차단 |
| `unresolved` | 매칭 실패 | 에러 배지 (저장 차단) |

> `draft_ingredient_id`는 extract 시 서버가 생성해 응답과 `youtube_extraction_sessions.draft_json.ingredients[]`에 같이 저장하는 안정 식별자다. 검수 화면에서 사용자가 재료명/수량/단위/순서를 수정해도 값은 유지하며, 미등록 재료 등록 API가 대상 draft row를 확인할 때 사용한다.
> `component_label`은 nullable이다. YouTube 설명란에서 `| 빵 반죽` 같은 섹션 heading이 감지되면 extract 응답과 session draft에 보존한다. `component_label`이 있으면 `display_text`, `instruction`에는 같은 `[섹션명]` prefix를 포함하지 않는다.
> `thumbnail_url`은 YouTube provider thumbnail URL이며 session에 저장된다. register 단계에서 클라이언트가 제공하거나 override하지 않는다.
> `tags`는 서버 tag recommender preview label 배열이다. YouTube 설명란 해시태그, provider `snippet.tags`, 제목, 재료, 조리 과정, 조리방법, source_type을 입력으로 정규화하고 P0 semantic/source tag rule을 우선 적용한다.
> `suggested_tags` structured field를 additive로 포함할 수 있다. 형식: `{ normalized_key, label, kind, source, confidence }[]`.
> 사용자가 검수 화면에서 태그를 수정하지 않으면 §6-4 register는 이 추천값을 저장한다. 사용자가 수정하면 §6-4 body의 `tags`를 사용자 검수 결과로 저장한다.
> `quantity_*` fields는 top-level `ingredients[]`, `recipe_candidates[].ingredients[]`, parent `multi_parent` session draft, selected `candidate_child` session draft, `POST /recipes/youtube/candidate-drafts` 응답에 모두 전파한다.
> `recipe_inferred`는 항상 `quantity_review_required=true`로 시작하며, quick import auto-register와 register를 사용자 확인 없이 unblock하지 못한다.

**step missing_fields**

| 필드 | 유형 | 빈값 시 |
| --- | --- | --- |
| `instruction` | blocking | 저장 차단 |
| `cooking_method` | blocking | 저장 차단 |
| `duration` | warning | 경고만 |
| `ingredients_used` | warning | 경고만 |

> 미분류 조리방법은 이 단계에서 즉시 INSERT → id 포함 반환.
> `color_key: "unassigned"`: 프론트는 fallback 색상(회색 계열) 적용.

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 422 | INVALID_URL | URL 형식 오류 |
| 404 | FEATURE_DISABLED | feature flag off |
| 422 | NOT_RECIPE_VIDEO | `non_recipe` classification 영상에 대해 extract 시도 |
| 422 | UNSUPPORTED_MULTI_RECIPE_VIDEO | `YOUTUBE_RECIPE_SINGLE_ONLY=1`이고 여러 독립 요리 후보가 감지됨. 세션/후보 row를 만들지 않음 |
| 429 | QUOTA_EXCEEDED | YouTube API quota 소진 |
| 502 | PROVIDER_ERROR | YouTube API 호출 실패 |

### 6-3. 유튜브 미등록 재료 등록 (Step 3 보완)

```
POST /api/v1/recipes/youtube/ingredient-registration
```

🔒 로그인 필수 / Feature flag guard

검수 단계에서 `unresolved` 또는 `needs_review` 재료가 기존 검색으로 해결되지 않을 때, 사용자가 확인한 표준명/v1 canonical 8종 카테고리로 새 재료를 등록하거나 이미 존재하는 표준 재료를 재사용한다. 성공 시 서버는 `draft_json`을 수정하지 않고, 클라이언트가 반환값으로 현재 row를 `resolved`로 바꾼다.

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Body | extraction_id | string | 추출 세션 ID |
| Body | draft_ingredient_id | string | extract 응답의 재료 row 안정 식별자 |
| Body | standard_name | string | 사용자가 확인한 표준 재료명 |
| Body | category | string | v1 canonical: `채소` / `과일` / `육류` / `해산물` / `양념` / `유제품` / `곡류` / `기타` |
| Body | category_code | string? | v2 `ingredient_categories.code`. 없으면 `category`로 fallback 매핑 |
| Body | default_unit | string? | 기본 단위. 없으면 null |
| Body | synonym | string? | 원문명을 동의어로 저장할 때 사용. 없으면 null |

**검증**

- `extraction_id`로 `youtube_extraction_sessions` 조회 → 소유권 검증(user_id == current_user)
- session status는 `draft`여야 하며, 만료(`expires_at < now`)면 410
- `draft_ingredient_id`는 session `draft_json.ingredients[]` 안의 `unresolved` 또는 `needs_review` row여야 함
- `standard_name`: trim 후 1~100자, 제어문자 금지, 내부 연속 공백 collapse
- `category`: v1 canonical 카테고리 8종(`채소`, `과일`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`) 중 하나
- `category_code`: 있으면 active v2 category code여야 한다. `category`와 충돌하면 `category_code`를 우선하고 conflict reason을 로그/report에 기록한다
- `default_unit`: null 또는 20자 이하 문자열
- `synonym`: trim 후 저장, 영어는 lower-case

**처리**: session 검증 → Postgres RPC `register_youtube_ingredient(...)` 원자적 실행

**RPC 원자적 처리**

1. `category_code`가 있으면 active `ingredient_categories.code`인지 검증하고, 없으면 `category` v1 label로 fallback 매핑한다
2. `ingredients`에 `standard_name`, `category`, `category_code` INSERT. 이미 있으면 기존 row 재사용 (`on conflict (standard_name) do nothing`)
3. 생성/재사용된 ingredient 조회
4. `synonym`이 비어 있거나 `lower(trim(synonym)) === lower(trim(standard_name))`이면 synonym 저장 skip
5. 같은 normalized synonym이 다른 ingredient에 이미 있으면 best-effort advisory query로 skip하고 `skipped_ambiguous` 반환
6. 안전한 경우 `ingredient_synonyms` INSERT (`on conflict (ingredient_id, synonym) do nothing`)

> `ingredient_synonyms`에는 global `UNIQUE(synonym)`을 추가하지 않는다. 경합으로 같은 synonym이 여러 ingredient에 연결돼도 기존 ingredient matching은 multi-candidate를 `needs_review`로 반환한다.
> `youtube_extraction_sessions.draft_json`은 원본 추출 snapshot/provenance로 유지하고 이 API에서 update하지 않는다.

**응답 (200)**

```json
{
  "ingredient": {
    "ingredient_id": "uuid",
    "standard_name": "연겨자",
    "category": "양념",
    "category_code": "paste_sauce",
    "default_unit": null,
    "resolution_status": "resolved"
  },
  "synonym_status": "attached",
  "warnings": []
}
```

`synonym_status` 값:

| 값 | 의미 |
| --- | --- |
| `attached` | synonym이 현재 ingredient에 연결됨 |
| `already_attached` | 이미 같은 ingredient에 연결돼 있었음 |
| `skipped_same_as_standard` | normalized synonym이 normalized standard_name과 같아 저장하지 않음 |
| `skipped_ambiguous` | 같은 synonym이 다른 ingredient에 이미 연결돼 있어 저장하지 않음 |
| `not_requested` | synonym 입력이 없음 |

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 400 | BAD_REQUEST | JSON 형식 오류 |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 404 | NOT_FOUND | 세션 없음 또는 소유자 불일치 |
| 404 | FEATURE_DISABLED | feature flag off |
| 409 | CONFLICT | session 상태 불일치, draft row 불일치, 이미 resolved row |
| 410 | SESSION_EXPIRED | 세션 만료 |
| 422 | VALIDATION_ERROR | 표준명/카테고리/default_unit/synonym 입력 오류 |
| 500 | INTERNAL_ERROR | DB/RPC 실패 |

### 6-3b. 다중 레시피 후보 초안 생성 (Step 3 후보 선택)

```
POST /api/v1/recipes/youtube/candidate-drafts
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Body | extraction_id | string | `multi_parent` 추출 세션 ID |
| Body | candidate_id | string | extract 응답의 `recipe_candidates[].candidate_id` |

**처리**: parent session 소유권/만료/status 검증 → `youtube_extraction_candidates` 후보 확인 → parent `draft_json.recipe_candidates[]`에서 후보 하나를 선택 → `candidate_child` 추출 세션 생성 → 후보 ledger를 `promoted`로 갱신 → 기존 YT_IMPORT 검수 화면이 소비할 단일 `YoutubeRecipeExtractData` 반환

**응답 (201 또는 idempotent 200)**

```json
{
  "parent_extraction_id": "uuid",
  "candidate_id": "candidate-1",
  "draft": {
    "extraction_id": "child-session-uuid",
    "title": "김치볶음밥",
    "multi_recipe_status": "single",
    "ingredients": [],
    "steps": []
  }
}
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 404 | EXTRACTION_NOT_FOUND | parent/child 세션 없음 또는 cross-user |
| 404 | CANDIDATE_NOT_FOUND | 후보 없음 |
| 404 | FEATURE_DISABLED | feature flag off |
| 409 | INVALID_EXTRACTION_SESSION | `multi_parent` 세션이 아님 |
| 409 | INVALID_CANDIDATE_STATE | 선택 불가 상태 |
| 409 | EXTRACTION_ALREADY_REGISTERED | 후보 또는 child 세션이 이미 등록됨 |
| 410 | EXTRACTION_EXPIRED | 24h TTL 초과 |
| 422 | VALIDATION_ERROR | body 형식 오류 |
| 500 | INTERNAL_ERROR | DB 실패 |

### 6-4. 유튜브 레시피 등록 확정 (Step 3 → Step 4)

```
POST /api/v1/recipes/youtube/register
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드          | 타입   | 설명                  |
| ---- | ------------- | ------ | --------------------- |
| Body | extraction_id | string | 추출 세션 ID          |
| Body | youtube_url   | string | 검수 화면의 원본 URL. provenance 저장값으로 쓰지 않고 session의 canonical URL/video ID와 mismatch 검증에만 사용 |
| Body | title         | string | 레시피명 (검수 후)    |
| Body | base_servings | int    | 기본 인분 (≥1)        |
| Body | ingredients   | array  | 검수/수정된 재료 목록 |
| Body | steps         | array  | 검수/수정된 스텝 목록 |
| Body | tags          | string[]? | 검수된 태그 label 배열. 없으면 session 추천 태그 사용 |

**ingredients 항목**: `{ draft_ingredient_id, ingredient_id, standard_name, amount, unit, ingredient_type, display_text, component_label, sort_order, quantity_confirmation_status }`

**steps 항목**: `{ step_number, instruction, component_label, cooking_method_id, ingredients_used, heat_level, duration_seconds, duration_text }`

> `cooking_method_id`만 수신 (항상 uuid 필수).
> `component_label`은 nullable이며 YouTube register 전용이다. 빈 문자열은 `null`로 정규화한다. `display_text`와 `instruction`은 같은 섹션 라벨 prefix를 중복 포함하지 않는다.
> `draft_ingredient_id`는 session `draft_json.ingredients[]`의 서버 추출 row와 매칭되어야 한다. 클라이언트가 보낸 `quantity_review_required` 값은 신뢰하지 않는다.
> `quantity_confirmation_status`는 `not_required | confirmed_suggestion | edited_quantity | cleared_to_taste` 중 하나다.
> `not_required`는 matching draft ingredient의 `quantity_review_required=false`일 때만 허용한다.
> `confirmed_suggestion`은 사용자가 YT_IMPORT에서 제안을 명시 확인했고 body 수량/단위가 draft suggestion과 canonical match할 때만 허용한다.
> `edited_quantity`는 사용자가 유효한 `QUANT` amount/unit으로 수정하거나 비어 있던 수량을 채웠을 때 허용한다.
> `cleared_to_taste`는 `ingredient_type="TO_TASTE"`, `amount=null`, `unit=null`일 때만 허용한다.
> `tags`는 optional이다. body에 없으면 session의 서버 추천 태그를 사용한다. body에 있으면 사용자 검수 완료 태그로 보고 정규화/검증한다.

**처리**: extraction_id로 `youtube_extraction_sessions` 조회 → 소유권 검증(user_id == current_user) → 만료/소비 검증 → `multi_parent` 세션이면 CANDIDATE_PROMOTION_REQUIRED 거부 → client body의 `youtube_url`을 파싱한 값과 session의 canonical URL/video ID를 비교해 EXTRACTION_MISMATCH 검증 → 각 ingredient의 `draft_ingredient_id`와 `quantity_confirmation_status`를 session draft 기준으로 검증 → 세션 `thumbnail_url` 적용 → body `tags`가 있으면 검수 태그, 없으면 session 추천 태그 적용 → Postgres RPC `register_youtube_recipe_from_session` 원자적 실행

**RPC 원자적 INSERT 순서**:
1. `recipes` INSERT (source_type='youtube', created_by=current_user, thumbnail_url=세션값, tags=일단 빈 projection 또는 추천 label)
2. `recipe_sources` INSERT (youtube_url, youtube_video_id, youtube_extraction_session_id, extraction_methods, extraction_meta_json.quantity_enrichment_summary — 세션에서 복사/요약)
3. `recipe_ingredients` INSERT (복수, `component_label` 포함)
4. `recipe_steps` INSERT (복수, `component_label` 포함)
5. `tags` UPSERT + `recipe_tags` UPSERT
6. `recipes.tags` projection 갱신
7. `youtube_extraction_sessions` UPDATE status='consumed', recipe_id=신규 recipe_id

> **Provenance**: recipe_sources의 youtube_url, youtube_video_id, extraction_methods는 **세션에서 복사** — 클라이언트 body 아님
> **Media/Tags**: YouTube register body는 `thumbnail_url`을 받지 않는다. `tags`는 사용자 검수 결과만 optional로 받으며, 없으면 서버 session 추천 태그를 사용한다.
> **Quantity summary**: `recipe_sources.extraction_meta_json.quantity_enrichment_summary`에는 provider, cache_hit, trigger_reason, enriched_count, review_required_count, schema_version만 저장한다. per-row durable provenance columns는 v1에서 추가하지 않는다.

**응답 (201)**

```json
{ "recipe_id": "uuid", "title": "백종원 김치찌개" }
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 404 | EXTRACTION_NOT_FOUND | extraction_id 없음 또는 cross-user (404로 숨김) |
| 404 | FEATURE_DISABLED | feature flag off |
| 409 | EXTRACTION_ALREADY_REGISTERED | 이미 등록 완료된 세션 |
| 409 | EXTRACTION_MISMATCH | immutable 필드(youtube_video_id 등) 불일치 |
| 409 | CANDIDATE_PROMOTION_REQUIRED | 여러 요리 후보 parent 세션을 직접 등록하려 함 |
| 410 | EXTRACTION_EXPIRED | 24h TTL 초과 |
| 422 | VALIDATION_ERROR | base_servings < 1, ingredient_type 불일치, step_number 중복, cooking_method_id 미존재 등 |
| 422 | VALIDATION_ERROR | review-required 수량을 `not_required`로 보내거나 confirmation body가 draft와 불일치 (`fields: [{ field: "quantity_review_required" }]`) |
| 422 | VALIDATION_ERROR | 태그 개수/길이/금지어/중복 검증 실패 (`fields: [{ field: "tags" }]`) |

### 6-5. 레시피오형 빠른 가져오기 중복 확인 `2026-05-28 addendum`

```
GET /api/v1/recipes/youtube/recipio/check?youtube_url={url}
```

🔒 로그인 필수 / Feature flag guard

| 구분 | 필드        | 타입   | 설명       |
| ---- | ----------- | ------ | ---------- |
| Query | youtube_url | string | 유튜브 URL |

**처리**: URL에서 canonical `youtube_video_id`를 파싱한 뒤 `recipe_sources.youtube_video_id`에서 기존 레시피를 조회한다. 이 endpoint는 중복 확인 전용이며, YouTube provider 호출이나 추출 세션 생성을 하지 않는다.

**응답 (200 — 중복 있음)**

```json
{
  "is_duplicate": true,
  "recipe": {
    "recipe_id": "uuid",
    "title": "백종원 불어묵 꼬마김밥",
    "thumbnail_url": "https://...",
    "youtube_url": "https://www.youtube.com/watch?v=X9CqUvteeMo",
    "youtube_video_id": "X9CqUvteeMo"
  }
}
```

**응답 (200 — 중복 없음)**

```json
{
  "is_duplicate": false,
  "recipe": null
}
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 404 | FEATURE_DISABLED | feature flag off |
| 422 | INVALID_URL | 유튜브 URL 형식 아님 또는 video_id 파싱 실패 |
| 500 | INTERNAL_ERROR | DB 조회 실패 |

> `/recipes/new/youtube` quick import 화면은 이 endpoint로 중복 확인을 먼저 수행한 뒤, 중복이 없을 때만 기존 §6-1 validate, §6-2 extract, §6-4 register를 순차 호출한다.
> 자동 등록 조건을 만족하지 않는 draft는 기존 `YT_IMPORT` 검수 화면으로 이동한다.

---

## 7. 직접 레시피 등록 (MANUAL_RECIPE_CREATE)

> 화면: `MANUAL_RECIPE_CREATE` / Flow: ⑩ 직접 등록 여정

### 7-0. 직접 등록 이미지 업로드

```
POST /api/v1/recipes/images
```

🔒 로그인 필수

`multipart/form-data`로 단일 이미지 파일을 업로드한다. 업로드 성공 후 반환된 `thumbnail_url`은 같은 사용자의 `POST /recipes`에서만 사용할 수 있다.

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| FormData | image | File | jpeg/png/webp, 최대 5MB |

**검증**

- 인증 필수. 미인증은 401.
- MIME 타입은 `image/jpeg`, `image/png`, `image/webp`만 허용한다.
- 파일 크기는 서버 수신 기준 5MB 이하만 허용한다.
- 파일 확장자는 서버가 MIME 기준으로 결정한다.
- 저장 경로는 Supabase Storage `recipe-images/{user_id}/{uuid}.{ext}`다.
- DB에는 이미지 바이너리를 저장하지 않는다. API는 durable public Storage URL과 storage path만 반환한다.

**응답 (201)**

```json
{
  "thumbnail_url": "https://<supabase-project>.supabase.co/storage/v1/object/public/recipe-images/<user_id>/<uuid>.webp",
  "storage_path": "<user_id>/<uuid>.webp"
}
```

**에러 응답**

| HTTP | code | 조건 |
| --- | --- | --- |
| 400 | BAD_REQUEST | multipart/form-data 또는 image file 누락 |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 413 | PAYLOAD_TOO_LARGE | 5MB 초과 |
| 422 | VALIDATION_ERROR | 허용 MIME/확장자 아님 |
| 500 | INTERNAL_ERROR | Storage 저장 실패 |

### 7-0b. 레시피 태그 추천

```
POST /recipes/tag-suggestions
```

🔒 로그인 필수

직접 등록 화면에서 저장 전 서버 추천 태그를 미리 보여주기 위한 endpoint다. 이 endpoint는 recipe row를 만들지 않는다.

| 구분 | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| Body | title | string | 레시피명 |
| Body | base_servings | int? | 기본 인분 |
| Body | ingredients | array? | 현재 입력된 재료 목록 |
| Body | steps | array? | 현재 입력된 스텝 목록 |
| Body | source_type | string? | 기본 `manual` |

**응답 (200)**

```json
{
  "suggested_tags": [
    {
      "normalized_key": "초보가능",
      "label": "초보가능",
      "kind": "semantic",
      "source": "system_suggested",
      "confidence": 0.86
    },
    {
      "normalized_key": "한식",
      "label": "한식",
      "kind": "semantic",
      "source": "system_suggested",
      "confidence": 0.91
    }
  ],
  "tags": ["초보가능", "한식"]
}
```

> 추천기는 제목/재료/스텝/조리방법을 근거로 P0 semantic/source tag를 우선 추천한다.
> 저장 전 추천 실패는 레시피 저장 자체를 막지 않는다. UI는 빈 태그 상태로 계속 편집할 수 있다.
> 응답 `tags`는 legacy label 배열이며, `suggested_tags`가 canonical structured preview다.

### 7-1. 직접 레시피 등록

```
POST /recipes
```

🔒 로그인 필수

| 구분 | 필드          | 타입   | 설명                        |
| ---- | ------------- | ------ | --------------------------- |
| Body | title         | string | 레시피명                    |
| Body | base_servings | int    | 기본 인분                   |
| Body | thumbnail_url | string? | 7-0 업로드 API가 반환한 현재 사용자 소유 public URL. 없으면 null |
| Body | ingredients   | array  | 재료 목록. `component_label` 비허용 |
| Body | steps         | array  | 스텝 목록. `component_label` 비허용 |
| Body | tags          | string[]? | 검수된 태그 label 배열. 없으면 서버 추천 태그 사용 |

**manual ingredients 항목**: `{ ingredient_id, standard_name, amount, unit, ingredient_type, display_text, sort_order, scalable }`

**manual steps 항목**: `{ step_number, instruction, cooking_method_id, ingredients_used, heat_level, duration_seconds, duration_text }`

> 직접 레시피 등록은 §6-4 YouTube register body를 참조하지 않는다. `component_label`은 YouTube extract/register 전용 field이며 manual create body에는 허용하지 않는다.
> `thumbnail_url`은 `POST /api/v1/recipes/images`가 반환한 현재 사용자 소유 참조만 허용한다. 임의 외부 URL, 만료 signed URL, 다른 사용자의 Storage 경로는 422 `VALIDATION_ERROR`로 거부한다.
> `tags`는 optional이다. 없으면 서버가 제목, 재료, 조리 과정, 조리방법 라벨에서 추천 태그를 생성해 저장한다. 있으면 사용자 검수 태그로 정규화/검증 후 저장한다.
> 저장은 `tags` / `recipe_tags` canonical 관계와 `recipes.tags` projection을 같은 트랜잭션에서 갱신해야 한다.

**응답 (201)**: 생성된 recipe 객체

> source_type = ‘manual’ 자동 설정. `recipes.thumbnail_url`은 업로드 참조 또는 null, `recipes.tags`는 canonical tag 관계의 projection이다.

## 8. 장보기 (SHOPPING_FLOW, SHOPPING_DETAIL) `v1.2 대폭 변경`

> 화면: `SHOPPING_FLOW`, `SHOPPING_DETAIL` / Flow: ④ 장보기 여정
>
> **v1.2 장보기 UX 변경 요약**
>
> - 목록 생성 → 상세 페이지 자동 이동
> - 아이템 카드형 드래그&드롭: 순서 변경 + 팬트리 제외 섹션 이동
> - 장보기 완료 후 “팬트리에 반영할 아이템 선택” 팝업

### 8-1. 장보기 대상 취합 (Step A~C)

```
GET /shopping/preview
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "eligible_meals": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_name": "김치찌개",
      "recipe_thumbnail": "https://...",
      "plan_date": "2026-03-01",
      "column_id": "uuid",
      "planned_servings": 2,
      "created_at": "2026-03-01T09:00:00.000Z"
    }
  ],
  "recipes": [
    {
      "recipe_id": "uuid",
      "recipe_name": "김치찌개",
      "recipe_thumbnail": "https://...",
      "meal_ids": ["uuid", "uuid"],
      "planned_servings_total": 4,
      "shopping_servings": 4,
      "is_selected": true
    }
  ]
}
```

> 대상 조건: `status='registered' AND shopping_list_id IS NULL`
> `eligible_meals[].plan_date`와 `eligible_meals[].column_id`는 SHOPPING_FLOW에서 레시피 제목 클릭 시 해당 끼니화면으로 돌아가기 위한 링크 컨텍스트다.

### 8-2. 장보기 목록 생성 (Step D) `v1.2 변경`

```
POST /shopping/lists
```

🔒 로그인 필수

| 구분 | 필드    | 타입  | 설명                 |
| ---- | ------- | ----- | -------------------- |
| Body | recipes | array | 선택된 레시피별 인분 |

**recipes 배열 항목:**

```json
{
  "recipe_id": "uuid",
  "meal_ids": ["uuid", "uuid"],
  "shopping_servings": 4
}
```

**응답 (201)**

```json
{
  "id": "uuid",
  "title": "3/1 장보기",
  "date_range_start": "2026-03-01",
  "date_range_end": "2026-03-07",
  "is_completed": false,
  "items": [
    {
      "id": "item-uuid-1",
      "ingredient_id": "uuid",
      "standard_name": "양파",
      "category": "채소",
      "display_text": "양파 2개 + 200g",
      "amounts_json": [
        { "amount": 2, "unit": "개" },
        { "amount": 200, "unit": "g" }
      ],
      "is_pantry_excluded": false,
      "is_checked": false,
      "added_to_pantry": false,
      "sort_order": 0
    },
    {
      "id": "item-uuid-2",
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "category": "양념",
      "display_text": "소금 1작은술",
      "amounts_json": [{ "amount": 1, "unit": "작은술" }],
      "is_pantry_excluded": true,
      "is_checked": false,
      "added_to_pantry": false,
      "sort_order": 100
    }
  ],
  "pantry_excluded_items": [
    {
      "item_id": "item-uuid-2",
      "ingredient_id": "uuid",
      "standard_name": "소금",
      "display_text": "소금 1작은술"
    }
  ]
}
```

> 서버 처리:

- shopping_lists, shopping_list_recipes, shopping_list_items INSERT
- 팬트리 보유 재료: `is_pantry_excluded=true` 자동 세팅
- 대상 meals에 shopping_list_id 미리 세팅 (status는 registered 유지)
- `sort_order`: 기본 정렬값 할당
- `added_to_pantry`: 초기값 false
  > **v1.2 추가**: `sort_order`, `added_to_pantry` 필드 추가. 생성 후 클라이언트는 반환된 `id`로 상세 페이지에 자동 이동.

### 8-3. 장보기 리스트 상세 조회

```
GET /shopping/lists/{list_id}
```

🔒 로그인 필수

**응답 (200)**: 8-2 응답과 동일 형식

> 아이템은 `sort_order ASC` 정렬로 반환. 동일한 sort_order일 경우 `id ASC`로 tie-break. 재진입/마이페이지 재열람 시에도 드래그 순서 유지.

### 8-4. 장보기 항목 업데이트 (체크 토글 + 제외 토글)

```
PATCH /shopping/lists/{list_id}/items/{item_id}
```

🔒 로그인 필수

| 구분 | 필드               | 타입     | 설명                       |
| ---- | ------------------ | -------- | -------------------------- |
| Body | is_checked         | boolean? | 구매 완료 체크 토글        |
| Body | is_pantry_excluded | boolean? | 팬트리 제외 섹션 이동 토글 |

> **제외 섹션 이동 규칙** `v1.2 추가is_pantry_excluded=true`로 변경 시 서버가 `is_checked=false`로 자동 정리.
> 제외 섹션 = “안 사는 항목”이므로 구매 체크가 의미 없기 때문.

**응답 (200)**: 업데이트된 item 객체

> **완료 후 수정 불가** `v1.2.1 추가shopping_lists.is_completed=true`인 리스트의 아이템은 수정할 수 없다. 409 CONFLICT 반환. 장보기 아이템 순서 변경 (드래그&드롭) `v1.2 신규`

### 8-4b. 장보기 아이템 순서 변경 (드래그&드롭)

```
PATCH /shopping/lists/{list_id}/items/reorder
```

🔒 로그인 필수

| 구분 | 필드   | 타입  | 설명           |
| ---- | ------ | ----- | -------------- |
| Body | orders | array | 순서 변경 목록 |

**orders 배열 항목:**

```json
{ "item_id": "uuid", "sort_order": 10 }
```

**응답 (200)**

```json
{ "updated": 5 }
```

> 서버는 해당 list_id 소속 item인지 검증 후 sort_order 업데이트.
> 재진입/마이페이지 재열람 시에도 순서 유지.
>
> **완료 후 수정 불가** `v1.2.1 추가shopping_lists.is_completed=true`인 리스트는 순서 변경도 불가. 409 CONFLICT 반환.

### 8-4c. 장보기 항목 일괄 체크 업데이트 `2026-06-16 launch-readiness 신규`

```
PATCH /shopping/lists/{list_id}/items/bulk
```

🔒 로그인 필수

| 구분 | 필드       | 타입     | 설명                         |
| ---- | ---------- | -------- | ---------------------------- |
| Body | item_ids   | uuid[]   | 일괄 체크할 장보기 item 목록 |
| Body | is_checked | boolean  | 구매 완료 체크 상태          |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "display_text": "양파 1개",
      "amounts_json": [{ "amount": 1, "unit": "개" }],
      "is_checked": true,
      "is_pantry_excluded": false,
      "added_to_pantry": false,
      "sort_order": 10
    }
  ]
}
```

> 리스트 소유자만 호출할 수 있다. `is_pantry_excluded=false`인 구매 섹션 항목만 업데이트한다.
> 일부 항목만 성공하는 partial failure를 만들지 않기 위해 서버는 단일 update statement로 처리한다.
>
> **완료 후 수정 불가** `shopping_lists.is_completed=true`인 리스트는 일괄 체크도 불가. 409 CONFLICT 반환.

### 8-5. 장보기 완료 (팬트리 반영 선택 가능) `v1.2 변경`

```
POST /shopping/lists/{list_id}/complete
```

🔒 로그인 필수

| 구분 | 필드                   | 타입    | 설명                           |
| ---- | ---------------------- | ------- | ------------------------------ |
| Body | add_to_pantry_item_ids | uuid[]? | 팬트리에 반영할 shopping_list_item ID 목록 |

> **미전달 vs 빈배열 구분** `v1.2.1 추가`
>
> - `add_to_pantry_item_ids`가 **미전달(null/undefined)**: 기본값 정책 적용. 팬트리 반영 후보 전체를 반영한다 (`is_checked=true AND is_pantry_excluded=false` 구매 섹션 항목 + `is_pantry_excluded=true` 이미있음 항목)
> - `add_to_pantry_item_ids: []` **(빈 배열)**: 팬트리 반영을 수행하지 않는다 (`pantry_added=0`)

> **프론트 구현 흐름:**

1. 유저가 [장보기 완료] 버튼 클릭
2. 팝업: 구매 완료 체크(`is_checked=true`)된 구매 섹션 아이템과 `이미있음`으로 표시된 팬트리 제외 아이템 목록 표시
3. 유저가 팬트리에 반영할 아이템을 체크/체크해제로 선택
4. [팬트리에 반영] 클릭 → 8-5 호출 (`add_to_pantry_item_ids` 전달)
5. 전부 해제하고 [반영 안 함] 클릭 → 8-5 호출 (`add_to_pantry_item_ids: []`)
   >

**응답 (200)**

```json
{
  "completed": true,
  "meals_updated": 4,
  "pantry_added": 3,
  "pantry_added_item_ids": ["item-uuid-1", "item-uuid-3", "item-uuid-5"]
}
```

> `v1.2.1 수정`: `pantry_added` = `pantry_added_item_ids`의 길이와 항상 일치.
> `pantry_added`는 이번 요청에서 팬트리 반영 처리된 shopping_list_item의 개수이다.
> pantry_items에 이미 존재하여 INSERT가 발생하지 않더라도, 사용자가 선택한 항목은 `added_to_pantry=true`로 마킹되며 `pantry_added_item_ids`에 포함된다.
> `이미있음`으로 표시된 `is_pantry_excluded=true` 항목도 선택 또는 기본값 정책으로 반영되면 같은 규칙을 적용한다.

> **서버 검증/필터 규칙** `v1.2.1 추가`
>
> 서버는 `add_to_pantry_item_ids`에 대해 다음을 검증/정리한다:
>
> 1. 모든 item_id가 해당 list_id 소속인지 확인 (아니면 무시)
> 2. 팬트리 반영 후보인지 확인: 구매 섹션은 `is_checked=true AND is_pantry_excluded=false`, 이미있음 항목은 `is_pantry_excluded=true`
> 3. `is_checked=false AND is_pantry_excluded=false`인 미구매 구매 섹션 항목은 무시
> 4. 이미 `added_to_pantry=true`인 항목은 중복 반영하지 않음 (멱등)
>
> **무효 항목 처리 정책: 무시하고 진행** (409 실패 아님). 유효한 항목만 처리. 모든 item_id가 무효여도 200 반환 (`pantry_added=0`).

> 서버 처리:

- **항상**: meals 전이(shopping_done) + shopping_lists.is_completed = true
- **선택**: 유효한 `add_to_pantry_item_ids`에 해당하는 후보 항목만 pantry_items INSERT + `added_to_pantry=true` (`is_pantry_excluded=true` 이미있음 항목 포함, 기존 pantry row는 중복 INSERT 생략)
  > **멱등성**: 이미 완료면 200 + 동일 결과 반환

### 8-6. 장보기 공유용 텍스트 `v1.2 보완`

```
GET /shopping/lists/{list_id}/share-text
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "text": "📋 3/1 장보기\n\n☐ 양파 2개 + 200g\n☐ 김치 400g\n☐ 두부 1모\n..."
}
```

> **v1.2 추가**: `is_pantry_excluded=false` 항목만 포함. 제외 섹션 항목은 공유 대상에서 제외.

---

## 9. 요리하기 (COOK_MODE)

> 화면: `COOK_MODE`, `MEAL_SCREEN`(개별 식사 단축) / Flow: ⑤ 요리하기(플래너 경유), ⑤-b 개별 식사 단축, ⑧ 독립 요리

### 9-1. 요리 세션 생성 (MEAL_SCREEN 개별 식사 [요리하기] 클릭)

```
POST /cooking/sessions
```

🔒 로그인 필수

| 구분 | 필드             | 타입   | 설명              |
| ---- | ---------------- | ------ | ----------------- |
| Body | recipe_id        | uuid   | 레시피 ID         |
| Body | meal_ids         | uuid[] | 대상 meal ID 목록 |
| Body | cooking_servings | int    | 요리 인분         |

**응답 (201)**

```json
{
  "session_id": "uuid",
  "recipe_id": "uuid",
  "status": "in_progress",
  "cooking_servings": 4,
  "meals": [{ "meal_id": "uuid", "is_cooked": false }]
}
```

> **서버 검증**: meal_ids 소유자, status='shopping_done', recipe_id 일치 확인
>
> **허용 호출자** `v1.2.5 명시`
>
> | 호출자 | meal_ids 패턴 | 설명 |
> | --- | --- | --- |
> | `MEAL_SCREEN` | 선택된 `shopping_done` meal 1건 | 개별 식사 요리 단축 경로 `v1.2.5 추가` |
>
> `MEAL_SCREEN`에서 호출할 때도 서버 검증 규칙은 동일하게 적용된다:
> - `meal_ids`에 `registered` 상태 meal이 포함되면 409 CONFLICT (기존 `status='shopping_done'` 검증으로 자연 차단)
> - `meal_ids`에 `cook_done` 상태 meal이 포함되면 409 CONFLICT
> - 장보기를 우회하여 `registered` → `cook_done` 전이는 불가능하다
>
> `meal_ids`의 최소 길이 제한은 1이다. 빈 배열은 422 VALIDATION_ERROR.

### 9-3. 요리모드 데이터 조회 — 플래너 경유 (세션 기반)

```
GET /cooking/sessions/{session_id}/cook-mode
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "session_id": "uuid",
  "recipe": {
    "id": "uuid",
    "title": "김치찌개",
    "cooking_servings": 4,
    "ingredients": [
      {
        "ingredient_id": "uuid",
        "standard_name": "김치",
        "amount": 400,
        "unit": "g",
        "display_text": "김치 400g",
        "component_label": "찌개 재료",
        "ingredient_type": "QUANT",
        "scalable": true
      }
    ],
    "steps": [
      {
        "step_number": 1,
        "instruction": "김치를 한입 크기로 썬다",
        "component_label": "재료 손질",
        "cooking_method": {
          "code": "prep",
          "label": "손질",
          "color_key": "gray"
        },
        "ingredients_used": [...],
        "heat_level": null,
        "duration_seconds": null,
        "duration_text": null
      }
    ]
  }
}
```

### 9-3b. 요리모드 데이터 조회 — 독립 요리 (레시피 기반)

```
GET /recipes/{recipe_id}/cook-mode
```

🔓 비로그인

| 구분  | 필드     | 타입 | 설명      |
| ----- | -------- | ---- | --------- |
| Query | servings | int  | 요리 인분 |

**응답 (200)**

```json
{
  "recipe": {
    "id": "uuid",
    "title": "김치찌개",
    "cooking_servings": 2,
    "ingredients": [
      /* servings 기준 스케일링 */
    ],
    "steps": [
      /* 동일 형식 */
    ]
  }
}
```

> cook-mode의 ingredient/step `component_label`은 nullable이며 recipe detail과 같은 의미다. UI는 인접 항목의 label 변경 지점에만 섹션 소제목을 표시한다.

### 9-4. 요리 완료 (플래너 경유)

```
POST /cooking/sessions/{session_id}/complete
```

🔒 로그인 필수

| 구분 | 필드                    | 타입   | 설명                     |
| ---- | ----------------------- | ------ | ------------------------ |
| Body | consumed_ingredient_ids | uuid[] | 소진 체크한 재료 ID 목록 |

**응답 (200)**

```json
{
  "session_id": "uuid",
  "status": "completed",
  "meals_updated": 2,
  "leftover_dish_id": "uuid",
  "pantry_removed": 3,
  "cook_count": 90
}
```

> **멱등성**: 이미 completed면 200 + 동일 결과 반환

### 9-5. 요리 취소

```
POST /cooking/sessions/{session_id}/cancel
```

🔒 로그인 필수

**응답 (200)**

```json
{ "session_id": "uuid", "status": "cancelled" }
```

> **멱등성**: 이미 cancelled면 200 + 동일 결과 반환

### 9-6. 독립 요리 완료 (플래너 미경유)

```
POST /cooking/standalone-complete
```

🔒 로그인 필수

| 구분 | 필드                    | 타입   | 설명                     |
| ---- | ----------------------- | ------ | ------------------------ |
| Body | recipe_id               | uuid   | 레시피 ID                |
| Body | cooking_servings        | int    | 요리한 인분              |
| Body | consumed_ingredient_ids | uuid[] | 소진 체크한 재료 ID 목록 |

**응답 (200)**

```json
{
  "leftover_dish_id": "uuid",
  "pantry_removed": 3,
  "cook_count": 91
}
```

---

## 10. 남은요리 (LEFTOVERS, ATE_LIST)

> 화면: `LEFTOVERS`, `ATE_LIST` / Flow: ⑥ 남은요리 관리 여정

### 10-1. 남은요리 목록 조회

```
GET /leftovers
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명                       |
| ----- | ------ | ------- | -------------------------- |
| Query | status | string? | `leftover`(기본) / `eaten` |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_title": "김치찌개",
      "recipe_thumbnail_url": "https://...",
      "source_meal_label": "저녁",
      "source_planned_servings": 2,
      "cooking_servings": 2,
      "status": "leftover",
      "cooked_at": "2026-03-01T18:00:00Z",
      "eaten_at": null,
      "stale_reviewed_at": null
    }
  ]
}
```

> `source_meal_label`과 `source_planned_servings`는 남은요리가 플래너 요리에서 만들어졌거나 이후 플래너에 다시 추가된 경우 최신 연결 meal 기준으로 내려준다. 독립 요리처럼 연결 meal이 없으면 `null`일 수 있다.
> `cooking_servings`는 남은요리가 만들어진 요리 인분이다.
> `stale_reviewed_at`은 오래 보관 안내에서 사용자가 [계속 보관]을 누른 마지막 시각이다. 값이 있으면 같은 남은요리의 오래 보관 안내를 반복 표시하지 않는다.

### 10-2. 다먹음 처리

```
POST /leftovers/{leftover_id}/eat
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "id": "uuid",
  "status": "eaten",
  "eaten_at": "2026-03-03T12:00:00Z",
  "auto_hide_at": "2026-04-02T12:00:00Z"
}
```

### 10-3. 덜먹음 처리

```
POST /leftovers/{leftover_id}/uneat
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "id": "uuid",
  "status": "leftover",
  "eaten_at": null,
  "auto_hide_at": null
}
```

### 10-4. 계속 보관 확인

```
POST /leftovers/{leftover_id}/keep
```

🔒 로그인 필수

`cooked_at` 기준 30일 이상 지난 남은 요리의 오래 보관 안내에서 [계속 보관]을 누를 때 호출한다. 서버는 `stale_reviewed_at=now()`만 저장하고 `status`, `eaten_at`, `auto_hide_at`은 변경하지 않는다.

**응답 (200)**

```json
{
  "id": "uuid",
  "status": "leftover",
  "stale_reviewed_at": "2026-06-20T12:00:00Z"
}
```

### 10-5. 남은요리 → 플래너 추가

> 2-5 `POST /meals` (leftover_dish_id 포함) 재사용

---

## 11. 팬트리 (PANTRY, PANTRY_BUNDLE_PICKER)

> 화면: `PANTRY`, `PANTRY_BUNDLE_PICKER` / Flow: ⑦ 팬트리 관리 여정

### 11-1. 팬트리 목록 조회

```
GET /pantry
```

🔒 로그인 필수

| 구분  | 필드     | 타입    | 설명          |
| ----- | -------- | ------- | ------------- |
| Query | q        | string? | 재료명 검색   |
| Query | category | string? | 카테고리 필터 |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "양파",
      "category": "채소",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

### 11-2. 팬트리 재료 추가

```
POST /pantry
```

🔒 로그인 필수

| 구분 | 필드           | 타입   | 설명                |
| ---- | -------------- | ------ | ------------------- |
| Body | ingredient_ids | uuid[] | 추가할 재료 ID 목록 |

**응답 (201)**

```json
{ "added": 3, "items": [...] }
```

### 11-3. 팬트리 재료 삭제

```
DELETE /pantry
```

🔒 로그인 필수

| 구분 | 필드           | 타입   | 설명                |
| ---- | -------------- | ------ | ------------------- |
| Body | ingredient_ids | uuid[] | 삭제할 재료 ID 목록 |

**응답 (200)**

```json
{ "removed": 2 }
```

### 11-4. 묶음 목록 조회

```
GET /pantry/bundles
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "bundles": [
    {
      "id": "uuid",
      "name": "조미료 모음",
      "display_order": 1,
      "ingredients": [
        {
          "ingredient_id": "uuid",
          "standard_name": "소금",
          "is_in_pantry": true
        }
      ]
    }
  ]
}
```

### 11-5. 묶음으로 팬트리 추가

> 11-2 `POST /pantry` 재사용

---

## 12. 마이페이지 (MYPAGE) `v1.2 변경`

> 화면: `MYPAGE`, `RECIPEBOOK_DETAIL` / Flow: ⑪ 저장/관리 여정

### 12-1. 내 정보 조회

```
GET /users/me
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "id": "uuid",
  "nickname": "집밥러",
  "email": "user@example.com",
  "profile_image_url": "https://...",
  "social_provider": "kakao",
  "settings": {
    "screen_wake_lock": true
  }
}
```

### 12-2. 레시피북 목록 조회 `v1.2 변경`

```
GET /recipe-books
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "books": [
    {
      "id": "uuid",
      "name": "내가 추가한 레시피",
      "book_type": "my_added",
      "recipe_count": 12,
      "cover_color_key": "lavender",
      "cover_image_url": null,
      "sort_order": 0
    },
    {
      "id": "uuid",
      "name": "저장한 레시피",
      "book_type": "saved",
      "recipe_count": 8,
      "cover_color_key": "sky",
      "cover_image_url": null,
      "sort_order": 1
    },
    {
      "id": "uuid",
      "name": "좋아요한 레시피",
      "book_type": "liked",
      "recipe_count": 25,
      "cover_color_key": "coral",
      "cover_image_url": null,
      "sort_order": 2
    },
    {
      "id": "uuid",
      "name": "주말 파티",
      "book_type": "custom",
      "recipe_count": 5,
      "cover_color_key": "sand",
      "cover_image_url": "https://...",
      "sort_order": 3
    }
  ]
}
```

> **v1.2 변경**: 모든 recipe_books의 `id`는 **uuid로 통일**. 시스템/커스텀 구분은 `book_type`으로만 한다.
> **2026-06-10 addendum**: `cover_color_key`, `cover_image_url`은 레시피북 다이어리 커버 표시용 메타데이터이다. 저장/권한 정책에는 영향을 주지 않는다.

> **시스템 레시피북 = 가상 책 정책**
>
> | book_type  | 조회 소스 (Source of Truth)                                                   |
> | ---------- | ----------------------------------------------------------------------------- |
> | `my_added` | `recipes WHERE created_by = user_id AND source_type IN ('youtube', 'manual')` |
> | `saved`    | `recipe_book_items WHERE book_id = saved 책의 uuid`                           |
> | `liked`    | `recipe_likes WHERE user_id = user_id`                                        |
> | `custom`   | `recipe_book_items WHERE book_id = 해당 커스텀 책 uuid`                       |

### 12-3. 레시피북 생성

```
POST /recipe-books
```

🔒 로그인 필수

| 구분 | 필드 | 타입   | 설명          |
| ---- | ---- | ------ | ------------- |
| Body | name | string | 레시피북 이름 |
| Body | cover_color_key | string? | `sage` / `sky` / `coral` / `lavender` / `sand`. 생략 시 sort_order 기준 순환 배정 |
| Body | cover_image_url | string? | 커버 이미지 URL. 빈 값은 `null` |

**응답 (201)**: 생성된 book 객체 (book_type = ‘custom’)

### 12-4. 레시피북 수정

```
PATCH /recipe-books/{book_id}
```

🔒 로그인 필수

| 구분 | 필드 | 타입    | 설명        |
| ---- | ---- | ------- | ----------- |
| Body | name | string? | 변경할 이름 |
| Body | cover_color_key | string? | 변경할 커버 색상 |
| Body | cover_image_url | string? | 변경할 커버 이미지 URL. 빈 값은 `null` |

> 시스템 레시피북(my_added/saved/liked) 수정 불가 → 403

### 12-5. 레시피북 삭제

```
DELETE /recipe-books/{book_id}
```

🔒 로그인 필수

> 시스템 레시피북 삭제 불가 → 403

### 12-6. 레시피북 상세 조회 (레시피 목록)

```
GET /recipe-books/{book_id}/recipes
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명         |
| ----- | ------ | ------- | ------------ |
| Query | cursor | string? | 페이지네이션 |
| Query | limit  | int?    | 기본 20      |

**응답 (200)**

```json
{
  "items": [
    {
      "recipe_id": "uuid",
      "title": "김치찌개",
      "thumbnail_url": "https://...",
      "tags": ["한식", "찌개"],
      "view_count": 1520,
      "total_duration_seconds": 1200,
      "total_duration_text": "20분",
      "base_servings": 2,
      "added_at": "2026-03-01T10:00:00Z"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": false
}
```

> 서버는 `book_type`에 따라 조회 소스 분기 (12-2 가상 책 정책 참조)
> `total_duration_seconds`는 해당 레시피 step의 `duration_seconds` 합산값이다. 합산 가능한 값이 없으면 `null`.
> `total_duration_text`는 `total_duration_seconds`를 화면 표시용으로 변환한 값이며, 값이 없으면 `null`.

### 12-6b. 레시피북 리더용 레시피 상세 조회 `2026-06-10 addendum`

```
GET /recipe-books/{book_id}/recipes/{recipe_id}
```

🔒 로그인 필수

> `RECIPEBOOK_DETAIL`의 책 리더 안에서 재료와 만들기를 보여주기 위한 읽기 전용 조회이다. 기존 `GET /recipes/{id}`처럼 레시피 상세 화면 진입 의미가 아니므로 `view_count`를 증가시키지 않는다.

**권한/소스 정책**

- `book_id`는 요청 사용자 소유 레시피북이어야 한다.
- `liked`: 요청 사용자의 `recipe_likes`에 포함된 레시피만 조회 가능
- `my_added`: 요청 사용자가 직접 등록/유튜브 등록한 레시피만 조회 가능
- `saved` / `custom`: 해당 `recipe_book_items`에 포함된 레시피만 조회 가능

**응답 (200)**

```json
{
  "recipe_id": "uuid",
  "title": "김치찌개",
  "thumbnail_url": "https://...",
  "tags": ["한식", "찌개"],
  "view_count": 1520,
  "total_duration_seconds": 1200,
  "total_duration_text": "20분",
  "base_servings": 2,
  "added_at": "2026-03-01T10:00:00Z",
  "ingredients": [
    {
      "id": "uuid",
      "ingredient_id": "uuid",
      "standard_name": "김치",
      "amount": 200,
      "unit": "g",
      "ingredient_type": "QUANT",
      "display_text": "김치 200g",
      "component_label": null,
      "scalable": true,
      "sort_order": 0
    }
  ],
  "steps": [
    {
      "id": "uuid",
      "step_number": 1,
      "instruction": "김치를 먹기 좋은 크기로 썬다.",
      "component_label": null,
      "cooking_method": null,
      "ingredients_used": [],
      "heat_level": null,
      "duration_seconds": null,
      "duration_text": null
    }
  ]
}
```

### 12-7. 레시피북에서 레시피 제거 `v1.2 역할 확대`

```
DELETE /recipe-books/{book_id}/recipes/{recipe_id}
```

🔒 로그인 필수

> **타입별 삭제 동작:**

- `liked` 책에서 제거 = 좋아요 해제 (recipe_likes DELETE)
- `my_added` 책에서는 제거 불가 → 403
- `saved` / `custom` = recipe_book_items DELETE
  > **레시피 저장 해제도 이 엔드포인트 사용** (v1.2에서 2-4 삭제됨)
  >
  > **비정규화 카운트 갱신** `v1.2.1 추가`
  > 서버는 삭제 동작에 따라 비정규화 카운트를 갱신한다:
  >
  > - `liked` 책에서 제거 → `recipes.like_count -= 1`
  > - `saved` / `custom` 책에서 제거 → `recipes.save_count -= 1`

### 12-8. 장보기 기록 목록 조회

```
GET /shopping/lists
```

🔒 로그인 필수

| 구분  | 필드   | 타입    | 설명         |
| ----- | ------ | ------- | ------------ |
| Query | cursor | string? | 페이지네이션 |
| Query | limit  | int?    | 기본 20      |

**응답 (200)**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "3/1 장보기",
      "date_range_start": "2026-03-01",
      "date_range_end": "2026-03-07",
      "is_completed": true,
      "completed_at": "2026-03-01T18:30:00Z",
      "item_count": 12,
      "created_at": "2026-03-01T09:00:00Z"
    }
  ],
  "next_cursor": "opaque-cursor",
  "has_next": false
}
```

> `completed_at`은 `is_completed=true`인 항목에서 필수이며, `is_completed=false`인 항목에서는 `null`이다. 마이페이지는 이 값을 사용해 완료 기록을 read-only 카드로 표시하고 카드 탭으로 상세를 재열람할 수 있다.

---


### 12-9. 사용자 진도 조회 `user-progress 예정`

```
GET /users/me/progress
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "level": {
      "current_level": 3,
      "total_xp": 420,
      "current_level_start_xp": 300,
      "next_level_start_xp": 600,
      "xp_into_current_level": 120,
      "xp_to_next_level": 180,
      "progress_ratio": 0.4,
      "progress_percent": 40
    },
    "event_counts": {
      "cooking_completed": 8,
      "shopping_completed": 5,
      "recipe_saved_distinct_ever": 23,
      "custom_book_created": 2,
      "planner_registered_first": 1,
      "planner_registered_repeat": 7
    },
    "last_updated_at": "2026-06-10T12:34:56.000Z"
  },
  "error": null
}
```

**에러**

| 코드 | 조건 |
| --- | --- |
| 401 | 비로그인 |
| 500 | progress module 내부 실패 (33b에서 soft-fail) |

> `GET /users/me`는 프로필/설정-only 계약을 유지한다. progress 필드를 `/users/me`에 섞지 않는다.
> `featured_badges`, `active_quests`, `toast`, `tutorial`, `badge_inventory`, `timeline`은 33a response에 포함하지 않는다.
> `event_counts.recipe_saved_distinct_ever`는 ledger 기준 distinct-ever 카운트이며, 현재 membership 수나 `recipes.save_count`가 아니다.
> 34 시리즈에서 `planner_registered_*` count가 추가되더라도 progress response는 progress-only 계약을 유지한다. badge/quest/archive field는 포함하지 않는다.

**XP 배점 정책 `growth-leveling-v2`**

| source | first XP | repeat XP | repeat cap / idempotency |
| --- | ---: | ---: | --- |
| `recipe_saved` | 15 | 8 | user+recipe distinct-ever. unsave/resave 재적립 금지 |
| `custom_book_created` | 25 | 10 | KST 2/day repeat cap |
| `shopping_completed` | 40 | 25 | shopping list idempotency |
| `cooking_completed` | 60 | 45 | leftover_dish source row 기준 1회 |
| `planner_registered` | 25 | 5 | KST 3/day, 12/week repeat cap |

---

### 12-10. 사용자 성장/업적 앨범 조회 `growth-achievement-album`

```
GET /users/me/gamification
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "level": {
      "current_level": 6,
      "total_xp": 830,
      "xp_to_next_level": 170,
      "progress_percent": 82
    },
    "grade": {
      "grade_key": "steel",
      "label": "Steel",
      "level_min": 8,
      "level_max": 12,
      "icon_url": "/assets/growth/grades/steel-spoon-badge.png",
      "character_url": "/assets/growth/grades/steel-spoon.png"
    },
    "featured_badges": [
      {
        "badge_key": "first_cook_done",
        "label": "첫 요리 완성",
        "description": "첫 요리 완료를 기록했어요.",
        "category": "cooking",
        "shape_key": "pot",
        "locked_hint": null,
        "earned_at": "2026-06-10T12:00:00.000Z",
        "is_new": false
      }
    ],
    "badges": {
      "earned": [],
      "locked": []
    },
    "quests": {
      "active": [],
      "completed_recent": []
    },
    "tutorial": {
      "category_key": "tutorial",
      "completed_count": 2,
      "total_count": 7,
      "active_steps": [
        {
          "achievement_key": "tutorial_shopping_list_create",
          "title": "첫 장보기 목록 만들기",
          "current": 0,
          "target": 1,
          "status": "active"
        }
      ]
    },
    "achievement_album": {
      "summary": {
        "earned_count": 12,
        "total_count": 53,
        "completed_category_count": 1
      },
      "categories": [
        {
          "category_key": "tutorial",
          "label": "튜토리얼",
          "earned_count": 2,
          "total_count": 7,
          "milestones": [
            {
              "achievement_key": "tutorial_recipe_saved",
              "track_key": "tutorial",
              "title": "첫 레시피 저장",
              "description": "마음에 드는 레시피를 처음 저장했어요.",
              "current": 1,
              "target": 1,
              "status": "earned",
              "earned_at": "2026-06-10T12:00:00.000Z",
              "locked_hint": null,
              "badge": {
                "badge_key": "tutorial_recipe_saved",
                "shape_key": "bookmark",
                "category": "tutorial"
              }
            }
          ]
        }
      ]
    },
    "notifications": {
      "unseen": [],
      "priority_unseen": [],
      "archive_preview": []
    },
    "last_updated_at": "2026-06-10T12:00:00.000Z"
  },
  "error": null
}
```

**필드 규칙**

- `level`은 `user_progress_summary` 기준 서버 계산 결과이며 클라이언트가 계산하지 않는다.
- `grade`는 서버가 level band 기준으로 계산한다. 클라이언트는 label 또는 image URL을 계산하지 않는다.
- grade key 후보는 `clay`, `wood`, `steel`, `silver`, `gold`, `diamond`, `titanium`이다.
- `featured_badges`는 MYPAGE compact surface용 대표/최근 badge 목록이다.
- badge item은 `category`, `shape_key`, `locked_hint`를 가질 수 있다. `shape_key` 후보는 `plate`, `shield`, `ribbon`, `bookmark`, `pot`, `leaf`, `bowl`이다.
- `badges.earned` / `badges.locked`는 legacy badge guide 또는 확장 surface 호환 field다. MYPAGE 첫 viewport에 locked grid를 강제하지 않는다.
- `quests.active` / `quests.completed_recent`는 호환 field다. 35 시리즈 이후 standard quest expansion은 중단하고, 신규 안내는 `tutorial`과 `achievement_album.categories[].milestones`를 사용한다.
- `tutorial.active_steps`는 `achievement_album`의 `tutorial` category에서 파생되는 compact field다. dismiss는 UX 상태만 바꾼다.
- `achievement_album.categories`는 category tab/stamp grid 표시용 서버 projection이다. 클라이언트는 current/target/status를 계산하지 않는다.
- achievement status 후보는 `earned`, `active`, `locked`이다.
- 업적 달성은 XP를 추가 지급하지 않는다. XP는 `user_progress_events` 기반 progress API가 authority다.
- `notifications.unseen`은 XP toast 또는 achievement/badge new 상태 표시용이다.
- `notifications.priority_unseen`은 서버 우선순위 정렬 결과다. 우선순위는 `level_up > achievement_unlocked/badge_unlocked > xp_awarded`이다.
- 퀘스트 완료는 `quests`와 `achievement_album`의 tutorial projection으로 표시하며, 별도 `quest_completed` notification row는 만들지 않는다.
- `level_up` 알림은 level band가 바뀐 경우에만 등급명을 말한다. 같은 등급 안에서 레벨만 오른 경우 body는 `"레벨이 올랐어요."`처럼 등급명을 포함하지 않는다.
- 장기 업적 milestone은 튜토리얼의 첫 1회 달성 업적과 중복되지 않도록 `target=1`을 사용하지 않는다.
- `notifications.archive_preview`는 live non-silent notification 최신 5개 preview다. Historical/backfill recompute 결과는 포함하지 않는다.

**에러**

| 코드 | 조건 |
| --- | --- |
| 401 | 비로그인 |
| 500 | gamification projection/read 실패 (MYPAGE에서 gamification 영역만 soft-fail) |

> 이 endpoint는 badge/quest/tutorial/achievement/toast 전용 계약이다. `GET /users/me`와 `GET /users/me/progress` response shape를 변경하지 않는다.
> leaderboard, competitive rank, pressure streak, season reset, loot-box reward는 포함하지 않는다.
> `planner_registered`는 34 시리즈부터 XP source에 포함된다. 반복 플래너 XP는 KST 3/day, 12/week cap을 적용한다.

---

### 12-11. 사용자 성장 notification seen 처리 `33c-gamification`

```
POST /users/me/gamification/notifications/seen
```

🔒 로그인 필수

**요청**

```json
{
  "notification_ids": ["uuid-1", "uuid-2"]
}
```

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "seen_notification_ids": ["uuid-1", "uuid-2"]
  },
  "error": null
}
```

**정책**

- 인증 사용자 본인의 notification만 seen 처리한다.
- 이미 seen인 notification을 다시 보내도 성공한다.
- 타인 notification id는 처리하지 않으며 소유 여부를 노출하지 않는다.
- seen 처리 실패는 원래 XP source action 성공을 rollback하지 않는다.

**에러**

| 코드 | 조건 |
| --- | --- |
| 401 | 비로그인 |
| 422 | `notification_ids` 형식 오류 |
| 500 | 내부 실패 |

---

### 12-11b. 사용자 성장 알림 보관함 조회 `growth-achievement-album`

```
GET /users/me/gamification/archive?limit=20&cursor=created_at|id
```

🔒 로그인 필수

**Query**

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| limit | number | 선택 | 기본 20, 최대 50 |
| cursor | string | 선택 | 직전 응답의 `next_cursor`. 내부 형식은 `created_at|id` 기반 opaque 문자열 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "notification_type": "level_up",
        "priority": 1,
        "delivery_channel": "toast",
        "toast_eligible": true,
        "group_key": "progress-event:uuid",
        "title": "레벨 8 달성",
        "body": "Steel 등급이 되었어요.",
        "category": "cooking",
        "payload": {},
        "created_at": "2026-06-10T12:00:00.000Z",
        "seen_at": null
      }
    ],
    "next_cursor": null,
    "has_next": false
  },
  "error": null
}
```

**정책**

- archive는 v1에서 cutover 이후 live notification만 조회한다.
- `delivery_channel='toast'`와 `delivery_channel='archive_only'`인 live non-silent row를 포함한다.
- `delivery_channel='silent'`는 제외한다.
- `notification_type` 후보는 `level_up`, `achievement_unlocked`, `badge_unlocked`, `xp_awarded`이다.
- Historical/backfill recompute는 archive row를 만들지 않는다.
- 정렬은 `created_at DESC, id DESC`이다.
- `seen_at`은 사용자가 toast/card를 확인했다는 뜻이며 archive에서 제거된다는 뜻이 아니다.

**에러**

| 코드 | 조건 |
| --- | --- |
| 401 | 비로그인 |
| 422 | limit/cursor 형식 오류 |
| 500 | 내부 실패 |

---

### 12-12. 튜토리얼 퀘스트 숨김 처리 `33c-gamification`

```
POST /users/me/gamification/tutorial-quests/{quest_key}/dismiss
```

🔒 로그인 필수

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "quest_key": "first_shopping_done",
    "status": "dismissed"
  },
  "error": null
}
```

**정책**

- tutorial quest surface를 숨기는 UX 상태만 저장한다.
- XP, level, achievement award, badge award, source progress event는 변경하지 않는다.
- 이미 dismiss된 quest를 다시 호출해도 성공한다.
- 35 시리즈 이후 tutorial quest는 `achievement_album`의 `tutorial` category와 동기화된다. dismiss는 achievement earned 상태를 숨기거나 취소하지 않는다.

**에러**

| 코드 | 조건 |
| --- | --- |
| 401 | 비로그인 |
| 404 | 알 수 없는 tutorial quest key |
| 500 | 내부 실패 |

---
## 13. 설정 (SETTINGS)

> 화면: `SETTINGS`

### 13-1. 설정 업데이트

```
PATCH /users/me/settings
```

🔒 로그인 필수

| 구분 | 필드             | 타입     | 설명           |
| ---- | ---------------- | -------- | -------------- |
| Body | screen_wake_lock | boolean? | 화면 꺼짐 방지 |

### 13-2. 닉네임 변경

```
PATCH /users/me
```

🔒 로그인 필수

| 구분 | 필드     | 타입   | 설명               |
| ---- | -------- | ------ | ------------------ |
| Body | nickname | string | 새 닉네임 (2~30자) |

### 13-3. 회원 탈퇴

```
DELETE /users/me
```

🔒 로그인 필수

> 계정 삭제 확인 후 사용자 개인 데이터를 삭제한다. 직접/유튜브로 등록한 레시피는 삭제하지 않고, 작성자 정보 없이 남긴다.

**서버 동작**

1. 인증된 사용자 ID로 `delete_user_private_data(p_user_id)` RPC를 호출한다.
2. `recipe_books`, `meals`, `shopping_lists`, `pantry_items`, `cooking_sessions`, `leftover_dishes`, `recipe_likes` 등 사용자 소유 데이터는 삭제된다.
3. `recipes.created_by = p_user_id`인 레시피는 삭제하지 않는다. `created_by`는 `null`이 될 수 있다.
4. 삭제된 저장/좋아요 row가 반영되도록 `recipes.save_count`, `recipes.like_count`를 재계산한다.
5. 같은 소셜 계정으로 다시 로그인하면 새 사용자 bootstrap 상태로 시작한다.

**응답 (200)**

```json
{
  "deleted": true
}
```

**에러**

| Status | code | 설명 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 500 | INTERNAL_ERROR | DB cleanup 실패 |

---

## 14. 조리방법 마스터 (보조)

> `GET /cooking-methods` v1 shape는 유지한다. 조리방법 category는 기존 소비자를 깨지 않는 optional additive metadata로만 제공하며, `label`에 taxonomy 코드/분류 의미를 싣지 않는다.

### 14-1. 조리방법 목록 조회

```
GET /cooking-methods
```

🔓 비로그인

**응답 (200)**

```json
{
  "methods": [
    {
      "id": "uuid",
      "code": "stir_fry",
      "label": "볶기",
      "color_key": "orange",
      "is_system": true,
      "category_code": "pan_oil",
      "category_label": "팬/기름 조리",
      "synonyms": ["팬에 볶기"]
    },
    {
      "id": "uuid",
      "code": "boil",
      "label": "끓이기",
      "color_key": "red",
      "is_system": true,
      "category_code": "moist_heat",
      "category_label": "물/수분 조리",
      "synonyms": []
    },
    {
      "id": "uuid",
      "code": "auto_1710000000",
      "label": "절이기",
      "color_key": "unassigned",
      "is_system": false
    }
  ]
}
```

> `category_code`, `category_label`, `synonyms`는 v2 additive field다. 기존 `{ id, code, label, color_key, is_system }` 소비자는 그대로 동작해야 한다.
> `씻기`는 canonical method 목록에 포함하지 않는다. `에어프라이어`는 canonical method 목록에 포함한다.

---

# 15. Admin Foundation (내부 운영 관리) `v1.2.12 신규`

> 화면: `ADMIN_DASHBOARD` / `ADMIN_USERS` / `ADMIN_EVENTS` / `ADMIN_AUDIT_LOGS`
>
> Admin API는 내부 운영용 read-only surface다. 모든 endpoint는 OAuth 인증 후 `admin_members` 등록 여부를 서버에서 확인하고, cross-user/admin 조회에는 `createServiceRoleClient()`를 사용한다. service role이 없으면 fail closed 하며, `routeClient` fallback을 금지한다.
>
> 모든 Admin API read는 `admin_audit_logs`에 감사 로그를 남긴다. `request_path`는 pathname만 저장하고 query string은 저장하지 않는다. OAuth code/next/error, raw YouTube URL/source text, admin search term/email/nickname, private shopping/pantry detail은 `request_path` 또는 `metadata_json`에 저장하지 않는다.

## 15-1. 관리자 사용자 목록 조회

```http
GET /api/v1/admin/users
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Query**

| 필드 | 타입 | 설명 |
|------|------|------|
| q | string | 선택. 이메일/닉네임 검색어. 감사 로그에는 저장하지 않음 |
| page | number | 선택. 기본 1 |
| limit | number | 선택. 기본 20, 최대 100 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "email_masked": "us***@example.com",
        "social_provider": "google",
        "nickname": "집밥러",
        "created_at": "2026-05-27T00:00:00Z",
        "counts": {
          "recipe_books": 2,
          "meals": 8,
          "shopping_lists": 3,
          "pantry_items": 12
        },
        "status": "active"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  },
  "error": null
}
```

**감사 로그**

- action: `list_users`
- target_type: `user_search`
- target_id: `null`
- 검색어, 이메일, 닉네임은 감사 로그에 저장하지 않는다.

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |

---

## 15-2. 운영 이벤트 목록 조회

```http
GET /api/v1/admin/operational-events
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Query**

| 필드 | 타입 | 설명 |
|------|------|------|
| event_type | string | 선택 |
| severity | string | 선택: info/warn/error/critical |
| source | string | 선택: auth/youtube/admin/api 등 |
| page | number | 선택. 기본 1 |
| limit | number | 선택. 기본 20, 최대 100 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "event_type": "youtube_provider_failure",
        "severity": "error",
        "source": "youtube",
        "actor_user_id": "uuid",
        "target_user_id": null,
        "request_path": "/api/v1/recipes/youtube/extract",
        "http_status": 502,
        "error_code": "PROVIDER_ERROR",
        "message_summary": "YouTube provider request failed",
        "metadata_json": {},
        "created_at": "2026-05-27T00:00:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  },
  "error": null
}
```

**최소 event source**

- OAuth/auth callback failures
- YouTube validate/extract/register provider failures
- account delete success/failure
- Admin API service-role-missing failures
- selected route-handler unhandled server errors
- 404 page inline feedback (`event_type=not_found_feedback`, `source=web`)

**감사 로그**

- action: `list_operational_events`
- target_type: `operational_event_list`
- target_id: `null`

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |

---

## 15-2b. 404 피드백 기록

```http
POST /api/v1/feedback/404
```

🔓 공개. 404 페이지에서 사용자가 남긴 짧은 피드백을 운영 이벤트로 기록한다.

**Body**

| 필드 | 타입 | 설명 |
|------|------|------|
| message | string | 필수. 사용자가 작성한 피드백. 공백 제외 1~600자 |
| current_url | string | 선택. 클라이언트 현재 URL. 서버는 pathname만 저장 |
| referrer | string | 선택. 이전 URL. 서버는 pathname만 저장 |
| anonymous_id | string | 선택. 비로그인 사용자 구분용 `anon_*` 클라이언트 식별자 |
| occurred_at | string | 선택. 클라이언트 발생 시각 ISO 문자열. 잘못된 값은 서버 시각으로 대체 |

**서버 기록**

- 저장소: `operational_events`
- `event_type`: `not_found_feedback`
- `source`: `web`
- `severity`: `warn`
- `http_status`: `404`
- `error_code`: `ROUTE_NOT_FOUND`
- `request_path`: `current_url`의 pathname 또는 `/404`
- `actor_user_id`: 로그인 사용자는 user id, 비로그인은 `null`
- `metadata_json`: `feedback_text`, `current_path`, `referrer_path`, `is_authenticated`, `anonymous_id`, `user_agent_hash`, `occurred_at`

**개인정보 보호**

- UI는 개인정보 입력을 요청하지 않는다.
- 서버는 `message`에서 이메일, URL, 전화번호 패턴을 제거한 텍스트만 저장한다.
- `current_url`과 `referrer`는 query string을 저장하지 않는다.
- user agent는 raw string 대신 hash로 저장한다.

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "received": true
  },
  "error": null
}
```

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 400 | VALIDATION_ERROR | `message` 공백 또는 600자 초과 |
| 500 | NOT_FOUND_FEEDBACK_WRITE_FAILED | service role 누락 또는 운영 이벤트 저장 실패 |

---

## 15-3. 관리자 감사 로그 목록 조회

```http
GET /api/v1/admin/audit-logs
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Query**

| 필드 | 타입 | 설명 |
|------|------|------|
| action | string | 선택 |
| actor_admin_user_id | uuid | 선택 |
| target_type | string | 선택 |
| page | number | 선택. 기본 1 |
| limit | number | 선택. 기본 20, 최대 100 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "actor_admin_user_id": "uuid",
        "action": "list_users",
        "target_type": "user_search",
        "target_id": null,
        "request_path": "/api/v1/admin/users",
        "result": "success",
        "ip_hash": "sha256:...",
        "user_agent_hash": "sha256:...",
        "created_at": "2026-05-27T00:00:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  },
  "error": null
}
```

**감사 로그**

- action: `list_audit_logs`
- target_type: `audit_log_list`
- target_id: `null`

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |

---

## 15-4. 관리자 페이지 진입 감사 기록 `2026-06-16 launch-readiness 신규`

```http
POST /api/v1/admin/page-view
```

🔐 관리자 전용 (`admin_members` 등록 필요)

**Body**

| 필드 | 타입 | 설명 |
|------|------|------|
| path | string | 선택. `/admin`, `/admin/users`, `/admin/events`, `/admin/audit-logs` 중 하나. query string은 저장하지 않음 |

**응답 (200)**

```json
{
  "success": true,
  "data": {
    "verified": true
  },
  "error": null
}
```

**감사 로그**

- action: `admin_page_view`
- target_type: `admin_page`
- target_id: `null`
- 허용된 관리자 페이지 pathname만 저장한다. 허용되지 않은 path 또는 API path가 들어오면 `/admin`으로 대체한다.

**에러**

| HTTP | code | 설명 |
|------|------|------|
| 401 | UNAUTHORIZED | 로그인 필요 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 500 | ADMIN_SERVICE_ROLE_UNAVAILABLE | service role 누락. fail closed |
| 500 | ADMIN_AUDIT_WRITE_FAILED | 감사 로그 기록 실패. fail closed |

---

## 엔드포인트 전체 목록 (81개) `v1.2.25`

| #        | Method     | Path                                   | 화면                     | 인증   | v1.2 변경                        |
| -------- | ---------- | -------------------------------------- | ------------------------ | ------ | -------------------------------- |
| 0-4      | POST       | /auth/logout                           | -                        | 🔒     |                                  |
| 1-1      | GET        | /recipes                               | HOME                     | 🔓     |                                  |
| 1-2      | GET        | /recipes/themes                        | HOME                     | 🔓     |                                  |
| 1-2b     | GET        | /tags                                  | HOME                     | 🔓     | v1.2.20 신규                     |
| 1-3      | GET        | /ingredients                           | HOME (필터)              | 🔓     |                                  |
| 2-1      | GET        | /recipes/{id}                          | RECIPE_DETAIL            | 🔓     |                                  |
| 2-2      | POST       | /recipes/{id}/like                     | RECIPE_DETAIL            | 🔒     |                                  |
| 2-3      | POST       | /recipes/{id}/save                     | RECIPE_DETAIL            | 🔒     | book_type 제한 추가              |
| ~~2-4~~  | ~~DELETE~~ | ~~/recipes/{id}/save~~                 | -                        | -      | **삭제** → 12-7 사용             |
| 2-5      | POST       | /meals                                 | RECIPE_DETAIL / MENU_ADD | 🔒     |                                  |
| 3-1      | GET        | /planner                               | PLANNER_WEEK             | 🔒     |                                  |
| 3-2      | GET        | /planner/columns                       | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 3-3      | POST       | /planner/columns                       | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 3-4      | PATCH      | /planner/columns/{id}                  | SETTINGS                 | 🔒     | v1.2.3 신규, 2026-06-16 sort_order 허용 |
| 3-5      | DELETE     | /planner/columns/{id}                  | SETTINGS                 | 🔒     | v1.2.3 신규                      |
| 3-6      | GET        | /planner/nutrition                     | PLANNER_WEEK / MEAL_SCREEN | 🔒   | v1.2.22 신규                     |
| 4-1      | GET        | /meals                                 | MEAL_SCREEN              | 🔒     |                                  |
| 4-2      | PATCH      | /meals/{id}                            | MEAL_SCREEN              | 🔒     |                                  |
| 4-3      | DELETE     | /meals/{id}                            | MEAL_SCREEN              | 🔒     |                                  |
| 5-4      | GET        | /recipes/pantry-match                  | MENU_ADD                 | 🔒     |                                  |
| 5-5      | GET        | /food-products                         | FOOD_PRODUCT_PICKER      | 🔒     | v1.2.22 신규                     |
| 5-6      | POST       | /food-products                         | FOOD_PRODUCT_CREATE      | 🔒     | v1.2.22 신규                     |
| 5-7      | PATCH      | /food-products/{id}                    | FOOD_PRODUCT_CREATE      | 🔒     | v1.2.22 신규 versioned update   |
| 5-8      | DELETE     | /food-products/{id}                    | FOOD_PRODUCT_CREATE      | 🔒     | v1.2.22 신규 soft-delete        |
| 5-9      | POST       | /product-planner-entries               | FOOD_PRODUCT_PICKER      | 🔒     | v1.2.22 신규                     |
| 5-10     | PATCH      | /product-planner-entries/{id}          | MEAL_SCREEN              | 🔒     | v1.2.22 신규                     |
| 5-11     | DELETE     | /product-planner-entries/{id}          | MEAL_SCREEN              | 🔒     | v1.2.22 신규                     |
| 6-1      | POST       | /recipes/youtube/validate              | YT_IMPORT                | 🔒     |                                  |
| 6-2      | POST       | /recipes/youtube/extract               | YT_IMPORT                | 🔒     | v1.2.15 quantity fields          |
| 6-3      | POST       | /recipes/youtube/ingredient-registration | YT_IMPORT              | 🔒     | v1.2.7 신규                      |
| 6-3b     | POST       | /recipes/youtube/candidate-drafts      | YT_IMPORT                | 🔒     | 2026-05-30 addendum              |
| 6-4      | POST       | /recipes/youtube/register              | YT_IMPORT                | 🔒     | v1.2.15 quantity confirmation    |
| 6-5      | GET        | /recipes/youtube/recipio/check         | YT_IMPORT quick          | 🔒     | 2026-05-28 addendum              |
| 7-0      | POST       | /recipes/images                        | MANUAL_RECIPE_CREATE     | 🔒     | v1.2.14 신규                     |
| 7-0b     | POST       | /recipes/tag-suggestions               | MANUAL_RECIPE_CREATE     | 🔒     | v1.2.20 신규                     |
| 7-1      | POST       | /recipes                               | MANUAL_RECIPE_CREATE     | 🔒     | thumbnail_url 참조 + tags 검수    |
| 8-1      | GET        | /shopping/preview                      | SHOPPING_FLOW            | 🔒     |                                  |
| 8-2      | POST       | /shopping/lists                        | SHOPPING_FLOW            | 🔒     | sort_order, added_to_pantry 추가 |
| 8-3      | GET        | /shopping/lists/{id}                   | SHOPPING_DETAIL          | 🔒     | tie-breaker 명시                 |
| 8-4      | PATCH      | /shopping/lists/{id}/items/{id}        | SHOPPING_DETAIL          | 🔒     | 완료 후 409 추가                 |
| **8-4b** | **PATCH**  | **/shopping/lists/{id}/items/reorder** | **SHOPPING_DETAIL**      | **🔒** | **신규**                         |
| **8-4c** | **PATCH**  | **/shopping/lists/{id}/items/bulk**    | **SHOPPING_DETAIL**      | **🔒** | **launch-readiness 신규**        |
| 8-5      | POST       | /shopping/lists/{id}/complete          | SHOPPING_DETAIL          | 🔒     | 검증 규칙 + null/[] 구분         |
| 8-6      | GET        | /shopping/lists/{id}/share-text        | SHOPPING_DETAIL          | 🔒     | 제외 항목 미포함 명시            |
| 9-1      | POST       | /cooking/sessions                      | MEAL_SCREEN              | 🔒     | MEAL_SCREEN 단축 호출 추가 (v1.2.5) |
| 9-3      | GET        | /cooking/sessions/{id}/cook-mode       | COOK_MODE                | 🔒     |                                  |
| 9-3b     | GET        | /recipes/{id}/cook-mode                | COOK_MODE                | 🔓     |                                  |
| 9-4      | POST       | /cooking/sessions/{id}/complete        | COOK_MODE                | 🔒     |                                  |
| 9-5      | POST       | /cooking/sessions/{id}/cancel          | COOK_MODE                | 🔒     |                                  |
| 9-6      | POST       | /cooking/standalone-complete           | COOK_MODE                | 🔒     |                                  |
| 10-1     | GET        | /leftovers                             | LEFTOVERS / ATE_LIST     | 🔒     |                                  |
| 10-2     | POST       | /leftovers/{id}/eat                    | LEFTOVERS                | 🔒     |                                  |
| 10-3     | POST       | /leftovers/{id}/uneat                  | ATE_LIST                 | 🔒     |                                  |
| **10-4** | **POST**   | **/leftovers/{id}/keep**               | **LEFTOVERS**            | **🔒** | **stale review server-sync**     |
| 11-1     | GET        | /pantry                                | PANTRY                   | 🔒     |                                  |
| 11-2     | POST       | /pantry                                | PANTRY                   | 🔒     |                                  |
| 11-3     | DELETE     | /pantry                                | PANTRY                   | 🔒     |                                  |
| 11-4     | GET        | /pantry/bundles                        | PANTRY_BUNDLE_PICKER     | 🔒     |                                  |
| 12-1     | GET        | /users/me                              | MYPAGE                   | 🔒     |                                  |
| 12-2     | GET        | /recipe-books                          | MYPAGE                   | 🔒     | id uuid 통일                     |
| 12-3     | POST       | /recipe-books                          | MYPAGE                   | 🔒     |                                  |
| 12-4     | PATCH      | /recipe-books/{id}                     | MYPAGE                   | 🔒     |                                  |
| 12-5     | DELETE     | /recipe-books/{id}                     | MYPAGE                   | 🔒     |                                  |
| 12-6     | GET        | /recipe-books/{id}/recipes             | RECIPEBOOK_DETAIL        | 🔒     |                                  |
| 12-6b    | GET        | /recipe-books/{book_id}/recipes/{recipe_id} | RECIPEBOOK_DETAIL        | 🔒     | 리더용 read-only 상세, 조회수 증가 없음 |
| 12-7     | DELETE     | /recipe-books/{id}/recipes/{id}        | RECIPEBOOK_DETAIL        | 🔒     | 카운트 갱신 명시                 |
| 12-8     | GET        | /shopping/lists                        | MYPAGE (장보기 기록)     | 🔒     |                                  |
| 12-9     | GET        | /users/me/progress                     | MYPAGE                   | 🔒     | v1.2.17 user-progress 예정        |
| 12-10    | GET        | /users/me/gamification                 | MYPAGE                   | 🔒     | 35a achievement album additive   |
| 12-11    | POST       | /users/me/gamification/notifications/seen | MYPAGE / shell        | 🔒     | 33c notification seen            |
| 12-11b   | GET        | /users/me/gamification/archive         | MYPAGE / 성장 보관함     | 🔒     | growth-achievement-album         |
| 12-12    | POST       | /users/me/gamification/tutorial-quests/{quest_key}/dismiss | MYPAGE | 🔒     | tutorial dismiss 호환            |
| 13-1     | PATCH      | /users/me/settings                     | SETTINGS                 | 🔒     |                                  |
| 13-2     | PATCH      | /users/me                              | SETTINGS                 | 🔒     |                                  |
| 13-3     | DELETE     | /users/me                              | SETTINGS                 | 🔒     |                                  |
| 14-1     | GET        | /cooking-methods                       | 전역 (드롭다운)          | 🔓     |                                  |
| 15-1     | GET        | /api/v1/admin/users                    | ADMIN_USERS              | 🔐     | v1.2.12 신규                     |
| 15-2     | GET        | /api/v1/admin/operational-events       | ADMIN_EVENTS             | 🔐     | v1.2.12 신규                     |
| **15-2b** | **POST**   | **/api/v1/feedback/404**               | **NOT_FOUND**            | **🔓** | **404 feedback addendum**        |
| 15-3     | GET        | /api/v1/admin/audit-logs               | ADMIN_AUDIT_LOGS         | 🔐     | v1.2.12 신규                     |
| **15-4** | **POST**   | **/api/v1/admin/page-view**            | **ADMIN_DASHBOARD**      | **🔐** | **launch-readiness 신규**        |

> **v1.2.25 총계**: 81개 (신규 endpoint 0개. Recipe Detail nutrition에 nullable `availability_reason` 1개 additive field. active 80개 + 삭제된 `2-4` tombstone 1개)
> **v1.2.24 총계**: 81개 (신규 endpoint 0개. active 80개 + 삭제된 `2-4` tombstone 1개. 기존 8개 영양/완제품 endpoint와 recipe-only `meals/items` + additive `product_entries` 호환 유지)
> **v1.2.22 총계**: 81개 (`GET /planner/nutrition` 1개 + 완제품 catalog/entry 7개 추가. active 80개 + 삭제된 `2-4` tombstone 1개. 기존 recipe/planner/meals endpoint는 additive 확장)
> **v1.2.21 총계**: 73개 (서비스 브랜드 copy contract-evolution, 신규 endpoint 없음)
> **2026-06-20 LEFTOVERS stale review server-sync addendum 총계**: 73개 (`POST /leftovers/{id}/keep` 1개 추가)
> **2026-06-20 404 feedback addendum 총계**: 72개 (`POST /api/v1/feedback/404` 1개 추가. 신규 DB table 없음)
> **v1.2.20 총계**: 71개 (`GET /tags`, `POST /recipes/tag-suggestions` 2개 추가. recipe 목록/YouTube/manual register는 기존 endpoint 확장)
> **v1.2.19 총계**: 69개 (launch-readiness addendum: shopping items bulk update, admin page-view audit endpoint 2개 추가)
> **v1.2.18 총계**: 67개 (growth-leveling-v2 archive endpoint 1개 추가, gamification response additive 확장)
> **v1.2.17 총계**: 66개 (user-progress `GET /users/me/progress` 1개 + 33c gamification endpoint 3개 추가)
> **v1.2.16 총계**: 62개 (2026-06-10 addendum: 레시피북 리더용 read-only 상세 endpoint 1개 추가)
> **v1.2.15 총계**: 61개 (YouTube visual quantity enrichment contract, 신규 endpoint 없음)
> **v1.2.14 총계**: 61개 (`POST /recipes/images` 이미지 업로드 endpoint 1개 추가, thumbnail_url/tags field 계약 보강)
> **v1.2.13 총계**: 60개 (2026-05-30 다중 후보 초안 endpoint 1개 추가)
> **v1.2.12 총계**: 58개 (Admin Foundation read-only endpoint 3개 추가)
> **v1.2.11 총계**: 55개 (slice27 taxonomy contract lock, 신규 endpoint 없음)
> **v1.2.10 총계**: 55개 (`DELETE /users/me` 회원 탈퇴 데이터 정리 정책 변경, 신규 endpoint 없음)
> **v1.2.9 총계**: 55개 (`POST /auth/login`, `PATCH /auth/profile` 제거. `PATCH /auth/profile` 대체는 `PATCH /users/me`)
> **v1.2.5 총계**: 51개 (신규 엔드포인트 없음, 기존 9-2 호출자 확장)
> **v1.2.5 변경**: `MEAL_SCREEN`에서 `shopping_done` 개별 식사의 `[요리하기]` 단축 경로를 `POST /cooking/sessions`(9-2)로 공식화. 서버 검증·DB 계약 변경 없음
> **v1.2.3 총계**: 51개 (`/planner/columns` 조회/추가/이름변경/삭제 4개 추가)
> **v1.2.3 변경**: `PLANNER_WEEK` 끼니 컬럼을 기본 3개 + 사용자 설정 관리로 정리하고 planner column 관리 API를 재도입
> **DB 연쇄 수정 필요**: shopping_list_items에 `sort_order` 컬럼 추가 (DB v1.3에서 반영)
