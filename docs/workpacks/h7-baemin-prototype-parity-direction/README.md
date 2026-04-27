# h7-baemin-prototype-parity-direction

> Baemin prototype near-100% parity direction gate.
> This workpack turns the local RALPLAN output into the official implementation authority for the next parity slices.
> Runtime app code is out of scope.

## Goal

Make the Baemin prototype the official near-100% visual parity target for the covered Homecook surfaces, instead of continuing the earlier visual-only retrofit program.

This gate locks:

- what "near-100% parity" means
- which previous locks are preserved or superseded
- which prototype-only elements remain excluded
- how body screens and overlays are scored
- which follow-up slices must run before implementation starts

The first success checkpoint is this direction gate approval. It does not change production UI.

## Branches

| Type | Branch |
| --- | --- |
| Docs gate | `docs/h7-baemin-prototype-parity-direction` |
| Foundation | `feature/fe-baemin-prototype-parity-foundation` |
| Home parity | `feature/fe-baemin-prototype-home-parity` |
| Recipe detail parity | `feature/fe-baemin-prototype-recipe-detail-parity` |
| Planner contract | `docs/baemin-prototype-planner-week-parity-contract` |
| Planner parity | `feature/fe-baemin-prototype-planner-week-parity` |
| Modal parity | `feature/fe-baemin-prototype-modal-overlay-parity` |
| Closeout | `docs/baemin-prototype-parity-polish-closeout` |

## User Decisions

| Decision | Result |
| --- | --- |
| Overall direction | Follow the Baemin prototype as closely as practical for covered surfaces |
| Target fidelity | Near-100% parity, measured by state/screen/viewport evidence |
| Prior visual-only retrofit strategy | Superseded for the covered parity program |
| `PLANNER_WEEK` no-horizontal lock | Superseded by user approval on 2026-04-27 |
| Temporary mixed UI | Allowed during staged rollout |
| Runtime change in this gate | Not allowed |

## In Scope

- Direction and authority for:
  - `HOME`
  - `RECIPE_DETAIL`
  - `PLANNER_WEEK`
  - modal / sheet / overlay family
- Supersession matrix for previous locks
- Visual scoring method and evidence requirements
- Follow-up slice sequence
- Prototype-only exclusions and separate approval list
- API/DB/status-transition preservation rules

## Out of Scope

- Runtime app code changes
- Direct edits to routes, components, API handlers, DB schema, or seed data
- Shipping prototype-only screens (`PANTRY`, `MYPAGE`) before their official slices
- Importing `Jua` or any new font dependency
- Adding unsupported `RECIPE_DETAIL` tabs/reviews as production functionality
- Treating prototype source code as copy-paste production code

## Reference Set

