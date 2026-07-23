# Recipe Content Snapshot Future Propagation

## Goal

개인 레시피 current를 수정할 때 owner/session-bound impact preview와 동일한 draft·Meal/claim 대상만 한 DB RPC에서 commit하고, 사용자가 고른 `replace_all | keep`에 따라 미래 Meal content pin과 미완료 shopping을 결정적으로 처리한다. 같은 슬라이스에서 snapshot-v2 start/cancel/read와 v1/v2 dispatch skeleton을 dormant하게 배포하되, #8의 R/R+1 검증 전에는 새 personal write와 v2 creation을 외부 활성화하지 않는다.

## Branches

- Stage 1 docs: `docs/recipe-content-snapshot-future-propagation`
- Stage 2 backend/DB: `feature/be-recipe-content-snapshot-future-propagation`
- Stage 4 frontend integration: `feature/fe-recipe-content-snapshot-future-propagation`
- Release train: C. 구현 선행조건은 #4와 #6 runtime, merged `cook-mode-whole-board`다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, implementation owner, security/DB reviewer, five-axis reviewer, design critic, product-design-authority reviewer와 closeout reviewer는 서로 다른 Codex 세션을 사용한다. Claude는 사용하지 않는다.

## In Scope

- owner-scoped future impact preview
  - `POST /recipes/{id}/future-plan-impact`가 `base_recipe_revision + full draft`를 실제 PATCH와 같은 canonicalizer로 처리한다.
  - server가 `recipe_change_previews`에 owner/generation/session binding, recipe, token hash, base revision, proposed content hash, target-set revision hash, Meal/claim summary, expiry와 consumed/result marker를 기록한다.
  - public response는 공식 `impact_token`, expiry, proposed hash, 미래 Meal 수/날짜 범위, 미완료·완료 shopping 수, active claim 수와 `replace_all_allowed`만 반환한다.
- final recipe PATCH transaction
  - #6의 recipe-local write core를 공식 full PATCH body와 연결한다.
  - preview row lock 뒤 owner/session/recipe/expiry/base revision/draft hash/target Meal revisions/active claim-session tuple을 모두 다시 계산한다.
  - `keep`은 기존 Meal content pin을 하나도 바꾸지 않는다.
  - `replace_all`은 오늘 이후이며 `cook_done`이 아닌 eligible Meal만 새 immutable content snapshot으로 repin한다. active claim이 하나라도 있으면 대상을 빼고 진행하지 않고 전체 무변경 `409 MEAL_COOKING_ALREADY_STARTED`다.
- common writer transaction boundary
  - recipe PATCH/soft DELETE/모든 future restore, 미래 Meal 생성·수정·삭제, shopping 생성·reconcile, snapshot-v2 cooking start를 single-RPC final authority로 전환한다.
  - global cutover shared fence → owner lifecycle → recipe UUID ascending → Meal UUID ascending → resource row 순서를 사용한다.
  - 여러 recipe를 다루는 shopping RPC는 recipe UUID 순으로 lock을 획득한다. lock-only RPC 뒤 REST DML은 금지한다.
- shopping and grouping
  - 미완료 shopping은 같은 transaction에서 deterministic reconcile한다. 같은 ingredient/unit의 checked와 pantry-excluded 상태는 보존하고 새 item은 unchecked, 더 이상 필요한 Meal이 없는 item만 제거한다.
  - completed shopping/list item은 read-only이며 어떤 impact 경로에서도 변경하지 않는다.
  - future planning/shopping grouping key는 `(recipe_id, recipe_content_snapshot_id)`다. mutable current recipe만으로 서로 다른 content pin을 합치지 않는다.
