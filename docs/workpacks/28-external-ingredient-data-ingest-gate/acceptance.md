# Acceptance Checklist

> Stage 1에서는 구현 acceptance를 체크하지 않는다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에는 외부 source export 확보, provider 이용 조건 확인처럼 자동화할 수 없는 항목만 남긴다.

## Safety Policy

- [x] 운영 `ingredients`에 외부 source row를 자동 직적재하지 않는다 <!-- omo:id=accept-no-production-direct-load;stage=2;scope=backend;review=3,6 -->
- [x] 운영 `ingredient_synonyms`를 review 없이 자동 생성하지 않는다 <!-- omo:id=accept-no-auto-synonym;stage=2;scope=backend;review=3,6 -->
- [x] canonical ingredient 생성은 approved seed promotion artifact 이후 별도 승인 경로로만 가능하다 <!-- omo:id=accept-approved-only-promotion;stage=2;scope=backend;review=3,6 -->
- [x] public API endpoint/response shape가 변경되지 않는다 <!-- omo:id=accept-no-public-api-change;stage=2;scope=backend;review=3,6 -->
- [x] LLM/model 기반 normalization을 사용하지 않는다 <!-- omo:id=accept-no-llm-normalization;stage=2;scope=backend;review=3,6 -->

## Ingest Mode

- [x] 1차 실행 형태는 file export/import 기반 batch seed review다 <!-- omo:id=accept-file-batch-first;stage=2;scope=backend;review=3,6 -->
- [x] API key 기반 live fetch는 기본 CI/Stage 2 경로에 포함되지 않는다 <!-- omo:id=accept-no-live-fetch-ci;stage=2;scope=backend;review=3,6 -->
- [x] source system, source file/version/date, row fingerprint가 기록된다 <!-- omo:id=accept-source-metadata;stage=2;scope=backend;review=3,6 -->
- [x] raw row payload가 손실 없이 보존된다 <!-- omo:id=accept-raw-row-preserved;stage=2;scope=backend;review=3,6 -->

## Normalization / Candidate Generation

- [x] deterministic normalization helper가 원문명 -> normalized candidate를 산출한다 <!-- omo:id=accept-deterministic-normalization;stage=2;scope=backend;review=3,6 -->
- [x] v1 canonical 8 category 후보만 사용한다 <!-- omo:id=accept-canonical-8-category-compat;stage=2;scope=backend;review=3,6 -->
- [x] category candidate에는 confidence/reason code가 포함된다 <!-- omo:id=accept-category-reason-code;stage=2;scope=backend;review=3,6 -->
- [x] duplicate 후보가 exact match, folded match, synonym candidate로 구분된다 <!-- omo:id=accept-duplicate-detection;stage=2;scope=backend;review=3,6 -->
- [x] synonym 후보는 canonical 승인 전 production 반영 대상이 아니다 <!-- omo:id=accept-synonym-candidate-only;stage=2;scope=backend;review=3,6 -->

## Review Gate / Seed Promotion

- [x] review status가 seed promotion을 차단한다 <!-- omo:id=accept-review-status-gate;stage=2;scope=backend;review=3,6 -->
- [x] `pending_review`, `approved`, `rejected`, `needs_source_check` 상태가 구분된다 <!-- omo:id=accept-review-status-values;stage=2;scope=backend;review=3,6 -->
- [x] approved row만 seed promotion artifact에 포함된다 <!-- omo:id=accept-approved-artifact-only;stage=2;scope=backend;review=3,6 -->
- [x] promotion artifact는 재실행해도 중복 seed를 만들지 않는다 <!-- omo:id=accept-idempotent-promotion;stage=2;scope=backend;review=3,6 -->
- [x] report에 total/approved/rejected/pending/duplicate/low-confidence count가 포함된다 <!-- omo:id=accept-report-counts;stage=2;scope=backend;review=3,6 -->

## Error / Data Integrity

- [x] 필수 source metadata가 없으면 import를 차단한다 <!-- omo:id=accept-missing-source-metadata;stage=2;scope=backend;review=3,6 -->
- [x] 원문 재료명이 비어 있으면 row를 rejected로 처리한다 <!-- omo:id=accept-empty-source-name;stage=2;scope=backend;review=3,6 -->
- [x] source 이용 조건 미확인 row는 `needs_source_check`로 차단한다 <!-- omo:id=accept-source-license-gate;stage=2;scope=backend;review=3,6 -->
- [x] invalid row가 전체 batch를 조용히 성공 처리하지 않는다 <!-- omo:id=accept-invalid-row-report;stage=2;scope=backend;review=3,6 -->
- [x] batch 재실행이 기존 candidate/report를 예측 가능하게 갱신하거나 skip한다 <!-- omo:id=accept-batch-rerun-safety;stage=2;scope=backend;review=3,6 -->

## Automation Split

### Unit / Integration

- [x] source fixture parser test <!-- omo:id=accept-test-source-parser;stage=2;scope=backend;review=3,6 -->
- [x] deterministic normalization test <!-- omo:id=accept-test-normalization;stage=2;scope=backend;review=3,6 -->
- [x] duplicate detection test <!-- omo:id=accept-test-duplicate-detection;stage=2;scope=backend;review=3,6 -->
- [x] review status gate test <!-- omo:id=accept-test-review-gate;stage=2;scope=backend;review=3,6 -->
- [x] approved-only promotion artifact test <!-- omo:id=accept-test-promotion-artifact;stage=2;scope=backend;review=3,6 -->
- [x] no production direct-load regression test <!-- omo:id=accept-test-no-direct-load;stage=2;scope=backend;review=3,6 -->

### Playwright

- [x] N/A: 이 slice는 사용자-facing UI가 없다 <!-- omo:id=accept-playwright-na;stage=4;scope=frontend;review=6 -->

### Manual Only

- [x] 실제 식약처/농식품올바로 export sample 확보 및 이용 조건 확인
- [x] 실제 source sample 1개 이상으로 candidate report를 수동 검토
