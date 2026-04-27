# 12b-shopping-pantry-reflect Acceptance Checklist

## Happy Path

- [x] 모두 추가(미전달) 시 유효 구매 항목만 팬트리에 반영되고 응답 카운트가 일치한다 <!-- omo:id=hp1-all-add;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 목록에 5개 아이템 존재 (3개 체크됨 `is_checked=true`, `is_pantry_excluded=false`)
  - **When**: 사용자가 "장보기 완료" 클릭 → 팝업에서 "모두 추가" 선택
  - **Then**: `POST /shopping/lists/{id}/complete` 호출 시 `add_to_pantry_item_ids` **미전달**, 체크된 3개 아이템이 모두 `pantry_items`에 추가됨 (아직 없는 ingredient만 INSERT), 응답 `{ success: true, data: { pantry_added: 3, pantry_added_item_ids: [uuid1, uuid2, uuid5] } }`, `shopping_lists.is_completed = true`, `meals.status = shopping_done`, 성공 토스트 메시지 표시

- [x] 선택 추가 시 선택한 아이템만 팬트리에 반영된다 <!-- omo:id=hp2-selective-add;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 목록에 5개 아이템 존재 (3개 체크됨 `is_pantry_excluded=false`)
  - **When**: 사용자가 팝업에서 2개 아이템만 선택 후 "선택 추가" 클릭
  - **Then**: `POST /shopping/lists/{id}/complete` 호출 시 `add_to_pantry_item_ids: [uuid1, uuid2]`, 선택한 2개 아이템만 `pantry_items`에 추가됨, 응답 `pantry_added = 2, pantry_added_item_ids = [uuid1, uuid2]`, `is_completed = true`, `meals.status = shopping_done`

- [x] 추가 안 함([]) 선택 시 팬트리 반영 없이 완료된다 <!-- omo:id=hp3-no-add;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 목록에 5개 아이템 존재 (3개 체크됨)
  - **When**: 사용자가 팝업에서 "추가 안 함" 클릭
  - **Then**: `POST /shopping/lists/{id}/complete` 호출 시 `add_to_pantry_item_ids: []`, 팬트리에 아무것도 추가되지 않음, 응답 `pantry_added = 0, pantry_added_item_ids = []`, `is_completed = true`, `meals.status = shopping_done`

- [ ] 완료 후 팬트리 화면에서 추가된 아이템이 표시된다 <!-- omo:id=hp4-pantry-verification;stage=4;scope=frontend;review=6 -->
  - **Given**: 장보기 완료 후 2개 아이템이 팬트리에 추가됨
  - **When**: 사용자가 팬트리 화면으로 이동
  - **Then**: 추가된 2개 아이템이 팬트리 목록에 표시됨, 각 아이템의 이름·수량이 올바르게 표시됨

- [ ] 완료 후 쇼핑 목록 화면이 read-only 모드로 전환된다 <!-- omo:id=hp5-readonly-mode;stage=4;scope=frontend;review=6 -->
  - **Given**: 장보기 완료됨 (`is_completed=true`)
  - **When**: 사용자가 쇼핑 목록 화면에 재접근
  - **Then**: "아이템 추가" 버튼 비활성화, 각 아이템의 "삭제"/"수정" 버튼 비활성화, 체크박스 비활성화 (모두 12a 기능)

---

## State/Policy

- [x] pantry-excluded 아이템은 팬트리에 추가되지 않는다 <!-- omo:id=sp1-filter-excluded;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 아이템 중 `is_pantry_excluded=true`인 아이템 존재
  - **When**: "모두 추가" (미전달) 선택 후 완료
  - **Then**: `is_pantry_excluded=true`인 아이템은 팬트리에 추가되지 않음 (무시), 나머지 유효 아이템만 추가됨, 응답 `pantry_added` = 유효 아이템 개수

