# Slice: community-prepared-food-catalog

## Goal

새로 등록하는 manual 완제품을 로그인 사용자들이 함께 검색·플래너 추가할 수 있는 `public/manual` catalog로 전환한다. 등록자만 visible 제품을 수정·soft-delete하고, 다른 사용자는 읽기·추가·신고만 하며, hidden/deleted 뒤에도 기존 planner entry와 immutable nutrition version pin은 보존한다. 기존 `private/manual` 제품은 자동 공개하지 않는다.

## Branches

- 문서: `docs/community-prepared-food-catalog`
- 백엔드: `feature/be-community-prepared-food-catalog`
- 프론트엔드: `feature/fe-community-prepared-food-catalog`

## In Scope

- 화면: `FOOD_PRODUCT_PICKER`, `FOOD_PRODUCT_CREATE`, `PLANNER_WEEK`의 완제품 추가 흐름, `SETTINGS` 회원탈퇴 안내
- API:
  - `GET /food-products?source=all|public_dataset|manual`
  - `POST /food-products`
  - `PATCH /food-products/{id}`
  - `DELETE /food-products/{id}`
  - `POST /food-products/{product_id}/report`
  - 기존 `POST /product-planner-entries`의 hidden/deleted admission guard
  - 기존 `DELETE /users/me`의 shared manual owner 익명화 보존
- 상태/권한:
  - 신규 manual은 server-controlled `public/manual/visible`, owner는 `auth.uid()`
  - owner-only visible product edit/soft-delete
  - 다른 사용자·익명화 shared manual은 read-only + report 가능
  - hidden shared manual은 owner도 `409 PRODUCT_MODERATION_LOCKED`
  - public dataset, legacy private, hidden/deleted, self product report 차단
- DB 영향:
  - `food_products.moderation_status`
  - 신규 `food_product_reports`
  - `food_product_nutrition_versions.label_basis_text` 사용
  - 기존 `delete_user_private_data`의 shared manual owner 익명화 보강
  - catalog/create/update/delete/report RPC, RLS, privilege, indexes의 additive 교체
- Schema Change:
  - [ ] 없음
  - [x] 있음 → additive migration 필요

## Out of Scope

- legacy private 제품의 자동 공개, 공개 전환 toggle 또는 이름 기반 자동 복제
- 일반 사용자용 moderation 상태 변경·숨김 해제·운영 admin HTTP endpoint
- runtime 외부 공공 API 검색, provider row 직접 노출, 신규 public importer
- barcode/OCR, 외식, 밀키트, 실제 섭취, 의료 코칭
- name+brand fuzzy merge 또는 public stable key를 manual 제품에 부여하는 동작
- `serving/package` manual 신규 입력, manual `basis_relations` 입력·승인, 임의 `g↔ml` 추정
- 모든 기존 product를 100g/100mL 비교로 통일하는 전체 UX. 이는 후속 `prepared-food-standard-basis-ux`가 소유한다.
- 공식 문서 밖 endpoint, field, status, error code

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `prepared-food-catalog` | merged | [x] |
| `public-prepared-food-catalog-import` | merged — local public catalog 287,041 rows | [x] |
| official v1.7.21/v1.5.27/v1.3.24/v1.3.22/v1.2.26 contract | merged | [x] |
| 독립 Codex Stage 1.5 docs/design gate | merged | [x] |

> 사용자 승인 Codex-only 예외에 따라 Stage 1 author, internal 1.5 reviewer/repair-final, Stage 2 implementer, Stage 3 reviewer, Stage 4 implementer, authority/Stage 5/6 reviewer는 역할을 분리한다.

## Backend First Contract

### Search

- 로그인 필수이며 기존 `{ success, data, error }` wrapper와 `{ code, message, fields[] }` error shape를 유지한다.
- `source`는 정확히 `all | public_dataset | manual`; 생략 기본은 `all`이다.
- 결과는 active `moderation_status='visible'` public rows와 현재 사용자의 active legacy private rows뿐이다.
- ordering은 public dataset → shared manual public → self legacy private이며 각 partition의 cursor order는 결정적이다.
- `source=manual`은 visible shared manual public + self legacy private만 반환한다.
- 다른 사용자 private, hidden, deleted는 검색과 신규 planner add에서 제외한다.
- response는 owner ID, moderation status, external stable key를 추가 노출하지 않는다. action은 공식 `visibility`, `source_type`, `editable`로 파생한다.

