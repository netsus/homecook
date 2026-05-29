# Slice: 28-external-ingredient-data-ingest-gate

## Goal

식약처, 농식품올바로 등 외부 재료 데이터를 운영 `ingredients`로 바로 넣지 않고, 파일 기반 batch import -> staging -> deterministic normalization -> review -> approved seed promotion 경로로만 들여오는 안전장치를 만든다. 이 슬라이스는 한국인이 자주 쓰는 재료/동의어를 넓히기 위한 후속 기반이며, public API shape, legacy 7 ingredient category 계약, YouTube import 계약을 깨지 않는다.

## Branches

- 문서: `docs/28-external-ingredient-data-ingest-gate`
- 백엔드/데이터 툴링: `feature/be-28-external-ingredient-data-ingest-gate`
- 프론트엔드: N/A (관리자/검수 UI는 후속 slice 후보)

## In Scope

- 외부 데이터 1차 실행 형태: API key 기반 live fetch가 아니라 파일 export/import 기반 batch seed review
- 데이터 소스: 식약처, 농식품올바로, 기타 공개/승인된 재료명 데이터 export 파일
- 입력: CSV/JSON/TSV 같은 로컬 파일 fixture 또는 sample export
- 처리: 원문 row 보존, deterministic normalization, duplicate 후보 탐지, legacy 7 category 후보 추론, synonym 후보 생성
- 검수: `pending_review`, `approved`, `rejected`, `needs_source_check` 같은 review status gate
- 산출: seed promotion 전 candidate report와 approved-only promotion artifact
- DB 영향: Stage 2에서 staging table 또는 file-backed staging artifact 중 하나를 구현하되, production `ingredients` / `ingredient_synonyms` 자동 삽입 금지
- API 영향: public API endpoint/response 변경 없음
- UI 영향: 없음

## Out of Scope

- 외부 데이터를 운영 `ingredients` / `ingredient_synonyms`에 자동 직적재
- API key를 사용하는 live fetch를 기본 CI/Stage 2 경로로 채택
- LLM/model 기반 재료명 정규화 또는 카테고리 추론
- legacy 7 ingredient category 확장 또는 replacement
- `ingredient_categories` public registry/FK cutover
- `GET /ingredients`에 `category_code`, `category_label`, `legacy_category_label` 같은 additive field 노출
- `GET /cooking-methods` 응답 확장
- 조리방법 taxonomy/category UI 노출
- 관리자 review UI
- 대량 운영 ingest 스케줄러
- 외부 데이터 라이선스/이용 약관 검토 자동화

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `pre-27-taxonomy-consumer-alignment` | merged | [x] |
| `27-youtube-import-quality-uplift` | merged | [x] |

> slice27은 import readiness `0.9632`로 merged 됐다. 다음 병목은 parser 품질이 아니라 재료/동의어 후보를 안전하게 넓히는 데이터 유입 경로다.

## Backend First Contract

### Execution Mode

- 기본 실행은 file export/import 기반 batch이다.
- Stage 2는 네트워크 호출, 외부 API key, live provider 의존 없이 로컬 fixture/sample export로 검증 가능해야 한다.
- live provider fetch는 후속 slice 또는 Manual Only smoke 후보로만 남긴다.

### Public Contract

- 신규 public endpoint 없음
- 기존 public API response shape 변경 없음
- `{ success, data, error }` envelope 원칙 유지
- `ingredients.category`는 legacy 7종 label 계약 유지: `채소`, `육류`, `해산물`, `양념`, `유제품`, `곡류`, `기타`
- YouTube ingredient registration category validation은 기존 shared source 기준 유지

### Data Boundary

외부 source row는 다음 단계를 통과하기 전까지 canonical ingredient가 아니다.

1. raw source row 보존
2. deterministic normalization
3. duplicate/synonym/category 후보 산출
4. 사람이 review status를 승인
5. approved-only seed promotion artifact 생성
6. 별도 승인된 seed migration 또는 controlled import script에서만 production 반영

## Data Ingest Gate Contract

Stage 2 구현은 다음 중 하나를 선택한다.

### Option A: File-backed staging artifact

- `data/external-ingredients/` 또는 `tests/fixtures/external-ingredients/` 아래 sample input/output fixture를 둔다.
- CLI/test helper가 raw input -> normalized candidates -> report artifact를 생성한다.
- DB DDL 없이 시작할 수 있어 Stage 2 blast radius가 가장 작다.
- 현재 키 없는 실행 명령은 다음과 같다:

