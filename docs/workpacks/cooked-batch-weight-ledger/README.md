# Cooked Batch Weight Ledger

## Goal

snapshot-v2 요리 완료를 session에 pin된 content/servings와 exact pantry row 선택에 결합하고, cooked batch의 완성·잔량 중량과 weighted/unweighed lifecycle을 append-only event + row-lock RPC authority로 만든다. 기존 leftover reader와 v1 completion을 호환하면서 R/R+1 flag-off drain을 증명한 뒤에만 R+2에서 personal recipe와 v2 creation을 공동 활성화한다.

## Stage 1 Contract Lock

- requirements: `docs/요구사항기준선-v1.7.29.md`
- screens: `docs/화면정의서-v1.5.33.md`
- flow: `docs/유저flow맵-v1.3.31.md`
- DB: `docs/db설계-v1.3.31.md`
- API: `docs/api문서-v1.2.36.md`

사용자가 2026-08-08 명시 승인한 최소 Contract Evolution은 API `v1.2.36`에서 완료됐다. 이 workpack은 새 endpoint나 DB authority를 만들지 않고 공통 owner-only `CookedBatchProjection`, snapshot-v2 complete/batch mutation exact success `data`, `GET /cooked-batches` pagination·legacy null, missing/other-owner의 동일 `404 RESOURCE_NOT_FOUND`와 422/409 구분을 그대로 소비한다. 이 경계를 다시 벗어나는 충돌은 임의 확장하지 않고 새 `Contract Evolution Candidate`로 중단한다.

Stage 2는 current source-of-truth tuple requirements `v1.7.30`, screens `v1.5.34`, Flow `v1.3.32`, DB `v1.3.32`, API `v1.2.37`을 사용한다. API v1.2.37의 `0-CBW` compatibility block은 이 Stage 1 lock의 API v1.2.36 block과 byte-identical이므로 public endpoint/field/status/error 확장 없이 구현한다.

Stage 1은 original internal 1.5 task `019fe0c0…` APPROVE, current-tuple re-lock reviewer task `019fe194-62d9-7ed2-9116-b820873bd48b` APPROVE `P0/P1/P2=0/0/0`, PR #1289 merge `635763041d6420c648e2b55336e6caa9f1f9143c`, closeout task `019fe19e…`로 닫혔다. Stage 2 backend 구현 lineage는 task `019fe1aa-82fd-7602-844e-e050efae93db`이며, base-drift 통합 task `019fe2b2-0ee4-77c3-a829-9ae04bfac07f`가 PR #1292 merge `eb4e878eb1d5b6fe5df00b1edd3a4f42fa472142`의 canonical full-local session refresh authority를 소비했다. Fresh Stage 3를 거친 PR #1291은 `master`에 exact `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1`로 merge됐고, fresh Stage 4 frontend는 이 exact source에서 시작했다. 전체 lifecycle은 `in_progress`, Stage 5/final authority/Stage 6와 approval/verification은 pending이다. #7 broader lifecycle, Manual/server-Mac/OAuth, R/R+1/R+2도 기존 pending 상태를 유지한다.

## Branches

