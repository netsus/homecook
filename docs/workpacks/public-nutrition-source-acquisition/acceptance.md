# Acceptance Checklist: public-nutrition-source-acquisition

> 이 acceptance는 `public-nutrition-source-acquisition` Stage 2의 BE/data-tooling 범위만 닫는다. Stage 4~6, 화면, Playwright, Design/Accessibility는 N/A다.
>
> 체크는 테스트, deterministic artifact 비교, secret scan, operator smoke evidence가 생긴 뒤에만 한다. `Manual Only`를 제외한 각 항목은 Stage 2 구현 후 독립 Stage 3 Codex reviewer가 확인한다.

## Happy Path

- [ ] MFDS fixture/file source를 취득하면 raw snapshot과 sanitized manifest가 함께 생성된다 <!-- omo:id=accept-fetch-raw-manifest;stage=2;scope=backend;review=3 -->
- [ ] complete raw batch가 staged -> normalized -> reviewed -> approved_pinned 순서로만 이동한다 <!-- omo:id=accept-artifact-lifecycle;stage=2;scope=backend;review=3 -->
- [ ] 핵심 5종이 `energy_kcal/kcal`, `carbohydrate_g/g`, `protein_g/g`, `fat_g/g`, `sodium_mg/mg`로 정규화된다 <!-- omo:id=accept-core-five-schema;stage=2;scope=backend;review=3 -->
- [ ] explicit approved decision이 있는 row만 `approved-promotion-input.json`에 들어간다 <!-- omo:id=accept-approved-only-promotion;stage=2;scope=backend;review=3 -->
- [ ] 동일 input/decision을 재실행하면 ordering, fingerprint, approved item set, content hash가 같다 <!-- omo:id=accept-deterministic-rerun;stage=2;scope=backend;review=3 -->
- [ ] 성공 summary가 `production_db_writes: 0`과 다음 slice용 handoff checksum을 제공한다 <!-- omo:id=accept-zero-db-write-handoff;stage=2;scope=shared;review=3 -->

## Source / Application / Credential Policy

- [ ] 필수 활용신청 source가 MFDS `15127578` 하나로 고정된다 <!-- omo:id=accept-mfds-only-required-application;stage=2;scope=backend;review=3 -->
- [ ] RDA 10.4 Excel/검색과 양념 계량표가 key 없는 file/manual evidence 경로로 유지된다 <!-- omo:id=accept-rda-keyless-sources;stage=2;scope=backend;review=3 -->
- [ ] 활성 RDA 10.0 OpenAPI `15143598`은 10.0/KOGL4 근거와 함께 기본 source에서 제외된다 <!-- omo:id=accept-rda-10-0-excluded;stage=2;scope=backend;review=3 -->
- [ ] runtime은 정확히 `DATA_GO_KR_API_KEY` 하나만 server/operator 환경에서 읽고 suffixed key rotation을 사용하지 않는다 <!-- omo:id=accept-single-server-key;stage=2;scope=backend;review=3 -->
- [ ] actual key/auth query가 문서, committed file, fixture, snapshot, log, error, response, manifest URL/query, client bundle에 0건이다 <!-- omo:id=accept-credential-redaction-zero;stage=2;scope=backend;review=3 -->
- [ ] fixture key는 실제 key와 구분되는 fake token이고 actual key pattern secret scan이 통과한다 <!-- omo:id=accept-fake-key-fixture;stage=2;scope=backend;review=3 -->

## State / Policy

- [ ] failed/quarantined batch가 `approved_pinned`으로 부분 성공 처리되지 않는다 <!-- omo:id=accept-no-partial-promotion;stage=2;scope=backend;review=3 -->
- [ ] approved/pinned artifact는 append/overwrite하지 않고 source/version/value 변경 시 새 bundle을 만든다 <!-- omo:id=accept-immutable-approved-bundle;stage=2;scope=backend;review=3 -->
- [ ] 같은 source/version/external key의 identical row와 conflicting row를 구분해 dedupe 또는 quarantine한다 <!-- omo:id=accept-duplicate-conflict-policy;stage=2;scope=backend;review=3 -->
- [ ] 직접 source와 통합표준 row의 identity를 합치지 않고 통합 row를 reconciliation evidence로만 연결한다 <!-- omo:id=accept-direct-source-priority;stage=2;scope=backend;review=3 -->
- [ ] 사용자 runtime 외부 호출, cron 자동 수집, 자동 production 승격 경로가 없다 <!-- omo:id=accept-operator-batch-only;stage=2;scope=backend;review=3 -->
- [ ] public endpoint/field와 `{ success, data, error }` API 계약이 변경되지 않는다 <!-- omo:id=accept-no-public-api-change;stage=2;scope=shared;review=3 -->

