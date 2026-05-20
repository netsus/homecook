# Acceptance Criteria — mvp2-polish-planner-meal-add-modal

> acceptance는 living closeout 문서다. 체크는 테스트, screenshot evidence, authority review, 실제 브라우저 확인 같은 근거가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어야 한다.

## Happy Path

- [ ] PLANNER_WEEK 빈 끼니 `+` → 식사추가 옵션 시트 → `검색으로 추가` → 검색 picker modal/sheet가 열린다 <!-- omo:id=accept-mppma-planner-search-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 끼니 `+` → `레시피북에서 추가` → 레시피북 picker modal/sheet가 열린다 <!-- omo:id=accept-mppma-planner-recipebook-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 끼니 `+` → `팬트리 기반 추천` → 팬트리 추천 picker modal/sheet가 열린다 <!-- omo:id=accept-mppma-planner-pantry-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 빈 끼니 `+` → `유튜브에서 가져오기` → 유튜브 entry modal/sheet가 열린다 <!-- omo:id=accept-mppma-planner-youtube-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] MEAL_SCREEN `식사 추가` → 동일한 네 가지 modal/sheet 옵션 흐름이 동작한다 <!-- omo:id=accept-mppma-meal-screen-modal-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] `직접등록` 옵션은 `/menu/add/manual` route로 이동한다 <!-- omo:id=accept-mppma-manual-route;stage=4;scope=frontend;review=5,6 -->
- [ ] `/menu/add/youtube` 직접 URL 접근은 fallback/deep-link 화면으로 계속 동작한다 <!-- omo:id=accept-mppma-youtube-deeplink;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] modal/sheet에서 뒤로가기를 누르면 원래 식사추가 옵션 시트로 돌아간다 <!-- omo:id=accept-mppma-back-to-options;stage=4;scope=frontend;review=5,6 -->
- [ ] `남은 요리에서 추가` 모달도 명시적 뒤로가기 버튼으로 옵션 시트에 돌아간다 <!-- omo:id=accept-mppma-leftover-back;stage=4;scope=frontend;review=5,6 -->
- [ ] 검색/레시피북/팬트리/유튜브/남은요리 modal header의 back button size와 shape가 통일된다 <!-- omo:id=accept-mppma-back-button-unified;stage=4;scope=frontend;review=5,6 -->
- [ ] `유튜브에서 가져오기`와 `직접등록` option button font-size/weight/line-height가 다른 option button과 일치한다 <!-- omo:id=accept-mppma-option-font;stage=4;scope=frontend;review=5,6 -->
- [ ] Meal 생성 후 PLANNER_WEEK 또는 MEAL_SCREEN 컨텍스트로 복귀한다 <!-- omo:id=accept-mppma-return-context;stage=4;scope=frontend;review=5,6 -->
- [ ] `meals.status` 전이와 `POST /meals` payload가 기존 계약에서 벗어나지 않는다 <!-- omo:id=accept-mppma-meal-contract-preserved;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [ ] loading 상태가 보존된다 <!-- omo:id=accept-mppma-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 보존된다 <!-- omo:id=accept-mppma-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 보존된다 <!-- omo:id=accept-mppma-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized/login gate 흐름과 return-to-action이 보존된다 <!-- omo:id=accept-mppma-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 서버 409/500 또는 네트워크 실패 시 기존 실패 피드백이 유지된다 <!-- omo:id=accept-mppma-server-error;stage=4;scope=frontend;review=6 -->

## Data Integrity

- FE-only 슬라이스. 신규 DB write path 없음.
- [ ] 타인 리소스 접근/수정 가능성이 새로 생기지 않는다 <!-- omo:id=accept-mppma-owner-guard-preserved;stage=4;scope=frontend;review=6 -->
- [ ] invalid input 처리 정책이 기존 API 계약과 일치한다 <!-- omo:id=accept-mppma-invalid-input-preserved;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [ ] 기존 fixture/mock 데이터로 PLANNER_WEEK, MEAL_SCREEN, MENU_ADD, YT_IMPORT fallback 화면이 정상 렌더링된다 <!-- omo:id=accept-mppma-fixture-baseline;stage=4;scope=frontend;review=6 -->
- [ ] real DB smoke는 API/DB/seed 변경 없음으로 N/A 처리 근거가 PR에 남는다 <!-- omo:id=accept-mppma-real-db-na;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: Codex Stage 5/6 reviewer
- environment: mobile default 390px, mobile narrow, desktop regression smoke
- scenarios:
  - PLANNER_WEEK 빈 끼니 `+` → 검색/레시피북/팬트리/유튜브 옵션이 modal/sheet로 열리는지 확인
  - MEAL_SCREEN `식사 추가` → 같은 옵션들이 modal/sheet로 열리는지 확인
  - 각 modal header의 뒤로가기 버튼 크기와 형태가 같은지 확인
  - `남은 요리에서 추가` modal의 뒤로가기 버튼으로 옵션 시트에 복귀하는지 확인
  - `유튜브에서 가져오기`와 `직접등록` option button typography가 다른 option과 같은지 확인
  - `/menu/add/manual`, `/menu/add/youtube`, `/menu-add?source=...` fallback route가 깨지지 않는지 확인

## Automation Split

### Vitest

- [ ] option sheet typography와 click behavior가 component test로 고정된다 <!-- omo:id=accept-mppma-vitest-options;stage=4;scope=frontend;review=6 -->
- [ ] shared back button primitive 또는 shared header behavior가 component test로 고정된다 <!-- omo:id=accept-mppma-vitest-back-button;stage=4;scope=frontend;review=6 -->
- [ ] YouTube modal entry와 fallback route 유지가 component test로 고정된다 <!-- omo:id=accept-mppma-vitest-youtube;stage=4;scope=frontend;review=6 -->

### Playwright

- [ ] PLANNER_WEEK 식사추가 옵션 → picker modal 흐름이 브라우저 테스트로 고정된다 <!-- omo:id=accept-mppma-playwright-planner;stage=4;scope=frontend;review=6 -->
- [ ] MEAL_SCREEN 식사추가 옵션 → picker modal 흐름이 브라우저 테스트로 고정된다 <!-- omo:id=accept-mppma-playwright-meal-screen;stage=4;scope=frontend;review=6 -->
- [ ] mobile default/narrow screenshot evidence가 authority review에 연결된다 <!-- omo:id=accept-mppma-playwright-screenshots;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 기기 OS back gesture와 시트 animation polish는 수동 확인으로 남긴다