- [x] unchecked 아이템은 팬트리에 추가되지 않는다 <!-- omo:id=sp2-filter-unchecked;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 아이템 중 `is_checked=false`인 아이템 존재
  - **When**: "모두 추가" (미전달) 선택 후 완료
  - **Then**: `is_checked=false`인 아이템은 팬트리에 추가되지 않음 (무시), 체크된 아이템만 추가됨, 응답 `pantry_added` = 체크된 유효 아이템 개수

- [x] 이미 added_to_pantry=true인 아이템은 중복 반영되지 않으며 응답은 안정적이다 <!-- omo:id=sp3-idempotent-response;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 아이템 중 일부가 이미 `added_to_pantry=true`
  - **When**: 동일 선택으로 완료 재호출
  - **Then**: 이미 `added_to_pantry=true`인 항목은 재mutation하지 않음, 응답은 멱등하게 유효 선택 항목 기준으로 안정적으로 반환됨 (pantry_items INSERT는 스킵되지만 shopping_list_item 마킹 상태는 유지되고 응답에 포함됨)

- [x] 연결된 meals의 status가 shopping_done으로 전환된다 <!-- omo:id=sp4-meals-transition;stage=2;scope=backend;review=3,6 -->
  - **Given**: `meals.status = registered`
  - **When**: 쇼핑 목록 완료 API 호출
  - **Then**: 연결된 meals의 `status = shopping_done`으로 전환됨, `meals.updated_at` 갱신됨, 응답 `meals_updated` = 전환된 meals 개수

- [x] pantry_added 카운트와 pantry_added_item_ids 배열 길이가 일치한다 <!-- omo:id=sp5-count-invariant;stage=2;scope=backend;review=3,6 -->
  - **Given**: 장보기 완료 후
  - **Then**: 응답의 `pantry_added = pantry_added_item_ids.length`, 항상 카운트와 배열 길이가 일치함

- [x] 팬트리 추가된 아이템의 added_to_pantry 플래그가 true로 설정된다 <!-- omo:id=sp6-flag-update;stage=2;scope=backend;review=3,6 -->
  - **Given**: 2개 아이템이 팬트리에 추가됨
  - **When**: 완료 API 응답 확인
  - **Then**: 추가된 2개 아이템의 `shopping_list_items.added_to_pantry = true`, 추가되지 않은 아이템은 `added_to_pantry = false`

---

## Error/Permission

- [x] 이미 완료된 리스트 재완료 시 200과 동일 결과를 반환한다(멱등성) <!-- omo:id=ep1-idempotent-recomplete;stage=2;scope=backend;review=3,6 -->
  - **Given**: `shopping_lists.is_completed = true`
  - **When**: 동일 리스트에 완료 API 재호출
  - **Then**: `200` 응답 (에러 아님), 응답 `completed = true, pantry_added = N, pantry_added_item_ids = [...]` (리스트의 반영 상태 기준), 멱등하게 동작함

- [x] 다른 list 소속 ID는 무시되고 에러 없이 진행한다 <!-- omo:id=ep2-invalid-id-ignored;stage=2;scope=backend;review=3,6 -->
  - **Given**: 쇼핑 목록에 존재하지 않는 아이템 UUID
  - **When**: `add_to_pantry_item_ids: [valid_uuid, invalid_uuid]` 전달
  - **Then**: 무효 ID 무시 (에러 아님), 유효 아이템만 처리, `200` 응답, 응답 `pantry_added` = 유효 항목 개수만

- [x] excluded 항목 포함 시 무시되고 에러 없이 진행한다 <!-- omo:id=ep3-excluded-ignored;stage=2;scope=backend;review=3,6 -->
  - **Given**: 선택한 아이템 중 `is_pantry_excluded=true`인 항목 존재
  - **When**: `add_to_pantry_item_ids: [uuid1, excluded_uuid]` 전달
  - **Then**: excluded 항목 무시 (에러 아님), 유효 아이템만 처리, `200` 응답

