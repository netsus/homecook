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
| Phase 3 | Auth, gates, cross-cutting modals | 9 owner rows | Open except LoginGate foundation. |
| Phase 4 | Planner, meal, menu add, pickers | 10 owner rows | Open. |
| Phase 5 | Recipebook, MyPage, settings | 13 owner rows | Open except Recipebooks foundation. |
| Phase 6 | Pantry and shopping | 11 owner rows | Open except pantry foundation. |
| Phase 7 | Cooking, leftovers, ate list | 7 owner rows | Open. |
| Phase 8 | Full-surface QA | all rows | Open until every row has evidence. |

## Screen Rows

| canonical_key | 260512 route/component | 260505 reference | owner phase | current status | required verification |
| --- | --- | --- | --- | --- | --- |
| `screen:HOME` | stack `HOME`, `screens-1.jsx::HomeScreen` | `HomeScreen`, `DesktopHome` | Phase 2 | `verified` | Evidence: `home-1024.png`, `home-1280.png`, `home-1440.png`, and `visual-qa-report.json`; card metadata has no orphan Korean syllable breaks. |
| `screen:RECIPE_DETAIL` | stack `RECIPE`, `screens-1.jsx::RecipeDetailScreen` | `RecipeDetail`, `DesktopRecipeDetail` | Phase 2 | `verified` | Evidence: `recipe-detail-1024.png`, `recipe-detail-1280.png`, `recipe-detail-1440.png`, and `visual-qa-report.json`; desktop action rail and modal triggers remain wired. |
| `screen:PLANNER_WEEK` | stack `PLANNER_WEEK`, `screens-2.jsx::PlannerWeekScreen` | `PlannerScreen`, `DesktopPlanner` | Phase 2 | `verified` | Evidence: `planner-week-1024.png`, `planner-week-1280.png`, `planner-week-1440.png`, and `visual-qa-report.json`; grid remains above fold and status is visible without thumbnail dots. |
| `screen:LOGIN` | missing dedicated screen; Phase 1 only has `LoginGateDialog` | `LoginScreen`, `DesktopLoginScreen` | Phase 3 | `open` | Dedicated login screen or equivalent desktop auth entry; return-to-action flow proof. |
| `screen:MEAL` | stack `MEAL`, `screens-3.jsx::MealScreen` | `MealDetailScreen`, `DesktopMealDetailScreen` | Phase 4 | `open` | Meal detail states, delete/serving changes, shopping/cook/recipe links. |
| `screen:MENU_ADD` | stack `MENU_ADD`, `screens-3.jsx::MenuAddScreen` | `MenuAddScreen`, `DesktopMenuAddScreen` | Phase 4 | `open` | Real picker flows instead of demo toast-only branches. |
| `screen:PANTRY` | stack `PANTRY`, `screens-2.jsx::PantryScreen` | `PantryScreen`, `DesktopPantry` | Phase 6 | `verified-foundation` | Full pantry state screenshots, add/bundle/search/filter, empty/held/out states. |
| `screen:MYPAGE` | stack `MYPAGE`, `screens-2.jsx::MyPageScreen` | `MyPageScreen`, `DesktopMyPage` | Phase 5 | `open` | MyPage overview plus named sub-surfaces; no hidden rows. |
| `screen:RECIPEBOOKS` | stack `RECIPEBOOKS`, `screens-2.jsx::RecipebooksScreen` | `MyPageRecipebookTab`, `DesktopMyPageRecipebookList` | Phase 5 | `verified-foundation` | Full recipebook list/create/delete states; current mosaic foundation remains. |
| `screen:RECIPEBOOK_DETAIL` | stack `RECIPEBOOK_DETAIL`, `screens-3.jsx::RecipebookDetailScreen` | `MyPageRecipebookDetailScreen`, `DesktopMyPageRecipebookDetail` | Phase 5 | `open` | Active reopened row; count/content consistency; owner/delete/remove states. |
| `screen:SHOPPING_FLOW` | stack `SHOPPING_FLOW`, `screens-3.jsx::ShoppingFlowScreen` | `ShoppingCreateScreen`, `DesktopShoppingCreateScreen` | Phase 6 | `verified-foundation` | Select/review/create flow, nested-button warning remains absent, shopping preview contract. |
| `screen:SHOPPING_LISTS` | stack `SHOPPING_LISTS`, `screens-3.jsx::ShoppingListsScreen` | `MyPageShoppingTab`, `DesktopMyPageShoppingList` | Phase 6 | `open` | Completed/in-progress history, MyPage connection, reopen read-only detail. |
| `screen:SHOPPING_DETAIL` | stack `SHOPPING_DETAIL`, `screens-3.jsx::ShoppingDetailScreen` | `ShoppingDetailScreen`, `DesktopShoppingDetailScreen` | Phase 6 | `open` | Completed read-only, server `409`, pantry reflect 3-way semantics. |
| `screen:LEFTOVERS` | stack `LEFTOVERS`, `screens-3.jsx::LeftoversScreen` | `LeftoversScreen`, `DesktopLeftoversScreen` | Phase 7 | `open` | Leftover reuse, partial/eaten states, empty state. |
| `screen:ATE_LIST` | stack `ATE_LIST`, `screens-3.jsx::AteListScreen` | `AteListScreen`, `DesktopAteListScreen` | Phase 7 | `open` | Ate history, undo/recreate, filters/list density. |
| `screen:SETTINGS` | stack `SETTINGS`, `screens-3.jsx::SettingsScreen` | `SettingsScreen`, `DesktopSettingsScreen` | Phase 5 | `open` | Meal column management, account sections, active segmented states, danger actions. |
| `screen:COOK_READY_LIST` | missing; current cook entry is `CookNoticeDialog` only | `CookListScreen`, `DesktopCookListScreen` | Phase 7 | `open` | Real cook-ready list; planner/standalone entry separation. |
| `screen:COOK_MODE_PLANNER` | missing; notice-only | `CookRunScreen`, `DesktopCookRunScreen` | Phase 7 | `open` | Planner cook mode, no serving adjustment UI, valid status transition. |
| `screen:COOK_MODE_STANDALONE` | missing; notice-only | `CookRunScreen`, `DesktopCookRunScreen` | Phase 7 | `open` | Standalone cook mode must not alter planner meal status. |
| `screen:MANUAL_RECIPE_CREATE` | demo toast only from `MENU_ADD` | `ManualRecipeCreateScreen`, `DesktopManualRecipeCreateScreen` | Phase 4 | `open` | Manual create form, ingredient picker, planner handoff. |
| `screen:YT_IMPORT` | demo toast only from `MENU_ADD` | `YtImportScreen`, `DesktopYtImportScreen` | Phase 4 | `open` | URL input, extraction review, planner handoff. |