## Safe Batch / Retry / Rate Limit

- [ ] request별 15초 timeout이 적용되고 timeout은 bounded retry 대상이다 <!-- omo:id=accept-request-timeout;stage=2;scope=backend;review=3 -->
- [ ] retry는 timeout/network/408/429/5xx만 initial 포함 최대 4회 수행한다 <!-- omo:id=accept-retry-allowlist;stage=2;scope=backend;review=3 -->
- [ ] backoff가 1/2/4초이며 valid `Retry-After` 우선 + 30초 상한을 지킨다 <!-- omo:id=accept-backoff-policy;stage=2;scope=backend;review=3 -->
- [ ] non-retry 4xx, provider error, malformed payload, schema drift는 즉시 fail-closed다 <!-- omo:id=accept-nonretry-fail-closed;stage=2;scope=backend;review=3 -->
- [ ] total count, accumulated unique row count, page count, page identity가 모두 맞아야 batch가 complete다 <!-- omo:id=accept-pagination-accounting;stage=2;scope=backend;review=3 -->
- [ ] 빈 중간 page, duplicate page, total count drift, pagination 중단은 approved artifact를 만들지 않는다 <!-- omo:id=accept-pagination-failure-cases;stage=2;scope=backend;review=3 -->
- [ ] retry/backoff 테스트가 injected fetch/clock/sleep으로 실제 대기 없이 결정론적으로 실행된다 <!-- omo:id=accept-retry-deterministic-test;stage=2;scope=backend;review=3 -->

## Normalization / Data Integrity

- [ ] `source_version`은 public source에서 non-null이고 `data_basis_date` null 여부가 source evidence로 설명된다 <!-- omo:id=accept-version-basis-date;stage=2;scope=backend;review=3 -->
- [ ] manifest가 provider/dataset/sanitized URL/query/license/row count/sha256/adapter schema version을 가진다 <!-- omo:id=accept-manifest-required-fields;stage=2;scope=backend;review=3 -->
- [ ] raw checksum 불일치 또는 adapter schema mismatch가 normalization을 차단한다 <!-- omo:id=accept-checksum-schema-pin;stage=2;scope=backend;review=3 -->
- [ ] basis text parse 실패를 `100g`으로 추정하지 않고 quarantine/missing reason으로 남긴다 <!-- omo:id=accept-no-basis-guess;stage=2;scope=backend;review=3 -->
- [ ] 결측, 빈값, trace, 미검출을 0으로 바꾸지 않고 실제 source 숫자 0만 0으로 보존한다 <!-- omo:id=accept-missing-not-zero;stage=2;scope=backend;review=3 -->
- [ ] 음수 nutrient, 단위 불일치, malformed row, stable key 충돌이 격리된다 <!-- omo:id=accept-contamination-quarantine;stage=2;scope=backend;review=3 -->
- [ ] 모든 raw row가 normalized 또는 quarantined로 계상되어 `raw_count == normalized_count + quarantined_count`다 <!-- omo:id=accept-raw-row-loss-zero;stage=2;scope=backend;review=3 -->
- [ ] public attribution bundle item이 정확히 `provider/dataset/source_version/data_basis_date/license/source_url` 6 field만 가진다 <!-- omo:id=accept-source-attribution-six-fields;stage=2;scope=shared;review=3 -->
- [ ] public attribution에 key, auth query, raw fetch URL/response, internal storage path가 없다 <!-- omo:id=accept-public-attribution-redaction;stage=2;scope=shared;review=3 -->

## RDA Measurement / Licensing Boundary

