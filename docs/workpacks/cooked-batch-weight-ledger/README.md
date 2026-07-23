# Cooked Batch Weight Ledger

## Goal

snapshot-v2 요리 완료를 session에 pin된 content/servings와 exact pantry row 선택에 결합하고, cooked batch의 완성·잔량 중량과 weighted/unweighed lifecycle을 append-only event + row-lock RPC authority로 만든다. 기존 leftover reader와 v1 completion을 호환하면서 R/R+1 flag-off drain을 증명한 뒤에만 R+2에서 personal recipe와 v2 creation을 공동 활성화한다.

## Branches

- Stage 1 docs: `docs/cooked-batch-weight-ledger`
- Stage 2 backend/DB: `feature/be-cooked-batch-weight-ledger`
- Stage 4 functional COOK_MODE integration: `feature/fe-cooked-batch-weight-ledger`
- Release train: D. 구현 선행조건은 #7 runtime과 merged `cook-mode-whole-board`다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, implementation owner, security/DB reviewer, five-axis reviewer, design critic, product-design-authority reviewer, release verifier와 closeout reviewer는 서로 다른 Codex 세션을 사용한다. Claude는 사용하지 않는다.

## In Scope

- snapshot-v2 complete
  - `POST /cooking/session-attempts/{id}/complete` requires Authorization and UUID `Idempotency-Key`.
  - request uses exact owner `consumed_pantry_item_ids` plus exact-one `weight_action=set_finished_weight|weigh_later`; set requires positive `finished_weight_g`, later requires g null.
  - product pin accepts only the same exact product pantry row. Generic ingredient pin accepts a generic row or product row whose active approved primary `represents` relation projects the same effective ingredient.
  - duplicate/missing/other-owner/mismatched pantry rows fail without deletion. Only selected rows are removed; equivalent unselected rows remain.
  - one transaction commits pantry deletion, immutable content-only batch, initial ledger/projection, session terminal result, claim consumption, planner Meal transition, cook count and cooking-completed XP exactly once.
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
  - only R+2 jointly enables `cooking_session_v2` and `personal_recipe_v2`.
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
- Stage 1 docs PR에서 production code, migration, remote DB mutation or capability activation

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| official contract PR #1072 | merged | v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 authority available |
| `recipe-content-snapshot-future-propagation` Stage 1 PR #1081 | merged docs | #7 runtime must provide v2 start/cancel/read, immutable session pin and claim behavior before #8 implementation |
| `recipe-snapshot-authority-foundation` Stage 1 PR #1078 | merged docs | #4 runtime must provide content-only batch/session schema authority |
| `product-ingredient-link-foundation` Stage 1 PR #1076 | merged docs | #2 runtime approved effective-ingredient relation is required for generic pin pantry validation |
| `cook-mode-whole-board` | currently `implementation` | must merge and be green before #8 implementation due shared COOK_MODE files; Stage 1 docs may merge now |
| `meal-log-core` #9 | successor | owns linked consumed meal entry and arbitrary-order entry-specific reversal |
| `cooked-batch-weight-ui` #11 | successor | owns final LEFTOVERS/weight UI design/accessibility without duplicating mutations |

> Roadmap status is `docs` while workflow lifecycle remains `planned`. This Stage 1 merge neither satisfies runtime predecessors nor activates v2/personal flags.

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
| other-owner/private session, batch or pantry | official 404/non-disclosure | mutation 0; owner/state hidden |
| missing/duplicate/mismatched pantry selection | official 409/422 | no pantry or completion effect |
| same key, different payload | `409 IDEMPOTENCY_KEY_REUSED` | mutation 0 |
| stale expected batch revision | official 409 | event/projection unchanged |
| unrecoverable weight set/restore/marker reversal | `409 WEIGHT_UNRECOVERABLE` | event/projection unchanged |
| adjustment reaches 0, exceeds finished or reopens | `409 BATCH_ADJUSTMENT_INVALID` | event/projection unchanged |
| invalid close/cancel target or later event exists | official 409 | event/projection unchanged |
| creation flag off for new v2 | `409 SNAPSHOT_V2_CREATION_DISABLED` | no new session/completion source |
| v1 key absent before zero-telemetry gate | existing v1 behavior | no premature 428 |

