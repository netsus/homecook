# Acceptance Checklist: desktop-home-pantry-parity

> 이 acceptance file은 데스크톱 프로토타입 홈과 팬트리의 모바일 기능 parity 슬라이스를 검증한다.
> 프로토타입 전용 변경이며 production 코드에 영향이 없다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path — DesktopHome

- [x] DesktopHome에 검색 입력이 표시되고, 레시피 이름으로 필터링된다 <!-- omo:id=dhp-accept-search-visible;stage=4;scope=frontend;review=6 -->
- [x] 재료 필터 칩이 모바일 `INGREDIENT_FILTERS` 6개(밥·면, 육류, 해산물, 채소, 계란·두부, 김치)와 emoji가 일치한다 <!-- omo:id=dhp-accept-filters-match;stage=4;scope=frontend;review=6 -->
- [x] 재료 필터 칩 클릭 시 해당 재료가 포함된 레시피만 표시된다 <!-- omo:id=dhp-accept-filter-action;stage=4;scope=frontend;review=6 -->
- [x] THEMES 카러셀이 6개 테마 카드(자취생 간단식, 집밥 기본기, 다이어트 식단, 밥도둑, 주말 특식, 비오는 날)와 함께 표시된다 <!-- omo:id=dhp-accept-themes-visible;stage=4;scope=frontend;review=6 -->
- [x] THEMES 카드 클릭 시 해당 테마 레시피만 필터링되고, 재클릭 시 필터가 해제된다 <!-- omo:id=dhp-accept-theme-toggle;stage=4;scope=frontend;review=6 -->
- [x] 플래너 프로모 스트립이 mint-to-teal gradient 카드로 표시된다 <!-- omo:id=dhp-accept-promo-visible;stage=4;scope=frontend;review=6 -->
- [x] 정렬 버튼에 `빠른 조리순`이 표시되고, 기존 `시간순`이 제거되었다 <!-- omo:id=dhp-accept-sort-label;stage=4;scope=frontend;review=6 -->
- [x] `빠른 조리순` 정렬 시 조리 시간 오름차순(minutes ascending)으로 정렬된다 <!-- omo:id=dhp-accept-sort-logic;stage=4;scope=frontend;review=6 -->
- [x] 기존 hero 섹션, weekly planner mini-view, 레시피 grid 구조가 변경되지 않았다 <!-- omo:id=dhp-accept-home-structure-intact;stage=4;scope=frontend;review=6 -->

## Happy Path — DesktopPantry

- [x] DesktopPantry에 검색 입력이 표시되고, 재료 이름으로 필터링된다 <!-- omo:id=dhp-accept-pantry-search-visible;stage=4;scope=frontend;review=6 -->
- [x] 헤더에 `+` 추가 버튼이 표시된다 <!-- omo:id=dhp-accept-pantry-add-button;stage=4;scope=frontend;review=6 -->
- [x] `+` 버튼 클릭 시 `DesktopPantryAddDialog`가 열린다 <!-- omo:id=dhp-accept-pantry-add-dialog;stage=4;scope=frontend;review=6 -->
- [x] 앱 루트(`app.jsx`)에서 DesktopPantry에 `onOpenAdd` 콜백이 전달된다 <!-- omo:id=dhp-accept-app-root-wiring;stage=4;scope=frontend;review=6 -->
- [x] 기존 2-column grid 레이아웃, 카테고리 섹션, 아이템 토글이 변경되지 않았다 <!-- omo:id=dhp-accept-pantry-structure-intact;stage=4;scope=frontend;review=6 -->

## State / Policy

- [x] production 앱 코드(`app/`, `components/`, `lib/`)가 변경되지 않았다 <!-- omo:id=dhp-accept-no-product-change;stage=4;scope=frontend;review=6 -->
- [x] API endpoint, DB schema, status value가 추가되지 않았다 <!-- omo:id=dhp-accept-no-api-db-change;stage=4;scope=frontend;review=6 -->
- [x] 모바일 `HomeScreen`, `PantryScreen` 동작이 변경되지 않았다 <!-- omo:id=dhp-accept-mobile-unchanged;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [x] 검색/필터 결과 0건일 때 레이아웃이 깨지지 않고 간단한 empty 안내(emoji + 텍스트)가 표시된다 (현재 DesktopHome에 명시적 empty state가 없으므로 모바일 패턴 참고 추가) <!-- omo:id=dhp-accept-empty-state;stage=4;scope=frontend;review=6 -->
- [x] 팬트리 검색 결과 0건일 때 카테고리 섹션이 비어도 에러 없이 표시된다 <!-- omo:id=dhp-accept-pantry-empty-search;stage=4;scope=frontend;review=6 -->

## Data Integrity

- [x] 재료 필터 칩 목록과 emoji가 모바일 `HomeScreen`의 `INGREDIENT_FILTERS` 배열과 일치한다 <!-- omo:id=dhp-accept-filters-data-match;stage=4;scope=frontend;review=6 -->
- [x] THEMES 카러셀 카드 목록이 모바일의 `THEMES` 배열과 일치한다 (id, name, emoji, bg, accent) <!-- omo:id=dhp-accept-themes-data-match;stage=4;scope=frontend;review=6 -->
- [x] 정렬 키 매핑이 모바일 `HomeScreen`의 `sortLabel` 객체와 일치한다 (latest, rating, saves, fast) <!-- omo:id=dhp-accept-sort-keys-match;stage=4;scope=frontend;review=6 -->
- [x] 기존 `DesktopHome` props(onOpenRecipe, ingFilter, setIngFilter, sortBy, setSortBy, setShowSortSheet, onOpenIngredientFilter, ingredientNames)가 유지된다 <!-- omo:id=dhp-accept-home-props-intact;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [x] 프로토타입 seed 데이터(`RECIPES`, `INGREDIENT_FILTERS`, `THEMES`, 동기 seed pantry)가 홈/팬트리 검증에 충분하다 <!-- omo:id=dhp-accept-seed-sufficient;stage=4;scope=frontend;review=6 -->

## Prototype File Synchronization

- [x] `screens/desktop-screens.jsx`와 `app.jsx`가 `index.html`의 해당 마커 구간과 동기화되어 있다 <!-- omo:id=dhp-accept-split-sync;stage=4;scope=frontend;review=6 -->
- [x] `homecook-baemin-prototype.html`이 `index.html`과 byte-identical이다 <!-- omo:id=dhp-accept-html-identical;stage=4;scope=frontend;review=6 -->

## Automation Split

### Frontend (Stage 4)

- [x] `git diff --check` 통과 <!-- omo:id=dhp-accept-diff-check;stage=4;scope=frontend;review=6 -->
- [x] 브라우저에서 데스크톱 모드 전환 후 DesktopHome 검색/필터/테마/프로모/정렬 표시 확인 <!-- omo:id=dhp-accept-browser-verify-home;stage=4;scope=frontend;review=6 -->
- [x] 브라우저에서 데스크톱 모드 전환 후 DesktopPantry 검색/추가 버튼 표시 확인 <!-- omo:id=dhp-accept-browser-verify-pantry;stage=4;scope=frontend;review=6 -->
- [x] `diff -q index.html homecook-baemin-prototype.html` 통과 <!-- omo:id=dhp-accept-diff-html;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 사용자 최종 taste approval (데스크톱 홈에서 검색/필터/테마/프로모의 시각적 밀도와 배치 확인)
- [ ] 사용자 최종 taste approval (데스크톱 팬트리에서 검색/추가 버튼의 시각적 배치 확인)
