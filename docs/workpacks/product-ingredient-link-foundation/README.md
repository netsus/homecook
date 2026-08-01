# product-ingredient-link-foundation

> 2026-07-31 사용자 승인 Contract Evolution relock. The historical master plan SHA-256 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc` (1,056 lines) remains product-link design history, while its local-only Auth/deployment assumptions are superseded by `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`. Official baseline: requirements v1.7.28, screens v1.5.32, flow v1.3.30, DB v1.3.30, API v1.2.33.

## Goal

사용자가 제품으로 보관한 팬트리 항목도 검수된 대표 재료 관계가 있을 때만 같은 canonical ingredient로 인식되어, 팬트리 추천과 후속 레시피·식사 기록 검증이 서로 다른 답을 내지 않게 한다. 제품 ID와 선택 당시 영양 version은 보존하고, 모호하거나 미승인인 제품은 이름으로 generic ingredient를 추측하지 않는다.

## Branches

- Stage 1 Contract Evolution docs: `docs/product-ingredient-link-contract-evolution`
- Stage 2 backend/data: `feature/be-product-ingredient-link-foundation`
- Stage 4 existing-consumer regression: `feature/fe-product-ingredient-link-foundation`
- Release train: B. `account-session-generation-foundation`과 `recipe-visibility-read-hardening`은 모두 병합됐다. Product-link behavior는 full-local UUID/session-binding/RLS 계약을 소비하며 production activation은 별도 Manual Only gate로 남긴다.
- 배포 gate: cutover floor 전에는 remote Supabase Auth/DB/Storage가 migration source-of-record이고, 최종 authority는 server MacBook의 same-host Next.js + self-hosted Supabase Auth/DB/Storage다. verifier는 pre-floor/cutover/post-floor를 분리하고 승인 전 production mutation은 0이어야 한다.
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
| `recipe-visibility-read-hardening` (#3) | merged | session/image/account-delete runtime and existing MANUAL_RECIPE_CREATE integration complete; production activation remains behind the full-local cutover gate |

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

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — 새 screen/route/layout/navigation/component hierarchy/visual hierarchy 변경 없음

기존 HOME/PANTRY consumer behavior는 Stage 4에서 회귀 검증했고, exact head `27fc07c48e61f9f8c252949e598ef5c67fc00068`의 독립 code/security/Stage 6 검토도 `P0/P1/P2=0/0/0`으로 승인됐다. PR #1256은 current-head 전체 checks green 뒤 merge SHA `5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0`로 병합됐으며, 서버 MacBook 운영 증거는 아래 Manual Only 경계에 남아 있다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.28.md` 0-PIL / 0-PIL-SHOPPING / 0-PIL-DELETE
- `docs/화면정의서-v1.5.32.md` 0-PIL
- `docs/유저flow맵-v1.3.30.md` 0-PIL / 0-PIL-SHOPPING / 0-PIL-DELETE
- `docs/db설계-v1.3.30.md` 0-PIL-A~D
- `docs/api문서-v1.2.33.md` 0-PIL-A~D and existing pantry/shopping/pantry-match sections
- historical master plan sections 6-2 and successor #2, with local-only Auth/deployment assumptions superseded by the current official tuple

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs only currently executable SOT/workflow/workpack/automation/bookkeeping/doc-gate validators, focused workflow Vitest, lint, typecheck, dependency audit as additional local security evidence, and diff check. The current PR head's independent GitGuardian result and repository Security Review workflow are observed separately; no unspecified local secret command is claimed.
- PR #1236 merged the test-first link-only safe subset with focused link/security tests, isolated fresh/replay PostgreSQL integration and backend verification. Draft PR #1255 implements the approved pantry/shopping/reader/account-delete Stage 2 runtime while independent approval remains pending.
- PR #1248 merged the test-first hybrid verifier as `4881c4c53181a5504e16f2fa3971e9f6f4b99f05` from exact head `e58bea0c544693c1f99104d07bf58bd8c0d01285`. Independent code/security review recorded P0/P1/P2 `0/0/0`, and all 24 current-head check runs completed as 14 success plus 10 intended skips. The complete local application DB/Storage plus sanitized remote Auth evidence remains a separate full-lifecycle gate.

### Historical hybrid verifier implementation evidence

