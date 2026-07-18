# Slice: nutrition-products-cross-slice-release-qa

> Verification-only final release QA slice for the nutrition/products/planner successor chain.
> **No runtime app/API/DB contract changes are allowed in this slice.**
> If Stage 2/4 finds a blocker, the fix must land in a separate TDD repair PR and this release QA must rerun on that repaired exact head.

## Goal

모든 nutrition/products/planner successor가 이미 병합된 기준 master `58a3f805864af9627616c50c117eb3c7f94f72a2` ancestry에서 실제 local DB, real Chrome, current-head checks를 다시 묶어 최종 출고 신호를 만든다. 이 슬라이스는 재료 845개 전수 coverage, recipe nutrition snapshot/Meal pin, 287,041개 public product catalog, shared manual 권한과 account anonymization, product planner isolation, 100g/100mL UX, 보안/성능/authority evidence를 한 번에 교차 검증하고 Manual Only 잔여 위험만 명시적으로 남긴다.

## Branches

- 문서: `docs/nutrition-products-cross-slice-release-qa`
- Stage 2/3 verification lane: `feature/be-nutrition-products-cross-slice-release-qa`
- Stage 4 verification lane: `feature/fe-nutrition-products-cross-slice-release-qa`

## In Scope

- 화면:
  - 기존 `RECIPE_DETAIL` nutrition state의 ready(complete) / partial / unavailable / temporarily unavailable 검증
  - 기존 `FOOD_PRODUCT_PICKER`, `FOOD_PRODUCT_CREATE`, `PLANNER_WEEK`, `MEAL_SCREEN`의 source tag, basis, quantity, planned nutrition, workflow isolation 검증
  - 기존 `SETTINGS_ACCOUNT_DELETE_CONFIRM`에서 account deletion confirm, anonymization 이후 read-only pin 보존 검증
  - shared manual create/search/edit/delete/report와 account anonymization 이후 read-only pin 보존의 real browser 검증
- API:
  - 새 endpoint 없음
  - 기존 `GET /recipes/{id}`
  - 기존 `GET /food-products`
  - 기존 `POST /food-products`
  - 기존 `PATCH /food-products/{product_id}`
  - 기존 `DELETE /food-products/{product_id}`
  - 기존 `POST /food-products/{product_id}/report`
  - 기존 `POST /product-planner-entries`
  - 기존 `PATCH /product-planner-entries/{entry_id}`
  - 기존 `DELETE /product-planner-entries/{entry_id}`
  - 기존 `DELETE /users/me`
  - 기존 `GET /planner`
  - 기존 `GET /planner/nutrition`
  - 기존 `GET /meals`
  - 기존 `POST /meals`
- 상태 전이:
  - ingredient coverage 결과 `approved exactly once` 또는 `strict excluded` exactly-one 분류 검증
  - recipe snapshot current switch / replay / rollback / historical Meal pin 불변 검증
  - shared manual owner 권한, moderation/report lock, account deletion anonymization, 기존 pin 보존 검증
  - ProductPlannerEntry add/edit/delete와 Recipe Meal / shopping / cooking / leftover / XP 분리 검증
- DB 영향:
  - 읽기/검증만 수행: `ingredients`, `nutrition_sources`, `nutrition_profiles`, `ingredient_nutrition_profiles`, `recipe_nutrition_snapshots`, `meals`, `food_products`, `food_product_nutrition_versions`, `food_product_reports`, `product_planner_entries`, `meal_plan_columns`
  - fresh local Supabase migrations, RLS, PostgREST, current table digest, zero external write 검증
- Schema Change:
  - [x] 없음 (verification-only / docs + evidence)
  - [ ] 있음

## Out of Scope

- runtime app code, route handler, migration, seed, official contract 문서 변경
- 이 slice 안에서의 직접 repair commit, hotfix, schema patch, UI tweak
- 새 endpoint / field / status / error / table / column / public contract 추가
- production / staging / provider write
- physical device, 실제 screen reader, true production-scale 부하 측정
- Discord 알림, Amphetamine 제어, merge 후 closeout automation

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `ingredient-nutrition-full-coverage` | merged — PR #1038 merge `3c737eae` | [x] |
| `all-recipe-nutrition-recalculation` | merged — PR #1040 merge `a001f53d` | [x] |
| `public-prepared-food-catalog-import` | merged — PR #1035 merge `903e7082` | [x] |
| `community-prepared-food-catalog` | merged — PR #1046 merge `5c88cdae` | [x] |
| `prepared-food-standard-basis-ux` | merged — PR #1049 merge `1976ecc3` | [x] |
| official `v1.7.21 / v1.5.27 / v1.3.24 / v1.3.22 / v1.2.26` | merged | [x] |

