# Baemin Full Port Canonical Ledger

Status: Wave 0 rerun complete with current prototype
Date: 2026-05-05
Source plan: `.omx/plans/claude-design-full-port-ralplan-20260504.md`
Current prototype source: `ui/designs/prototypes/claude-design-260505/`

이 문서는 Claude Design / 배민 스타일 전체 포팅을 시작하기 전, 공식 문서와 현재 프로토타입을 대조해 만든 canonical ledger다.
이번 Wave 0 재실행에서는 예전 prototype 경로가 아니라 `ui/designs/prototypes/claude-design-260505/`를 기준으로 prototype coverage를 다시 산정했다.
Wave 0의 범위는 추적표 확정이며, 런타임 UI, API, DB, route, component 코드는 변경하지 않는다.

## 기준

공식 계약 기준:
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.6.4.md`
- `docs/화면정의서-v1.5.1.md`
- `docs/유저flow맵-v1.3.1.md`
- `docs/db설계-v1.3.1.md`
- `docs/api문서-v1.2.2.md`

현재 프로토타입 기준:
- `ui/designs/prototypes/claude-design-260505/HANDOFF.md`
- `ui/designs/prototypes/claude-design-260505/app.jsx`
- `ui/designs/prototypes/claude-design-260505/screens/`
- `ui/designs/prototypes/claude-design-260505/homecook-baemin-prototype.html`
- `ui/designs/prototypes/claude-design-260505/uploads/DESIGN.md`
- `ui/designs/prototypes/claude-design-260505/uploads/DESIGN-9313df29.md`

역사적 parity / rollout 기준:
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`

작업/검증 기준:
- `docs/workpacks/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/product-design-authority.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`

## 현재 프로토타입 범위 요약

현재 프로토타입에 full coverage가 있는 화면:
- `HOME`: `screens/home.jsx`, `screens/desktop-screens.jsx::DesktopHome`
- `RECIPE_DETAIL`: `screens/detail.jsx`, `screens/desktop-screens.jsx::DesktopRecipeDetail`
- `PLANNER_WEEK`: `screens/planner.jsx`, `screens/desktop-screens.jsx::DesktopPlanner`
- `PANTRY`: `screens/pantry.jsx`, `screens/desktop-screens.jsx::DesktopPantry`
- `MYPAGE`: `screens/mypage.jsx`, `screens/desktop-screens.jsx::DesktopMyPage`

현재 프로토타입에 mobile/webview 중심으로만 있는 화면:
- `SHOPPING_FLOW`: `screens/extras.jsx::ShoppingCreateScreen`
- `COOK_READY_LIST`: `screens/extras.jsx::CookListScreen`
- `COOK_MODE`: `screens/extras.jsx::CookRunScreen`
- `MEAL_SCREEN`: `screens/extras.jsx::MealDetailScreen`
- 일부 마이페이지 하위 화면: `MyPageSavedScreen`, `MyPageAccountScreen`, `MyPageNotifScreen`, `MyPageHelpScreen`

현재 프로토타입에 없는 주요 화면:
- `LOGIN`
- `MENU_ADD`
- 공식 `SHOPPING_DETAIL` 재열람/read-only 화면
- `LEFTOVERS`
- `ATE_LIST`
- 공식 `SETTINGS`
- `RECIPEBOOK_DETAIL`
- `MANUAL_RECIPE_CREATE`
- `YT_IMPORT`
- `RECIPE_SEARCH_PICKER`
- 공식 레시피북/팬트리 add picker family

중요: `uploads/DESIGN.md`와 `uploads/DESIGN-9313df29.md`는 디자인 inspiration/source material이다. 제품 계약은 공식 문서가 우선이고, 실행 가능한 prototype coverage는 `app.jsx`와 `screens/*.jsx` 기준으로 판정한다.

## 표기 규칙