- RED: `pnpm exec vitest run tests/product-ingredient-link-hybrid-verifier.test.ts` failed `2/7` because the draft required `HEAD == origin/master` and the CLI did not prove that an exact historical HEAD remained merged after `origin/master` advanced.
- GREEN: the same focused verifier suite passed `7/7` after the source gate changed to `git merge-base --is-ancestor HEAD origin/master` plus a clean tracked-tree check.
- The verifier accepts only loopback PostgreSQL, strips inherited PostgreSQL settings, opens a read-only transaction, requires `local auth.users=0`, and validates the link table, FK/check/partial-unique, ACL and exact function authority without applying migrations or promoting data.
- The remote Auth input is a strict sanitized aggregate bound to the exact verified SHA. Raw session/provider material, linked remote DB access and production/staging/remote application writes are rejected or absent.
- Local verification passed: focused product-link tests `26` passed with six normal integration skips, isolated PostgreSQL fresh `6/6` and replay `6/6`, and `pnpm verify:backend` with product tests `2,420` passed plus 128 normal skips, production build and security E2E `12/12`.
- The merged exact-SHA dry-run passed on `4881c4c53181a5504e16f2fa3971e9f6f4b99f05`, proving the clean merged-source gate, read-only mode, no Storage dependency and zero production/staging/remote application writes. Full local/remote evidence remains pending because truthful sanitized remote Auth evidence and the complete local application DB verification were not supplied. Newly approved reader completion and production activation remain unclaimed.

### Stage 2 review-repair evidence

- Draft PR #1255 exact reviewed head `3e47eb67e9634603b11a86ce1a7a190591ce5360` received `request_changes` from Stage 3 task `019fb631-8a42-7512-881d-8644562cb73a` (`P0=0/P1=5/P2=2`) and native security/DB reviewer `/root/stage2_security_db_review` (`Critical=0/High=2`).
- Repair RED reproduced two route failures for exact product pantry matching and POST provenance, three real PostgreSQL failures for visibility/auth/cleanup, and a dirty all-null shopping migration that incorrectly succeeded.
- Repair GREEN proves focused route tests `23/23`, focused Stage 2 suites `62/62`, isolated PostgreSQL fresh/replay `12/12` each, full Vitest `4,763` passed plus `232` normal skips, backend product tests `2,425` passed plus `128` normal skips, production build, security Playwright `12/12`, and source/workflow/workpack/automation/OMO/diff validators. The repository-wide local security-function gate stopped before target execution because the existing local DB has an unrelated partially deployed hybrid additive contract; the isolated target PostgreSQL role matrix is green. Independent re-review and current-head CI remain pending; this task does not self-approve.
- The fresh security/DB re-review `/root/stage2_security_db_review` approved exact head `66c27efac705939d9ae620affdf8aae92378c086` with `Critical/High/Medium/Low=0/0/0/0`. Fresh Stage 3 reviewer task `019fb668-233f-7ec1-a6a4-f507a74fe223` then returned `request_changes` at the same head with `P0/P1/P2=0/2/2`, identifying create-RPC payload ownership and two-session atomicity plus missing behavior/evidence coverage.
- Second repair RED reproduced an authenticated cross-owner SECURITY DEFINER payload write, a two-session `lists=2/attached=1/orphan=1` race, a caller-omitted locked-meal item set, and a valid split that failed against the real immutable snapshot trigger once the previously omitted snapshot-authority migration was restored to the isolated chain. GREEN now proves independent zero-write rejection for cross-user remainder, foreign owner column/recipe, omitted source identities and private/hidden product inputs; one success plus one existing `CONFLICT` and orphan zero under the race; server-recomputed pantry exclusion/complete-without-list; route detail/create/complete provenance branches; actual PostgreSQL pinned-version completion for null/empty/selected/retry semantics; and one-time server-only snapshot cloning that preserves the locked source meal pin while forged/direct clone authority is denied. The current evidence is focused route `57/57`, focused Stage 2 selection `97` passed with `20` normal integration skips, isolated PostgreSQL fresh/replay `20/20` each plus dirty preflight, full Vitest `4,765` passed with `240` normal skips, backend product `2,428` passed with `128` normal skips, build, security Playwright `12/12`, and validators. Replacement exact-head review and current-head CI remain pending; this implementation task does not self-approve.
- Final Stage 3 reviewer task `019fb6e6-4ca6-7320-ab08-dc86b7414a0b` approved exact head `6b0a1c5232759f3d801c9aa84e1427b12bfc37d1` with `P0/P1/P2=0/0/0`; the security/DB product-head review remained `Critical/High/Medium/Low=0/0/0/0`. PR #1255 then squash-merged as protected-base SHA `d30ee2c8f38a06609e7a5efddbfb0b5df30f712c`.

