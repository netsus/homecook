# personal-recipe-customization-write-core

> Stage 1 contract lock. Approved master plan SHA-256 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc` (1,056 lines). Official baseline: requirements v1.7.25, screens v1.5.29, flow v1.3.27, DB v1.3.26, API v1.2.29.

## Goal

공개 레시피 원본과 과거 snapshot을 바꾸지 않으면서 owner가 개인 레시피를 만들고, fork하고, revision 기반으로 수정하고, soft delete할 수 있는 서버 쓰기 코어를 만든다. 모든 mutation은 session-bound account generation, 권한, 멱등성과 recipe lock을 한 DB transaction에서 검증하며, 완성되지 않은 미래 계획 전파 계약이나 snapshot-v2 activation을 앞당기지 않는다.

## Branches

- Stage 1 docs: `docs/personal-recipe-customization-write-core`
- Stage 2 backend: `feature/be-personal-recipe-customization-write-core`
- Release train: C
- Stage 1 author, internal 1.5 reviewer/repair-final owner, backend implementation owner, security/DB reviewer, five-axis reviewer와 closeout reviewer는 서로 다른 Codex 세션을 사용한다. Claude는 사용하지 않는다.

## In Scope

- dormant owner-private recipe write core
  - 신규 owner-private personal recipe create
  - public accessible recipe를 `origin_recipe_id`로 pin한 새 owner-private fork; public source row/revision/content는 불변
  - owner-private current의 optimistic revision update와 같은 ID 저장
  - 명시적 `새 레시피로 저장`에만 별도 private identity 생성
  - canonical ingredient 또는 exact food product ID와 선택 당시 nutrition version provenance, amount/unit, title/base servings, steps/cooking method, reviewed tags와 managed image reference의 add/change/delete
  - owner-only `deleted_at` 멱등 soft delete; snapshot/FK/history 보존
- database and authorization boundary
  - #3/#4가 제공하는 `recipes.visibility/origin_recipe_id/deleted_at/revision`, immutable content/nutrition snapshot authority와 private owner pairing을 소비한다.
  - RLS, direct DML revoke/guard와 server-only single-RPC mutation path를 잠근다. client는 owner, visibility, account generation, public image intent, nutrition current authority를 주입할 수 없다.
  - verified JWT owner UUID, `session_id`, `iat`, server identity epoch와 F0 `expected_account_generation=current active generation`을 mutation transaction 안에서 다시 확인한다.
  - lock order는 `global cutover shared fence → owner lifecycle → recipe UUID ascending → Meal UUID ascending → resource row`다. #6의 recipe-local write도 이 순서를 약화하지 않고, lock-only RPC 뒤 별도 REST DML을 수행하지 않는다.
- request durability and concurrency
  - 신규 personal mutation은 UUID `Idempotency-Key`, canonical key hash와 payload hash를 `(owner,generation,scope)`에 저장한다.
  - same key+same payload는 최초 durable status/data를 재생하고, same key+different payload는 mutation 0의 `409 IDEMPOTENCY_KEY_REUSED`다.
  - base revision mismatch, concurrent owner write, delete/write race는 한 winner만 commit하고 loser는 전체 mutation 0이다. 외부 public error는 공식 API에 정의된 code만 사용한다.
- managed media and tag integration
  - `image_object_id`만 durable managed-image identity이며 recipe content save와 reference attach를 같은 RPC transaction에서 commit한다.
  - personal image는 private-only이고 owner/generation/bucket/visibility/grace를 검증한다. signed URL이나 service bucket URL 문자열은 identity가 아니다.
  - tag visibility는 parent recipe의 public/not-deleted/quarantine upper bound를 넘지 않는다.

Schema Change:
- [ ] 없음
- [x] 있음 — 신규 official public field/table을 만들지는 않지만, approved schema 위에서 RLS·grant/revoke·guard·server RPC·idempotency/lock enforcement migration이 필요하다.

## Out of Scope

- `POST /recipes/{id}/future-plan-impact`, `recipe_change_previews`, `impact_token`, `replace_all|keep`, Meal pin·shopping reconcile·active claim 처리와 최종 public PATCH integration (#7)
- alternate/partial public `PATCH /recipes/{id}` body 또는 #7 전 외부 PATCH activation. 최종 body는 official `base_recipe_revision + full draft + future_plan_strategy + impact_token + optional image_object_id` 그대로다.
- snapshot-v2 session-attempt start/cancel/read, exact pantry completion, cooked-batch ledger와 R/R+1/R+2 activation (#7/#8)
- editor shell, `RECIPE_DETAIL` CTA, navigation, loading/empty/error/read-only UI와 design evidence (#5)
- 기존 planner-bound/manual create를 자동 private로 바꾸거나 public/manual legacy row를 rewrite하는 migration
- MYPAGE/RECIPEBOOK_DETAIL 편집 UI, user-facing history/trash/restore/publish UI
- public recipe mutation, other-owner private existence disclosure, client-selected owner/visibility/generation/source authority
- unofficial endpoint, request/response field, status, error code 또는 production feature activation
- production DB migration, external-provider write 또는 unmerged migration 적용을 이 Stage 1 docs PR에서 수행하기

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| historical contract base PR #1072 | merged | superseded baseline; active authority is the current tuple in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` |
| F0 `account-session-generation-foundation` | Stage 1 docs merged | runtime session-generation/capability/fence가 #6 implementation predecessor |
| #2 `product-ingredient-link-foundation` | Stage 1 docs merged | exact product→ingredient relation runtime이 product ingredient validation predecessor |
| #3 `recipe-visibility-read-hardening` | Stage 1 docs merged | private visibility/RLS/image registry/tag upper-bound runtime이 predecessor |
| #4 `recipe-snapshot-authority-foundation` | Stage 1 docs merged | immutable content/nutrition snapshot runtime이 predecessor |
| #5 `personal-recipe-editor-decoupling` | Stage 1 docs merged as PR #1079 | UI composition contract locked; runtime UI remains separately gated |
| `31-recipe-media-tags` | in-progress | must be merged before implementation; existing image object/cancel surface is reused |
| `36e-recipe-tags-frontend` | ready-for-review | must be merged before implementation; existing tag primitives are reused |
| #7 and #8 | successors | future impact integration and joint snapshot-v2 activation remain blocked |

