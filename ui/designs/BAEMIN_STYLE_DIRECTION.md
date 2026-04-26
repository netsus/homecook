# Baemin Style Direction

> Status: official product direction adopted by user; runtime implementation not started.

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
8. Future official slices may use prototype `PANTRY`/`MYPAGE` references when those slices begin.

## Existing Slice Policy

- Already-developed slice1-8 surfaces are not immediately rewritten in this gate.
- slice09 is not blocked by this redesign. If no Baemin foundation exists yet, slice09 uses the current approved design and is retrofitted later.
- Future slices should reference this direction after merge, but cannot expand product scope from the prototype alone.

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
