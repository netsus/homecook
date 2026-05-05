# Claude Design Wave 1.5 보강 요청 프롬프트

이 문서는 Wave 1.5 작업을 Claude Design에 요청하기 위해 작성한 기록용 프롬프트다.

Wave 1.5 결과는 `COVERAGE_REVIEW.md`와 `HANDOFF.md` 부록 D를 기준으로 확인한다.

아래 요청은 작성 당시 `ui/designs/prototypes/claude-design-260505-wave1/` 프로토타입을 기준으로 했다.

## 목표

우리 서비스의 모든 화면과 모달이 Claude Design 프로토타입 안에 빠짐없이 있어야 한다. 최종 목표는 이 프로토타입을 실제 프론트엔드에 포팅하는 것이므로, 단순 placeholder가 아니라 실제 사용 흐름을 이해할 수 있는 수준의 화면으로 보강해줘.

이번 작업의 핵심은 두 가지다.

1. 모바일에서 아직 없는 화면/모달을 모두 추가한다.
2. 데스크톱에서 mobile fallback으로 보이는 화면을 전용 데스크톱 레이아웃으로 승격한다.

## 작업 대상 파일

기준 폴더:

`ui/designs/prototypes/claude-design-260505-wave1/`

수정 대상:

- `index.html`
- `homecook-baemin-prototype.html`
- `app.jsx`
- `screens/*.jsx`
- `HANDOFF.md`
- 필요하면 `COVERAGE_REVIEW.md`

중요:

- 현재 `index.html`이 source of truth다.
- `homecook-baemin-prototype.html`은 `index.html`과 동일하게 유지해야 한다.
- split source(`app.jsx`, `screens/*.jsx`)도 `index.html`과 동기화해야 한다.
- 실제 production frontend 파일은 수정하지 말고, 프로토타입 폴더 안에서만 작업해줘.

## 현재 커버리지 판단

모바일 주요 화면은 21개 중 20개가 있다. 빠진 것은 `RECIPEBOOK_DETAIL`이다.

