# Slice: desktop-mypage-parity

## Goal

데스크톱 웹 프로토타입의 마이페이지(`DesktopMyPage`)에 모바일 `MyPageScreen`이 제공하는 전체 메뉴 목록을 추가한다.
현재 데스크톱 마이페이지는 4개 텍스트 버튼(`알림 설정`, `계정 정보`, `도움말`, `로그아웃`)만 제공하지만, 모바일은 9개 메뉴(저장한 레시피, 레시피북, 장보기 기록, 남은요리, 다먹은 기록, 환경설정, 계정 정보, 알림 설정, 도움말 · FAQ)를 emoji 아이콘과 함께 노출한다.
이 슬라이스가 끝나면 데스크톱 사용자도 마이페이지에서 모바일과 동등한 메뉴 접근성을 갖게 된다.

## Branches

- 문서: `docs/desktop-mypage-parity`
- 프론트엔드: `feature/fe-desktop-mypage-parity`

## In Scope

- 화면: `DesktopMyPage` (prototype `screens/desktop-screens.jsx`, `index.html`, `homecook-baemin-prototype.html`)
- API: 없음 (프로토타입 전용 — production API 소비 없음)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (프로토타입 전용)
  - [ ] 있음

### 구현 범위

1. **사이드 메뉴 확장**: `DesktopMyPage`의 aside 영역에 모바일 `MyPageScreen`과 동등한 9개 메뉴 항목을 emoji 아이콘과 함께 추가
   - `🔖 저장한 레시피` → `mypage-saved`
   - `📚 레시피북` → `mypage-recipebook`
   - `🛒 장보기 기록` → `mypage-shopping`
   - `🍱 남은요리` → `leftovers`
   - `🍽️ 다먹은 기록` → `ate-list`
   - `⚙️ 환경설정` → `settings`
   - `👤 계정 정보` → `mypage-account`
   - `🔔 알림 설정` → `mypage-notif`
   - `💬 도움말 · FAQ` → `mypage-help`
2. **`onGoPage` 콜백 연결**: `DesktopMyPage` 컴포넌트에 `onGoPage` prop을 추가하고, 앱 루트에서 기존 `goPage` 함수를 전달
3. **메뉴 detail 텍스트 표시**: 모바일과 동일하게 각 메뉴 항목에 부가 정보(예: `5개`, `12회`, `관리` 등)와 chevron(›) 아이콘 표시
4. **기존 프로필/통계 섹션 보존**: 프로필 아바타, 유저명, 이메일, 3-column 통계(저장/요리/플래너) 유지
5. **기존 저장 레시피 그리드 보존**: 메인 영역의 3-column 저장 레시피 카드 그리드 변경 없음
6. **라우팅 연결**: 각 메뉴 항목 클릭 시 기존 desktop variant 또는 mobile fallback 라우트로 이동
   - Desktop variant 존재: `mypage-recipebook`, `mypage-shopping`, `leftovers`, `ate-list`, `settings`
   - Mobile fallback: `mypage-saved`, `mypage-account`, `mypage-notif`, `mypage-help`
7. **`index.html`과 split source 동기화**: `screens/desktop-screens.jsx` 수정 시 `index.html`과 `homecook-baemin-prototype.html`을 동기 상태로 유지

## Out of Scope

- 데스크톱 홈, 플래너, 팬트리 parity (별도 슬라이스)
- backend/API/schema 변경
- product Next.js 런타임 코드 변경 (프로토타입 전용 슬라이스)
- 모바일 `MyPageScreen` 동작 변경
- 새 npm 의존성 추가
- 데스크톱 마이페이지 정보 구조 변경 (2-column grid layout 유지)
- 메뉴 항목의 실제 데이터 연동 (프로토타입 seed 데이터 기반 하드코딩 허용)
- `desktop-home-pantry-parity` (별도 슬라이스로 분리)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `desktop-planner-parity` | merged | [x] |
| `17a-mypage-overview-history` | merged | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 프로토타입 전용이며 production API를 소비하지 않는다.
기존 프로토타입 데이터 레이어(`RECIPES`, `savedIds`, `shoppingLists`)를 그대로 사용한다.

## Frontend Delivery Mode

- Stage 4에서 `DesktopMyPage` 프로토타입 컴포넌트의 사이드 메뉴를 확장하고 `onGoPage` 라우팅을 연결한다
- 필수 상태 (프로토타입 맥락):
  - `loading`: N/A — 프로토타입은 동기 seed 데이터 사용
  - `empty`: 프로토타입 seed에 저장 레시피 0건일 때 기존 empty 카드가 이미 존재. 메뉴 목록은 항상 표시
  - `error`: N/A — 프로토타입은 fetch 없음
  - `read-only`: N/A — 프로토타입 전용
  - `unauthorized`: N/A — 프로토타입은 인증 없음
- 프로토타입이므로 5개 필수 상태의 엄격한 적용 대상이 아니다. 프로토타입 seed 데이터에서 자연스럽게 파생되는 상태만 다룬다.

## Design Authority

- UI risk: `low-risk` (기존 데스크톱 프로토타입 컴포넌트에 이미 모바일에 존재하는 메뉴를 추가)
- Anchor screen dependency: 없음 (프로토타입 전용 — production MYPAGE 코드 변경 없음)
- Visual artifact: 불필요 — 아래 생략 근거 참조
- Authority status: `not-required`
- Notes: 이 슬라이스는 production 앱 코드를 변경하지 않는 프로토타입 전용 변경이다. 모바일 프로토타입에 이미 존재하는 메뉴 구조를 데스크톱 레이아웃에 맞게 배치하는 것이므로, 디자인 참조는 모바일 `MyPageScreen` 자체가 된다.

### Design artifact 생략 근거