### Create / Update / Delete

- `POST /food-products`는 `visibility='public'`, `source_type='manual'`, `moderation_status='visible'`, `owner_user_id=auth.uid()`를 server가 정한다.
- client가 `visibility`, `source_type`, `owner_user_id`, `moderation_status`, `external_product_key`, `basis_relations`를 보내면 무시하지 않고 기존 `422 UNSUPPORTED_FIELD`로 거절한다.
- 신규 shared manual의 `nutrition.basis.amount > 0`, unit은 `g|ml`; `label_basis_text`는 optional이다.
- `energy_kcal`은 필수 finite `>=0`; 나머지 공식 nutrient는 null/missing 가능하며 결측을 0으로 쓰지 않는다.
- create/PATCH의 manual nutrition version은 `basis_relations=[]`; nutrition 변경은 immutable version append + atomic current switch, metadata-only 변경은 version 유지다.
- visible owner manual만 PATCH/DELETE 가능하다. public dataset, 다른 사용자, owner-null anonymized manual은 `403 FORBIDDEN`이다.
- hidden owner manual은 PATCH/DELETE 모두 `409 PRODUCT_MODERATION_LOCKED`; DELETE는 visible owner row에서 멱등 soft-delete다.
- 기존 planner entry의 이름·영양 pin은 update/delete/hide 뒤에도 변경하지 않는다.

### Account Deletion

- `DELETE /users/me`는 개인 기록을 기존 계약대로 삭제하되 탈퇴 전에 공유된 `public/manual` 제품은 hard-delete하지 않는다.
- shared manual의 `owner_user_id`를 null로 익명화하고 read-only public row, nutrition versions, 기존 planner pin을 보존한다.
- legacy private 제품은 공동 catalog로 승격하지 않으며 기존 개인 데이터 삭제 정책을 따른다.
- 익명화와 개인 데이터 삭제는 한 transaction으로 fail-closed해 partial deletion을 남기지 않는다.

### Report

- 신규 endpoint는 `POST /food-products/{product_id}/report` 하나다.
- body는 필수 `reason_code`와 optional `detail_text`만 받는다.
- reason은 정확히 `spam | incorrect_nutrition | duplicate | rights | unsafe | other`다.
- visible `public/manual`만 대상이다. self는 `403 FORBIDDEN`, same reporter duplicate는 `409 PRODUCT_ALREADY_REPORTED`, public dataset/private/hidden/deleted는 `409 PRODUCT_REPORT_NOT_ALLOWED`다.
- report는 append-only다. 일반 사용자는 `report_status`나 product moderation을 직접 바꾸지 못한다.

### Planner Admission

- picker race에서 hidden product는 기존 `409 PRODUCT_HIDDEN`, deleted product는 `409 PRODUCT_DELETED`로 신규 entry를 막는다.
- 이미 존재하는 entry와 pin은 보존하며 Recipe Meal/status/shopping/cooking/leftover/XP에 product를 섞지 않는다.

## Frontend Delivery Mode

- `FOOD_PRODUCT_PICKER`는 `전체 / 공공 영양DB / 사용자 등록` filter와 `공공 영양DB / 사용자 등록 / 비공개 보관` badge를 제공한다.
- owner visible manual만 수정·삭제, other-user/anonymized visible manual만 신고, public/legacy private/self/hidden/deleted에는 신고를 노출하지 않는다.
- 신규 form은 양수 g/mL basis, optional 원 라벨 text, 결측≠0을 지킨다. create prefill 값은 공식 계약으로 고정하지 않는다.
- picker/planner의 g/mL 수량은 공식 기본 100, 1g/1mL step을 지킨다.
- relation 없는 legacy serving/package 제품은 100g/100mL를 추정하지 않고 원 basis와 비교 불가를 표시한다.
- 필수 상태: loading / empty / error / read-only / unauthorized / conflict / moderation race.
- 로그인 gate 후 query/source/date/column/selection/draft return-to-action을 복원한다.
- `SETTINGS` 탈퇴 확인은 shared manual 제품이 등록자 정보 없이 read-only public으로 남아 기존 식단을 보호한다는 안내를 표시한다.

## Design Authority

