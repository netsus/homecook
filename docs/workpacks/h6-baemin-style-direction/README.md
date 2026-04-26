# h6-baemin-style-direction

> Codex-authored direction gate draft. Public Stage 1 ownership remains Claude per `docs/engineering/slice-workflow.md`; treat this as the approved product-direction input plus machine-checkable gate package. No runtime app code may be changed by this workpack.

## Goal

Adopt the Baemin-style prototype as the official visual direction for `homecook` while keeping implementation staged, reversible, and contract-safe. This gate locks the user decision, the non-goals, the approval boundaries, and the rollout order before any app-wide token or component changes begin.

The first success checkpoint is documentation approval, not a UI patch. Follow-up work must start with additive tokens and evidence planning, then move through shared components and existing anchor-screen retrofits in small PRs.

## Branches

| Type | Branch |
| --- | --- |
| Docs gate | `docs/h6-baemin-style-direction` |
| Future token foundation | `feature/fe-baemin-style-tokens-additive` |
| Future component work | `feature/fe-baemin-style-shared-components` |
| Future anchor retrofits | one `feature/fe-baemin-style-<screen>-retrofit` branch per screen |

## User Decision

| Decision | Result |
| --- | --- |
| Official design direction | Baemin-style prototype is officially adopted as the product direction |
| Rollout strategy | Gradual rollout |
| Non-goals | Visual change only; no API, DB, status transition, information architecture, or new feature scope |
| Decision boundaries | User approves brand/background/font/final visual feel; agents decide implementation details |
| Mixed UI tolerance | Temporary mixed old/new UI is allowed during rollout |
| First success checkpoint | Direction document approval before code changes |

## In Scope

- Product direction:
  - Baemin-style white/mint visual system as the target direction
  - Token/component/screen rollout sequence
  - Explicit retrofit strategy for already-developed slice1-8 surfaces
  - Explicit non-blocking rule for slice09 and future slices
- Anchor screens for future implementation planning:
  - `HOME`
  - `RECIPE_DETAIL`
  - `PLANNER_WEEK`
- Reference-only future surfaces:
  - `PANTRY`
  - `MYPAGE`
- API: none
- DB: none
- Status transitions: none
- Schema Change:
  - [x] None

## Out of Scope

- Runtime UI changes in this gate
- Direct edits to `app/globals.css`, route files, shared components, API handlers, or database files
- Adding production `PANTRY` or `MYPAGE` behavior before their official slices start
- Changing official screen information architecture because the prototype shows a different layout
- Replacing H1/H2/H5 locked interaction decisions without a separate approved design decision gate
- Introducing new dependencies or externally loaded fonts
- Treating prototype code as production code

## Reference Set

| Artifact | Path | Role |
| --- | --- | --- |
| Single-file prototype | `ui/designs/prototypes/homecook-baemin-prototype.html` | Visual reference bundle |
| Prototype package | `ui/designs/prototypes/baemin-redesign/` | Unbundled source reference |
| Prototype design rules | `ui/designs/prototypes/baemin-redesign/DESIGN.md` | Baemin-style source inspiration |
| Developer handoff | `ui/designs/prototypes/baemin-redesign/HANDOFF.md` | Token/component/screen mapping input |
| Formal direction doc | `ui/designs/BAEMIN_STYLE_DIRECTION.md` | Official comparison and rollout decision |
| Authority preflight | `ui/designs/authority/BAEMIN_STYLE_DIRECTION-preflight.md` | Evidence requirements for follow-up slices |

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | Baseline HOME and RECIPE_DETAIL exist |
| `02-discovery-filter` | merged | HOME filter controls exist |
| `03-recipe-like` | merged | RECIPE_DETAIL like behavior exists |
| `04-recipe-save` | merged | Save modal behavior exists |
| `05-planner-week-core` | merged | PLANNER_WEEK baseline exists |
| `06-recipe-to-planner` | merged | Planner add sheet exists |
| `07-meal-manage` | merged | Meal management baseline exists |
| `08a-meal-add-search-core` | merged | MENU_ADD/search baseline exists |
| `08b-meal-add-books-pantry` | merged | Recipe book and pantry match add paths exist |
| `h1-home-first-impression` | merged | HOME first viewport decision is locked |
| `H2-planner-week-v2-redesign` | merged | PLANNER_WEEK day-card model is locked |
| `h5-modal-system-redesign` | merged | Sheet/modal family is locked |

## Backend First Contract

This gate has no backend implementation. Future implementation slices must preserve:

- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- `meals.status`: `registered -> shopping_done -> cook_done`
- independent cooking does not mutate `meals.status`
- completed shopping lists remain read-only and mutation APIs return `409`
- `add_to_pantry_item_ids`: `null`, `[]`, and selected IDs remain distinct
- no endpoint, field, table, or status value may be added as part of visual redesign

## Frontend Delivery Mode

- This gate: docs/reference only.
- Future implementation starts with additive tokens that do not change current visuals.
- Value-changing token updates require explicit user approval and updated design-token docs.
- Shared components must be introduced only when they reduce duplication or match existing patterns.
- Anchor-screen retrofits must preserve existing loading, empty, error, read-only, and unauthorized states.
- Login-protected actions must preserve existing return-to-action behavior.