- `screen`: route 단위 화면 또는 전체화면 mode.
- `surface`: host 화면 안의 tab, picker, section, embedded flow.
- `modal`: modal, bottom sheet, popup, confirmation dialog.
- `prototype_coverage`: `webview / mobile_web / desktop_web` 순서로 적는다.
- `full`: 현재 prototype에 mobile/webview와 desktop variant가 모두 있다.
- `partial`: 현재 prototype에 일부 state, 일부 flow, mobile/webview만 있거나 공식 target과 맞지 않는 인접 화면만 있다.
- `missing`: 현재 prototype에 해당 target이 없다.
- `source_refs[]`: row 판단에 사용한 실제 경로 묶음이다. `OFFICIAL`은 위 공식 계약 기준 5개 문서와 `CURRENT_SOURCE_OF_TRUTH`를 뜻한다.

## 상태 값

| Status | 의미 |
| --- | --- |
| `current-prototype-full` | 현재 prototype에 대상 화면의 mobile/webview와 desktop variant가 모두 있다. 다음 단계는 production과 drift 비교다. |
| `current-prototype-partial` | 현재 prototype에 대상이 일부만 있다. Wave 1에서 누락 variant/state를 보강한다. |
| `current-prototype-missing` | 현재 prototype에 대상이 없다. Wave 1에서 Claude Design 보강 대상이다. |
| `repo-authority-covered` | 현재 prototype coverage와 별개로 repo authority/evidence가 있다. 기존 동작 증거로 재사용하되 현재 prototype visual proof로 간주하지 않는다. |
| `confirmed-host-covered` | 별도 row로 추적하지만 현재 구현/검증은 host 화면 authority/test 안에서 덮여 있다. |
| `confirmed-low-risk-reused` | low-risk reused로 닫힌 항목이다. drift proof 없이는 다시 열지 않는다. |

## Screen Rows

