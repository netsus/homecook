# Acceptance Criteria - design-polish-slice5-manual-youtube

## Happy Path

- [ ] MANUAL_RECIPE_CREATE에서 재료 추가 후 재료명, 수량 input, 단위, 삭제 버튼이 한 줄에 정렬된다 <!-- omo:id=dp5-accept-manual-ingredient-row;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_RECIPE_CREATE에서 조리법을 모달 없이 화면 본문에서 바로 입력할 수 있다 <!-- omo:id=dp5-accept-inline-step-input;stage=4;scope=frontend;review=5,6 -->
- [ ] 조리방법은 가로 스크롤 칩으로 선택되고 선택 상태가 step row에 즉시 반영된다 <!-- omo:id=dp5-accept-method-chip-selection;stage=4;scope=frontend;review=5,6 -->
- [ ] 조리방법별 색상이 chip과 step row에서 구분된다 <!-- omo:id=dp5-accept-method-color-visible;stage=4;scope=frontend;review=5,6 -->
- [ ] 레시피 저장 시 기존 `POST /recipes` payload 구조와 응답 처리가 유지된다 <!-- omo:id=dp5-accept-manual-payload-preserved;stage=4;scope=shared;review=5,6 -->
- [ ] YT_IMPORT 검수/수정 단계에서 재료 행과 조리방법 색상 표시가 깨지지 않는다 <!-- omo:id=dp5-accept-youtube-review-regression;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] `ingredients`가 0개일 때 `재료를 1개 이상 추가해주세요` 문구가 작은 텍스트로 표시되고 배경 박스가 없다 <!-- omo:id=dp5-accept-ingredient-warning-density;stage=4;scope=frontend;review=5,6 -->
- [ ] `steps[].cooking_method_id` 필수 정책이 유지된다 <!-- omo:id=dp5-accept-method-required;stage=4;scope=shared;review=5,6 -->
- [ ] `ingredient_type='QUANT'`와 `TO_TASTE` validation 정책이 유지된다 <!-- omo:id=dp5-accept-ingredient-validation-preserved;stage=4;scope=shared;review=5,6 -->
- [ ] 등록 후 끼니 추가, 상세 이동, my_added 반영 흐름이 기존과 동일하다 <!-- omo:id=dp5-accept-post-create-flow-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] loading 상태가 저장/검증/추출/등록 중 유지된다 <!-- omo:id=dp5-accept-loading-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태 또는 입력 전 안내가 모바일에서 과도한 공간을 차지하지 않는다 <!-- omo:id=dp5-accept-empty-density;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 기존 API 실패/validation 실패에 대해 유지된다 <!-- omo:id=dp5-accept-error-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 흐름과 login gate return-to-action이 유지된다 <!-- omo:id=dp5-accept-unauthorized-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px 모바일에서 input, unit, delete button, method chip 텍스트가 겹치지 않는다 <!-- omo:id=dp5-accept-narrow-no-overlap;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 화면 내 직접 입력으로 전환해도 `steps` 배열의 `step_number`, `instruction`, `cooking_method_id`가 기존 순서대로 생성된다 <!-- omo:id=dp5-accept-step-data-integrity;stage=4;scope=shared;review=5,6 -->
- [ ] YT_IMPORT register payload의 `ingredients` / `steps` 구조가 기존과 동일하다 <!-- omo:id=dp5-accept-youtube-payload-preserved;stage=4;scope=shared;review=5,6 -->
- [ ] 조리방법 색상 복구가 `color_key` 표시만 변경하고 DB 값 또는 API 값을 변경하지 않는다 <!-- omo:id=dp5-accept-color-visual-only;stage=4;scope=shared;review=5,6 -->

## Data Setup / Preconditions

- [ ] fixture에 조리방법 seed 8종과 color_key가 존재한다 <!-- omo:id=dp5-accept-fixture-methods;stage=4;scope=frontend;review=6 -->
- [ ] manual/youtube fixture 또는 stub 데이터로 재료 2개 이상, step 2개 이상 상태를 렌더링할 수 있다 <!-- omo:id=dp5-accept-fixture-form-density;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: Codex Stage 5/6 + Claude final authority when available
- environment: local Playwright fixture server, mobile default 390px, mobile narrow 320px
- scenarios:
  - 직접등록 화면에서 재료 2개를 추가하고 한 줄 정렬/삭제 버튼 터치 영역 확인
  - 조리법 2개를 화면 본문에서 입력하고 각 step의 조리방법 chip/color 확인
  - 재료가 없는 상태의 validation 문구 밀도 확인
  - 유튜브 검수 화면에서 추출된 재료/step을 수정하고 색상/행 정렬 회귀 확인

## Automation Split

### Vitest

- [ ] 조리방법 color_key mapping 또는 표시 helper를 단위 테스트로 고정한다 <!-- omo:id=dp5-vitest-method-color;stage=4;scope=frontend;review=6 -->
- [ ] manual recipe step payload 생성이 기존 계약과 동일함을 테스트한다 <!-- omo:id=dp5-vitest-step-payload;stage=4;scope=shared;review=6 -->

### Playwright

- [ ] MANUAL_RECIPE_CREATE 직접등록 happy path에서 inline step 입력과 method chip 선택을 검증한다 <!-- omo:id=dp5-playwright-manual-inline-steps;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile narrow viewport에서 재료 행/step row가 겹치지 않음을 검증한다 <!-- omo:id=dp5-playwright-narrow-layout;stage=4;scope=frontend;review=5,6 -->
- [ ] YT_IMPORT 검수 편집 flow에서 기존 등록 흐름이 유지됨을 검증한다 <!-- omo:id=dp5-playwright-youtube-review;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 기기에서 스크롤/키보드가 step 직접 입력 영역을 가리지 않는지 확인
- [ ] 실제 YouTube live 영상 검증/추출은 기존 19-youtube-import Manual Only 범위로 유지
