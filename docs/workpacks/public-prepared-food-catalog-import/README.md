# Slice: public-prepared-food-catalog-import

## Goal

식약처 공공 영양DB의 검수된 가공식품을 서비스의 local catalog로 일괄 적재해 사용자가 제품명·업체·기준량·핵심 영양을 검색할 수 있게 한다. 검색 요청 중 외부 API를 호출하지 않고, 공공 원본의 출처·기준일·stable key와 immutable nutrition version을 보존한다. 최초 10,000개 이상 유효 제품 파일럿과 100k 검색 성능을 통과한 뒤 전체 유효 행으로 확장한다.

## Branches

- 문서: `docs/public-prepared-food-catalog-import`
- 백엔드/데이터: `feature/be-public-prepared-food-catalog-import`
- 프론트엔드: N/A — 기존 `GET /food-products` 소비 화면은 후속 UX/community slice가 소유

## In Scope

- primary source family: 공공데이터포털 dataset `15100066`, 전국통합식품영양성분정보(가공식품) 표준데이터
  - verified bulk snapshot: 식품안전나라 K-FIND 공식 다운로드 `2026-06-26`, 298,288 source rows
  - K-FIND XLSX/CSV snapshot 또는 `https://api.data.go.kr/openapi/tn_pubr_public_nutri_process_info_api` pagination(`numOfRows<=1000`)
- internal operator pipeline: raw artifact + manifest → normalize/quarantine → review decision → approved promotion → report/disable
- stable key: non-empty `itemMnftrRptNo` 우선, 없으면 non-empty `foodCd`; 둘 다 없으면 quarantine
- mapped fields: product name, manufacturer/importer/distributor projection, nutrition basis, core nutrients, source/version/date/attribution, serving/food-size original text
- existing local catalog tables: `nutrition_sources`, `nutrition_source_items`, `nutrition_profiles`, `nutrition_values`, `food_products`, `food_product_nutrition_versions`, `operational_events`
- search: existing `GET /food-products`의 local DB 결과만 사용하며 100k fixture에서 substring/prefix/company, cursor/limit 20 p95 목표 300ms
- Schema Change:
  - [x] 없음 — 공식 v1.3.22의 기존 table/function/index와 `operational_events` registry만 사용
  - [ ] 있음

## Out of Scope

- runtime 사용자 query가 data.go.kr/식약처를 호출하는 기능
- 사용자 등록 public 공유, 신고/moderation, legacy private 공개 전환. 이는 `community-prepared-food-catalog`이 소유한다.
- 제품 picker/entry card의 source badge, 100g/100mL 비교·1g/1mL 수량 UI. 이는 `prepared-food-standard-basis-ux`가 소유한다.
- public endpoint/response field/error/status 추가. 기존 food product API shape를 그대로 사용한다.
- barcode/이미지/원재료/알레르기 enrichment와 다른 provider 자동 merge
- source row가 제공하지 않는 serving/package↔g/ml, g↔ml 추정 변환
- key, 인증 query, cookie, raw response/row의 DB/git/log/report/browser 노출

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| 2026-07-17 public-sharing 공식 계약 | merged — PR #1026, merge `403bf16c50cc4fd35c88a10510b4a216e866f991` | [x] |
| `prepared-food-catalog` | merged | [x] |
| `public-nutrition-source-acquisition` artifact/security pattern | merged | [x] |

## Backend First Contract

### Public contract

- 신규 public API가 없다. existing `GET /food-products`, `GET /food-products/{id}`는 batch 승격된 local public rows를 기존 `{ success, data, error }` shape로 반환한다.
- user query→external provider network call은 0이어야 한다.
- UI copy `공공 영양DB`는 후속 slice에서 표시하며 `정부 인증/검증`으로 과장하지 않는다.

### Source snapshot and manifest

- dataset id, sanitized official URL, source version/date, fetched time, row count, SHA-256, license disposition, schema fingerprint, pagination/file metadata를 가진 immutable manifest를 만든다.
- current official evidence: snapshot `20260626`, 298,288 rows, annual refresh, license restriction 없음. 실행 manifest와 projection checksum이 숫자와 schema를 재검증했다.
- raw CSV/response는 gitignored read-only operator storage에만 보존하고 DB/log/report/PR에 raw row를 복사하지 않는다.
- API key가 없을 때 공식 public CSV download를 사용할 수 있다. secret은 manifest URL/command/report에 포함하지 않는다.