| canonical_key | route_or_entry | prototype_coverage | current prototype refs | design_source_class | authority/evidence | automation_spec_path | status | stop_condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `screen:HOME` | `/`, `app/page.tsx`, `components/home/home-screen.tsx` | `full / full / full` | `screens/home.jsx`, `screens/desktop-screens.jsx::DesktopHome` | `prototype-parity-current` | historical: `ui/designs/authority/HOME-prototype-porting-authority.md`, `ui/designs/authority/HOME-parity-authority.md` | `docs/workpacks/baemin-prototype-home-parity/automation-spec.json` | `current-prototype-full` | 현재 prototype과 production HOME drift를 다시 비교한다. 예전 h7 evidence는 historical evidence로만 쓴다. |
| `screen:RECIPE_DETAIL` | `/recipe/[id]`, `app/recipe/[id]/page.tsx`, `components/recipe/recipe-detail-screen.tsx` | `full / full / full` | `screens/detail.jsx`, `screens/desktop-screens.jsx::DesktopRecipeDetail` | `prototype-parity-current` | historical: `ui/designs/authority/RECIPE_DETAIL-parity-authority.md` | `docs/workpacks/baemin-prototype-recipe-detail-parity/automation-spec.json` | `current-prototype-full` | 현재 prototype은 reviews tab 등 prototype-only 가능성이 있으므로 공식 문서 충돌을 먼저 분리한다. |
| `screen:LOGIN` | `/login`, `app/login/page.tsx`, `components/auth/login-screen.tsx` | `missing / missing / missing` | N/A | `official-only-derived` | no current authority; design draft: `ui/designs/LOGIN.md` | N/A: `01-discovery-detail-auth` bootstrap surface | `current-prototype-missing` | return-to-action과 소셜 로그인 복귀 규칙으로 Wave 1 design 필요. |
| `screen:PLANNER_WEEK` | `/planner`, `app/planner/page.tsx`, `components/planner/planner-week-screen.tsx` | `full / full / full` | `screens/planner.jsx`, `screens/desktop-screens.jsx::DesktopPlanner` | `prototype-parity-current` | historical: `ui/designs/authority/PLANNER_WEEK-parity-authority.md` | `docs/workpacks/baemin-prototype-planner-week-parity/automation-spec.json` | `current-prototype-full` | Planner API/DB/status/auth 유지. 현재 prototype의 CTA/상태 label이 공식 계약과 충돌하는지 확인한다. |
| `screen:MEAL_SCREEN` | `/planner/[date]/[columnId]`, `app/planner/[date]/[columnId]/page.tsx`, `components/planner/meal-screen.tsx` | `partial / partial / missing` | `screens/extras.jsx::MealDetailScreen` | `prototype-derived-current-partial` | `ui/designs/authority/MEAL_SCREEN-authority.md`, `ui/designs/evidence/07-meal-manage/` | `docs/workpacks/07-meal-manage/automation-spec.json` | `current-prototype-partial` | current prototype에는 끼니 상세가 있으나 삭제/인분 변경 confirm과 desktop variant가 부족하다. |
| `screen:MENU_ADD` | `/menu-add`, `app/menu-add/page.tsx`, `components/planner/menu-add-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/MENU_ADD-authority.md`, `ui/designs/evidence/08a/` | `docs/workpacks/08a-meal-add-search-core/automation-spec.json`, `docs/workpacks/08b-meal-add-books-pantry/automation-spec.json` | `current-prototype-missing` | 검색/레시피북/팬트리/직접/YouTube 진입을 current prototype style로 Wave 1에서 보강한다. |
| `screen:SHOPPING_FLOW` | `/shopping/flow`, `app/shopping/flow/page.tsx`, `components/shopping/shopping-flow-screen.tsx` | `partial / partial / missing` | `screens/extras.jsx::ShoppingCreateScreen` | `prototype-derived-current-partial` | `ui/designs/authority/SHOPPING_FLOW-authority.md`, `ui/designs/evidence/09-shopping-preview-create/` | `docs/workpacks/09-shopping-preview-create/automation-spec.json` | `current-prototype-partial` | current prototype은 생성+review flow가 있으나 desktop variant와 official preview target 검증이 필요하다. |
| `screen:SHOPPING_DETAIL` | `/shopping/lists/[list_id]`, `app/shopping/lists/[list_id]/page.tsx`, `components/shopping/shopping-detail-screen.tsx` | `partial / partial / missing` | related only: `screens/extras.jsx::ShoppingCreateScreen`, `screens/extras.jsx::AddToPantryModal` | `prototype-derived-needed` | `ui/designs/authority/SHOPPING_DETAIL-authority.md`, `ui/designs/evidence/10a-shopping-detail-interact/` | `docs/workpacks/10a-shopping-detail-interact/automation-spec.json`, `docs/workpacks/12b-shopping-pantry-reflect/automation-spec.json` | `current-prototype-partial` | current prototype에는 read-only 재열람형 `SHOPPING_DETAIL`이 없다. 완료 후 409와 pantry reflect 3-way 의미를 Wave 1에서 보강한다. |
| `screen:COOK_READY_LIST` | `/cooking/ready`, `app/cooking/ready/page.tsx`, `components/cooking/cook-ready-list-screen.tsx` | `partial / partial / missing` | `screens/extras.jsx::CookListScreen` | `prototype-derived-current-partial` | `ui/designs/authority/COOK_READY_LIST-authority.md`, `ui/designs/evidence/14-cook-session-start/` | `docs/workpacks/14-cook-session-start/automation-spec.json` | `current-prototype-partial` | mobile/webview는 current prototype을 쓸 수 있으나 desktop variant와 official state coverage가 필요하다. |
| `screen:COOK_MODE` | `/cooking/sessions/[session_id]/cook-mode`, `/cooking/recipes/[recipe_id]/cook-mode`, `components/cooking/cook-mode-screen.tsx` | `partial / partial / missing` | `screens/extras.jsx::CookRunScreen` | `prototype-derived-current-partial` | `ui/designs/authority/COOK_MODE-authority.md`, `ui/designs/evidence/15a-cook-planner-complete/` | `docs/workpacks/15a-cook-planner-complete/automation-spec.json`, `docs/workpacks/15b-cook-standalone-complete/automation-spec.json` | `current-prototype-partial` | 인분 조절 UI 금지, planner/standalone 전이 분리, 소진 재료 sheet 누락을 보강한다. |
| `screen:LEFTOVERS` | `/leftovers`, `app/leftovers/page.tsx`, `components/leftovers/leftovers-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/LEFTOVERS-authority.md`, `ui/designs/evidence/16-leftovers/` | `docs/workpacks/16-leftovers/automation-spec.json` | `current-prototype-missing` | 남은요리 재사용/다먹음 전이를 current prototype style로 Wave 1에서 설계한다. |
| `screen:ATE_LIST` | `/leftovers/ate`, `app/leftovers/ate/page.tsx`, `components/leftovers/ate-list-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/ATE_LIST-authority.md`, `ui/designs/evidence/16-leftovers/` | `docs/workpacks/16-leftovers/automation-spec.json` | `current-prototype-missing` | 다먹은 히스토리와 덜먹음 복귀 동작을 current prototype style로 Wave 1에서 설계한다. |
| `screen:PANTRY` | `/pantry`, `app/pantry/page.tsx`, `components/pantry/pantry-screen.tsx` | `full / full / full` | `screens/pantry.jsx`, `screens/desktop-screens.jsx::DesktopPantry` | `prototype-parity-current-candidate` | `ui/designs/authority/PANTRY-authority.md`, `ui/designs/evidence/13-pantry-core/` | `docs/workpacks/13-pantry-core/automation-spec.json` | `current-prototype-full` | h8 후보였고 current prototype에도 있다. bundle/add surface는 별도 row로 유지한다. |
| `screen:MYPAGE` | `/mypage`, `app/mypage/page.tsx`, `components/mypage/mypage-screen.tsx` | `full / full / full` | `screens/mypage.jsx`, `screens/desktop-screens.jsx::DesktopMyPage` | `prototype-parity-current-candidate` | `ui/designs/authority/MYPAGE-authority.md`, `ui/designs/evidence/17a-mypage-overview-history/` | `docs/workpacks/17a-mypage-overview-history/automation-spec.json` | `current-prototype-full` | current prototype shell은 있으나 공식 recipebook/shopping tabs는 별도 surface row에서 보강한다. |
| `screen:SETTINGS` | `/settings`, `app/settings/page.tsx`, `components/settings/settings-screen.tsx` | `partial / partial / missing` | related only: `screens/extras.jsx::MyPageAccountScreen`, `screens/extras.jsx::MyPageNotifScreen` | `prototype-derived-needed` | `ui/designs/authority/SETTINGS-authority.md`, `ui/designs/evidence/17c-settings-account/` | `docs/workpacks/17c-settings-account/automation-spec.json` | `current-prototype-partial` | current prototype의 account/notif subpage는 공식 `SETTINGS` 전체를 대체하지 않는다. 닉네임/로그아웃/회원탈퇴 confirm 필요. |
| `screen:RECIPEBOOK_DETAIL` | `/mypage/recipe-books/[book_id]`, `app/mypage/recipe-books/[book_id]/page.tsx`, `components/recipebook/recipebook-detail-screen.tsx` | `missing / missing / missing` | N/A | `confirmed-low-risk-reused` | authority N/A by automation-spec rationale | `docs/workpacks/17b-recipebook-detail-remove/automation-spec.json` | `confirmed-low-risk-reused` | Drift proof 없으면 Wave 1 재디자인 요청에서 제외한다. |
| `screen:MANUAL_RECIPE_CREATE` | `/menu/add/manual`, `app/menu/add/manual/page.tsx`, `components/recipe/manual-recipe-create-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/MANUAL_RECIPE_CREATE-authority.md`, `ui/designs/evidence/18-manual-recipe-create/` | `docs/workpacks/18-manual-recipe-create/automation-spec.json` | `current-prototype-missing` | 직접 등록, 조리방법 선택, 상세/플래너 연계를 current prototype style로 Wave 1에서 설계한다. |
| `screen:YT_IMPORT` | `/menu/add/youtube`, `app/menu/add/youtube/page.tsx`, `components/recipe/youtube-import-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/YT_IMPORT-authority.md`, `ui/designs/evidence/19-youtube-import/` | `docs/workpacks/19-youtube-import/automation-spec.json` | `current-prototype-missing` | URL 검증/추출/등록, review/edit, 플래너 연계를 current prototype style로 Wave 1에서 설계한다. |

