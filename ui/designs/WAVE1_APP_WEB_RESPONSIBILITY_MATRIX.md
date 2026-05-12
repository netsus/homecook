# Wave1 App/Web Responsibility Matrix

> Status: active Phase 3 reference freeze for Wave1 mobile 100% prototype parity
> Created: 2026-05-12
> Fixed prototype SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> Reference manifest: `ui/designs/reference/wave1-fixed-prototype/manifest.json`
> Baseline authority: `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`

## Purpose

This matrix separates Wave1 mobile app parity work from web/desktop redesign work before any MVP UI porting resumes.

For this computer, the goal is mobile app parity only. Existing web/desktop UI must be preserved or smoke-tested when shared code changes, then redesigned later on the separate web track.

## Authority

Use this order for Wave1 porting:

1. MVP official docs and current service implementation govern behavior, API contracts, auth, permissions, status transitions, read-only states, loading, empty, error, and unauthorized states.
2. `ui/designs/reference/wave1-fixed-prototype/manifest.json` and `ui/designs/WAVE1_MOBILE_APP_BASELINE.md` govern mobile visual/layout output for `exact-reference-ready` rows.
3. This matrix decides whether a row may enter mobile porting now, must first receive new fixed screenshots, or belongs to later web redesign.
4. `ui/designs/BAEMIN_STYLE_DIRECTION.md` supplies the canonical classification vocabulary: `prototype parity`, `prototype-derived design`, and `out of prototype scope`.

Do not redefine the vocabulary in slice workpacks. Link back here.

## Phase 2 Decisions

- The default token implementation path is a mobile-scoped Wave1 token layer, not a global runtime token replacement.
- `app/globals.css` and legacy C2/coral runtime values remain web/legacy defaults until a separate web redesign branch owns the impact.
- A surface may start Phase 4/5 mobile porting only when it is either `exact-reference-ready` with 390px and 320px fixed references, or Phase 3 has captured and committed those references first.
- Missing screenshots are blockers for 100% parity claims, not acceptable "approved divergence."
- Desktop screenshots in the manifest are smoke references only for this track. They do not authorize desktop/web redesign here.
- Phase 3 added 62 new mobile reference screenshots for 31 additional mobile surface states. The LoginGateModal follow-up added the final 2 mobile reference screenshots after introducing a deterministic phone-shell trigger.

## 2026-05-12 Contract Decisions

- HOME keeps the MVP default sort as `view_count`, replaces visible `like_count` sorting with `latest`, and targets prototype visual parity for the sort surface.
- SavePopup now officially supports multi-save with `book_ids[]`; do not classify prototype multi-select as a functional divergence.
- Shopping completion opens the pantry reflect picker before the complete API mutation; refreeze or judge the picker against the pre-complete backdrop, not a completed/read-only backdrop.
- `GLOBAL::LoginGateModal` visual output is prototype parity; production return-to-action behavior stays MVP-governed.
- MYPAGE shopping history uses `completed_at` and `다시열기` for completed read-only records.
- LEFTOVERS, ATE_LIST, and RECIPEBOOK_DETAIL now expose the prototype-required card metadata through API v1.2.4 / DB v1.3.3.
- Wave1 mobile visual parity follows prototype colors, touch sizes, and shared bottom-tab icon shapes. Accessibility/color/icon substitutions are not accepted as classified differences unless the prototype is refrozen.

Reference refresh before Phase4 rerun:

- `HOME_SORT_OPEN_STATE` must be refreshed so the fixed reference uses `조회수순 / 최신순 / 저장순 / 플래너 등록순` rather than the old prototype-only `빠른 조리순`.
- `SHOPPING_DETAIL_PANTRY_REFLECT_PICKER` must be refreshed or recaptured against the pre-complete backdrop required by the MVP complete API flow.
- SavePopup does not need a functional-divergence exception after API v1.2.4 because multi-save is now official.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `exact-reference-ready` | The manifest has committed 390px and 320px mobile reference screenshots. This row can be ported and judged against the exact mobile gate. |
| `needs-prototype-freeze` | The prototype source exists or the production surface needs Wave1 treatment, but committed 390px and 320px references are missing. Capture/freeze in Phase 3 before porting. |
| `excluded-functional` | Prototype visuals may inform the shell, but production behavior must diverge because official MVP behavior requires it. |
| `web-only` | Not part of this mobile app parity track. Keep or redesign separately on the web track. |