- [ ] 계량 evidence가 source URL, 조회일, 재료/범주 식별, 원단위, 관측 g 또는 g/15mL를 가진다 <!-- omo:id=accept-rda-measurement-minimum-evidence;stage=2;scope=backend;review=3 -->
- [ ] evidence가 selected representative grade 후보, 오차, review result, 이용조건 evidence를 가진다 <!-- omo:id=accept-rda-grade-review-evidence;stage=2;scope=backend;review=3 -->
- [ ] 양념 계량표의 원문 표·문장·행/열 배치·페이지 이미지·전체 dataset을 복제하지 않는다 <!-- omo:id=accept-rda-no-republication;stage=2;scope=backend;review=3 -->
- [ ] 공공누리 표시가 확인되지 않은 페이지를 자유이용 가능으로 가정하지 않고 license disposition 결손을 차단한다 <!-- omo:id=accept-rda-license-fail-closed;stage=2;scope=backend;review=3 -->
- [ ] evidence 대상이 간장·식초·된장·고추장·꿀·올리브유/기름류 등 필요한 소량 subset으로 제한된다 <!-- omo:id=accept-rda-limited-subset;stage=2;scope=backend;review=3 -->
- [ ] 실제 2.5g threshold 승인/profile assignment/이름 기반 자동배정 판단을 만들지 않고 다음 slice로 넘긴다 <!-- omo:id=accept-rda-assignment-deferred;stage=2;scope=shared;review=3 -->

## Error / Permission

- [ ] MFDS live fetch에서 key가 없으면 secret 값을 echo하지 않는 machine-readable error와 non-zero exit를 반환한다 <!-- omo:id=accept-missing-key-error;stage=2;scope=backend;review=3 -->
- [ ] malformed/partial/timeout/429/schema/license 결손이 서로 구분되는 reason code와 non-zero exit를 반환한다 <!-- omo:id=accept-error-reason-codes;stage=2;scope=backend;review=3 -->
- [ ] browser/client import에서 operator adapter와 secret module을 참조할 수 없다 <!-- omo:id=accept-server-operator-boundary;stage=2;scope=backend;review=3 -->
- [ ] approved artifact와 raw snapshot은 checksum 변경 없이 read-only로 소비되며 수정 시 검증이 실패한다 <!-- omo:id=accept-artifact-read-only;stage=2;scope=backend;review=3 -->
- [ ] 내부 storage path와 raw provider response가 public API/DOM/client state에 도달하지 않는다 <!-- omo:id=accept-internal-path-raw-boundary;stage=2;scope=shared;review=3 -->

## Data Setup / Preconditions

- [ ] 정상 fake MFDS/RDA/통합표준/계량 evidence fixture가 준비된다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=backend;review=3 -->
- [ ] malformed/partial/duplicate/timeout/429/schema/license 결손 fixture가 준비된다 <!-- omo:id=accept-failure-fixture-baseline;stage=2;scope=backend;review=3 -->
- [ ] fixture가 실제 API key와 원문 계량표 전체/raw provider 전체 response를 포함하지 않는다 <!-- omo:id=accept-fixture-content-boundary;stage=2;scope=backend;review=3 -->
- [ ] DB table/seed/bootstrap 의존이 없고 real DB smoke N/A 근거가 실행 문서에 남는다 <!-- omo:id=accept-real-db-na;stage=2;scope=shared;review=3 -->
- [ ] MFDS live smoke 전 활용신청/secret 준비 여부를 preflight하고 미준비를 deterministic gate 실패로 오인하지 않는다 <!-- omo:id=accept-live-smoke-preflight;stage=2;scope=backend;review=3 -->

## Handoff Gate

- [ ] approved manifest와 normalized item/value bundle의 checksum이 서로 참조된다 <!-- omo:id=accept-handoff-checksum-links;stage=2;scope=shared;review=3 -->
- [ ] quarantine/review report가 malformed/partial/duplicate/conflict/schema/license count를 제공한다 <!-- omo:id=accept-handoff-review-report;stage=2;scope=shared;review=3 -->
- [ ] source attribution 6-field bundle과 제한 measurement evidence가 handoff에 포함된다 <!-- omo:id=accept-handoff-attribution-measurement;stage=2;scope=shared;review=3 -->
- [ ] blocker 0, unapproved row 0, secret exposure 0, production DB write 0일 때만 handoff가 pass다 <!-- omo:id=accept-handoff-zero-gate;stage=2;scope=shared;review=3 -->
- [ ] 다음 slice가 source/version/license/provenance를 재추론하지 않고 pinned bundle을 읽을 수 있다 <!-- omo:id=accept-next-slice-consumable;stage=2;scope=shared;review=3 -->

## Stage 1.5 Independent Codex Reviewer Checklist