## Surface Rows

| canonical_key | host / entry | prototype_coverage | current prototype refs | design_source_class | authority/evidence | automation_spec_path | status | stop_condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `surface:MENU_ADD::RECIPE_SEARCH_PICKER` | `MENU_ADD`, `components/planner/recipe-search-picker.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/RECIPE_SEARCH_PICKER-authority.md`, `ui/designs/evidence/08a/` | `docs/workpacks/08a-meal-add-search-core/automation-spec.json` | `current-prototype-missing` | 독립 route로 승격하지 않고 MENU_ADD 안의 picker로 설계한다. |
| `surface:MENU_ADD::RecipeBookSelector` | `MENU_ADD`, recipebook add path | `missing / missing / missing` | N/A | `prototype-derived-needed` | host evidence/test 중심 | `docs/workpacks/08b-meal-add-books-pantry/automation-spec.json` | `current-prototype-missing` | MENU_ADD current style 보강 때 같은 family로 다룬다. |
| `surface:MENU_ADD::RecipeBookDetailPicker` | `MENU_ADD`, `components/planner/recipe-book-detail-picker.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | host evidence/test 중심 | `docs/workpacks/08b-meal-add-books-pantry/automation-spec.json` | `current-prototype-missing` | `RECIPEBOOK_DETAIL` 화면과 혼동하지 않고 recipe picker로 유지한다. |
| `surface:MENU_ADD::PantryMatchPicker` | `MENU_ADD`, `components/planner/pantry-match-picker.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | host evidence/test 중심 | `docs/workpacks/08b-meal-add-books-pantry/automation-spec.json` | `current-prototype-missing` | 팬트리 재료 기반 추천 계약을 유지한다. |
| `surface:PANTRY::PANTRY_BUNDLE_PICKER` | `PANTRY`, `components/pantry/pantry-bundle-picker.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/PANTRY_BUNDLE_PICKER-authority.md`, `ui/designs/evidence/13-pantry-core/` | `docs/workpacks/13-pantry-core/automation-spec.json` | `current-prototype-missing` | current prototype의 PANTRY 화면과 자동으로 묶지 않고 별도 sheet 디자인 보강 대상으로 둔다. |
| `surface:MYPAGE::MYPAGE_TAB_RECIPEBOOK` | `MYPAGE`, `components/mypage/mypage-screen.tsx` | `partial / partial / partial` | related only: `screens/mypage.jsx`, `screens/extras.jsx::MyPageSavedScreen`, `screens/desktop-screens.jsx::DesktopMyPage` | `prototype-derived-current-partial` | `ui/designs/authority/MYPAGE-authority.md`, `ui/designs/evidence/17a-mypage-overview-history/` | `docs/workpacks/17a-mypage-overview-history/automation-spec.json` | `current-prototype-partial` | current prototype은 saved recipes 중심이다. 공식 saved/custom recipebook tab과 custom CRUD를 보강한다. |
| `surface:MYPAGE::MYPAGE_TAB_SHOPPINGLISTS` | `MYPAGE`, `components/mypage/mypage-screen.tsx` | `partial / partial / missing` | related only: `screens/mypage.jsx` menu item `장보기 기록` | `prototype-derived-needed` | `ui/designs/authority/MYPAGE-authority.md`, `ui/designs/evidence/17a-mypage-overview-history/` | `docs/workpacks/17a-mypage-overview-history/automation-spec.json` | `current-prototype-partial` | 장보기 기록 tab과 `SHOPPING_DETAIL` read-only 재열람 연결을 Wave 1에서 구체화한다. |