| Artifact | Path | Role |
| --- | --- | --- |
| RALPLAN source | `.omx/plans/baemin-prototype-parity-ralplan-20260427.md` | Planning input, not git-tracked authority |
| Single-file prototype | `ui/designs/prototypes/homecook-baemin-prototype.html` | Visual reference bundle |
| Prototype package | `ui/designs/prototypes/baemin-redesign/` | Reference-only component/source package |
| Prototype guard | `ui/designs/prototypes/baemin-redesign/README.md` | Reference-only warning |
| Prototype handoff | `ui/designs/prototypes/baemin-redesign/HANDOFF.md` | Token/screen mapping input |
| Current source of truth | `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` | Official docs pointer |
| Prior style gate | `docs/workpacks/h6-baemin-style-direction/README.md` | Superseded where this h7 gate conflicts |

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h6-baemin-style-direction` | merged | Earlier Baemin-style direction and reference guard |
| `baemin-style-tokens-additive` | merged | Additive token base exists |
| `baemin-style-token-values` | merged | User-approved brand tokens exist |
| `baemin-style-shared-components` | merged | Shared primitives exist |
| `baemin-style-home-retrofit` | merged | Current HOME retrofit baseline |
| `baemin-style-recipe-detail-retrofit` | merged | Current detail retrofit baseline |
| `baemin-style-planner-week-retrofit` | merged / superseded in part | Current planner retrofit baseline |
| `baemin-style-modal-system-fit` | merged | Current overlay retrofit baseline |
| `docs/화면정의서-v1.5.1.md` | current | PLANNER_WEEK prototype-priority contract |
| `docs/요구사항기준선-v1.6.4.md` | current | PLANNER_WEEK no-horizontal lock removed |
| `docs/유저flow맵-v1.3.1.md` | current | Planner prototype scroll/affordance allowed |

## Backend First Contract

This gate has no backend implementation. Follow-up slices must preserve:

- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- `meals.status`: `registered -> shopping_done -> cook_done`
- independent cooking does not mutate `meals.status`
- completed shopping lists remain read-only and mutation APIs return `409`
- `add_to_pantry_item_ids`: `null`, `[]`, and selected IDs remain distinct
- no endpoint, field, table, or status value may be added for visual parity

## Near-100% Definition

| Axis | Definition | Gate |
| --- | --- | --- |
| Skin | Colors, type scale, radius, shadow, spacing tone, and surface treatment match the prototype | visual score |
| Layout | Section order, card/list/header geometry, viewport first impression, and scroll affordance match the prototype | visual score |
| Interaction | Tabs, sheets, sort/filter, week movement, selected states, and visible affordance match the prototype or an approved production-safe divergence | authority checklist |
| Assets / Copy | Icons, labels, empty copy, CTA copy, image/placeholder tone match the prototype where production scope allows | checklist + visual score |
| State Coverage | Initial, scrolled, loading, empty, error, unauthorized, active, and open-sheet states are compared | required-state matrix |

## Prototype-Only Exclusions

These are excluded unless a later explicit approval gate promotes them:

- `Jua` or any new prototype-only font dependency
- `RECIPE_DETAIL` tabs and reviews
- `PANTRY` and `MYPAGE` production behavior
- prototype-only illustration, image, emoji, or marketing asset
- prototype-only bottom tab behavior
- production functionality that does not exist in official docs

## Supersession Matrix

| Surface | Current lock source | Kept locks | Superseded locks | Prototype-only exclusion | Official docs update needed | Approval owner | Implementation start condition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `HOME` body | `h1-home-first-impression`, `h6`, `baemin-style-home-retrofit` | API, auth, state, login gate behavior | H1 compact hybrid IA may be replaced by prototype HOME contract if needed | Jua, bottom tab behavior, Pantry/MyPage links | Yes if section hierarchy changes | user | h7 merged + HOME contract decision if IA changes |
| `RECIPE_DETAIL` body | `01-discovery-detail-auth`, `h5`, `h6`, `baemin-style-recipe-detail-retrofit` | Save/like/planner-add behavior, state shell, H5 copy locks unless separately changed | overview/metrics/CTA/section order may be replaced by prototype detail contract | tabs, reviews, Jua, hero-only prototype asset | Yes if section or interaction contract changes | user | h7 merged + detail contract decision if structure changes |
| `PLANNER_WEEK` body | `H4`, `H2`, `h6`, `baemin-style-planner-week-retrofit` | API/DB/status/auth/empty/error behavior | no-horizontal lock, vertical-only day-card overview, old slot-row layout lock | prototype Pantry coupling, unsupported planner functionality | Already updated in v1.6.4 / v1.5.1 / v1.3.1; further drift needs docs sync | user | h7 merged + planner contract workpack confirms evidence target |
| `PlannerAddSheet` | `h5`, `h3-planner-add-sync` | H5 copy lock, success toast, API contract | modal chrome/layout may follow prototype | prototype copy drift, semantic 3-step changes | Conditional | user | modal scoring method locked |
| `SaveModal` | `h5`, `04-recipe-save` | save flow, `saved/custom`, title/copy unless separately changed | surface/layout may follow prototype | prototype-only books visuals | Conditional if copy/flow changes | user | modal scoring method locked |
| `IngredientFilterModal` | `02-discovery-filter`, `h5` | filter contract, apply flow | chrome/layout may follow prototype | prototype-only categories/assets | Usually no | user | modal scoring method locked |
| `SortSheet` | `h5`, `h1` | sort semantics, immediate apply behavior | chrome/layout may follow prototype | semantics drift from prototype tab-like control | Usually no | user | modal scoring method locked |
| `LoginGateModal` | `01-discovery-detail-auth`, `baemin-style-modal-system-fit` | return-to-action, auth flow | visual parity allowed | prototype-only social asset | No | user | modal scoring method locked |
| Bottom tabs / Pantry / MyPage | prototype only | current production contract | none in this program | all production behavior excluded | No | user | future official slice only |

## Visual-Only vs Contract-Evolution Split

### Visual-only parity slices

- `baemin-prototype-parity-foundation`
- `baemin-prototype-modal-overlay-parity`
- `baemin-prototype-parity-polish-closeout`

These may proceed without official-doc updates only if they do not change screen flow, copy lock, interaction semantics, API, DB, or status behavior.

### Contract-evolution-required parity slices

- `baemin-prototype-home-parity` if HOME IA changes
- `baemin-prototype-recipe-detail-parity` if detail structure or interaction changes
- `baemin-prototype-planner-week-parity-contract`
- `baemin-prototype-planner-week-parity` if it finds additional official-doc drift

These must merge the relevant docs update before Stage 4 implementation.

## Visual Verdict Method

All parity scoring uses a 3-way comparison:

1. `current`: production baseline before the slice
2. `after`: candidate implementation
3. `prototype`: approved prototype reference

The exact score producer, artifact schema, and capture harness are intentionally deferred to `baemin-prototype-parity-foundation`. Until that slice lands, the method below is the acceptance contract, not an executable tool contract.

Fixed capture conditions:

- viewports: `390px` mobile default and `320px` narrow sentinel
- same fixture data
- same route entry
- same scroll position
- same active/open state
- required states captured before scoring

Required states:

| Surface | Required states |
| --- | --- |
| `HOME` | initial, scrolled-to-recipes-entry, sort-open, filter-active, loading, empty, error |
| `RECIPE_DETAIL` | initial, scrolled, planner-add-open, save-open, login-gate-open, loading, error |
| `PLANNER_WEEK` | initial, prototype overview state, scrolled, loading, empty, unauthorized, error |
| Modal family | PlannerAdd, Save, IngredientFilter, Sort, LoginGate open states |

Score composition per state:

- skin: 25
- layout: 30
- interaction affordance: 20
- assets/copy: 10
- state fidelity: 15

Screen score = average of state scores.
Slice score = `390px 70% + 320px 30%`.

Merge thresholds:

| Target | Threshold |
| --- | --- |
| `HOME` body | `>= 95` |
| `RECIPE_DETAIL` body | `>= 95` |
| `PLANNER_WEEK` body | `>= 94` |
| Modal overlay family | `>= 93` |
| Final closeout | body average `>= 95`, modal average `>= 93` |

Authority blocker count must be 0. Numeric score does not override a blocker.

Authority may waive a score miss only when:

- miss is within 2 points
- cause is an approved exclusion or official production-safe divergence
- blocker count is 0
- required-state evidence is complete

Body screen score and overlay score are independent. Body slices do not wait for modal parity, and modal parity does not hide body drift.

## Rollout Sequence

| Order | Slice | Purpose | Gate |
| --- | --- | --- | --- |
| 1 | `h7-baemin-prototype-parity-direction` | Official parity authority | this gate |
| 2 | `baemin-prototype-parity-foundation` | Capture/fixture/material foundation | no app-wide screen rewrite |
| 3 | `baemin-prototype-home-parity` | HOME body parity | score `>=95`, blocker 0 |
| 4 | `baemin-prototype-recipe-detail-parity` | Detail body parity | score `>=95`, blocker 0 |
| 5 | `baemin-prototype-planner-week-parity-contract` | Planner evidence target and remaining contract sync | docs before implementation |
| 6 | `baemin-prototype-planner-week-parity` | Planner body parity | score `>=94`, blocker 0 |
| 7 | `baemin-prototype-modal-overlay-parity` | Sheet/modal family parity | score `>=93`, blocker 0 |
| 8 | `baemin-prototype-parity-polish-closeout` | Cross-screen drift cleanup and final evidence | averages met, blocker 0 |

## QA / Test Data Plan

This gate:

- no fixture changes
- no real DB smoke
- no browser smoke
- required local checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack`

