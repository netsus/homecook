# Wave1 UX Remediation Touchpoint Matrix

## Purpose

This matrix is the Codex-owned Phase 0 handoff artifact for Wave1 UX remediation.
It maps each remediation phase to concrete implementation files, fixed mobile reference screenshots, tests, and contract risks.

Source plan: `.omx/plans/wave1-ux-remediation-ralplan-20260514T091938Z.md`

## Phase 1 — Mobile Common Foundation

### Scope

Mobile-only shell and shared visual foundation. This is not a global web/runtime redesign.

### Files

- `components/layout/app-shell.tsx`
- `components/layout/bottom-tabs.tsx`
- `components/layout/wave1-mobile-bottom-tab.tsx`
- `components/layout/app-header.tsx`
- `components/auth/login-screen.tsx`
- `components/settings/settings-screen.tsx`
- `components/settings/settings-mobile-screen.tsx`
- `components/cooking/cook-mode-screen.tsx`
- `components/cooking/cook-mode-mobile-ui.tsx`
- `components/cooking/standalone-cook-mode-screen.tsx`
- `components/pantry/pantry-screen.tsx`
- `components/mypage/mypage-screen.tsx`
- `app/page.tsx`
- `app/login/page.tsx`
- `app/settings/page.tsx`
- `app/cooking/sessions/[session_id]/cook-mode/page.tsx`
- `app/cooking/recipes/[recipe_id]/cook-mode/page.tsx`
- `app/pantry/page.tsx`
- `app/mypage/page.tsx`

### Reference Screens

- `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-home.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-login.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-login.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-settings.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-settings.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-account.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-account.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-mode-planner.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-mode-planner.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-mode-standalone.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-mode-standalone.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage.png`
- `ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage.png`

### Tests / Evidence

- `tests/e2e/slice-wave1-port-foundation.spec.ts`
- `tests/e2e/qa-visual.spec.ts`
- `tests/home-screen.test.tsx`
- `tests/settings-screen.test.tsx`
- `tests/cook-mode-screen.test.tsx`
- `tests/standalone-cook-mode-screen.test.tsx`
- `tests/pantry-screen.test.tsx`
- `tests/mypage-screen.test.tsx`

### Acceptance

- HOME, PANTRY, and MYPAGE use one bottom tab geometry and active state rule.
- LOGIN, SETTINGS/ACCOUNT, and COOK_MODE do not show the bottom tab.
- PANTRY tab uses a refrigerator icon, not the current container/box icon.
- Loading background, button/chip radius, and modal/sheet chrome use the Phase 0 foundation spec.
- Desktop/web is smoke-tested only; no web redesign is included.
- Affected fixed references are either refrozen or explicitly superseded in `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md` before final exact parity is claimed. A `user-approved design evolution` note alone is not enough for closeout while the matrix still points to old screenshots.

## Phase 2 — Discovery / Detail

### Files

- `app/page.tsx`
- `components/home/home-screen.tsx`
- `components/home/recipe-card.tsx`
- `components/home/ingredient-filter-modal.tsx`
- `app/recipe/[id]/page.tsx`
- `components/recipe/recipe-detail-screen.tsx`
- `components/recipe/save-modal.tsx`
- `components/recipe/planner-add-sheet.tsx`
- `components/auth/login-gate-modal.tsx`

### Reference Screens

- `mobile-390-home.png` / `mobile-320-home.png`
- `mobile-390-home-sort-open-state.png` / `mobile-320-home-sort-open-state.png`
- `mobile-390-ingredient-filter-modal.png` / `mobile-320-ingredient-filter-modal.png`
- `mobile-390-recipe-detail.png` / `mobile-320-recipe-detail.png`
- `mobile-390-save-popup.png` / `mobile-320-save-popup.png`
- `mobile-390-planner-add-popup.png` / `mobile-320-planner-add-popup.png`
- `mobile-390-login-gate-modal.png` / `mobile-320-login-gate-modal.png`

### Tests / Evidence

- `tests/home-screen.test.tsx`
- `tests/recipe-card.test.tsx`
- `tests/recipe-detail-screen.test.tsx`
- `tests/recipe-add-to-planner.test.tsx`
- `tests/e2e/slice-02-discovery-filter.spec.ts`
- `tests/e2e/slice-03-recipe-like.spec.ts`
- `tests/e2e/slice-04-recipe-save.spec.ts`
- `tests/e2e/slice-06-recipe-to-planner.spec.ts`
- `tests/e2e/slice-wave1-port-discovery-detail.spec.ts`
- `tests/e2e/qa-wave1-discovery-detail-evidence.spec.ts`
- `tests/e2e/qa-wave1-recipe-detail-phase4-evidence.spec.ts`

### Contract Risk

- Server-backed recipe tag/category filter requires official API/DB/docs contract evolution.
- Until approved, HOME category chips must use existing fields or UI-only fixture behavior.