> Roadmap status is `docs` while workflow lifecycle remains `planned`. Stage 1 ordering does not mean the #2~#5 runtime predecessors exist, and this docs merge activates no schema, route or personal mutation.

## Backend First Contract

### Ownership and identity modes

| Operation | Allowed source | Result identity | Immutable boundary |
| --- | --- | --- | --- |
| personal create | authenticated active generation | new owner-private ID | no implicit Meal creation |
| public fork | public accessible, not-deleted source | new owner-private ID with fixed `origin_recipe_id` | public source row/revision/content unchanged |
| personal save | owner-private, not-deleted current + expected revision | same recipe ID, monotonic revision | earlier content/nutrition snapshots unchanged |
| save as new | owner-private draft via explicit secondary intent | new owner-private ID | source private ID remains unchanged |
| delete | owner-private, not-deleted or same delete replay | same ID with `deleted_at` | history FK/snapshot retained; no hard delete |

- other-owner private/deleted/quarantined resource is not a writable source and remains 404/non-disclosure.
- legacy planner-bound/manual `POST /recipes` behavior and existing public/manual rows are preserved until their approved migration gate; #6 must not silently reclassify them.
- soft-deleted recipe cannot create a new snapshot, Meal, cooking start, tag exposure or normal write. Account cleanup alone may hard delete exact-owner private rows after dependents.

### Public API boundary

- `POST /recipes` retains the existing manual surface. Under `personal_recipe_v2`, an accessible public `origin_recipe_id` creates a new private fork and returns the new private recipe ID/detail destination. An owner-private save-as-new also returns a new private ID. `image_object_id` attaches atomically.
- `PATCH /recipes/{id}` keeps the official final request and response contract. #6 implements only the dormant recipe-local write core; it does not expose a smaller body or externally enable PATCH before #7 supplies preview/token/target validation and the full common transaction.
- `DELETE /recipes/{id}` requires Authorization and UUID `Idempotency-Key`; it uses one owner+recipe-lock RPC to record `deleted_at` idempotently and preserves all history anchors.
- response envelope remains `{ success, data, error }`; error remains `{ code, message, fields[] }`.
- #6 adds no endpoint. It does not own `POST /recipes/{id}/future-plan-impact` or `/cooking/session-attempts`.

### Transaction and authorization order

1. Route authenticates the request and validates envelope/header shape, but pre-read is UX only.
2. One DB RPC acquires the global shared capability fence and owner lifecycle advisory lock.
3. The RPC verifies exact JWT session binding, identity epoch, current active generation and `personal_recipe_v2` capability.
4. Recipe IDs are locked in UUID order. Any #7 target Meal locks later extend the same order; #6 cannot introduce an incompatible lock path.
5. The RPC revalidates source visibility/ownership/deleted state, expected revision, canonical draft/provenance, image object and tag upper bound.
6. Idempotency row, recipe/content change and image/tag reference effects commit atomically. Failure rolls all effects back.

