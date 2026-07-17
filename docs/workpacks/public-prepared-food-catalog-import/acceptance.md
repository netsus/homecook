# Acceptance Checklist: public-prepared-food-catalog-import

## Happy Path

- [x] official snapshot의 dataset/version/row count/schema/license/checksum이 manifest와 일치한다 <!-- omo:id=accept-source-manifest;stage=2;scope=backend;review=3 -->
- [x] 최초 approved pilot이 10,000개 이상 검색 가능한 public 제품을 만든다 <!-- omo:id=accept-pilot-count;stage=2;scope=backend;review=3 -->
- [x] 모든 승격 제품에 name, company projection, exact 100g/100mL basis, 5 core nutrition, stable key, attribution이 있다 <!-- omo:id=accept-public-product-complete;stage=2;scope=backend;review=3 -->
- [x] 전체 valid promotion 전 checkpoint와 rollback/disable rehearsal이 통과한다 <!-- omo:id=accept-full-promotion-checkpoint;stage=2;scope=backend;review=3 -->

## State / Policy

- [x] stable key는 non-empty item report number 우선, 없을 때 food code로 결정된다 <!-- omo:id=accept-stable-key;stage=2;scope=backend;review=3 -->
- [x] 같은 content replay는 0 write이고 변경된 content는 새 immutable version을 만든다 <!-- omo:id=accept-idempotent-versioning;stage=2;scope=backend;review=3 -->
- [x] disable/rollback은 과거 version과 planner pin을 삭제·수정하지 않는다 <!-- omo:id=accept-rollback-preserves-history;stage=2;scope=backend;review=3 -->
- [x] 일반 사용자는 public dataset product/source/version을 write할 수 없다 <!-- omo:id=accept-public-read-only;stage=2;scope=backend;review=3 -->

## Error / Permission

- [x] schema/checksum/license drift는 transaction 전 0 write로 실패한다 <!-- omo:id=accept-source-drift-fail;stage=2;scope=backend;review=3 -->
- [x] missing/conflicting stable key, unsupported basis, missing/invalid core nutrient는 quarantine되고 public row가 되지 않는다 <!-- omo:id=accept-quarantine-invalid;stage=2;scope=backend;review=3 -->
- [x] approval/checkpoint/target mismatch와 unapproved production write는 0 write다 <!-- omo:id=accept-write-gates;stage=2;scope=backend;review=3 -->
- [x] user search/detail 요청에서 external provider network call이 0이다 <!-- omo:id=accept-runtime-network-zero;stage=2;scope=backend;review=3 -->

## Data Integrity

- [x] blank/`해당없음`/invalid token은 null 또는 quarantine이며 observed zero와 구분된다 <!-- omo:id=accept-missing-zero;stage=2;scope=backend;review=3 -->
- [x] 100ml를 100g으로, serving/package를 g/ml로 추정 변환한 row가 0이다 <!-- omo:id=accept-dimension-safety;stage=2;scope=backend;review=3 -->
- [x] public stable key 중복·identity conflict와 attribution 없는 promoted product가 0이다 <!-- omo:id=accept-key-attribution-integrity;stage=2;scope=backend;review=3 -->
- [x] key/auth query/cookie/raw provider response·row/private path가 DB/log/report/fixture/browser에 없다 <!-- omo:id=accept-no-secret-raw;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [x] synthetic parser fixture가 g/ml, sentinel, blank/zero, alphanumeric report no, collision cases를 포함한다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3 -->
- [x] fresh local Supabase에 nutrition/product predecessor migrations가 적용된다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3 -->
- [x] 10k/100k performance fixture가 deterministic seed/reset 명령으로 재생성된다 <!-- omo:id=accept-performance-fixture;stage=2;scope=shared;review=3 -->

## Automation Split

### Vitest / PostgreSQL

- [x] parser/normalizer/stable-key/quarantine/versioning을 unit test로 고정한다 <!-- omo:id=accept-unit-importer;stage=2;scope=backend;review=3 -->
- [x] transaction/RLS/replay/rollback/search cursor를 PostgreSQL integration으로 고정한다 <!-- omo:id=accept-postgres-importer;stage=2;scope=backend;review=3 -->
- [x] 100k limit 20 name/company search p95가 목표 300ms 이내다 <!-- omo:id=accept-performance-target;stage=2;scope=backend;review=3 -->

### Playwright

- [x] BE/data-only라 UI는 후속 community/standard-basis와 final cross-slice browser QA로 분리된다 <!-- omo:id=accept-playwright-na;stage=2;scope=shared;review=3 -->

## Manual QA

- verifier: Stage 2 구현자와 다른 fresh Codex Stage 3 reviewer
- environment: immutable raw artifact storage + isolated/fresh local Supabase
- scenarios: manifest/checksum 대조, 10k pilot sample, same replay, update version, search/cursor/perf, disable/rollback

### Manual Only

- [ ] production/staging 전체 valid promotion은 dry-run report, checkpoint, target fingerprint를 사람이 확인한 뒤 실행한다.
- [ ] 공식 source snapshot/version/license가 바뀌면 새 adapter/schema review를 수행한다.