## Phase 3 — Planner / Menu Add / Owned Pickers

### Files

- `app/planner/page.tsx`
- `app/planner/[date]/[columnId]/page.tsx`
- `app/menu-add/page.tsx`
- `components/planner/planner-week-screen.tsx`
- `components/planner/meal-screen.tsx`
- `components/planner/menu-add-screen.tsx`
- `components/planner/recipe-search-picker.tsx`
- `components/planner/recipe-book-selector.tsx`
- `components/planner/recipe-book-detail-picker.tsx`
- `components/planner/pantry-match-picker.tsx`

### Reference Screens

- `mobile-390-planner.png` / `mobile-320-planner.png`
- `mobile-390-meal-screen.png` / `mobile-320-meal-screen.png`
- `mobile-390-planner-meal-add.png` / `mobile-320-planner-meal-add.png`
- `mobile-390-recipe-search-picker.png` / `mobile-320-recipe-search-picker.png`
- `mobile-390-recipe-book-selector.png` / `mobile-320-recipe-book-selector.png`
- `mobile-390-recipe-book-detail-picker.png` / `mobile-320-recipe-book-detail-picker.png`
- `mobile-390-pantry-match-picker.png` / `mobile-320-pantry-match-picker.png`
- `mobile-390-planned-servings-input.png` / `mobile-320-planned-servings-input.png`

### Tests / Evidence

- `tests/planner-week-screen.test.tsx`
- `tests/planner-meal-screen.test.tsx`
- `tests/menu-add-screen.test.tsx`
- `tests/08b-recipebook-picker.backend.test.ts`
- `tests/08b-pantry-match.backend.test.ts`
- `tests/e2e/slice-05-planner-week-core.spec.ts`
- `tests/e2e/slice-07-meal-manage.spec.ts`
- `tests/e2e/slice-08a-meal-add-search.spec.ts`
- `tests/e2e/slice-08b-meal-add-books-pantry.spec.ts`
- `tests/e2e/qa-wave1-planner-meal-add-evidence.spec.ts`

### Contract Risk

- Route-to-modal changes must be checked against official user flow.

## Phase 4 — Manual Recipe / YouTube Import

### Files

- `app/menu/add/manual/page.tsx`
- `app/menu/add/youtube/page.tsx`
- `components/recipe/manual-recipe-create-screen.tsx`
- `components/recipe/recipe-ingredient-add-modal.tsx`
- `components/recipe/youtube-import-screen.tsx`

### Reference Screens

- `mobile-390-manual-recipe-create.png` / `mobile-320-manual-recipe-create.png`
- `mobile-390-yt-import.png` / `mobile-320-yt-import.png`
- `mobile-390-yt-import-review.png` / `mobile-320-yt-import-review.png`

### Tests / Evidence

- `tests/manual-recipe-create.backend.test.ts`
- `tests/youtube-import.backend.test.ts`
- `tests/e2e/slice-18-manual-recipe-create.spec.ts`
- `tests/e2e/slice-19-youtube-import.spec.ts`

## Phase 5 — Shopping / Cooking

### Files

- `app/shopping/flow/page.tsx`
- `app/shopping/lists/[list_id]/page.tsx`
- `app/cooking/ready/page.tsx`
- `app/cooking/sessions/[session_id]/cook-mode/page.tsx`
- `app/cooking/recipes/[recipe_id]/cook-mode/page.tsx`
- `components/shopping/shopping-flow-screen.tsx`
- `components/shopping/shopping-detail-screen.tsx`
- `components/shopping/pantry-reflection-popup.tsx`
- `components/cooking/cook-ready-list-screen.tsx`
- `components/cooking/cook-mode-screen.tsx`
- `components/cooking/cook-mode-mobile-ui.tsx`
- `components/cooking/standalone-cook-mode-screen.tsx`
- `components/cooking/consumed-ingredient-sheet.tsx`

### Reference Screens

- `mobile-390-shopping-flow-select.png` / `mobile-320-shopping-flow-select.png`
- `mobile-390-shopping-flow-review.png` / `mobile-320-shopping-flow-review.png`
- `mobile-390-shopping-detail.png` / `mobile-320-shopping-detail.png`
- `mobile-390-pantry-reflect-picker.png` / `mobile-320-pantry-reflect-picker.png`
- `mobile-390-cook-ready-list.png` / `mobile-320-cook-ready-list.png`
- `mobile-390-cook-mode-planner.png` / `mobile-320-cook-mode-planner.png`
- `mobile-390-cook-mode-standalone.png` / `mobile-320-cook-mode-standalone.png`
- `mobile-390-consumed-ingredient-checklist.png` / `mobile-320-consumed-ingredient-checklist.png`

### Tests / Evidence