- UI risk: `anchor-extension` / `high-risk`
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact: Stage 4 `ui/designs/evidence/community-prepared-food-catalog/<date>/{390,320,1280}/`
- Authority status: `required`
- Generator: `ui/designs/FOOD_PRODUCT_PICKER.md`, `ui/designs/FOOD_PRODUCT_CREATE.md`, `ui/designs/SETTINGS.md` additive addendum
- Critic: `ui/designs/critiques/FOOD_PRODUCT_PICKER-critique.md`, `ui/designs/critiques/FOOD_PRODUCT_CREATE-critique.md`, `ui/designs/critiques/SETTINGS-critique.md`
- Notes: predecessor authority는 historical evidence일 뿐 이번 공동 catalog 확장을 승인하지 않는다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — `ui/designs/authority/PLANNER_WEEK-community-prepared-food-catalog-authority.md`, blocker 0
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.21.md`
- `docs/화면정의서-v1.5.27.md`
- `docs/유저flow맵-v1.3.24.md`
- `docs/db설계-v1.3.22.md`
- `docs/api문서-v1.2.26.md`
- `docs/workpacks/prepared-food-catalog/README.md`
- `docs/workpacks/public-prepared-food-catalog-import/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

### TDD order

1. source filter, search partition/order, public/manual/private visibility를 RED로 고정한다.
2. public manual create와 client authority field rejection을 RED로 고정한다.
3. owner/non-owner/anonymized/hidden PATCH·DELETE guards와 immutable version을 RED로 고정한다.
4. report six reasons, eligibility, self, duplicate, append-only와 RLS를 RED로 고정한다.
5. hidden/deleted planner admission과 old pin preservation을 RED로 고정한다.
6. 최소 구현 후 Vitest → isolated PostgreSQL → fresh local Supabase/PostgREST/auth smoke 순으로 GREEN을 만든다.

### Fixtures

- user A/B, visible public dataset, A/B shared manual, owner-null anonymized manual, A legacy private, B private, A account deletion transaction
- hidden_by_report/hidden_by_operator/deleted shared manual과 이미 pin된 product planner entry
- g/ml valid body, optional null/missing nutrient, observed zero, serving/package/authority-field invalid body
- six report reasons, duplicate reporter/product, self/public/private/hidden/deleted report

### Real DB / browser

- 기존 사용자 DB/volume을 삭제하지 않는 fresh local Supabase 또는 isolated DB를 사용한다.
- migration/RLS/privilege/RPC를 실제 auth A/B와 PostgREST로 확인한다.
- Stage 4는 390/320/1280에서 search/filter/create/edit/delete/report/add, loading/empty/error/auth/moderation race를 확인한다.
- production/staging/provider write는 별도 승인 전 0이며 Manual Only다.

### Blockers

- predecessor/schema/seed/local auth bootstrap 불일치
- legacy private 자동 공개 또는 cross-owner read/write 가능
- hidden/deleted 신규 검색·추가 또는 old pin 훼손
- report/operator 권한이 일반 사용자에게 열림
- secret/raw provider row/private path 노출
- authority evidence 또는 independent review 누락

## Key Rules

- 신규 manual만 public이며 legacy private는 자동 공개하지 않는다.
- owner/source/visibility/moderation/public stable key는 server authority다.
- shared manual은 owner-only visible edit/delete; hidden은 owner도 locked다.
- report는 shared visible manual만 append-only로 허용한다.
- missing/null은 zero가 아니며 manual basis relation을 만들지 않는다.
- hidden/deleted는 새 search/add에서 제외하고 기존 immutable pin은 보존한다.
- 회원탈퇴는 shared manual owner를 익명화하고 read-only public row와 기존 pin을 보존한다.
- runtime provider call과 production/staging write는 없다.
- 전체 100g/100mL normalization은 successor가 소유하며 이 slice는 안전한 g/ml 기본 100/step1과 추정 금지를 보호한다.

## Primary User Path

1. 로그인 사용자가 플래너에서 완제품 picker를 열고 source를 선택해 검색한다.
2. 공공 또는 다른 사용자의 제품을 읽기 전용으로 선택하거나, 결과가 없으면 shared manual 제품을 등록한다.
3. 본인 visible 제품은 수정/삭제할 수 있고 다른 사용자의 shared manual은 신고할 수 있다.
4. 수량을 확인하고 product entry를 추가하면 Meal 상태 없이 기존 플래너로 돌아간다.

## Delivery Checklist

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] Vitest / PostgreSQL / Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] loading / empty / error / read-only 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