### Stage 4 existing-consumer evidence

- RED: locked `tests/product-ingredient-link-consumer.test.tsx` failed `3/5` before implementation: product-only HOME cleanout did not render when the generic recipe list was empty, additive PANTRY product rows were discarded, and the existing add sheet could not submit exact product/version identity.
- GREEN: the locked suite passes `5/5` and behaviorally proves product-only plus generic/product-distinct consumption, no-link name-guess fail-closed behavior, no raw PANTRY fallback from HOME, exact product/version display and POST payload, product-row read-only behavior, and existing unauthorized/error recovery.
- Existing HOME/PANTRY regression passed `94/94`. Focused Playwright passed desktop `1280px`, mobile `390px`, and mobile `320px` as `3` passed plus `3` project-mismatch intentional skips; attached screenshots confirm the existing shell/layout while exact product/version text remains present. No new route, navigation, public interaction, component hierarchy, custom-recipe/meal-log control, or production/staging/remote write was added. Design remains `N/A/not-required`; this was the initial Stage 4 evidence before the review-repair rounds below.
- Independent Stage 5 reviewer `/root/stage5_product_link_design_review` returned `request_changes` at exact head `9d974d5db977f6d7d8df47d484fb3956504f8505` with `P0/P1/P2=0/1/1`: existing-product identity compared only `food_product_id`, and category selection could retain stale product-search results.
- Repair RED failed `2/8` locked consumer cases while the other `6/8` remained green: the same product with a different nutrition version was incorrectly disabled, and a category transition retained the prior product result. Repair GREEN passes the locked suite `8/8`, existing HOME/PANTRY `97/97`, focused desktop/390/320 Playwright `3` passed plus `3` intentional project skips, `verify:frontend:pr`, and `CI=1 verify:frontend` including full regression `924` passed/`144` skipped, accessibility `18` passed/`15` skipped, visual `23` passed/`22` skipped, and security `12/12`. Exact same product/version pairs are disabled, different versions remain selectable with their exact payload, and category transitions clear product results immediately.
- Fresh Stage 5 reviewer `/root/stage5_product_link_design_rereview` confirmed the P1 exact-pair repair closed but returned `request_changes` at exact head `c0a5c45dc206dfa5c24c12dfe39822a99b0c2e3d` with `P0/P1/P2=0/0/1`: late ingredient/product responses were not guarded across query/category changes and sheet lifecycle. Second repair RED failed `1/10` locked cases while `9/10` remained green by completing new, old-search, and blank/category responses out of order. GREEN passes locked `10/10`, existing HOME/PANTRY `99/99`, focused desktop/390/320 Playwright `3` passed plus `3` intentional skips, `verify:frontend:pr`, and `CI=1 verify:frontend`. A monotonic request sequence now permits state writes only for the latest mounted request and invalidates pending work on query/category change, close, unmount, and reopen.
- Final fresh Stage 5 reviewer `/root/stage5_product_link_final_review` confirmed the search latest-request guard closed but returned `request_changes` at exact head `395c649f35bf88c2b13e72b600ccb0934313af45` with `P0/P1/P2=0/0/1`: an in-flight add mutation could complete after close/reopen and call the prior cycle's parent callbacks or write stale failure/loading state. Third repair RED failed `1/12` locked cases while `11/12` remained green because a late success closed the reopened sheet, showed a false success toast, and refreshed the parent. GREEN passes locked `12/12`, existing HOME/PANTRY `101/101`, focused desktop/390/320 Playwright `3` passed plus `3` intentional skips, `verify:frontend:pr`, and `CI=1 verify:frontend`. A separate monotonic mutation sequence now guards success callbacks, error state, and loading cleanup; close/unmount invalidates the old mutation while the reopened cycle can recover from an active failure and complete one exact-product add normally.
- Fresh independent Stage 5 approval reviewer `/root/stage5_product_link_approval_review` approved exact head `04d4b26c424ac4643a73febdaa0307e131198e39` with blocker/major/minor and `P0/P1/P2` both `0/0/0`. It confirmed `accept-link-existing-consumers`, `accept-link-existing-ui-states` and `accept-link-successor-ui-boundary`, kept Design `N/A/not-required`, and observed `20` success plus one intentional `full-regression` skip with failed/pending `0`. Stage 6 closeout remains pending.
- After the full-local base merge, independent code review of `2528eede51579d489e13a6468dc3b144f3ad425a` returned `P0/P1/P2=0/1/1`: active workflow gates still pointed at the historical hybrid verifier and aggregate/per-item approval state differed. The independent verifier also found `P0/P1/P2=0/1/1`: a selected cached theme could mask an initial HOME recipe error, and the Stage 6 wording was ahead of the pending status. Repair RED failed the new workflow lock `1/13` and the selected-theme HOME regression; GREEN passes the workflow lock, focused HOME/PANTRY consumer set `115/115`, full-local runtime static tests `22/22`, lint/typecheck and all source/workflow/workpack/automation/bookkeeping validators. Historical hybrid evidence remains documented but is no longer an active release gate; fresh repaired-head review and current-head CI are pending.
- Fresh review of repaired exact head `2907feb31336aee246a850fd84aba997710bb8a8` closed the prior findings: independent code review returned `P0/P1/P2=0/0/0`. A separate security review found `P0/P1/P2=0/1/0` because a previous authenticated user's slow pantry-list response could overwrite the next user's screen after an Auth session change. RED reproduced the cross-session stale response; GREEN invalidates pending list reads on every Auth transition and passes the focused HOME/PANTRY/product consumer set `103/103`. The independent verifier also exposed a date-dependent PostgreSQL fixture that became invalid after `2026-07-31`; its locked plan date now passes isolated fresh/replay PostgreSQL `20/20` each. The migration security scan retains all five assertions while replacing repository-wide greedy scans with latest-function-bounded scans, reducing the isolated suite from multi-second execution to `15ms`. Fresh final-head reviews and current-head CI remain pending; no completion is claimed here.

