# Acceptance - 33 YouTube i031 Direct Extraction

> 구현 evidence가 생긴 뒤에만 체크한다. `Manual Only`를 제외한 모든 체크박스는 `omo` metadata를 유지한다. Stage 1 author와 internal 1.5/code/security reviewer는 서로 다른 native Codex agent 역할로 분리한다.

## Stage 1

- [x] 사용자 승인과 Claude 미사용 예외가 공식 문서/workpack에 기록된다 <!-- omo:id=accept-i031-user-approval;stage=2;scope=shared;review=3,6 -->
- [x] 공식 5문서 버전과 `CURRENT_SOURCE_OF_TRUTH` 경로가 일치한다 <!-- omo:id=accept-i031-source-of-truth-sync;stage=2;scope=shared;review=3,6 -->
- [x] exact i031 identity, fresh Train 실패, Validation PASS, holdout 미승인이 숨김없이 기록된다 <!-- omo:id=accept-i031-evidence-truth;stage=2;scope=shared;review=3,6 -->
- [x] internal 1.5 독립 Codex reviewer가 blocking finding 0으로 승인한다 <!-- omo:id=accept-i031-doc-gate;stage=2;scope=shared;review=3,6 -->
- [x] docs PR이 구현 전에 `master`에 merge된다 <!-- omo:id=accept-i031-docs-merged-first;stage=2;scope=shared;review=3,6 -->

## Backend

- [x] 미설정/`legacy` mode에서 기존 경로가 그대로 실행된다 <!-- omo:id=accept-i031-legacy-default;stage=2;scope=backend;review=3,6 -->
- [x] `i031_codex_vision` mode는 exact preflight→source→frames→selector→final 순서로 실행된다 <!-- omo:id=accept-i031-strict-pipeline;stage=2;scope=backend;review=3,6 -->
- [x] identity guard가 모델/prompt/client/execution signature/CLI version drift를 실패시킨다 <!-- omo:id=accept-i031-identity-guard;stage=2;scope=backend;review=3,6 -->
- [x] i031 mode에서 Gemini, legacy parser, visual recipe/quantity fallback이 호출되지 않는다 <!-- omo:id=accept-i031-no-fallback;stage=2;scope=backend;review=3,6 -->
- [x] selector/final 결과가 schema 검증을 통과해야만 기존 draft 조립으로 들어간다 <!-- omo:id=accept-i031-schema-gate;stage=2;scope=backend;review=3,6 -->
- [x] 기존 ingredient dictionary matcher가 표준명 매핑을 수행하고 불확실 항목은 review 상태로 남긴다 <!-- omo:id=accept-i031-ingredient-mapping;stage=2;scope=backend;review=3,6 -->
- [x] 기존 cooking method/session ownership/TTL/register 계약이 유지된다 <!-- omo:id=accept-i031-existing-contracts;stage=2;scope=backend;review=3,6 -->
- [x] timeout, abort, child non-zero, invalid JSON, missing dependency는 기존 error wrapper로 실패한다 <!-- omo:id=accept-i031-failure-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 성공/실패/abort 모두 raw media 임시 디렉터리를 정리한다 <!-- omo:id=accept-i031-temp-cleanup;stage=2;scope=backend;review=3,6 -->
- [x] safe i031 metadata만 DB/log에 남고 URL/secret/raw frame/provider payload는 남지 않는다 <!-- omo:id=accept-i031-safe-observability;stage=2;scope=backend;review=3,6 -->
- [x] concurrent i031 실행 상한과 전체 20분 timeout이 적용된다 <!-- omo:id=accept-i031-budget-limits;stage=2;scope=backend;review=3,6 -->

## Frontend And Localhost