No current Phase 2 row uses `excluded-functional`; this is intentional. Functional constraints are recorded inside each row's verification notes unless a later Phase 3 capture proves a whole surface must be visually classified this way.

## Required Verification Language

For every `exact-reference-ready` mobile row, PR evidence must include:

- fixed prototype screenshot paths at `390px` and `320px`;
- generated MVP service screenshots at `390px` and `320px`;
- screenshot diff;
- computed-style audit for colors, fonts, type scale, line height, letter spacing, radius, border, shadow, opacity, and spacing;
- DOM geometry audit for key shell/card/list/CTA/sheet/tab elements;
- visual blocker count `0`;
- unclassified visual difference count `0`;
- functional regression result for MVP behavior.

`90+`, `95+`, "near-100%", and broad "approved divergence" are not completion criteria.

## Exact-Reference-Ready Rows

The fixed-reference paths below are the committed manifest entries under `ui/designs/reference/wave1-fixed-prototype/`.

| surface | mobile parity status | canonical classification | fixed reference | prototype source | MVP component | web status | desktop smoke owner | required functional tests | 100% parity verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `HOME` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-home.png` | `screens/home.jsx::HomeScreen` | `app/page.tsx`<br>`components/home/home-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shared shell or responsive CSS changes | `tests/home-screen.test.tsx`<br>`tests/e2e/slice-02-discovery-filter.spec.ts` | Exact gate bundle: reference/service screenshots, screenshot diff, computed-style audit, DOM geometry audit, blocker `0`, unclassified difference `0`. Sort contract: `view_count` default, visible `latest`, `save_count`, `plan_count`. |
| `RECIPE_DETAIL` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-detail.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-detail.png` | `screens/detail.jsx::RecipeDetail` | `app/recipe/[id]/page.tsx`<br>`components/recipe/recipe-detail-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shared detail layout changes | `tests/recipe-detail-screen.test.tsx`<br>`tests/e2e/slice-06-recipe-to-planner.spec.ts` | Exact gate bundle. SavePopup multi-select is official; planner/login return-to-action behavior remains MVP-governed. |
| `PLANNER_WEEK` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-planner.png` | `screens/planner.jsx::PlannerScreen` | `app/planner/page.tsx`<br>`components/planner/planner-week-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if planner responsive layout changes | `tests/planner-week-screen.test.tsx`<br>`tests/e2e/slice-05-planner-week-core.spec.ts` | Exact gate bundle. Existing planner column customization contract stays authoritative. |
| `MENU_ADD` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner-meal-add.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-planner-meal-add.png` | `screens/wave1.jsx::MenuAddScreen` | `app/menu-add/page.tsx`<br>`components/planner/menu-add-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shared picker shell changes | `tests/menu-add-screen.test.tsx`<br>`tests/e2e/slice-08a-meal-add-search-core.spec.ts`<br>`tests/e2e/slice-08b-meal-add-books-pantry.spec.ts` | Exact gate bundle for the MENU_ADD shell. Internal picker states are frozen separately in the Phase 3 exact-ready rows. |
| `SHOPPING_DETAIL` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-detail.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-detail.png` | `screens/wave1.jsx::ShoppingDetailScreen` | `app/shopping/lists/[list_id]/page.tsx`<br>`components/shopping/shopping-detail-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shopping responsive layout changes | `tests/shopping-detail.frontend.test.tsx`<br>`tests/e2e/slice-10a-shopping-detail-interact.spec.ts`<br>`tests/e2e/slice-12a-shopping-complete.spec.ts` | Exact gate bundle. Read-only, `409`, exclude/uncheck, and pantry reflect semantics remain MVP-governed; pantry reflect picker should be judged on the pre-complete state. |
| `PANTRY` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry.png` | `screens/pantry.jsx::PantryScreen` | `app/pantry/page.tsx`<br>`components/pantry/pantry-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if pantry responsive layout changes | `tests/pantry-screen.test.tsx`<br>`tests/e2e/slice-13-pantry-core.spec.ts` | Exact gate bundle for the PANTRY screen. Add sheet and bundle picker states are frozen separately in the Phase 3 exact-ready rows. |
| `MYPAGE` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage.png` | `screens/mypage.jsx::MyPageScreen` | `app/mypage/page.tsx`<br>`components/mypage/mypage-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if mypage responsive layout changes | `tests/mypage-screen.test.tsx`<br>`tests/e2e/slice-17a-mypage.spec.ts` | Exact gate bundle for the visible MYPAGE shell. Recipebook and shopping-list tab internals are frozen separately in the Phase 3 exact-ready rows; shopping history uses `completed_at` + `다시열기`. |
| `SETTINGS` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-settings.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-settings.png` | `screens/wave1.jsx::SettingsScreen` | `app/settings/page.tsx`<br>`components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings responsive layout changes | `tests/settings-screen.test.tsx`<br>`tests/e2e/slice-17c-settings.spec.ts` | Exact gate bundle. Planner column management remains the merged MVP contract. |
| `ACCOUNT` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-account.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-account.png` | `screens/extras.jsx::MyPageAccountScreen` | `app/settings/page.tsx` account section<br>`components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings/account responsive layout changes | `tests/settings-screen.test.tsx`<br>`tests/settings-account.backend.test.ts`<br>`tests/e2e/slice-17c-settings.spec.ts` | Exact gate bundle for visible account management UI. Logout/delete/nickname modal states are frozen separately in the Phase 3 exact-ready rows. |
| `LEFTOVERS` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-leftovers.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-leftovers.png` | `screens/wave1.jsx::LeftoversScreen` | `app/leftovers/page.tsx`<br>`components/leftovers/leftovers-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if leftovers responsive layout changes | `tests/leftovers.frontend.test.tsx`<br>`tests/e2e/slice-16-leftovers.spec.ts` | Exact gate bundle. Eat/uneat API behavior remains MVP-governed; card metadata follows API v1.2.4. |

