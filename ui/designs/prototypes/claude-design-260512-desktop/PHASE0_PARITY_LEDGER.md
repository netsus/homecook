# Phase 0 Parity Ledger Backfill

Status: Phase 0 backfill complete after Phase 1 foundation merge
Date: 2026-05-13
Target prototype: `ui/designs/prototypes/claude-design-260512-desktop/`
Plan: `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`
Phase 1 merge: PR #441, merge commit `bcc02854a43439d8e5acc5840177df4b8046fde4`

## Purpose

This ledger closes the Phase 0 gap that remained after Phase 1 foundation work started first.

Phase 1 fixed important desktop foundations, but it did not create the required `screen / surface / modal / gate` parity ledger before implementation. This document backfills that control surface so Phase 2 and later phases do not silently miss screens, modals, gates, or desktop states from the 260505 Wave1 app prototype.

## Authority And Scope

Reference order:

1. `ui/designs/prototypes/claude-design-260505-wave1/index.html`
2. `ui/designs/prototypes/claude-design-260512-desktop/`
3. `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`
4. `ui/designs/baemin-full-port-ledger.md`
5. `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`
6. Official product docs through `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`

Scope:

- This is a desktop web prototype redesign ledger.
- It does not authorize production API, DB, or official contract changes.
- Desktop styling remains scoped to the 260512 desktop prototype and later `1024px+` web presentation work.
- Mobile below `1024px` remains protected by the separate Wave1 mobile parity track.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `open` | Not yet designed/implemented/verified for the desktop redesign target. |
| `in_progress` | Currently being worked in the active phase. |
| `verified-foundation` | Phase 1 foundation repaired the shared primitive or visible collapse, but full parity/design closure remains in a later owner phase. |
| `verified` | Fully designed, implemented, and verified for this desktop redesign target. |
| `deferred-with-reason` | Explicitly postponed with a documented reason and owner. |

Important rule:

- Do not mark a row `verified` only because Phase 1 improved shared CSS.
- Use `verified-foundation` when Phase 1 fixed a visual primitive but the full screen/modal/gate still belongs to a later phase.

## Ledger Overrides

These overrides intentionally differ from older ledgers:

| Row | Older treatment | Phase 0 backfill override |
| --- | --- | --- |
| `screen:RECIPEBOOK_DETAIL` | `confirmed-low-risk-reused`, do not reopen | Reopened as an active Phase 5 row because the current user specifically identified recipebook/MyPage awkwardness and count/layout risk. |
| `surface:MYPAGE::MyPageSaved` | Often folded into generic `MYPAGE` | Named Phase 5 row. Must have its own evidence. |
| `surface:MYPAGE::MyPageAccount` | Often folded into settings/account | Named Phase 5 row. Must have its own evidence. |
| `surface:MYPAGE::MyPageNotif` | Often folded into settings | Named Phase 5 row. Must have its own evidence. |
| `surface:MYPAGE::MyPageHelp` | Often omitted as low-risk help content | Named Phase 5 row. Must have its own evidence. |
| `gate:GLOBAL::LoginGate` | Mobile/reference gate only | Phase 1 foundation is verified, but full auth/account behavior remains Phase 3. |

## Phase Burn-Down Summary

| Phase | Owner scope | Rows | Current state |
| --- | --- | ---: | --- |
| Phase 0 | Contract and ledger lock | all rows | This document owns the lock. |
| Phase 1 | Desktop shell, primitives, LoginGate foundation | 8 foundation overlays | Merged as foundation in PR #441; these rows still keep their later full-parity owner phases. |
| Phase 2 | Anchor screens | 3 owner rows | Verified in Phase 2; evidence at `ui/designs/evidence/desktop-modern-redesign/phase-2/`. |
| Phase 3 | Auth, gates, cross-cutting modals | 9 owner rows | Verified in Phase 3; evidence at `ui/designs/evidence/desktop-modern-redesign/phase-3/`. |
| Phase 4 | Planner, meal, menu add, pickers | 10 owner rows | Verified in Phase 4; evidence at `ui/designs/evidence/desktop-modern-redesign/phase-4/`. |
| Phase 5 | Recipebook, MyPage, settings | 13 owner rows | Verified in Phase 5; evidence at `ui/designs/evidence/desktop-modern-redesign/phase-5/`. |
| Phase 6 | Pantry and shopping | 11 owner rows | Open except pantry foundation. |
| Phase 7 | Cooking, leftovers, ate list | 7 owner rows | Open. |
| Phase 8 | Full-surface QA | all rows | Open until every row has evidence. |