- `tests/shopping-flow-screen.test.tsx`
- `tests/shopping-detail.frontend.test.tsx`
- `tests/shopping-detail.backend.test.ts`
- `tests/cook-ready-list-screen.test.tsx`
- `tests/cook-mode-screen.test.tsx`
- `tests/standalone-cook-mode-screen.test.tsx`
- `tests/e2e/slice-09-shopping-preview-create.spec.ts`
- `tests/e2e/slice-10a-shopping-detail-interact.spec.ts`
- `tests/e2e/slice-10b-shopping-share-text.spec.ts`
- `tests/e2e/slice-11-shopping-reorder.spec.ts`
- `tests/e2e/slice-12a-shopping-complete.spec.ts`
- `tests/e2e/slice-12b-shopping-pantry-reflect.spec.ts`
- `tests/e2e/slice-14-cook-session-start.spec.ts`
- `tests/e2e/slice-15a-cook-planner-complete.spec.ts`
- `tests/e2e/slice-15b-cook-standalone-complete.spec.ts`
- `tests/e2e/qa-wave1-shopping-cooking-evidence.spec.ts`

### Contract Risk

- Meal direct cook mode may alter the current ready-list flow; official flow review is required before implementation.

## Phase 6 — Pantry / Pantry Bundle

### Files

- `app/pantry/page.tsx`
- `components/pantry/pantry-screen.tsx`
- `components/pantry/pantry-mobile-screen.tsx`
- `components/pantry/pantry-add-sheet.tsx`
- `components/pantry/pantry-bundle-picker.tsx`
- `components/pantry/pantry-mobile-visuals.ts`

### Reference Screens

- `mobile-390-pantry.png` / `mobile-320-pantry.png`
- `mobile-390-pantry-add-sheet.png` / `mobile-320-pantry-add-sheet.png`
- `mobile-390-pantry-bundle-picker.png` / `mobile-320-pantry-bundle-picker.png`

### Tests / Evidence

- `tests/pantry-screen.test.tsx`
- `tests/pantry-core.backend.test.ts`
- `tests/e2e/slice-13-pantry-core.spec.ts`
- `tests/e2e/qa-wave1-pantry-evidence.spec.ts`

## Phase 7 — Account / Library / Leftovers

### Files

- `app/mypage/page.tsx`
- `app/settings/page.tsx`
- `app/mypage/recipe-books/[book_id]/page.tsx`
- `app/leftovers/page.tsx`
- `app/leftovers/ate/page.tsx`
- `components/mypage/mypage-screen.tsx`
- `components/mypage/mypage-mobile-screen.tsx`
- `components/settings/settings-screen.tsx`
- `components/settings/settings-mobile-screen.tsx`
- `components/recipebook/recipebook-detail-screen.tsx`
- `components/leftovers/leftovers-screen.tsx`
- `components/leftovers/ate-list-screen.tsx`

### Reference Screens

- `mobile-390-mypage.png` / `mobile-320-mypage.png`
- `mobile-390-mypage-recipebook-tab.png` / `mobile-320-mypage-recipebook-tab.png`
- `mobile-390-mypage-shopping-lists-tab.png` / `mobile-320-mypage-shopping-lists-tab.png`
- `mobile-390-settings.png` / `mobile-320-settings.png`
- `mobile-390-account.png` / `mobile-320-account.png`
- `mobile-390-nickname-edit-sheet.png` / `mobile-320-nickname-edit-sheet.png`
- `mobile-390-logout-confirm.png` / `mobile-320-logout-confirm.png`
- `mobile-390-account-delete-confirm.png` / `mobile-320-account-delete-confirm.png`
- `mobile-390-recipebook-detail.png` / `mobile-320-recipebook-detail.png`
- `mobile-390-recipebook-delete-confirm.png` / `mobile-320-recipebook-delete-confirm.png`
- `mobile-390-leftovers.png` / `mobile-320-leftovers.png`
- `mobile-390-ate-list.png` / `mobile-320-ate-list.png`

### Tests / Evidence

- `tests/mypage-screen.test.tsx`
- `tests/settings-screen.test.tsx`
- `tests/settings-account.backend.test.ts`
- `tests/recipe-book-detail-screen.test.tsx`
- `tests/recipebook-detail.backend.test.ts`
- `tests/leftovers.frontend.test.tsx`
- `tests/e2e/slice-16-leftovers.spec.ts`
- `tests/e2e/slice-17a-mypage.spec.ts`
- `tests/e2e/slice-17b-recipebook-detail.spec.ts`
- `tests/e2e/slice-17c-settings.spec.ts`
- `tests/e2e/qa-wave1-mypage-core-evidence.spec.ts`
- `tests/e2e/qa-wave1-settings-core-evidence.spec.ts`
- `tests/e2e/qa-wave1-recipebook-detail-evidence.spec.ts`
- `tests/e2e/qa-wave1-leftovers-ate-evidence.spec.ts`
- `tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts`