## Phase 3 Exact-Reference-Ready Rows

Phase 3 and the LoginGateModal reference-freeze follow-up added the fixed-reference paths below from the existing fixed prototype code. Existing Phase 1/2 references were skipped during capture; these rows add only new mobile 390px/320px screenshots.

| surface | mobile parity status | canonical classification | fixed reference | prototype source | MVP component | web status | desktop smoke owner | required functional tests | 100% parity verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LOGIN | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-login.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-login.png | screens/wave1.jsx::LoginScreen | app/login/page.tsx / components/auth/login-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Auth provider behavior remains MVP-governed. |
| GLOBAL::LoginGateModal | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-login-gate-modal.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-login-gate-modal.png | screens/modals.jsx::LoginGate via phone-shell `?modal=login-gate` trigger | components/auth/login-gate-modal.tsx | shared responsive preserve | Codex Stage 6 if auth modal responsive layout changes | tests/auth-gate-store.test.ts<br>tests/e2e/slice-06-recipe-to-planner.spec.ts | Exact gate bundle. Visual follows prototype; return-to-action remains MVP-governed. |
| ATE_LIST | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-ate-list.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-ate-list.png | screens/wave1.jsx::AteListScreen via LEFTOVERS -> 다먹음 -> 다먹은 요리 | app/leftovers/ate/page.tsx / components/leftovers/ate-list-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Eat/uneat API behavior remains MVP-governed; card metadata follows API v1.2.4. |
| RECIPEBOOK_DETAIL | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-recipebook-detail.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-recipebook-detail.png | screens/wave1.jsx::MyPageRecipebookDetailScreen | app/mypage/recipe-books/[book_id]/page.tsx / components/recipebook/recipebook-detail-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Recipebook ownership/deletion behavior remains MVP-governed; card metadata follows API v1.2.4. |
| MEAL_SCREEN | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-meal-screen.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-meal-screen.png | screens/extras.jsx::MealDetailScreen | app/planner/[date]/[columnId]/page.tsx / components/planner/meal-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Planner status transitions remain MVP-governed. |
| SHOPPING_FLOW_SELECT | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-flow-select.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-flow-select.png | screens/extras.jsx::ShoppingCreateScreen select step | app/shopping/flow/page.tsx / components/shopping/shopping-flow-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Shopping preview eligibility remains MVP-governed. |
| SHOPPING_FLOW_REVIEW | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-flow-review.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-flow-review.png | screens/extras.jsx::ShoppingCreateScreen review step | app/shopping/flow/page.tsx / components/shopping/shopping-flow-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Pantry exclude behavior remains MVP-governed. |
| COOK_READY_LIST | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-ready-list.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-ready-list.png | screens/extras.jsx::CookListScreen | app/cooking/ready/page.tsx / components/cooking/cook-ready-list-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Cook-session start behavior remains MVP-governed. |
| COOK_MODE_PLANNER | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-mode-planner.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-mode-planner.png | screens/extras.jsx::CookRunScreen planner meal route | app/cooking/sessions/[session_id]/cook-mode/page.tsx / components/cooking/cook-mode-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Do not add serving adjustment UI in cook mode. |
| COOK_MODE_STANDALONE | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-cook-mode-standalone.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-cook-mode-standalone.png | screens/extras.jsx::CookRunScreen standalone recipe route | app/cooking/recipes/[recipe_id]/cook-mode/page.tsx / components/cooking/standalone-cook-mode-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Standalone cooking must not alter planner meal status. |
| MANUAL_RECIPE_CREATE | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-manual-recipe-create.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-manual-recipe-create.png | screens/wave1.jsx::ManualRecipeCreateScreen | app/menu/add/manual/page.tsx / components/recipe/manual-recipe-create-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Numeric quantity validation remains MVP-governed. |
| YT_IMPORT | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-yt-import.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-yt-import.png | screens/wave1.jsx::YtImportScreen input step | app/menu/add/youtube/page.tsx / components/recipe/youtube-import-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Extraction/API behavior remains MVP-governed. |
| YT_IMPORT_REVIEW | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-yt-import-review.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-yt-import-review.png | screens/wave1.jsx::YtImportScreen review step | app/menu/add/youtube/page.tsx / components/recipe/youtube-import-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for extraction review state. |
| MENU_ADD_RECIPE_SEARCH_PICKER | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-search-picker.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-search-picker.png | screens/wave1.jsx::RecipeSearchPicker | components/planner/recipe-search-picker.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for picker state. |
| MENU_ADD_RECIPE_BOOK_SELECTOR | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-book-selector.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-book-selector.png | screens/wave1.jsx::RecipeBookSelector | components/planner/recipe-book-selector.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for book selector state. |
| MENU_ADD_RECIPE_BOOK_DETAIL_PICKER | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-book-detail-picker.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-book-detail-picker.png | screens/wave1.jsx::RecipeBookDetailPicker | components/planner/recipe-book-detail-picker.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for book detail picker state. |
| MENU_ADD_PANTRY_MATCH_PICKER | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-match-picker.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-match-picker.png | screens/wave1.jsx::PantryMatchPicker | components/planner/pantry-match-picker.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for pantry-match picker state. |
| MENU_ADD_PLANNED_SERVINGS_INPUT | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-planned-servings-input.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-planned-servings-input.png | screens/wave1.jsx::PlanningServingsModal | MENU_ADD add flow components | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Planner add commit behavior remains MVP-governed. |
| PANTRY_ADD_SHEET | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-add-sheet.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-add-sheet.png | screens/wave1.jsx::PantryAddSheet | components/pantry/pantry-add-sheet.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Existing pantry duplicate rules remain MVP-governed. |
| PANTRY_BUNDLE_PICKER | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-bundle-picker.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-bundle-picker.png | screens/wave1.jsx::PantryBundlePicker | components/pantry/pantry-bundle-picker.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for bundle picker state. |
| RECIPE_DETAIL_PLANNER_ADD_POPUP | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-planner-add-popup.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-planner-add-popup.png | screens/modals.jsx::PlannerAddPopup | components/recipe/planner-add-sheet.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Date/meal/serving behavior remains MVP-governed. |
| RECIPE_DETAIL_SAVE_POPUP | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-save-popup.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-save-popup.png | screens/modals.jsx::SavePopup | components/recipe/save-modal.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Saved/custom book type rule remains MVP-governed. |
| HOME_SORT_OPEN_STATE | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-home-sort-open-state.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-home-sort-open-state.png | components.jsx::SortDropdown inside screens/home.jsx::HomeScreen | components/home/home-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Current inline SortDropdown open state. Obsolete SortSheet is not the mobile reference. |
| HOME_INGREDIENT_FILTER_MODAL | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-ingredient-filter-modal.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-ingredient-filter-modal.png | screens/wave1.jsx::IngredientFilterModal | components/home/ingredient-filter-modal.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for ingredient filter modal. |
| SHOPPING_DETAIL_PANTRY_REFLECT_PICKER | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry-reflect-picker.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry-reflect-picker.png | screens/wave1.jsx::PantryReflectPicker | components/shopping/pantry-reflection-popup.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Preserve null, empty array, and selected ID semantics. |
| COOK_MODE_CONSUMED_INGREDIENT_CHECKLIST | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-consumed-ingredient-checklist.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-consumed-ingredient-checklist.png | screens/wave1.jsx::ConsumedIngredientSheet | components/cooking/consumed-ingredient-sheet.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Pantry deduction behavior remains MVP-governed. |
| SETTINGS_NICKNAME_EDIT_SHEET | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-nickname-edit-sheet.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-nickname-edit-sheet.png | screens/wave1.jsx::NicknameEditSheet inside screens/extras.jsx::MyPageAccountScreen | components/settings/settings-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Profile mutation behavior remains MVP-governed. |
| SETTINGS_LOGOUT_CONFIRM | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-logout-confirm.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-logout-confirm.png | screens/extras.jsx::MyPageAccountScreen logout ConfirmDialog | components/settings/settings-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Logout side effects remain MVP-governed. |
| SETTINGS_ACCOUNT_DELETE_CONFIRM | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-account-delete-confirm.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-account-delete-confirm.png | screens/extras.jsx::MyPageAccountScreen destructive ConfirmDialog | components/settings/settings-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Account deletion safety remains MVP-governed. |
| MYPAGE_RECIPEBOOK_DELETE_CONFIRM | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-recipebook-delete-confirm.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-recipebook-delete-confirm.png | screens/wave1.jsx::MyPageRecipebookDetailScreen delete ConfirmDialog | components/mypage/mypage-screen.tsx / components/recipebook/recipebook-detail-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle. Deletion authorization remains MVP-governed. |
| MYPAGE_RECIPEBOOK_TAB | exact-reference-ready | prototype-derived design | ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage-recipebook-tab.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage-recipebook-tab.png | screens/wave1.jsx::MyPageRecipebookTab | components/mypage/mypage-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for recipebook tab state. |
| MYPAGE_SHOPPING_LISTS_TAB | exact-reference-ready | prototype parity | ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage-shopping-lists-tab.png<br>ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage-shopping-lists-tab.png | screens/wave1.jsx::MyPageShoppingTab | components/mypage/mypage-screen.tsx | shared responsive preserve | Codex Stage 6 if shared responsive UI changes | See row-specific slice tests and MVP regression tests | Exact gate bundle for shopping-list tab state. Completed rows use `completed_at` and `다시열기`. |

