# Acceptance Checklist: service-about-guide

> 구현 evidence가 생긴 뒤에만 체크한다. `Manual Only`를 제외한 각 항목은 OMO metadata를 유지하며, Stage 4 작성 세션과 Stage 5·6 review/final authority 세션을 분리한다.

## Happy Path

- [ ] 비로그인 사용자가 `/about`을 직접 열고 API loading 없이 서비스 가이드를 확인한다 <!-- omo:id=accept-about-public-direct;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop 공통 메뉴 `집밥 가이드`가 `/about`으로 이동하고 active 상태를 표시한다 <!-- omo:id=accept-web-nav-about;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile HOME `집밥 둘러보기` 첫 Link가 `/about#how-to`로 이동한다 <!-- omo:id=accept-home-guide-entry;stage=4;scope=frontend;review=5,6 -->
- [ ] `/about`의 레시피 CTA는 `/`, 플래너 CTA는 `/planner`의 기존 인증 흐름으로 이동한다 <!-- omo:id=accept-about-cta-routes;stage=4;scope=frontend;review=5,6 -->
- [ ] `/mypage?tab=help`가 인증 여부와 무관하게 `/about#faq`로 이동한다 <!-- omo:id=accept-legacy-help-redirect;stage=4;scope=frontend;review=5,6 -->

## Content / Screen Contract

- [ ] H1은 `집밥, 이렇게 써요` 한 개이고 Hero 문구는 `레시피에서 끝나지 않는 집밥 계획`이다 <!-- omo:id=accept-about-heading-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] `#how-to`, `#features`, `#guides`, `#faq` anchor가 모두 존재한다 <!-- omo:id=accept-about-anchor-ids;stage=4;scope=frontend;review=5,6 -->
- [ ] 찾기·계획하기·장보기·요리하기·남은요리 활용 5단계가 순서대로 표시된다 <!-- omo:id=accept-about-five-steps;stage=4;scope=frontend;review=5,6 -->
- [ ] 공식 계약의 핵심 기능, 6개 기능별 가이드, 8개 FAQ가 실제 기능/route와 일치한다 <!-- omo:id=accept-about-content-claims;stage=4;scope=frontend;review=5,6 -->
- [ ] 운영 이메일은 `getLegalInfo()`만 사용하고 미설정 시 가짜 문의 링크를 만들지 않는다 <!-- omo:id=accept-about-contact-truth;stage=4;scope=frontend;review=5,6 -->
- [ ] 커뮤니티/제안 게시판, 404 제보 공개, 조건부 기능, 검증되지 않은 수치가 노출되지 않는다 <!-- omo:id=accept-about-out-of-scope-copy;stage=4;scope=frontend;review=5,6 -->

## Navigation / Platform Policy

- [ ] desktop global nav는 정확히 `홈 / 플래너 / 팬트리 / 마이페이지 / 집밥 가이드`다 <!-- omo:id=accept-desktop-five-nav;stage=4;scope=shared;review=5,6 -->
- [ ] 일반 제품 화면의 local primary `WEB_NAV_ITEMS` 복제 선언은 0개다 <!-- omo:id=accept-web-nav-no-drift;stage=4;scope=shared;review=6 -->
- [ ] 개인정보/약관 화면은 global nav와 문서 보조 nav를 모두 유지한다 <!-- omo:id=accept-legal-nav-split;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile bottom tab은 기존 `홈 / 플래너 / 팬트리 / 마이` 4개이며 `/about`을 포함하지 않는다 <!-- omo:id=accept-mobile-four-tabs;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile `/about`에는 bottom tab을 렌더링하지 않고 back fallback `/`를 제공한다 <!-- omo:id=accept-about-mobile-back;stage=4;scope=frontend;review=5,6 -->

## HOME Anchor Extension

