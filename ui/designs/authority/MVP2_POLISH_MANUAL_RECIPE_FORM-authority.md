# Authority Report: MVP2_POLISH_MANUAL_RECIPE_FORM

> slice: mvp2-polish-manual-recipe-form
> stage: 5
> reviewer: Codex fallback authority
> date: 2026-05-20

## Design Status

**confirmed**

Claude Stage 1 was requested through resume session `b48a95b1-d4bf-490f-bd7e-915f2f4521bf` with `session_attach_mode=resume`, `model=opus`, `effort=high`, and `permission_mode=bypassPermissions`, but the CLI produced a zero-byte response and stalled. Per the user instruction, Codex completed fallback implementation and authority review from generated screenshots.

## Changes Summary

- `MANUAL_RECIPE_CREATE` 기준인분 입력 now uses a compact `- / input / +` control with a minimum value of 1.
- The save action remains clickable when required fields are missing and surfaces validation near the relevant fields/sections instead of a bottom requirements box.
- The empty cooking-step helper is now compact inline text, aligned with the ingredient helper rhythm.
- The inline step composer no longer preselects the first cooking method. Adding a step without a selected method is blocked with an inline prompt.
- The mobile ingredient modal shows selected ingredient chips below the category rail, and each chip can be tapped to deselect.
- The `선택한 재료 추가` button switches to the primary active color when at least one ingredient is selected.

## Scope Guard

- API, DB, auth, RLS, route, and state-transition contracts unchanged.
- Direct recipe save payload structure unchanged.
- Ingredient and cooking-method lookup contracts unchanged.
- YT_IMPORT, RECIPE_DETAIL, planner-add, and recipebook flows unchanged.
- Web token and global app token values unchanged.

## Evidence

> evidence:
> - MANUAL_RECIPE_CREATE base servings stepper 390: `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-base-servings-stepper-mobile.png`
> - MANUAL_RECIPE_CREATE method required validation 390: `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-method-required-validation-mobile.png`
> - MANUAL_RECIPE_CREATE field validation on save 390: `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-field-validation-on-save-mobile.png`
> - MANUAL_RECIPE_CREATE ingredient modal selection 390: `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-ingredient-modal-selection-mobile.png`
> - MANUAL_RECIPE_CREATE narrow 320: `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-narrow.png`
> - Exploratory report: `ui/designs/evidence/mvp2-polish-manual-recipe-form/exploratory-report.json`
> - Eval result: `ui/designs/evidence/mvp2-polish-manual-recipe-form/eval-result.json`

## Visual Review

| Surface | Result | Notes |
| --- | --- | --- |
| Base servings stepper | pass | The `- / input / +` control is compact, has stable dimensions, and keeps the input readable at mobile width. |
| Save validation | pass | Missing title, ingredients, and steps are explained near their sections without a separate bottom box competing with the form. |
| Step composer | pass | Cooking-method chips are visually available, but no method is selected by default; the method-required prompt is local to the composer. |
| Ingredient modal | pass | Selected chips sit directly below category controls and remain tappable without pushing the main ingredient list off screen. |
| Active add button | pass | The completion button changes from neutral disabled treatment to primary active color once a selection exists. |
| Narrow viewport | pass | 320px evidence keeps controls inside the viewport without text/input overlap. |

## Verification

- `pnpm vitest run tests/manual-recipe-create-screen.test.tsx tests/recipe-ingredient-add-modal.test.tsx` — passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm playwright test tests/e2e/slice-18-manual-recipe-create.spec.ts --project=mobile-chrome` — passed.
- `pnpm playwright test tests/e2e/tmp-mvp2-manual-recipe-form-evidence.spec.ts --project=mobile-chrome` — passed, generated screenshots; temporary spec deleted after capture.
- `pnpm playwright test tests/e2e/tmp-mvp2-manual-method-evidence.spec.ts --project=mobile-chrome` — passed, generated method-required screenshot; temporary spec deleted after capture.
- `pnpm playwright test tests/e2e/qa-visual.spec.ts -g "manual recipe desktop screen" --project=desktop-chrome --update-snapshots` — passed, updated intentional baseline.
- `pnpm playwright test tests/e2e/qa-visual.spec.ts -g "manual recipe desktop screen" --project=desktop-chrome` — passed.
- `pnpm verify:frontend` — passed after the intentional visual baseline update.

## Scorecard

| Dimension | Score |
| --- | --- |
| Mobile UX | 4/5 |
| Interaction Clarity | 5/5 |
| Visual Hierarchy | 4/5 |
| Color/Material Fit | 4/5 |
| Familiar App Pattern Fit | 4/5 |

## Verdict

verdict: pass

**PASS** — `confirmed_allowed: true`

- Blockers: 0
- Majors: 0
- Minors: 0