- snapshot-v2 dormant start/cancel/read
  - `POST /cooking/session-attempts`는 planner와 standalone request를 별도 mode/parser로 처리하고 UUID `Idempotency-Key`를 요구한다.
  - planner start는 recipe lock 후 Meal을 UUID 순으로 lock하고 owner/status/revision/no-claim/same non-null recipe+content를 재검증한다. Meal의 content pin과 planned servings를 session에 복사하고 Meal별 active claim을 원자 생성한다.
  - standalone start만 recipe access/deleted/current revision을 검증해 current content와 requested cooking servings를 pin한다.
  - `GET /cooking/session-attempts/{id}/cook-mode`는 owner snapshot-v2 session의 immutable content만 읽고 mutable current recipe를 재조회하지 않는다.
  - `POST /cooking/session-attempts/{id}/cancel`은 owner in-progress v2 session을 cancelled로 만들고 planner claim을 같은 transaction에서 해제하며 replay는 최초 durable result를 반환한다.
  - current와 immediate-previous UI에 `contract_version=legacy_v1 | snapshot_v2` dispatch skeleton을 배포한다. body shape로 version을 추측하거나 parser를 공유하지 않는다.
- dark release and UI integration
  - start 성공과 session ID/contract version 수신 전에는 planner/standalone 어느 쪽도 COOK_MODE로 이동하지 않는다.
  - #7의 v2 start/cancel/read와 dispatch는 dormant다. creation flag가 꺼져도 seeded/existing v2 read/cancel은 계속 drain 가능하다.
  - RECIPE_DETAIL 저장 영향 dialog는 공식 counts와 `전체 반영 | 기존 계획 유지`만 보여주고 stale 409를 성공처럼 닫지 않는다.

Schema Change:
- [ ] 없음
- [x] 있음 — #4 dark schema를 소비하고 `recipe_change_previews`, final RPCs/guards/indexes와 compatibility dispatch를 additive하게 구현한다. 기존 migration은 수정하지 않는다.

## Out of Scope