- [x] unchecked 항목 포함 시 무시되고 에러 없이 진행한다 <!-- omo:id=ep4-unchecked-ignored;stage=2;scope=backend;review=3,6 -->
  - **Given**: 선택한 아이템 중 `is_checked=false`인 항목 존재
  - **When**: `add_to_pantry_item_ids: [uuid1, unchecked_uuid]` 전달
  - **Then**: unchecked 항목 무시 (에러 아님), 유효 아이템만 처리, `200` 응답

- [x] 모든 ID가 무효여도 완료는 성공한다 <!-- omo:id=ep5-all-invalid;stage=2;scope=backend;review=3,6 -->
  - **Given**: 모든 선택 아이템이 무효 (excluded/unchecked/다른 list)
  - **When**: `add_to_pantry_item_ids: [invalid1, invalid2]` 전달
  - **Then**: `200` 응답 (에러 아님), 응답 `pantry_added = 0, pantry_added_item_ids = []`, `is_completed = true`로 변경됨

- [x] 쇼핑 목록 미존재 시 404를 반환한다 <!-- omo:id=ep6-list-not-found;stage=2;scope=backend;review=3,6 -->
  - **Given**: 존재하지 않는 `list_id`
  - **When**: `POST /shopping/lists/invalid-uuid/complete` 호출
  - **Then**: `404` 응답, 공통 래퍼 `{ success: false, data: null, error: { code: "RESOURCE_NOT_FOUND", message: "...", fields: [] } }`

- [x] 권한 없는 사용자의 완료 시도 시 403을 반환한다 <!-- omo:id=ep7-forbidden;stage=2;scope=backend;review=3,6 -->
  - **Given**: `shopping_lists.user_id = uuid1`, 현재 사용자 = uuid2
  - **When**: 사용자 uuid2가 완료 API 호출
  - **Then**: `403` 응답, 공통 래퍼 `{ success: false, data: null, error: { code: "FORBIDDEN", message: "...", fields: [] } }`

---

## Data Integrity

- [ ] 완료 트랜잭션 실패 시 모든 변경이 롤백된다 <!-- omo:id=di1-transaction-atomicity;stage=2;scope=backend;review=3,6;waived=true;waived_by=claude;waived_stage=3;waived_reason=stage3_approved_existing_route_handler_pattern_without_rpc_transaction -->
  - **Given**: 완료 API 호출 중 DB 에러 발생
  - **When**: `pantry_items` 삽입 실패
  - **Then**: 전체 트랜잭션 롤백됨, `shopping_lists.is_completed = false` 유지됨, `meals.status = registered` 유지됨, 부분적 데이터 변경 없음

- [x] added_to_pantry=true 설정 시 CHECK 제약이 검증된다 <!-- omo:id=di2-check-constraint;stage=2;scope=backend;review=3,6 -->
  - **Given**: `shopping_list_items.added_to_pantry = true` 설정 시도
  - **When**: 해당 아이템이 `is_checked=false` 또는 `is_pantry_excluded=true`
  - **Then**: DB CHECK 제약 위반으로 실패, 서버는 이런 상황을 방지하는 로직 보유 (4단계 필터)

- [x] completed_at 타임스탬프가 정확히 기록된다 <!-- omo:id=di3-completed-at-timestamp;stage=2;scope=backend;review=3,6 -->
  - **Given**: 완료 API 호출 성공
  - **Then**: `shopping_lists.completed_at`이 현재 시각으로 설정됨, 타임존이 정확히 기록됨

- [x] pantry_added_item_ids 배열 순서가 일관되고 중복이 없다 <!-- omo:id=di4-item-ids-order;stage=2;scope=backend;review=3,6 -->
  - **Given**: 여러 아이템이 팬트리에 추가됨
  - **Then**: 응답 `pantry_added_item_ids` 배열이 일관된 순서 (아이템 ID 순서 또는 추가 순서), 중복 UUID 없음, 모든 UUID가 유효한 `shopping_list_items.id`임

---

## Data Setup/Preconditions

