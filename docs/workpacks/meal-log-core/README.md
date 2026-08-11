# meal-log-core

## Goal

실제 섭취 기록을 Recipe Meal과 분리된 owner/generation-scoped read/write model로 구현할 계약을 잠근다. `cooked_batch|food_product|ingredient` exact-one source, 저장 당시 날짜·timezone authority, exact nutrition evidence, batch consumption event pointer, append-only reversal과 멱등 transaction을 같은 backend slice에서 닫는다.

## Official Sources

- `docs/요구사항기준선-v1.7.30.md`
- `docs/화면정의서-v1.5.34.md`
- `docs/유저flow맵-v1.3.32.md`
- `docs/db설계-v1.3.32.md`
- `docs/api문서-v1.2.37.md`
- approved master plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Scope

### Schema, ownership, and cleanup

- add `meal_log_entries` with owner+generation, nullable `consumed_at`, required `consumed_local_date`, validated IANA `timezone_name_snapshot`, nullable `meal_plan_column_id ON DELETE SET NULL`, and required `slot_name_snapshot`.
- require source type `cooked_batch|food_product|ingredient` and the corresponding source/evidence FK set to satisfy an exact-one check.
- store actual amount/unit, display name/brand, compact nutrition evidence, nullable `active_consumption_event_id ON DELETE RESTRICT`, nullable `deleted_at`, and timestamps.
- owner reads and writers are RLS-isolated. Another owner or generation is nondisclosed and cannot be used as a source, column, entry, batch, event, product, profile, or evidence row.
- ordinary DELETE is soft delete. Account cleanup alone may null the active pointer, delete linked events, and hard-delete entries in the official FK order.
- authenticated direct hard delete, active pointer edit, nutrition snapshot edit, and protected batch/event DML remain denied; server row-lock RPC is the mutation authority.

### Day, slot, and read authority

- `GET /meal-log?date=YYYY-MM-DD` filters non-deleted owner rows by stored `consumed_local_date` exact match. Current device/profile timezone never regroups history.
- response preserves ordered active meal columns, deleted-column snapshot sections, per-slot subtotal/incomplete count, day total/incomplete count, and entries.
- `meal_plan_column_id` is nullable and deletion uses `ON DELETE SET NULL`; `slot_name_snapshot` is required. Deleted-column history stays visible under its snapshot but cannot be a new-write target.
- `consumed_at` may be null when only a past date is known. When present, conversion in the stored IANA zone must equal `consumed_local_date`, or the whole mutation returns `422 CONSUMED_DATE_TIMEZONE_MISMATCH` with zero row/event change.
- aggregates exclude soft-deleted rows and preserve `complete|partial|unavailable`. Unknown nutrition is never coerced to zero; day total equals the sum of visible slot subtotals plus explicit incomplete counts.
- `GET /meal-log/recent` returns owner/generation recent/frequent source projections with exact source IDs, safe label/brand, last amount/unit, and opaque stable cursor; inaccessible/deleted/hidden sources remain excluded.

### Create transaction

- `POST /meal-log/entries` requires a UUID `Idempotency-Key`, generation-scoped canonical payload hash, active owner/session/generation, valid date/timezone/column, exact-one source, and positive valid quantity.
- the server pins `slot_name_snapshot`, display label/brand, and the exact content/product/profile/conversion evidence; clients do not author compact nutrition JSON or event pointers.
- cooked batch source requires an owner known+available batch with enough remaining weight. One row-lock RPC commits pre-generated entry ID, entry, consumed event, active pointer, full replay projection, idempotency result, and any first-depletion legacy eaten/auto-hide/XP projection.
- product source pins the selected exact nutrition version and direct `basis_relations`; it never silently upgrades to the current product version.
- ingredient source pins an approved profile and exact conversion/piece evidence. Missing exact conversion rejects the entire operation with `422 UNIT_CONVERSION_MISSING`; no estimated row is created.
- partial/unavailable nutrition may be pinned as that state when official evidence supports it. Missing is not rewritten as complete zero.

### Patch and delete transaction

