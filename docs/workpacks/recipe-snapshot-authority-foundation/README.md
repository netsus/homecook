# recipe-snapshot-authority-foundation

> Stage 1 contract lock. Approved master plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines). Official baseline: requirements v1.7.22, screens v1.5.28, flow v1.3.25, DB v1.3.23, API v1.2.27.

## Goal

mutable recipe current가 바뀌어도 기존 Meal·요리 세션·batch·식사 기록이 사용 당시 제목·재료·조리법과 exact nutrition snapshot을 일관되게 해석하도록 immutable content snapshot을 논리 authority로 만든다. content에는 영양 vector를 복사하지 않고 기존 `recipe_nutrition_snapshots` ID만 pin하며, Meal direct nutrition pointer는 rollback-safe 3단계 전환 뒤 제거한다.

## Branches

- Stage 1 docs: `docs/recipe-snapshot-authority-foundation`
- Stage 2 backend/data: `feature/be-recipe-snapshot-authority-foundation`
- Stage 4 existing-consumer compatibility: `feature/fe-recipe-snapshot-authority-foundation`
- Release train: B. 구현 선행조건은 #3 runtime과 기존 recipe nutrition snapshot release다. 이 Stage 1 docs PR은 승인된 Stage 0 순서대로 먼저 작성한다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, implementation owner, security/DB reviewer와 five-axis reviewer는 서로 다른 Codex 세션을 사용하며 Claude는 사용하지 않는다.

## In Scope

- additive `recipe_content_snapshots` authority
  - nullable `owner_user_id`, `recipe_id NOT NULL ON DELETE RESTRICT`, title, base servings, schema version, canonical ingredients/product provenance, steps, content hash, created time
  - nullable exact `recipe_nutrition_snapshot_id ON DELETE RESTRICT`만 영양 pin으로 저장하고 vector/status/warnings/sources를 복제하지 않음
  - `UNIQUE NULLS NOT DISTINCT (recipe_id, content_hash, recipe_nutrition_snapshot_id, schema_version)`로 동일 pin 재사용
  - 같은 content라도 nutrition snapshot ID가 다르면 별도 identity; payload는 생성 뒤 불변
- existing `recipe_nutrition_snapshots` contract preservation
  - nullable owner만 additive하고 `recipe_id NOT NULL`, `ON DELETE RESTRICT`, ordinary unique `(recipe_id,input_hash,calculation_version)`, current partial unique `(recipe_id) WHERE is_current` 유지
  - 기존 writer의 predicate 없는 `ON CONFLICT (recipe_id,input_hash,calculation_version)` 유지; partial unique/detach 경로 금지
  - `base_servings`, nutrient status/quality, scalable/fixed vectors, warnings와 sources가 유일한 recipe nutrition authority
- snapshot ownership and lifecycle
  - private content/nutrition owner는 recipe owner와 같고 두 snapshot의 recipe ID도 같아야 함
  - public/shared pair는 `owner_user_id=NULL` 공용 row이며 사용자별 복사본을 만들지 않음
  - ordinary application/service-role direct update/delete 차단; nutrition current switch는 기존 계산 writer 내부만 허용
  - soft-deleted recipe는 신규 snapshot/current 전환을 거부하되 기존 anchored history는 보존
  - hard delete는 session-bound account cleanup의 transaction-local exact-owner guard에서 private dependency를 먼저 지울 때만 허용
- Meal content authority의 3단계 전환
  - additive nullable `recipe_content_snapshot_id`, `recipe_content_snapshot_origin=created|legacy_backfill`, server-owned monotonic revision
  - expand: content-aware reader 선배포 후 existing/future `registered|shopping_done` direct N을 바꾸지 않는 idempotent content backfill
  - compatibility mirror: content가 있으면 direct N은 null 또는 content.N과 같은 DB-derived read-only mirror; mismatch/client mutation 차단, content-null legacy만 direct fallback
  - contract: current+immediate-previous content-aware, 한 호환 release old-shape/direct-only write 0, backfill/pair mismatch 0 뒤 direct N/origin null과 final XOR; rollback floor보다 오래된 binary 금지