### Stage 6 final closeout evidence

- PR #1256 final exact head `27fc07c48e61f9f8c252949e598ef5c67fc00068` is a tree-identical evidence commit over reviewed implementation head `fd82fd200d7a5da17032388be8ebdd0b9f2f93a8`. Fresh independent code and security reviews both returned `P0/P1/P2=0/0/0`, and the independent verifier returned `MERGE-READY YES` for that exact remote head.
- Every check started for the exact final head finished success or documented intended skip. The sole skip was the normal `full-regression` skip; pending, failed, cancelled and rerun-in-progress counts were all zero.
- Local final evidence includes focused HOME/PANTRY consumer regressions, full-local runtime locks, isolated PostgreSQL fresh/replay `20/20` each, source/workflow/workpack/automation/OMO validators, lint, typecheck, `git diff --check`, `pnpm verify:frontend:pr`, and `CI=1 pnpm verify:frontend`. The frontend PR gate passed 2,429 product tests with 128 normal skips; the full gate passed regression 924/144 skip, accessibility 18/15 skip, visual 23/22 skip and security 12/12.
- PR #1256 squash-merged as protected-base SHA `5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0`. The detailed reviewer and command record is preserved in `docs/workpacks/product-ingredient-link-foundation/evidence/2026-08-01-stage4-6-closeout.md`.
- Existing-schema digest, production-equivalent query plan, server-Mac full-local Auth/RLS/delete-recreate rehearsal and production activation remain Manual Only. This closeout performed zero production/staging writes and does not authorize activation.

### Local fixture and real DB matrix

- A/B owners plus public/shared owner-null products; generic pantry rows; exact product+nutrition-version pantry rows.
- link states: active approved primary represents, inactive, pending/rejected/revoked/superseded, non-primary, `contains`, `substitute`, and concurrent double-primary promotion.
- duplicate evidence: generic ingredient and multiple eligible product rows resolving to the same ingredient must yield one effective ingredient and preserve all exact pantry row identities.
- delete cases: private product hard delete cascades link; public/shared anonymization preserves product/version/link/provenance; ingredient delete is restricted while referenced.
- candidate cases: high-use deterministic candidates, brand-variable product with no approval, and `화이트크림` referenced/unreferenced inventory.
- current automated DB evidence runs isolated fresh/replay plus dirty-row preflight and validates focused table/FK/index/check/partial-unique/RLS/grant/function behavior.
- existing-schema comparison, stable schema/function/grant/data digests and production-equivalent query-plan measurement remain unverified Manual Only evidence; they are not claimed by this Stage 2 runner.