## Screen Rows

| canonical_key | 260512 route/component | 260505 reference | owner phase | current status | required verification |
| --- | --- | --- | --- | --- | --- |
| `screen:HOME` | stack `HOME`, `screens-1.jsx::HomeScreen` | `HomeScreen`, `DesktopHome` | Phase 2 | `verified` | Evidence: `home-1024.png`, `home-1280.png`, `home-1440.png`, and `visual-qa-report.json`; card metadata has no orphan Korean syllable breaks. |
| `screen:RECIPE_DETAIL` | stack `RECIPE`, `screens-1.jsx::RecipeDetailScreen` | `RecipeDetail`, `DesktopRecipeDetail` | Phase 2 | `verified` | Evidence: `recipe-detail-1024.png`, `recipe-detail-1280.png`, `recipe-detail-1440.png`, and `visual-qa-report.json`; desktop action rail and modal triggers remain wired. |
| `screen:PLANNER_WEEK` | stack `PLANNER_WEEK`, `screens-2.jsx::PlannerWeekScreen` | `PlannerScreen`, `DesktopPlanner` | Phase 2 | `verified` | Evidence: `planner-week-1024.png`, `planner-week-1280.png`, `planner-week-1440.png`, and `visual-qa-report.json`; grid remains above fold and status is visible without thumbnail dots. |
| `screen:LOGIN` | stack `LOGIN`, `screens-1.jsx::LoginScreen` | `LoginScreen`, `DesktopLoginScreen` | Phase 3 | `verified` | Evidence: `login-1024.png`, `login-1280.png`, `login-1440.png`, `home-after-login-1280.png`, and `visual-qa-report.json`; provider count 3, no horizontal overflow, avatar auth transition verified. |
| `screen:MEAL` | stack `MEAL`, `screens-3.jsx::MealScreen` | `MealDetailScreen`, `DesktopMealDetailScreen` | Phase 4 | `verified` | Evidence: `meal-detail-1024.png`, `meal-detail-1280.png`, `meal-detail-1440.png`, and `visual-qa-report.json`; pantry marks, stepper, status-aware actions, and no horizontal overflow verified. |
| `screen:MENU_ADD` | stack `MENU_ADD`, `screens-3.jsx::MenuAddScreen` | `MenuAddScreen`, `DesktopMenuAddScreen` | Phase 4 | `verified` | Evidence: `menu-add-1024.png`, `menu-add-1280.png`, `menu-add-1440.png`, and `visual-qa-report.json`; six entry cards route to real picker/create screens except out-of-scope webpage import. |
| `screen:PANTRY` | stack `PANTRY`, `screens-2.jsx::PantryScreen` | `PantryScreen`, `DesktopPantry` | Phase 6 | `verified-foundation` | Full pantry state screenshots, add/bundle/search/filter, empty/held/out states. |
| `screen:MYPAGE` | stack `MYPAGE`, `screens-2.jsx::MyPageScreen` | `MyPageScreen`, `DesktopMyPage` | Phase 5 | `verified` | Evidence: `mypage-saved-1024.png`, `mypage-saved-1280.png`, `mypage-saved-1440.png`, `mypage-account-1280.png`, `mypage-notif-1280.png`, `mypage-help-1280.png`, and `visual-qa-report.json`; named sub-surfaces are tabbed and visible. |
| `screen:RECIPEBOOKS` | stack `RECIPEBOOKS`, `screens-2.jsx::RecipebooksScreen` | `MyPageRecipebookTab`, `DesktopMyPageRecipebookList` | Phase 5 | `verified` | Evidence: `recipebooks-1024.png`, `recipebooks-1280.png`, `recipebooks-1440.png`, and `visual-qa-report.json`; horizontal recipebook cards remove huge-photo/tiny-label layout. |
| `screen:RECIPEBOOK_DETAIL` | stack `RECIPEBOOK_DETAIL`, `screens-3.jsx::RecipebookDetailScreen` | `MyPageRecipebookDetailScreen`, `DesktopMyPageRecipebookDetail` | Phase 5 | `verified` | Evidence: `recipebook-detail-1280.png`, `recipebook-detail-delete-1280.png`, and `visual-qa-report.json`; custom-book actions and count/content copy verified. |
| `screen:SHOPPING_FLOW` | stack `SHOPPING_FLOW`, `screens-3.jsx::ShoppingFlowScreen` | `ShoppingCreateScreen`, `DesktopShoppingCreateScreen` | Phase 6 | `verified-foundation` | Select/review/create flow, nested-button warning remains absent, shopping preview contract. |
| `screen:SHOPPING_LISTS` | stack `SHOPPING_LISTS`, `screens-3.jsx::ShoppingListsScreen` | `MyPageShoppingTab`, `DesktopMyPageShoppingList` | Phase 6 | `open` | Completed/in-progress history, MyPage connection, reopen read-only detail. |
| `screen:SHOPPING_DETAIL` | stack `SHOPPING_DETAIL`, `screens-3.jsx::ShoppingDetailScreen` | `ShoppingDetailScreen`, `DesktopShoppingDetailScreen` | Phase 6 | `open` | Completed read-only, server `409`, pantry reflect 3-way semantics. |
| `screen:LEFTOVERS` | stack `LEFTOVERS`, `screens-3.jsx::LeftoversScreen` | `LeftoversScreen`, `DesktopLeftoversScreen` | Phase 7 | `open` | Leftover reuse, partial/eaten states, empty state. |
| `screen:ATE_LIST` | stack `ATE_LIST`, `screens-3.jsx::AteListScreen` | `AteListScreen`, `DesktopAteListScreen` | Phase 7 | `open` | Ate history, undo/recreate, filters/list density. |
| `screen:SETTINGS` | stack `SETTINGS`, `screens-3.jsx::SettingsScreen` | `SettingsScreen`, `DesktopSettingsScreen` | Phase 5 | `verified` | Evidence: `settings-1024.png`, `settings-1280.png`, `settings-danger-1280.png`, `settings-account-delete-1280.png`, and `visual-qa-report.json`; meal columns, account actions, segmented states, and danger path verified. |
| `screen:COOK_READY_LIST` | missing; current cook entry is `CookNoticeDialog` only | `CookListScreen`, `DesktopCookListScreen` | Phase 7 | `open` | Real cook-ready list; planner/standalone entry separation. |
| `screen:COOK_MODE_PLANNER` | missing; notice-only | `CookRunScreen`, `DesktopCookRunScreen` | Phase 7 | `open` | Planner cook mode, no serving adjustment UI, valid status transition. |
| `screen:COOK_MODE_STANDALONE` | missing; notice-only | `CookRunScreen`, `DesktopCookRunScreen` | Phase 7 | `open` | Standalone cook mode must not alter planner meal status. |
| `screen:MANUAL_RECIPE_CREATE` | stack `MANUAL_RECIPE_CREATE`, `screens-3.jsx::ManualRecipeCreateScreen` | `ManualRecipeCreateScreen`, `DesktopManualRecipeCreateScreen` | Phase 4 | `verified` | Evidence: `manual-create-1024.png`, `manual-create-1280.png`, `manual-create-with-ingredients-1280.png`, and `visual-qa-report.json`; manual form, ingredient editor, ingredient picker, and planner handoff verified. |
| `screen:YT_IMPORT` | stack `YT_IMPORT`, `screens-3.jsx::YtImportScreen` | `YtImportScreen`, `DesktopYtImportScreen` | Phase 4 | `verified` | Evidence: `yt-import-input-1280.png`, `yt-import-review-1280.png`, and `visual-qa-report.json`; URL input, simulated extraction review, editable ingredients, and planner handoff verified. |