- `ui/designs/DESKTOP_MYPAGE.md` 생성을 생략한다
- 근거: (1) 프로토타입 전용 변경으로 production 코드에 영향 없음 (2) 추가하는 UI 요소는 이미 모바일 프로토타입에 구현되어 있어 참조가 명확함 (3) 데스크톱 레이아웃 조정은 기존 `DesktopMyPage` 패턴(2-column grid, aside + main)을 따름 (4) low-risk UI change에 해당하여 `docs/engineering/agent-workflow-overview.md`의 Design Review Intensity 기준으로 설계 산출물 생략 가능

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
- `ui/designs/prototypes/claude-design-260505-wave1/screens/mypage.jsx` (모바일 메뉴 참조)
- `ui/designs/prototypes/claude-design-260505-wave1/screens/desktop-screens.jsx` (데스크톱 마이페이지)
- `ui/designs/prototypes/claude-design-260505-wave1/index.html`

## QA / Test Data Plan

- fixture baseline: 프로토타입 seed 데이터 (`RECIPES`, `savedIds` — 저장 레시피 존재, `shoppingLists`)
- real DB smoke 경로: N/A — 프로토타입 전용
- seed / reset 명령: 브라우저에서 `index.html` 새로고침
- bootstrap 시스템 row: N/A — 프로토타입 전용
- blocker 조건: 없음

### 이 슬라이스의 검증

- `index.html`을 브라우저에서 열어 데스크톱 모드로 전환
- DesktopMyPage aside에 9개 메뉴 항목이 emoji 아이콘과 함께 표시되는지 확인
- 각 메뉴 항목 클릭 시 해당 route로 이동하는지 확인 (desktop variant 또는 mobile fallback)
- 기존 프로필/통계 섹션이 변경 없이 유지되는지 확인
- 기존 저장 레시피 그리드가 변경 없이 유지되는지 확인
- `index.html`과 `screens/desktop-screens.jsx`가 동기 상태인지 확인
- `homecook-baemin-prototype.html`이 `index.html`과 byte-identical인지 확인 (`diff -q`)
- `git diff --check` 통과

## Key Rules

1. **프로토타입 전용**: production 앱 코드(`app/`, `components/`, `lib/`)를 변경하지 않는다.
2. **Split source 동기화**: `screens/desktop-screens.jsx` 수정 시 `index.html`의 해당 `// ===== screens/desktop-screens.jsx =====` 마커 구간도 동기화한다. `homecook-baemin-prototype.html`도 `index.html`과 byte-identical로 유지한다.
3. **모바일 참조 유지**: 메뉴 항목 목록과 emoji, route key는 모바일 `MyPageScreen`의 menu list array와 동일하게 유지한다.
4. **데스크톱 밀도**: aside 메뉴를 데스크톱 사이드바 레이아웃에 맞게 배치한다. 모바일의 full-width list를 그대로 복사하지 않는다.
5. **기존 구조 보존**: 2-column grid (320px aside + 1fr main), 프로필 섹션, 통계 카드, 저장 레시피 그리드를 변경하지 않는다.
6. **라우팅 일관성**: 메뉴 항목의 route key는 모바일 `MyPageScreen`에서 사용하는 값과 동일하게 유지하여 기존 `desktopPageContent` 분기와 mobile fallback이 정상 작동하게 한다.

## Contract Evolution Candidates

없음. 프로토타입 전용 변경이며 공식 문서 계약에 영향이 없다.

## Primary User Path

1. 사용자가 프로토타입(`index.html`)을 브라우저에서 열고 상단 토글로 '데스크톱 웹' 모드를 선택한다
2. 마이페이지 탭으로 이동하면 좌측 aside에 프로필/통계와 함께 emoji 아이콘이 붙은 9개 메뉴 항목이 표시된다
3. '📚 레시피북'을 클릭하면 `DesktopMyPageRecipebookList`로 이동한다
4. '🍱 남은요리'를 클릭하면 `DesktopLeftoversScreen`으로 이동한다
5. '💬 도움말 · FAQ'를 클릭하면 mobile fallback `MyPageHelpScreen`이 데스크톱 컨테이너 안에 표시된다
6. 기존 메인 영역의 저장 레시피 그리드에서 카드를 클릭하면 레시피 상세로 이동한다

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 N/A), Stage 4에서 프로토타입 DesktopMyPage parity를 구현한다.

- [ ] DesktopMyPage aside에 모바일 9개 메뉴 항목 추가 (emoji + label + detail + chevron) <!-- omo:id=dmp-menu-items;stage=4;scope=frontend;review=6 -->
- [ ] DesktopMyPage에 `onGoPage` prop 추가 및 앱 루트에서 연결 <!-- omo:id=dmp-ongopage-wiring;stage=4;scope=frontend;review=6 -->
- [ ] 각 메뉴 항목 클릭 시 올바른 route key로 이동 확인 <!-- omo:id=dmp-menu-routing;stage=4;scope=frontend;review=6 -->
- [ ] 기존 프로필/통계 섹션 regression 없음 확인 <!-- omo:id=dmp-profile-intact;stage=4;scope=frontend;review=6 -->
- [ ] 기존 저장 레시피 그리드 regression 없음 확인 <!-- omo:id=dmp-saved-grid-intact;stage=4;scope=frontend;review=6 -->
- [ ] `index.html`과 `screens/desktop-screens.jsx` 동기화 <!-- omo:id=dmp-split-sync;stage=4;scope=frontend;review=6 -->
- [ ] `homecook-baemin-prototype.html`과 `index.html` byte-identical 확인 <!-- omo:id=dmp-html-identical;stage=4;scope=frontend;review=6 -->
- [ ] `git diff --check` 통과 <!-- omo:id=dmp-diff-check;stage=4;scope=frontend;review=6 -->
