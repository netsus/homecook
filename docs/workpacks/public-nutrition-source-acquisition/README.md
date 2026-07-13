# Slice: public-nutrition-source-acquisition

## Goal

공공 영양 원본을 사용자 요청 시점에 호출하거나 곧바로 production에 넣지 않고, 운영자 batch에서 versioned raw snapshot과 manifest로 고정한 뒤 deterministic normalization·검수·승인 입력으로 만든다. 사용자는 다음 슬라이스부터 출처·버전·이용조건이 확인되고 결측을 0으로 오염시키지 않은 영양 데이터만 계산과 catalog에 반영되는 안전성을 얻게 된다.

이 슬라이스의 종료점은 DB profile 생성이 아니라 `ingredient-nutrition-conversion-model`이 소비할 approved/pinned handoff bundle이다. 실제 profile/대표 환산 assignment와 production DB write는 다음 슬라이스가 소유한다.

## Branches

- 문서: `docs/public-nutrition-source-acquisition`
- 백엔드/데이터 툴링: `feature/be-public-nutrition-source-acquisition`
- 프론트엔드: N/A — 사용자 화면, route, client fetch가 없는 운영자용 데이터 취득 기반 slice

## In Scope

- 화면: 없음
- public API: 신규 endpoint/field/response 없음
- 운영자 명령 계약:
  - `pnpm external:nutrition:fetch` — provider별 raw snapshot + manifest 생성
  - `pnpm external:nutrition:normalize` — staged row를 공통 source item/nutrient shape로 정규화
  - `pnpm external:nutrition:review` — schema·pagination·기준량·중복·오염·license·delta report 생성
  - `pnpm external:nutrition:promote` — review가 승인한 row만 다음 slice용 approved/pinned input으로 생성
- artifact 상태: `raw -> staged -> normalized -> reviewed -> approved_pinned`; 실패 batch는 `failed/quarantined`로 남고 `approved_pinned`으로 부분 승격하지 않음
- source manifest, row provenance, license evidence, checksum, `source_version`, `data_basis_date`, 수집/검수 count 고정
- 핵심 영양 5종 deterministic mapping과 단위 고정
- 안전한 pagination, timeout, retry/backoff, rate-limit 처리, 재실행 멱등성, 부분 실패 격리
- 농촌진흥청 양념 계량표의 필요한 소량 관측 사실을 대표 등급 검수 evidence 후보로 제한 보존
- DB 영향: 없음. 이 slice는 file/artifact-backed handoff만 만들고 `nutrition_*`/환산 table에 쓰지 않음
- Schema Change:
  - [x] 없음 — migration과 production DB write는 다음 `ingredient-nutrition-conversion-model` 소유
  - [ ] 있음

## Out of Scope

- 제품 코드, 화면, route, client component, Playwright 사용자 흐름
- DB migration 또는 `nutrition_sources`, `nutrition_source_items`, `nutrition_profiles`, `nutrition_values` 직접 INSERT
- `measurement_conversion_profiles`, `ingredient_conversion_assignments`, `piece_unit_weights` 생성 또는 승인
- 관측값과 대표값의 `2.5g/15mL` threshold 판정, 실제 profile assignment, 재료명만으로 자동 등급 배정
- 레시피 영양 계산/snapshot, RECIPE_DETAIL 표시, 완제품 catalog, planner entry/합계
- 사용자 요청 시 외부 provider runtime 호출, cron 자동 수집, 자동 production 승격
- 원문 양념 계량표·문장·행/열 배치·페이지 이미지·전체 dataset 복제 또는 재배포
- 활성 RDA `국가표준식품성분DB` OpenAPI `15143598`의 기본 경로 사용

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `28-external-ingredient-data-ingest-gate` | merged | [x] |
| nutrition contract-evolution 공식 5종 | merged in PR #992 / `046eb7fd7f207149ff1eb0c6a98a9830cac62efb` | [x] |
| 사용자 승인 확장 계획 | approved 2026-07-13 | [x] |

