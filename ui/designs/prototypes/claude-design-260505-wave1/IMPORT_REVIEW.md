# Claude Design Wave 1 Import Review

Date: 2026-05-05
Source folder: `ui/designs/prototypes/claude-design-260505-wave1/`
Baseline folder: `ui/designs/prototypes/claude-design-260505/`

## Verdict

Wave 1 화면 컴포넌트는 들어왔다. 다만 아직 production frontend 포팅 기준으로는 바로 쓰기 어렵다.

가장 큰 이유는 실행 HTML과 분리 소스가 서로 맞지 않기 때문이다. Wave 1 변경은 주로 `index.html`과 `screens/wave1.jsx`에 들어갔고, `app.jsx`, `screens/pantry.jsx`, `screens/mypage.jsx`, `screens/extras.jsx`, `homecook-baemin-prototype.html`은 기존 prototype 내용이 대부분 그대로다.

## Confirmed

- `index.html`에는 Wave 1 screen/surface/modal 컴포넌트가 인라인으로 포함됐다.
- `screens/wave1.jsx`에는 다음 주요 컴포넌트가 추가됐다:
  - `LoginScreen`
  - `MenuAddScreen`
  - `RecipeSearchPicker`
  - `RecipeBookSelector`
  - `RecipeBookDetailPicker`
  - `PantryMatchPicker`
  - `LeftoversScreen`
  - `AteListScreen`
  - `ManualRecipeCreateScreen`
  - `YtImportScreen`
  - `ShoppingDetailScreen`
  - `PantryReflectPicker`
  - `SettingsScreen`
  - `NicknameEditSheet`
  - `MyPageRecipebookTab`
  - `MyPageShoppingTab`
  - `PantryAddSheet`
  - `PantryBundlePicker`
  - `ConsumedIngredientSheet`
- `index.html`의 `App`에는 `route.page` 기반 라우팅과 `login`, `menu-add`, `manual-create`, `yt-import`, `leftovers`, `ate-list`, `shopping-detail`, `settings`, `mypage-recipebook`, `mypage-shopping` 분기가 추가됐다.
- Chrome headless의 `--dump-dom` 검증에서 `index.html` 초기 홈 화면 DOM 렌더링은 확인됐다.

## Blockers Before Porting

1. Split-source mismatch
   - `index.html`은 Wave 1 반영본이다.
   - `app.jsx`는 Wave 0 수준의 기존 `App`이다.
   - `screens/pantry.jsx`는 `onOpenAdd` prop을 받지 않는다.
   - `screens/mypage.jsx`는 `onGoPage` prop과 Wave 1 메뉴 연결이 없다.
   - `screens/extras.jsx`는 `ConsumedIngredientSheet`, meal delete confirm, serving-change confirm 연결이 없다.
   - `homecook-baemin-prototype.html`은 `index.html`과 다르며 Wave 1 기준 실행 파일로 보기 어렵다.

2. `MENU_ADD` entry is not wired from planner
   - `MenuAddScreen` route는 존재한다.
   - 그러나 planner empty slot `+ 식사 추가` 버튼에는 `onClick`이 없다.
   - desktop `+ 식단 추가`는 `MENU_ADD`가 아니라 기존 `PlannerAddPopup`에 고정 recipe(`r1`)를 넘긴다.

3. Quick flow panel still exposes only old flows
   - 오른쪽 quick panel은 여전히 홈, 플래너 추가 시트, 저장 시트, 정렬 시트, 로그인 게이트 중심이다.
   - Wave 1 핵심 화면인 `MENU_ADD`, `SHOPPING_DETAIL`, `LEFTOVERS`, `SETTINGS`, `MYPAGE` tabs로 바로 들어가는 버튼이 없다.

4. `INGREDIENT_FILTER_MODAL` remains unresolved
   - 현재 HOME에는 inline ingredient chip filter가 있다.
   - 공식 modal/sheet 형태의 `INGREDIENT_FILTER_MODAL`은 별도 컴포넌트로 추가되지 않았다.

5. Desktop variants are fallback-level for new route pages
   - `route.page`가 있으면 desktop shell 안에서 mobile-style content를 보여준다.
   - 완전한 desktop variant라기보다는 desktop에서 접근 가능하게 만든 수준이다.

## Recommended Next Step

Claude Design에 한 번만 더 짧게 correction pass를 요청한다.

목표는 새 화면을 더 만들게 하는 것이 아니라, 현재 산출물을 포팅 가능한 기준으로 정리하게 하는 것이다:

- Wave 1 변경을 split source files에도 반영
- `homecook-baemin-prototype.html`을 `index.html`과 같은 Wave 1 실행본으로 동기화
- planner empty slot과 desktop add CTA가 `MENU_ADD`로 진입하도록 연결
- quick flow panel에 Wave 1 핵심 화면 shortcut 추가
- `INGREDIENT_FILTER_MODAL`을 만들거나, 이번 Wave에서 제외라고 명확히 표시
- desktop 신규 화면이 fallback인지, 별도 desktop design인지 명확히 표시

이 correction pass가 끝난 뒤에 frontend port Wave 1을 시작하는 편이 안전하다.