- Fresh Stage 1 re-lock docs: `docs/cooked-batch-weight-ledger-stage1-relock`
- Stage 2 backend/DB local successor: `feature/cooked-batch-weight-ledger-stage2-eb4e-successor` (Draft PR #1291 remote branch는 `feature/cooked-batch-weight-ledger-stage2-current` 유지)
- Preserved held lineage: `feature/be-cooked-batch-weight-ledger` exact `3c5b6760ce8c9a8b51205c755f9f92d57177ca00`; rebase/cherry-pick/force/edit 금지
- Stage 4 functional COOK_MODE integration: `feature/cooked-batch-weight-ledger-stage4-frontend-current` (Draft PR #1311; #1310 superseded without force-push)
- Release train: D. 구현 선행조건은 #7 runtime과 merged `cook-mode-whole-board`다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, implementation owner, security/DB reviewer, five-axis reviewer, design critic, product-design-authority reviewer, release verifier와 closeout reviewer는 서로 다른 Codex 세션을 사용한다. Claude는 사용하지 않는다.

## In Scope

- snapshot-v2 complete
  - `POST /cooking/session-attempts/{id}/complete` requires Authorization and UUID `Idempotency-Key`.
  - request uses exact owner `consumed_pantry_item_ids` plus exact-one `weight_action=set_finished_weight|weigh_later`; set requires positive `finished_weight_g`, later requires g null.
  - product pin accepts only the same exact product pantry row. Generic ingredient pin accepts a generic row or product row whose active approved primary `represents` relation projects the same effective ingredient.
  - duplicate/missing/other-owner/mismatched pantry rows fail without deletion. Only selected rows are removed; equivalent unselected rows remain.
  - one transaction commits pantry deletion, immutable content-only batch, initial ledger/projection, session terminal result, claim consumption, planner Meal transition, cook count and cooking-completed XP exactly once.
  - `consumed_pantry_item_ids` may remain `[]`; no eligible pantry candidate is a valid empty selection, never a reason to guess or auto-select an equivalent row. Completion enablement depends on an explicit valid weight action, not on selecting at least one pantry row.
- cooked batch authority
  - v2 batch pins `recipe_content_snapshot_id` and cooking servings; no direct nutrition snapshot FK or duplicated nutrition vector/status/source is added.
  - `weight_status=known|missing|unrecoverable`, `batch_status=available|depleted`, and depleted reason distinguishes `consumed|discarded|mixed|consumed_unweighed|discarded_unweighed|mixed_unweighed`.
  - known requires `0 <= remaining_weight_g <= finished_weight_g`; missing/unrecoverable require both weight columns null. available requires reason null; depleted requires reason non-null.
  - batch nutrition resolves content→exact immutable nutrition snapshot and uses `scalable × cooking_servings/base_servings + fixed`. Missing nutrients remain partial/unavailable, never zero-filled.
- weight lifecycle and append-only ledger
  - `PATCH /cooked-batches/{id}/weight` supports exact-one set-finished-weight or mark-unrecoverable with required key and expected revision.
  - delayed set is allowed only for missing+available with zero quantity/lifecycle events and means original food-only finished weight, never current remainder.
  - missing→unrecoverable is idempotent, append-only and irreversible. Later weight input, known restore or marked event reversal returns `409 WEIGHT_UNRECOVERABLE` with zero change.
  - `cooked_batch_quantity_events` supports `consumed|discarded|adjustment|marked_unrecoverable|closed_unweighed|reversal`; update/delete are denied and account cleanup alone hard deletes after links are cleared.
  - every mutation row-locks the batch, checks expected revision and operation registry, appends events, full-replays active events, then verifies cached projection and checksum.
- batch mutation APIs
  - discard is known+available negative event; it cannot exceed remaining and zero depletion reason derives from all active consumed/discarded events.
  - adjustment is known+available signed correction with reason and must leave `0 < remaining <= finished`; it cannot deplete or reopen a batch.
  - close-unweighed is missing/unrecoverable+available with `consumed|discarded|mixed` reason, null delta and no meal-log/nutrition entry.
  - `cancel_current` can reverse only the current active terminal `closed_unweighed` event when no later event exists. It cannot reverse marked-unrecoverable.
- compatibility reader and projection
  - `GET /cooked-batches.items[]`, complete `cooked_batch`, mutation `batch`는 API v1.2.36의 exact 15-key owner-only `CookedBatchProjection` 하나를 공유한다.
  - complete success는 exact 8-key data, batch mutation success는 exact 3-key `{ action, batch, event_id }`, list는 exact `{ items, next_cursor, has_next }`를 반환하고 same-key replay는 최초 status/data를 재생한다.
  - list default는 `availability=loggable`, limit 20/max 50, `cooked_at DESC,id DESC` opaque cursor다. 다른 owner row는 item/cursor boundary 모두에서 제외한다.
  - existing `/leftovers` and every server reader move first to `batch_status/depleted_reason/weight_status` authority.
  - legacy `status=eaten` compatibility projection is true only for `consumed|consumed_unweighed`; discard/mixed states are never rendered as eaten.
  - consumed/consumed_unweighed first depletion sets eaten/auto-hide and grants `leftover_eaten:{batch_id}` once. Reversal clears eaten/auto-hide but neither retracts XP/activity nor enables a second award.
  - old leftover rows keep nullable content/weight and legacy status compatibility. No migration invents grams from servings.
- functional COOK_MODE completion
  - v2 pantry candidates show actual pantry product name/brand and exact row identity, not only a generic ingredient label.
  - user selects the actual used rows and chooses `완성 직후 음식 전체 중량` or `나중에 입력`; container weight is excluded and current remainder is not accepted.
  - duplicate submit displays the stored first result and does not repeat pantry/batch/cook-count/XP effects.
- phased release
  - #8 merge enables flag-off dormant release R, then R+1 repeats seeded-v2 read/cancel/complete drain on current+immediate-previous UI while new personal/v2 creation remains zero.
  - only R+2 jointly enables `personal_recipe_v2` and `snapshot_v2_creation`.
  - rollback blocks new v2 start/personal mutation but preserves existing v2 read/cancel/complete and rows.

Schema Change:
- [ ] 없음
- [x] 있음 — additive `leftover_dishes` content/weight/revision/read-model fields, `cooked_batch_quantity_events`, operation registry/guards/RPCs and compatibility projections. Existing migration files are not rewritten.

## Out of Scope

- meal-log entry schema/API, cooked-batch consumed entry pointer, event-linked PATCH/DELETE and day aggregates (#9/#12)
- PLANNER_WEEK shell/navigation (#10)
- LEFTOVERS full visual redesign, delayed-weight/unrecoverable/discard/adjust UX polish, container-weight helper and final responsive/a11y completion (#11)
- v1 endpoint/body/response/parser removal or strict tombstone; optional key telemetry must complete before 428 and final legacy compatibility belongs to #13
- arbitrary current remaining weight as original finished weight, servings→grams inference or nutrition recalculation from mutable recipe current
- generic “reopen” action, marked-unrecoverable reversal, event update/delete or adjustment-to-zero depletion bypass
- discarded/mixed batch as eaten, meal-log creation for unweighed closure, XP retraction or repeat award after reversal
- new direct nutrition pointer, client-computed nutrition/projection/status, authenticated direct protected-column UPDATE
- existing legacy row fabricated snapshot/weight backfill
- official contract에 없는 endpoint, field, status, reason, error, screen or client authority
- Stage 1 docs PR에서 production code, migration, server-production/rehearsal DB mutation or capability activation

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| historical contract base PR #1072 | merged | superseded baseline; active authority is the current tuple in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` |
| `recipe-content-snapshot-future-propagation` #7 runtime | merged predecessor | PR #1281 exact head `aab9a65e6123e3134478842971765ad3aa737d6a` merged as `2173737e8ea2eec2297e1cc0227ce4f2c27c50b9`; v2 start/cancel/read, immutable session pin, dispatch and owner entrypoint runtime are present. Its broader lifecycle deliberately remains `in_progress / needs_revision / pending`: Manual/server-Mac/OAuth evidence, #8 R/R+1 gate and R+2 activation are still open. |
| `recipe-snapshot-authority-foundation` | runtime merged, lifecycle open | content-only batch/session authority is present; activation and remaining Manual Only evidence are not inherited as complete by #8 |
| `product-ingredient-link-foundation` | runtime merged | approved effective-ingredient relation is available for generic pin pantry validation |
| `cook-mode-whole-board` | merged predecessor | PR #711 exact head `55b93ad7d29cfa8cba19e7942b18e6275fdc986a` merged as `2f8569cb56a53e9508d8d9571b94b260ec0bce73`; #8 extends that actual whole-board without reopening its lifecycle |
| `meal-log-core` #9 | successor | owns linked consumed meal entry and arbitrary-order entry-specific reversal |
| `cooked-batch-weight-ui` #11 | successor | owns final LEFTOVERS/weight UI design/accessibility without duplicating mutations |

> Exact runtime predecessors are merged, but predecessor lifecycle and activation projections are not falsely closed. #8 Stage 1 gates are approved and the backend Stage 2 lifecycle is `in_progress`; overall approval and verification remain pending until fresh Stage 3 and current-head evidence. This PR does not activate v2/personal flags.

## #7 Entrypoint Boundary

- #7의 `GET /recipes/{id}.data.revision`, exact-owner-only `edit_context`, `GET /meals.data.items[].revision`은 recipe/Meal entrypoint의 additive read projection이다.
- 두 server-only capability가 모두 exact-active일 때만 `snapshot_v2` creation consumer를 선택하는 공동 projection도 #7 runtime 경계이며, raw capability name/value/revision은 browser/public API에 노출하지 않는다.
- 이 additive read 계약은 #8 complete request를 확장하지 않는다. #8은 기존 `POST /cooking/session-attempts/{id}/complete` body의 `consumed_pantry_item_ids`, `weight_action`, `finished_weight_g`만 사용하고 기존 wrapper/status/public error를 유지한다.
- creation-off에서는 새 personal edit와 새 snapshot-v2 start가 계속 닫힌다. 다만 seeded/existing `snapshot_v2` session의 read/cancel과 #8 complete drain은 계속 허용된다.

## Completion Transaction

1. Route validates official wrapper/header/body shape and authenticates, but DB RPC is final authority.
2. RPC acquires global shared fence → owner lifecycle → recipe UUID → Meal UUID → session/claim → pantry row UUID → batch/resource row order and verifies exact session generation plus drain/creation capability state.
3. Session row is locked and must be owner, in-progress, `contract_version=snapshot_v2`, immutable content/servings complete authority and not already completed except same-key replay.
4. Payload hash includes ordered exact pantry IDs and weight action/value. Same key+payload returns the durable first wrapper; same key+different payload returns `409 IDEMPOTENCY_KEY_REUSED` with zero effect.
5. Each pantry row is owner/current-generation and matches the pinned recipe ingredient: exact product ID for product pins; generic ID or approved effective link for generic pins. Duplicate/missing/other-owner/mismatch fails the whole transaction.
6. RPC deletes only selected rows, creates one content-only batch and initial weight projection, consumes claims, transitions planner Meals, completes session and writes cook-count/XP effects once.
7. Any error rolls back pantry, batch, ledger, claim, session, Meal, cook-count and XP together. Route never performs a lock RPC followed by REST DML.

## Batch State Machine

| Current | Action | Next | Constraint |
| --- | --- | --- | --- |
| completion + weight | create known | available+known | finished=remaining>0 |
| completion + later | create missing | available+missing | both weights null |
| missing+available, no events | set original finished weight | available+known | positive food-only g; finished=remaining |
| missing+available, no events | mark unrecoverable | available+unrecoverable | append marker; irreversible |
| known+available | consume (#9) or discard | known available/depleted | full replay; bounds checked |
| known+available | adjust | known+available | `0 < post <= finished`; never depletion |
| missing/unrecoverable+available | close unweighed | depleted + `*_unweighed` | null delta; no nutrition/log entry |
| active terminal closed-unweighed | cancel current | available original weight state | only last active closure; no later event |
| unrecoverable | set/restore/reverse marker | unchanged | exact `409 WEIGHT_UNRECOVERABLE` |

### Event invariants

- `(owner, operation_id, ordinal)` is unique; one target event has at most one direct reversal.
- consumed/discarded delta is negative. Weight-bearing reversal stores the exact opposite delta. Adjustment is signed with non-empty reason.
- batch-source consumed event and reversal require the same owner/batch meal-log entry; #9 owns creation/replacement/deletion of that linked pair.
- marked-unrecoverable and closed-unweighed have null delta and no meal entry. Marked-unrecoverable is never reversible.
- active-event replay, not event insertion order or cached status alone, computes remaining/status/reason. Cached projection/checksum mismatch fails.
- event direct UPDATE/DELETE and batch protected-column direct UPDATE fail for authenticated/service REST paths; exact account cleanup guard is the only hard-delete exception.

## Nutrition Authority

- batch stores content snapshot ID and cooking servings only. The content pin resolves exact immutable `recipe_nutrition_snapshot_id`; batch does not store another nutrition FK.
- batch total nutrient is `scalable × cooking_servings/base_servings + fixed`. Fixed is applied once, not multiplied by servings.
- Stage 2 implements this formula in postgres-owned `private.resolve_cooked_batch_nutrition(uuid,uuid)`. It is owner-bound, has a fixed `search_path`, grants no direct application principal, and is consumed by the existing private cooked-batch projection without adding a public RPC or response field.
- The resolver reads only `leftover_dishes.recipe_content_snapshot_id → recipe_content_snapshots.recipe_nutrition_snapshot_id`; a later mutable recipe current never repins an existing batch. Invalid pinned `base_servings` fails closed, while an officially missing nutrition pin remains `unavailable`.
- actual consumed nutrition later is batch total × `consumed_g/finished_weight_g`.
- missing/partial/unavailable remains explicit. A null/invalid nutrition snapshot does not trigger mutable-current recalculation or zero substitution.
- missing/unrecoverable batch cannot produce g meal-log nutrition; unweighed closure creates no meal entry.

## Compatibility and Activation

### Reader-before-writer cutover

1. Add nullable schema, events, RPCs and new read-model projection feature-off.
2. Convert every `/leftovers` and internal reader to new status authority with legacy-row fallback.
3. Prove current/immediate-previous reader compatibility, projection equivalence and rollback before revoking direct update.
4. Convert existing server leftover mutations to row-lock RPCs; then revoke authenticated protected-column UPDATE and activate guard trigger.
5. Only after reader/mutation regressions are green expose discard/adjust/close paths and R/R+1 drain.

### R / R+1 / R+2

- R: feature-off schema/routes/UI adapter; v1 regression and seeded v2 read/cancel/complete drain.
- R+1: current+immediate-previous repeat the same drain; new v2/personal mutation count remains zero. v1 clients send optional stable keys; no-key must remain accepted until one full release reports zero.
- R+2: service owner may jointly enable personal recipe + v2 creation only after both drain releases, legacy compatibility and current-head evidence are green.
- rollback: disable new v2/personal creation only. Existing v2 read/cancel/complete stays available; rows are never deleted because the flag changed.
- v1 key-required 428 may begin only after its approved one-release zero telemetry; route/body/response and `consumed_ingredient_ids` remain unchanged. Strict removal needs separate tombstone.

## Error / No-Write Matrix

| Condition | Public result | Required effect |
| --- | --- | --- |
| missing/invalid auth | existing 401 | mutation 0 |
| missing/other-owner private session, batch or pantry | `404 RESOURCE_NOT_FOUND`, `fields=[]` | mutation 0; owner/state hidden |
| duplicate pantry/body enum·format/pinned mismatch | `422 VALIDATION_ERROR` | no pantry or completion effect |
| same key, different payload | `409 IDEMPOTENCY_KEY_REUSED` | mutation 0 |
| stale revision, lifecycle/state, bounds, later-event/current-closure conflict | `409 CONFLICT` | event/projection unchanged |
| unrecoverable weight set/restore/marker reversal | `409 WEIGHT_UNRECOVERABLE` | event/projection unchanged |
| adjustment reaches 0, exceeds finished or reopens | `409 BATCH_ADJUSTMENT_INVALID` | event/projection unchanged |
| invalid close/cancel target or later event exists | `409 CONFLICT` | event/projection unchanged |
| creation flag off for new v2 | `409 SNAPSHOT_V2_CREATION_DISABLED` | no new session/completion source |
| v1 key absent before zero-telemetry gate | existing v1 behavior | no premature 428 |

All responses retain `{ success, data, error }` and `{ code, message, fields[] }`. Internal reasons cannot replace exact public error codes. 모든 failure는 pantry/batch/event/session/claim/Meal/cook-count/XP zero-write다.

## Stage 1 Wireframe

### `COOK_MODE` snapshot-v2 completion sheet

```text
initial default — no pantry row or weight action is selected automatically
┌ 사용한 팬트리 재료 ──────────────────┐
│ 닭가슴살                             │
│ ☐ 닭가슴살 오리지널                  │  product name
│    하림 · 냉장고 row A                │  brand/location/exact row
│ ☐ 담백 닭가슴살                      │  product name
│    무브랜드 · 냉동실 row B            │  equivalent row remains unselected
│ 양파                                 │
│ ☐ 양파                               │  generic/effective match candidate
│    일반 재료 · 팬트리 row C           │  exact row identity
│                                      │
│ 완성 직후 음식 전체 중량             │
│ ○ 음식만 무게(g)  [      ]           │
│ ○ 나중에 입력                        │
│ 용기/그릇 무게는 제외해 주세요        │
│                                      │
│ [취소]             [요리 완료(비활성)]│
└──────────────────────────────────────┘

loading:
- session/pantry candidates unresolved; complete disabled and selection not guessed

empty/mismatch:
- no eligible exact row: render a calm empty state and keep `consumed_pantry_item_ids=[]`; after the user explicitly chooses a valid weight action, completion remains possible
- another equivalent row is never auto-selected or deleted

submit/error:
- duplicate submit disabled while pending
- 409/422 keeps sheet open, preserves selected row IDs and focuses error/retry
- stored replay result closes once without repeating effects

creation flag rollback:
- no new v2 start, but an existing owner v2 session retains read/cancel/complete UI
```

## Design / Accessibility Authority

- UI risk: high-risk `COOK_MODE` functional completion change. `COOK_MODE` is a required high-risk surface but is not listed as an anchor screen in `docs/design/anchor-screens.md`.
- Stage 1 design source: `ui/designs/COOK_MODE.md` now locks the current official tuple, whole-board shell and #8 exact-row/weight sheet states. The existing `ui/designs/critiques/COOK_MODE-critique.md` and `ui/designs/authority/COOK_MODE-authority.md` are legacy 15a/v1.5.1 evidence and are not reusable.
- Design critic gate: a fresh independent task must write `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ledger-critique.md` and return pass/conditional-pass with blocker 0 before Stage 4 frontend entry.
- Product-design-authority gate: before Stage 4 frontend entry, a different independent task must review the design at 390px and 320px using fresh screenshot/Figma evidence and write `ui/designs/authority/COOK_MODE-cooked-batch-weight-ledger-authority.md` with blocker/major 0. This author does not create or approve either report.
- Pre-Stage 2 design evidence plan: `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png` and `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png`, covering default, multi-row, empty, known, weigh-later, loading, 409/422, replay and creation-off drain states without reusing v1.5.1 images.
- Stage 4 must capture a second fresh implementation evidence pair at 390px/320px for keyboard/focus, 44px targets, safe-area and no-overflow verification; the pre-Stage 2 design approval is not a substitute for implemented-screen review.
- #11 still owns final COOK_MODE/LEFTOVERS visual polish, container calculator and full delayed-weight/unrecoverable UX; it reuses #8 mutations without expanding them.

## Design Status

`pending-review`. Fresh independent pre-Stage-4 critic task `019fe02c-1b12-7d42-bcaf-0d5a02847967` and 390px/320px product-design-authority task `019fe041-2ff4-7f62-9786-79a46aecae0c` passed with `0/0/0`. Stage 4 runtime evidence now exists at desktop `1280x900`, mobile `390x844`, and narrow `320x568`; the author-only `design-qa.md` comparison has actionable `P0/P1/P2=0/0/0`. This is not final product-design authority and does not set `confirmed`; separate Stage 5/final authority/Stage 6 and #11 later visual/accessibility completion remain pending.

## Primary User Path

1. An owner finishes an existing snapshot-v2 session and selects the actual pantry rows used, seeing product/brand identity rather than a guessed generic match.
2. The owner supplies the original food-only finished weight or chooses `나중에 입력`; one idempotent RPC revalidates session/content/pantry/claims.
3. The RPC deletes only selected pantry rows and commits batch, initial ledger, session/Meal/claim/cook-count/XP exactly once; retry returns the stored result.
4. A missing-weight batch may later receive the original finished weight before any event or become irreversible unrecoverable; subsequent quantity/lifecycle changes are append-only row-lock RPCs.

## QA / Test Data Plan

### Stage 1 gate

- this docs PR runs current SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc Vitest, lint, typecheck, dependency audit and diff check only.
- migration/RPC/PostgreSQL/component/E2E/visual/real DB/server-production/local-rehearsal/seeded-drain/activation commands below are future Stage 2/4/release artifacts, not claimed executable now.

### Future fixtures

- owners A/B, G1/G2 active/stale sessions, planner/standalone v2 in-progress/completed/cancelled and legacy_v1 IDs.
- exact product pin; generic row; approved effective-product row; ambiguous/rejected link; duplicate/missing/other-owner/equivalent unselected pantry rows.
- known, missing, unrecoverable, available/depleted and all six depleted reasons; legacy nullable content/weight/status rows.
- event sequences for consume/discard/mixed, adjustment bounds, mark-unrecoverable, closed-unweighed/cancel, reversal and cached checksum mismatch.
- same/different key payload, concurrent complete, concurrent batch mutations, delete/account-cleanup race and flag rollback drain.
- current/immediate-previous UI plus seeded snapshot-v2 rows across R and R+1.

### Future evidence

- Vitest route/service/component tests for exact pantry selection, weight action, replay, state matrix, readers and compatibility.
- PostgreSQL fresh/replay tests for RLS/ACL, protected-column guard, operation/event unique constraints, row locks, replay/checksum and account cleanup.
- real local Supabase two-owner tests with before/after pantry/batch/session/claim/Meal/cook-count/XP digests for every denied/replayed path.
- v1 legacy optional-key/body/response regression and R/R+1 seeded-v2 read/cancel/complete drain with new-write zero telemetry.
- 390px/320px COOK_MODE visual/a11y evidence, design critic and scoped authority report.
- merged-exact-SHA server-production/local-rehearsal read-only function/ACL/RLS/policy/constraint/capability inventory; no unapproved server-production migration.

## Key Rules

- complete authority is session ID + immutable content/servings + exact selected pantry row IDs + weight action.
- only selected matching rows are deleted; equivalent rows remain.
- batch nutrition is content-only and missing stays missing.
- finished weight is original food-only total, never current remainder or servings conversion.
- all quantity/lifecycle changes are append-only events through row-lock RPCs; cached projection is verified by full replay.
- unrecoverable is irreversible; adjustment cannot deplete; generic reopen is forbidden.
- consumed/eaten XP occurs once; discard/mixed never masquerades as eaten.
- legacy rows and v1 contracts remain compatible; direct mutation revocation follows reader/writer cutover.
- R/R+1 flag-off drain precedes R+2 joint activation; rollback preserves existing v2 drain.
- #9 owns meal-log-linked consumed event mutation and #11 owns final visual completion.

## Delivery Checklist

Successor Stage 1 relock evidence is retained at [`evidence/2026-08-04-stage1-relock.md`](./evidence/2026-08-04-stage1-relock.md). It preserves the author/precheck lineage and #7 runtime-versus-lifecycle boundary, records critic/authority pass `0/0/0`, the old-head internal 1.5 `HOLD` findings `I15-B01`/`I15-B02`/`I15-B03`, and dependency repair PR `#1286` merged as `9ff5a920f063af22cd8a8dbee33a603b27c3af57`. Current audit high/critical is `0`; all three findings were repaired before the final independent APPROVE evidence listed above.

Fresh Stage 2 backend evidence is retained at [`evidence/2026-08-09-stage2-backend-implementation.md`](./evidence/2026-08-09-stage2-backend-implementation.md), and the merged Stage 2/3 source is exact `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1`. Fresh Stage 4 frontend evidence is retained at [`evidence/2026-08-09-stage4-frontend-implementation.md`](./evidence/2026-08-09-stage4-frontend-implementation.md). Stage 5, final authority, Stage 6, Ready, merge, server-production/local-rehearsal, capability activation and Discord remain outside this author task.

- [x] v2 complete validates exact owner pantry rows against pinned product/effective ingredient authority <!-- omo:id=delivery-batch-complete-pantry;stage=2;scope=backend;review=3,6 -->
- [x] complete atomically applies pantry batch ledger session claim Meal cook-count and XP once <!-- omo:id=delivery-batch-complete-atomic;stage=2;scope=backend;review=3,6 -->
- [x] known/missing completion and delayed original finished weight obey official bounds <!-- omo:id=delivery-batch-weight;stage=2;scope=backend;review=3,6 -->
- [x] missing→unrecoverable is idempotent irreversible and exact-error protected <!-- omo:id=delivery-batch-unrecoverable;stage=2;scope=backend;review=3,6 -->
- [x] append-only events, operation uniqueness, reversal and full-replay checksum are enforced <!-- omo:id=delivery-batch-ledger;stage=2;scope=backend;review=3,6 -->
- [x] discard/adjust/close/cancel-current state matrix cannot bypass depletion authority <!-- omo:id=delivery-batch-mutations;stage=2;scope=backend;review=3,6 -->
- [x] content-only nutrition formula preserves partial/unavailable and fixed-once semantics <!-- omo:id=delivery-batch-nutrition;stage=2;scope=backend;review=3,6 -->
- [x] new read model serves every leftover reader before protected direct updates are revoked <!-- omo:id=delivery-batch-reader-cutover;stage=2;scope=shared;review=3,6 -->
- [x] legacy eaten projection and XP/activity apply only to consumed reasons exactly once <!-- omo:id=delivery-batch-legacy-projection;stage=2;scope=backend;review=3,6 -->
- [x] legacy rows remain nullable and are never assigned inferred grams or fabricated content <!-- omo:id=delivery-batch-legacy-data;stage=2;scope=backend;review=3,6 -->
- [x] COOK_MODE exact-row/weight UI is fail-closed and waits for stored completion result <!-- omo:id=delivery-batch-complete-ui;stage=4;scope=frontend;review=5,6 -->
- [x] fresh independent design critic and 390px/320px screenshot/Figma product-design-authority pass before Stage 4 frontend entry <!-- omo:id=delivery-batch-design-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] R/R+1 seeded v2 drain and current/previous v1 compatibility pass with new-write zero <!-- omo:id=delivery-batch-drain;stage=2;scope=shared;review=3,6 -->
- [ ] R+2 joint activation and rollback preserve existing v2 drain <!-- omo:id=delivery-batch-activation;stage=2;scope=shared;review=3,6 -->
- [x] #9 meal-log and #11 final UI boundaries are not preclaimed <!-- omo:id=delivery-batch-successor-boundary;stage=2;scope=shared;review=3,6 -->
- [ ] local PostgreSQL E2E real DB server-production/local-rehearsal security and current-head evidence are green <!-- omo:id=delivery-batch-verification;stage=2;scope=shared;review=3,6 -->