> 기존 slice 28의 file-backed staging, stable fingerprint, approved-only artifact, production write 0 패턴을 재사용한다. 이름용 adapter와 영양용 adapter는 분리하며, 기존 이름 adapter의 category inference를 영양값 정규화 근거로 재사용하지 않는다.

## Public Source Priority And Role

| 우선순위 | source | 이번 slice의 취득/검수 역할 | key/신청 | promotion 경계 |
| --- | --- | --- | --- | --- |
| 1 | 농촌진흥청 `국가표준식품성분 DB 10.4(2026)` Excel/검색 | 농·축산 원재료 영양의 우선 source. versioned file batch와 검색 검수 | key 없음, 활용신청 없음 | Excel의 공공누리 제1유형과 출처표시 evidence가 확인된 snapshot만 후보 |
| 2 | 식약처 `식품영양성분DB정보` OpenAPI `15127578` | 가공식품·완제품 영양, 기준량, 식품중량, 품목제조보고번호, 업체명 취득 | 공공데이터포털 계정 + 별도 활용신청 필수, `DATA_GO_KR_API_KEY` | complete pagination + schema/license review가 끝난 batch만 후보 |
| 3 | `전국통합식품영양성분정보표준데이터` `15100064` | 원재료·수산물·가공식품 누락 탐색과 source 간 reconciliation | 초기 file download는 key 없음; API 자동 대조 시 별도 활용신청 | 원기관 partition을 보존하고 직접 source보다 낮은 우선순위로만 연결 |
| 4 | 농촌진흥청 양념재료 계량표/영양가 계산 | 간장·식초·된장·고추장·꿀·참기름 등 실제 관측·이용조건 evidence가 확인된 항목의 대표 `VOLUME_G6/G10/G15/G20/G25` 검수용 소량 관측 evidence | key 없음, 웹/검색 수동 검수 | 원문 복제 없이 제한된 사실 evidence만 다음 slice에 전달. 올리브유·기타 기름류는 별도 실제 관측 evidence 확보 전 후보/승인 금지 |

### 기본 경로에서 제외하는 활성 RDA 10.0 OpenAPI

- `https://www.data.go.kr/data/15143598/openapi.do`는 2026-07-13 확인 시점에도 활용신청 가능한 활성 REST/XML OpenAPI다.
- 그러나 제공 데이터는 국가표준식품성분 `10.0` 기반이며 현재 기준 `10.4`와 다르고, 이용허락은 공공누리 제4유형(출처표시·상업적 이용금지·변경금지)이다.
- 따라서 이를 deprecated라고 부르지 않는다. 활성이나 10.0 기반의 구버전 데이터이고 이용조건도 기본 production normalization 경로와 맞지 않으므로 이번 primary source에 섞지 않는다.
- 이번 필수 활용신청 대상이 아니다. 향후 보조 검증/대체 경로로 실제 호출하기로 별도 결정할 때만 활용신청, version 차이, 상업 이용·변경금지 조건을 다시 검토한다.

## API Key / Use Application Checklist

- [ ] 공공데이터포털 계정을 준비한다.
- [ ] 식약처 `식품영양성분DB정보` OpenAPI `15127578` 개발계정 활용신청을 완료한다.
- [ ] 발급 key는 server/operator secret `DATA_GO_KR_API_KEY` 하나에만 저장한다.
- [ ] 실제 key는 문서, repository, client/browser bundle, test fixture/snapshot, log, error, response, manifest, persisted query string에 넣지 않는다.
- [ ] provider가 `serviceKey` query parameter를 요구하면 send boundary에서만 주입하고, 기록되는 URL/query에서는 인증 parameter를 제거하거나 `[REDACTED]`로 바꾼다.
- [ ] fixture는 실제 key와 구분되는 명시적 fake token만 사용하고 secret scanner가 실제 key 0건을 확인한다.
- [ ] 농진청 10.4 Excel/검색과 양념 계량표는 key 없는 취득·검수 source로 유지한다.
- [ ] RDA 10.0 OpenAPI `15143598`은 기본 경로에서 신청/호출하지 않는다.

