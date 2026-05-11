# Wave1 App/Web Responsibility Matrix

> Status: active Phase 2 gate for Wave1 mobile 100% prototype parity
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
| `HOME` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-home.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-home.png` | `screens/home.jsx::HomeScreen` | `app/page.tsx`<br>`components/home/home-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shared shell or responsive CSS changes | `tests/home-screen.test.tsx`<br>`tests/e2e/slice-02-discovery-filter.spec.ts` | Exact gate bundle: reference/service screenshots, screenshot diff, computed-style audit, DOM geometry audit, blocker `0`, unclassified difference `0`. |
| `RECIPE_DETAIL` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-recipe-detail.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-recipe-detail.png` | `screens/detail.jsx::RecipeDetail` | `app/recipe/[id]/page.tsx`<br>`components/recipe/recipe-detail-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shared detail layout changes | `tests/recipe-detail-screen.test.tsx`<br>`tests/e2e/slice-06-recipe-to-planner.spec.ts` | Exact gate bundle. Official save/planner/login behavior wins over prototype-only behavior. |
| `PLANNER_WEEK` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-planner.png` | `screens/planner.jsx::PlannerScreen` | `app/planner/page.tsx`<br>`components/planner/planner-week-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if planner responsive layout changes | `tests/planner-week-screen.test.tsx`<br>`tests/e2e/slice-05-planner-week-core.spec.ts` | Exact gate bundle. Existing planner column customization contract stays authoritative. |
| `MENU_ADD` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-planner-meal-add.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-planner-meal-add.png` | `screens/wave1.jsx::MenuAddScreen` | `app/menu-add/page.tsx`<br>`components/planner/menu-add-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shared picker shell changes | `tests/menu-add-screen.test.tsx`<br>`tests/e2e/slice-08a-meal-add-search-core.spec.ts`<br>`tests/e2e/slice-08b-meal-add-books-pantry.spec.ts` | Exact gate bundle for the MENU_ADD shell only. Internal pickers remain `needs-prototype-freeze` until captured. |
| `SHOPPING_DETAIL` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-shopping-detail.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-shopping-detail.png` | `screens/wave1.jsx::ShoppingDetailScreen` | `app/shopping/lists/[list_id]/page.tsx`<br>`components/shopping/shopping-detail-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shopping responsive layout changes | `tests/shopping-detail.frontend.test.tsx`<br>`tests/e2e/slice-10a-shopping-detail-interact.spec.ts`<br>`tests/e2e/slice-12a-shopping-complete.spec.ts` | Exact gate bundle. Read-only, `409`, exclude/uncheck, and pantry reflect semantics remain MVP-governed. |
| `PANTRY` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-pantry.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-pantry.png` | `screens/pantry.jsx::PantryScreen` | `app/pantry/page.tsx`<br>`components/pantry/pantry-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if pantry responsive layout changes | `tests/pantry-screen.test.tsx`<br>`tests/e2e/slice-13-pantry-core.spec.ts` | Exact gate bundle for the PANTRY screen. Add sheet and bundle picker require Phase 3 references first. |
| `MYPAGE` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-mypage.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-mypage.png` | `screens/mypage.jsx::MyPageScreen` | `app/mypage/page.tsx`<br>`components/mypage/mypage-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if mypage responsive layout changes | `tests/mypage-screen.test.tsx`<br>`tests/e2e/slice-17a-mypage.spec.ts` | Exact gate bundle for the visible MYPAGE shell. Recipebook and shopping-list tab internals need Phase 3 references. |
| `SETTINGS` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-settings.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-settings.png` | `screens/wave1.jsx::SettingsScreen` | `app/settings/page.tsx`<br>`components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings responsive layout changes | `tests/settings-screen.test.tsx`<br>`tests/e2e/slice-17c-settings.spec.ts` | Exact gate bundle. Planner column management remains the merged MVP contract. |
| `ACCOUNT` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-account.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-account.png` | `screens/extras.jsx::MyPageAccountScreen` | `app/settings/page.tsx` account section<br>`components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings/account responsive layout changes | `tests/settings-screen.test.tsx`<br>`tests/settings-account.backend.test.ts`<br>`tests/e2e/slice-17c-settings.spec.ts` | Exact gate bundle for visible account management UI. Logout/delete confirmations need separate freeze rows. |
| `LEFTOVERS` | `exact-reference-ready` | `prototype parity` | `ui/designs/reference/wave1-fixed-prototype/mobile-390-leftovers.png`<br>`ui/designs/reference/wave1-fixed-prototype/mobile-320-leftovers.png` | `screens/wave1.jsx::LeftoversScreen` | `app/leftovers/page.tsx`<br>`components/leftovers/leftovers-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if leftovers responsive layout changes | `tests/leftovers.frontend.test.tsx`<br>`tests/e2e/slice-16-leftovers.spec.ts` | Exact gate bundle. Eat/uneat API behavior remains MVP-governed. |

## Needs-Prototype-Freeze Rows

These rows cannot claim 100% mobile parity yet. Phase 3 must create committed reference screenshots first. After that, move the row into the exact-ready set or record why it remains derived/out of scope.

| surface | mobile parity status | canonical classification | fixed reference | prototype source | MVP component | web status | desktop smoke owner | required functional tests | 100% parity verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LOGIN` | `needs-prototype-freeze` | `prototype parity` | none | `screens/wave1.jsx::LoginScreen` | `app/login/page.tsx`<br>`components/auth/login-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if auth layout changes | `tests/login-screen.test.tsx`<br>`tests/social-login-buttons.test.tsx` | Phase 3 capture `390px`/`320px`; then exact gate bundle. |
| `ATE_LIST` | `needs-prototype-freeze` | `prototype parity` | none | `screens/wave1.jsx::AteListScreen` | `app/leftovers/ate/page.tsx`<br>`components/leftovers/ate-list-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if leftovers responsive layout changes | `tests/leftovers.frontend.test.tsx`<br>`tests/e2e/slice-16-leftovers.spec.ts` | Phase 3 capture first; then exact gate bundle. |
| `RECIPEBOOK_DETAIL` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::MyPageRecipebookDetailScreen` | `app/mypage/recipe-books/[book_id]/page.tsx`<br>`components/recipebook/recipebook-detail-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if recipebook responsive layout changes | `tests/e2e/slice-17b-recipebook-detail.spec.ts`<br>`tests/recipebook-detail.backend.test.ts` | Prior low-risk reuse is historical only. Capture/refreeze before claiming exact parity. |
| `MEAL_SCREEN` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/extras.jsx::MealDetailScreen` | `app/planner/[date]/[columnId]/page.tsx`<br>`components/planner/meal-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if meal responsive layout changes | `tests/planner-meal-screen.test.tsx`<br>`tests/e2e/slice-07-meal-manage.spec.ts` | Capture meal detail plus required official states before porting. |
| `SHOPPING_FLOW` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/extras.jsx::ShoppingCreateScreen` | `app/shopping/flow/page.tsx`<br>`components/shopping/shopping-flow-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if shopping flow responsive layout changes | `tests/shopping-flow-screen.test.tsx`<br>`tests/e2e/slice-09-shopping-preview-create.spec.ts` | Capture create/review states before porting. |
| `COOK_READY_LIST` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/extras.jsx::CookListScreen` | `app/cooking/ready/page.tsx`<br>`components/cooking/cook-ready-list-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if cooking responsive layout changes | `tests/cook-ready-list-screen.test.tsx`<br>`tests/e2e/slice-14-cook-session-start.spec.ts` | Capture ready-list state first; then exact gate bundle. |
| `COOK_MODE` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/extras.jsx::CookRunScreen` | `app/cooking/sessions/[session_id]/cook-mode/page.tsx`<br>`app/cooking/recipes/[recipe_id]/cook-mode/page.tsx`<br>`components/cooking/cook-mode-screen.tsx`<br>`components/cooking/standalone-cook-mode-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if cooking responsive layout changes | `tests/cook-mode-screen.test.tsx`<br>`tests/standalone-cook-mode-screen.test.tsx`<br>`tests/e2e/slice-15a-cook-planner-complete.spec.ts`<br>`tests/e2e/slice-15b-cook-standalone-complete.spec.ts` | Capture planner and standalone variants. Do not add serving adjustment UI. |
| `MANUAL_RECIPE_CREATE` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::ManualRecipeCreateScreen` | `app/menu/add/manual/page.tsx`<br>`components/recipe/manual-recipe-create-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if manual-create responsive layout changes | `tests/e2e/slice-18-manual-recipe-create.spec.ts`<br>`tests/manual-recipe-create.backend.test.ts` | Capture before exact claim. Numeric-only quantity behavior remains MVP-governed. |
| `YT_IMPORT` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::YtImportScreen` | `app/menu/add/youtube/page.tsx`<br>`components/recipe/youtube-import-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if YouTube import responsive layout changes | `tests/e2e/slice-19-youtube-import.spec.ts`<br>`tests/youtube-import.backend.test.ts` | Capture validate/extract/register states before exact claim. |
| `MENU_ADD::RecipeSearchPicker` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::RecipeSearchPicker` | `components/planner/recipe-search-picker.tsx` | `shared responsive preserve` | Codex Stage 6 if picker responsive layout changes | `tests/e2e/slice-08a-meal-add-search-core.spec.ts` | Capture picker state before porting. |
| `MENU_ADD::RecipeBookSelector` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::RecipeBookSelector` | `components/planner/recipe-book-selector.tsx` | `shared responsive preserve` | Codex Stage 6 if picker responsive layout changes | `tests/e2e/slice-08b-meal-add-books-pantry.spec.ts` | Capture selector state before porting. |
| `MENU_ADD::RecipeBookDetailPicker` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::RecipeBookDetailPicker` | `components/planner/recipe-book-detail-picker.tsx` | `shared responsive preserve` | Codex Stage 6 if picker responsive layout changes | `tests/e2e/slice-08b-meal-add-books-pantry.spec.ts` | Capture detail picker state before porting. |
| `MENU_ADD::PantryMatchPicker` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::PantryMatchPicker` | `components/planner/pantry-match-picker.tsx` | `shared responsive preserve` | Codex Stage 6 if picker responsive layout changes | `tests/e2e/slice-08b-meal-add-books-pantry.spec.ts` | Capture pantry match picker state before porting. |
| `PANTRY::PantryAddSheet` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::PantryAddSheet` | `components/pantry/pantry-add-sheet.tsx` | `shared responsive preserve` | Codex Stage 6 if pantry sheet responsive layout changes | `tests/pantry-screen.test.tsx`<br>`tests/e2e/slice-13-pantry-core.spec.ts` | Capture add sheet open state before porting. Existing pantry duplicate rules remain MVP-governed. |
| `PANTRY::PantryBundlePicker` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::PantryBundlePicker` | `components/pantry/pantry-bundle-picker.tsx` | `shared responsive preserve` | Codex Stage 6 if bundle picker responsive layout changes | `tests/e2e/slice-13-pantry-core.spec.ts` | Capture picker open state before porting. |
| `RECIPE_DETAIL::PlannerAddPopup` | `needs-prototype-freeze` | `prototype parity` | none | `screens/modals.jsx::PlannerAddPopup` | `components/recipe/planner-add-sheet.tsx` | `shared responsive preserve` | Codex Stage 6 if modal responsive layout changes | `tests/recipe-add-to-planner.test.tsx`<br>`tests/e2e/slice-06-recipe-to-planner.spec.ts` | Capture popup open state before porting. Date/meal/serving behavior remains MVP-governed. |
| `RECIPE_DETAIL::SavePopup` | `needs-prototype-freeze` | `prototype parity` | none | `screens/modals.jsx::SavePopup` | `components/recipe/save-modal.tsx` | `shared responsive preserve` | Codex Stage 6 if modal responsive layout changes | `tests/recipe-detail-screen.test.tsx` | Capture popup open state before porting. Saved/custom book type rule remains MVP-governed. |
| `GLOBAL::LoginGateModal` | `needs-prototype-freeze` | `prototype parity` | none | `screens/modals.jsx::LoginGate` | `components/auth/login-gate-modal.tsx` | `shared responsive preserve` | Codex Stage 6 if auth modal responsive layout changes | `tests/auth-gate-store.test.ts`<br>`tests/e2e/slice-06-recipe-to-planner.spec.ts` | Capture protected-action open state before porting. Return-to-action remains MVP-governed. |
| `HOME::HomeSortOpenState` | `needs-prototype-freeze` | `prototype parity` | none | `screens/modals.jsx::SortSheet` | `components/home/home-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if HOME sort responsive layout changes | `tests/home-screen.test.tsx` | Capture open sort state unless the host HOME exact screenshot intentionally covers it. |
| `HOME::IngredientFilterModal` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::IngredientFilterModal` | `components/home/ingredient-filter-modal.tsx` | `shared responsive preserve` | Codex Stage 6 if filter modal responsive layout changes | `tests/home-screen.test.tsx`<br>`tests/e2e/slice-02-discovery-filter.spec.ts` | Capture open state before exact claim. |
| `MENU_ADD::PlannedServingsInput` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/wave1.jsx::PlanningServingsModal` | MENU_ADD add flow components | `shared responsive preserve` | Codex Stage 6 if add-flow modal changes | `tests/e2e/slice-08a-meal-add-search-core.spec.ts`<br>`tests/e2e/slice-08b-meal-add-books-pantry.spec.ts` | Capture serving input state before exact claim. |
| `SHOPPING_DETAIL::PantryReflectPicker` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/extras.jsx::AddToPantryModal` | `components/shopping/pantry-reflection-popup.tsx` | `shared responsive preserve` | Codex Stage 6 if reflect modal responsive layout changes | `tests/e2e/slice-12b-shopping-pantry-reflect.spec.ts`<br>`tests/shopping-detail.frontend.test.tsx` | Capture official reflect states. Preserve `null`, `[]`, selected IDs semantics. |
| `COOK_MODE::ConsumedIngredientChecklist` | `needs-prototype-freeze` | `prototype-derived design` | none | not fixed in current reference set | `components/cooking/consumed-ingredient-sheet.tsx` | `shared responsive preserve` | Codex Stage 6 if consumed sheet changes | `tests/e2e/slice-15a-cook-planner-complete.spec.ts` | Capture checklist state before exact claim. |
| `SETTINGS::NicknameEditSheet` | `needs-prototype-freeze` | `prototype-derived design` | none | not fixed in current reference set | `components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings sheet changes | `tests/settings-screen.test.tsx`<br>`tests/e2e/slice-17c-settings.spec.ts` | Capture sheet state before exact claim. |
| `SETTINGS::LogoutConfirm` | `needs-prototype-freeze` | `prototype-derived design` | none | not fixed in current reference set | `components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings dialog changes | `tests/settings-screen.test.tsx`<br>`tests/e2e/slice-17c-settings.spec.ts` | Capture confirm state before exact claim. |
| `SETTINGS::AccountDeleteConfirm` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/extras.jsx::MyPageAccountScreen` destructive entry | `components/settings/settings-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if settings dialog changes | `tests/settings-screen.test.tsx`<br>`tests/settings-account.backend.test.ts` | Capture warning confirm state before exact claim. |
| `MYPAGE::RecipeBookDeleteConfirm` | `needs-prototype-freeze` | `prototype-derived design` | none | not fixed in current reference set | `components/mypage/mypage-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if mypage dialog changes | `tests/e2e/slice-17a-mypage.spec.ts` | Capture confirm state before exact claim. |
| `MYPAGE::RecipebookTab` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/mypage.jsx::MyPageScreen` plus saved/book states | `components/mypage/mypage-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if mypage tab layout changes | `tests/mypage-screen.test.tsx`<br>`tests/e2e/slice-17a-mypage.spec.ts` | Capture tab state before exact claim. |
| `MYPAGE::ShoppingListsTab` | `needs-prototype-freeze` | `prototype-derived design` | none | `screens/mypage.jsx::MyPageScreen` shopping history entry | `components/mypage/mypage-screen.tsx` | `shared responsive preserve` | Codex Stage 6 if mypage tab layout changes | `tests/mypage-screen.test.tsx`<br>`tests/e2e/slice-17a-mypage.spec.ts` | Capture tab state before exact claim. |

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

## Phase 3 Reference Capture Queue

Capture these before starting their MVP porting slices:

1. `LOGIN`, `ATE_LIST`, `RECIPEBOOK_DETAIL`.
2. `MEAL_SCREEN`, `SHOPPING_FLOW`, `COOK_READY_LIST`, `COOK_MODE`.
3. `PantryAddSheet`, `PantryBundlePicker`, `PlannerAddPopup`, `SavePopup`, `LoginGateModal`.
4. MENU_ADD internal pickers: `RecipeSearchPicker`, `RecipeBookSelector`, `RecipeBookDetailPicker`, `PantryMatchPicker`, `PlannedServingsInput`.
5. Settings/Mypage modal states: `NicknameEditSheet`, `LogoutConfirm`, `AccountDeleteConfirm`, `RecipeBookDeleteConfirm`, recipebook tab, shopping-list tab.

This queue does not block slices that already have exact-ready references. For example, Slice B can start with current `HOME` and `RECIPE_DETAIL` references, while Slice C/D/E/F must first capture any missing picker, sheet, modal, or sub-screen state they intend to claim as 100% parity.

Each Phase 3 capture must update `ui/designs/reference/wave1-fixed-prototype/manifest.json` and re-run `pnpm validate:wave1-prototype-lock`.

## Phase 2 Closeout Checklist

- Every manifest mobile surface appears in the exact-ready table.
- Every exact-ready table row lists both 390px and 320px reference paths.
- Every known missing app surface is classified as `needs-prototype-freeze`, not silently allowed into porting.
- Web/desktop redesign is isolated as `web-only` or `future web redesign`.
- Token implementation path is mobile-scoped by default.
- No row uses `90+`, `95+`, or broad approved divergence as completion proof.