> 사용자 승인 Codex-only 예외에 따라 Stage 1 docs owner, internal 1.5 review/repair-final, Stage 2/3 verification, Stage 4 browser/authority evidence, independent security/performance/code review, Stage 5 authority, Stage 6 final review를 모두 fresh 역할로 분리한다. 작성자와 verifier는 자기 작업을 최종 승인하지 않는다.

## Stage Contract

### Stage 1 / 1.5

- 이 README, acceptance, automation-spec, workflow-v2 work item/status를 먼저 잠근다.
- independent docs reviewer는 이 slice가 verification-only인지, predecessor 수치와 경계를 새 계약 없이 재사용하는지, inline repair를 허용하지 않는지 확인한다.

### Stage 2 / 3 — Real DB / Security / Performance Verification

1. fresh local Supabase full migrations와 seed/bootstrap을 올리고 RLS, PostgREST, auth, table digest를 확인한다.
2. ingredient coverage `845 = approved exactly once 838 + strict excluded 7`, replay `0` write, secret/raw/private-path leak `0`를 다시 검증한다.
3. all-recipe lifecycle `34 = ready(complete) 8 + partial 23 + unavailable 3`, missing!=0, rollback `34`, Meal pin 불변을 다시 검증한다.
4. local public product `287,041` rows, source filter/tag, shared manual / legacy private 경계, account anonymization pin 보존, query/route latency와 item-level N+1 부재를 확인한다.
5. 독립 security / performance / code reviewer는 exact verification head를 읽고 blocker `0`이어야 한다.

### Stage 4 — Real Chrome / Responsive / Authority Verification

1. fixture browser가 아니라 real local Supabase + real Chrome으로 auth A/B, `FOOD_PRODUCT_CREATE` create/search/edit/delete/report, `SETTINGS_ACCOUNT_DELETE_CONFIRM` account deletion anonymization, planner add/edit/delete, `RECIPE_DETAIL`, `PLANNER_WEEK`, `MEAL_SCREEN`을 다시 검증한다.
2. 320 / 390 / desktop 1280 evidence를 current head 기준으로 수집한다.
3. `RECIPE_DETAIL`은 snapshot이 있는 recipe를 모두 `정보 준비 중`으로 뭉개지 않고 ready/partial/unavailable/temporary를 구분해야 한다.
4. `PLANNER_WEEK` / `MEAL_SCREEN` / `FOOD_PRODUCT_PICKER` / `FOOD_PRODUCT_CREATE` / `RECIPE_DETAIL` / `SETTINGS_ACCOUNT_DELETE_CONFIRM` evidence를 current head 기준으로 다시 남긴다.

### Stage 5 / Authority / Stage 6

- independent authority reviewer는 exact verification head evidence를 검토해 blocker `0`이어야 한다.
- independent Stage 6 reviewer는 acceptance, review reports, current-head started checks를 읽고 pending/fail `0`, intentional skip은 정책 근거가 있어야 한다.
- defect가 발견되면 이 slice에서 봉합하지 않고 separate TDD repair PR로 되돌린 뒤 exact repaired head에서 Stage 2/4를 전부 재실행한다.

## Backend First Contract

- verification-only slice이므로 request/response/schema를 새로 만들지 않는다.
- 기존 모든 JSON endpoint는 `{ success, data, error }`, error `{ code, message, fields[] }`를 유지해야 한다.
- Stage 2는 아래 merged contract만 재검증한다.
  - ingredient coverage: local inventory `845 = 838 + 7`, `unclassified=0`, replay `0` write
  - recipe nutrition: `34 = 8 + 23 + 3`, missing!=0, historical Meal pin unchanged, `availability_reason` semantics 유지
  - product catalog/planner: local public products `287,041`, shared manual public + legacy private manual + owner/moderation/anonymization 경계 유지
  - basis contract: solid `100g`, liquid `100mL`, `label_basis_text` 보존, direct relation only, no inference
  - workflow isolation: ProductPlannerEntry는 Recipe Meal status / shopping / cooking / leftover / XP와 구조적으로 분리
- runtime public/provider fetch, secret/auth query/cookie/raw row/private path 노출, production/staging/provider write는 모두 금지다.

## Frontend Delivery Mode

