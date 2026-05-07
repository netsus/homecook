# Slice: desktop-home-pantry-parity

## Goal

데스크톱 웹 프로토타입의 홈 화면(`DesktopHome`)과 팬트리 화면(`DesktopPantry`)에 모바일 프로토타입이 이미 제공하는 기능을 추가한다.
현재 데스크톱 홈에는 레시피 검색, THEMES 카러셀, 플래너 프로모 스트립이 없고, 재료 필터 칩이 모바일 `INGREDIENT_FILTERS`와 불일치하며, 정렬 키 `time`/`시간순`이 모바일의 `fast`/`빠른 조리순`과 다르다.
데스크톱 팬트리에는 검색 입력과 추가 버튼이 없다(`DesktopPantryAddDialog`가 이미 존재하지만 연결되지 않음).
이 슬라이스가 끝나면 데스크톱 사용자가 홈과 팬트리에서 모바일과 동등한 기능 접근성을 갖게 된다.

## Branches

- 문서: `docs/desktop-home-pantry-parity`
- 프론트엔드: `feature/fe-desktop-home-pantry-parity`

## In Scope

- 화면: `DesktopHome`, `DesktopPantry` (prototype `screens/desktop-screens.jsx`, `app.jsx`, `index.html`, `homecook-baemin-prototype.html`)
- API: 없음 (프로토타입 전용 — production API 소비 없음)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (프로토타입 전용)
  - [ ] 있음

### 구현 범위

#### DesktopHome 개선 (5개 항목)

1. **레시피 검색 추가**: `DesktopHome`에 모바일 `HomeScreen`과 동일한 검색 입력을 추가. `query` 상태로 `r.name.includes(query)` 필터링
2. **INGREDIENT_FILTERS parity**: 데스크톱의 하드코딩된 재료 칩(김치, 돼지고기, 두부, 계란, 감자, 애호박, 참치, 김)을 모바일의 `INGREDIENT_FILTERS` 배열(6개: 밥·면, 육류, 해산물, 채소, 계란·두부, 김치 — emoji 포함)로 교체
3. **THEMES 카러셀 추가**: 모바일의 6개 테마 카드(자취생 간단식, 집밥 기본기, 다이어트 식단, 밥도둑, 주말 특식, 비오는 날)를 데스크톱 밀도에 맞게 가로 스크롤 카러셀로 추가. `activeTheme` 상태로 `r.theme` 필터링
4. **플래너 프로모 스트립 추가**: 모바일의 mint-to-teal gradient 프로모 카드("이번 주 식단 플래너 / 오늘 저녁까지 2끼 남았어요")를 데스크톱 레이아웃에 맞게 추가
5. **정렬 키 수정**: `time`/`시간순`을 모바일과 동일한 `fast`/`빠른 조리순`으로 변경. 정렬 로직을 `a.minutes - b.minutes` (오름차순)으로 수정

#### DesktopPantry 개선 (2개 항목)

6. **검색 입력 추가**: `DesktopPantry`에 모바일 `PantryScreen`과 동일한 검색 입력을 추가. `query` 상태로 `v.name.includes(query)` 필터링
7. **추가 버튼 연결**: `DesktopPantry`에 `onOpenAdd` prop을 추가하고 헤더에 `+` 버튼을 배치하여 기존 `DesktopPantryAddDialog`를 트리거. 앱 루트에서 `onOpenAdd` 콜백을 전달

#### 공통

8. **`index.html`과 split source 동기화**: `screens/desktop-screens.jsx` 수정 시 `index.html`의 해당 `// ===== screens/desktop-screens.jsx =====` 마커 구간도 동기화. `homecook-baemin-prototype.html`도 `index.html`과 byte-identical로 유지

## Out of Scope

- 데스크톱 마이페이지, 플래너 parity (별도 슬라이스, 이미 merged)
- backend/API/schema 변경
- product Next.js 런타임 코드 변경 (프로토타입 전용 슬라이스)
- 모바일 `HomeScreen`, `PantryScreen` 동작 변경
- `homecook-baemin-prototype.html` 외부의 production 컴포넌트
- 새 npm 의존성 추가
- 데스크톱 홈/팬트리 정보 구조 변경 (기존 grid 레이아웃 유지)
- `DesktopPantryAddDialog` 기능 변경 (이미 구현됨, 연결만 추가)
- 재료 필터 regex 로직 변경 (모바일 로직 그대로 사용)
- 검색의 case-insensitive 또는 fuzzy matching 도입

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `desktop-planner-parity` | merged | [x] |
| `desktop-mypage-parity` | merged | [x] |
| `baemin-prototype-home-parity` | merged | [x] |
| `13-pantry-core` | merged | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 프로토타입 전용이며 production API를 소비하지 않는다.
기존 프로토타입 데이터 레이어(`RECIPES`, `INGREDIENT_FILTERS`, `THEMES`, `savedIds`, `shoppingLists`, 동기 seed pantry)를 그대로 사용한다.