데스크톱은 21개 중 20개가 진입 가능하지만, 전용 데스크톱 레이아웃은 아래 5개뿐이다.

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`
- `PANTRY`
- `MYPAGE`

나머지 데스크톱 화면은 현재 mobile fallback이다. 즉, 데스크톱 shell 안에 모바일 화면이 들어가는 상태다. 최종 포팅 기준으로는 전용 데스크톱 화면이 필요하다.

## P0: 반드시 먼저 추가할 누락 화면/모달

아래 4개를 우선 구현해줘.

1. `RECIPEBOOK_DETAIL`
   - 경로: `/mypage/recipe-books/[book_id]`
   - 목적: 레시피북 안의 레시피 목록 관리
   - 필요 요소: 레시피북 이름, 레시피 목록, 레시피 열기, 레시피 제거, 레시피북 삭제 확인 진입
   - 모바일 화면과 데스크톱 전용 화면 모두 필요

2. `INGREDIENT_FILTER_MODAL`
   - 진입: `HOME` 검색/필터 영역
   - 목적: 재료 다중 선택 필터
   - 필요 요소: 선택된 재료, 카테고리별 재료, 선택 초기화, 적용 버튼
   - 모바일은 바텀시트 또는 풀 모달, 데스크톱은 dialog/dropdown panel 중 현재 디자인에 맞는 방식

3. 인분 변경 확인 모달
   - 진입: `MEAL_SCREEN`에서 이미 장보기/요리 흐름에 들어간 식사의 인분을 바꾸려 할 때
   - 목적: 장보기/요리 흐름에 영향이 있음을 안내하고 변경 확인
   - 현재 `servingChangeConfirm` 상태는 있으나 실제 UI 연결이 부족하므로 완성 필요

4. 계획 인분 입력 모달
   - 진입: 레시피 검색/레시피북/팬트리 기반으로 식사를 추가하기 직전
   - 목적: Meal 생성 전 계획 인분 입력
   - `MENU_ADD`, `RecipeSearchPicker`, `RecipeBookDetailPicker`, `PantryMatchPicker` 흐름과 연결

## P1: 데스크톱 전용 layout으로 승격할 화면

아래 화면들은 현재 데스크톱에서 mobile fallback으로 보인다. 각각 데스크톱에 맞는 정보 밀도와 레이아웃으로 다시 디자인해줘.

우선순위 1:

- `SHOPPING_FLOW`
- `SHOPPING_DETAIL`
- `MENU_ADD`
- `COOK_MODE`

우선순위 2:

- `COOK_READY_LIST`
- `MEAL_SCREEN`
- `LOGIN`
- `SETTINGS`

우선순위 3:

- `LEFTOVERS`
- `ATE_LIST`
- `MYPAGE_TAB_RECIPEBOOK`
- `MYPAGE_TAB_SHOPPINGLISTS`
- `MANUAL_RECIPE_CREATE`
- `YT_IMPORT`
- `RECIPE_SEARCH_PICKER`

## P2: 데스크톱 picker / sheet / modal 정리

아래 UI는 모바일에서는 동작하지만, 데스크톱에서는 fallback이다. 데스크톱에서는 모달/패널/드롭다운 중 가장 자연스러운 방식으로 정리해줘.

- `RecipeBookSelector`
- `RecipeBookDetailPicker`
- `PantryMatchPicker`
- `PANTRY_BUNDLE_PICKER`
- `PantryAddSheet`
- `PantryReflectPicker`
- `ConsumedIngredientSheet`
- `NicknameEditSheet`
- `LogoutConfirm`
- `AccountDeleteConfirm`
- `RecipeBookDeleteConfirm`

## 디자인 유지 조건

- 현재 Claude Design 프로토타입의 배민 스타일을 유지한다.
- 이미 완성된 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, `PANTRY`, `MYPAGE`의 시각 언어와 맞춘다.
- 모바일은 앱 내장 웹뷰와 모바일 웹에서 자연스럽게 보여야 한다.
- 데스크톱은 단순 확대가 아니라 넓은 화면에 맞는 정보 구조여야 한다.
- 토스트, 로딩, 빈 상태, 에러 상태는 화면 목록에는 없지만, 필요한 화면에는 자연스럽게 포함한다.
- 사용자가 실제 흐름을 클릭해서 확인할 수 있도록 quick flow 또는 실제 진입 경로를 연결한다.

## 금지 사항

- production frontend 파일은 수정하지 말 것.
- 문서에 없는 API, DB 필드, 서버 endpoint를 새로 만들지 말 것.
- 기존 완성 화면을 삭제하거나 흐름을 끊지 말 것.
- placeholder 문구만 있는 빈 화면으로 처리하지 말 것.
- mobile fallback을 데스크톱 완료로 표시하지 말 것.

## 완료 조건

작업이 끝나면 아래를 남겨줘.

1. `COVERAGE_REVIEW.md`에 최신 커버리지 표 업데이트
   - 모바일/데스크톱을 분리해서 ✅/△/❌ 표시
   - 데스크톱 fallback이 남은 화면은 반드시 이유 기재

2. `HANDOFF.md` 업데이트
   - 이번 작업에서 추가한 화면
   - 아직 남긴 gap
   - 다음 사람이 바로 이어서 볼 수 있는 확인 방법

3. 파일 동기화
   - `index.html`
   - `homecook-baemin-prototype.html`
   - `app.jsx`
   - `screens/*.jsx`

4. 자체 검증
   - `index.html`이 브라우저에서 열리는지 확인
   - 주요 quick flow 버튼으로 새 화면에 진입 가능한지 확인
   - 모바일/데스크톱 전환 시 화면이 깨지지 않는지 확인
   - JSX parse 문제가 없는지 확인

최종 보고에는 “추가된 화면”, “데스크톱 fallback에서 전용 layout으로 승격한 화면”, “아직 남은 gap”, “검증 결과”만 짧게 정리해줘.
