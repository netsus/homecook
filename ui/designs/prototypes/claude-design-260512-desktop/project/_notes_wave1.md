# Wave1 reference notes (captured from desktop-screens.jsx)

## Existing prototype files
- index html: `homecook desktop prototype.html` (root files: app.jsx, components.jsx, data.jsx, data-standalone.jsx, modals.jsx, screens-1.jsx, screens-2.jsx, styles.css, styles-patch.css)
- standalone bundled: `homecook desktop prototype (standalone).html`

## Wave1 desktop screens to mirror (already-built functions)
- DesktopHome (theme carousel + sort + 모든 레시피 grid + 재료로 검색 button)
- DesktopRecipeDetail (servings stepper, 인분 조절, sticky aside: 플래너에 추가 / 요리하기)
- DesktopPlanner (week strip, MealAddDialog 6 options: 검색/레시피북/팬트리/남은요리/유튜브/직접등록)
- DesktopMealDetailScreen (각 음식 카드: 인분 조절, 삭제 dialog, 장보기/요리하기. spec says 데스크탑 보완에서는 개별 [요리하기] 만들지 말것)
- DesktopMenuAddScreen — tabs: search / book / pantry / create(manual+yt)
- DesktopShoppingCreateScreen — 구매 vs 팬트리제외, 되살리기 / 이미있음, [장보기 목록 만들기] 완료 → SHOPPING_DETAIL
- DesktopShoppingDetailScreen — progress, sections, 이미있음 / 되살리기, read-only when completed
- DesktopCookRunScreen — skip per spec (mobile-only notice)
- DesktopLeftoversScreen — 다 먹음 / 플래너에 추가
- DesktopAteListScreen — 되돌리기 / 다시 만들기
- DesktopManualRecipeCreateScreen, DesktopYtImportScreen, DesktopRecipeSearchPicker
- DesktopMyPageRecipebookList, DesktopMyPageRecipebookDetail
- DesktopIngredientFilterDialog (centered modal for HOME 재료로 검색)

## Tokens used (T from data)
- T.mint, T.mintDeep, T.mintSoft, T.ink, T.text1/2/3/4, T.border, T.surfaceFill, T.surfaceSubtle, T.red, T.shadowDeep, T.shadowNatural, T.shadowSharp, T.shadowCrisp, T.fontBrand, T.fontUI
- mealAddBg/mealAddBorder/mealAddFg, cookDoneBg/Fg, shoppingDoneBg/Fg

## Plan for current standalone HTML
The existing file is large. Since context is tight, I'll rebuild incrementally by editing the source `homecook desktop prototype.html` if it loads external scripts, or directly edit the standalone copy.
