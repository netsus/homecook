# product-ingredient-link-foundation

> 2026-07-31 사용자 승인 Contract Evolution relock. The historical master plan SHA-256 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc` (1,056 lines) remains product-link design history, while its local-only Auth/deployment assumptions are superseded by `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`. Official baseline: requirements v1.7.27, screens v1.5.31, flow v1.3.29, DB v1.3.28, API v1.2.31.

## Goal

사용자가 제품으로 보관한 팬트리 항목도 검수된 대표 재료 관계가 있을 때만 같은 canonical ingredient로 인식되어, 팬트리 추천과 후속 레시피·식사 기록 검증이 서로 다른 답을 내지 않게 한다. 제품 ID와 선택 당시 영양 version은 보존하고, 모호하거나 미승인인 제품은 이름으로 generic ingredient를 추측하지 않는다.

## Branches

- Stage 1 Contract Evolution docs: `docs/product-ingredient-link-contract-evolution`
- Stage 2 backend/data: `feature/be-product-ingredient-link-foundation`
- Stage 4 existing-consumer regression: `feature/fe-product-ingredient-link-foundation`
- Release train: B. `account-session-generation-foundation`과 `recipe-visibility-read-hardening`은 모두 병합됐다. Stage 2는 hybrid exact-epoch/session-authority 경계 안에서만 구현하며 production activation은 별도 Manual Only gate로 남긴다.
- 초기 배포 gate: application Data/Storage authority는 server MacBook local Next.js + local Supabase, Auth control-plane은 remote Auth다. verifier는 둘을 분리해 읽기 전용으로 확인하고 production/staging/remote application write는 0이어야 한다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, implementation owner, security/DB reviewer와 five-axis reviewer는 사용자 승인대로 서로 다른 Codex 세션을 사용하며 Claude는 사용하지 않는다.

## In Scope

- additive `food_product_ingredient_links` schema
  - product FK `ON DELETE CASCADE`, ingredient FK `ON DELETE RESTRICT`
  - `relation`, `review_status`, `is_primary`, active 상태, source/provenance와 timestamps
  - active approved primary `relation='represents'`는 product당 최대 1개인 partial unique
  - `contains|substitute` relation은 저장할 수 있어도 P0 recommendation matching에는 사용하지 않음
- link 생성·검수·승격 경계
  - 실제 recipe/pantry 사용 빈도가 높은 product부터 deterministic candidate를 생성
  - 사람이 승인한 relation만 active production matching에 승격
  - 일반 사용자 직접 link promotion/DML은 금지하고 exact internal/admin principal만 mutation
- `pantry_items`의 additive product identity
  - product pantry row는 exact product ID와 당시 nutrition version을 보존
  - 기존 generic `ingredient_id` identity를 product link 결과로 덮어쓰지 않음
  - shared effective-ingredient projection은 generic ingredient와 approved product link ingredient를 `DISTINCT` union
- 기존 pantry API의 additive exact shape
  - `POST /pantry`: 기존 `ingredient_ids` + additive `product_items[{food_product_id, food_product_nutrition_version_id}]`
  - `GET /pantry`/POST response: 기존 generic `items` + additive `product_items`; generic count `added` + product count `product_added`
- `shopping_list_items` generic/product provenance
  - generic은 `ingredient_id`, product는 exact `food_product_id + food_product_nutrition_version_id`를 생성 시 pin
  - 기존 `POST /shopping/lists`, `GET /shopping/lists/{list_id}` response는 generic=`source_type='ingredient'`, product=`source_type='food_product'`, all-null malformed legacy=`source_type=null`과 nullable exact provenance로 분기
  - completion client는 product/version을 재전송하지 않고 existing `add_to_pantry_item_ids`만 사용
- 최소 reader 전환과 회귀 잠금
  - official contract `GET /recipes/pantry-match` (implementation/deployed route `/api/v1/recipes/pantry-match`)
  - HOME pantry-cleanout recommendation reader
  - pantry display/direct add/shopping completion reflection reader
  - current #2 reader는 `authenticated-self` + 함수 내부 `auth.uid() = p_user_id` guard를 사용하고 user-path service-token fallback을 금지
  - custom-recipe/meal-log에는 shared reader signature/semantics regression contract만 제공하고 실제 endpoint/runtime/UI consumption은 owning successor에 남김
  - #2 소유 reader가 raw `pantry_items.ingredient_id`만 읽는 경로를 금지
- account-delete compatibility
  - owner-only private product hard delete 시 product cascade로 link 제거
  - owner-null public/shared product, link와 non-PII provenance는 보존
  - F0 + #3 joint account-delete activation gate 전에는 generation-aware cleanup activation 금지

Schema Change:
- [ ] 없음
- [x] 있음 — 기존 migration을 수정하지 않고 official DB v1.3.28의 pantry/shopping XOR identity, composite RESTRICT FK, shared reader와 private aggregate cleanup guard를 additive migration으로 추가한다.

## Out of Scope

- public product-link CRUD 또는 admin HTTP endpoint 추가
- 제품명·브랜드 유사도만으로 287,041개 catalog를 일괄 연결하거나 자동 승인
- 브랜드 product ID를 `ingredient_synonyms`에 저장
- `contains|substitute`를 P0 recommendation matching에 사용
- HOME 검색에 product를 추가하거나 HOME/PANTRY/MEAL_LOG/COOK_MODE layout을 변경
- successor #1의 search relevance, #6의 personal recipe write, #8의 exact pantry-row cooking completion, #9/#12의 meal-log implementation/UI
- F0 또는 #3보다 먼저 production account-generation/account-delete activation
- server MacBook local production authority 밖의 migration apply 또는 production/staging data write
- `DELETE /pantry`의 새 product deletion field, 신규 public product-link/admin endpoint, 신규 public status/error code

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| Stage -1 security hotfix + closeout | merged/deployed | application-controlled mutation authorization predecessor complete |
| historical cooking/meal-log contract base PR #1072 | merged | superseded baseline; active authority is the current tuple in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` |
| `account-session-generation-foundation` | merged | F0 backend/frontend foundation and independent closeout are available; production generation activation remains Manual Only |
| `prepared-food-search-relevance` | merged | successor #1 implementation and closeout predecessor complete |
| `recipe-visibility-read-hardening` (#3) | merged | hybrid session/image/account-delete runtime and existing MANUAL_RECIPE_CREATE integration complete |

> PR #1076의 historical Stage 1 approval은 이전 tuple에 대한 기록이다. 2026-07-31 사용자 승인 Contract Evolution은 이 작업의 새 internal 1.5 docs gate를 통과하기 전까지 최종 승인되지 않으며, 이 작성 작업은 자기 변경을 승인하지 않는다. 기존 link-only subset/verifier의 merged evidence는 유지하되 새 pantry/shopping contract의 Stage 2/4 evidence를 주장하지 않는다.

### Approved Contract Evolution boundary

- 사용자 승인: 2026-07-31, `#2 product-ingredient-link-foundation`.
- 승인 범위: pantry exact product ID + 선택 당시 immutable nutrition version, shared effective reader, shopping product/version provenance, pantry/shopping composite FK와 private account cleanup order.
- official public shape는 existing `ingredient_ids`/generic `items`/complete body·response를 유지하고 additive `product_items`, `product_added`, shopping item provenance만 추가한다.
- 새 endpoint, public status, public error code, product-link CRUD/admin HTTP API, account-generation production activation은 승인 범위 밖이다.

## Backend First Contract

### Link authority

- production matching predicate is exactly active + approved + primary + `relation='represents'`.
- a partial unique constraint enforces at most one row matching that predicate per product. Concurrent promotion must be atomic and must not select an arbitrary winner.
- no link, pending/rejected/revoked/superseded/inactive link, non-primary link, or only `contains|substitute` means no effective product ingredient. Readers fail closed instead of using product name, brand, synonym, first row, or stable-ID order as a guess.
- candidate generation and approval are separate. Deterministic candidates contain source/provenance but cannot become matching authority without an explicit human-reviewed promotion.
- link rows do not copy owner UUID, email, session, label secrets, raw provider payload, API key, or other user PII.

### Pantry identity, public shape and projection

- generic pantry rows retain their canonical ingredient identity.
- product pantry rows retain exact product identity and the nutrition version selected at add time; a later product current-version change must not rewrite historical pantry provenance.
- the effective ingredient set is a stable `DISTINCT` union of generic pantry ingredient IDs and product-link ingredient IDs admitted by the exact production predicate.
- duplicate generic+product evidence for the same ingredient appears once in recommendation matching, while the distinct pantry row IDs and product/version identity remain available to row-level consumers.
- internal `select_pantry_effective_ingredients(p_user_id uuid)`는 generic과 eligible product link를 `DISTINCT` union하고 official `GET /recipes/pantry-match`와 HOME cleanout이 직접 소비한다. custom recipe validation과 meal-log picker는 successor에서 동일 semantics를 소비하도록 regression contract만 잠근다.
- shared reader 실행은 `authenticated-self` 전용이며 함수 내부 `auth.uid() = p_user_id` guard를 통과해야 한다. missing auth, other-owner, stale generation/session은 fail closed하고 user-path service-token fallback은 금지한다. custom-recipe/meal-log의 실제 runtime endpoint/UI consumption은 #2 구현 대상이 아니다.
- `POST /pantry`는 기존 `ingredient_ids`와 additive `product_items[{food_product_id, food_product_nutrition_version_id}]`를 받는다. 둘 중 하나는 non-empty여야 하며 product/version mismatch는 기존 `422 VALIDATION_ERROR`다.
- `GET /pantry`와 POST response는 기존 generic `items`/`added` 의미를 유지하고 additive `product_items`/`product_added`를 반환한다. product item은 exact pantry row ID, exact product/version, `name`, nullable `brand`, `created_at`을 포함한다.

### Shopping provenance and completion

- `shopping_list_items`는 generic `ingredient_id` 또는 exact product/version pair 중 하나만 저장한다. existing non-null ingredient legacy row는 generic이며 all-null legacy row는 preflight blocker다.
- 기존 `POST /shopping/lists`와 `GET /shopping/lists/{list_id}` response는 generic=`source_type='ingredient'`+null product fields, product=`source_type='food_product'`+exact pair, all-null malformed legacy=`source_type=null`+all-null identity로 반환한다. all-null row는 display snapshot만 보존하고 matching/reflection/`added_to_pantry` 전환에서 제외한다.
- product source는 list 생성/reconcile 시 version을 pin하고 current version 변경으로 repin하지 않는다.
- completion request/response와 `add_to_pantry_item_ids` null/[]/선택값 의미는 그대로다. server가 pinned provenance를 사용하며 client product/version 재전송은 금지한다.
- completed read-only/409, exclude→uncheck, invalid item ignore, `pantry_added = pantry_added_item_ids.length`는 유지한다.

### FK and cleanup order

- pantry/shopping composite `(food_product_id, food_product_nutrition_version_id)` FK는 `ON DELETE RESTRICT`; product/version mismatch도 composite FK/guard로 차단한다.
- ordinary product delete는 soft delete이고 authenticated hard delete/version delete/cleanup execute는 revoke한다.
- account cleanup authority만 owner-private pantry/shopping/planner/meal-log/recipe references를 먼저 제거하고 refcount 0 뒤 private product aggregate를 hard delete한다. private link/version cascade는 exact lifecycle/generation/owner token 아래에서만 허용한다.
- owner-null public/shared product, immutable version, link/provenance는 보존한다.

### Product variance and legacy safety

- Greek yogurt, whole-wheat bread and similarly brand-variable foods do not expose a generic selection merely because a name resembles an ingredient; the product identity remains primary until an approved representative link exists.
- a taxonomy anchor needed only internally stays search-hidden under the existing visibility policy.
- broad `화이트크림` references are inventoried before deprecate/hide. Referenced history is not hard-deleted.
- a private owner-only product hard delete cascades its link. A shared/public product anonymized to owner-null keeps the product, exact nutrition version, link and provenance.

### ACL, API and errors

- normal users can only receive eligible projections within existing product/pantry visibility. They cannot insert/update/delete or promote link rows directly.
- exact internal/admin mutation uses the repository's safe role, RLS, grant and audit patterns; `PUBLIC`/`anon`/ordinary `authenticated` promotion is denied.
- this slice adds no public endpoint, status or error code not present in official documents. Additive fields are limited to the approved pantry/shopping shapes. Existing JSON endpoints preserve `{ success, data, error }` and `{ code, message, fields[] }`.
- official contract paths `GET /recipes/pantry-match` and `GET /recipes/themes` map to the existing implementation/deployed routes `/api/v1/recipes/pantry-match` and `/api/v1/recipes/themes`; contract assertions use the official paths and route-file/deployed smokes use the prefixed paths.
- read failures remain existing endpoint errors; absence of an approved link is valid fail-closed data, not a fabricated ingredient or a new public error code.

## Frontend Delivery Mode

- behavior-only at Stage 4: existing HOME cleanout and PANTRY display/add consumers are regression-tested against the effective-ingredient contract without a new screen, route, layout, navigation, component hierarchy or public interaction.
- existing screens keep their current loading/empty/error/read-only/unauthorized behavior and exact product/version labels. Custom-recipe and meal-log consumers remain contract-locked for their owning successors; this workpack is not design approval for `HOME`, `PANTRY`, `MEAL_LOG`, `RECIPE_DETAIL` or `COOK_MODE` changes.
- if implementation requires a user-visible change, stop and route it through the owning successor workpack and its design authority gate.

## Design Authority

- UI risk: `low-risk` backend projection only
- Anchor screen dependency: none directly modified
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: official screen scope is preserved; this workpack neither opens a new UI nor changes an anchor screen.

## Design Status

`N/A`. No new screen or visual-system change. Existing HOME/PANTRY consumer behavior is regression-tested at Stage 4/5.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.27.md` 0-PIL / 0-PIL-SHOPPING / 0-PIL-DELETE
- `docs/화면정의서-v1.5.31.md` 0-PIL
- `docs/유저flow맵-v1.3.29.md` 0-PIL / 0-PIL-SHOPPING / 0-PIL-DELETE
- `docs/db설계-v1.3.28.md` 0-PIL-A~D
- `docs/api문서-v1.2.31.md` 0-PIL-A~D and existing pantry/shopping/pantry-match sections
- historical master plan sections 6-2 and successor #2, with local-only Auth/deployment assumptions superseded by the current official tuple

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs only currently executable SOT/workflow/workpack/automation/bookkeeping/doc-gate validators, focused workflow Vitest, lint, typecheck, dependency audit as additional local security evidence, and diff check. The current PR head's independent GitGuardian result and repository Security Review workflow are observed separately; no unspecified local secret command is claimed.
- PR #1236 merged the test-first link-only safe subset with focused link/security tests, isolated fresh/replay PostgreSQL integration and backend verification. The newly approved pantry/shopping/reader/account-delete coverage is authorized but remains unchecked until later implementation/review stages.
- PR #1248 merged the test-first hybrid verifier as `4881c4c53181a5504e16f2fa3971e9f6f4b99f05` from exact head `e58bea0c544693c1f99104d07bf58bd8c0d01285`. Independent code/security review recorded P0/P1/P2 `0/0/0`, and all 24 current-head check runs completed as 14 success plus 10 intended skips. The complete local application DB/Storage plus sanitized remote Auth evidence remains a separate full-lifecycle gate.

### Hybrid verifier implementation evidence

- RED: `pnpm exec vitest run tests/product-ingredient-link-hybrid-verifier.test.ts` failed `2/7` because the draft required `HEAD == origin/master` and the CLI did not prove that an exact historical HEAD remained merged after `origin/master` advanced.
- GREEN: the same focused verifier suite passed `7/7` after the source gate changed to `git merge-base --is-ancestor HEAD origin/master` plus a clean tracked-tree check.
- The verifier accepts only loopback PostgreSQL, strips inherited PostgreSQL settings, opens a read-only transaction, requires `local auth.users=0`, and validates the link table, FK/check/partial-unique, ACL and exact function authority without applying migrations or promoting data.
- The remote Auth input is a strict sanitized aggregate bound to the exact verified SHA. Raw session/provider material, linked remote DB access and production/staging/remote application writes are rejected or absent.
- Local verification passed: focused product-link tests `26` passed with six normal integration skips, isolated PostgreSQL fresh `6/6` and replay `6/6`, and `pnpm verify:backend` with product tests `2,420` passed plus 128 normal skips, production build and security E2E `12/12`.
- The merged exact-SHA dry-run passed on `4881c4c53181a5504e16f2fa3971e9f6f4b99f05`, proving the clean merged-source gate, read-only mode, no Storage dependency and zero production/staging/remote application writes. Full local/remote evidence remains pending because truthful sanitized remote Auth evidence and the complete local application DB verification were not supplied. Newly approved reader completion and production activation remain unclaimed.

### Local fixture and real DB matrix

- A/B owners plus public/shared owner-null products; generic pantry rows; exact product+nutrition-version pantry rows.
- link states: active approved primary represents, inactive, pending/rejected/revoked/superseded, non-primary, `contains`, `substitute`, and concurrent double-primary promotion.
- duplicate evidence: generic ingredient and multiple eligible product rows resolving to the same ingredient must yield one effective ingredient and preserve all exact pantry row identities.
- delete cases: private product hard delete cascades link; public/shared anonymization preserves product/version/link/provenance; ingredient delete is restricted while referenced.
- candidate cases: high-use deterministic candidates, brand-variable product with no approval, and `화이트크림` referenced/unreferenced inventory.
- run on existing schema, fresh migration replay and idempotent replay. Validate table/FK/index/check/partial-unique/RLS/grants/function signatures and row digests.

### Security, performance and hybrid release evidence

- PUBLIC/anon/authenticated/admin/service-principal matrix proves normal users cannot mutate/promote or infer another owner's private product/link.
- each effective reader uses a bounded indexed set operation without per-row product-link N+1 or unbounded catalog scan.
- evidence contains no secret, raw provider payload, private product owner identity or user PII.
- merged-exact-SHA `verify-product-ingredient-link-hybrid.mjs`는 local application DB/Storage schema·reader·role을 읽기 전용으로 확인하고 remote Auth의 exact epoch/session binding evidence만 최소 조회한다.
- local application DB에는 `local auth.users=0`을 요구한다. remote application DB/Storage, production, staging에는 write하지 않는다.
- migration apply, link promotion, account-generation activation은 이 docs relock이나 unmerged branch에서 실행하지 않는다.

## Key Rules

- only active approved primary `represents` is P0 matching authority.
- product identity and selected nutrition version survive effective-ingredient projection.
- generic and approved product ingredients are `DISTINCT` unioned; pantry rows themselves are not collapsed or silently deleted.
- product identifiers are not synonyms, and ambiguity never becomes an automatic generic link.
- private cascade and public/shared preservation are both mandatory account-delete regressions.
- F0 + #3 joint account-delete activation is a hard predecessor, not an optional rollout note.
- no public contract, field, endpoint, status or error is invented in implementation.

## Primary User Path

1. An authenticated user has a generic ingredient row, a product row, or both in pantry while exact product/version identity is retained.
2. A recommendation or validation reader asks the shared effective-ingredient projection for the user's eligible pantry set.
3. The projection admits only active approved primary `represents` links and returns a distinct ingredient set without overwriting pantry row identity.
4. The reader matches recipes or validates the selection consistently; an unreviewed/ambiguous product remains product-only instead of becoming a guessed generic ingredient.

## Delivery Checklist

- [ ] additive link table, FKs, review/active checks and partial unique are existing/fresh/replay safe <!-- omo:id=delivery-link-schema;stage=2;scope=backend;review=3,6 -->
- [ ] deterministic candidate and human-only atomic promotion boundary is enforced <!-- omo:id=delivery-link-promotion;stage=2;scope=backend;review=3,6 -->
- [x] first small Stage 2 PR leaves `pantry_items`, public payloads and existing readers unchanged while proving the additive link authority, promotion ACL and fail-closed eligible-link selector only <!-- omo:id=delivery-link-safe-subset;stage=2;scope=backend;review=3,6 -->
- [ ] pantry exact product/nutrition-version identity and API `product_items` shape are additive and generic identity is not overwritten <!-- omo:id=delivery-pantry-product-identity;stage=2;scope=backend;review=3,6 -->
- [ ] shopping generic/product provenance is pinned at creation and completion consumes it without client product/version resend <!-- omo:id=delivery-shopping-product-provenance;stage=2;scope=backend;review=3,6 -->
- [ ] the shared DISTINCT effective-ingredient projection admits only active approved primary represents <!-- omo:id=delivery-effective-projection;stage=2;scope=backend;review=3,6 -->
- [ ] pantry-match and HOME cleanout readers use the shared projection <!-- omo:id=delivery-current-readers;stage=2;scope=backend;review=3,6 -->
- [ ] custom recipe validation, pantry display/add and meal-log picker reader contracts are regression locked <!-- omo:id=delivery-future-readers;stage=2;scope=backend;review=3,6 -->
- [ ] brand-product synonym prohibition, ambiguity fail-closed and broad-anchor preservation are tested <!-- omo:id=delivery-no-guess-policy;stage=2;scope=backend;review=3,6 -->
- [ ] private cascade/public-shared preservation and ingredient restrict are proven <!-- omo:id=delivery-delete-integrity;stage=2;scope=backend;review=3,6 -->
- [ ] RLS/grants/admin promotion and A/B owner isolation are proven <!-- omo:id=delivery-link-security;stage=2;scope=backend;review=3,6 -->
- [ ] current safe subset records local real DB/replay and merged-exact-SHA hybrid read-only evidence; projection query-plan evidence remains deferred until Contract Evolution <!-- omo:id=delivery-link-verification;stage=2;scope=shared;review=3,6 -->
- [ ] existing HOME cleanout and PANTRY display/add consumers use the projection contract without raw ingredient-only fallback <!-- omo:id=delivery-link-existing-consumers;stage=4;scope=frontend;review=5,6 -->
- [ ] existing loading/empty/error/read-only/unauthorized and exact product/version presentation remain unchanged <!-- omo:id=delivery-link-ui-regression;stage=4;scope=frontend;review=5,6 -->
