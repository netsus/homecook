# Baemin Style Direction

> Status: official product direction adopted by user; h7 parity is complete for covered anchor surfaces; h8 governs future-screen rollout.

## Decision

`homecook` will adopt the Baemin-style prototype as its official visual direction. The adoption is gradual and visual-only. The app may temporarily contain mixed old and new UI while follow-up slices retrofit existing surfaces.

This document is the first success checkpoint. It must be approved before value-changing design implementation starts.

## Current Baseline vs Target Direction

| Area | Current C2 Bright Kitchen | Baemin-style target |
| --- | --- | --- |
| App mood | warm cream, orange, kitchen editorial | clean white, mint accent, dense mobile app |
| Primary brand | `--brand: #FF6C3C` | mint direction from prototype, pending value approval |
| Background | `--background: #fff9f2` | white app canvas, pending value approval |
| Text | warm/dark navy | neutral ink/gray hierarchy |
| Components | current recipe cards, modal family, H1/H2/H5 decisions | keep behavior, restyle surfaces/components gradually |
| Evidence | existing authority reports by screen | before/after evidence per retrofit slice |

## Prototype Authority Vocabulary

These definitions are the canonical vocabulary for post-`h7` future-screen design authority. Workpack gates such as `h8-baemin-prototype-reference-future-screens-direction` may classify screens with these terms, but must not redefine them.

| Term | Meaning | Implementation rule |
| --- | --- | --- |
| `prototype parity` | A screen or surface is allowed to target near-100% visual parity with the Baemin prototype, subject to official docs, domain rules, and authority evidence. | Treat prototype capture as the primary visual reference for the named screen/surface only. Preserve API, DB, status, auth, and read-only contracts. |
| `prototype-derived design` | A screen or surface should use the Baemin prototype's visual vocabulary, material, spacing, and mobile app tone, but is not scored as a near-100% parity surface. | Derive local production UI from approved tokens/components and official docs. Do not copy prototype-only layout, behavior, assets, or unsupported features as a contract. |
| `out of prototype scope` | A prototype element is intentionally excluded from production authority unless a later explicit gate promotes it. | Do not score absence as a visual deficit, and do not introduce the element as production scope without a separate approved gate. |

Promotion is always per screen or surface. A slice, tab adjacency, shared bottom-tab presence, or visual similarity does not automatically promote another screen or sub-surface.

## Why Adopt

- The prototype gives the app a clearer mobile product identity.
- White/mint surfaces make card hierarchy and repeated scanning easier.
- The prototype's card, chip, app bar, and sheet language can be migrated without changing backend contracts.
- A staged rollout lets ongoing slice09 continue while older screens are retrofitted later.

## Non-Goals

- Do not change API contracts, DB schema, status transitions, permissions, or domain rules.
- Do not change information architecture just because the prototype shows a different screen.
- Do not ship prototype-only `PANTRY` or `MYPAGE` as production scope before their official slices.
- Do not add new font dependencies or external assets without explicit approval.
- Do not import Jua or any other prototype-only font into production; the prototype's Google Fonts usage does not constitute approval.
- Do not treat prototype JSX as production implementation.
- Do not promote prototype-only bottom tab behavior, `Jua`, or prototype-only assets through screen adjacency.

## Approval Boundaries

| Needs user approval | Agent may decide |
| --- | --- |
| Brand color value | CSS variable naming |
| App background value | Internal component structure |
| Font direction or dependency | PR split and branch names |
| Final screen feel | Screenshot/evidence paths |
| App-wide visual confirmation | Verification command details |

## Rollout Order

1. `h6-baemin-style-direction`: lock this direction, non-goals, and evidence plan.
2. `baemin-style-tokens-additive`: add new non-conflicting tokens with no expected visual diff.
3. `baemin-style-token-values`: change current token values only after explicit approval.
4. `baemin-style-shared-components`: restyle common primitives and sheet/card language.
5. `baemin-style-home-retrofit`: retrofit `HOME` while preserving H1 structure.
6. `baemin-style-recipe-detail-retrofit`: retrofit `RECIPE_DETAIL` actions and sheets while preserving H5 decisions.
7. `baemin-style-planner-week-retrofit`: retrofit `PLANNER_WEEK` visually while preserving H2 day-card behavior.
8. `h7-baemin-prototype-parity-direction`: near-100% prototype parity for `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, and modal/overlay family.
9. `h8-baemin-prototype-reference-future-screens-direction`: classify planned slice 13-19 screens by `prototype parity`, `prototype-derived design`, or `out of prototype scope`.
10. Future official slices consume their screen-level classification after the relevant gate has merged.

## Existing Slice Policy

- Already-developed slice1-8 surfaces are not immediately rewritten in this gate.
- slice09 is not blocked by this redesign. If no Baemin foundation exists yet, slice09 uses the current approved design and is retrofitted later.
- Future slices should reference this direction after merge, but cannot expand product scope from the prototype alone.
- `h7` remains historical and limited to `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, and modal/overlay family.
- For slice 13 and later, `h8` supplies the rollout matrix while this document remains the vocabulary source.

## Prototype Conflict Rules

- Official docs beat prototype code.
- Existing H1/H2/H5 decisions remain locked unless a new user-approved gate supersedes them.
- Cooking-method color semantics remain stable through `--cook-*` tokens.
- Visual redesign must not relax read-only, ownership, status transition, or login-gate rules.

## Follow-Up Approval Checkpoints

| Checkpoint | Required before |
| --- | --- |
| Direction doc approval | any value-changing UI work |
| Token value approval | changing `--brand`, `--background`, `--foreground`, font stack |
| Component evidence | shared component rollout |
| Anchor authority report | marking `HOME`, `RECIPE_DETAIL`, or `PLANNER_WEEK` as confirmed |