## Surface Rows

| canonical_key | host/component | 260505 reference | owner phase | current status | required verification |
| --- | --- | --- | --- | --- | --- |
| `surface:HOME::SortDropdown` | `components.jsx::SortDropdown` | `SortSheet` / `HOME_SORT_OPEN_STATE` | Phase 3 | `verified` | Evidence: `sort-dropdown-1280.png` and `visual-qa-report.json`; desktop listbox role, four options, expanded state, and no overflow verified. |
| `surface:HOME::IngredientFilter` | `modals.jsx::IngredientFilterModal` | `IngredientFilterModal`, `DesktopIngredientFilterDialog` | Phase 3 | `verified` | Evidence: `filter-modal-1024.png`, `filter-modal-1280.png`, and `visual-qa-report.json`; search auto-focus, category grid, and no overflow verified. |
| `surface:MENU_ADD::RecipeSearchPicker` | stack `RECIPE_SEARCH_PICKER`, `screens-3.jsx::RecipeSearchPickerScreen` | `RecipeSearchPicker`, `DesktopRecipeSearchPicker` | Phase 4 | `verified` | Evidence: `recipe-search-picker-1280.png`, `recipe-search-picker-empty-1280.png`, and `visual-qa-report.json`; auto-focused search, empty state, selection modal, and no overflow verified. |
| `surface:MENU_ADD::RecipeBookSelector` | stack `RECIPEBOOK_SELECTOR`, `screens-3.jsx::RecipeBookSelectorScreen` | `DesktopRecipeBookSelectorDialog` | Phase 4 | `verified` | Evidence: `recipebook-selector-1280.png` and `visual-qa-report.json`; six selectable recipebook rows and picker-only routing verified. |
| `surface:MENU_ADD::RecipeBookDetailPicker` | stack `RECIPEBOOK_DETAIL_PICKER`, `screens-3.jsx::RecipeBookDetailPickerScreen` | `RecipeBookDetailPicker`, `DesktopRecipeBookDetailPickerDialog` | Phase 4 | `verified` | Evidence: `recipebook-detail-picker-1280.png` and `visual-qa-report.json`; selected book recipe grid opens planned servings input without entering full Phase 5 recipebook detail. |
| `surface:MENU_ADD::PantryMatchPicker` | stack `PANTRY_MATCH_PICKER`, `screens-3.jsx::PantryMatchPickerScreen` | `PantryMatchPicker`, `DesktopPantryMatchPickerDialog` | Phase 4 | `verified` | Evidence: `pantry-match-picker-1280.png` and `visual-qa-report.json`; pantry match ranking, progress bars, descending sort, and no overflow verified. |
| `surface:MENU_ADD::PlannedServingsInput` | `modals.jsx::PlannedServingsConfirmModal` | `PlanningServingsModal` | Phase 4 | `verified` | Evidence: `servings-confirm-modal-1280.png`, `confirm-add-meal-1280.png`, and `visual-qa-report.json`; date chips, meal segmented control, stepper, add-to-planner toast, and planner return verified. |
| `surface:PANTRY::PantrySearchToolbar` | `screens-2.jsx::PantryScreen` | `PantryScreen`, `DesktopPantry` | Phase 6 | `verified-foundation` | Toolbar/search works across categories and does not collapse. |
| `surface:PANTRY::PantryBundlePicker` | `modals.jsx::PantryAddBundleModal` | `PantryBundlePicker`, `DesktopPantryBundleDialog` | Phase 6 | `open` | Bundle picker coverage and empty/duplicate behavior. |
| `surface:PANTRY::PantryAddIngredient` | `modals.jsx::PantryAddIngredientModal` | `PantryAddSheet`, `DesktopPantryAddDialog` | Phase 6 | `open` | Add ingredient modal with category/search/duplicate states. |
| `surface:MYPAGE::MyPageSaved` | `screens-2.jsx::MyPageSavedPanel` | `MyPageSavedScreen` | Phase 5 | `verified` | Evidence: `mypage-saved-1024.png`, `mypage-saved-1280.png`, `mypage-saved-1440.png`, and `visual-qa-report.json`; saved recipes tab is a named visible surface. |
| `surface:MYPAGE::MyPageAccount` | `screens-2.jsx::MyPageAccountPanel` | `MyPageAccountScreen` | Phase 5 | `verified` | Evidence: `mypage-account-1280.png`, `settings-account-delete-1280.png`, and `visual-qa-report.json`; profile, provider, logout, settings, and delete actions verified. |
| `surface:MYPAGE::MyPageNotif` | `screens-2.jsx::MyPageNotifPanel` | `MyPageNotifScreen` | Phase 5 | `verified` | Evidence: `mypage-notif-1280.png` and `visual-qa-report.json`; notification toggles verified. |
| `surface:MYPAGE::MyPageHelp` | `screens-2.jsx::MyPageHelpPanel` | `MyPageHelpScreen` | Phase 5 | `verified` | Evidence: `mypage-help-1280.png` and `visual-qa-report.json`; FAQ/help surface verified. |
| `surface:MYPAGE::ShoppingHistory` | `ShoppingListsScreen` reachable from MYPAGE | `MyPageShoppingTab`, `DesktopMyPageShoppingList` | Phase 6 | `open` | Completed history and read-only reopen path. |
| `surface:SETTINGS::MealColumns` | `screens-3.jsx::MealColumnsEditor` | official planner column contract | Phase 5 | `verified` | Evidence: `settings-1024.png`, `settings-1280.png`, and `visual-qa-report.json`; min/max/default/delete rules are visible. |