- [x] 테스트 데이터(사용자, 식사, 쇼핑 목록, 아이템)가 준비되어 있다 <!-- omo:id=setup-test-data;stage=2;scope=backend;review=3,6 -->
  - 사용자: `test_user_1` (uuid)
  - 식사: `meal_1`, `meal_2` (status=`registered`, user_id=test_user_1)
  - 쇼핑 목록: `shopping_list_1` (user_id=test_user_1, is_completed=false)
  - 쇼핑 아이템 5개: item_1~5 (다양한 is_checked, is_pantry_excluded 상태)

- [x] 사전 조건이 검증된다 <!-- omo:id=setup-preconditions;stage=2;scope=backend;review=3,6 -->
  - DB에 테스트 사용자 존재
  - `meals` 테이블에 `status=registered`인 레코드 존재
  - `shopping_lists` 테이블에 `is_completed=false`인 레코드 존재
  - `shopping_list_items`에 최소 5개 아이템 존재
  - `pantry_items` 테이블 존재 및 접근 가능

---

## Manual QA

### Manual Only

#### MQ-1: 팝업 UI 표시
- [ ] 완료 버튼 클릭 시 바텀시트 팝업이 화면 하단에서 슬라이드 업
- [ ] 팝업 제목: "팬트리에 추가할 아이템을 선택하세요"
- [ ] 체크된 아이템 중 `is_pantry_excluded=false`인 것만 리스트에 표시됨
- [ ] 각 아이템은 체크박스 + 이름 + 수량으로 표시됨

#### MQ-2: 팝업 인터랙션
- [ ] "모두 추가" 버튼이 primary 색상 (`--brand`)으로 표시됨
- [ ] "선택 추가" 버튼은 아이템 선택 시에만 활성화됨
- [ ] "추가 안 함" 버튼은 항상 활성화됨
- [ ] 팝업 외부 클릭 시 팝업이 닫힘 (취소)
- [ ] 뒤로가기 버튼 동작 (팝업 닫힘)

#### MQ-3: 로딩 상태
- [ ] 완료 API 호출 중 로딩 인디케이터 표시
- [ ] 버튼들이 비활성화되어 중복 클릭 방지됨
- [ ] API 완료 후 로딩 인디케이터 사라짐

#### MQ-4: 에러 메시지 UX
- [ ] 네트워크 에러 시 "네트워크 연결을 확인해주세요" 메시지
- [ ] `404 RESOURCE_NOT_FOUND` 시 "쇼핑 목록을 찾을 수 없습니다" 메시지
- [ ] `403 FORBIDDEN` 시 "권한이 없습니다" 메시지
- [ ] 에러 메시지는 토스트 또는 팝업 내부 인라인으로 표시됨

#### MQ-5: 완료 후 UI 상태
- [ ] 쇼핑 목록 화면 상단에 "완료됨" 배지 표시 (12a 기능)
- [ ] 모든 mutation 버튼이 시각적으로 비활성화됨 (회색 처리, 12a 기능)
- [ ] 팬트리에 추가된 아이템은 체크박스 옆에 작은 뱃지 표시
- [ ] 완료 시각 표시 (`completed_at`, 있는 경우)

#### MQ-6: 접근성
- [ ] 팝업이 키보드로 네비게이션 가능 (Tab, Enter, Esc)
- [ ] 스크린 리더가 팝업 제목과 버튼을 올바르게 읽음
- [ ] 포커스가 팝업 열릴 때 팝업 내부로 이동함
- [ ] Esc 키로 팝업 닫기 가능

#### MQ-7: 모바일 UX
- [ ] 터치 타겟이 최소 44x44px
- [ ] 바텀시트가 스와이프 다운으로 닫힘
- [ ] 아이템 리스트가 스크롤 가능 (많은 아이템일 때)
- [ ] Safe area 고려 (아이폰 노치, 하단 홈 인디케이터)

---

## Automation Split

