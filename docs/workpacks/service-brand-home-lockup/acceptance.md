# Acceptance Checklist: service-brand-home-lockup

> 구현 evidence가 생긴 뒤에만 체크한다. `Manual Only`를 제외한 모든 항목은 Stage 4 구현과 역할 분리된 Stage 5/6/final authority에서 다시 확인한다.

## Happy Path

- [x] mobile HOME `HomeAppBar`에서 큰 `무먹` 아래 작은 `무엇을 먹든`이 보인다 <!-- omo:id=home-lockup-accept-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] desktop HOME `WebTopNav` brand area에서 같은 세로 2단 lockup이 보인다 <!-- omo:id=home-lockup-accept-desktop;stage=4;scope=frontend;review=5,6 -->
- [x] 두 이름은 오른쪽 inline이 아니라 위아래로 배치되고 `무먹`이 더 큰 primary다 <!-- omo:id=home-lockup-accept-vertical-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [x] HOME의 검색·필터·둘러보기·카드·nav 흐름은 기존과 동일하다 <!-- omo:id=home-lockup-accept-home-flow;stage=4;scope=frontend;review=5,6 -->

## Scope / Compatibility

- [x] HOME 외 AppBar/WebTopNav/좁은 내비게이션은 `무먹` 단독 표시를 유지한다 <!-- omo:id=home-lockup-accept-non-home;stage=4;scope=frontend;review=5,6 -->
- [x] 법적/SEO/ABOUT의 정식명·짧은명 계약과 기존 고정 copy는 변하지 않는다 <!-- omo:id=home-lockup-accept-brand-contract-preserved;stage=4;scope=shared;review=6 -->
- [x] 신규 endpoint/field/status/error, DB schema/migration/seed/write가 없다 <!-- omo:id=home-lockup-accept-no-api-db;stage=4;scope=shared;review=6 -->
- [x] 새 dependency/font/token/logo/mascot/brand asset이 없다 <!-- omo:id=home-lockup-accept-no-assets-deps;stage=4;scope=shared;review=6 -->
- [x] 기술 식별자, 사용자 콘텐츠, 일반명사 `집밥`, 과거 공식 버전/evidence를 수정하지 않는다 <!-- omo:id=home-lockup-accept-history-identifiers;stage=4;scope=shared;review=6 -->

## Responsive / Accessibility

- [x] 390px와 320px에서 `무엇을 먹든`은 한 줄이며 잘림·겹침·page-level overflow가 없다 <!-- omo:id=home-lockup-accept-mobile-fit;stage=4;scope=frontend;review=5,6 -->
- [x] supporting name은 primary보다 작은 글자 크기이고 작은 본문 기준 WCAG AA 대비를 만족한다 <!-- omo:id=home-lockup-accept-contrast-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [x] 읽기 순서는 `무먹` 다음 `무엇을 먹든`이며 accessible name이 중복 낭독되지 않는다 <!-- omo:id=home-lockup-accept-reading-order;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 HOME link/heading semantics, keyboard focus와 클릭 영역이 유지된다 <!-- omo:id=home-lockup-accept-semantics-focus;stage=4;scope=frontend;review=5,6 -->
- [x] 320px first viewport에서 검색 입력과 `재료로 검색` 버튼이 계속 보인다 <!-- omo:id=home-lockup-accept-first-viewport;stage=4;scope=frontend;review=5,6 -->
- [x] desktop 1280px에서 web nav 높이, tab 위치, active state, right slot과 interaction이 before와 일치한다 <!-- omo:id=home-lockup-accept-desktop-geometry;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] loading 상태에서도 2단 lockup이 한 번만 표시된다 <!-- omo:id=home-lockup-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태와 recovery CTA가 lockup 변경 뒤에도 유지된다 <!-- omo:id=home-lockup-accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태와 다시 시도 동작이 lockup 변경 뒤에도 유지된다 <!-- omo:id=home-lockup-accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] filter-active 상태에서 기존 rail hidden/result-priority 정책이 유지된다 <!-- omo:id=home-lockup-accept-filter-active;stage=4;scope=frontend;review=5,6 -->
- [x] read-only/unauthorized 의미, auth gate와 return-to-action에 변화가 없다 <!-- omo:id=home-lockup-accept-policy-regression;stage=4;scope=shared;review=6 -->

## Historical / Evidence Preservation

- [x] 기존 공식 v1.7.12/v1.5.19와 merged screenshot/prototype/evidence는 수정하지 않는다 <!-- omo:id=home-lockup-accept-history-preserved;stage=4;scope=shared;review=6 -->
- [x] 구현 전 390px/320px/1280px before screenshot을 새 workpack 경로에 생성하고 이후 수정하지 않는다 <!-- omo:id=home-lockup-accept-before-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] 같은 환경의 390px/320px/1280px after screenshot과 audit/verdict를 생성한다 <!-- omo:id=home-lockup-accept-after-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] authority report에 `> evidence:` block과 blocker/major/minor가 있고 unresolved blocker가 0이다 <!-- omo:id=home-lockup-accept-authority-report;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] HOME guest/auth와 loading/empty/error/filter-active QA fixture가 재사용 가능하다 <!-- omo:id=home-lockup-accept-fixtures;stage=4;scope=frontend;review=5,6 -->
- [x] API/DB/seed/bootstrap 변화가 필요하지 않음을 diff와 read-only smoke로 확인한다 <!-- omo:id=home-lockup-accept-no-data-setup;stage=4;scope=shared;review=6 -->

## Automation Split

### Vitest / Component

- [x] RED에서 HOME mobile/desktop 2단 lockup 부재를 확인한 뒤 GREEN으로 전환한다 <!-- omo:id=home-lockup-accept-tdd-red-green;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 두 surface와 non-HOME 단독 표시를 component regression으로 고정한다 <!-- omo:id=home-lockup-accept-component-tests;stage=4;scope=frontend;review=5,6 -->
- [x] accessible order/name, hierarchy, 기존 semantics 회귀를 자동 검증한다 <!-- omo:id=home-lockup-accept-a11y-tests;stage=4;scope=frontend;review=5,6 -->

### Playwright / Visual

- [x] 390px/320px HOME에서 vertical placement, one-line fit, overflow 0, first viewport를 검증한다 <!-- omo:id=home-lockup-accept-playwright-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] desktop 1280px HOME과 non-HOME route에서 lockup 적용 경계와 nav geometry를 검증한다 <!-- omo:id=home-lockup-accept-playwright-desktop;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 HOME 상태 fixture와 core accessibility/visual regression이 통과한다 <!-- omo:id=home-lockup-accept-regression-gates;stage=4;scope=frontend;review=5,6 -->

Stage 4/5 note: core accessibility와 web/app visual core가 모두 통과했다. `mobile-ios-small` HOME sort full-page screenshot의 sticky/fixed 좌표 변동은 테스트 촬영 중에만 문서 좌표로 고정해 해결했고, 허용치 완화 없이 같은 검사를 3회 연속 통과시켰다.

## Manual QA

- verifier: Stage 4 구현과 다른 Codex browser/evidence 세션 + 독립 final authority 세션
- environment: light mode, desktop 1280px, mobile 390px, narrow 320px, device scale factor 1
- scenarios: HOME guest/auth, loading/empty/error/filter-active, desktop HOME/non-HOME navigation 비교, keyboard/focus와 screen-reader name 확인

### Manual Only

- 사용자 최종 브랜드 인상과 보조 이름 크기/간격의 취향 확인
- 배포 preview에서 실제 시스템 font rendering과 browser zoom 200% 확인