### Security, performance and release evidence

- PUBLIC/anon/authenticated/admin/service-principal matrix proves normal users cannot mutate/promote or infer another owner's private product/link.
- each effective reader uses a bounded indexed set operation without per-row product-link N+1 or unbounded catalog scan.
- evidence contains no secret, raw provider payload, private product owner identity or user PII.
- merged-exact-SHA `verify-product-ingredient-link-hybrid.mjs`의 과거 결과는 local application DB/Storage schema·reader·role에 대한 historical read-only evidence로만 보존한다. full-local 최종 gate는 local Auth UUID/session binding과 `auth.uid()` RLS를 별도로 검증한다.
- cutover floor 전에는 remote Supabase가 source-of-record이며 isolated full-local rehearsal과 production/staging application write 0을 유지한다.
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

- [x] additive link table, FKs, review/active checks and partial unique are existing/fresh/replay safe <!-- omo:id=delivery-link-schema;stage=2;scope=backend;review=3,6 -->
- [x] deterministic candidate and human-only atomic promotion boundary is enforced <!-- omo:id=delivery-link-promotion;stage=2;scope=backend;review=3,6 -->
- [x] first small Stage 2 PR leaves `pantry_items`, public payloads and existing readers unchanged while proving the additive link authority, promotion ACL and fail-closed eligible-link selector only <!-- omo:id=delivery-link-safe-subset;stage=2;scope=backend;review=3,6 -->
- [x] pantry exact product/nutrition-version identity and API `product_items` shape are additive and generic identity is not overwritten <!-- omo:id=delivery-pantry-product-identity;stage=2;scope=backend;review=3,6 -->
- [x] shopping generic/product provenance is pinned at creation and completion consumes it without client product/version resend <!-- omo:id=delivery-shopping-product-provenance;stage=2;scope=backend;review=3,6 -->
- [x] the shared DISTINCT effective-ingredient projection admits only active approved primary represents <!-- omo:id=delivery-effective-projection;stage=2;scope=backend;review=3,6 -->
- [x] pantry-match and HOME cleanout readers use the shared projection <!-- omo:id=delivery-current-readers;stage=2;scope=backend;review=3,6 -->
- [x] custom recipe validation, pantry display/add and meal-log picker reader contracts are regression locked <!-- omo:id=delivery-future-readers;stage=2;scope=backend;review=3,6 -->
- [x] brand-product synonym prohibition, ambiguity fail-closed and broad-anchor preservation are tested <!-- omo:id=delivery-no-guess-policy;stage=2;scope=backend;review=3,6 -->
- [x] private cascade/public-shared preservation and ingredient restrict are proven <!-- omo:id=delivery-delete-integrity;stage=2;scope=backend;review=3,6 -->
- [x] RLS/grants/admin promotion and A/B owner isolation are proven <!-- omo:id=delivery-link-security;stage=2;scope=backend;review=3,6 -->
- [x] current safe subset records isolated local fresh/replay DB evidence and the merged-exact-SHA hybrid verifier's read-only dry-run gate <!-- omo:id=delivery-link-verification;stage=2;scope=shared;review=3,6 -->
- [x] existing HOME cleanout and PANTRY display/add consumers use the projection contract without raw ingredient-only fallback <!-- omo:id=delivery-link-existing-consumers;stage=4;scope=frontend;review=5,6 -->
- [x] existing loading/empty/error/read-only/unauthorized and exact product/version presentation remain unchanged <!-- omo:id=delivery-link-ui-regression;stage=4;scope=frontend;review=5,6 -->

## Manual Only

- [ ] existing application DB schema/function/grant/data digest comparison
- [ ] production-equivalent effective-reader query-plan measurement
- [ ] server-Mac full-local rehearsal with merged-exact source, preserved UUID/product provenance, local Auth RLS/cross-owner/delete-recreate evidence and pre-floor production mutation zero
- [ ] production account-generation/account-delete activation and candidate promotion remain behind their separately approved release gates
