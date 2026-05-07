# Acceptance Checklist: desktop-mypage-parity

> 이 acceptance file은 데스크톱 프로토타입 마이페이지의 모바일 메뉴 parity 슬라이스를 검증한다.
> 프로토타입 전용 변경이며 production 코드에 영향이 없다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] DesktopMyPage aside에 9개 메뉴 항목이 emoji 아이콘과 함께 표시된다 <!-- omo:id=dmp-accept-menu-visible;stage=4;scope=frontend;review=6 -->
- [x] 각 메뉴 항목에 label, detail 텍스트(해당 시), chevron(›)이 표시된다 <!-- omo:id=dmp-accept-menu-format;stage=4;scope=frontend;review=6 -->
- [x] '📚 레시피북' 클릭 시 `DesktopMyPageRecipebookList`로 이동한다 <!-- omo:id=dmp-accept-route-recipebook;stage=4;scope=frontend;review=6 -->
- [x] '🛒 장보기 기록' 클릭 시 `DesktopMyPageShoppingList`로 이동한다 <!-- omo:id=dmp-accept-route-shopping;stage=4;scope=frontend;review=6 -->
- [x] '🍱 남은요리' 클릭 시 `DesktopLeftoversScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-leftovers;stage=4;scope=frontend;review=6 -->
- [x] '🍽️ 다먹은 기록' 클릭 시 `DesktopAteListScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-atelist;stage=4;scope=frontend;review=6 -->
- [x] '⚙️ 환경설정' 클릭 시 `DesktopSettingsScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-settings;stage=4;scope=frontend;review=6 -->
- [x] '🔖 저장한 레시피' 클릭 시 mobile fallback `MyPageSavedScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-saved;stage=4;scope=frontend;review=6 -->
- [x] '👤 계정 정보' 클릭 시 mobile fallback `MyPageAccountScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-account;stage=4;scope=frontend;review=6 -->
- [x] '🔔 알림 설정' 클릭 시 mobile fallback `MyPageNotifScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-notif;stage=4;scope=frontend;review=6 -->
- [x] '💬 도움말 · FAQ' 클릭 시 mobile fallback `MyPageHelpScreen`으로 이동한다 <!-- omo:id=dmp-accept-route-help;stage=4;scope=frontend;review=6 -->

## State / Policy

- [x] production 앱 코드(`app/`, `components/`, `lib/`)가 변경되지 않았다 <!-- omo:id=dmp-accept-no-product-change;stage=4;scope=frontend;review=6 -->
- [x] API endpoint, DB schema, status value가 추가되지 않았다 <!-- omo:id=dmp-accept-no-api-db-change;stage=4;scope=frontend;review=6 -->
- [x] 모바일 `MyPageScreen` 동작이 변경되지 않았다 <!-- omo:id=dmp-accept-mobile-unchanged;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [x] 저장 레시피 0건일 때 기존 empty 카드가 정상 표시된다 (메뉴 목록은 항상 표시) <!-- omo:id=dmp-accept-empty-state;stage=4;scope=frontend;review=6 -->

## Data Integrity

- [x] 메뉴 항목 목록과 emoji, route key가 모바일 `MyPageScreen`의 menu list array와 일치한다 <!-- omo:id=dmp-accept-menu-match-mobile;stage=4;scope=frontend;review=6 -->
- [x] 기존 프로필/통계 섹션(아바타, 유저명, 이메일, 3-column 통계)이 변경되지 않았다 <!-- omo:id=dmp-accept-profile-intact;stage=4;scope=frontend;review=6 -->
- [x] 기존 저장 레시피 그리드(3-column 카드)가 변경되지 않았다 <!-- omo:id=dmp-accept-saved-grid-intact;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [x] 프로토타입 seed 데이터(`RECIPES`, `savedIds`)가 메뉴 및 저장 레시피 검증에 충분하다 <!-- omo:id=dmp-accept-seed-sufficient;stage=4;scope=frontend;review=6 -->

## Prototype File Synchronization

- [x] `screens/desktop-screens.jsx`와 `index.html`의 해당 마커 구간이 동기화되어 있다 <!-- omo:id=dmp-accept-split-sync;stage=4;scope=frontend;review=6 -->
- [x] `homecook-baemin-prototype.html`이 `index.html`과 byte-identical이다 <!-- omo:id=dmp-accept-html-identical;stage=4;scope=frontend;review=6 -->

## Automation Split

### Frontend (Stage 4)

- [x] `git diff --check` 통과 <!-- omo:id=dmp-accept-diff-check;stage=4;scope=frontend;review=6 -->
- [x] 브라우저에서 데스크톱 모드 전환 후 DesktopMyPage 메뉴 항목 9개 표시 확인 <!-- omo:id=dmp-accept-browser-verify;stage=4;scope=frontend;review=6 -->
- [x] `diff -q index.html homecook-baemin-prototype.html` 통과 <!-- omo:id=dmp-accept-diff-html;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 사용자 최종 taste approval (데스크톱 마이페이지에서 메뉴 항목의 시각적 밀도와 배치 확인)
