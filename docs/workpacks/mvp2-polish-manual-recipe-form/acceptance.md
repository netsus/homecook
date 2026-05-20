# Acceptance Criteria — mvp2-polish-manual-recipe-form

> acceptance는 living closeout 문서다. 체크는 테스트, screenshot evidence, authority review, 실제 브라우저 확인 같은 근거가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어야 한다.

## Happy Path

- [ ] `MANUAL_RECIPE_CREATE`에서 기준인분을 `- / +` 버튼으로 조절할 수 있다 <!-- omo:id=accept-mprf-base-servings-stepper;stage=4;scope=frontend;review=5,6 -->
- [ ] 기준인분은 `-` 버튼이나 직접 입력으로 1 미만이 되지 않는다 <!-- omo:id=accept-mprf-base-servings-min;stage=4;scope=frontend;review=5,6 -->
- [ ] 조리방법을 선택한 뒤 조리과정을 추가하면 선택한 방법으로 단계가 추가된다 <!-- omo:id=accept-mprf-step-add-selected-method;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 추가 모달에서 재료를 선택한 뒤 `선택한 재료 추가`를 누르면 본문 재료 목록에 추가된다 <!-- omo:id=accept-mprf-add-ingredients;stage=4;scope=frontend;review=5,6 -->
- [ ] 빠진 항목 없이 저장하면 기존 직접 레시피 저장 흐름과 후속 이동이 유지된다 <!-- omo:id=accept-mprf-save-flow-preserved;stage=4;scope=frontend;review=6 -->

## State / Policy

- [ ] 조리방법 미선택 상태에서 조리과정을 추가해도 임의 기본 조리방법으로 추가되지 않는다 <!-- omo:id=accept-mprf-no-default-method;stage=4;scope=frontend;review=5,6 -->
- [ ] 조리방법 미선택 상태에서는 조리방법 선택 안내가 inline으로 표시된다 <!-- omo:id=accept-mprf-method-inline-error;stage=4;scope=frontend;review=5,6 -->
- [ ] 하단 `저장하려면 아래 항목을 채워주세요.` 박스가 사라진다 <!-- omo:id=accept-mprf-remove-save-requirements-box;stage=4;scope=frontend;review=5,6 -->
- [ ] 저장 클릭 시 제목/기준인분/재료/조리과정 중 빠진 항목 주변에 설명문구 또는 오류 강조가 표시된다 <!-- omo:id=accept-mprf-field-errors-after-save;stage=4;scope=frontend;review=5,6 -->
- [ ] `조리 과정을 추가해주세요.` 문구는 배경 박스 없이 compact helper로 표시된다 <!-- omo:id=accept-mprf-compact-step-helper;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 helper와 조리과정 helper의 크기/밀도/오류 강조 패턴이 일관된다 <!-- omo:id=accept-mprf-helper-consistency;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 선택 요약은 카테고리 컨트롤 아래에서 보인다 <!-- omo:id=accept-mprf-selected-summary-position;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 선택 요약의 선택 수 설명 문구는 보이지 않는다 <!-- omo:id=accept-mprf-selected-count-copy-removed;stage=4;scope=frontend;review=5,6 -->
- [ ] 선택 요약의 재료 칩을 누르면 해당 재료 선택이 취소된다 <!-- omo:id=accept-mprf-selected-chip-deselect;stage=4;scope=frontend;review=5,6 -->
- [ ] 선택 재료가 1개 이상이면 완료 버튼이 active 색상으로 보인다 <!-- omo:id=accept-mprf-selected-button-active;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] loading 상태가 보존된다 <!-- omo:id=accept-mprf-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 보존된다 <!-- omo:id=accept-mprf-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 보존된다 <!-- omo:id=accept-mprf-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized/login gate 흐름과 return-to-action이 보존된다 <!-- omo:id=accept-mprf-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 저장 API 실패 시 기존 실패 피드백이 유지된다 <!-- omo:id=accept-mprf-server-error;stage=4;scope=frontend;review=6 -->

## Data Integrity

- FE-only 슬라이스. 신규 DB write path 없음.
- [ ] 직접 레시피 저장 payload 필드와 타입이 기존 계약에서 벗어나지 않는다 <!-- omo:id=accept-mprf-save-contract-preserved;stage=4;scope=frontend;review=6 -->
- [ ] 타인 리소스 접근/수정 가능성이 새로 생기지 않는다 <!-- omo:id=accept-mprf-owner-guard-preserved;stage=4;scope=frontend;review=6 -->
- [ ] invalid input 처리 정책이 기존 API 계약과 일치한다 <!-- omo:id=accept-mprf-invalid-input-preserved;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [ ] 기존 fixture/mock 데이터로 직접등록 화면과 재료 추가 모달이 정상 렌더링된다 <!-- omo:id=accept-mprf-fixture-baseline;stage=4;scope=frontend;review=6 -->
- [ ] real DB smoke는 API/DB/seed 변경 없음으로 N/A 처리 근거가 PR에 남는다 <!-- omo:id=accept-mprf-real-db-na;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: Codex Stage 5/6 reviewer
- environment: mobile default 390px, mobile narrow, desktop regression smoke
- scenarios:
  - 기준인분 `- / +` 버튼과 최소값 동작 확인
  - 조리방법 미선택 상태에서 조리과정 추가가 막히는지 확인
  - 저장 클릭 후 빠진 항목 주변에 validation 문구가 표시되는지 확인
  - 재료 추가 모달에서 선택 요약 위치, 선택 칩 취소, active 완료 버튼 확인
  - 직접등록 저장 성공/실패와 기존 이동 흐름이 깨지지 않는지 확인

## Automation Split

### Vitest

- [ ] 기준인분 stepper와 최소값이 component test로 고정된다 <!-- omo:id=accept-mprf-vitest-stepper;stage=4;scope=frontend;review=6 -->
- [ ] 조리방법 미선택 시 단계 추가 차단이 component test로 고정된다 <!-- omo:id=accept-mprf-vitest-method-required;stage=4;scope=frontend;review=6 -->
- [ ] 저장 클릭 후 필드별 validation 표시가 component test로 고정된다 <!-- omo:id=accept-mprf-vitest-field-validation;stage=4;scope=frontend;review=6 -->
- [ ] 재료 모달 선택 요약 위치/취소/active 버튼이 component test로 고정된다 <!-- omo:id=accept-mprf-vitest-ingredient-modal;stage=4;scope=frontend;review=6 -->

### Playwright

- [ ] 직접등록 화면의 기준인분/조리과정/저장 validation 흐름이 브라우저 테스트 또는 screenshot evidence로 고정된다 <!-- omo:id=accept-mprf-playwright-manual-form;stage=4;scope=frontend;review=6 -->
- [ ] 재료 추가 모달의 선택 요약과 완료 버튼 상태가 브라우저 테스트 또는 screenshot evidence로 고정된다 <!-- omo:id=accept-mprf-playwright-ingredient-modal;stage=4;scope=frontend;review=6 -->
- [ ] mobile default/narrow screenshot evidence가 authority review에 연결된다 <!-- omo:id=accept-mprf-playwright-screenshots;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 기기 키보드 입력, 숫자 input spinner, OS back gesture 세부 polish는 수동 확인으로 남긴다