## Surface Rows

| canonical_key | host/component | 260505 reference | owner phase | current status | required verification |
| --- | --- | --- | --- | --- | --- |
| `surface:HOME::SortDropdown` | `components.jsx::SortDropdown` | `SortSheet` / `HOME_SORT_OPEN_STATE` | Phase 3 | `open` | Desktop dropdown or sheet equivalent; current sort choices and no wrapping. |
| `surface:HOME::IngredientFilter` | `modals.jsx::IngredientFilterModal` | `IngredientFilterModal`, `DesktopIngredientFilterDialog` | Phase 3 | `open` | Filter modal at desktop width; selected ingredient persistence. |
| `surface:MENU_ADD::RecipeSearchPicker` | demo toast from `MenuAddScreen` | `RecipeSearchPicker`, `DesktopRecipeSearchPicker` | Phase 4 | `open` | Search picker reachable from menu add, keyboard/focus, recipe selection. |
| `surface:MENU_ADD::RecipeBookSelector` | current `RECIPEBOOKS` pickerMode placeholder | `DesktopRecipeBookSelectorDialog` | Phase 4 | `open` | Book selector dialog/panel, then detail picker. |
| `surface:MENU_ADD::RecipeBookDetailPicker` | current `RECIPEBOOKS` pickerMode placeholder | `RecipeBookDetailPicker`, `DesktopRecipeBookDetailPickerDialog` | Phase 4 | `open` | Pick recipe from selected book without confusing with full detail screen. |
| `surface:MENU_ADD::PantryMatchPicker` | demo toast from `MenuAddScreen` | `PantryMatchPicker`, `DesktopPantryMatchPickerDialog` | Phase 4 | `open` | Pantry-based recommendations using pantry state. |
| `surface:MENU_ADD::PlannedServingsInput` | `PlannerAddModal` only; menu add planning input missing | `PlanningServingsModal` | Phase 4 | `open` | Planned serving input before meal creation. |
| `surface:PANTRY::PantrySearchToolbar` | `screens-2.jsx::PantryScreen` | `PantryScreen`, `DesktopPantry` | Phase 6 | `verified-foundation` | Toolbar/search works across categories and does not collapse. |
| `surface:PANTRY::PantryBundlePicker` | `modals.jsx::PantryAddBundleModal` | `PantryBundlePicker`, `DesktopPantryBundleDialog` | Phase 6 | `open` | Bundle picker coverage and empty/duplicate behavior. |
| `surface:PANTRY::PantryAddIngredient` | `modals.jsx::PantryAddIngredientModal` | `PantryAddSheet`, `DesktopPantryAddDialog` | Phase 6 | `open` | Add ingredient modal with category/search/duplicate states. |
| `surface:MYPAGE::MyPageSaved` | not dedicated in 260512 | `MyPageSavedScreen` | Phase 5 | `open` | Named row; saved recipes evidence, not hidden in host `MYPAGE`. |
| `surface:MYPAGE::MyPageAccount` | partly settings/account | `MyPageAccountScreen` | Phase 5 | `open` | Named row; account/provider/profile evidence. |
| `surface:MYPAGE::MyPageNotif` | not dedicated in 260512 | `MyPageNotifScreen` | Phase 5 | `open` | Named row; notification settings evidence. |
| `surface:MYPAGE::MyPageHelp` | not dedicated in 260512 | `MyPageHelpScreen` | Phase 5 | `open` | Named row; help/FAQ evidence. |
| `surface:MYPAGE::ShoppingHistory` | `ShoppingListsScreen` reachable from MYPAGE | `MyPageShoppingTab`, `DesktopMyPageShoppingList` | Phase 6 | `open` | Completed history and read-only reopen path. |
| `surface:SETTINGS::MealColumns` | `screens-3.jsx::SettingsScreen` segmented demo | official planner column contract | Phase 5 | `open` | Lock min/max/delete/default column rules before final planner anchor closure. |