- persisted cooking/batch foundation
  - `cooking_sessions.contract_version=legacy_v1|snapshot_v2`와 nullable v2 fields를 additive 배포하고 기존 row를 `legacy_v1`로 보존
  - `snapshot_v2`에만 planner/standalone kind, recipe/content snapshot, cooking servings와 standalone expected recipe revision을 conditional하게 요구하고 content pin은 immutable
  - planner `cooking_session_meals.meal_revision_snapshot`과 session recipe/content 일치, planner 1개 이상/standalone 0개 association shape
  - 신규 `cooking_session_meal_claims.meal_id` PK와 session/owner/claimed_at으로 Meal당 active attempt 최대 1개를 dark schema로 보장
  - F0 `mutation_idempotency_keys`를 generation-scoped v2 start/cancel/complete scope와 durable result reference에 사용하고 same key+payload exact-once/different payload conflict를 잠금
  - remote preflight는 orphan/mixed recipe/servings를 보고하되 fabricated v2 backfill을 만들지 않음
  - `leftover_dishes` v2는 content snapshot 하나만 영양 pointer로 사용하며 batch direct nutrition snapshot FK를 만들지 않음
- read and compatibility regression
  - Meal/planner/planner-nutrition compatibility, shopping, existing cooking/history와 leftover/batch projection은 content가 있으면 content만 authority로 사용
  - content-null legacy만 기존 direct nutrition pointer를 fallback하고 current recipe/current nutrition으로 과거를 재계산하지 않음
  - `legacy_backfill`은 direct N을 보존하고 `당시 상세 내용 미보존` provenance를 유지

Schema Change:
- [ ] 없음
- [x] 있음 — 기존 migration을 수정하지 않고 official DB v1.3.23의 content snapshot, Meal transition, snapshot-v2 conditional columns와 leftover content pointer를 additive migration으로 추가한다.

## Out of Scope

