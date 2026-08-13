# meal-log-ui #12 Stage 1 fresh independent design critique

> task ID: `019ffb6a-0cc4-7e42-85ad-956003e657b3`
> review date: `2026-08-13`
> role: fresh independent `design-critic`
> verdict: `🔴 HOLD` — P0 `0`, P1 `4`, P2 `0`
> scope: exact `ui/designs/MEAL_LOG.md` design contract only. Design repair, product code, PR #1349, workpack/projection repair, Ready/merge, authority approval, production/activation and notification are not performed or approved here.

## Reviewed exact tuple

- generator task: `019ffb5f-b4be-7153-84b8-e4f341bd5ae5`
- generator branch: `origin/docs/meal-log-ui-design-generator`
- reviewed commit: `1b44bb7238cc6d0381805585f371fe12e0cb90f0`
- reviewed tree: `851ceaa34835b7f5288590a3f0b74f7666e50eb7`
- reviewed artifact: `ui/designs/MEAL_LOG.md`
- parent/base: `c12afbccd15f4935a1a52b9f2c2c23882a5033ff`
- Stage 1 contract reference: PR #1349 head `cb68ade3d834e137b7d9ad72c49701370794c5a6`
- official authority: requirements `v1.7.32`, screen `v1.5.36`, flow `v1.3.34`, DB `v1.3.34`, API `v1.2.39`
- approved master plan: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Executive verdict

Planner shell placement, day-first hierarchy, 390px/320px/desktop containment, the required meal-log state matrix, 44px targets, focus trap/restoration, live announcements, reduced motion, delete hierarchy and no-page-overflow rules are materially strong. The design also avoids weekly analysis, medical guidance, unofficial source/status/action and client-authored totals.

However, four P1 gaps make the current artifact non-implementable without local product/contract invention: the seven-day rail has no way to leave its current range; `availability=all` batch states are only partially designed; one globally ordered recent projection is presented as two undefined groups; and ingredient search does not expose the evidence needed for the promised approved-unit picker. Stage 2 design prerequisite therefore remains blocked.

## Mobile baseline scorecard

| Axis | Result | Evidence |
| --- | --- | --- |
| Planner shell ownership | PASS | Existing Planner route and exact `요리 계획 | 식사 기록` segment are preserved; #12 owns only the log panel. |
| Day-first hierarchy | PASS | Selected-day heading, compact day summary, ordered meal sections and deleted-column history are correctly separated from plan rows and weekly analysis. |
| 390px containment | PASS | 16px gutter, one-row seven-date rail, compact rows, 44px actions and bottom-tab safe-area are explicitly locked. |
| 320px containment | PASS with blocking navigation gap | Page width, rail-local overflow, action stacking and no target compression are specified, but P1-ML-01 leaves the reachable date range undefined. |
| Desktop adaptation | PASS | Same IA/DOM order, centered width, optional two-column active sections and dialog adaptation preserve the mobile mental model. |
| Required meal-log states | PASS | loading, empty, error, unauthorized, partial, unavailable, deleted column, missing/unrecoverable batch, edit/delete, pending/replay/conflict and correctable 422 are distinct. |
| Accessibility | PASS | roving controls, dialog trap/restore, focused errors, live regions, non-color semantics, reduced motion and 200% text behavior are specified. |
| API/source implementability | HOLD | P1-ML-02 through P1-ML-04 require decisions or data not supplied by the consumed projections. |

## Required findings

### P1-ML-01 — The seven-day rail cannot navigate beyond its initial seven dates

- **Design evidence:** `ui/designs/MEAL_LOG.md:103-105`, `:154-155`, `:182-185`, `:196-197`, `:514-525` define exactly seven targets, explicitly reject previous/next arrows, and only define movement within the current rail.
- **Contract evidence:** the official screen wireframe at `docs/화면정의서-v1.5.36.md:201` places previous/next range controls around the seven dates. The product goal is historical day-first logging, not a single immutable seven-day window.
- **Impact:** a user cannot reach a date outside the initially rendered range, and an implementer must invent edge behavior, week/range shifting, URL/history semantics and focus behavior. This also leaves keyboard `Home/End` trapped inside one unexplained range.
- **Minimal repair:** define one deterministic existing-route mechanism for previous/next seven-day range movement. It may use compact 44px range controls or an explicitly specified rail gesture, but must preserve the #10 selected-date URL/history contract, keep the selected date visible, restore focus without page movement, work at 390/320/desktop and add no weekly analysis. State how record-presence marks for the new range are obtained only from existing reads.

### P1-ML-02 — `availability=all` exposes official batch states that have no picker behavior

