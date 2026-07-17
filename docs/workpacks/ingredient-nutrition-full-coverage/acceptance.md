# Acceptance Checklist: ingredient-nutrition-full-coverage

> 자동화 가능한 항목은 Stage 2에서 evidence가 생긴 뒤 체크한다. Stage 3 reviewer는 구현자와 분리한다. 아래 체크는 implementation contract와 synthetic/isolated-PostgreSQL evidence가 통과했다는 뜻이며, 실제 inventory 전수 검수와 외부 write 승인은 `Manual Only`로 계속 분리한다.

## Happy Path

- [x] inventory가 실행 시점의 모든 canonical ingredient를 ID 순서로 포함하고 같은 DB 상태에서 같은 checksum을 만든다 <!-- omo:id=accept-inventory-deterministic;stage=2;scope=backend;review=3 -->
- [x] eligible ingredient마다 approved/current source에 연결된 active approved primary가 정확히 하나다 <!-- omo:id=accept-eligible-primary;stage=2;scope=backend;review=3 -->
- [x] strict excluded ingredient마다 actor/time/reason과 허용 reason code가 있다 <!-- omo:id=accept-excluded-audit;stage=2;scope=backend;review=3 -->
- [x] report에서 denominator가 eligible+excluded와 일치하고 `unclassified=0`이다 <!-- omo:id=accept-coverage-complete;stage=2;scope=backend;review=3 -->

## State / Policy

- [x] MFDS→RDA 우선순위는 compatible 후보 정렬에만 쓰고 자동 승인하지 않는다 <!-- omo:id=accept-source-priority;stage=2;scope=backend;review=3 -->
- [x] exact external key/fingerprint 또는 명시적 operator decision 없이 active link가 생기지 않는다 <!-- omo:id=accept-exact-decision;stage=2;scope=backend;review=3 -->
- [x] 같은 apply/disable 재실행은 `writes_committed=0`이고 payload/version을 중복 생성하지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3 -->
- [x] disable/rollback은 source item/profile/value를 삭제·수정하지 않는다 <!-- omo:id=accept-append-only-rollback;stage=2;scope=backend;review=3 -->

## Error / Permission

- [x] ambiguous/no-match/source-missing은 제외로 위조되지 않고 non-zero failure와 reason을 남긴다 <!-- omo:id=accept-unresolved-fail-closed;stage=2;scope=backend;review=3 -->
- [x] inventory/decision/source/checkpoint/target fingerprint drift는 transaction 전 0 write로 실패한다 <!-- omo:id=accept-checksum-drift;stage=2;scope=backend;review=3 -->
- [x] approval artifact 없는 staging/production apply/disable은 0 write로 거절된다 <!-- omo:id=accept-external-write-guard;stage=2;scope=backend;review=3 -->
- [x] anon/authenticated/admin viewer는 operator tables와 commands를 write할 수 없다 <!-- omo:id=accept-operator-permission;stage=2;scope=backend;review=3 -->

## Data Integrity

- [x] inventory의 ID가 decision artifact에 누락/중복 없이 정확히 한 번 나온다 <!-- omo:id=accept-decision-bijection;stage=2;scope=backend;review=3 -->
- [x] excluded와 qualified link가 동시에 있는 conflict, qualified primary 0/2+가 모두 gate를 실패시킨다 <!-- omo:id=accept-classification-conflict;stage=2;scope=backend;review=3 -->
- [x] `missing/trace/parse_error`는 amount null을 유지하고 observed zero와 구분된다 <!-- omo:id=accept-missing-not-zero;stage=2;scope=backend;review=3 -->
- [x] API key/auth query/cookie/raw provider response·row/private path가 DB/log/report/fixture에 없다 <!-- omo:id=accept-no-secret-raw;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [x] synthetic fixture가 exact/ambiguous/no-match/excluded/duplicate/checkpoint cases를 포함한다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3 -->
- [x] fresh local Supabase에 기존 nutrition migration과 source/license baseline이 준비된다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3 -->
- [x] real DB smoke가 inventory→dry-run→apply→replay→coverage→disable→replay를 검증한다 <!-- omo:id=accept-real-db-lifecycle;stage=2;scope=shared;review=3 -->

## Automation Split

### Vitest / PostgreSQL

- [x] inventory/checksum과 decision artifact validation을 unit test로 고정한다 <!-- omo:id=accept-unit-coverage-model;stage=2;scope=backend;review=3 -->
- [x] importer, migration guard, RLS, transaction rollback을 PostgreSQL integration으로 고정한다 <!-- omo:id=accept-postgres-integration;stage=2;scope=backend;review=3 -->
- [x] 기존 FoodSafety-30 importer와 recipe nutrition 회귀가 유지된다 <!-- omo:id=accept-predecessor-regression;stage=2;scope=shared;review=3 -->

### Playwright

- [x] BE/data-only라 신규 browser flow가 없고 final cross-slice browser 검증으로 분리됨 <!-- omo:id=accept-playwright-na;stage=2;scope=shared;review=3 -->

## Manual QA

- verifier: Stage 2 구현자와 다른 fresh Codex Stage 3 reviewer
- environment: isolated/fresh local Supabase; external write는 별도 checkpoint gate 이후만
- scenarios: 샘플 decision 대조, exclusion 근거 검토, dry-run/apply/replay/disable report와 DB count 대조

### Manual Only

- [ ] 실제 845개(또는 실행 시점 inventory 전수)의 source 선택과 strict excluded 근거를 사람이 검수한다.
- [ ] production/staging write는 sanitized dry-run, checkpoint, target fingerprint와 별도 operator approval을 대조한 뒤 실행한다.