## Backend First Contract

### Public Contract

- 신규 public endpoint와 응답 field는 없다.
- 기존 `{ success, data, error }` / `{ code, message, fields[] }` API 계약은 변경하지 않는다.
- 실제 key, 인증 query, raw provider response, 내부 artifact/storage path는 public API, DOM, client state에 노출하지 않는다.
- 후속 API가 사용할 source attribution은 정확히 아래 6개 field만 가진다.

```json
{
  "provider": "식품의약품안전처",
  "dataset": "식품영양성분DB정보",
  "source_version": "pinned-source-version",
  "data_basis_date": null,
  "license": "verified-source-specific-terms",
  "source_url": "https://www.data.go.kr/data/15127578/openapi.do"
}
```

`source_version`은 public source에서 non-null이며 approved manifest의 값을 그대로 pin한다. `data_basis_date`는 source가 별도 기준일을 제공하지 않을 때만 null이다.

### Command Input / Output

| 명령 | 최소 입력 | 성공 산출물 | 실패 조건 |
| --- | --- | --- | --- |
| `external:nutrition:fetch` | source id, sanitized official URL 또는 input file, `source_version`, optional `data_basis_date`, license evidence, output dir | immutable raw snapshot/file + `manifest.json` | key 없음(MFDS), timeout/retry 소진, 429/5xx 소진, pagination 불일치, schema drift, license evidence 없음 |
| `external:nutrition:normalize` | complete raw manifest + adapter schema version | `staged-rows.jsonl`, `normalized-rows.jsonl`, quarantine report | checksum 불일치, basis/단위 parse 실패 미격리, core nutrient mapping 불명확, raw row 미계상 |
| `external:nutrition:review` | normalized rows + current approved manifest + review decisions | delta/duplicate/conflict/license report | 중복 충돌 미격리, source version/license 결손, 승인 decision 불일치 |
| `external:nutrition:promote` | blocker 0 review report + explicit approved decisions | `approved-promotion-input.json`, public source attribution bundle, handoff checksum | 승인되지 않은 row 포함, failed/partial batch, secret/auth query/raw path 노출, production DB write 시도 |

모든 명령은 machine-readable summary와 non-zero exit code를 제공한다. 실패 batch가 이미 받은 raw page를 진단 evidence로 남길 수는 있으나, 그 partial artifact는 normalize/review/promote의 valid input이 아니다.

### Manifest Contract

`manifest.json`은 최소 아래 값을 고정한다.

- `provider`, `dataset`, sanitized `endpoint_or_file_url`
- `source_version`(필수), `data_basis_date`(source가 제공하지 않으면 null), `fetched_at`
- 인증 parameter가 제거된 `query`
- source별 `license`, `license_url`, `license_evidence_url`, `license_verified_at`
- `fetched_raw_count`, `unique_input_count`, `normalized_count`, `deduplicated_identical_count`, `quarantined_count`
- raw payload/file `sha256`, `adapter_schema_version`
- pagination이면 provider reported total, accumulated `fetched_raw_count`, page count, page identity checksum
- batch status와 failed/quarantined reason count

같은 provider/dataset/source_version/raw checksum/adapter schema version은 같은 logical batch id, row-accounting count tuple, normalized content hash를 만든다. `fetched_at` 또는 output path는 content identity에 포함하지 않는다.

### Safe Batch And Retry Contract