- 이 slice는 UI를 새로 구현하지 않는다. current merged UI를 exact head 기준으로 검증만 한다.
- Stage 4 필수 상태:
  - `loading`: nutrition / planner / product search loading이 기존 핵심 CTA를 가리지 않음
  - `empty`: planner/product search empty와 unavailable nutrition을 구분함
  - `error`: soft error가 해당 영역에만 머무르고 retry/context를 보존함
  - `read-only`: shared manual anonymized row와 hidden/locked row 경계가 보존됨
  - `unauthorized`: 로그인 후 return-to-action으로 검색어/날짜/끼니/선택 context가 돌아옴
  - `partial` / `unavailable` / `temporarily_unavailable`: missing을 0으로 보이지 않고 상태를 합치지 않음
- `FOOD_PRODUCT_PICKER`, `FOOD_PRODUCT_CREATE`, `PLANNER_WEEK`, `MEAL_SCREEN`, `RECIPE_DETAIL`, `SETTINGS_ACCOUNT_DELETE_CONFIRM`은 existing copy/layout을 바꾸지 않고 evidence만 다시 남긴다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: `RECIPE_DETAIL`, `PLANNER_WEEK`
- Visual artifact:
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-390.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-320.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-desktop-1280.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-390.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-320.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-desktop-1280.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_CREATE-390.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_CREATE-320.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_CREATE-desktop-1280.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/PLANNER_WEEK-390.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/PLANNER_WEEK-320.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/PLANNER_WEEK-desktop-1280.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-390.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-320.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-desktop-1280.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/SETTINGS_ACCOUNT_DELETE_CONFIRM-390.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/SETTINGS_ACCOUNT_DELETE_CONFIRM-320.png`
  - `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/SETTINGS_ACCOUNT_DELETE_CONFIRM-desktop-1280.png`
- Authority report: `ui/designs/authority/PLANNER_WEEK-nutrition-products-cross-slice-release-qa-authority.md`
- Authority status: `required`
- Notes:
  - verification-only지만 최종 출고 gate라서 fresh authority evidence를 생략하지 않는다.
  - 신규 design-generator / design-critic 산출물은 만들지 않는다. 기존 merged screen contract를 current head screenshot으로만 재검증한다.

## Design Status

- [x] 임시 UI (temporary) — verification-only current-head evidence와 authority가 아직 pending
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed) — Stage 5 authority + Stage 6 final review + current-head checks green 후에만 가능
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.21.md`
- `docs/화면정의서-v1.5.27.md`
- `docs/유저flow맵-v1.3.24.md`
- `docs/db설계-v1.3.22.md`
- `docs/api문서-v1.2.26.md`
- `docs/workpacks/ingredient-nutrition-full-coverage/README.md`
- `docs/workpacks/all-recipe-nutrition-recalculation/README.md`
- `docs/workpacks/public-prepared-food-catalog-import/README.md`
- `docs/workpacks/community-prepared-food-catalog/README.md`
- `docs/workpacks/prepared-food-standard-basis-ux/README.md`
- `docs/workpacks/recipe-nutrition-calculation/README.md`
- `docs/workpacks/prepared-food-planner-entry/README.md`
- `docs/workpacks/planner-nutrition-summary/README.md`

## QA / Test Data Plan

- local reset / bootstrap:
  - `pnpm local:reset:demo`
  - `pnpm dev:local-supabase`
- fixture browser는 분리 근거로만 유지하고, release QA pass 근거로 사용하지 않는다.
- Stage 2 blocker:
  - fresh migrations / RLS / PostgREST / auth bootstrap 불가
  - ingredient `845` / recipe `34` / product `287,041` 기준 drift
  - replay write non-zero, Meal pin drift, secret/raw/private-path leak, runtime provider fetch, production/staging/provider write
- Stage 4 blocker:
  - auth A/B, shared manual create/search/edit/delete/report/account deletion anonymization, planner add/edit/delete, 100→101g recalculation, RECIPE_DETAIL state split, `RECIPE_DETAIL` / `FOOD_PRODUCT_PICKER` / `FOOD_PRODUCT_CREATE` / `PLANNER_WEEK` / `MEAL_SCREEN` / `SETTINGS_ACCOUNT_DELETE_CONFIRM`의 320/390/1280 evidence, authority report 중 하나라도 누락
- performance baseline:
  - community catalog predecessor 기준 local SQL 약 `28ms`, route response 약 `349-559ms`
  - release QA는 exact current head 값을 다시 기록하고 item-level N+1 또는 unexplained regression을 blocker로 본다

## Key Rules

