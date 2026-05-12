# Acceptance Checklist: wave1-port-discovery-detail

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> 아래 체크 상태는 PR #374 historical closeout evidence를 보존한다. 2026-05-13 Wave1 exact-parity rerun에서는 Phase4 prep artifacts(current/reference screenshots, diff table, computed-style/geometry audit plan, MVP regression lock)를 먼저 만들고, Phase5 PR에서 새 evidence로 갱신한다.
> Historical `UI-only`/`production 승인 토큰` 표현은 최신 기준에서는 그대로 쓰지 않는다. Slice B rerun은 official API v1.2.4의 `latest` sort와 `book_ids[]` save 계약을 먼저 재검증하고, visual/layout은 fixed prototype reference + Slice A `--wave1-*` foundation을 따른다.

## Happy Path

### HOME

- [x] HOME header에 프로필/장바구니 아이콘이 제거되고 브랜드 로고만 표시된다 <!-- omo:id=accept-home-header-simplified;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 이번주 식단 배너 클릭 시 `/planner` 탭으로 이동한다 <!-- omo:id=accept-home-banner-planner;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 정렬이 바텀시트 대신 inline SortDropdown으로 작동한다 <!-- omo:id=accept-home-sort-inline;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 재료 검색 칩이 "모든 레시피" 섹션 바로 아래에 위치한다 <!-- omo:id=accept-home-filter-position;stage=4;scope=frontend;review=5,6 -->
- [x] HOME "재료로 거르기" 문구가 "재료로 검색"으로 변경됐다 <!-- omo:id=accept-home-filter-label;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 기존 검색, 테마 카루셀, 레시피 카드 목록이 정상 작동한다 <!-- omo:id=accept-home-existing-features;stage=4;scope=frontend;review=5,6 -->

### RECIPE_DETAIL

- [x] RECIPE_DETAIL에서 별점/rating 표시가 제거됐다 <!-- omo:id=accept-detail-no-rating;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL hero 영역에 좋아요/저장/요리완료 행동 metric이 표시된다 <!-- omo:id=accept-detail-hero-metrics;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 이미지 옆 또는 근접 영역에 북마크/저장 토글이 있다 <!-- omo:id=accept-detail-bookmark-toggle;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 하단 sticky 액션바에 `플래너에 추가` + `요리하기` 2버튼이 표시된다 <!-- omo:id=accept-detail-bottom-2cta;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 재료 탭에서 카테고리 헤더가 제거되고 정렬 순서만 유지된다 <!-- omo:id=accept-detail-no-category-header;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 조리법 탭의 본문 폰트가 기존보다 커졌다 <!-- omo:id=accept-detail-step-font-larger;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 기존 탭 전환, 인분 조절, 로그인 게이트 흐름이 정상 작동한다 <!-- omo:id=accept-detail-existing-features;stage=4;scope=frontend;review=5,6 -->

### Save Modal

- [x] save modal에서 레시피 정보 프리뷰 섹션이 제거됐다 <!-- omo:id=accept-save-no-preview;stage=4;scope=frontend;review=5,6 -->
- [x] save modal 하단 버튼 문구가 "저장"이다 <!-- omo:id=accept-save-button-label;stage=4;scope=frontend;review=5,6 -->
- [x] save modal에서 새 레시피북 만들기가 인라인으로 작동한다 <!-- omo:id=accept-save-create-book;stage=4;scope=frontend;review=5,6 -->

### Login