```bash
pnpm external:ingredients:dry-run -- --input tests/fixtures/external-ingredient-ingest/real-source-sample-2026-05-29.json --output-dir .artifacts/external-ingredient-ingest/keyless-real-source-sample-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z
```

이 명령은 `candidate-report.json`, `approved-seed-promotion-artifact.json`, `summary.md`만 생성하며 네트워크 호출, API key 읽기, production DB write를 하지 않는다.

Live provider fetch smoke는 다음 명령으로 실행한다:

```bash
pnpm external:ingredients:live-fetch -- --providers mfds,rda --output-dir .artifacts/external-ingredient-ingest/live-public-data-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z --rda-groups A --mfds-rows 5 --rda-page-size 5
```

이 명령은 `.env.local`의 `DATA_GO_KR_API_KEY`를 읽고, RDA 전용 키가 없으면 RDA 공공데이터포털 API에도 같은 key를 fallback으로 사용한다. 결과는 `live-fetch-report.json`, `live-source-export.json`, `live-fetch-summary.md`에 남기며 production DB write는 하지 않는다.

검수 후 seed promotion artifact를 만들 때는 먼저 `candidate-report.json`에서 승인할 `source_fingerprint`를 고른 뒤 review decision 파일을 만든다:

```json
{
  "decisions": [
    {
      "source_fingerprint": "candidate-report에서 복사한 fingerprint",
      "status": "approved"
    }
  ]
}
```

그리고 같은 source export 파일에 review decision을 적용해 다시 dry-run 한다:

```bash
pnpm external:ingredients:dry-run -- --input .artifacts/external-ingredient-ingest/live-public-data-balanced-sample-2026-05-29/live-source-export.json --review-decisions path/to/review-decisions.json --output-dir .artifacts/external-ingredient-ingest/reviewed-seed-candidates-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z
```

`approved`로 검수된 fingerprint만 `approved-seed-promotion-artifact.json`의 `seed_rows`에 들어간다. source license가 미확인됐거나 원문명이 비어 있는 row는 review decision이 있어도 승인 seed로 승격되지 않는다.

초기 보수 승인 목록은 `docs/workpacks/28-external-ingredient-data-ingest-gate/review-decisions-initial-rda-core-2026-05-29.json`에 둔다. 이 목록은 대부분 RDA source만 대상으로, 같은 normalized name에서 하나의 fingerprint만 골랐고, MFDS의 넓은 가공식품 분류명은 제외했다. 사용자 명시 승인으로 MFDS `햄` 1개와 RDA `땅콩 버터` 1개를 추가했으며, `다시마 육수`는 요청명 `다시마`와 달라 seed 승격에서 보류했다.

첫 seed promotion migration은 `supabase/migrations/20260530001000_28_external_ingredient_seed_promotion.sql`이다. 승인 artifact 18개 중 기존 seed migration에 이미 있는 row와 보류 row를 제외하고, missing ingredient 12개만 `on conflict (standard_name) do nothing`으로 추가한다. 기존 category/default_unit은 덮어쓰지 않는다.

### Option B: DB staging table

- 예: `external_ingredient_import_batches`, `external_ingredient_import_rows`
- raw payload, normalized candidate, review status, source metadata, duplicate/synonym candidates를 보존한다.
- 이 선택을 하면 Stage 2는 DB migration, rollback safety, RLS/ownership 또는 service-only boundary, `docs/db설계` 영향 기록을 반드시 포함한다.

권장: Stage 2 첫 구현은 Option A로 시작하고, 실제 sample volume과 review workflow 증거가 생긴 뒤 Option B를 재평가한다.

## External Source Policy

- source system과 source file/version/date를 기록한다.
- row마다 source id 또는 stable row fingerprint를 저장한다.
- brand, region, prep variation은 canonical ingredient로 자동 승격하지 않는다.
- 동일 원문명이 여러 source에 존재해도 자동 merge하지 않는다.
- 라이선스/이용 조건이 불명확한 source는 `needs_source_check`로 차단한다.

## Normalization / Review / Seed Promotion Rules