- network request timeout 기본값은 15초다.
- timeout/network error/HTTP `408`, `429`, `5xx`만 재시도하며 initial request 포함 최대 4회다.
- 기본 backoff는 1초, 2초, 4초의 bounded exponential 순서다. 유효한 `Retry-After`가 있으면 이를 우선하되 30초 상한을 둔다.
- 다른 `4xx`, provider error payload, malformed JSON/XML, schema drift는 즉시 fail-closed다.
- 테스트는 clock/sleep/fetch를 주입해 backoff와 timeout을 실제 대기 없이 결정론적으로 검증한다.
- pagination completeness는 `provider reported total count == accumulated fetched_raw_count`로 판정한다. 같은 page identity 또는 page token 반복은 pagination loop 오류로 batch 전체를 실패/quarantine하며, 아래의 정상적인 identical row dedupe와 구분한다. 빈 중간 page, total count 변경, external item key 충돌도 batch 전체를 차단한다.
- key rotation으로 quota를 우회하지 않는다. 이 pipeline은 정확히 `DATA_GO_KR_API_KEY` 하나만 사용하며 429 소진 시 중단한다.

### Normalization Contract

| internal code | unit | source mapping rule |
| --- | --- | --- |
| `energy_kcal` | `kcal` | 열량/에너지 source field를 기준량당 kcal로 보존 |
| `carbohydrate_g` | `g` | 탄수화물 source field를 기준량당 g으로 보존 |
| `protein_g` | `g` | 단백질 source field를 기준량당 g으로 보존 |
| `fat_g` | `g` | 지방 source field를 기준량당 g으로 보존 |
| `sodium_mg` | `mg` | 나트륨 source field를 기준량당 mg으로 보존 |

- `sugars_g`, `saturated_fat_g`, `fiber_g`는 source 값이 있을 때만 optional row로 보존한다.
- 기준량 text를 `basis_amount + basis_unit`으로 parse하고 원문을 provenance에 제한 보존한다. parse 실패를 `100g`으로 추정하지 않는다.
- `-`, trace, 미검출, 빈값, field 부재는 서로 구분한 missing reason이며 0으로 정규화하지 않는다. 실제 source 숫자 0만 값 0이다.
- row accounting은 `fetched_raw_count = unique_input_count + deduplicated_identical_count`, `unique_input_count = normalized_count + quarantined_count`로 고정한다. 따라서 `fetched_raw_count = normalized_count + quarantined_count + deduplicated_identical_count`가 handoff gate다.
- 동일 source/version/business key와 checksum이 모두 같은 row만 fingerprint로 dedupe하고 `deduplicated_identical_count`에 집계한다. 같은 business key의 내용/checksum이 다른 conflicting duplicate는 dedupe하지 않고 `quarantined_count`에 집계하며, 음수값·단위 불일치·malformed row도 격리한다.
- 직접 source와 통합표준 source는 identity를 합치지 않는다. 직접 source를 우선하고 통합 row는 reconciliation provenance로만 연결한다.

### Review, Idempotency, And Write Boundary

- review status는 `pending / approved / rejected / needs_review / needs_source_check`를 구분한다.
- explicit approved decision과 blocker 0인 source/row만 promotion input에 들어간다.
- 동일 input/decision 재실행은 같은 row ordering, fingerprint, row-accounting count tuple, raw/normalized checksum, approved item set을 만든다.
- 이미 생성된 approved/pinned artifact를 append 또는 overwrite하지 않는다. source/version/값 변경은 새 immutable candidate bundle을 만든다.
- 이 slice의 모든 실행 summary는 `production_db_writes: 0`을 증명해야 한다.

## RDA Measurement Evidence Boundary