- `PATCH /meal-log/entries/{id}` requires a fresh UUID key and expected revision. Source, quantity, date, timezone, and active meal column may change only in one transaction.
- a batch-backed PATCH appends a reversal targeting that entry's current active consumed event, appends the replacement event if the replacement remains batch-backed, swaps the pointer, and recomputes the batch through full active-event replay under the common row lock.
- event ordering and equal quantities are not identity. A PATCH/DELETE reverses only the immutable event linked from its own entry.
- product/ingredient PATCH pins newly requested exact evidence without silently repinning from mutable current rows.
- `DELETE /meal-log/entries/{id}` requires key+expected revision, reverses the entry's active batch event when present, nulls the pointer, and soft-deletes the entry in the same transaction.
- retries of POST/PATCH/DELETE return the stored compact result exactly once. Same key with different canonical payload returns `409 IDEMPOTENCY_KEY_REUSED` and changes nothing.
- conflicting expected revision, insufficient batch remainder, stale generation, inaccessible resources, timezone mismatch, or conversion failure leaves entry, events, projection, aggregate, legacy projection, and idempotency terminal state consistent with the official error contract.

### Batch ledger and compatibility

- #8 `cooked-batch-weight-ledger` is the sole batch event/projection authority. #9 calls its row-lock RPC contract and does not add a second batch, remainder, or event model.
- current active consumed event is immutable and linked from the entry. reversal is append-only and full replay recalculates remaining weight/status/checksum under concurrency.
- only the first active `consumed|consumed_unweighed` depletion may project legacy eaten/auto-hide and `leftover_eaten:{batch_id}` XP. discard/mixed never count as eaten.
- reversal clears compatible eaten/auto-hide projection through #8 rules but does not retract XP/activity and cannot award it twice on later depletion.
- missing/unrecoverable batch cannot accept a g meal-log entry. Unweighed terminal closure creates no meal-log entry and no nutrition.

### Search and source readers

- product/ingredient discovery consumes #1's server-ranked `GET /food-catalog/search` typed union and single cursor. #9 does not create a second search endpoint or client merge.
- product effective ingredient matching consumes #2's approved primary `represents` projection where relevant; branded IDs are never inserted into ingredient synonyms.
- cooked batch selection consumes #8's `GET /cooked-batches` owner read model and its known/missing/unrecoverable plus available/depleted states.
- reader regression must prove meal-log routes do not bypass official catalog/batch projections or read raw mutable nutrition/profile rows as current authority.