- public fork/editor/save/update/soft-delete Route와 impact preview/write core (#5/#6)
- future Meal propagation, replace-all/keep, shopping reconcile와 snapshot-v2 session-attempt start/cancel/complete RPC behavior·activation (#7; #4의 dark claim/idempotency schema를 소비)
- cooked batch weight ledger, lifecycle/quantity events와 exact pantry completion (#8)
- meal-log core/UI와 exact consumption calculation (#9/#12)
- PLANNER_WEEK shell, COOK_MODE weight UI, RECIPE_DETAIL CTA 또는 새 화면/layout (#5/#10/#11)
- 기존 v1 `/sessions` shape 제거, new-v2 creation activation 또는 strict v1 tombstone
- recipe nutrition vector를 content/batch/Meal에 복사하거나 missing을 0으로 채우기
- existing nutrition snapshot FK/unique/current index/ON CONFLICT를 partial/detached 계약으로 변경
- unmerged migration의 remote 적용 또는 production/staging data write

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| Stage -1 security hotfix + closeout | merged/deployed | mutation authorization predecessor complete |
| official contract PR #1072 | merged | v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 authority available |
| existing recipe nutrition snapshot release | merged | immutable nutrition authority, writer conflict and Meal direct pin baseline available |
| `recipe-visibility-read-hardening` Stage 1 docs PR #1077 | merged | #3 contract documented; #3 runtime remains Stage 2 predecessor |
| `product-ingredient-link-foundation` Stage 1 docs PR #1076 | merged | Train B product relation docs available for integrated QA |

> Roadmap status is `docs` while workflow lifecycle remains `planned`. Stage 2 starts only after #3 runtime and the existing nutrition baseline are merged and green; this Stage 1 docs merge does not activate schema or reader cutover.

## Backend First Contract

### Single snapshot authority

- content snapshot stores immutable recipe content and only the nullable exact nutrition snapshot ID. It never stores `nutrient_status_json`, scalable/fixed vectors, quality, warnings, sources or a second calculated nutrition payload.
- `recipe_nutrition_snapshots` remains the sole nutrition calculation authority. Selected/cooking servings use `scalable[key] × cooking_servings / base_servings + fixed[key]`; fixed is not multiplied and unavailable/missing keys are not invented as 0.
- content without a nutrition ID is explicitly nutrition-unavailable. Readers and later batch completion do not switch to the current recipe nutrition snapshot as a fallback.
- the dedupe key includes nutrition snapshot ID with NULLS NOT DISTINCT. Same recipe/content/schema plus the same nutrition pin reuses identity; a different nutrition pin creates a different immutable content snapshot.
- product selection provenance retains product ID/name/brand and the exact product nutrition version selected with canonical ingredient/amount/unit. It does not copy product nutrition vectors into content.

### Ownership, immutability and delete boundary

- a private pair requires content owner = nutrition owner = recipe owner and both snapshot recipe IDs = the parent recipe ID. Any owner/recipe mismatch fails without partial rows.
- public/shared content and nutrition use owner-null shared rows. Account cleanup cannot re-own, duplicate per user or delete those rows.
- normal application, authenticated, service-role direct DML and generic cleanup cannot update/delete snapshots. Existing nutrition current switch remains confined to the allowlisted calculation writer.
- personal recipe soft delete only sets `recipes.deleted_at`; it preserves recipe/content/nutrition/history FKs and blocks new snapshot creation or current transition. An internal restore reuses the same immutable identity instead of editing payload.
- account cleanup alone may hard-delete private snapshots under the F0 session-generation and transaction-local exact-owner guard. The exact chain is `Meal active event pointer → quantity/lifecycle event → meal-log entry + ordinary non-image idempotency key → cooking_session_meal_claim → cooking_session_meal → cooking_session → Meal → leftover_dishes batch → private content snapshot → private nutrition snapshot → private recipe → pantry/product-planner private-product references → private product link/version/profile/product`. It never changes `meals.leftover_dish_id` to `SET NULL` as a shortcut.

### Meal expand, compatibility and contract

- content-aware readers deploy before any backfill. With a content pin, title/ingredients/steps/nutrition all derive from that content and its exact nutrition ID; direct N is never the competing logical authority.
- expand backfills only eligible `registered|shopping_done` Meal rows idempotently. Existing direct N is preserved exactly. If historical content is unavailable, the current recipe projection is marked `legacy_backfill` and `당시 상세 내용 미보존`; N is not changed.
- compatibility permits direct N only when null or equal to `content.recipe_nutrition_snapshot_id`. The DB derives the rollback mirror and origin; client or old Route selection/change and content/direct mismatch fail at commit.
- a content-null legacy row may continue direct-N fallback. No content-aware row may fall back to direct N, current recipe content or current nutrition after a read error or mismatch.
- contract begins only after current and immediate-previous releases are content-aware, old-shape/direct-only writes are zero for one full compatibility release, and backfill/pair mismatch is zero. Controlled migration then nulls direct N and its origin.
- final checks are `content non-null → direct N/direct origin null` and `content null → content origin null`. After validation, the rollback floor is the content-aware release and older direct-only binaries/migrations are blocked.

### Persisted session and batch pin

- `cooking_sessions` is the shared persisted attempt row for planner and standalone flows. #4 adds conditional snapshot-v2 columns, `cooking_session_meals` revision/matching constraints, the active-claim PK and generation-scoped idempotency scope as dark schema; #7 later owns start/cancel/complete RPC behavior and activation.
- existing/orphan-capable rows remain `legacy_v1`. A migration cannot infer or fabricate v2 content, servings, kind or recipe revision from incomplete history.
- planner snapshot-v2 requires at least one session-meal row, and every linked Meal has the same recipe/content with its start-time `meal_revision_snapshot`; standalone requires zero session-meal rows.
- `cooking_session_meal_claims.meal_id` is the concurrency authority for at most one active attempt per Meal. The claim row and F0 generation-scoped idempotency key/result shape are installed before #7 can atomically create/consume/release them.
- same owner/session generation + operation scope + key + payload maps to one durable start/cancel/complete result; a different payload for the same key is a conflict. No UUID-only or cross-generation replay may claim a Meal or duplicate pantry/batch effects.
- a snapshot-v2 content pin is immutable after start. Planner later consumes the Meal pin; standalone later pins current content under recipe revision lock. Completion consumes session ID rather than rebuilding from mutable recipe current.
- a v2 `leftover_dishes` batch stores one content snapshot pin and cooking servings. There is no direct batch nutrition snapshot ID; #8 may add weight/event state but cannot create a competing nutrition pointer.

### Reader and release integration

- official `GET /meals`, planner Meal projection and compatibility `GET /planner/nutrition` become content-aware before mirror/backfill changes. Implementation routes keep the repository `/api/v1` prefix where present.
- shopping preview/detail, existing cooking/history and later batch/meal-log readers must consume the same Meal/content authority. A regression test fails if any content-pinned row reads raw Meal direct N or mutable current recipe data.
- `GET /planner/nutrition` remains for one compatibility release even though the new planner UI will stop calling it; removal requires a separate tombstone contract.
- Train B closeout jointly rechecks #3 Storage cleanup/outbox and #2 pantry effective-ingredient projection, but #4 does not reimplement or weaken either contract.
- remote verification before merge is read-only. Contract/null cutover and production writes run only from a merged exact SHA after the compatibility evidence gate.

## Frontend Delivery Mode

- existing-consumer compatibility only. Content-pinned Meal cards and historical cooking paths keep their pinned title/ingredients/steps/nutrition; `legacy_backfill` provenance remains available for the owning planner UI to render.
- this slice adds no new screen, route, navigation, CTA, layout, servings control or visual hierarchy. PLANNER_WEEK shell is #10, COOK_MODE/session-attempt behavior is #7/#11, and RECIPE_DETAIL edit CTA is #5.
- Stage 4 regression may assert loading/empty/error/read-only and pinned-history behavior, but any visual change stops this slice and moves to the owning workpack/design authority gate.

## Design Authority

- UI risk: `low-risk` data-contract compatibility only
- Anchor screen dependency: existing consumers only; no visual change authorized
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: official high-risk PLANNER_WEEK/COOK_MODE redesign evidence belongs to their owning successors, not this backend foundation.

## Design Status

`N/A`. No new screen or visual-system change. Stage 4 is limited to behavior regression for immutable pinned history and legacy fallback.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.22.md` B/D/J
- `docs/화면정의서-v1.5.28.md` 0-B and nutrition formula compatibility notes
- `docs/유저flow맵-v1.3.25.md` snapshot/Meal migration and release/legacy gate
- `docs/db설계-v1.3.23.md` B/C/D and snapshot/cooking/batch/account-cleanup sections
- `docs/api문서-v1.2.27.md` F/L and existing Meal/planner nutrition contracts
- approved master plan sections 6-1, dependency matrix #4, successor #4, migration plan 9 and test strategy 10

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs only current SOT/workflow/workpack/automation/bookkeeping/doc-gate validators, focused workflow Vitest, lint, typecheck, dependency audit and diff check. GitGuardian and current-head repository workflows are observed separately.
- Stage 2 first adds focused schema/reader/lifecycle/account-delete tests and records RED before migration, trigger, backfill or production reader code.
- planned Stage 2/4/closeout commands, PostgreSQL existing/fresh/replay, compatibility-release telemetry and remote verifier are required future gates, not commands claimed to exist or pass in Stage 1.

### Fixture and matrix

- public owner-null, A private, B private, soft-deleted private, same-content/same-N, same-content/different-N, nullable-N unavailable and owner/recipe mismatch fixtures.
- direct snapshot update/delete by anon/authenticated/service-role, allowlisted nutrition current switch and account-cleanup-only exact-owner deletion matrix.
- Meal content/direct pairs: content+equal N, content+null N, content+mismatched N, direct-only legacy, no-content/no-direct, created and legacy_backfill origins.
- expand reader-before-backfill, N-preserving `registered|shopping_done` backfill, repeated backfill idempotency, current/immediate-previous compatibility mirror and contract null/XOR fixtures.
- 10 cooking/base servings fixture proves scalable ratio plus fixed once; partial/unavailable and missing-not-zero remain intact.
- snapshot-v2 conditional session fields, planner session-meal match/revision, active claim PK, generation-scoped idempotency, legacy orphan/mixed preflight report-only, immutable pin and leftover content-only/no-direct-N schema fixtures.
- concurrent planner attempts claim one Meal once; same key replay returns one durable result, different payload/cross-generation replay fails, and no duplicate downstream side effect is possible before #7 activation.
- exact account cleanup chain `event pointer → event → meal log/non-image idempotency → claim → session-meal → session → Meal → batch → private content → private nutrition → private recipe → private-product references/link/version/profile/product` deletes private rows and preserves public/shared rows; concurrent ordinary delete remains denied.

### Release evidence

- old-shape/direct-only write telemetry is zero for one full compatibility release and backfill/pair mismatch is zero before contract/null.
- current and immediate-previous releases read content-aware rows and direct-only legacy fallback; rollback smoke before null and rollback-floor rejection after null are both recorded.
- local existing/fresh/idempotent replay, remote schema/constraint/trigger/grant inventory and merged-exact-SHA read-only evidence are required.
- Train B integration confirms #3 Storage cleanup outbox remains terminal-safe and #2 pantry effective ingredient readers remain green without adding them to #4 schema.

## Key Rules

- content snapshot is recipe content authority; `recipe_nutrition_snapshots` is the one nutrition vector authority.
- content pin wins whenever present. Direct nutrition fallback is legacy-content-null only.
- nutrition `recipe_id` stays NOT NULL/RESTRICT and existing unique/current/ON CONFLICT contracts stay intact.
- private snapshot owner and recipe must match; public/shared snapshots are owner-null and survive private cleanup.
- soft delete preserves history; only guarded account cleanup may hard-delete private snapshots and recipe.
- Meal transition order is expand reader → N-preserving backfill → DB-derived mirror → one-release zero evidence → contract null/XOR → rollback floor.
- batch/session use immutable content pins and never add a second nutrition pointer.

## Primary User Path

1. A Meal or cooking attempt pins an immutable content snapshot for the selected recipe state.
2. The content snapshot holds title, ingredients/product provenance and steps plus the exact nutrition snapshot ID, not a copied nutrition vector.
3. Existing Meal/planner/shopping/history readers resolve content when present; only content-null legacy rows use the direct nutrition fallback.
4. A later recipe edit or nutrition current switch does not rewrite the pin, while personal soft delete still leaves anchored history readable.
5. Guarded account cleanup removes private dependents and snapshot pair in FK order but preserves owner-null public/shared snapshots.

## Delivery Checklist

- [ ] content snapshot schema and exact nutrition-ID-only authority are additive and replay safe <!-- omo:id=delivery-snapshot-content-schema;stage=2;scope=backend;review=3,6 -->
- [ ] existing nutrition NOT NULL/RESTRICT, ordinary unique, current partial unique and predicate-free ON CONFLICT remain unchanged <!-- omo:id=delivery-snapshot-nutrition-contract;stage=2;scope=backend;review=3,6 -->
- [ ] private owner/recipe pair and owner-null public/shared dedupe constraints fail closed <!-- omo:id=delivery-snapshot-owner-shape;stage=2;scope=backend;review=3,6 -->
- [ ] direct update/delete stay blocked and only calculation current-switch/account-cleanup exact exceptions work <!-- omo:id=delivery-snapshot-immutability;stage=2;scope=backend;review=3,6 -->
- [ ] soft delete preserves pins and blocks new snapshots while guarded account cleanup deletes private rows in FK order <!-- omo:id=delivery-snapshot-delete-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] content-aware readers deploy before idempotent N-preserving registered/shopping_done backfill <!-- omo:id=delivery-snapshot-expand;stage=2;scope=backend;review=3,6 -->
- [ ] compatibility mirror is DB-derived null-or-equal and content-null legacy is the only direct fallback <!-- omo:id=delivery-snapshot-mirror;stage=2;scope=backend;review=3,6 -->
- [ ] one-release zero/mismatch evidence gates contract null/XOR and content-aware rollback floor <!-- omo:id=delivery-snapshot-contract-floor;stage=2;scope=shared;review=3,6 -->
- [ ] snapshot-v2 session conditional fields preserve legacy rows without fabricated backfill <!-- omo:id=delivery-snapshot-session-foundation;stage=2;scope=backend;review=3,6 -->
- [ ] planner session-meal match/revision, Meal claim PK and generation-scoped v2 idempotency dark schema are concurrency-safe before #7 activation <!-- omo:id=delivery-snapshot-session-concurrency;stage=2;scope=backend;review=3,6 -->
- [ ] leftover/batch uses immutable content-only nutrition authority with no direct nutrition FK <!-- omo:id=delivery-snapshot-batch-authority;stage=2;scope=backend;review=3,6 -->
- [ ] scalable cooking/base plus fixed-once, partial/unavailable and missing-not-zero fixtures pass <!-- omo:id=delivery-snapshot-nutrition-formula;stage=2;scope=backend;review=3,6 -->
- [ ] existing consumers preserve pinned history and legacy fallback without new visual scope <!-- omo:id=delivery-snapshot-consumer-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] local existing/fresh/replay and merged-exact-SHA remote read-only evidence are green <!-- omo:id=delivery-snapshot-verification;stage=2;scope=shared;review=3,6 -->
