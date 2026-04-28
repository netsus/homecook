# h8-baemin-prototype-reference-future-screens-direction

> Future-screen Baemin prototype authority gate for slice 13-19.
> This workpack records screen-level rollout classification only. Runtime app code and official product contract changes are out of scope.

## Goal

Prepare slice 13 and later frontend work to use the Baemin prototype deliberately instead of guessing from adjacency to the already-merged h7 parity program.

This gate locks:

- which planned slice 13-19 screens can start from prototype parity
- which screens stay prototype-derived by default
- which prototype elements remain out of production scope
- the machine-readable `frontend.design_authority` shape used by future workpacks

The canonical definitions for `prototype parity`, `prototype-derived design`, and `out of prototype scope` live in `ui/designs/BAEMIN_STYLE_DIRECTION.md`. This h8 gate stores only the rollout matrix and gate rules.

## Branches

| Type | Branch |
| --- | --- |
| Docs gate | `docs/baemin-prototype-reference-frontend-design-plan` |
| Future pantry frontend | `feature/fe-13-pantry-core` |
| Future mypage frontend | `feature/fe-17a-mypage-overview-history` |

## User Decision

| Decision | Result |
| --- | --- |
| Future frontend direction | Slice 13 and later should follow the Baemin prototype where the screen is in scope |
| Promotion unit | Screen/surface level only |
| h7 scope | Historical; do not add future screens to h7 |
| Official docs | Not changed in this PR |
| Runtime change in this gate | Not allowed |

## In Scope

- Future-screen rollout gate for planned slices `13` through `19`
- Initial screen/surface classification matrix
- Explicit non-screen exclusions
- Generic nullable `frontend.design_authority.generator_artifact` and `frontend.design_authority.critic_artifact` contract
- Roadmap dependency so `13-pantry-core` waits for h8

## Out of Scope

- Runtime app code changes
- Direct edits to routes, components, API handlers, DB schema, seed data, or official source-of-truth docs
- Changing h7 covered surfaces or h7 acceptance criteria
- Promoting `PANTRY_BUNDLE_PICKER`, `COOK_MODE`, `LEFTOVERS`, `ATE_LIST`, settings, manual recipe, or YouTube import to parity without later evidence
- Importing `Jua` or prototype-only assets
- Adopting prototype-only bottom tab behavior

## Reference Set

| Artifact | Path | Role |
| --- | --- | --- |
| RALPLAN source | `.omx/plans/baemin-prototype-reference-frontend-design-ralplan-20260428.md` | Planning input, not git-tracked authority |
| Vocabulary source | `ui/designs/BAEMIN_STYLE_DIRECTION.md` | Canonical definition of classification terms |
| Historical h7 gate | `docs/workpacks/h7-baemin-prototype-parity-direction/README.md` | Covered-surface parity history |
| h7 closeout | `docs/workpacks/baemin-prototype-parity-polish-closeout/README.md` | Evidence that h7 scope is complete |
| Roadmap | `docs/workpacks/README.md` | Slice 13-19 ordering |
| Prototype reference | `ui/designs/prototypes/homecook-baemin-prototype.html` | Reference-only visual bundle |

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | Historical h7 scope and exclusions are fixed |
| `baemin-prototype-parity-polish-closeout` | merged | Confirms h7 did not include `PANTRY` or `MYPAGE` production behavior |
| `docs/workpacks/README.md` slice 13-19 roadmap | current | Lists future screen order |
| `ui/designs/BAEMIN_STYLE_DIRECTION.md` | current | Owns classification vocabulary |

## Backend First Contract

This gate has no backend implementation. Future slices must preserve:

- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- `meals.status`: `registered -> shopping_done -> cook_done`
- independent cooking does not mutate `meals.status`
- completed shopping lists remain read-only and mutation APIs return `409`
- `add_to_pantry_item_ids`: `null`, `[]`, and selected IDs remain distinct
- no endpoint, field, table, or status value may be added because a prototype screen shows it

## Future-Screen Classification Matrix

The class names below are defined only in `ui/designs/BAEMIN_STYLE_DIRECTION.md`.