- [ ] initial 순서는 `빠른 이동 → 집밥 둘러보기 → 모든 레시피`다 <!-- omo:id=accept-home-section-order;stage=4;scope=frontend;review=5,6 -->
- [ ] rail 첫 항목은 `Link[href="/about#how-to"]`, 뒤 항목은 기존 `button[aria-pressed]` theme order다 <!-- omo:id=accept-home-mixed-roles;stage=4;scope=frontend;review=5,6 -->
- [ ] theme loading은 guide placeholder + theme placeholders를 표시한다 <!-- omo:id=accept-home-theme-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] theme empty/error는 guide-only rail을 유지한다 <!-- omo:id=accept-home-guide-only-fallback;stage=4;scope=frontend;review=5,6 -->
- [ ] 검색어·재료·태그 filter active에서는 quick links와 rail을 숨기고 결과를 우선한다 <!-- omo:id=accept-home-filter-priority;stage=4;scope=frontend;review=5,6 -->
- [ ] rail outer height는 220px 이하, 카드 높이는 136~144px이며 guide/theme geometry가 같다 <!-- omo:id=accept-home-rail-density;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px에서 next-card peek가 보이고 localized rail 밖 page-level horizontal overflow는 0이다 <!-- omo:id=accept-home-rail-mobile-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] rail 밖 HOME exact-prototype app bar/hero/search/tags/quick links/recipe cards/bottom tabs/token geometry가 변하지 않는다 <!-- omo:id=accept-home-narrow-supersession;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop HOME에는 guide card rail이 없고 공통 top nav만 추가된다 <!-- omo:id=accept-home-desktop-boundary;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] loading: `/about`은 page-level loading이 없고 HOME theme loading만 규정된 skeleton을 표시한다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty: 고정 가이드 content는 비지 않고 theme/contact empty는 각각 guide-only/fallback으로 처리한다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error: `/about`은 API error에 의존하지 않고 HOME theme error에서도 guide Link가 유지된다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only: 가이드는 accordion 외 데이터 변경 action이 없는 조회 화면이다 <!-- omo:id=accept-read-only;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized: `/about`과 HOME guide 진입은 로그인 게이트 없이 공개된다 <!-- omo:id=accept-unauthorized-public;stage=4;scope=frontend;review=5,6 -->
- [ ] 반복 방문·anchor 이동·legacy redirect가 서버 데이터나 도메인 상태를 바꾸지 않는다 <!-- omo:id=accept-idempotent-navigation;stage=4;scope=shared;review=6 -->

## Error / Permission

- [ ] FAQ와 기능 가이드 accordion이 keyboard Enter/Space로 열리고 `aria-expanded`/`aria-controls`가 갱신된다 <!-- omo:id=accept-accordion-keyboard;stage=4;scope=frontend;review=5,6 -->
- [ ] accordion focus-visible과 open/close 후 focus 순서가 보존된다 <!-- omo:id=accept-accordion-focus;stage=4;scope=frontend;review=5,6 -->
- [ ] 플래너 CTA의 비로그인 처리는 기존 login gate와 return-to-action을 그대로 사용한다 <!-- omo:id=accept-planner-existing-auth;stage=4;scope=frontend;review=5,6 -->
- [ ] legacy help redirect는 MYPAGE auth/data loading보다 먼저 실행되고 다른 MYPAGE query를 변경하지 않는다 <!-- omo:id=accept-help-redirect-boundary;stage=4;scope=frontend;review=5,6 -->

## Data Integrity / Contract Guard

- [ ] 신규 API endpoint/field/error와 DB table/column/RLS/schema가 없다 <!-- omo:id=accept-no-api-db-change;stage=4;scope=shared;review=6 -->
- [ ] 기존 HOME API envelope·theme order·filter semantics를 변경하지 않는다 <!-- omo:id=accept-existing-api-semantics;stage=4;scope=shared;review=6 -->
- [ ] 앱 하단 탭 타입과 web nav 타입을 분리해 web-only `about`이 mobile tab에 배정되지 않는다 <!-- omo:id=accept-nav-type-boundary;stage=4;scope=shared;review=6 -->
- [ ] 새 dependency, global token replacement, fixed prototype refreeze가 없다 <!-- omo:id=accept-no-dependency-token-refreeze;stage=4;scope=shared;review=6 -->