- [x] 기존 `/recipes/new/youtube`에서 임의 공개 레시피 URL을 붙여넣어 성공 draft를 확인한다 <!-- omo:id=accept-i031-localhost-arbitrary-url;stage=4;scope=frontend;review=5,6 -->
- [x] loading 중 중복 제출이 막힌다 <!-- omo:id=accept-i031-loading-submit-lock;stage=4;scope=frontend;review=5,6 -->
- [x] strict preflight/runtime 오류가 기존 error/retry UI에 표시된다 <!-- omo:id=accept-i031-error-retry;stage=4;scope=frontend;review=5,6 -->
- [x] 새 화면, API key 입력, 모델 설정 UI가 없다 <!-- omo:id=accept-i031-no-new-settings-ui;stage=4;scope=frontend;review=5,6 -->
- [x] browser console/page error가 0이고 mobile/desktop에서 text overlap이 없다 <!-- omo:id=accept-i031-browser-quality;stage=4;scope=frontend;review=5,6 -->

## Leakage And Hardcoding

- [x] production source에 평가 영상 ID, title, ingredient, step fixture가 없다 <!-- omo:id=accept-i031-no-eval-literals;stage=2;scope=shared;review=3,6 -->
- [x] fixture 사용은 명시적인 test-only injection 경계로 제한된다 <!-- omo:id=accept-i031-test-only-fixtures;stage=2;scope=shared;review=3,6 -->
- [x] Train/Validation/Holdout 입력이 runtime prompt 분기나 recipe별 rule에 사용되지 않는다 <!-- omo:id=accept-i031-no-dataset-branch;stage=2;scope=shared;review=3,6 -->
- [x] exact bundle의 grader, answer key, expected output은 service runtime에 포함되지 않는다 <!-- omo:id=accept-i031-runtime-subset;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest

- [x] mode, identity, adapter, timeout, cleanup, secret redaction, no-fallback을 단위/통합 테스트로 고정한다 <!-- omo:id=accept-i031-vitest-contract;stage=2;scope=backend;review=3,6 -->
- [x] 기존 YouTube import backend 회귀 테스트가 legacy mode를 계속 보호한다 <!-- omo:id=accept-i031-legacy-regression-tests;stage=2;scope=backend;review=3,6 -->

### Playwright

- [x] 기존 YT_IMPORT loading/error/retry/review 흐름을 desktop/mobile 브라우저에서 검증한다 <!-- omo:id=accept-i031-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 실제 외부 URL smoke와 deterministic mock 회귀를 별도 evidence로 구분한다 <!-- omo:id=accept-i031-live-evidence-split;stage=4;scope=shared;review=6 -->

## Merge Gate

- [x] `pnpm validate:source-of-truth-sync`와 workflow/workpack validation이 통과한다 <!-- omo:id=accept-i031-doc-validation;stage=2;scope=shared;review=3,6 -->
- [x] `pnpm verify:backend`, lint, typecheck가 통과한다 <!-- omo:id=accept-i031-backend-gates;stage=2;scope=backend;review=3,6 -->
- [x] `pnpm verify:frontend`와 browser 검증이 통과한다 <!-- omo:id=accept-i031-frontend-gates;stage=4;scope=frontend;review=5,6 -->
- [x] 독립 Codex code/security review blocking finding이 0이다 <!-- omo:id=accept-i031-independent-review;stage=2;scope=shared;review=3,6 -->
- [ ] current PR head의 모든 GitHub checks가 green이고 PR이 merge된다 <!-- omo:id=accept-i031-current-head-green;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier: 구현 owner와 다른 Codex browser/verifier 역할
- environment: localhost, desktop 1280px, mobile 390px, `i031_codex_vision`
- scenarios: arbitrary public recipe URL success, missing Codex login, wrong YouTube key, timeout, retry, unresolved ingredient review

### Manual Only

- [ ] 사용자가 localhost에서 자신의 임의 공개 YouTube 레시피 URL 결과를 최종 확인한다
- [ ] Holdout promotion과 preview/production i031 enablement를 별도 승인한다
- [ ] Vercel 외 production macOS worker 설치와 운영 secret을 별도 승인한다