- 이 slice는 verification-only다. bug를 발견하면 separate TDD repair PR로만 수정한다.
- repair PR merge 뒤 release QA는 repaired exact head에서 Stage 2/4를 처음부터 다시 돈다.
- ingredient coverage는 `845 = approved exactly once 838 + strict excluded 7`, `unclassified=0`, replay `0` write가 아니면 fail이다.
- recipe nutrition은 local checkpoint `34 = ready(complete) 8 + partial 23 + unavailable 3`, rollback `34`, Meal pin unchanged, missing!=0가 아니면 fail이다.
- public product catalog는 local public `287,041` rows, source tag, `label_basis_text`, solid `100g`, liquid `100mL`, no inference를 유지해야 한다.
- shared manual은 auth A/B, owner-only edit/delete, report append-only, account deletion anonymization, existing pin preservation을 모두 통과해야 한다.
- ProductPlannerEntry는 shopping / cooking / leftover / XP / Recipe Meal status와 섞이면 fail이다.
- current-head merge gate는 required check만이 아니라 시작된 모든 check가 success 또는 intentional skip인지로 판단한다.
- physical device, 실제 screen reader, true production-scale, Discord/Amphetamine은 Manual Only이며 merge 전 기본 gate를 대체하지 않는다.

## Primary User Path

1. verifier가 fresh local Supabase를 올리고 test account A/B로 로그인한다.
2. account A로 ingredient/recipe/product/planner baseline을 확인하고, shared manual create/edit/delete/report와 100→101g planner recalculation을 수행한다.
3. account B와 anonymized account state에서 shared manual 검색/추가/report/read-only/pin preservation, `FOOD_PRODUCT_CREATE`, `SETTINGS_ACCOUNT_DELETE_CONFIRM`, `RECIPE_DETAIL` state split, `PLANNER_WEEK` / `MEAL_SCREEN` planned nutrition과 workflow isolation을 확인한다.
4. 320 / 390 / desktop evidence, authority report, security/performance/code review, current-head checks를 모두 모은다.
5. 실패가 있으면 exact failing head를 기준으로 separate repair PR을 만들고, merge 후 이 흐름을 다시 반복한다.

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> verification-only slice지만 `Manual Only`를 제외한 항목은 exact current head evidence로 닫혀야 한다.
> checklist metadata는 `stage=2|4`만 사용하고, `scope=shared` + `stage=4` 항목은 `review=6`만 사용한다.

- [x] Stage 1 workpack/acceptance/automation/workflow-v2 docs lock <!-- omo:id=delivery-release-qa-stage1-lock;stage=2;scope=shared;review=3,6 -->
- [ ] ingredient coverage exact count, replay zero-write, secret/raw leak zero 재검증 <!-- omo:id=delivery-release-qa-ingredient-coverage;stage=2;scope=shared;review=3,6 -->
- [ ] all-recipe current lifecycle, rollback, missing-not-zero, Meal pin invariance 재검증 <!-- omo:id=delivery-release-qa-all-recipe-lifecycle;stage=2;scope=shared;review=3,6 -->
- [ ] local public products 287041, source tag, label basis, no inference, auth A/B/anonymization 재검증 <!-- omo:id=delivery-release-qa-product-catalog;stage=2;scope=shared;review=3,6 -->
- [ ] fresh local Supabase migrations, RLS, PostgREST, auth bootstrap, target digest, external write zero 확인 <!-- omo:id=delivery-release-qa-real-db-stack;stage=2;scope=shared;review=3,6 -->
- [ ] independent security/performance/code reviews blocker zero <!-- omo:id=delivery-release-qa-independent-reviews;stage=2;scope=shared;review=3,6 -->
- [ ] real Chrome auth A/B, `FOOD_PRODUCT_CREATE` create/search/edit/delete/report, `SETTINGS_ACCOUNT_DELETE_CONFIRM` account deletion anonymization, planner add/edit/delete 검증 <!-- omo:id=delivery-release-qa-real-browser-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL ready/partial/unavailable/temporary split과 모든 recipe `정보 준비 중` 뭉개짐 부재 검증 <!-- omo:id=delivery-release-qa-recipe-detail-states;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK / MEAL_SCREEN recipe+product planned nutrition과 shopping/cooking/leftover/XP isolation 검증 <!-- omo:id=delivery-release-qa-planner-isolation;stage=4;scope=frontend;review=5,6 -->
- [ ] 100→101g, solid 100g, liquid 100mL, direct relation only evidence <!-- omo:id=delivery-release-qa-basis-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPE_DETAIL` / `FOOD_PRODUCT_PICKER` / `FOOD_PRODUCT_CREATE` / `PLANNER_WEEK` / `MEAL_SCREEN` / `SETTINGS_ACCOUNT_DELETE_CONFIRM` 320/390/desktop evidence, exploratory QA/eval, authority report current-head 기준 확보 <!-- omo:id=delivery-release-qa-visual-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] current-head started checks all success or intentional skip, pending/fail zero <!-- omo:id=delivery-release-qa-current-head-checks;stage=4;scope=shared;review=6 -->