### Vitest 단위 테스트
- [x] `completeShoppingList` 서비스 함수 — `add_to_pantry_item_ids` 미전달 처리 <!-- omo:id=vitest-undeclared;stage=2;scope=backend;review=3 -->
- [x] `completeShoppingList` 서비스 함수 — `add_to_pantry_item_ids: []` 처리 <!-- omo:id=vitest-empty-array;stage=2;scope=backend;review=3 -->
- [x] `completeShoppingList` 서비스 함수 — `add_to_pantry_item_ids: [uuid1, uuid2]` 처리 <!-- omo:id=vitest-selective;stage=2;scope=backend;review=3 -->
- [x] 4단계 필터 — pantry-excluded 필터링 로직 <!-- omo:id=vitest-filter-excluded;stage=2;scope=backend;review=3 -->
- [x] 4단계 필터 — unchecked 필터링 로직 <!-- omo:id=vitest-filter-unchecked;stage=2;scope=backend;review=3 -->
- [x] 4단계 필터 — 중복 방지 로직 (멱등성) <!-- omo:id=vitest-filter-duplicate;stage=2;scope=backend;review=3 -->
- [x] 카운트 일치 검증 (`pantry_added = pantry_added_item_ids.length`) <!-- omo:id=vitest-count-match;stage=2;scope=backend;review=3 -->
- [x] 무효 ID 무시 처리 (다른 list, excluded, unchecked) <!-- omo:id=vitest-invalid-ignored;stage=2;scope=backend;review=3 -->
- [x] 멱등성 (재호출 시 200) <!-- omo:id=vitest-idempotent;stage=2;scope=backend;review=3 -->
- [ ] 트랜잭션 롤백 시나리오 (모킹) <!-- omo:id=vitest-transaction-rollback;stage=2;scope=backend;review=3;waived=true;waived_by=claude;waived_stage=3;waived_reason=stage3_approved_existing_route_handler_pattern_without_rpc_transaction -->

### Playwright E2E 테스트
- [ ] **E2E-1**: 완료 버튼 클릭 → 팝업 표시 → "모두 추가" → 완료 → 팬트리 확인 <!-- omo:id=e2e-all-add;stage=4;scope=frontend;review=6 -->
- [ ] **E2E-2**: 완료 버튼 클릭 → 팝업 표시 → 2개 선택 → "선택 추가" → 완료 → 팬트리에 2개만 존재 <!-- omo:id=e2e-selective-add;stage=4;scope=frontend;review=6 -->
- [ ] **E2E-3**: 완료 버튼 클릭 → 팝업 표시 → "추가 안 함" → 완료 → 팬트리 비어있음 <!-- omo:id=e2e-no-add;stage=4;scope=frontend;review=6 -->
- [ ] **E2E-4**: 완료 후 쇼핑 목록 화면 재접근 → mutation 버튼 비활성화 확인 (12a 기능) <!-- omo:id=e2e-readonly-check;stage=4;scope=frontend;review=6 -->
- [ ] **E2E-5**: 완료 API 재호출 → 200 + 동일 결과 확인 (멱등성) <!-- omo:id=e2e-idempotent;stage=2;scope=backend;review=3;waived=true;waived_by=claude;waived_stage=3;waived_reason=stage3_approved_vitest_backend_contract_coverage -->
- [ ] **E2E-6**: meals 상태 전환 확인 (`registered → shopping_done`) <!-- omo:id=e2e-meals-transition;stage=2;scope=backend;review=3;waived=true;waived_by=claude;waived_stage=3;waived_reason=stage3_approved_vitest_backend_contract_coverage -->
- [ ] **E2E-7**: pantry-excluded 아이템 필터링 확인 (팝업에 표시 안 됨) <!-- omo:id=e2e-excluded-hidden;stage=4;scope=frontend;review=6 -->
- [ ] **E2E-8**: unchecked 아이템 자동 필터링 확인 (서버 측) <!-- omo:id=e2e-unchecked-filtered;stage=2;scope=backend;review=3;waived=true;waived_by=claude;waived_stage=3;waived_reason=stage3_approved_vitest_backend_contract_coverage -->

---

**작성일**: 2026-04-28
**작성자**: Claude (Stage 1)
**리뷰 상태**: Codex internal 1.5 docs gate passed after Claude repair 2