- normalization은 deterministic string rules와 기존 shared ingredient category helper만 사용한다.
- `normalized_name`이 비어 있거나 지나치게 일반적인 경우 `rejected` 또는 `needs_review` 후보로 둔다.
- duplicate detection은 exact normalized name, whitespace/punctuation folding, known synonym match를 분리해 보고한다.
- legacy category candidate는 confidence/reason code와 함께 기록하고, low-confidence는 review를 요구한다.
- synonym candidate는 canonical ingredient가 승인된 뒤에만 seed promotion 대상으로 포함한다.
- approved row만 seed artifact에 포함한다.
- promotion artifact는 idempotent해야 한다. 같은 source fingerprint를 재실행해도 중복 seed를 만들지 않아야 한다.

## Error Cases / Blocked Conditions

| 상황 | 기대 처리 |
| --- | --- |
| 파일 포맷 불일치 | row-level 또는 file-level validation error report |
| 필수 source metadata 없음 | import 차단 |
| 원문 재료명 없음 | row rejected |
| legacy 7 category 후보 없음 | pending review |
| duplicate 후보 충돌 | pending review, 자동 승격 금지 |
| source 이용 조건 미확인 | needs_source_check |
| seed artifact 중복 생성 | idempotency guard로 skip |

## Frontend Delivery Mode

- Stage 4: N/A
- 사용자-facing UI 없음
- 관리자/검수 UI는 후속 slice 후보
- PR에는 review report artifact 또는 fixture output을 근거로 남긴다.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: BE/data-tooling only. 신규 화면이나 레이아웃 변경 없음.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE/data-tooling only

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.1.md`
- `docs/화면정의서-v1.5.8.md`
- `docs/유저flow맵-v1.3.8.md`
- `docs/db설계-v1.3.7.md`
- `docs/api문서-v1.2.11.md`
- `.omx/plans/ingredient-cooking-taxonomy-ralplan-final-20260525.md`
- `.omx/plans/ingredient-cooking-taxonomy-expansion-20260525.md`
- `.omx/plans/open-questions.md`
- `docs/workpacks/pre-27-taxonomy-consumer-alignment/README.md`
- `docs/workpacks/27-youtube-import-quality-uplift/README.md`
- `https://www.data.go.kr/data/15100066/standard.do`
- `https://www.data.go.kr/data/15143598/openapi.do`
- `https://www.data.go.kr/ugs/selectPortalPolicyView.do`
- `https://koreanfood.rda.go.kr/kfi/fct/fctFoodSrch/list`
- `https://koreanfood.rda.go.kr/kfi/openapi/useGuidance`
- `docs/workpacks/28-external-ingredient-data-ingest-gate/live-fetch-public-data-2026-05-29.md`
- `docs/workpacks/28-external-ingredient-data-ingest-gate/live-fetch-balanced-sample-2026-05-29.md`
- `docs/workpacks/28-external-ingredient-data-ingest-gate/review-decisions-initial-rda-core-2026-05-29.json`
- `docs/workpacks/28-external-ingredient-data-ingest-gate/real-source-sample-review-2026-05-29.md`

## Contract Evolution Required Before Stage 2

Stage 2가 DB staging table을 선택하면 `docs/db설계` 영향 기록이 필요하다. Stage 2가 file-backed staging artifact로 시작하면 공식 DB/API 문서 변경 없이 구현 가능하다. 이 Stage 1의 권장 경로는 file-backed first이므로 즉시 공식 source-of-truth 버전 갱신은 요구하지 않는다.

## QA / Test Data Plan

- sample input fixture: 식약처/농식품올바로 형태를 모사한 소량 CSV/JSON
- real source sample fixture: 공공데이터포털 식약처 sample row + 농식품올바로 국가표준식품성분표 search row
- normalized candidate fixture: deterministic expected output
- duplicate fixture: 같은 normalized name, synonym candidate, source collision 포함
- invalid fixture: 필수 metadata 누락, empty ingredient name, unknown category
- report fixture: row counts, approved/rejected/pending counts, duplicate count, low-confidence count
- real external source export/live fetch는 Manual Only로 분리하고 기본 CI에 넣지 않는다.

## Key Rules

1. 운영 `ingredients` / `ingredient_synonyms` 자동 직적재 금지
2. file batch first, live API fetch later
3. raw row 보존
4. deterministic normalization only
5. LLM/model normalization 금지
6. legacy 7 category compatibility 유지
7. review status 승인 전 seed promotion 금지
8. approved-only promotion artifact
9. idempotent rerun
10. public API shape 변경 금지
11. source 이용 조건 미확인 데이터 차단