- 공개 페이지라는 이유만으로 저작권이 사라지거나 자유 재배포가 가능하다고 단정하지 않는다.
- 계량표 페이지에 공공누리 제1유형 표시가 확인되지 않으면 국립식량과학원 저작권정책에 따라 원문 이용은 fail-closed로 보고, 이용조건 evidence와 제한된 사실 관측만 남긴다.
- 원문 표·문장·행/열 배치·페이지 이미지·전체 dataset, 대량 scraping 결과를 repository/artifact/API로 복제하지 않는다.
- 간장·식초·된장·고추장·꿀·참기름 등 실제 관측값과 이용조건 evidence가 확보된 MVP 소량 항목만 대표 등급 후보로 검수한다. 올리브유·기타 기름류는 별도 실제 관측 evidence를 확보하기 전 자동 후보 또는 승인 대상으로 삼지 않는다.
- 한 evidence row는 최소 아래 값을 가진다.
  - `source_url`, `accessed_at`, `ingredient_or_category_id`
  - `source_observed_unit`, `observed_g` 또는 `observed_g_per_15ml`
  - `selected_representative_grade` (`VOLUME_G6/G10/G15/G20/G25` 후보 표시일 뿐 canonical assignment 아님)
  - `absolute_error_g_per_15ml`, `review_result`
  - `license_evidence_url`, `license_checked_at`, `license_disposition`
- 이 slice는 evidence와 후보 계산만 준비한다. 실제 `<=2.5g/15mL` 승인 threshold 적용, 사람 승인, profile/ingredient assignment, 재료명만으로 자동 배정 금지는 `ingredient-nutrition-conversion-model` acceptance가 소유한다.

## Frontend Delivery Mode

- N/A — 화면·route·client state·로그인 보호 액션이 없다.
- `loading / empty / error / read-only / unauthorized` UI 상태는 적용되지 않는다.
- Stage 4~6, Playwright, exploratory browser QA는 스킵한다. 대신 CLI error/empty/partial/rate-limit과 artifact read-only/secret boundary를 Node/Vitest로 검증한다.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 화면과 frontend 파일을 변경하지 않으므로 Design/Accessibility는 N/A다.

## Design Status

- [x] N/A — BE/data-tooling only, FE 화면 없음, Stage 4~6 스킵

## Source Links

### Repository authority

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.14.md`
- `docs/화면정의서-v1.5.21.md`
- `docs/유저flow맵-v1.3.20.md`
- `docs/db설계-v1.3.17.md`
- `docs/api문서-v1.2.22.md`
- `docs/workpacks/28-external-ingredient-data-ingest-gate/README.md`
- 계약 PR #992: `https://github.com/netsus/homecook/pull/992`
- 승인 계획: `/Users/shj/2025/2026/homecook1/.worktrees/nutrition-products-planner-plan/.omx/plans/nutrition-products-planner-expansion-20260713.md`

### Official source pages

- 식약처 식품영양성분DB정보: `https://www.data.go.kr/data/15127578/openapi.do`
- 식품영양성분 통합 데이터 표준: `https://www.data.go.kr/data/15100064/standard.do`
- 농진청 국가표준식품성분표 개요/검색:
  - `https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562`
  - `https://www.nics.go.kr/food/kfi/fct/fctFoodSrch/list`
- 농진청 영양가 계산: `https://www.nics.go.kr/food/kfi/fct/fctNutCal/list`
- 농진청 양념재료 계량표: `https://www.nics.go.kr/food/kfi/hsMarinade/list_03`
- 농진청 저작권정책: `https://nics.go.kr/contents/page.do?contentsId=3&homepageSeCode=nics&m=100000165`
- 활성 RDA 10.0 OpenAPI 비교 근거: `https://www.data.go.kr/data/15143598/openapi.do`

## QA / Test Data Plan

### Fixture baseline

- 작은 fake MFDS JSON, RDA 10.4 Excel-derived sample, 통합표준 CSV/JSON sample, 제한된 계량 evidence fixture를 둔다.
- fixture의 key는 `<FAKE_TEST_KEY_ONLY>`처럼 실제 key가 아님이 명확한 값만 사용한다.
- fixture는 정상, malformed, partial page, duplicate page/key, total count drift, schema drift, missing basis, missing core nutrient, negative value, trace/blank, missing license evidence를 포함한다.
- raw provider 전체 response나 원문 계량표 전체를 fixture로 복제하지 않는다.