## Modal / Dialog / Gate Rows

| canonical_key | 260512 component/trigger | 260505 reference | owner phase | current status | required verification |
| --- | --- | --- | --- | --- | --- |
| `gate:GLOBAL::LoginGate` | `components.jsx::LoginGateDialog`, `app.jsx::requireAuth` | `LoginGate`, `GLOBAL::LoginGateModal` | Phase 3 | `verified` | Evidence: `login-gate-save-1024.png`, `login-gate-save-1280.png`, `login-gate-save-1440.png`, `login-gate-planner-1024.png`, and `visual-qa-report.json`; three providers, provider focus, save/planner return-to-action verified. |
| `modal:RECIPE_DETAIL::SaveModal` | `modals.jsx::SaveModal` | `SavePopup` | Phase 3 | `verified` | Evidence: `save-modal-1280.png` and `visual-qa-report.json`; saved/custom book rows and no overflow verified after auth. |
| `modal:RECIPE_DETAIL::PlannerAddModal` | `modals.jsx::PlannerAddModal` | `PlannerAddPopup` | Phase 3 | `verified` | Evidence: `planner-add-modal-1280.png` and `visual-qa-report.json`; date/meal/serving controls and no overflow verified after auth. |
| `modal:HOME::IngredientFilterModal` | `modals.jsx::IngredientFilterModal` | `IngredientFilterModal` | Phase 3 | `verified` | Evidence: `filter-modal-1024.png`, `filter-modal-1280.png`, and `visual-qa-report.json`; apply/reset footer, focused search, and dense grid verified. |
| `modal:GLOBAL::Lightbox` | `modals.jsx::Lightbox` | photo lightbox behavior | Phase 3 | `verified` | Evidence: `lightbox-1280.png` and `visual-qa-report.json`; dialog role, `aria-modal`, close focus, navigation controls, and no overflow verified. |
| `modal:GLOBAL::ConfirmDialog` | `components.jsx::ConfirmDialog`, `app.jsx::MealScreen` delete path | `ConfirmDialog` | Phase 3 | `verified` | Evidence: `confirm-normal-1280.png`, `confirm-destructive-1280.png`, and `visual-qa-report.json`; normal/destructive variants, cancel focus, danger CTA, and meal-delete consumer verified. |
| `modal:MANUAL_RECIPE_CREATE::IngredientPickerModal` | `modals.jsx::IngredientPickerModal_ManualCreate` | `IngredientPickerModal` | Phase 4 | `verified` | Evidence: `ingredient-picker-modal-1280.png`, `manual-create-with-ingredients-1280.png`, and `visual-qa-report.json`; manual-specific title/copy, plus affordance, selected pill bar, duplicate dimming, and add flow verified. |
| `modal:SETTINGS::NicknameModal` | `modals.jsx::NicknameModal` | `NicknameEditSheet` | Phase 5 | `verified` | Evidence: `nickname-modal-1280.png` and `visual-qa-report.json`; desktop dialog opens from settings/profile update path. |
| `modal:SETTINGS::LogoutModal` | `modals.jsx::LogoutModal` | `LogoutConfirm` | Phase 5 | `verified` | Evidence: `logout-modal-1280.png` and `visual-qa-report.json`; confirm copy and auth state verified. |
| `modal:SETTINGS::AccountDeleteConfirm` | `components.jsx::ConfirmDialog` via settings/MyPage delete action | `AccountDeleteConfirm` | Phase 5 | `verified` | Evidence: `settings-account-delete-1280.png` and `visual-qa-report.json`; destructive confirm uses cancel-first dialog. |
| `modal:MYPAGE::RecipebookDeleteConfirm` | `components.jsx::ConfirmDialog` via `RecipebookDetailScreen` custom book action | `RecipebookDeleteConfirm` | Phase 5 | `verified` | Evidence: `recipebook-detail-delete-1280.png` and `visual-qa-report.json`; custom book delete confirm verified. |
| `modal:PANTRY::PantryAddIngredientModal` | `modals.jsx::PantryAddIngredientModal` | `PantryAddSheet`, `DesktopPantryAddDialog` | Phase 6 | `open` | Add multiple, search, empty state. |
| `modal:PANTRY::PantryAddBundleModal` | `modals.jsx::PantryAddBundleModal` | `PantryBundlePicker`, `DesktopPantryBundleDialog` | Phase 6 | `open` | Bundle selection and confirmation. |
| `modal:SHOPPING_DETAIL::PantryReflectModal` | `modals.jsx::PantryReflectModal` | `PantryReflectPicker`, `DesktopPantryReflectDialog` | Phase 6 | `open` | `null / [] / selected ids` semantics; pre-complete backdrop. |
| `modal:COOK_MODE::ConsumedIngredientSheet` | missing in 260512 | `ConsumedIngredientSheet`, `DesktopConsumedIngredientDialog` | Phase 7 | `open` | Pantry deduction checklist after cooking. |
| `modal:COOK_MODE::CookNoticeDialog` | `screens-3.jsx::CookNoticeDialog` | notice/advisory only | Phase 7 | `open` | Should be replaced or limited once real cook mode exists. |