## API Contract

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/meal-log?date=YYYY-MM-DD` | stored local-date owner read, slot/day totals, incomplete counts, deleted-slot snapshots |
| GET | `/meal-log/recent` | owner/generation recent/frequent typed source projection with opaque cursor |
| POST | `/meal-log/entries` | UUID-keyed exact-source create; batch entry/event/pointer/projection atomic |
| PATCH | `/meal-log/entries/{id}` | key+expected revision; old event reversal, replacement/pointer swap, evidence repin atomic |
| DELETE | `/meal-log/entries/{id}` | key+expected revision; own event reversal, pointer null, soft delete atomic |
| GET | `/food-catalog/search` | predecessor-provided unified ingredient/product search reader |
| GET | `/cooked-batches` | predecessor-provided owner batch read model |

All responses keep `{ success, data, error }`; errors keep `{ code, message, fields[] }`. This workpack adds no endpoint, field, enum, status, or public error outside the official v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37 contract.

## Error / Zero-write Matrix

| Condition | Public result | Required invariant |
| --- | --- | --- |
| unauthenticated | `401` | return-to-action is #12 UI; backend row/event 0 |
| other owner/private/deleted resource | `404` | nondisclosure; entry/event/projection 0 |
| missing UUID key | `428 IDEMPOTENCY_KEY_REQUIRED` | mutation 0 |
| malformed UUID key | `400 INVALID_IDEMPOTENCY_KEY` | mutation/operation/entry/event/pointer/projection/aggregate 0 |
| same key, different payload | `409 IDEMPOTENCY_KEY_REUSED` | stored result unchanged; mutation 0 |
| stale session/generation | `409 ACCOUNT_SESSION_STALE|ACCOUNT_GENERATION_STALE` | mutation 0 |
| account deleting/maintenance | official `409|503` lifecycle code | mutation 0 |
| consumed date/timezone mismatch | `422 CONSUMED_DATE_TIMEZONE_MISMATCH` | entry/event/projection 0 |
| exact product/ingredient conversion absent | `422 UNIT_CONVERSION_MISSING` | entry/event/projection 0 |
| batch missing/unrecoverable, depleted, or insufficient | official `409|422` response | no partial reversal/create or aggregate drift |
| expected revision conflict | official `409` response | no event/pointer/soft-delete drift |

## Transaction / Lock Order

1. authenticate and bind the active session/account generation; enter the shared lifecycle/capability transaction fence.
2. lock idempotency operation, meal-log entry for PATCH/DELETE, meal column/source evidence, and batch through the official common lock order.
3. revalidate owner, generation, revision, date/timezone, exact source/evidence, batch state and quantity after locks.
4. append reversal/replacement events, write entry/pointer/soft delete, and run full batch replay in one RPC transaction.
5. recompute slot/day aggregates from authoritative rows and store the compact terminal idempotency result.
6. any guard failure rolls back all entry, event, pointer, projection, aggregate, legacy, XP, and idempotency effects.

## Dependencies and Activation

- implementation predecessors: #1 `prepared-food-search-relevance`, #2 `product-ingredient-link-foundation`, #4 `recipe-snapshot-authority-foundation`, and #8 `cooked-batch-weight-ledger` merged with required checks green.
- F0 account-generation capability remains a global personal-writer gate even though it is not repeated in the #9 DAG row.
- #9 implementation remains dormant until predecessor runtime/migrations and #8 batch RPC/read models are available. No unmerged migration, production flag, or external-provider write is allowed from Stage 1.
- #10 owns Planner shell navigation; #12 owns day-first `MEAL_LOG` UI/add-edit-delete sheets/design authority; #14 owns cross-slice release QA.

## Stage 1 Repair Lineage

- exact governing master base: `c16102a3072e929e45bb24a69464cd3110d03db5`.
- exact repair parent and immutable HOLD report commit: `076c5b22ec91dd600eb387be4930a2582054ac15`.
- repair author task: `019fe746-8d84-7cd2-9f12-9c22560e914f`; independent reviewer task remains `019fe738-2551-7be0-993a-deea4bf83de4`.
- this repair closes only HOLD findings P1-01/P1-02. Stage 1 approval, broader lifecycle, Manual/server-Mac/OAuth evidence, capability, R/R+1/R+2 activation and product implementation remain pending.

## #9 Stage 2 / #11 UI Parallel Ownership

| Surface | #9 ownership | #11 ownership / prohibition |
| --- | --- | --- |
| DB | `meal_log_entries`, active consumption pointer, meal-log RLS/constraint/RPC/migration | #9 table/event/pointer를 만들거나 수정하지 않음 |
| batch write | #8 row-lock/full-replay RPC를 meal-log transaction에서 호출 | 기존 #8 mutation을 UI에서 소비하고 새 event/RPC 의미를 만들지 않음 |
| API | meal-log create/PATCH/DELETE/read routes and meal-log-only types/tests | COOK_MODE/LEFTOVERS presentation; meal-log API를 소유하지 않음 |
| UI | #10/#12 shell/MEAL_LOG screen을 선점하지 않음 | #11 화면만 소유하고 #12 consumed UI/CTA를 미리 구현하지 않음 |
| shared risk | migration ordering and meal-log-only modules | `docs/workpacks/README.md`와 `.workflow-v2/status.json` 같은 shared projection은 branch owner 한 명이 순차 통합 |

## Out of Scope

- Planner `요리 계획 | 식사 기록` navigation and route/back/focus behavior (#10).
- MEAL_LOG screen composition, recent/frequent sheet UX, 390px/320px screenshots, and product-design-authority approval (#12).
- weekly nutrition analysis, goals, medical advice, or a new bottom tab.
- free-text/external meal source, a generalized `food_items` model, estimated conversion, mutable current nutrition recalculation, or client-authored evidence.
- direct production migration/flag changes or R+2 activation.

## UI / Design Decision

- UI risk for this slice: `none` (backend contract only).
- `MEAL_LOG` is a new official screen, but its generator, design critic, mobile-default/mobile-narrow evidence, and authority report belong to #12 `meal-log-ui` after #10 shell and #9 backend merge.
- #9 only locks response states and API behavior needed by #12: loading-safe reads, empty slots, error retry without hiding cached entries, unauthorized nondisclosure, and complete/partial/unavailable aggregates.
- required screens: none; anchor screens: none; generator/critic/authority artifacts: none in this workpack.

## Design Status

`N/A` for #9 backend Stage 1. This does not waive the mandatory #12 `MEAL_LOG` design gate.

## QA / Test Data Plan

### Stage 1 current gate

- run only SOT/workflow/workpack/automation/bookkeeping validators, `tests/meal-log-core-stage1-repair.test.ts` plus focused workflow-doc tests, lint, typecheck, dependency audit and diff/parity checks.
- migration/RPC/PostgreSQL/route/component/E2E/visual/real DB/server-production/local-rehearsal checks below are future Stage 2/4/release evidence and are not claimed executable now.

### Backend Ready current/future smoke gate

- `automation-spec.json#external_smokes` is the current executable Ready list. It is empty for the first #9 backend implementation PR because the first full-lifecycle item requires a merged exact SHA and the remaining Manual/post-merge evidence cannot truthfully exist before that merge.
- `.workflow-v2/work-items/meal-log-core.json#workflow.external_smokes` remains the durable future gate and preserves all eight obligations. Emptying the current list does not delete, pass, skip, or waive any item in that future list.
- The generic frontend Ready guard would require relocking the current list from the work item. #9 is backend-only, so Stage 4~6 are normally skipped here; instead, a fresh post-merge/release closeout actor must explicitly relock the current list from the preserved work-item array before claiming `ML3-LIFECYCLE-001`, release evidence, or whole-lifecycle completion.
- Backend Stage 3 approval and the first backend merge close only the reviewed implementation gate. Until the later relock and evidence collection occur, merged-exact/server-Mac/OAuth/Manual/capability/R/R+1/R+2/activation obligations remain pending and the workflow lifecycle must not be projected as fully merged.