## Modal / Sheet Rows

| canonical_key | host / trigger | prototype_coverage | current prototype refs | design_source_class | authority/evidence | automation_spec_path | status | stop_condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `modal:GLOBAL::LOGIN_GATE_MODAL` | 보호 액션 전역, `components/auth/login-gate-modal.tsx` | `full / full / missing` | `screens/modals.jsx::LoginGate` | `prototype-parity-current-partial` | historical: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md` | `docs/workpacks/baemin-prototype-modal-overlay-parity/automation-spec.json` | `current-prototype-partial` | desktop dialog variant와 return-to-action 복귀를 production 기준으로 보강한다. |
| `modal:HOME::HOME_SORT_SELECT_UI` | `HOME`, sort sheet/dropdown | `full / full / full` | `screens/modals.jsx::SortSheet`, desktop trigger in `DesktopHome` | `prototype-parity-current` | historical: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md` | `docs/workpacks/baemin-prototype-modal-overlay-parity/automation-spec.json` | `current-prototype-full` | 정렬 의미와 즉시 적용 동작을 바꾸지 않는다. |
| `modal:HOME::INGREDIENT_FILTER_MODAL` | `HOME`, `components/home/ingredient-filter-modal.tsx` | `missing / missing / missing` | N/A; current HOME uses inline chips | `prototype-derived-needed` | historical: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md` | `docs/workpacks/baemin-prototype-modal-overlay-parity/automation-spec.json` | `current-prototype-missing` | 공식 IngredientFilterModal이 필요하면 current style sheet/dialog로 Wave 1 보강한다. |
| `modal:RECIPE_DETAIL::PlannerAddPopup` | `RECIPE_DETAIL`, `components/recipe/planner-add-sheet.tsx` | `full / full / missing` | `screens/modals.jsx::PlannerAddPopup` | `prototype-parity-current-partial` | historical: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md`, `ui/designs/evidence/h3-planner-add-sync/` | `docs/workpacks/06-recipe-to-planner/automation-spec.json`, `docs/workpacks/baemin-prototype-modal-overlay-parity/automation-spec.json` | `current-prototype-partial` | 날짜/끼니/인분 선택, 성공 toast, 로그인 gate를 유지하고 desktop variant를 보강한다. |
| `modal:RECIPE_DETAIL::SavePopup` | `RECIPE_DETAIL`, `components/recipe/save-modal.tsx` | `full / full / missing` | `screens/modals.jsx::SavePopup` | `prototype-parity-current-partial` | historical: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md` | `docs/workpacks/baemin-prototype-modal-overlay-parity/automation-spec.json` | `current-prototype-partial` | 저장 가능한 책 타입 `saved/custom` 규칙과 desktop variant를 보강한다. |
| `modal:MEAL_SCREEN::MealDeleteConfirm` | `MEAL_SCREEN`, delete confirm in `components/planner/meal-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/MEAL_SCREEN-authority.md`, `tests/e2e/slice-07-meal-manage.spec.ts` | `docs/workpacks/07-meal-manage/automation-spec.json` | `current-prototype-missing` | current `MealDetailScreen`에는 확인 modal이 없다. 공식 삭제 확인을 Wave 1에서 보강한다. |
| `modal:MEAL_SCREEN::ServingChangeConfirm` | `MEAL_SCREEN`, serving-change confirm in `components/planner/meal-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/MEAL_SCREEN-authority.md`, `tests/e2e/slice-07-meal-manage.spec.ts` | `docs/workpacks/07-meal-manage/automation-spec.json` | `current-prototype-missing` | `registered` 즉시 변경, 진행 상태 확인 modal 분기를 current style로 보강한다. |
| `modal:MENU_ADD::PlannedServingsInput` | `MENU_ADD` add flow before Meal creation | `missing / missing / missing` | N/A | `prototype-derived-needed` | host evidence/test 중심 | `docs/workpacks/08a-meal-add-search-core/automation-spec.json`, `docs/workpacks/08b-meal-add-books-pantry/automation-spec.json` | `current-prototype-missing` | Meal 생성 전 계획 인분 입력을 MENU_ADD family에서 보강한다. |
| `modal:PANTRY::PantryAddSheet` | `PANTRY`, `components/pantry/pantry-add-sheet.tsx` | `partial / partial / missing` | related only: `screens/pantry.jsx` plus button | `prototype-derived-needed` | `ui/designs/authority/PANTRY-authority.md`, `ui/designs/evidence/13-pantry-core/` | `docs/workpacks/13-pantry-core/automation-spec.json` | `current-prototype-partial` | plus entry는 있으나 sheet body가 없으므로 Wave 1 보강 대상이다. |
| `modal:SHOPPING_DETAIL::PantryReflectPicker` | `SHOPPING_DETAIL`, `components/shopping/pantry-reflection-popup.tsx` | `partial / partial / missing` | related only: `screens/extras.jsx::AddToPantryModal` | `prototype-derived-current-partial` | host test/evidence 중심 | `docs/workpacks/12b-shopping-pantry-reflect/automation-spec.json` | `current-prototype-partial` | current modal은 quantity add 흐름이다. 공식 `null`, `[]`, selected IDs 의미로 재설계해야 한다. |
| `modal:COOK_MODE::ConsumedIngredientChecklist` | `COOK_MODE`, `components/cooking/consumed-ingredient-sheet.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/COOK_MODE-authority.md`, `ui/designs/evidence/15a-cook-planner-complete/` | `docs/workpacks/15a-cook-planner-complete/automation-spec.json` | `current-prototype-missing` | current `CookRunScreen`은 완료 직행이다. 소진 재료 checklist sheet를 Wave 1에서 보강한다. |
| `modal:SETTINGS::NicknameEditSheet` | `SETTINGS`, `components/settings/settings-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/SETTINGS-authority.md`, `ui/designs/evidence/17c-settings-account/` | `docs/workpacks/17c-settings-account/automation-spec.json` | `current-prototype-missing` | 공식 닉네임 변경 sheet를 current style로 보강한다. |
| `modal:SETTINGS::LogoutConfirm` | `SETTINGS`, `components/settings/settings-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/SETTINGS-authority.md`, `ui/designs/evidence/17c-settings-account/` | `docs/workpacks/17c-settings-account/automation-spec.json` | `current-prototype-missing` | 로그아웃 확인 dialog를 current style로 보강한다. |
| `modal:SETTINGS::AccountDeleteConfirm` | `SETTINGS`, `components/settings/settings-screen.tsx` | `partial / partial / missing` | related only: `screens/extras.jsx::MyPageAccountScreen` destructive button | `prototype-derived-needed` | `ui/designs/authority/SETTINGS-authority.md`, `ui/designs/evidence/17c-settings-account/` | `docs/workpacks/17c-settings-account/automation-spec.json` | `current-prototype-partial` | destructive button은 있으나 warning confirm이 없다. 공식 회원탈퇴 confirm이 필요하다. |
| `modal:MYPAGE::RecipeBookDeleteConfirm` | `MYPAGE`, `components/mypage/mypage-screen.tsx` | `missing / missing / missing` | N/A | `prototype-derived-needed` | `ui/designs/authority/MYPAGE-authority.md`, `ui/designs/evidence/17a-mypage-overview-history/` | `docs/workpacks/17a-mypage-overview-history/automation-spec.json` | `current-prototype-missing` | custom recipebook에만 삭제 confirm을 노출한다. |

## Wave 1 후보 묶음

현재 prototype 기준으로 바로 UI 포팅하지 말고, 아래 gap을 먼저 Claude Design / design authority 단계에서 닫는다.

### 현재 prototype full coverage라서 drift 비교가 먼저인 row

- `screen:HOME`
- `screen:RECIPE_DETAIL`
- `screen:PLANNER_WEEK`
- `screen:PANTRY`
- `screen:MYPAGE`
- `modal:HOME::HOME_SORT_SELECT_UI`

### current prototype partial이라 variant/state 보강이 필요한 row

- `screen:MEAL_SCREEN`
- `screen:SHOPPING_FLOW`
- `screen:SHOPPING_DETAIL`
- `screen:COOK_READY_LIST`
- `screen:COOK_MODE`
- `screen:SETTINGS`
- `surface:MYPAGE::MYPAGE_TAB_RECIPEBOOK`
- `surface:MYPAGE::MYPAGE_TAB_SHOPPINGLISTS`
- `modal:GLOBAL::LOGIN_GATE_MODAL`
- `modal:RECIPE_DETAIL::PlannerAddPopup`
- `modal:RECIPE_DETAIL::SavePopup`
- `modal:PANTRY::PantryAddSheet`
- `modal:SHOPPING_DETAIL::PantryReflectPicker`
- `modal:SETTINGS::AccountDeleteConfirm`

### current prototype에 없어 새 디자인 보강이 필요한 row

- `screen:LOGIN`
- `screen:MENU_ADD`
- `screen:LEFTOVERS`
- `screen:ATE_LIST`
- `screen:MANUAL_RECIPE_CREATE`
- `screen:YT_IMPORT`
- `surface:MENU_ADD::RECIPE_SEARCH_PICKER`
- `surface:MENU_ADD::RecipeBookSelector`
- `surface:MENU_ADD::RecipeBookDetailPicker`
- `surface:MENU_ADD::PantryMatchPicker`
- `surface:PANTRY::PANTRY_BUNDLE_PICKER`
- `modal:HOME::INGREDIENT_FILTER_MODAL`
- `modal:MEAL_SCREEN::MealDeleteConfirm`
- `modal:MEAL_SCREEN::ServingChangeConfirm`
- `modal:MENU_ADD::PlannedServingsInput`
- `modal:COOK_MODE::ConsumedIngredientChecklist`
- `modal:SETTINGS::NicknameEditSheet`
- `modal:SETTINGS::LogoutConfirm`
- `modal:MYPAGE::RecipeBookDeleteConfirm`

### 다시 열지 않는 row

- `screen:RECIPEBOOK_DETAIL`: low-risk reused. Drift proof 없이는 Wave 1 재디자인 요청에서 제외한다.

## Batch 파생 규칙

실행 batch는 이 ledger에서만 파생한다.

묶을 수 있는 batch:
- `LOGIN` + `SETTINGS` + settings modals: auth/account family.
- `MENU_ADD` + add picker/surfaces + planned servings modal: meal-add family.
- `SHOPPING_FLOW` + `SHOPPING_DETAIL` + pantry reflect modal: shopping family. 단, read-only/409와 pantry reflect 3-way 의미는 별도 테스트로 고정한다.
- `COOK_READY_LIST` + `COOK_MODE` + consumed ingredient sheet: cooking family. 단, planner/standalone 상태 전이를 섞지 않는다.
- `LEFTOVERS` + `ATE_LIST`: leftovers/history family.
- `PANTRY` + `PantryAddSheet` + `PANTRY_BUNDLE_PICKER`: pantry family. 단, screen parity와 picker/sheet derived scope를 분리한다.
- `MYPAGE` + recipebook/shopping tabs + recipebook delete confirm: mypage family. 단, shell parity와 tab derived scope를 분리한다.

분리해야 하는 경우:
- public contract, API, DB, auth, status, read-only 동작이 바뀌는 경우.
- current prototype full coverage row와 missing/partial row를 한 PR에 섞는 경우.
- `RECIPEBOOK_DETAIL` low-risk reused를 새로운 derived redesign과 섞는 경우.
- modal이 host body behavior 변경과 독립 검증을 필요로 하는 경우.

## Wave 0 종료 확인

- 사용자 체크리스트의 모든 화면 항목은 `screen` 또는 `surface` row로 표현했다.
- 사용자 체크리스트의 모든 modal/bottom-sheet/popup 항목은 `surface` 또는 `modal` row로 표현했다.
- 모든 row에는 current prototype refs 또는 N/A 사유가 있다.
- 모든 row에는 authority/evidence 또는 N/A 사유가 있다.
- 모든 row에는 automation_spec_path 또는 N/A 사유가 있다.
- 예전 h7/h8 evidence는 historical evidence로만 남겼고, current prototype proof로 간주하지 않았다.
- `INGREDIENT_FILTER_MODAL`은 예전 repo evidence가 있지만 current prototype에는 없으므로 `current-prototype-missing`으로 재분류했다.
- `RECIPEBOOK_DETAIL`은 `confirmed-low-risk-reused`로 잠그고 drift proof 없이는 재오픈하지 않는다.
- Wave 0 재실행에서는 런타임 UI와 공식 계약을 변경하지 않았다.
