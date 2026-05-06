# Claude Design Coverage Review

> Date: 2026-05-06 (Wave 1.6 완료 시점)
> Source: `ui/designs/prototypes/claude-design-260505-wave1/`
> Source-of-truth: `index.html` (= `homecook-baemin-prototype.html`, byte-identical)
> Wave: **1.6 (P0 + P1.1 + P1.2)**

## 범례

| 기호 | 의미 |
|------|------|
| ✅ | 전용 화면/레이아웃이 존재한다. 흐름 클릭으로 진입 가능 |
| △ | 진입은 가능하지만 데스크톱은 mobile fallback. (max-width 720 컨테이너 안에 모바일 화면이 그대로 렌더링됨) |
| ❌ | 화면 자체가 없다 |

## 화면 커버리지

### 핵심 5탭 + 디테일

| ID | 모바일 | 데스크톱 | 비고 |
|----|--------|---------|------|
| HOME | ✅ | ✅ DesktopHome | 1.5에서 INGREDIENT_FILTER 진입 추가 |
| RECIPE_DETAIL | ✅ | ✅ DesktopRecipeDetail | 변동 없음 |
| PLANNER_WEEK | ✅ | ✅ DesktopPlanner | MENU_ADD 진입 wired |
| PANTRY | ✅ | ✅ DesktopPantry | 변동 없음 |
| MYPAGE | ✅ | ✅ DesktopMyPage | onGoPage 통한 sub-screen 진입 |

### Wave 1 routes — Wave 1.5에서 데스크톱 승격된 화면

| ID | 모바일 | 데스크톱 | 비고 |
|----|--------|---------|------|
| MENU_ADD | ✅ MenuAddScreen | ✅ DesktopMenuAddScreen | 4-tab 사이드바: 검색 / 레시피북 / 팬트리 매칭 / 직접 등록·YT |
| SHOPPING_FLOW | ✅ ShoppingCreateScreen | ✅ DesktopShoppingCreateScreen | 좌측 섹션별 그리드 + 우측 sticky 요약 카드 |
| SHOPPING_DETAIL | ✅ ShoppingDetailScreen | ✅ DesktopShoppingDetailScreen | 진행률 바 + 2-col 섹션 그리드 + 완료/팬트리 반영 액션 |
| COOK_MODE | ✅ CookRunScreen | ✅ DesktopCookRunScreen | 좌측 큰 step 카드 + 우측 단계 overview · 차감 체크리스트 |
| RECIPEBOOK_DETAIL | ✅ MyPageRecipebookDetailScreen | ✅ DesktopMyPageRecipebookDetail | **신규 (P0)** · 320px 사이드바 + 레시피 그리드 |
| INGREDIENT_FILTER_MODAL | ✅ IngredientFilterModal (sheet) | ✅ DesktopIngredientFilterDialog (dialog) | **신규 (P0)** · HOME 검색 영역에서 진입 |

### Wave 1.6에서 추가 승격된 화면 (P1.2)

| ID | 모바일 | 데스크톱 | 비고 |
|----|--------|---------|------|
| LOGIN | ✅ LoginScreen | ✅ DesktopLoginScreen | 좌 gradient hero + 우 provider 4개 + return-to-action 카드. **Wave 1.6 신규** |
| SETTINGS | ✅ SettingsScreen | ✅ DesktopSettingsScreen | 220px 사이드바 + 패널별 row/toggle. NicknameEditSheet · LogoutConfirm · AccountDeleteConfirm 모두 wired. **Wave 1.6 신규** |
| MEAL_SCREEN | ✅ MealDetailScreen | ✅ DesktopMealDetailScreen | 좌 hero/timeline/ingredients + 우 sticky 인분/액션/삭제 카드. servingChangeConfirm 자동 발동. **Wave 1.6 신규** |
| COOK_READY_LIST | ✅ CookListScreen | ✅ DesktopCookListScreen | gradient hero + 오늘/내일/이번 주 3-section 카드 그리드. **Wave 1.6 신규** |