## Rollout Sequence

| Order | Slice candidate | Scope | Gate |
| --- | --- | --- | --- |
| 1 | `h6-baemin-style-direction` | Direction, non-goals, evidence plan | user direction approval + docs approval |
| 2 | `baemin-style-tokens-additive` | Add non-conflicting CSS variables only | no visual diff expected |
| 3 | `baemin-style-token-values` | Change brand/background/text token values | user approval required |
| 4 | `baemin-style-shared-components` | Button, chip, card, app bar, sheet styling foundation | component previews + a11y checks |
| 5 | `baemin-style-home-retrofit` | Apply style to `HOME` within H1 structure | anchor evidence required |
| 6 | `baemin-style-recipe-detail-retrofit` | Apply style to detail actions/sheets | anchor evidence required |
| 7 | `baemin-style-planner-week-retrofit` | Visual polish only within H2 day-card model | anchor evidence required |
| 8 | future official slices | `PANTRY`, `MYPAGE`, shopping/cooking screens as they start | use prototype as reference only |

## Existing Slice Treatment

- slice1-8: do not rewrite immediately. They will be retrofitted through the follow-up slices above.
- slice09: do not block. If the Baemin foundation is not merged when slice09 starts, build with the current approved design and retrofit later.
- slice10+: may reference this gate after it is merged, but must not invent new product scope from the prototype.
- Planned screens such as `PANTRY` and `MYPAGE`: prototype references are design input only until their official workpacks begin.

## Design Authority

- UI risk: `high-risk` / `anchor-extension`
- Anchor screens: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`
- Authority required: yes, for future implementation slices
- Evidence root: `ui/designs/evidence/baemin-style/`
- Preflight authority doc: `ui/designs/authority/BAEMIN_STYLE_DIRECTION-preflight.md`
- Rule: this gate approves direction only; it does not confirm final production visuals.

## Design Status

- [x] Direction adopted by user
- [x] Reference package present
- [ ] Claude Stage 1 final owner review completed
- [ ] Direction docs approved for merge
- [ ] Runtime visual implementation started
- [ ] Runtime visual implementation confirmed

## Contract Evolution Candidates

| Candidate | Current contract | Proposed direction | Required approval |
| --- | --- | --- | --- |
| Brand color | C2 Bright Kitchen orange/cream | Baemin-style mint/white | user approval + design-token docs |
| App background | warm cream `#fff9f2` | white app canvas with gray fills | user approval + screenshots |
| Brand font moment | current sans-serif UI | optional brand-only display font | user approval + no new dependency unless approved |
| Shared card language | current C2 cards | Baemin-style dense mobile cards | component evidence |
| Pantry/MyPage production visuals | planned future slices | use prototype as future reference | future slice approval |

None of these candidates are implementation scope in this gate.

## QA / Test Data Plan

- Fixture baseline: no fixture changes.
- Real DB smoke: not required for this gate.
- Browser smoke: not required for this gate.
- Required checks for this docs gate:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - targeted JSON/document consistency review
- Future implementation checks:
  - `pnpm verify:frontend`
  - mobile default and 320px screenshots
  - authority report with blocker 0 for anchor retrofits

## Primary User Path

1. The user reviews `ui/designs/BAEMIN_STYLE_DIRECTION.md`.
2. The user confirms the app-wide brand/background/font direction before value-changing token work starts.
3. Agents implement follow-up slices in the rollout order.
4. Each anchor-screen retrofit ships only after mobile/narrow evidence shows no blocker.

## Delivery Checklist

- [ ] Direction decision is recorded as official, gradual, visual-only adoption <!-- omo:id=h6-direction-recorded;stage=4;scope=frontend;review=5,6 -->
- [ ] `BAEMIN_STYLE_DIRECTION.md` compares current C2 and Baemin-style targets <!-- omo:id=h6-direction-comparison;stage=4;scope=frontend;review=5,6 -->
- [ ] `BAEMIN_STYLE_DIRECTION-preflight.md` defines evidence requirements for `HOME`, `RECIPE_DETAIL`, and `PLANNER_WEEK` <!-- omo:id=h6-authority-preflight;stage=4;scope=frontend;review=5,6 -->
- [ ] Follow-up implementation slices are split by token, component, and anchor-screen work <!-- omo:id=h6-rollout-split;stage=4;scope=frontend;review=5,6 -->
- [ ] `PANTRY` and `MYPAGE` are explicitly reference-only until official slices start <!-- omo:id=h6-future-screens-reference-only;stage=4;scope=frontend;review=5,6 -->
- [ ] Runtime app code remains unchanged in this gate <!-- omo:id=h6-no-runtime-change;stage=4;scope=frontend;review=5,6 -->

## Blockers

- Runtime app code changed in this gate
- Prototype conflicts with official docs and the conflict is not recorded
- Brand/background/font value changes start without user approval
- Follow-up slice attempts to productionize `PANTRY` or `MYPAGE` before official scope exists