### Future fixtures

- owners A/B, active/stale generations, active/deleted meal columns with stable order and slot snapshots.
- known/missing/unrecoverable and available/depleted batches; multiple same-quantity entries; interleaved consumed/discard/reversal events.
- exact product nutrition versions with direct/missing basis; approved/rejected ingredient profiles; exact/missing unit and piece conversions.
- null/present `consumed_at`, valid/invalid IANA zones, matching/mismatching local dates, daylight-saving boundaries.
- complete/partial/unavailable nutrition snapshots, soft-deleted entries, account cleanup, retry and same-key/different-payload cases.

## Security / DB Review Focus

- owner+generation RLS, nondisclosure, direct DML revocation and account-only hard delete ordering.
- deferred entry↔event pointer constraint, exact-one source/evidence checks, immutable append-only events and soft-delete exclusion.
- row-lock/common lock ordering, expected revision, operation registry, full replay/checksum and concurrent remaining-weight bounds.
- IANA validation/date immutability, exact evidence pinning, partial/unavailable aggregation and zero-write errors.
- local-first production/rehearsal verification must target the merged exact SHA and remain read-only until an explicitly approved release gate.

## Delivery Checklist

- [x] Stage 1 README/acceptance/automation/work-item/status contract authored <!-- omo:id=delivery-meal-log-stage1-contract;stage=2;scope=shared;review=3,6 -->
- [x] Stage 1 independent internal1.5 review approved with zero findings <!-- omo:id=delivery-meal-log-internal-review;stage=2;scope=shared;review=3,6 -->
- [x] Stage 1 independent security/DB review approved with zero findings <!-- omo:id=delivery-meal-log-security-review;stage=2;scope=backend;review=3,6 -->
- [x] Stage 1 independent five-axis review approved with zero findings <!-- omo:id=delivery-meal-log-five-axis-review;stage=2;scope=shared;review=3,6 -->
- [x] Stage 1 PR current-head checks and post-merge master checks green <!-- omo:id=delivery-meal-log-stage1-ci;stage=2;scope=shared;review=3,6 -->
- [x] Stage 2 TDD RED evidence recorded before implementation <!-- omo:id=delivery-meal-log-tdd-red;stage=2;scope=backend;review=3,6 -->
- [x] Stage 2 schema/RLS/RPC/routes implemented behind dormant capability <!-- omo:id=delivery-meal-log-backend;stage=2;scope=backend;review=3,6 -->
- [x] Stage 2 backend integration, concurrency, aggregate and compatibility evidence green <!-- omo:id=delivery-meal-log-backend-evidence;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 6 merged-exact-SHA server-production/local-rehearsal read-only and release-train evidence green <!-- omo:id=delivery-meal-log-release-evidence;stage=2;scope=shared;review=3,6 -->