### Normalize and quarantine

- `nutConSrtrQua`의 exact `100g`/`100ml`만 각각 `100 g`/`100 ml`로 구조화한다. 다른 값·혼합 차원·파싱 불명확은 추정하지 않고 quarantine/review한다.
- `servSize`, `foodSize`는 원문 text를 보존하고 exact 관계가 검수되지 않으면 `basis_relations=[]`다.
- 빈 문자열/`해당없음`은 null이며 observed `0`과 다르다. core nutrient blank/invalid는 0으로 만들지 않고 row를 quarantine하거나 partial rule에 따라 reject한다. public 승격 제품은 기존 contract의 5 core observed 값을 충족한다.
- `itemMnftrRptNo`는 숫자로 변환하지 않고 문자열로 보존한다. stable key namespace는 `item-report:<value>` 또는 fallback `food-code:<value>`다.
- 같은 stable key에 서로 다른 제품 identity/current content가 있으면 자동 merge하지 않고 quarantine한다.

### Promotion/version contract

- 최초 파일럿은 deterministic valid ordering의 10,000개 이상이다. source valid row가 그보다 적으면 전부다.
- approved source/item/profile/value/product/version만 하나의 transaction/batch로 승격한다.
- 같은 stable key와 같은 content checksum 재실행은 0 write다. 내용 변경은 기존 pinned version을 수정하지 않고 새 immutable nutrition version을 만든다.
- disable/rollback은 batch/source version을 inactive 처리하고 payload/version을 hard delete하지 않는다. 기존 planner pin은 유지한다.
- summary는 input/schema checksum, row counts(raw/valid/quarantined/approved), duplicate counts, source version, batch id, writes attempted/committed, replay, secret leak count, affected immutable IDs만 포함한다.

### Failure codes

- `SOURCE_SCHEMA_DRIFT`, `SOURCE_CHECKSUM_MISMATCH`, `SOURCE_LICENSE_NOT_APPROVED`
- `PRODUCT_STABLE_KEY_MISSING`, `PRODUCT_STABLE_KEY_CONFLICT`
- `PRODUCT_NAME_MISSING`, `PRODUCT_BASIS_UNSUPPORTED`, `PRODUCT_CORE_NUTRIENT_MISSING`, `PRODUCT_NUTRIENT_INVALID`
- `APPROVAL_FILE_REQUIRED`, `CHECKPOINT_MISMATCH`, `TARGET_FINGERPRINT_MISMATCH`
- `PRODUCTION_LOAD_APPROVAL_REQUIRED`, `SECRET_OR_RAW_DATA_LEAK`, `IMPORT_TRANSACTION_FAILED`

## Frontend Delivery Mode

- BE/data only. 신규 route/component/client state가 없고 5개 UI 상태·return-to-action·Playwright는 후속 community/standard-basis slice에서 검증한다.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: public catalog data/import/index만 변경한다.

## Design Status

- [x] N/A — BE/data-only, Stage 4~6 스킵

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.21.md`
- `docs/화면정의서-v1.5.27.md`
- `docs/유저flow맵-v1.3.24.md`
- `docs/db설계-v1.3.22.md`
- `docs/api문서-v1.2.26.md`
- `docs/workpacks/public-nutrition-source-acquisition/`
- `docs/workpacks/prepared-food-catalog/`
- official dataset: `https://www.data.go.kr/data/15100066/standard.do`
- official K-FIND bulk download: `https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do`
- execution evidence: `docs/workpacks/public-prepared-food-catalog-import/evidence/2026-07-17-local-pilot-full-import.md`

## QA / Test Data Plan

- RED first: parser/sentinel/missing-zero, 100g/100mL, stable key fallback/conflict, quarantine, immutable update, replay/rollback, secret scan, runtime-network prohibition
- fixture: official field names을 닮은 synthetic rows만 사용. 실제 raw row/secret은 commit하지 않는다.
- local real DB: fresh local Supabase → 10k approved fixture/sanitized snapshot promotion → replay → search/cursor → version update → disable/rollback
- performance: deterministic 10k/100k catalog fixture, warm/cold query plan과 limit 20 p95 기록. name prefix/substring, manufacturer, stable cursor를 각각 측정한다.
- external source smoke는 schema/row count/checksum만 sanitized report로 남기고 raw body를 출력하지 않는다.
- blocker: license/schema/checksum drift, stable key collision, core missing, unsupported basis, raw leak, p95>300ms, runtime provider call