GLOBAL::LoginGateModal is now exact-reference-ready because the prototype owns a deterministic phone-shell trigger for the existing LoginGate component. The trigger is capture-only; production return-to-action remains MVP-governed.

## Needs-Prototype-Freeze Rows

No current mobile app rows remain in `needs-prototype-freeze`.

## Web-Only And Deferred Rows

| surface | mobile parity status | canonical classification | fixed reference | prototype source | MVP component | web status | desktop smoke owner | required functional tests | 100% parity verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DESKTOP_WEB_REDESIGN` | `web-only` | `out of prototype scope` | none for this mobile track | desktop refs in manifest are smoke inputs only | shared page/components as discovered by the web branch | `future web redesign` | Separate web-design computer/branch | Web branch defines its own smoke and parity checks | Not eligible for this mobile exact gate. Do not redesign web while doing mobile app parity. |
| `GLOBAL_RUNTIME_TOKEN_REPLACEMENT` | `web-only` | `out of prototype scope` | none | N/A | `app/globals.css` global values | `future web redesign` | Separate web-design branch | Web branch defines regression suite | Not allowed in Phase 2/Phase 4 unless a later matrix change explicitly proves no web impact. |

## Token Responsibility Matrix

| token area | mobile app owner | web/desktop owner | Phase 2 decision |
| --- | --- | --- | --- |
| Prototype color/type/material tokens | Wave1 mobile app porting slices | Existing web stays legacy until separate redesign | Implement through a mobile-scoped Wave1 token layer by default. Exact-ready mobile rows must render prototype values. |
| Global CSS runtime tokens | Existing MVP runtime | Existing web/legacy runtime | Do not replace globally in this Phase 2 track. Global replacement is deferred to the web branch or a later approved no-impact proof. |
| Per-component exact values | Individual mobile slices when the state is isolated | No web ownership unless shared responsive code is touched | Allowed for isolated sheets/modals, but record the value and avoid silent divergence from `WAVE1_MOBILE_APP_BASELINE.md`. |
| Font and assets, including `Jua` | Mobile parity owner | Web branch decides later | If visible in a fixed mobile reference, package/use the asset or block completion until the reference is refrozen. No silent substitution. |
| Desktop refs in manifest | Smoke only when shared code changes | Future web redesign owner | Use to detect accidental breakage, not to redesign desktop in this track. |

## Phase 3 Reference Capture Result

Phase 3 captured every matrix row that already exists in the fixed mobile prototype and can be reached through deterministic route or interaction scripting.

- New committed mobile references: 64 PNGs for 32 surface states.
- Existing Phase 1/2 references were skipped by default during capture; use pnpm capture:wave1-prototype-lock -- --force only for an intentional user-approved refreeze.
- Split states were recorded separately where needed: SHOPPING_FLOW_SELECT / SHOPPING_FLOW_REVIEW, COOK_MODE_PLANNER / COOK_MODE_STANDALONE, and YT_IMPORT / YT_IMPORT_REVIEW.
- HOME::HomeSortOpenState is now represented by HOME_SORT_OPEN_STATE, the actual current mobile SortDropdown open state. The obsolete SortSheet is not the mobile reference.
- GLOBAL::LoginGateModal is now captured through the prototype-owned phone-shell `?modal=login-gate` trigger.

Each reference capture updated ui/designs/reference/wave1-fixed-prototype/manifest.json and passed pnpm validate:wave1-prototype-lock.

## Phase 2 Closeout Checklist

- Every manifest mobile surface appears in the exact-ready table.
- Every exact-ready table row lists both 390px and 320px reference paths.
- No known missing app surface is silently allowed into porting; every ported row has committed 390px and 320px references.
- Web/desktop redesign is isolated as `web-only` or `future web redesign`.
- Token implementation path is mobile-scoped by default.
- No row uses `90+`, `95+`, or broad approved divergence as completion proof.