All responses retain `{ success, data, error }` and `{ code, message, fields[] }`. Internal reasons cannot replace exact public error codes.

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
- no eligible exact row: explain required pantry selection and keep complete disabled
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
- Stage 1 artifact: the exact-row and weight-action wireframe above. Before Stage 2 begins, update the existing legacy `ui/designs/COOK_MODE.md` to the #8 states, then replace `ui/designs/critiques/COOK_MODE-critique.md` with an independent critique of that updated design; the existing v1.5.1 artifacts are not #8 evidence.
- Design critic: the refreshed critique must pass before Stage 2. It checks actual row identity, product/brand hierarchy, no auto-selection, food-only weight copy, known/later exclusivity, loading/empty/error fail-closed and duplicate-submit behavior.
- Stage 4 evidence: 390px/320px COOK_MODE default, multi-row, no-eligible-row, known, weigh-later, pending, 409/422 and replay states; keyboard/focus, 44px targets and no overflow.
- product-design-authority: scoped approval of #8 functional completion is required before R activation. #11 still owns final COOK_MODE/LEFTOVERS visual polish, container calculator and full delayed-weight/unrecoverable UX; it reuses the same mutations.
- canonical authority report is `ui/designs/authority/COOK_MODE-authority.md`; the existing legacy report is not reusable and must be replaced after Stage 4 captures new #8 390px/320px evidence. PNG/Figma are report-linked evidence/runtime references.

## Design Status

`temporary`. Stage 1 locks functional states only. Implementation evidence, independent design critique and scoped product-design-authority approval remain pending; #11 owns later final visual/accessibility completion.

## Primary User Path

1. An owner finishes an existing snapshot-v2 session and selects the actual pantry rows used, seeing product/brand identity rather than a guessed generic match.
2. The owner supplies the original food-only finished weight or chooses `나중에 입력`; one idempotent RPC revalidates session/content/pantry/claims.
3. The RPC deletes only selected pantry rows and commits batch, initial ledger, session/Meal/claim/cook-count/XP exactly once; retry returns the stored result.
4. A missing-weight batch may later receive the original finished weight before any event or become irreversible unrecoverable; subsequent quantity/lifecycle changes are append-only row-lock RPCs.

## QA / Test Data Plan

### Stage 1 gate

- this docs PR runs current SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc Vitest, lint, typecheck, dependency audit and diff check only.
- migration/RPC/PostgreSQL/component/E2E/visual/real DB/remote/seeded-drain/activation commands below are future Stage 2/4/release artifacts, not claimed executable now.

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
- merged-exact-SHA remote read-only function/ACL/RLS/policy/constraint/capability inventory; no unmerged remote migration.

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

- [ ] v2 complete validates exact owner pantry rows against pinned product/effective ingredient authority <!-- omo:id=delivery-batch-complete-pantry;stage=2;scope=backend;review=3,6 -->
- [ ] complete atomically applies pantry batch ledger session claim Meal cook-count and XP once <!-- omo:id=delivery-batch-complete-atomic;stage=2;scope=backend;review=3,6 -->
- [ ] known/missing completion and delayed original finished weight obey official bounds <!-- omo:id=delivery-batch-weight;stage=2;scope=backend;review=3,6 -->
- [ ] missing→unrecoverable is idempotent irreversible and exact-error protected <!-- omo:id=delivery-batch-unrecoverable;stage=2;scope=backend;review=3,6 -->
- [ ] append-only events, operation uniqueness, reversal and full-replay checksum are enforced <!-- omo:id=delivery-batch-ledger;stage=2;scope=backend;review=3,6 -->
- [ ] discard/adjust/close/cancel-current state matrix cannot bypass depletion authority <!-- omo:id=delivery-batch-mutations;stage=2;scope=backend;review=3,6 -->
- [ ] content-only nutrition formula preserves partial/unavailable and fixed-once semantics <!-- omo:id=delivery-batch-nutrition;stage=2;scope=backend;review=3,6 -->
- [ ] new read model serves every leftover reader before protected direct updates are revoked <!-- omo:id=delivery-batch-reader-cutover;stage=2;scope=shared;review=3,6 -->
- [ ] legacy eaten projection and XP/activity apply only to consumed reasons exactly once <!-- omo:id=delivery-batch-legacy-projection;stage=2;scope=backend;review=3,6 -->
- [ ] legacy rows remain nullable and are never assigned inferred grams or fabricated content <!-- omo:id=delivery-batch-legacy-data;stage=2;scope=backend;review=3,6 -->
- [ ] COOK_MODE exact-row/weight UI is fail-closed and waits for stored completion result <!-- omo:id=delivery-batch-complete-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px visual/a11y and independent design critic/scoped authority reviews pass <!-- omo:id=delivery-batch-design-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] R/R+1 seeded v2 drain and current/previous v1 compatibility pass with new-write zero <!-- omo:id=delivery-batch-drain;stage=2;scope=shared;review=3,6 -->
- [ ] R+2 joint activation and rollback preserve existing v2 drain <!-- omo:id=delivery-batch-activation;stage=2;scope=shared;review=3,6 -->
- [ ] #9 meal-log and #11 final UI boundaries are not preclaimed <!-- omo:id=delivery-batch-successor-boundary;stage=2;scope=shared;review=3,6 -->
- [ ] local PostgreSQL E2E real DB remote security and current-head evidence are green <!-- omo:id=delivery-batch-verification;stage=2;scope=shared;review=3,6 -->
