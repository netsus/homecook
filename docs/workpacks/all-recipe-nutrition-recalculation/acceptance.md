# All Recipe Nutrition Recalculation Acceptance

이 문서는 `all-recipe-nutrition-recalculation` Stage 2 백엔드/공용 acceptance를 고정한다. 범위는 전체 `public.recipes` 기준의 영양 재계산 스냅샷 생성, current 전환, 회귀 방지 검증까지이며, API·스키마·도메인 계약 변경은 포함하지 않는다.

## Happy Path

- [ ] 재계산 분모는 숨은 필터 없이 전체 `public.recipes` 행 수와 정확히 일치한다. `active`, `deleted`, 임시 대상군 같은 비공식 조건은 허용되지 않는다. <!-- omo:id=arnr-acc-001;stage=2;scope=shared;review=3 -->
- [ ] 각 레시피는 재계산 시점에 정확히 하나의 결과 상태로만 집계된다. 세 상태 외의 `unclassified` 잔여 수는 `0`이어야 하며, 회계 집계와 보고 수치가 동일하다. <!-- omo:id=arnr-acc-002;stage=2;scope=shared;review=3 -->
- [ ] 재계산은 각 재료에 대해 승인된 current 체인만 사용한다. 즉, current ingredient source -> current approved ingredient profile -> current approved conversion 체인이 모두 유효할 때만 해당 값을 계산에 반영한다. <!-- omo:id=arnr-acc-003;stage=2;scope=backend;review=3 -->
- [ ] 실제 edible 계산은 기존 권위 데이터만 사용하며, 동일 재료에 대한 이중 반영이 없어야 하고, 재계산 과정에서 새 사용자 입력이나 임의 보정계수는 추가되지 않는다. <!-- omo:id=arnr-acc-004;stage=2;scope=backend;review=3 -->
- [ ] 새 Meal 생성 시 current 체크포인트를 참조하는 기존 동작은 바뀌지 않고, 이번 재계산 경로를 호출하지 않는 기존 소비자는 동일한 동작을 유지한다. <!-- omo:id=arnr-acc-005;stage=2;scope=shared;review=3 -->

## State / Policy

- [ ] 세 상태 accounting은 항상 닫혀 있어야 한다. 전체 레시피 수 = 세 상태 합계이며, `unclassified=0`을 만족하지 못하면 성공으로 기록하지 않는다. <!-- omo:id=arnr-acc-006;stage=2;scope=shared;review=3 -->
- [ ] current source/profile/conversion 체인 중 하나라도 current가 `0건`이거나 `2건 이상`이면 충돌로 처리하고, 조용히 대체값을 고르지 않는다. 관련 conflict / multiple-current 카운트는 보고에 명시되고, 성공 케이스에서는 `0`이어야 한다. <!-- omo:id=arnr-acc-007;stage=2;scope=backend;review=3 -->
- [ ] `missing` 값은 `0`으로 뭉개지지 않는다. 누락·trace·to-taste·unconvertible 같은 계산 불가 사유는 기존 `missing_reasons` / `warnings_json` taxonomy 안에서만 기록되고, 새 분류명이나 새 경고 타입을 임의 추가하지 않는다. <!-- omo:id=arnr-acc-008;stage=2;scope=backend;review=3 -->
- [ ] `meals.recipe_nutrition_snapshot_id`와 `meals.nutrition_snapshot_origin`은 read-only이며, historical Meal이 과거 체크포인트에 pin된 기록은 재계산 후에도 그대로 유지되고 과거 Meal을 새 current로 재연결하지 않는다. <!-- omo:id=arnr-acc-009;stage=2;scope=shared;review=3 -->
- [ ] 이번 작업은 API 응답 형식, 공개 스키마, 도메인 상태 전이 규칙을 바꾸지 않는다. 재계산은 내부 백엔드 경로로만 추가되고 외부 계약은 유지된다. <!-- omo:id=arnr-acc-010;stage=2;scope=shared;review=3 -->

## Error / Permission

- [ ] current 체인 충돌, checkpoint drift, 동시성 drift, replay 충돌은 모두 fail-closed로 처리되며, 부분 성공이나 자동 병합 없이 명시적 실패 결과를 남긴다. <!-- omo:id=arnr-acc-011;stage=2;scope=backend;review=3 -->
- [ ] 재계산 실행 권한은 로컬 검증 경로와 승인된 service role 경로로만 제한된다. 외부 승인 없이 production/staging 대상 실행 범위를 넓히지 않는다. <!-- omo:id=arnr-acc-012;stage=2;scope=backend;review=3 -->
- [ ] 비밀값과 민감 데이터는 로그, fixture, 테스트 출력, 문서에 raw 값으로 남지 않는다. `service_role` 비밀은 승인된 실행 경로에서만 사용하고, raw secret 노출 건수는 `0`이어야 한다. <!-- omo:id=arnr-acc-013;stage=2;scope=backend;review=3 -->
- [ ] 롤백은 이전 current 체크포인트를 복구하되, 기존 스냅샷을 삭제하지 않고 과거 accepted history를 재작성하지 않는다. <!-- omo:id=arnr-acc-014;stage=2;scope=backend;review=3 -->