## Modal / Dialog / Gate Rows

| canonical_key | 260512 component/trigger | 260505 reference | owner phase | current status | required verification |
| --- | --- | --- | --- | --- | --- |
| `gate:GLOBAL::LoginGate` | `components.jsx::LoginGateDialog`, `app.jsx::requireAuth` | `LoginGate`, `GLOBAL::LoginGateModal` | Phase 3 | `verified-foundation` | Foundation verified in PR #441; Phase 3 must add full login/account flow and providers. |
| `modal:RECIPE_DETAIL::SaveModal` | `modals.jsx::SaveModal` | `SavePopup` | Phase 3 | `open` | Saved/custom book rules; LoginGate return-to-action; desktop dialog screenshot. |
| `modal:RECIPE_DETAIL::PlannerAddModal` | `modals.jsx::PlannerAddModal` | `PlannerAddPopup` | Phase 3 | `open` | Date/meal/serving selection and return-to-action. |
| `modal:HOME::IngredientFilterModal` | `modals.jsx::IngredientFilterModal` | `IngredientFilterModal` | Phase 3 | `open` | Apply/reset selected ingredients; desktop wide dialog. |
| `modal:GLOBAL::Lightbox` | `modals.jsx::Lightbox` | photo lightbox behavior | Phase 3 | `open` | Image navigation/close/focus behavior. |
| `modal:GLOBAL::ConfirmDialog` | missing generic component; some specific dialogs exist | `ConfirmDialog` | Phase 3 | `open` | Reusable confirm primitive for destructive/non-destructive paths. |
| `modal:MANUAL_RECIPE_CREATE::IngredientPickerModal` | missing in 260512; manual create demo toast only | `IngredientPickerModal` | Phase 4 | `open` | Manual recipe ingredient selection/add flow; distinct from HOME ingredient filter. |
| `modal:SETTINGS::NicknameModal` | `modals.jsx::NicknameModal` | `NicknameEditSheet` | Phase 5 | `open` | Desktop dialog equivalent, profile update. |
| `modal:SETTINGS::LogoutModal` | `modals.jsx::LogoutModal` | `LogoutConfirm` | Phase 5 | `open` | Confirm copy and auth state. |
| `modal:SETTINGS::AccountDeleteConfirm` | missing in 260512 | `AccountDeleteConfirm` | Phase 5 | `open` | Destructive confirm, no accidental deletion. |
| `modal:MYPAGE::RecipebookDeleteConfirm` | missing in 260512 | `RecipebookDeleteConfirm` | Phase 5 | `open` | Custom book only; confirm and ownership. |
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
| LoginGate behavior | Phase 2 protected actions and Phase 3 auth | Phase 1 foundation exists; Phase 3 owns full auth/account completion. |
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