### Wave 1 routes — 데스크톱이 아직 fallback인 화면 (P1.3)

| ID | 모바일 | 데스크톱 | Fallback 사유 |
|----|--------|---------|--------------|
| LEFTOVERS | ✅ LeftoversScreen | △ fallback | P1.3. fallback에서 동작 정상. |
| ATE_LIST | ✅ AteListScreen | △ fallback | P1.3. |
| MANUAL_RECIPE_CREATE | ✅ ManualRecipeCreateScreen | △ fallback | P1.3. desktop에서는 form layout 권장. |
| YT_IMPORT | ✅ YtImportScreen | △ fallback | P1.3. |
| RECIPE_SEARCH_PICKER (모바일 picker) | ✅ RecipeSearchPicker | △ fallback | desktop은 DesktopMenuAddScreen `검색` 탭이 사실상 대체. picker 단독은 미구현. |
| MYPAGE_TAB_RECIPEBOOK | ✅ MyPageRecipebookTab | △ fallback | 책 목록은 fallback. 책 상세(`mypage-recipebook-detail`)는 desktop 전용 ✅ |
| MYPAGE_TAB_SHOPPINGLISTS | ✅ MyPageShoppingTab | △ fallback | desktop 정렬/필터 미구현. P1.3. |

## 모달 / 피커 / 시트

### 모바일

| 컴포넌트 | 상태 | 진입 |
|----------|------|------|
| ConfirmDialog | ✅ | 공용 |
| PlannerAddPopup | ✅ | RECIPE_DETAIL · 데스크톱에서도 fixed-r1 fallback로 사용 |
| SavePopup | ✅ | RECIPE_DETAIL |
| SortSheet | ✅ | HOME |
| LoginGate | ✅ | quick panel · auth 흐름 |
| RecipeSearchPicker | ✅ | MENU_ADD |
| RecipeBookSelector | ✅ | MENU_ADD |
| RecipeBookDetailPicker | ✅ | MENU_ADD → 책 선택 후 |
| PantryMatchPicker | ✅ | MENU_ADD |
| PantryAddSheet | ✅ | PANTRY ‘+’ |
| PantryBundlePicker | ✅ | PantryAddSheet ‘일괄 추가’ |
| PantryReflectPicker | ✅ | 장보기 완료 후 |
| ConsumedIngredientSheet | ✅ | COOK_MODE 완료 시 |
| NicknameEditSheet | ✅ | SETTINGS |
| **PlanningServingsModal** | ✅ **신규 (P0)** | MENU_ADD onPickRecipe 흐름 |
| **IngredientFilterModal** | ✅ **신규 (P0)** | HOME ‘🔎 재료로 거르기’ 칩 |
| **servingChangeConfirm** | ✅ **신규 wired (P0)** | MEAL_SCREEN 인분 변경 시 (장보기/요리 흐름 진입한 식사) |

### 데스크톱

| 컴포넌트 | 상태 | 비고 |
|----------|------|------|
| PlannerAddPopup / SavePopup / SortSheet / LoginGate | ✅ fixed-overlay | 모바일과 동일 컴포넌트를 fixed wrapper로 재사용 |
| **DesktopIngredientFilterDialog** | ✅ **신규 (P0)** | 720px 가로 + 2-col 카테고리 그리드 |
| **PlanningServingsModal** | ✅ **신규 (P0)** | 모바일과 동일 컴포넌트 재사용 (centered) |
| **servingChangeConfirm (ConfirmDialog)** | ✅ **신규 wired (P0)** | App-level fixed overlay |
| RecipeSearchPicker | △ fallback | desktop은 DesktopMenuAddScreen ‘검색’ 탭이 대체. P2. |
| RecipeBookSelector | △ fallback | DesktopMenuAddScreen ‘레시피북’ 탭이 대체. P2. |
| RecipeBookDetailPicker | △ fallback | desktop dialog 미구현. P2. |
| PantryMatchPicker | △ fallback | DesktopMenuAddScreen ‘팬트리 매칭’ 탭이 대체. P2. |
| PantryAddSheet | △ fallback | desktop dialog 미구현. P2. |
| PantryBundlePicker | △ fallback | P2. |
| PantryReflectPicker | △ fallback | P2. |
| ConsumedIngredientSheet | △ fallback | DesktopCookRunScreen 사이드바 차감 체크리스트가 일부 대체. P2. |
| NicknameEditSheet | △ fallback | P2. |
| LogoutConfirm / AccountDeleteConfirm | ✅ ConfirmDialog 재사용 | desktop fixed overlay |
| RecipeBookDeleteConfirm | ✅ ConfirmDialog 재사용 | DesktopMyPageRecipebookDetail 내부에서 동작 확인 |