## Data Integrity

- [ ] 재계산 결과의 inventory 집계, hash, `missing_reasons`, `warnings_json`, query count, write count는 같은 checkpoint 입력 집합에서 항상 동일한 순서와 동일한 값으로 생성된다. <!-- omo:id=arnr-acc-015;stage=2;scope=backend;review=3 -->
- [ ] 체크포인트 스냅샷은 immutable이다. 새 current를 만들 때 기존 히스토리 레코드를 in-place 수정하지 않고, 원자적으로 current 포인터만 전환한다. <!-- omo:id=arnr-acc-016;stage=2;scope=backend;review=3 -->
- [ ] 동일 입력에 대한 replay는 동일 결과를 만들어야 하며, duplicate current 생성, 숨은 delta 누적, hash 흔들림이 없어야 한다. 성공 replay 후 current 레코드 수는 `1`을 유지한다. <!-- omo:id=arnr-acc-017;stage=2;scope=backend;review=3 -->
- [ ] 재계산 쓰기 흐름은 atomic해야 하며, reader는 부분 적용된 스냅샷이나 반쯤 전환된 current 상태를 관찰할 수 없어야 한다. <!-- omo:id=arnr-acc-018;stage=2;scope=backend;review=3 -->
- [ ] 배치 조회는 bounded cursor 또는 동등한 제한된 순회 방식으로 수행되며, 레시피/재료 단위 N+1 조회 패턴을 만들지 않고 같은 checkpoint 입력에서 query/write count를 결정론적으로 유지한다. <!-- omo:id=arnr-acc-019;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [ ] 테스트 데이터는 전체 `public.recipes` 분모를 재현할 수 있는 fixture를 포함해야 하며, complete/partial/unavailable 세 상태와 current 0건, multiple current, missing reason, warning 케이스를 모두 고립된 데이터로 재현한다. <!-- omo:id=arnr-acc-020;stage=2;scope=backend;review=3 -->
- [ ] isolated real PostgreSQL 검증 환경은 로컬 fixture 경로와 분리되어야 하며, 실행 전후 데이터가 섞이지 않도록 독립 스키마 또는 독립 DB 수준의 격리를 보장한다. <!-- omo:id=arnr-acc-021;stage=2;scope=backend;review=3 -->
- [ ] TDD 순서를 따른다. 먼저 실패하는 백엔드 테스트로 규칙을 잠그고, 구현 후 동일 테스트와 전체 백엔드 검증으로 회귀를 막는다. <!-- omo:id=arnr-acc-022;stage=2;scope=backend;review=3 -->

## Manual QA

- [ ] 로컬에서 fixture 기반 재계산을 실행해 전체 `public.recipes` 분모, 세 상태 합계, `unclassified=0` 여부를 수동 점검한다. <!-- omo:id=arnr-acc-027;stage=2;scope=shared;review=3 -->
- [ ] 로컬에서 current 0건 / multiple current / `missing_reasons` / `warnings_json` / rollback 시나리오를 재실행해 실패가 조용히 삼켜지지 않는지 확인한다. <!-- omo:id=arnr-acc-028;stage=2;scope=shared;review=3 -->

## Automation Split

### Vitest / PostgreSQL

- [ ] Vitest는 재계산 분모, 세 상태 accounting, `unclassified=0`, current 0건/다중 current fail-closed, predecessor `missing_reasons` / `warnings_json` taxonomy 유지, replay 동일성, rollback no-delete를 고정한다. <!-- omo:id=arnr-acc-023;stage=2;scope=backend;review=3 -->
- [ ] PostgreSQL 실DB 테스트는 approved current chain 해석, atomic current 전환, concurrency drift 감지, historical Meal pin 유지, new Meal current 동작 불변을 검증한다. <!-- omo:id=arnr-acc-024;stage=2;scope=backend;review=3 -->
- [ ] 전체 백엔드 검증은 fixture 기반 테스트와 isolated real DB 테스트를 모두 포함하며, 결과 보고에서 두 경로를 섞지 않고 분리해 기록한다. <!-- omo:id=arnr-acc-025;stage=2;scope=backend;review=3 -->

### Playwright

- [x] Playwright는 N/A다. 이번 변경은 공개 UI/브라우저 흐름 추가가 없는 백엔드 내부 재계산 경로이므로, 브라우저 자동화 대신 Vitest와 PostgreSQL 실DB 검증이 권위 있는 자동화 수단이다. <!-- omo:id=arnr-acc-026;stage=2;scope=shared;review=3 -->

## Manual Only

- [ ] staging 또는 production 승인 환경에서 service role 실행 범위, 외부 승인 절차, 비밀값 취급 로그를 최종 점검한다.
- [ ] staging 또는 production 승인 환경에서 실제 운영 데이터 기준 샘플 재계산 결과를 검토하고, 배포 승인 기록을 남긴다.