Follow-up implementation:

- `pnpm verify:frontend`
- mobile default and 320px screenshots
- authority report with blocker 0
- visual-verdict artifact per slice
- exploratory QA only when interaction flow changes

## Delivery Checklist

- [ ] Near-100 parity definition is official <!-- omo:id=h7-near-100-definition;stage=4;scope=frontend;review=5,6 -->
- [ ] Supersession matrix covers body screens and overlays <!-- omo:id=h7-supersession-matrix;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK prototype-priority contract is recorded as already user-approved <!-- omo:id=h7-planner-user-decision;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype-only exclusions are listed <!-- omo:id=h7-prototype-exclusions;stage=4;scope=frontend;review=5,6 -->
- [ ] Visual-verdict method and thresholds are defined <!-- omo:id=h7-visual-verdict-method;stage=4;scope=frontend;review=5,6 -->
- [ ] Body and overlay scoring are independent <!-- omo:id=h7-body-overlay-independence;stage=4;scope=frontend;review=5,6 -->
- [ ] Follow-up slice order is locked <!-- omo:id=h7-rollout-sequence;stage=4;scope=frontend;review=5,6 -->
- [ ] Runtime app code remains unchanged in this gate <!-- omo:id=h7-no-runtime-change;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Runtime app code changed in this gate
- Prototype-only exclusions treated as production approval
- PLANNER_WEEK no-horizontal lock reintroduced as a blocker
- Visual score threshold used without required-state evidence
- Overlay score mixed into body score
- API, DB, status, permission, read-only, or auth behavior changed
