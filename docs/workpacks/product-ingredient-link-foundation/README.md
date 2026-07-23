# product-ingredient-link-foundation

> Stage 1 contract lock. Approved master plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines). Official baseline: requirements v1.7.22, screens v1.5.28, flow v1.3.25, DB v1.3.23, API v1.2.27.

## Goal

사용자가 제품으로 보관한 팬트리 항목도 검수된 대표 재료 관계가 있을 때만 같은 canonical ingredient로 인식되어, 팬트리 추천과 후속 레시피·식사 기록 검증이 서로 다른 답을 내지 않게 한다. 제품 ID와 선택 당시 영양 version은 보존하고, 모호하거나 미승인인 제품은 이름으로 generic ingredient를 추측하지 않는다.

## Branches

- Stage 1 docs: `docs/product-ingredient-link-foundation`
- Stage 2 backend/data: `feature/be-product-ingredient-link-foundation`
- Stage 4 existing-consumer regression: `feature/fe-product-ingredient-link-foundation`
- Release train: B. 구현 및 activation은 F0와 successor #3의 joint account-delete gate 이후에만 진행한다.
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
- 최소 reader 전환과 회귀 잠금
  - official contract `GET /recipes/pantry-match` (implementation/deployed route `/api/v1/recipes/pantry-match`)
  - HOME pantry-cleanout recommendation reader
  - custom recipe product validation reader
  - pantry display/direct add/shopping completion reflection reader
  - meal-log product/ingredient picker reader
  - 각 reader가 raw `pantry_items.ingredient_id`만 읽는 경로를 금지
- account-delete compatibility
  - owner-only private product hard delete 시 product cascade로 link 제거
  - owner-null public/shared product, link와 non-PII provenance는 보존
  - F0 + #3 joint account-delete activation gate 전에는 generation-aware cleanup activation 금지

Schema Change:
- [ ] 없음
- [x] 있음 — 기존 migration을 수정하지 않고 official DB v1.3.23 K의 link table, pantry product/version identity와 effective reader를 additive migration으로 추가한다.

## Out of Scope