- **Design evidence:** `ui/designs/MEAL_LOG.md:303-337` designs only `known+available`, `missing+available` and `unrecoverable+available`; `:399-416` has no depleted or legacy-null row; yet `:558` requires `GET /cooked-batches?availability=all`, and `:588-595` acknowledges nullable legacy projection fields.
- **Contract evidence:** `CookedBatchProjection` allows legacy-null fields and `batch_status=depleted`; #11 explicitly distinguishes known/missing/unrecoverable/legacy-null/depleted and six depleted reasons. `availability=all` returns these owner rows rather than only gram-loggable rows.
- **Impact:** implementation must guess whether depleted and legacy-null rows are hidden or rendered, what copy they use, whether any #11 link is legal, and how null nutrition/weight values appear. A guessed fallback can expose an invalid save/action or coerce unknown data.
- **Minimal repair:** define an exhaustive picker disposition for `depleted` and legacy-null projections. Either exclude them by an explicit client presentation rule while preserving the server cursor, or render a read-only disabled row. Legacy-null must use an unknown-history message with no inferred grams/nutrition/action; depleted must have no meal-log save or lifecycle mutation and may use only existing #11 reason copy. Add deterministic evidence coverage without inventing a new status, API or action.

### P1-ML-03 — The recent endpoint cannot author the two proposed `최근` / `자주` groups

- **Design evidence:** `ui/designs/MEAL_LOG.md:247-270` renders separate `최근 먹은 음식` and `자주 먹는 음식` sections but defines no grouping threshold, duplication rule or ordering rule.
- **Projection evidence:** `types/meal-log.ts:89-100` exposes one server-ordered `items[]` with `source`, display identity, `last_quantity`, numeric `frequency`, one `next_cursor` and one `has_next`; it has no `group`, `kind`, `is_frequent` or server-authored section boundary.
- **Impact:** splitting the list requires a client-authored frequency threshold/re-sort or duplicated rows, which breaks the exact server ordering/cursor authority and can behave inconsistently across source tabs and pages.
- **Minimal repair:** render one server-ordered `최근·자주 먹은 음식` list and use `frequency` only as faithful metadata, preserving the single cursor. If two semantic sections are required, stop with Contract Evolution instead of inventing the discriminator. Rich cooked-batch weight/status copy must come from the existing cooked-batch projection, not be inferred from the recent item.

### P1-ML-04 — Ingredient search cannot supply the promised approved conversion-unit picker

- **Design evidence:** `ui/designs/MEAL_LOG.md:283-301`, `:580`, `:599-605` promises that ingredient rows and the quantity control show only units backed by approved conversion/piece evidence.
- **Projection evidence:** `lib/api/food-catalog-search.ts:8-14` exposes ingredient search items as only `type`, `id`, `standard_name`, `category`, `default_unit`. It exposes neither approved profile identity nor conversion/piece unit availability. Product items separately expose `basis_relations` through `types/food-product.ts:74-94`, so the product half is implementable but the ingredient half is not.
- **Impact:** the UI cannot truthfully label a spoon/piece/unit option as approved before submission. The implementer must query an unofficial source, infer evidence from `default_unit`, or hard-code conversion knowledge. All three violate the no-invention boundary.
- **Minimal repair:** for ingredient selection, remove the claim that the client pre-knows approved conversion/piece units. Use only public search fields as non-authoritative display/suggestion, keep quantity/unit correctable, let the existing meal-log mutation remain the evidence authority, and retain the exact linked `422 UNIT_CONVERSION_MISSING` recovery. If the product requirement remains a prevalidated approved-unit picker, report a Contract Evolution HOLD instead of adding a field or endpoint in this design.

## Confirmed non-findings

- No unofficial meal-log endpoint, source type, mutation action, public error alias, weekly analysis, goal, calorie budget, medical guidance or new screen/route is introduced.
- Day and section totals remain server projections; `partial/unavailable` are not coerced to zero and soft-deleted entries are absent.
- Deleted meal-column history is separated and read-only, with no add/edit target.
- Create/edit/delete idempotency, expected revision, same-key replay, own-event reversal, exact evidence and nullable historical instant are correctly bound.
- The source switch is exactly `요리한 음식 | 제품·재료`; product/ingredient search preserves the typed union, server order and single opaque cursor.
- Touch target, focus, keyboard, screen-reader, live announcement, reduced-motion, destructive hierarchy and scroll-containment requirements are sufficiently specific for a later runtime evidence gate.

## Repair and re-review handoff

`🔴 HOLD`. The design-generator must repair P1-ML-01 through P1-ML-04 in `ui/designs/MEAL_LOG.md` on a new normal commit. This critic does not edit the design source. A fresh independent critic must then review the exact repaired commit/tree; this report does not approve Stage 2, PR #1349 integration, Ready, merge or final design authority.