## Contract Evolution Candidates

| # | 현재 계약 | 제안 계약 | 기대 가치 | 승인 상태 |
| --- | --- | --- | --- | --- |
| CE-1 | `GET /ingredients`는 legacy `category` label만 노출 | `category_code/category_label/legacy_category_label` additive 노출 | label 변동과 internal taxonomy 분리 | 미승인 |
| CE-2 | `ingredient_categories` DB registry 없음 | registry table + FK cutover | 대규모 ingest 후 category governance 강화 | 미승인 |
| CE-3 | review UI 없음 | 관리자 external ingest review UI | seed 승인 UX 개선 | 미승인 |
| CE-4 | live fetch 없음 | provider별 API key fetch job | 최신 source 동기화 | 미승인 |

## Primary Operator Path

1. 운영자가 외부 source export 파일을 준비한다.
2. Stage 2 tooling이 파일 format/source metadata를 검증한다.
3. raw rows를 보존하고 normalized candidate report를 만든다.
4. duplicate/category/synonym 후보를 사람이 review한다.
5. approved row만 seed promotion artifact에 들어간다.
6. 별도 승인된 seed migration 또는 controlled import script가 production 반영을 수행한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 갱신하는 living closeout 문서다.

- [x] file-based batch import 실행 형태 확정 <!-- omo:id=delivery-file-batch-first;stage=2;scope=backend;review=3,6 -->
- [x] sample external source fixture 추가 <!-- omo:id=delivery-source-fixture;stage=2;scope=backend;review=3,6 -->
- [x] raw row preservation 구조 구현 <!-- omo:id=delivery-raw-row-preservation;stage=2;scope=backend;review=3,6 -->
- [x] deterministic normalization helper 구현 <!-- omo:id=delivery-normalization-helper;stage=2;scope=backend;review=3,6 -->
- [x] duplicate/synonym/category candidate 생성 <!-- omo:id=delivery-candidate-generation;stage=2;scope=backend;review=3,6 -->
- [x] review status gate 구현 <!-- omo:id=delivery-review-status-gate;stage=2;scope=backend;review=3,6 -->
- [x] approved-only seed promotion artifact 생성 <!-- omo:id=delivery-approved-seed-artifact;stage=2;scope=backend;review=3,6 -->
- [x] idempotent rerun guard 구현 <!-- omo:id=delivery-idempotency-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid source row report 구현 <!-- omo:id=delivery-invalid-row-report;stage=2;scope=backend;review=3,6 -->
- [x] public API shape unchanged 검증 <!-- omo:id=delivery-api-shape-unchanged;stage=2;scope=backend;review=3,6 -->
- [x] no production direct-load test 추가 <!-- omo:id=delivery-no-direct-load-test;stage=2;scope=backend;review=3,6 -->
- [x] keyless file dry-run CLI 추가 <!-- omo:id=delivery-keyless-file-dry-run-cli;stage=2;scope=backend;review=6 -->
- [x] public data portal live fetch smoke CLI 추가 <!-- omo:id=delivery-public-data-live-fetch-cli;stage=2;scope=backend;review=6 -->
- [x] 식약처/RDA balanced live sample 후보 품질 기록 <!-- omo:id=delivery-balanced-live-sample-review;stage=2;scope=backend;review=6 -->
- [x] review decision 기반 approved-only seed artifact 입력 경로 추가 <!-- omo:id=delivery-review-decision-input;stage=2;scope=backend;review=6 -->
- [x] 초기 core 후보 18개 보수 승인 artifact 생성 <!-- omo:id=delivery-initial-rda-core-review-decisions;stage=2;scope=backend;review=6 -->
- [x] 첫 approved seed promotion migration 작성 <!-- omo:id=delivery-first-seed-promotion-migration;stage=2;scope=backend;review=6 -->
- [x] Stage 3 backend/data-tooling review 완료 <!-- omo:id=delivery-stage3-review;stage=2;scope=backend;review=6 -->
- [x] 실제 source sample fixture와 manual candidate review 기록 추가 <!-- omo:id=delivery-real-source-sample-review;stage=2;scope=backend;review=6 -->