Stage 1 작성자는 아래 판정을 직접 approve하지 않는다. 별도 Codex 앱 reviewer가 각 행을 `PASS / REQUIRED_FIX / BLOCKER / N/A`로 기록한다.

| 검토 항목 | 통과 기준 |
| --- | --- |
| 공식 계약 정합성 | 공식 5종 v1.7.14/v1.5.21/v1.3.20/v1.3.17/v1.2.22 및 PR #992와 충돌 0 |
| slice 경계 | file/artifact acquisition까지만 포함하고 DB/profile/assignment/recipe/product/UI가 제외됨 |
| source 우선순위 | RDA 10.4 -> MFDS 15127578 -> 통합표준 -> 제한 계량 evidence 역할이 구분됨 |
| RDA 10.0 정확성 | 15143598을 deprecated라 하지 않고 활성 10.0/KOGL4이라 기본 경로 제외로 표현함 |
| 활용신청/key | 필수 신청은 MFDS 15127578 하나, exact env는 `DATA_GO_KR_API_KEY`, 실제 key 문자열 0 |
| batch 안전성 | timeout/retry/backoff/429/pagination/idempotency/부분 실패 경계가 testable하게 잠김 |
| 영양 schema | 핵심 5종 단위, 결측≠0, basis parse, raw row accounting, conflict quarantine가 잠김 |
| provenance/license | manifest/checksum/version/date/license와 public attribution 6 field가 분리됨 |
| 계량자료 경계 | 소량 사실 evidence만 허용하고 원문 복제 금지, assignment/2.5g 판단은 다음 slice 소유 |
| N/A 근거 | FE/Design/Accessibility/Playwright/real DB smoke가 왜 N/A인지 구체적임 |
| automation 추적 | automation-spec/work-item/status required checks와 blocked conditions가 서로 일치함 |
| handoff | 다음 slice 필수 artifact와 pass/fail gate가 누락 없이 명시됨 |
| 역할 분리 | Stage 1 작성자가 self-approve하지 않고 별도 reviewer/repair-final owner가 필요함 |

필수 finding이 하나라도 있으면 docs PR을 Ready/merge로 전환하지 않는다. 공식 문서 변경이 필요한 충돌이면 이 PR에서 임의 보정하지 않고 `contract-evolution` blocker로 오케스트레이터에게 반환한다.

## Manual QA

- verifier: Stage 2 owner와 다른 독립 Codex Stage 3 reviewer
- environment: local fake fixtures + 활용신청 완료 시 operator-only live MFDS smoke
- scenarios:
  - 정상 multi-page 수집과 manifest/hash/count 확인
  - timeout/429/Retry-After/retry 소진과 partial promotion 0 확인
  - actual key/auth query/log/manifest/fixture/client exposure 0 확인
  - RDA 10.4/양념 evidence의 version/license/제한 사실 경계 확인
  - 동일 input/decision 재실행 hash 동일, production DB write 0 확인

## Automation Split

### Vitest / Node

- [ ] core normalize/review/promote 함수의 정상/결측/중복/오염/idempotency가 단위 테스트로 고정된다 <!-- omo:id=accept-vitest-core-policy;stage=2;scope=backend;review=3 -->
- [ ] CLI fetch/pagination/timeout/retry/backoff/rate-limit/redaction이 injected fetch/clock으로 고정된다 <!-- omo:id=accept-vitest-cli-network;stage=2;scope=backend;review=3 -->
- [ ] source schema 6 field와 RDA limited evidence/license validator가 고정된다 <!-- omo:id=accept-vitest-source-license-schema;stage=2;scope=shared;review=3 -->
- [ ] `pnpm verify:backend`와 workpack/workflow/automation validators가 통과한다 <!-- omo:id=accept-deterministic-gates;stage=2;scope=shared;review=3 -->

### Playwright

- N/A — 사용자 화면/route/browser action이 없고 client에 외부 source adapter를 노출하지 않는다.

### Manual Only

- [ ] 공공데이터포털 계정 생성과 MFDS `15127578` 활용신청 승인 상태
- [ ] 실제 operator secret을 사용한 MFDS 최소 live page smoke와 현재 provider schema/traffic 확인
- [ ] RDA 10.4 Excel/검색의 현재 version·공공누리 제1유형 출처 evidence 확인
- [ ] 양념 계량표의 공공누리 표시 여부/저작권정책에 따른 제한 이용 disposition 사람 검수
