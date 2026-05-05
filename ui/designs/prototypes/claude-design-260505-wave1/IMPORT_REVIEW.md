# Claude Design Wave 1 Import Review

Date: 2026-05-05
Updated: 2026-05-06
Source folder: `ui/designs/prototypes/claude-design-260505-wave1/`
Baseline folder: `ui/designs/prototypes/claude-design-260505/`

## Verdict

Wave 1 correction pass가 반영되어, 최초 import 당시의 주요 동기화 blocker는 대부분 해소됐다.

이번 correction pass의 source of truth는 `index.html`이었다. 최신 route/page/overlay 연결을 `index.html`에서 `app.jsx`와 `screens/*.jsx` split source로 옮겼고, planner의 `MENU_ADD` 진입과 quick flow panel 바로가기도 실제 브라우저 클릭으로 확인했다.

아직 production frontend 포팅 기준으로 완전히 닫힌 상태는 아니다. `INGREDIENT_FILTER_MODAL`, 신규 route page의 desktop 전용 layout, 상세 visual QA는 남은 gap이다.

## Confirmed

- `index.html`에는 Wave 1 screen/surface/modal 컴포넌트가 인라인으로 포함됐다.
- `app.jsx`는 `index.html`의 Wave 1 route/page/overlay 연결을 반영하도록 재작성됐다.
- `screens/planner.jsx`와 `screens/desktop-screens.jsx`에 `onMenuAdd` 진입 콜백이 반영됐다.
- `screens/pantry.jsx`, `screens/mypage.jsx`, `screens/extras.jsx`, `screens/wave1.jsx`가 `index.html` 기준 내용으로 동기화됐다.
- `HANDOFF.md`에 `부록 C — Wave 1 Correction Pass Status (2026-05-06)`가 추가됐다.
- `HANDOFF.md`에는 `INGREDIENT_FILTER_MODAL` deferred 사유, desktop fallback 화면 목록, source-of-truth convention이 기록됐다.
- `homecook-baemin-prototype.html`은 `index.html`과 byte-for-byte 동일하게 동기화됐다.

## Browser Verification

검증 대상: `ui/designs/prototypes/claude-design-260505-wave1/index.html`

도구: Playwright + local Google Chrome, `file://` 실행

통과한 클릭 흐름:

- mobile planner empty slot `+ 식사 추가` -> `MENU_ADD` / `식사 추가`
- mobile planner `장보기 목록 만들기` -> `SHOPPING_FLOW` / `장보기 목록`
- `SHOPPING_FLOW` 상태에서 `데스크톱 웹` 전환 -> desktop shell fallback으로 `장보기 목록` 표시
- desktop planner top CTA `+ 식단 추가` -> `MENU_ADD` / `식사 추가`
- quick flow `식사 추가 (MENU_ADD)` -> `식사 추가`
- quick flow `장보기 상세 (SHOPPING_DETAIL)` -> `장보기 진행 중`
- quick flow `남은 재료 (LEFTOVERS)` -> `남은요리`
- quick flow `설정 (SETTINGS)` -> `설정`
- quick flow `레시피북 탭 (MYPAGE)` -> `레시피북`
- quick flow `장보기 목록 탭 (MYPAGE)` -> `장보기 기록`

## Resolved Since Initial Import

1. Split-source mismatch mostly resolved
   - `app.jsx` now includes `route.page` routing and Wave 1 overlay mounts.
   - `screens/planner.jsx` now accepts `onMenuAdd`.
   - `screens/desktop-screens.jsx::DesktopPlanner` now accepts `onMenuAdd`.
   - `screens/pantry.jsx`, `screens/mypage.jsx`, `screens/extras.jsx`, `screens/wave1.jsx` were synced from `index.html`.

2. `MENU_ADD` entry wired
   - Mobile planner empty slot `+ 식사 추가` opens `goPage('menu-add', { date, slot })`.
   - Desktop planner top `+ 식단 추가` opens `goPage('menu-add')`.
   - Desktop planner empty cell `+` opens `goPage('menu-add', { date, slot })`.

3. Quick flow panel expanded
   - Added shortcuts for `MENU_ADD`, `SHOPPING_DETAIL`, `LEFTOVERS`, `SETTINGS`, `MYPAGE_TAB_RECIPEBOOK`, `MYPAGE_TAB_SHOPPINGLISTS`.

4. Desktop fallback documented
   - Existing dedicated desktop layouts remain limited to `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, `PANTRY`, `MYPAGE`.
   - New `route.page` screens are reachable in desktop shell, but use mobile-style fallback content.

## Remaining Gaps

1. `INGREDIENT_FILTER_MODAL` is still missing
   - Current HOME uses inline ingredient chips.
   - Official modal/sheet style ingredient filter remains a next-wave design task.

2. New route pages do not have dedicated desktop layouts
   - `LOGIN`, `MENU_ADD`, `SHOPPING_FLOW`, `SHOPPING_DETAIL`, `COOK_READY_LIST`, `COOK_MODE`, `LEFTOVERS`, `ATE_LIST`, `SETTINGS`, and Wave 1 pickers/tabs are desktop fallback only.
   - Before production porting, decide which fallback screens deserve full desktop treatment.

3. Visual QA is still shallow
   - The browser check confirmed route entry and visible text.
   - It did not perform detailed screenshot comparison, responsive visual QA, or overlap inspection.

## Porting Guidance

Ready to use as stronger reference:

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`
- `PANTRY`
- `MYPAGE`
- Existing modal family: `PlannerAddPopup`, `SavePopup`, `LOGIN_GATE_MODAL`, `HOME_SORT_SELECT_UI`

Usable as mobile-first / fallback reference, not final desktop design:

- `MENU_ADD`
- `SHOPPING_FLOW`
- `SHOPPING_DETAIL`
- `COOK_READY_LIST`
- `COOK_MODE`
- `LEFTOVERS`
- `ATE_LIST`
- `SETTINGS`
- `MYPAGE_TAB_RECIPEBOOK`
- `MYPAGE_TAB_SHOPPINGLISTS`
- Wave 1 picker/sheet/modal family

Do not treat as complete yet:

- `INGREDIENT_FILTER_MODAL`
- `RECIPEBOOK_DETAIL`

## Recommended Next Step

Open a small PR for this runnable HTML sync after local verification.

Next Claude Design request should be a very small follow-up:

- Either implement `INGREDIENT_FILTER_MODAL`, or keep it explicitly deferred with a final reason.
- Pick the first desktop fallback family to upgrade, likely `SHOPPING_FLOW` + `SHOPPING_DETAIL` or `MENU_ADD`.