- public product-link CRUD 또는 admin HTTP endpoint 추가
- 제품명·브랜드 유사도만으로 287,041개 catalog를 일괄 연결하거나 자동 승인
- 브랜드 product ID를 `ingredient_synonyms`에 저장
- `contains|substitute`를 P0 recommendation matching에 사용
- HOME 검색에 product를 추가하거나 HOME/PANTRY/MEAL_LOG/COOK_MODE layout을 변경
- successor #1의 search relevance, #6의 personal recipe write, #8의 exact pantry-row cooking completion, #9/#12의 meal-log implementation/UI
- F0 또는 #3보다 먼저 production account-generation/account-delete activation
- unmerged migration의 remote 적용 또는 production/staging data write

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| Stage -1 security hotfix + closeout | merged/deployed | application-controlled mutation authorization predecessor complete |
| official cooking/meal-log contract PR #1072 | merged | v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 authority available |
| `account-session-generation-foundation` Stage 1 docs PR #1073 | merged | F0 contract is documented; F0 runtime is not yet activated |
| `prepared-food-search-relevance` Stage 1 docs PR #1074 | merged | exact successor #1 docs predecessor complete |
| `recipe-visibility-read-hardening` (#3) | Stage 1 docs pending | does not block this Stage 1 docs PR; blocks #2 implementation activation with F0 |

> The approved Stage 0 sequence intentionally merges all 15 Stage 1 docs/internal 1.5 gates before implementation. Therefore roadmap `docs` is valid now while workflow lifecycle remains `planned`; Stage 2 must not start until its runtime predecessors and joint activation gate are satisfied.

## Backend First Contract

### Link authority

- production matching predicate is exactly active + approved + primary + `relation='represents'`.
- a partial unique constraint enforces at most one row matching that predicate per product. Concurrent promotion must be atomic and must not select an arbitrary winner.
- no link, pending/rejected/revoked/superseded/inactive link, non-primary link, or only `contains|substitute` means no effective product ingredient. Readers fail closed instead of using product name, brand, synonym, first row, or stable-ID order as a guess.
- candidate generation and approval are separate. Deterministic candidates contain source/provenance but cannot become matching authority without an explicit human-reviewed promotion.
- link rows do not copy owner UUID, email, session, label secrets, raw provider payload, API key, or other user PII.

### Pantry identity and projection

- generic pantry rows retain their canonical ingredient identity.
- product pantry rows retain exact product identity and the nutrition version selected at add time; a later product current-version change must not rewrite historical pantry provenance.
- the effective ingredient set is a stable `DISTINCT` union of generic pantry ingredient IDs and product-link ingredient IDs admitted by the exact production predicate.
- duplicate generic+product evidence for the same ingredient appears once in recommendation matching, while the distinct pantry row IDs and product/version identity remain available to row-level consumers.
- official `GET /recipes/pantry-match`, HOME cleanout, custom recipe validation, pantry display/add and meal-log picker consume the shared projection/helper. Regression tests must fail if any reader returns to a raw ingredient-only query.

### Product variance and legacy safety

- Greek yogurt, whole-wheat bread and similarly brand-variable foods do not expose a generic selection merely because a name resembles an ingredient; the product identity remains primary until an approved representative link exists.
- a taxonomy anchor needed only internally stays search-hidden under the existing visibility policy.
- broad `화이트크림` references are inventoried before deprecate/hide. Referenced history is not hard-deleted.
- a private owner-only product hard delete cascades its link. A shared/public product anonymized to owner-null keeps the product, exact nutrition version, link and provenance.

### ACL, API and errors

- normal users can only receive eligible projections within existing product/pantry visibility. They cannot insert/update/delete or promote link rows directly.
- exact internal/admin mutation uses the repository's safe role, RLS, grant and audit patterns; `PUBLIC`/`anon`/ordinary `authenticated` promotion is denied.
- this slice adds no public endpoint or response field not present in official documents. Existing JSON endpoints preserve `{ success, data, error }` and `{ code, message, fields[] }`.
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
- `docs/요구사항기준선-v1.7.22.md` G/J
- `docs/화면정의서-v1.5.28.md` 0-C/0-E
- `docs/유저flow맵-v1.3.25.md` ⓰
- `docs/db설계-v1.3.23.md` K and account cleanup order
- `docs/api문서-v1.2.27.md` C/F and existing `GET /recipes/pantry-match`
- approved master plan sections 6-2 and successor #2

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs only currently executable SOT/workflow/workpack/automation/bookkeeping/doc-gate validators, focused workflow Vitest, lint, typecheck, dependency audit as additional local security evidence, and diff check. The current PR head's independent GitGuardian result and repository Security Review workflow are observed separately; no unspecified local secret command is claimed.
- Stage 2 first adds tests and observes RED before writing migration or production reader code. Planned artifacts include focused link/route/security/reader/account-delete Vitest, existing/fresh/replay PostgreSQL integration, backend verification and a merged-exact-SHA remote read-only verifier.
- those Stage 2/closeout commands are required future gates but are not claimed to exist or pass in Stage 1. Missing planned files or commands block implementation closeout.

### Local fixture and real DB matrix

- A/B owners plus public/shared owner-null products; generic pantry rows; exact product+nutrition-version pantry rows.
- link states: active approved primary represents, inactive, pending/rejected/revoked/superseded, non-primary, `contains`, `substitute`, and concurrent double-primary promotion.
- duplicate evidence: generic ingredient and multiple eligible product rows resolving to the same ingredient must yield one effective ingredient and preserve all exact pantry row identities.
- delete cases: private product hard delete cascades link; public/shared anonymization preserves product/version/link/provenance; ingredient delete is restricted while referenced.
- candidate cases: high-use deterministic candidates, brand-variable product with no approval, and `화이트크림` referenced/unreferenced inventory.
- run on existing schema, fresh migration replay and idempotent replay. Validate table/FK/index/check/partial-unique/RLS/grants/function signatures and row digests.

### Security, performance and remote evidence

- PUBLIC/anon/authenticated/admin/service-principal matrix proves normal users cannot mutate/promote or infer another owner's private product/link.
- each effective reader uses a bounded indexed set operation without per-row product-link N+1 or unbounded catalog scan.
- evidence contains no secret, raw provider payload, private product owner identity or user PII.
- remote work is read-only before merge. Any migration or data promotion runs only from a merged exact SHA under a later approved release gate.

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
- [ ] pantry exact product/nutrition-version identity is additive and generic identity is not overwritten <!-- omo:id=delivery-pantry-product-identity;stage=2;scope=backend;review=3,6 -->
- [ ] shared DISTINCT effective-ingredient projection admits only active approved primary represents <!-- omo:id=delivery-effective-projection;stage=2;scope=backend;review=3,6 -->
- [ ] pantry-match and HOME cleanout readers use the shared projection <!-- omo:id=delivery-current-readers;stage=2;scope=backend;review=3,6 -->
- [ ] custom recipe validation, pantry display/add and meal-log picker reader contracts are regression locked <!-- omo:id=delivery-future-readers;stage=2;scope=backend;review=3,6 -->
- [ ] brand-product synonym prohibition, ambiguity fail-closed and broad-anchor preservation are tested <!-- omo:id=delivery-no-guess-policy;stage=2;scope=backend;review=3,6 -->
- [ ] private cascade/public-shared preservation and ingredient restrict are proven <!-- omo:id=delivery-delete-integrity;stage=2;scope=backend;review=3,6 -->
- [ ] RLS/grants/admin promotion and A/B owner isolation are proven <!-- omo:id=delivery-link-security;stage=2;scope=backend;review=3,6 -->
- [ ] local real DB, query-plan and merged-exact-SHA remote read-only evidence are recorded <!-- omo:id=delivery-link-verification;stage=2;scope=shared;review=3,6 -->
- [ ] existing HOME cleanout and PANTRY display/add consumers use the projection contract without raw ingredient-only fallback <!-- omo:id=delivery-link-existing-consumers;stage=4;scope=frontend;review=5,6 -->
- [ ] existing loading/empty/error/read-only/unauthorized and exact product/version presentation remain unchanged <!-- omo:id=delivery-link-ui-regression;stage=4;scope=frontend;review=5,6 -->