- [x] login 화면에서 카카오/Apple 버튼이 숨겨지고 네이버/Google만 표시된다 <!-- omo:id=accept-login-provider-reduced;stage=4;scope=frontend;review=5,6 -->
- [x] login 후 return-to-action이 정상 작동한다 <!-- omo:id=accept-login-return-action;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] HOME과 RECIPE_DETAIL의 loading/empty/error 상태가 올바르게 표시된다 <!-- omo:id=accept-state-ui-home-detail;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 사용자가 보호 액션(좋아요/저장/플래너추가/요리하기) 시도 시 로그인 게이트가 표시된다 <!-- omo:id=accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] historical closeout 당시 production 승인 토큰 정책을 준수했다. Re-audit에서는 fixed prototype visual/layout 기준과 Slice A `--wave1-*` foundation을 따른다 <!-- omo:id=accept-approved-tokens;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 API 응답 필드만 소비하고 새 endpoint/field가 추가되지 않는다 <!-- omo:id=accept-no-contract-change;stage=4;scope=frontend;review=6 -->
- [x] 새 npm dependency가 추가되지 않는다 <!-- omo:id=accept-no-new-dep;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [x] RECIPE_DETAIL에서 존재하지 않는 레시피 ID 접근 시 에러 상태가 표시된다 <!-- omo:id=accept-detail-not-found;stage=4;scope=frontend;review=5,6 -->
- [x] save modal에서 book 목록 로드 실패 시 에러 메시지가 표시된다 <!-- omo:id=accept-save-load-error;stage=4;scope=frontend;review=5,6 -->
- [x] save modal에서 이미 저장된 book 선택 시 read-only 안내가 표시된다 <!-- omo:id=accept-save-duplicate-guard;stage=4;scope=frontend;review=5,6 -->
- [x] login 화면에서 OAuth 실패 시 에러 메시지가 표시된다 <!-- omo:id=accept-login-error;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [x] mobile 390px HOME이 overflow 없이 렌더된다 <!-- omo:id=accept-home-390;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 320px HOME이 overflow 없이 렌더된다 <!-- omo:id=accept-home-320;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 390px RECIPE_DETAIL이 overflow 없이 렌더된다 <!-- omo:id=accept-detail-390;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 320px RECIPE_DETAIL이 overflow 없이 렌더된다 <!-- omo:id=accept-detail-320;stage=4;scope=frontend;review=5,6 -->
- [x] SortDropdown이 HOME에서 touch-friendly하게 작동한다 <!-- omo:id=accept-sort-dropdown-touch;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL hero 영역 metric이 이미지와 겹치지 않고 가독성이 확보된다 <!-- omo:id=accept-detail-metric-legibility;stage=4;scope=frontend;review=5,6 -->
- [x] Screenshot evidence가 Stage 4 완료 시 생성된다 <!-- omo:id=accept-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] 기존 QA fixture로 HOME 레시피 목록 렌더 테스트가 가능하다 <!-- omo:id=accept-fixture-home;stage=4;scope=frontend;review=6 -->
- [x] 기존 QA fixture로 RECIPE_DETAIL 상세 렌더 테스트가 가능하다 <!-- omo:id=accept-fixture-detail;stage=4;scope=frontend;review=6 -->

## Automation Split

### Vitest

- [x] HOME sort dropdown 전환 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-home-sort;stage=4;scope=frontend;review=5,6 -->
- [x] HOME filter chip 위치/라벨 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-home-filter;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL metric 표시 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-detail-metrics;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 하단 CTA 2버튼 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-detail-cta;stage=4;scope=frontend;review=5,6 -->
- [x] save modal 프리뷰 제거 + 버튼 라벨 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-save-modal;stage=4;scope=frontend;review=5,6 -->
- [x] login provider 표시 테스트가 존재한다 <!-- omo:id=accept-vitest-login-providers;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] HOME → RECIPE_DETAIL → save modal E2E 흐름이 브라우저에서 정상 작동한다 <!-- omo:id=accept-playwright-discovery-flow;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 하단 CTA → 플래너 추가 sheet E2E가 정상 작동한다 <!-- omo:id=accept-playwright-planner-add;stage=4;scope=frontend;review=5,6 -->
- [x] login 화면에서 provider 버튼 표시가 올바르다 (네이버/Google만) <!-- omo:id=accept-playwright-login;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- dev server에서 390px/320px HOME/RECIPE_DETAIL 시각 품질 확인
- SortDropdown 외부 클릭 dismiss, Escape 키 dismiss 확인
- RECIPE_DETAIL hero metric 오버레이의 이미지 배경 대비 가독성 확인
- save modal 레시피북 생성 → 저장 전체 흐름 확인
- login OAuth 실제 provider 연동 테스트 (네이버/Google)