## Frontend Delivery Mode

- Stage 4에서 `DesktopHome`과 `DesktopPantry` 프로토타입 컴포넌트를 확장한다
- 필수 상태 (프로토타입 맥락):
  - `loading`: N/A — 프로토타입은 동기 seed 데이터 사용
  - `empty`: 검색/필터 결과 0건일 때 레이아웃이 깨지지 않고 간단한 empty 안내(emoji + 텍스트)를 표시해야 한다 (현재 DesktopHome에는 명시적 empty state가 없으므로 모바일 패턴을 참고해 추가). 팬트리 검색 결과 0건일 때 카테고리 섹션이 비어도 에러 없이 표시
  - `error`: N/A — 프로토타입은 fetch 없음
  - `read-only`: N/A — 프로토타입 전용
  - `unauthorized`: N/A — 프로토타입은 인증 없음
- 프로토타입이므로 5개 필수 상태의 엄격한 적용 대상이 아니다. 프로토타입 seed 데이터에서 자연스럽게 파생되는 상태만 다룬다.

## Design Authority

- UI risk: `low-risk` (기존 데스크톱 프로토타입 컴포넌트에 이미 모바일에 존재하는 기능을 추가)
- Anchor screen dependency: 없음 (프로토타입 전용 — production HOME/PANTRY 코드 변경 없음)
- Visual artifact: 불필요 — 아래 생략 근거 참조
- Authority status: `not-required`
- Notes: 이 슬라이스는 production 앱 코드를 변경하지 않는 프로토타입 전용 변경이다. 모바일 프로토타입에 이미 존재하는 기능을 데스크톱 레이아웃에 맞게 배치하는 것이므로, 디자인 참조는 모바일 `HomeScreen`/`PantryScreen` 자체가 된다.

### Design artifact 생략 근거

- `ui/designs/DESKTOP_HOME.md`, `ui/designs/DESKTOP_PANTRY.md` 생성을 생략한다
- 근거: (1) 프로토타입 전용 변경으로 production 코드에 영향 없음 (2) 추가하는 UI 요소는 이미 모바일 프로토타입에 구현되어 있어 참조가 명확함 (3) 데스크톱 레이아웃 조정은 기존 `DesktopHome`/`DesktopPantry` 패턴을 따름 (4) low-risk UI change에 해당하여 `docs/engineering/agent-workflow-overview.md`의 Design Review Intensity 기준으로 설계 산출물 생략 가능

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

> 프로토타입 전용 low-risk 변경이므로 Stage 4 완료 후 low-risk design check로 Stage 6에서 confirmed 승격 가능.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/desktop-planner-parity/README.md`
- `docs/workpacks/desktop-mypage-parity/README.md`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/home.jsx` (모바일 홈 참조)
- `ui/designs/prototypes/claude-design-260505-wave1/screens/pantry.jsx` (모바일 팬트리 참조)
- `ui/designs/prototypes/claude-design-260505-wave1/screens/desktop-screens.jsx` (데스크톱 홈/팬트리)
- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx` (앱 루트 — DesktopPantry onOpenAdd 연결)
- `ui/designs/prototypes/claude-design-260505-wave1/data.jsx` (INGREDIENT_FILTERS, THEMES)
- `ui/designs/prototypes/claude-design-260505-wave1/index.html`

## QA / Test Data Plan

- fixture baseline: 프로토타입 seed 데이터 (`RECIPES`, `INGREDIENT_FILTERS`, `THEMES`, `savedIds`, 동기 seed pantry)
- real DB smoke 경로: N/A — 프로토타입 전용
- seed / reset 명령: 브라우저에서 `index.html` 새로고침
- bootstrap 시스템 row: N/A — 프로토타입 전용
- blocker 조건: 없음

### 이 슬라이스의 검증

- `index.html`을 브라우저에서 열어 데스크톱 모드로 전환
- **DesktopHome 검증**:
  - 검색 입력이 표시되고 레시피 이름 필터링이 동작하는지 확인
  - 재료 필터 칩이 모바일 `INGREDIENT_FILTERS` 6개와 일치하는지 확인 (emoji 포함)
  - THEMES 카러셀이 6개 테마 카드와 함께 표시되고, 클릭 시 레시피 필터링이 동작하는지 확인
  - 플래너 프로모 스트립이 mint-to-teal gradient로 표시되는지 확인
  - 정렬 옵션에서 `빠른 조리순`이 표시되고, `시간순`이 제거되었는지 확인
- **DesktopPantry 검증**:
  - 검색 입력이 표시되고 재료 이름 필터링이 동작하는지 확인
  - `+` 추가 버튼이 표시되고 클릭 시 `DesktopPantryAddDialog`가 열리는지 확인
- **공통 검증**:
  - `index.html`과 `screens/desktop-screens.jsx`가 동기 상태인지 확인
  - `homecook-baemin-prototype.html`이 `index.html`과 byte-identical인지 확인 (`diff -q`)
  - `git diff --check` 통과
  - production 앱 코드가 변경되지 않았는지 확인

## Key Rules

1. **프로토타입 전용**: production 앱 코드(`app/`, `components/`, `lib/`)를 변경하지 않는다.
2. **Split source 동기화**: `screens/desktop-screens.jsx`와 `app.jsx` 수정 시 `index.html`의 해당 마커 구간(`// ===== screens/desktop-screens.jsx =====`, `// ===== app.jsx =====`)도 동기화한다. `homecook-baemin-prototype.html`도 `index.html`과 byte-identical로 유지한다.
3. **모바일 참조 유지**: `INGREDIENT_FILTERS` 배열, `THEMES` 배열, 정렬 키/레이블은 모바일 `HomeScreen`/`data.jsx`와 동일하게 유지한다.
4. **데스크톱 밀도**: 검색, 필터, 카러셀, 프로모 스트립을 데스크톱 레이아웃에 맞게 배치한다. 모바일의 full-width 스택을 그대로 복사하지 않는다.
5. **기존 구조 보존**: `DesktopHome`의 hero 섹션, weekly planner mini-view, 레시피 grid, `DesktopPantry`의 2-column grid 레이아웃, 아이템 토글을 변경하지 않는다.
6. **기존 다이얼로그 재사용**: `DesktopPantryAddDialog`는 이미 구현되어 있으므로 새로 만들지 않고 `onOpenAdd` prop으로 연결만 한다.