### Deterministic tests and validators

- planned test targets:
  - `tests/public-nutrition-source-acquisition.test.ts`
  - `tests/public-nutrition-source-cli.test.ts`
  - `tests/public-nutrition-license-boundary.test.ts`
- Stage 2 required command:
  - `pnpm exec vitest run tests/public-nutrition-source-acquisition.test.ts tests/public-nutrition-source-cli.test.ts tests/public-nutrition-license-boundary.test.ts`
  - `pnpm verify:backend`
- Stage 1/current docs validators:
  - `pnpm validate:source-of-truth-sync`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack -- --slice public-nutrition-source-acquisition`
  - `node scripts/validate-automation-spec.mjs --slice public-nutrition-source-acquisition`
  - `git diff --check`

### External/manual smoke

- MFDS live smoke는 활용신청과 server-only key가 준비된 operator 환경에서만 최소 page로 실행한다.
- RDA 10.4 source version/공공누리 제1유형 evidence와 양념 계량표의 이용조건 disposition은 별도 수동 검수 기록으로 남긴다.
- live smoke는 다섯 row-accounting count와 approved count, key 노출 0, production DB write 0을 확인한다. 실제 key 값 자체는 evidence에 기록하지 않는다.
- real DB smoke/seed/reset: N/A. 이 slice는 DB를 읽거나 쓰지 않으며, DB table 준비는 다음 slice의 blocker다.

### Blocker conditions

- 공식 5종과 Stage 1 문서의 source/version/license 경계 충돌
- MFDS 필수 활용신청 또는 operator secret 미준비 상태에서 live smoke를 필수 green으로 주장
- 실제 key/auth query가 log, manifest, fixture, response, client, committed file에 노출
- `source_version`, checksum, license evidence, `data_basis_date` disposition 누락
- pagination/accounting/schema drift가 있는데 partial promotion artifact 생성
- 원문 계량표 전체 또는 공공누리 미표시 저작물을 복제/재배포
- production DB write 또는 다음 slice 소유의 profile/assignment 생성

## Key Rules

- 공공 source는 runtime 사용자 요청에 직결하지 않는다.
- 필수 활용신청은 MFDS `15127578` 하나다. RDA `15143598`은 활성 OpenAPI지만 10.0/KOGL4이므로 기본 경로가 아니다.
- secret은 정확히 `DATA_GO_KR_API_KEY` 하나이며 server/operator boundary 밖으로 나가지 않는다.
- 결측은 0이 아니며 raw row loss도 허용하지 않는다. fetched raw row는 normalized, quarantine, identical dedupe 중 하나로 계상한다.
- source/version/license/checksum이 pin되지 않은 값은 다음 slice에 전달하지 않는다.
- 승인되지 않은 row, failed/partial batch, duplicate conflict, contaminated row는 promotion input에 들어가지 않는다.
- 농진청 계량자료는 소량 사실 evidence만 보존하고 실제 assignment 결정은 다음 slice로 넘긴다.
- product code/public API/DB/frontend는 이 slice에서 변경하지 않는다.

## Contract Evolution Candidates

- 없음. 공식 5종과 승인 계획 사이에 이 slice를 막는 충돌을 발견하지 않았다.
- 새 endpoint, DB field, source status, 공개 attribution field가 필요해지면 이 workpack에서 임의 보정하지 않고 별도 `contract-evolution` blocker로 보고한다.

## Primary User Path

이 slice에는 직접 사용자 화면이 없다. 사용자 가치로 이어지는 primary path는 운영자 매개 흐름이다.

1. 운영자가 source별 이용조건·version을 확인하고 MFDS 사용 시 server-only key를 준비한다.
2. fetch/file ingest가 raw snapshot과 sanitized manifest를 만들고 provider total 대비 `fetched_raw_count`, page identity, checksum을 검증한다.
3. normalize가 핵심 5종/기준량/결측을 결정론적으로 변환하고 모든 fetched raw row를 normalized, quarantine, identical dedupe 중 하나로 계상한다.
4. reviewer가 schema·중복·충돌·license·delta와 제한 계량 evidence를 검수한다.
5. approved decision만 pinned handoff bundle로 만들고 `ingredient-nutrition-conversion-model`이 이를 소비한다.

## Handoff Contract: ingredient-nutrition-conversion-model

다음 slice가 소비하는 필수 산출물은 아래와 같다.

1. approved source manifest: provider, dataset, `source_version`, `data_basis_date`, license evidence, checksum
2. normalized source item/value bundle: stable external key, 기준량, 핵심 5종과 optional 값, missing reason, provenance fingerprint
3. quarantine/review report: 다섯 row-accounting count, malformed/partial/identical duplicate/conflicting duplicate/schema/license 사유와 count
4. public attribution bundle: 정확히 6 field(`provider`, `dataset`, `source_version`, `data_basis_date`, `license`, `source_url`)
5. 제한된 RDA measurement evidence: 관측 사실, 후보 대표 등급, 오차, review/license disposition
6. reproducibility evidence: 동일 input/decision의 동일 row-accounting count tuple과 raw/normalized checksum, secret leak 0, production DB write 0

handoff gate는 `fetched_raw_count = unique_input_count + deduplicated_identical_count`, `unique_input_count = normalized_count + quarantined_count`와 그에 따른 `fetched_raw_count = normalized_count + quarantined_count + deduplicated_identical_count`, blocker 0, approved decision 외 row 0, license/source pin 결손 0, 실제 key/auth query 노출 0을 모두 만족할 때만 열린다.

## Delivery Checklist

> 이 BE/data-tooling only slice는 Stage 2가 구현하고 독립 Stage 3 Codex reviewer가 닫는다. Stage 4~6은 N/A다.

- [x] 이름용 adapter와 분리된 영양 source adapter/CLI 4종 구현 <!-- omo:id=delivery-nutrition-adapters-cli;stage=2;scope=backend;review=3 -->
- [x] manifest/provenance/license/checksum/version pinning 구현 <!-- omo:id=delivery-source-manifest-pinning;stage=2;scope=backend;review=3 -->
- [x] `DATA_GO_KR_API_KEY` server-only 주입과 credential redaction 테스트 <!-- omo:id=delivery-credential-redaction;stage=2;scope=backend;review=3 -->
- [x] pagination/timeout/retry/backoff/rate-limit fail-closed 처리 <!-- omo:id=delivery-safe-batch-retry;stage=2;scope=backend;review=3 -->
- [x] 핵심 5종/기준량/결측 정규화와 raw row accounting 구현 <!-- omo:id=delivery-normalization-accounting;stage=2;scope=backend;review=3 -->
- [x] duplicate/conflict/contamination quarantine와 approved-only promotion 구현 <!-- omo:id=delivery-review-promotion-gate;stage=2;scope=backend;review=3 -->
- [x] 동일 input/decision 재실행 hash와 중복 방지 테스트 <!-- omo:id=delivery-idempotent-rerun;stage=2;scope=backend;review=3 -->
- [x] 농진청 계량자료 소량 evidence/저작권 경계 validator 구현 <!-- omo:id=delivery-rda-limited-evidence;stage=2;scope=backend;review=3 -->
- [x] malformed/partial/timeout/429/schema/license 결손 fixture 회귀 테스트 <!-- omo:id=delivery-failure-fixtures;stage=2;scope=backend;review=3 -->
- [x] 다음 slice용 approved/pinned handoff bundle과 production DB write 0 증거 <!-- omo:id=delivery-next-slice-handoff;stage=2;scope=shared;review=3 -->