### Error / no-write matrix

| Condition | Public result | Required effect |
| --- | --- | --- |
| missing/invalid auth | existing 401 contract | mutation 0 |
| other-owner private/deleted/quarantined source | 404/non-disclosure | mutation 0; no owner/state leak |
| public source sent to PATCH | official 403; fork uses POST | source mutation 0 |
| same key, different canonical payload | `409 IDEMPOTENCY_KEY_REUSED` | mutation 0 |
| stale/missing session or generation | `409 ACCOUNT_SESSION_STALE` or `ACCOUNT_GENERATION_STALE` | mutation 0 |
| quarantined/deleting/cutover maintenance | official 409/503 lifecycle code | mutation 0 |
| final PATCH preview/revision/target drift | #7 official `409 RECIPE_IMPACT_STALE` | recipe/Meal/shopping mutation 0 |
| replace-all target has active claim | #7 official `409 MEAL_COOKING_ALREADY_STARTED` | all mutation 0 |
| managed image missing/expired/mismatch/URL-only | official 404/409/422 image code | content/reference mutation 0 |

No stable capability-off public error code is invented. Before approved activation, new personal write entry is absent/disabled at client and server and tests assert mutation zero.

## Snapshot / Product / Media Integrity

- canonical draft preserves ingredient ID or exact product ID, selected `food_product_nutrition_version_id`, amount/unit and product name/brand provenance. Product current version is not silently substituted.
- product ingredient validation consumes #2 approved primary `represents` relation without storing brand IDs in `ingredient_synonyms` or coercing ambiguous products to generic ingredients.
- every successful create/update produces or reuses #4 immutable content snapshot with only exact nutrition snapshot ID; no nutrition vector/status/source duplication.
- same recipe revision update never mutates old content/nutrition snapshot rows. public/shared snapshots remain owner-null and account cleanup does not delete them.
- replacing/removing an image updates references atomically and leaves cleanup to #3's generation-aware server outbox. Browser Storage `.remove()` and raw service URL deletion are forbidden.
- private recipe tags remain invisible through direct RLS, `/tags`, search/theme/sitemap/cache/SEO and usage count.

## Capability and Release Gate

- implementation dark-ships behind `personal_recipe_v2`; migration/test internal calls do not make it externally usable.
- current and immediate-previous clients must continue existing legacy/manual behavior and emit no new personal mutation while the capability is off.
- #7 must integrate the official future-plan preview/PATCH transaction, and #8 must complete flag-off R and R+1 seeded snapshot-v2 drain compatibility.
- only R+2 may jointly activate new snapshot-v2 creation and personal mutation. Rollback blocks new personal mutations and v2 starts but never disables existing v2 read/cancel/complete drain.
- Stage 1, Stage 2 merge, or a green isolated route test is not activation evidence.

## Frontend Delivery Mode / Design Authority

- Frontend delivery: N/A. This workpack changes backend write/RLS/RPC behavior only and adds no screen, layout, CTA, navigation or interaction model.
- Design Status: `N/A`.
- #5 owns `RECIPE_DETAIL`/editor state matrix, design critic and 390px/320px screenshot/Figma authority. #6 must not create duplicate wireframes or claim those artifacts.
- Future integration may consume the existing #5 UI only after #7/#8 gates; UI loading/empty/error/read-only/unauthorized behavior is not completed by this backend PR.

## Primary User Path

1. After the approved capability gate, a user starts from #5's public recipe fork entry and submits the accessible public source plus a UUID `Idempotency-Key`; the server derives owner/private authority.
2. #6's single RPC verifies session generation, locks the source, preserves its digest/revision, and returns one new owner-private recipe ID with fixed `origin_recipe_id`.
3. On a later owner edit, #7 first completes the official impact preview/token flow and delegates the recipe-local commit to #6; normal save keeps the same ID and advances revision once.
4. Only the explicit save-as-new path creates another private ID. A later owner delete records `deleted_at`, hides new selection, and leaves all pinned history readable.

## QA / Test Data Plan

### Stage 1 gate

- this docs PR runs SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc Vitest, lint, typecheck, dependency audit and diff check.
- PostgreSQL migrations, route/RPC tests, real DB, browser/E2E, local-first production/rehearsal verification and activation evidence below are future Stage 2/integration/closeout artifacts and are not claimed executable now.

### Future fixtures