## Key Rules

- public stable key는 품목제조보고번호 우선, 없으면 food code다.
- 공공 source 행이라고 모두 자동 승인하지 않는다. normalize와 review gate를 통과해야 한다.
- missing은 0이 아니며 액체를 g으로, serving/package를 g/ml로 추정하지 않는다.
- source update는 이전 planner-pinned version을 바꾸지 않는다.
- 일반 사용자는 public product/source/profile/version을 수정할 수 없다.
- 새 npm dependency나 공식 DB 문서에 없는 table/column/index/status를 추가하지 않고 기존 Postgres/native Node 자산을 사용한다. 100k 목표를 기존 schema로 달성하지 못하면 구현을 억지로 확장하지 않고 별도 contract-evolution 후보로 보고한다.

## Primary User Path

1. 운영자가 official snapshot/manifest를 수집하고 checksum/schema/license를 확인한다.
2. normalize/quarantine report를 검수해 파일럿 approval과 checkpoint를 만든다.
3. local catalog에 10,000개 이상을 승격하고 replay/검색/rollback/성능을 검증한다.
4. 같은 gate로 전체 valid rows를 batch 승격하면 기존 제품 검색 API가 local rows를 반환한다.

## Delivery Checklist

- [x] dataset 15100066 snapshot/manifest/checksum 수집 경계 <!-- omo:id=delivery-source-snapshot;stage=2;scope=backend;review=3 -->
- [x] field parser, missing/sentinel, 100g/100mL strict normalize <!-- omo:id=delivery-normalizer;stage=2;scope=backend;review=3 -->
- [x] stable key/fingerprint/quarantine/review contract <!-- omo:id=delivery-stable-key-review;stage=2;scope=backend;review=3 -->
- [x] immutable product nutrition version promotion과 replay/disable <!-- omo:id=delivery-promotion-lifecycle;stage=2;scope=backend;review=3 -->
- [x] 10k pilot와 전체-valid checkpoint/rollback report <!-- omo:id=delivery-pilot-full;stage=2;scope=backend;review=3 -->
- [x] 기존 공식 schema에서 100k limit-20 search/cursor p95 목표 검증 <!-- omo:id=delivery-search-performance;stage=2;scope=backend;review=3 -->
- [x] user query external provider call 0, secret/raw-row 노출 0 <!-- omo:id=delivery-security-runtime-boundary;stage=2;scope=backend;review=3 -->
- [x] fresh local Supabase real DB lifecycle와 독립 Stage 3 review <!-- omo:id=delivery-real-db-review;stage=2;scope=shared;review=3 -->

## Stage 2/3 Evidence

- TDD와 isolated PostgreSQL 검증에서 focused Vitest `34/34`, PostgreSQL integration `9/9`, typecheck와 changed-file ESLint가 통과했다.
- local full promotion은 official snapshot `298,288` rows를 `287,041 approved + 1 identical duplicate + 11,246 quarantine`로 정확히 닫았고, 같은 입력 replay는 `0` write였다.
- public products/current approved links `287,041`, five-core current values `1,435,205`, duplicate public external key groups `0`, missing attribution `0`, secret/raw leak `0`을 aggregate evidence로 고정했다.
- fresh independent Stage 3/current-head review는 `APPROVE`, blocker `0`이었고 exact head `7cea8644740f466eebb91f497c7988ca3aab9161`의 모든 started check가 success 또는 의도된 skip으로 끝난 뒤 PR #1035가 merge `903e70824bc2ee7061170f08fe9b3a36c0e852d1`로 병합됐다. reviewed head tree와 merge tree가 같고 해당 head가 `origin/master` ancestry에 포함됨을 재확인했다.
- production/staging 전체 promotion과 source 변경 adapter review는 계속 Manual Only다.

## Contract Evolution Candidates

- 없음. 기존 official food-product API/DB 계약 안에서 batch data를 채운다.