## Contract Evolution Candidates

없음. 프로토타입 전용 변경이며 공식 문서 계약에 영향이 없다.

## Primary User Path

1. 사용자가 프로토타입(`index.html`)을 브라우저에서 열고 상단 토글로 '데스크톱 웹' 모드를 선택한다
2. **홈 탭**:
   - 검색 입력에 "김치"를 입력하면 김치 관련 레시피만 필터링된다
   - 재료 필터에서 '🥩 육류' 칩을 클릭하면 육류 재료가 포함된 레시피만 표시된다
   - THEMES 카러셀에서 '🍳 자취생 간단식' 카드를 클릭하면 해당 테마 레시피만 표시된다
   - 플래너 프로모 스트립이 mint gradient 카드로 표시된다
   - 정렬 버튼에 '빠른 조리순'이 표시되고, 클릭 시 조리 시간 오름차순으로 정렬된다
3. **팬트리 탭**:
   - 검색 입력에 "양파"를 입력하면 양파 관련 재료만 표시된다
   - 헤더의 `+` 버튼을 클릭하면 `DesktopPantryAddDialog`가 열린다
   - 다이얼로그에서 재료명과 섹션을 선택하고 추가할 수 있다

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 N/A), Stage 4에서 프로토타입 DesktopHome/DesktopPantry parity를 구현한다.

- [ ] DesktopHome에 검색 입력 추가 (query 상태, name includes 필터링) <!-- omo:id=dhp-search-input;stage=4;scope=frontend;review=6 -->
- [ ] DesktopHome 재료 필터를 모바일 INGREDIENT_FILTERS 6개로 교체 (emoji 포함) <!-- omo:id=dhp-ingredient-filters;stage=4;scope=frontend;review=6 -->
- [ ] DesktopHome에 THEMES 카러셀 추가 (6개 테마 카드, activeTheme 필터링) <!-- omo:id=dhp-themes-carousel;stage=4;scope=frontend;review=6 -->
- [ ] DesktopHome에 플래너 프로모 스트립 추가 (mint-to-teal gradient) <!-- omo:id=dhp-planner-promo;stage=4;scope=frontend;review=6 -->
- [ ] DesktopHome 정렬 키를 time/시간순에서 fast/빠른 조리순으로 수정 <!-- omo:id=dhp-sort-key-fix;stage=4;scope=frontend;review=6 -->
- [ ] DesktopPantry에 검색 입력 추가 (query 상태, name includes 필터링) <!-- omo:id=dhp-pantry-search;stage=4;scope=frontend;review=6 -->
- [ ] DesktopPantry에 onOpenAdd prop 추가 및 + 버튼으로 DesktopPantryAddDialog 연결 <!-- omo:id=dhp-pantry-add-button;stage=4;scope=frontend;review=6 -->
- [ ] 앱 루트(`app.jsx`)에서 DesktopPantry에 `onOpenAdd` 콜백 전달 확인 <!-- omo:id=dhp-app-root-wiring;stage=4;scope=frontend;review=6 -->
- [ ] `index.html`과 `screens/desktop-screens.jsx`, `app.jsx` 동기화 <!-- omo:id=dhp-split-sync;stage=4;scope=frontend;review=6 -->
- [ ] `homecook-baemin-prototype.html`과 `index.html` byte-identical 확인 <!-- omo:id=dhp-html-identical;stage=4;scope=frontend;review=6 -->
- [ ] `git diff --check` 통과 <!-- omo:id=dhp-diff-check;stage=4;scope=frontend;review=6 -->