- owners A/B, active G1/G2 sessions, revoked/missing/stale binding, quarantined/deleting/maintenance lifecycle and same UUID old identity.
- public source, owner-private active, other-owner private, soft-deleted private, public/manual legacy and owner-null shared recipe rows.
- generic ingredient plus exact product/version provenance, approved/ambiguous product link, step add/change/delete, tag visibility and managed private image objects.
- same key+payload replay, different payload conflict, same-revision concurrent PATCH, write-vs-delete, delete-vs-account-cleanup and delayed G1 write→G2 races.
- existing Meal/snapshot/history references proving soft delete does not break reads and account cleanup alone hard deletes in exact FK order.
- capability-off current/immediate-previous clients and R/R+1 release fixtures proving new personal mutation count zero.

### Future evidence

- Vitest route/service tests for create/fork/save-as-new/update/delete, wrapper/errors, legacy compatibility and image/tag integration.
- PostgreSQL fresh/replay tests for RLS, grants, direct DML denial, lock order, generation binding, idempotency, concurrency and cleanup.
- real local Supabase smoke with two owners and exact DB before/after digest for every denied path.
- merged-exact-SHA server-production/local-rehearsal read-only inventory of functions, ACL/RLS/policies/constraints and capability state; no unapproved server-production migration.
- E2E only after #5 UI plus #7/#8 integration: public source unchanged/new private ID, same-ID edit, explicit new ID, delete/history, and capability rollback.

## Key Rules

- public source is immutable; fork and save-as-new create new owner-private identities.
- normal personal save keeps identity and advances revision; no direct snapshot mutation.
- individual delete is soft; account cleanup is the only private hard-delete path.
- every personal writer is session-generation-bound, idempotent and single-RPC transactional.
- client input never determines owner, visibility, generation, source current version or public image intent.
- managed image attach and tag visibility stay inside #3 authority; content/nutrition snapshot stays inside #4 authority.
- no alternate partial PATCH contract: #7 integrates the official impact-token shape before any external PATCH.
- `personal_recipe_v2` remains dark until #8 compatibility gate and R+2 joint activation.

## Delivery Checklist

Stage 2 implementation evidence is retained at [`evidence/2026-08-02-stage2-backend-implementation.md`](./evidence/2026-08-02-stage2-backend-implementation.md). It records the implementer task's actual RED→GREEN, disposable PostgreSQL fresh/replay and predecessor regression results without claiming Stage 3 approval, Manual Only evidence or capability activation.

- [ ] dormant create/fork/save-as-new core preserves source identity and legacy manual behavior <!-- omo:id=delivery-personal-write-create;stage=2;scope=backend;review=3,6 -->
- [ ] owner-private same-ID revision update stores canonical ingredient/product/version/step provenance <!-- omo:id=delivery-personal-write-update;stage=2;scope=backend;review=3,6 -->
- [ ] soft DELETE is owner-only, idempotent and preserves every history FK/snapshot <!-- omo:id=delivery-personal-write-delete;stage=2;scope=backend;review=3,6 -->
- [ ] public/other-owner/direct-DML/client-authority mutation paths are denied without disclosure <!-- omo:id=delivery-personal-write-permissions;stage=2;scope=backend;review=3,6 -->
- [ ] F0 session generation, lifecycle and shared capability fence are revalidated inside each write transaction <!-- omo:id=delivery-personal-write-generation;stage=2;scope=backend;review=3,6 -->
- [ ] common lock order and one-RPC atomicity survive write/delete/account-cleanup races <!-- omo:id=delivery-personal-write-locks;stage=2;scope=backend;review=3,6 -->
- [ ] idempotency replay/conflict is generation-scoped and effect-exactly-once <!-- omo:id=delivery-personal-write-idempotency;stage=2;scope=backend;review=3,6 -->
- [ ] image object attach, tag upper bound and immutable content/nutrition snapshot authorities are preserved <!-- omo:id=delivery-personal-write-integrations;stage=2;scope=shared;review=3,6 -->
- [ ] #7 final PATCH/propagation and #8 activation boundaries are not preclaimed <!-- omo:id=delivery-personal-write-successor-boundary;stage=2;scope=shared;review=3,6 -->
- [ ] capability-off current/previous releases create zero new personal mutations and legacy manual flow remains green <!-- omo:id=delivery-personal-write-dark-ship;stage=2;scope=shared;review=3,6 -->
- [ ] local, PostgreSQL, real DB, E2E, security and current-head checks produce the planned evidence <!-- omo:id=delivery-personal-write-verification;stage=2;scope=shared;review=3,6 -->