- exact `consumed_pantry_item_ids`, finished weight, batch/ledger, cook count/XP를 commit하는 snapshot-v2 complete API와 완료 UI (#8)
- cooked batch 중량/잔량/event ledger, meal log, PLANNER_WEEK shell redesign (#8~#12)
- external `personal_recipe_v2` 또는 snapshot-v2 creation 활성화, R/R+1 seeded full-drain 증거와 R+2 공동 activation (#8)
- v1 body/response/parser 변경, required-key 428 cutover, new v1 start 차단 또는 v1 tombstone (#13)
- 날짜별 Meal checkbox, 별도 shopping 생성, 옛 recipe로 새 cooking action, partial PATCH, user-facing restore endpoint
- 과거 날짜, `cook_done`, completed/cancelled cooking history, completed shopping 또는 meal-log snapshot repin
- #4 content/nutrition authority를 대체하는 direct nutrition pointer나 mutable recipe fallback
- #5의 editor primitive/CTA 재설계, #10의 planner navigation shell, #11의 weight UI
- 공식 문서에 없는 endpoint, request/response field, status, error code, screen 또는 client authority
- Stage 1 docs PR에서 production code, migration, remote DB mutation 또는 capability change

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| official contract PR #1072 | merged | v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 authority available |
| `recipe-snapshot-authority-foundation` Stage 1 PR #1078 | merged docs | #4 runtime must provide content authority, v2 dark session/claim/idempotency schema and rollback-safe Meal transition before #7 implementation |
| `personal-recipe-customization-write-core` Stage 1 PR #1080 | merged docs | #6 runtime must provide the recipe-local owner/session-generation-bound write core before #7 integrates final PATCH |
| `cook-mode-whole-board` | currently `implementation` | must merge with required checks green before #7 implementation; Stage 1 docs may merge now |
| `cooked-batch-weight-ledger` #8 | successor | owns exact-pantry complete and R/R+1 compatibility gate before R+2 joint activation |

> Roadmap status is `docs` while workflow lifecycle remains `planned`. This Stage 1 docs merge neither satisfies runtime predecessors nor activates personal writes or v2 session creation.

## Authority and Transaction Contract

### Preview authority

1. Route validates auth and official request envelope, but DB is final authority.
2. One preview RPC acquires the global shared fence, owner lifecycle lock and recipe lock, then verifies exact JWT session binding, identity epoch, current generation, ownership, visibility and base revision.
3. The same canonicalizer used by PATCH computes `proposed_content_hash`; client hashes and token payloads are never authority.
4. Eligible future Meal IDs/revisions and active claim/session tuples are read under the common order, then hashed into `target_set_revision_hash`.
5. A cryptographically random opaque token is stored only as a server-side hash with owner/generation/session/recipe/expiry binding. Client direct INSERT/UPDATE/DELETE of `recipe_change_previews` is denied.
6. Preview performs no recipe, Meal or shopping mutation. Short-TTL cleanup and account cleanup may remove preview rows.

### Final PATCH authority

1. Request supplies Authorization, UUID `Idempotency-Key`, the previewed `base_recipe_revision`, identical full `draft`, `future_plan_strategy=replace_all|keep`, `impact_token` and optional `image_object_id`.
2. One DB RPC reacquires global shared fence → owner → recipe → Meal locks, locks the preview row and revalidates current lifecycle/session generation and capability.
3. RPC canonicalizes the supplied draft again and compares owner/recipe/expiry/base revision/content hash/target-set revisions/claim-session tuple with the preview.
4. Any mismatch returns `409 RECIPE_IMPACT_STALE`; claimed replace-all returns `409 MEAL_COOKING_ALREADY_STARTED`. Both leave recipe, content, Meal, claim and shopping digests unchanged.
5. `keep` commits the #6 recipe-local current update and consumes the preview/idempotency result without repinning any Meal.
6. `replace_all` first proves every target is eligible and unclaimed, then commits the recipe revision, immutable content, all Meal repins and incomplete shopping reconcile atomically.
7. Same generation+operation+key+canonical payload replays the first wrapper/status. Same key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED` with zero mutation.

### Writer inventory and lock order

| Writer | Required common authority |
| --- | --- |
| recipe PATCH / soft DELETE / future internal restore | fence → owner → recipe; PATCH extends to target Meal locks before any write |
| future Meal create/update/delete | fence → owner → recipe UUID → Meal UUID; content/revision/status rechecked in one RPC |
| shopping create/reconcile across recipes | fence → owner → recipe UUID ascending → Meal UUID ascending → shopping rows |
| planner snapshot-v2 start | fence → owner → recipe UUID → Meal UUID ascending → session/claim rows |
| standalone snapshot-v2 start | fence → owner → recipe UUID → session rows |
| snapshot-v2 cancel | fence → owner → recipe/Meal in canonical order → session/claim rows |

Route pre-read may improve copy but cannot authorize a later REST write. Every inventory item must be moved before direct table privileges/guards are tightened; an unconverted writer blocks release.

## Session Attempt Contract

### Start

- planner request is `{ mode:'planner', meal_ids, expected_meal_revisions }`; standalone request is `{ mode:'standalone', recipe_id, expected_recipe_revision, cooking_servings }`.
- planner Meal set must be non-empty, same owner, eligible status/revision, same recipe and same non-null content, with no active claim. A concurrent same-Meal start has one winner because `cooking_session_meal_claims.meal_id` is the authority.
- planner session copies the Meal pin and planned servings; it never repins from mutable recipe current.
- standalone pins current content only after recipe visibility, `deleted_at IS NULL` and expected revision pass under recipe lock.
- response includes session ID, `contract_version=snapshot_v2`, mode and pinned content summary. Client waits for this response before COOK_MODE navigation.
- when creation is disabled, only the official internal/test allowlist may create; public result is `409 SNAPSHOT_V2_CREATION_DISABLED` and mutation zero.

### Read / cancel / dispatch

- v2 cook-mode read is owner-only and snapshot-only. Cross-version ID, other-owner and non-inferable resources use the official 404/409 boundary.
- cancel requires UUID `Idempotency-Key`; in-progress owner v2 becomes cancelled and its planner claims are released atomically.
- completed/cancelled replay returns the stored result and never reopens or releases another session's claim.
- rollback blocks new v2 starts but leaves existing v2 GET/cancel and, after #8, complete available for drain.
- legacy v1 endpoints continue to parse/render only `legacy_v1`. Snapshot-v2 endpoints parse/render only `snapshot_v2`.

## Shopping / Historical Immutability

- replace-all targets only today-after future Meals that are not `cook_done`; exact eligibility follows official Meal status/date authority.
- same ingredient/unit checked and pantry-excluded state survives deterministic incomplete-list rebuild. New required item is unchecked. An item disappears only when no remaining linked Meal needs it.
- completed shopping and item rows stay bit-for-bit unchanged. UI explains `완료한 장보기 기록은 바뀌지 않아요` while cooking follows the Meal's pinned snapshot.
- past Meals, `cook_done`, completed/cancelled sessions, completed shopping and past meal records are never repinned.
- `(recipe_id, recipe_content_snapshot_id)` grouping prevents old and new content for the same recipe ID from being merged.

## Error / No-Write Matrix

| Condition | Public result | Required effect |
| --- | --- | --- |
| missing/invalid auth | existing 401 | mutation 0 |
| other-owner/deleted/quarantined resource | official 404/non-disclosure | mutation 0; owner/state not leaked |
| stale session/generation/lifecycle maintenance | official 409/503 lifecycle code | mutation 0 |
| expired token, base revision, draft hash or target-set drift | `409 RECIPE_IMPACT_STALE` | recipe/Meal/shopping/claim mutation 0 |
| replace-all target has active claim/session | `409 MEAL_COOKING_ALREADY_STARTED` | no silent exclusion; whole request mutation 0 |
| same idempotency key with different payload | `409 IDEMPOTENCY_KEY_REUSED` | mutation 0 |
| snapshot-v2 creation flag off | `409 SNAPSHOT_V2_CREATION_DISABLED` | session/claim mutation 0 |
| cross-version session ID | official 404/409 | no parser fallback or state change |
| completed shopping mutation attempt | official read-only `409` | list/item unchanged |

All responses keep `{ success, data, error }` and `{ code, message, fields[] }`. Internal reason aliases do not replace exact public codes.

## Stage 1 Wireframes

### `RECIPE_DETAIL` save impact dialog

```text
┌ 레시피 변경 영향 ──────────────────┐
│ [loading] 영향을 확인하는 중…       │  actions disabled; fail closed
│                                     │
│ 미래 요리 계획 3개 · 7/24~7/30     │
│ 미완료 장보기 1개 · 완료 장보기 1개 │
│ 진행 중인 요리 0개                  │
│ 완료한 장보기 기록은 바뀌지 않아요 │
│                                     │
│ ○ 전체 반영                         │  primary choice
│ ○ 기존 계획 유지                    │  safe alternative
│                                     │
│ [취소]                     [저장]   │
└─────────────────────────────────────┘

active claim > 0:
- `전체 반영` disabled + 진행 중인 요리가 있어 전체 반영할 수 없다는 설명
- `기존 계획 유지`는 선택 가능

409 stale/claim after submit:
- dialog remains open; success navigation is forbidden
- latest-impact recheck CTA receives focus

empty future impact:
- 미래 계획 0개와 completed/incomplete counts를 명시
- server preview/token은 생략하지 않고 동일 두 strategy contract를 유지
```

### `PLANNER_WEEK → COOK_MODE` start / version dispatch

```text
[요리 시작]
    ↓ submit once
[session 생성 중…]  CTA disabled, current screen retained
    ├─ error/409 → inline explanation + retry; no COOK_MODE navigation
    └─ success(session_id, contract_version)
          ├─ legacy_v1  → existing v1 reader/UI
          └─ snapshot_v2 → v2 immutable snapshot reader/UI

snapshot_v2 read:
- loading: existing whole-board skeleton; cancel/complete disabled until state known
- error/404/409: no mutable recipe fallback and no cross-version parser retry
- cancelled/completed: read-only terminal state
- creation flag off: existing session read/cancel drain remains available
```

## Design / Accessibility Authority

- UI risk: high-risk `RECIPE_DETAIL` anchor extension plus `PLANNER_WEEK` start transition and `COOK_MODE` contract dispatch.
- Anchor screens: `RECIPE_DETAIL`, `PLANNER_WEEK`. High-risk required non-anchor surface: `COOK_MODE`.
- Stage 1 artifact: the two state wireframes above; no date-checkbox or alternate action is added.
- Design critic: required before Stage 4 implementation. It reviews choice hierarchy, loading/error fail-closed behavior, active-claim disabled explanation, latest-preview focus, start-before-navigation prohibition and v1/v2 non-mixing.
- Stage 4 evidence: 390px and 320px RECIPE_DETAIL dialog states; PLANNER_WEEK start pending/error/success; COOK_MODE legacy/v2 loading/read-only/error/rollback-drain states. No horizontal overflow, clipped action, keyboard occlusion or focus loss.
- product-design-authority: screenshot or Figma evidence and a canonical `.md` report are required before Design Status becomes confirmed. PNG/Figma files are referenced by the report, not listed as authority report paths.
- dialog uses accessible name/description, one radio group with two choices, disabled reason text association, focus trap/restore, error focus and 44px targets.

## Design Status

`temporary`. Stage 1 locks official states and evidence requirements only. Implementation screenshots/Figma, independent design critique and product-design-authority approval are pending.

## Primary User Path

1. An owner edits a private recipe and submits `base_recipe_revision + full draft` for a no-mutation impact preview.
2. Server returns an opaque owner/session-bound token plus future Meal, shopping and active-claim summary; UI offers only `전체 반영 | 기존 계획 유지`.
3. Owner chooses a strategy and submits the identical draft, base revision, token and UUID idempotency key; one RPC revalidates every bound target under common locks.
4. `keep` preserves all existing Meal pins; eligible unclaimed `replace_all` atomically repins future Meals and reconciles incomplete shopping. Any drift/claim leaves everything unchanged and returns to latest preview.

## QA / Test Data Plan

### Stage 1 gate

- this docs PR runs current SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc Vitest, lint, typecheck, dependency audit and diff check only.
- PostgreSQL, Route/RPC, component, E2E, visual/a11y, real DB, remote inventory, seeded-drain and activation commands below are future implementation/integration artifacts and are not claimed executable now.

### Future fixtures

- owners A/B, G1/G2 current/stale/revoked sessions, active/quarantined/deleting/maintenance lifecycle and same UUID recreated identity.
- owner-private recipe revisions with zero/one/multiple future Meals, past and `cook_done` Meals, equal/different content pins, completed/incomplete shopping and active claim/session tuples.
- preview fresh/expired/consumed, same draft/different draft, base revision drift, Meal revision add/change/delete and claim added/removed/session changed.
- checked/pantry-excluded/new/orphan shopping items across one and multiple recipe IDs, including deterministic UUID lock order.
- planner same-content multi-Meal, mixed recipe/content, stale revision, active claim; standalone active/deleted/stale recipe fixtures.
- legacy_v1, seeded snapshot_v2 in-progress/cancelled/completed and cross-version IDs with creation flag on/off.

### Future evidence

- Vitest route/service/component tests for preview/PATCH strategies, stale/claim errors, start-before-navigation, dispatch and cancel replay.
- PostgreSQL fresh/replay tests for preview RLS/ACL, token hash/expiry, common lock order, same-Meal claim concurrency, idempotency and transaction rollback.
- real local Supabase two-owner tests with before/after digests for every denied/stale path and deterministic shopping reconciliation.
- E2E for custom save/fork, keep/replace-all, stale preview, active claim, same-Meal concurrent start, cancel/restart, completed shopping read-only and historical snapshot invariance.
- 390px/320px component/visual/a11y evidence plus design critic and product-design-authority report.
- merged-exact-SHA remote read-only function/ACL/RLS/policy/constraint/capability inventory; no unmerged remote migration.

## Key Rules

- preview token binds owner, generation, exact session, recipe, base revision, canonical draft hash, target Meal revisions and active claim/session tuple.
- client never manufactures token contents, target hash, owner, current revision or eligibility.
- one final RPC holds common locks and commits recipe, Meal, shopping, session and claim effects atomically; lock-only RPC + REST DML is forbidden.
- keep never repins; replace-all silently excludes no claimed target.
- completed shopping and historical/cook-done/completed records are immutable.
- planner start copies existing Meal content; standalone alone pins current recipe content.
- v1/v2 namespaces, parsers and readers remain explicit and non-interchangeable.
- #7 owns dormant start/cancel/read and dispatch, not exact-pantry complete or activation.
- external personal writes and v2 start remain off until #8's R/R+1 gate and R+2 joint activation.

## Delivery Checklist

- [ ] preview uses the PATCH canonicalizer and stores an owner/generation/session-bound opaque token hash <!-- omo:id=delivery-future-preview;stage=2;scope=backend;review=3,6 -->
- [ ] target-set hash includes exact Meal revisions and active claim/session tuples <!-- omo:id=delivery-future-target-hash;stage=2;scope=backend;review=3,6 -->
- [ ] final PATCH revalidates preview under one common-lock RPC and stale input changes nothing <!-- omo:id=delivery-future-patch-atomic;stage=2;scope=backend;review=3,6 -->
- [ ] keep preserves every Meal pin and replace-all repins only eligible unclaimed future Meals <!-- omo:id=delivery-future-strategies;stage=2;scope=backend;review=3,6 -->
- [ ] claimed replace-all returns exact 409 without silently excluding a target <!-- omo:id=delivery-future-claim-block;stage=2;scope=backend;review=3,6 -->
- [ ] recipe/Meal/shopping/start writers use one-RPC common lock order with multi-recipe UUID sorting <!-- omo:id=delivery-future-writer-locks;stage=2;scope=backend;review=3,6 -->
- [ ] incomplete shopping reconcile preserves states and completed shopping stays read-only <!-- omo:id=delivery-future-shopping;stage=2;scope=backend;review=3,6 -->
- [ ] grouping separates the same recipe ID by content snapshot ID <!-- omo:id=delivery-future-grouping;stage=2;scope=shared;review=3,6 -->
- [ ] planner start copies Meal pin/servings and creates one active claim per Meal exactly once <!-- omo:id=delivery-future-planner-start;stage=2;scope=backend;review=3,6 -->
- [ ] standalone start pins current content under recipe revision lock <!-- omo:id=delivery-future-standalone-start;stage=2;scope=backend;review=3,6 -->
- [ ] v2 read/cancel use immutable content, release claims and replay without cross-version fallback <!-- omo:id=delivery-future-v2-drain;stage=2;scope=backend;review=3,6 -->
- [ ] UI waits for session ID/version and dispatches v1/v2 without parser or body-shape inference <!-- omo:id=delivery-future-dispatch;stage=4;scope=frontend;review=5,6 -->
- [ ] impact dialog loading/empty/claim/stale states and two-choice hierarchy are accessible <!-- omo:id=delivery-future-impact-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px visual/a11y and independent design critic/authority reviews pass <!-- omo:id=delivery-future-design-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] past/cook-done/completed shopping/session/log history remains snapshot-stable <!-- omo:id=delivery-future-history;stage=2;scope=shared;review=3,6 -->
- [ ] v2 creation/personal writes stay dark and existing seeded v2 drain survives rollback <!-- omo:id=delivery-future-dark-release;stage=2;scope=shared;review=3,6 -->
- [ ] exact-pantry complete and activation remain #8 boundaries <!-- omo:id=delivery-future-successor-boundary;stage=2;scope=shared;review=3,6 -->
- [ ] local, PostgreSQL, E2E, real DB, remote, security and current-head evidence are green <!-- omo:id=delivery-future-verification;stage=2;scope=shared;review=3,6 -->