## 요약

- **모바일 주요 화면 21/21** — Wave 1.5의 RECIPEBOOK_DETAIL 추가로 100% 유지.
- **데스크톱 전용 layout**: 5 → 10 → **14개** (Wave 1.6에서 P1.2 4개 추가).
  - Wave 1.5 추가 5개: MENU_ADD, SHOPPING_FLOW, SHOPPING_DETAIL, COOK_MODE, RECIPEBOOK_DETAIL
  - **Wave 1.6 추가 4개: LOGIN, SETTINGS, MEAL_SCREEN, COOK_READY_LIST**
  - 추가 모달: DesktopIngredientFilterDialog (Wave 1.5)
- **데스크톱 fallback 잔존**: P1.3 **7개**로 감소. 모두 desktop shell 안 `max-width: 720` 컨테이너로 진입 가능.
- **데스크톱 picker/sheet/modal**: P2 (8개) 미수행. NicknameEditSheet는 Wave 1.6에서 SETTINGS desktop의 fixed-overlay wrapper로 활용됨.

## 다음 사람을 위한 진입 경로

`index.html`을 브라우저로 열고 우측 패널 ‘Wave 1 바로가기’에서 모든 신규 화면을 클릭으로 확인할 수 있습니다.

핵심 검증 동선:

1. **PlanningServingsModal 흐름** — 플래너 → 빈 슬롯 ‘+ 식사 추가’ → MENU_ADD → 레시피 선택 → 인분 입력 → 플래너 반영
2. **RECIPEBOOK_DETAIL 흐름** — 마이페이지 → 레시피북 → 책 클릭 → 레시피 그리드, 제거/삭제 confirm
3. **INGREDIENT_FILTER_MODAL 흐름** — HOME → 재료 칩 줄 끝 ‘🔎 재료로 거르기’ → 카테고리별 다중 선택 → 적용
4. **servingChangeConfirm** — Meal detail 진입 후 인분 스테퍼 조작 (status가 cooked/shopped일 때만 confirm 발동)
5. **데스크톱 shell 토글** — 상단 토글로 ‘🖥 데스크톱 웹’ 선택 → 위 4개 흐름 모두 desktop 전용 layout으로 표시
6. **Wave 1.6 진입 (데스크톱 shell)** — quick panel ‘Wave 1.6 데스크톱’ 섹션:
   - 🔐 로그인 화면 → DesktopLoginScreen (gradient hero + provider 카드)
   - 🥘 요리 준비 리스트 → DesktopCookListScreen
   - 🍽️ 끼니 상세 → DesktopMealDetailScreen (자동으로 등록된 식사 슬롯 진입)
   - 마이페이지 → ⚙️ 환경설정 → DesktopSettingsScreen (5-section 사이드바)

## 참고

- 모든 `.jsx` 파일이 `@babel/parser` JSX 파싱 통과 확인.
- `homecook-baemin-prototype.html`은 `index.html`과 byte-identical (`diff -q` 통과).
- split source(`app.jsx`, `screens/*.jsx`)는 `index.html`의 `// ===== screens/X.jsx =====` 마커 사이 구간에서 자동 추출 가능.
- 우선순위 2/3 fallback과 P2 desktop picker는 다음 correction pass에서 처리 예정.