| Slice | Screen / Surface | Initial class | Gate note |
| --- | --- | --- | --- |
| `13-pantry-core` | `PANTRY` | `prototype parity` | known prototype-present future screen; parity candidate |
| `13-pantry-core` | `PANTRY_BUNDLE_PICKER` | `prototype-derived design` | stays derived unless `h8` cites explicit prototype-state evidence for promotion |
| `14-cook-session-start` | `COOK_READY_LIST` | `prototype-derived design` | use Baemin vocabulary/material only |
| `15a-cook-planner-complete` | `COOK_MODE` | `prototype-derived design` | planner path does not auto-promote visual parity |
| `15b-cook-standalone-complete` | `COOK_MODE` | `prototype-derived design` | same surface, same classification |
| `16-leftovers` | `LEFTOVERS`, `ATE_LIST` | `prototype-derived design` | no parity promotion in PR1 |
| `17a-mypage-overview-history` | `MYPAGE` | `prototype parity` | known prototype-present future screen; shell-level candidate only |
| `17a-mypage-overview-history` | `MYPAGE_TAB_RECIPEBOOK`, `MYPAGE_TAB_SHOPPINGLISTS` | `prototype-derived design` | no automatic sub-surface promotion from shell parity |
| `17b-recipebook-detail-remove` | `RECIPEBOOK_DETAIL` | `prototype-derived design` | derived unless separately promoted later |
| `17c-settings-account` | `SETTINGS` | `prototype-derived design` | derived unless separately promoted later |
| `18-manual-recipe-create` | `MANUAL_RECIPE_CREATE` | `prototype-derived design` | derived unless separately promoted later |
| `19-youtube-import` | `YT_IMPORT` | `prototype-derived design` | derived unless separately promoted later |

## Non-Screen Exclusions

The following stay `out of prototype scope` unless a later explicit gate promotes them:

- prototype-only bottom tab behavior
- `Jua` or any new prototype-only font dependency
- prototype-only illustration, image, emoji, or marketing asset
- unsupported production functionality that does not exist in official docs

## Design Authority

- UI risk: `not-required` for this docs gate
- Authority required: no runtime authority report for this gate
- Future `PANTRY` and `MYPAGE` parity candidates must still provide screen evidence in their own Stage 4/5 work
- `frontend.design_authority.generator_artifact` and `frontend.design_authority.critic_artifact` are generic nullable fields:
  - string path when a generator or critic artifact is required or reused
  - `null` when intentionally not applicable
  - missing fields normalize to `null`

## QA / Test Data Plan

This gate:

- no fixture changes
- no real DB smoke
- no browser smoke
- no runtime UI diff
- required checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack`
  - `pnpm test -- tests/omo-automation-spec.test.ts`

## Primary User Path

1. A reviewer opens `ui/designs/BAEMIN_STYLE_DIRECTION.md` to understand the classification vocabulary.
2. A reviewer opens this h8 workpack to see how slice 13-19 screens are initially classified.
3. Slice 13 frontend work starts after h8 merges and treats `PANTRY` as a parity candidate while keeping `PANTRY_BUNDLE_PICKER` derived.

## Delivery Checklist

- [ ] Classification vocabulary remains canonical in `BAEMIN_STYLE_DIRECTION.md` <!-- omo:id=h8-vocabulary-canonical;stage=4;scope=frontend;review=5,6 -->
- [ ] h8 contains the slice 13-19 screen/surface matrix <!-- omo:id=h8-matrix-complete;stage=4;scope=frontend;review=5,6 -->
- [ ] `PANTRY` and `MYPAGE` are marked as screen-level parity candidates only <!-- omo:id=h8-pantry-mypage-parity-candidates;stage=4;scope=frontend;review=5,6 -->
- [ ] `PANTRY_BUNDLE_PICKER` and MYPAGE sub-tabs remain prototype-derived by default <!-- omo:id=h8-sub-surfaces-derived;stage=4;scope=frontend;review=5,6 -->
- [ ] Bottom tab behavior, `Jua`, and prototype-only assets remain out of prototype scope <!-- omo:id=h8-non-screen-exclusions;stage=4;scope=frontend;review=5,6 -->
- [ ] `frontend.design_authority` artifact fields are generic nullable fields in schema, parser, templates, and tests <!-- omo:id=h8-design-authority-artifacts;stage=4;scope=frontend;review=5,6 -->
- [ ] Runtime app code and official docs remain unchanged in this gate <!-- omo:id=h8-no-runtime-official-doc-change;stage=4;scope=frontend;review=5,6 -->

## Blockers

- h8 restates or changes the canonical definitions instead of linking to `BAEMIN_STYLE_DIRECTION.md`
- h7 is edited to add future screens
- A slice-wide or tab-wide promotion is inferred from a single screen candidate
- Official docs or `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` are changed in this PR
- Runtime app code is changed in this PR