## Contract Locks Before Dependent Phases

| Contract | Must be locked before | Current decision |
| --- | --- | --- |
| Execution target | Phase 2 | Production-oriented desktop web prototype redesign; not a throwaway visual-only prototype. |
| Desktop styling boundary | Phase 2 | `1024px+` desktop/web presentation only; no global mobile token rewrite. |
| LoginGate behavior | Phase 2 protected actions and Phase 3 auth | Phase 3 verified dedicated login, provider gate, account avatar transition, and protected save/planner return-to-action. |
| Planner/settings meal-column rules | Phase 2 `PLANNER_WEEK` final anchor | Phase 5 `SETTINGS::MealColumns` must close before declaring planner fully verified. |
| Shopping completed read-only contract | Phase 6 | Completed list edit-blocking UI plus server `409` remains mandatory. |
| Pantry reflect semantics | Phase 6 | Preserve `add_to_pantry_item_ids`: `null` default, `[]` reflect none, selected ids reflect selected checked items. |
| Cooking mode rules | Phase 7 | No serving adjustment UI in cook mode; planner and standalone status transitions remain separate. |

## Evidence Paths To Fill

Each row owner phase must fill evidence before marking a row `verified`:

- route/component path
- screenshot path at `1024px`
- screenshot path at `1280px`
- screenshot path at `1440px`
- console/page-error check result
- manual or automated test note
- known divergence or follow-up, if any

Suggested evidence root:

`ui/designs/evidence/desktop-modern-redesign/phase-<n>/`

## Phase 0 Exit Criteria

- Every known 260505 Wave1 screen/surface/modal/gate is represented above.
- `RECIPEBOOK_DETAIL` is reopened as an active row.
- `MyPageSaved`, `MyPageAccount`, `MyPageNotif`, and `MyPageHelp` are named rows.
- Phase 1 work is recorded as foundation only, not full parity completion.
- Every open row has an owner phase.
- Phase 2 can start without losing track of later auth, MyPage, recipebook, pantry, shopping, cooking, leftovers, or settings gaps.