## Data Setup / Preconditions

- [ ] HOME fixture에 recipes, 2개 이상 themes, theme loading/empty/error, search/ingredient/tag filter states가 준비된다 <!-- omo:id=accept-fixture-home-states;stage=4;scope=frontend;review=5,6 -->
- [ ] legal info의 email 있음/없음 fixture가 준비된다 <!-- omo:id=accept-fixture-contact-states;stage=4;scope=frontend;review=5,6 -->
- [ ] DB seed/bootstrap/system row가 불필요하며 신규 seed가 추가되지 않는다 <!-- omo:id=accept-no-db-bootstrap;stage=4;scope=shared;review=6 -->

## SEO / Public Surface

- [ ] `/about` metadata title, description, canonical, OpenGraph URL이 공식 계약과 일치한다 <!-- omo:id=accept-about-metadata;stage=4;scope=frontend;review=5,6 -->
- [ ] sitemap에 `/about`이 정확히 한 번 있고 robots가 차단하지 않는다 <!-- omo:id=accept-about-sitemap-robots;stage=4;scope=frontend;review=5,6 -->
- [ ] 공개 static path 집합과 social metadata 테스트가 `/about`을 포함한다 <!-- omo:id=accept-about-public-static;stage=4;scope=frontend;review=6 -->

## Design Authority / Visual Evidence

- [ ] Stage 1에서 재캡처·잠근 before evidence 4개를 reference로 연결하고, Stage 4에서는 원본을 수정하지 않은 채 after evidence를 별도 생성한다 <!-- omo:id=accept-before-evidence-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] ABOUT 1280px·390px·320px initial/scroll/FAQ-focus evidence를 남긴다 <!-- omo:id=accept-about-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME before/after 390px·320px와 loading/guide-only/filter-hidden evidence를 남긴다 <!-- omo:id=accept-home-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] ABOUT/HOME authority report의 `> evidence:` block과 automation spec 경로가 일치한다 <!-- omo:id=accept-authority-path-sync;stage=4;scope=frontend;review=5,6 -->
- [ ] ABOUT와 HOME 모두 authority blocker 0이고, rail 밖 exact-prototype 차이는 unclassified 0이다 <!-- omo:id=accept-authority-blocker-zero;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Vitest

- [ ] nav web/mobile 타입·목록, ABOUT content/anchor/accordion, HOME rail states, MYPAGE redirect를 unit/component test로 고정한다 <!-- omo:id=accept-vitest-scope;stage=4;scope=frontend;review=5,6 -->
- [ ] local `WEB_NAV_ITEMS`, embedded theme branch, MYPAGE help dead code가 돌아오지 않는 source guard를 둔다 <!-- omo:id=accept-vitest-drift-guards;stage=4;scope=shared;review=6 -->

### Playwright

- [ ] desktop nav → ABOUT → HOME/PLANNER, mobile HOME guide → ABOUT → back 흐름을 고정한다 <!-- omo:id=accept-playwright-guide-flows;stage=4;scope=frontend;review=5,6 -->
- [ ] `/mypage?tab=help` redirect, FAQ keyboard, 320px overflow/touch target을 검증한다 <!-- omo:id=accept-playwright-legacy-a11y;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME theme empty/error/filter-active와 mixed Link/button role을 browser에서 검증한다 <!-- omo:id=accept-playwright-home-states;stage=4;scope=frontend;review=5,6 -->

### Manual QA

- verifier: Stage 4와 다른 Codex browser/evidence 세션 또는 Stage 5 review 세션
- environment: local demo/preview, desktop 1280px, mobile 390px, narrow 320px
- scenarios: ABOUT 긴 페이지 흐름, HOME rail density/peek, 법적 문서 nav, MYPAGE 기존 기능 회귀, 실제 운영 이메일 표시 여부

### Manual Only

- 사용자 최종 문구/taste 확인
- 배포 preview에서 실제 운영 이메일 환경값 확인
- 브라우저 history 유무에 따른 mobile back fallback 체감 확인
