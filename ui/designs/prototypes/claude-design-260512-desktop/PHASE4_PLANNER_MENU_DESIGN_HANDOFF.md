# Phase 4 Planner/Menu Design Handoff

Date: 2026-05-14 KST
Target: `ui/designs/prototypes/claude-design-260512-desktop/`
Evidence: `ui/designs/evidence/desktop-modern-redesign/phase-4/`
Claude design spec: `.omx/artifacts/claude-delegate-c18117b4-d57a-4e67-8f2a-115df7704e63-phase4-planner-menu-design-spec-response-20260514T000000Z.md`

## Scope Closed

Phase 4 closes these 10 ledger rows:

- `screen:MEAL`
- `screen:MENU_ADD`
- `screen:MANUAL_RECIPE_CREATE`
- `screen:YT_IMPORT`
- `surface:MENU_ADD::RecipeSearchPicker`
- `surface:MENU_ADD::RecipeBookSelector`
- `surface:MENU_ADD::RecipeBookDetailPicker`
- `surface:MENU_ADD::PantryMatchPicker`
- `surface:MENU_ADD::PlannedServingsInput`
- `modal:MANUAL_RECIPE_CREATE::IngredientPickerModal`

## Implementation Summary

- Replaced `MENU_ADD` toast-only entries with real static prototype routes for recipe search, recipebook selection, pantry matching, manual recipe creation, and YouTube import.
- Added a shared `PlannedServingsConfirmModal` so every picker flow confirms date, meal column, and servings before creating a meal.
- Added a manual-create-specific ingredient picker that is visually and behaviorally distinct from the HOME ingredient filter.
- Added temporary local recipe creation for manual and YouTube flows without changing production API, DB, or official contracts.
- Updated `MEAL` to read the app's current meal state, show pantry-held marks, and adapt actions for registered/shopped/cooked states.

## Evidence

Visual QA generated 19 screenshots and `visual-qa-report.json`.

Key assertions passed:

- No horizontal overflow at `1024`, `1280`, or `1440` on covered Phase 4 surfaces.
- `RecipeSearchPickerScreen` search autofocus and empty state.
- `RecipeBookSelectorScreen` six recipebook rows.
- `PantryMatchPickerScreen` progress bars and descending match sort.
- `PlannedServingsConfirmModal` seven date chips and three meal segments.
- `ManualRecipeCreateScreen` ingredient editing and manual ingredient picker.
- `YtImportScreen` URL input and simulated extraction review.
- Zero page errors, zero console errors, zero failed requests.

## Remaining Open Rows

Phase 5+ rows remain open by design: MyPage, full recipebooks/detail/settings, pantry/shopping, cooking, leftovers, and ate-list surfaces.
