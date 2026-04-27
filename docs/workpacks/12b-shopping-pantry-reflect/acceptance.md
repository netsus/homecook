# 12b-shopping-pantry-reflect Acceptance Checklist

## Happy Path

### HP-1: 모두 추가 (null) 시나리오
- [ ] **Given**: 쇼핑 목록에 5개 아이템 존재 (3개 체크됨, `is_pantry_excluded=false`)
- [ ] **When**: 사용자가 "장보기 완료" 클릭 → 팝업에서 "모두 추가" 선택
- [ ] **Then**:
  - `POST /shopping/lists/{id}/complete` 호출 시 `add_to_pantry_item_ids: null`
  - 체크된 3개 아이템이 모두 `pantry_items`에 추가됨
  - `shopping_lists.pantry_added = 3`
  - `shopping_lists.pantry_added_item_ids = [1, 2, 5]` (체크된 아이템 ID들)
  - `shopping_lists.is_completed = true`
  - `meals.status = shopping_done`
  - 성공 토스트 메시지 표시

### HP-2: 선택 추가 시나리오
- [ ] **Given**: 쇼핑 목록에 5개 아이템 존재 (3개 체크됨, `is_pantry_excluded=false`)
- [ ] **When**: 사용자가 팝업에서 2개 아이템만 선택 후 "선택 추가" 클릭
- [ ] **Then**:
  - `POST /shopping/lists/{id}/complete` 호출 시 `add_to_pantry_item_ids: [1, 2]`
  - 선택한 2개 아이템만 `pantry_items`에 추가됨
  - `shopping_lists.pantry_added = 2`
  - `shopping_lists.pantry_added_item_ids = [1, 2]`
  - `shopping_lists.is_completed = true`
  - `meals.status = shopping_done`

### HP-3: 추가 안 함 ([]) 시나리오
- [ ] **Given**: 쇼핑 목록에 5개 아이템 존재 (3개 체크됨)
- [ ] **When**: 사용자가 팝업에서 "추가 안 함" 클릭
- [ ] **Then**:
  - `POST /shopping/lists/{id}/complete` 호출 시 `add_to_pantry_item_ids: []`
  - 팬트리에 아무것도 추가되지 않음
  - `shopping_lists.pantry_added = 0`
  - `shopping_lists.pantry_added_item_ids = []`
  - `shopping_lists.is_completed = true`
  - `meals.status = shopping_done`

### HP-4: 완료 후 팬트리 확인
- [ ] **Given**: 장보기 완료 후 2개 아이템이 팬트리에 추가됨
- [ ] **When**: 사용자가 팬트리 화면으로 이동
- [ ] **Then**:
  - 추가된 2개 아이템이 팬트리 목록에 표시됨
  - 각 아이템의 이름, 수량이 올바르게 표시됨

### HP-5: 완료 후 쇼핑 목록 화면 Read-only
- [ ] **Given**: 장보기 완료됨 (`is_completed=true`)
- [ ] **When**: 사용자가 쇼핑 목록 화면에 재접근
- [ ] **Then**:
  - "아이템 추가" 버튼이 비활성화됨
  - 각 아이템의 "삭제" 버튼이 비활성화됨
  - 각 아이템의 "수정" 버튼이 비활성화됨
  - 체크박스가 비활성화됨 (또는 숨겨짐)
  - "이미 완료된 목록입니다" 안내 메시지 표시

---

## State/Policy

### SP-1: 4단계 검증 — pantry-excluded 필터
- [ ] **Given**: 쇼핑 아이템 중 `is_pantry_excluded=true`인 아이템 존재
- [ ] **When**: "모두 추가" (`null`) 선택 후 완료
- [ ] **Then**:
  - `is_pantry_excluded=true`인 아이템은 팬트리에 추가되지 않음
  - 나머지 유효 아이템만 추가됨
  - `pantry_added` = 유효 아이템 개수

### SP-2: 4단계 검증 — unchecked 필터
- [ ] **Given**: 쇼핑 아이템 중 `is_checked=false`인 아이템 존재
- [ ] **When**: "모두 추가" (`null`) 선택 후 완료
- [ ] **Then**:
  - `is_checked=false`인 아이템은 팬트리에 추가되지 않음
  - 체크된 아이템만 추가됨
  - `pantry_added` = 체크된 유효 아이템 개수

### SP-3: 4단계 검증 — 중복 제거 (이미 팬트리에 있는 재료)
- [ ] **Given**: 쇼핑 아이템 중 일부가 이미 팬트리에 존재함
- [ ] **When**: "모두 추가" 선택 후 완료
- [ ] **Then**:
  - 이미 팬트리에 있는 재료는 스킵됨 (중복 추가 안 함)
  - 팬트리에 없는 재료만 추가됨
  - `pantry_added` = 실제 추가된 개수 (중복 제외)

### SP-4: Meals 상태 전환
- [ ] **Given**: `meals.status = registered`
- [ ] **When**: 쇼핑 목록 완료 API 호출
- [ ] **Then**:
  - `meals.status = shopping_done`으로 전환됨
  - `meals.updated_at` 갱신됨

### SP-5: 카운트 일치 불변성
- [ ] **Given**: 장보기 완료 후
- [ ] **Then**:
  - `shopping_lists.pantry_added = shopping_lists.pantry_added_item_ids.length`
  - 항상 카운트와 배열 길이가 일치함

### SP-6: added_to_pantry 플래그 업데이트
- [ ] **Given**: 2개 아이템이 팬트리에 추가됨
- [ ] **When**: 완료 API 응답 확인
- [ ] **Then**:
  - 추가된 2개 아이템의 `shopping_list_items.added_to_pantry = true`
  - 추가되지 않은 아이템은 `added_to_pantry = false`

---

## Error/Permission

### EP-1: 이미 완료된 리스트 재완료 시도
- [ ] **Given**: `shopping_lists.is_completed = true`
- [ ] **When**: 동일 리스트에 완료 API 재호출
- [ ] **Then**:
  - `409 Conflict` 응답
  - `error: "ALREADY_COMPLETED"`
  - `message: "Shopping list is already completed"`
  - `completed_at` 필드 포함됨

### EP-2: 잘못된 아이템 ID 포함
- [ ] **Given**: 쇼핑 목록에 존재하지 않는 아이템 ID
- [ ] **When**: `add_to_pantry_item_ids: [1, 999]` 전달
- [ ] **Then**:
  - `400 Bad Request` 응답
  - `error: "INVALID_ITEM_IDS"`
  - `message: "One or more item IDs do not belong to this shopping list"`
  - `invalid_ids: [999]` 포함됨

### EP-3: 쇼핑 목록 미존재
- [ ] **Given**: 존재하지 않는 `list_id`
- [ ] **When**: `POST /shopping/lists/99999/complete` 호출
- [ ] **Then**:
  - `404 Not Found` 응답
  - `error: "SHOPPING_LIST_NOT_FOUND"`
  - `message: "Shopping list not found"`

### EP-4: Meals 상태가 registered 아님
- [ ] **Given**: `meals.status = shopping_done` (이미 완료됨)
- [ ] **When**: 쇼핑 목록 완료 API 호출
- [ ] **Then**:
  - `409 Conflict` 응답
  - `error: "INVALID_MEAL_STATUS"`
  - `message: "Meal status must be 'registered' to complete shopping"`
  - `current_status: "shopping_done"` 포함됨

### EP-5: 완료 후 아이템 추가 시도
- [ ] **Given**: `shopping_lists.is_completed = true`
- [ ] **When**: `POST /shopping/lists/{id}/items` 호출 (새 아이템 추가)
- [ ] **Then**:
  - `409 Conflict` 응답
  - `error: "SHOPPING_LIST_COMPLETED"`
  - `message: "Cannot modify a completed shopping list"`
  - `completed_at` 포함됨

### EP-6: 완료 후 아이템 수정 시도
- [ ] **Given**: `shopping_lists.is_completed = true`
- [ ] **When**: `PATCH /shopping/lists/{id}/items/{item_id}` 호출
- [ ] **Then**:
  - `409 Conflict` 응답
  - `error: "SHOPPING_LIST_COMPLETED"`

### EP-7: 완료 후 아이템 삭제 시도
- [ ] **Given**: `shopping_lists.is_completed = true`
- [ ] **When**: `DELETE /shopping/lists/{id}/items/{item_id}` 호출
- [ ] **Then**:
  - `409 Conflict` 응답
  - `error: "SHOPPING_LIST_COMPLETED"`

### EP-8: 완료 후 체크 토글 시도
- [ ] **Given**: `shopping_lists.is_completed = true`
- [ ] **When**: `PATCH /shopping/lists/{id}/items/{item_id}/check` 호출
- [ ] **Then**:
  - `409 Conflict` 응답
  - `error: "SHOPPING_LIST_COMPLETED"`

### EP-9: 권한 없는 사용자의 완료 시도
- [ ] **Given**: `shopping_lists.user_id = 1`, 현재 사용자 ID = 2
- [ ] **When**: 사용자 2가 완료 API 호출
- [ ] **Then**:
  - `403 Forbidden` 응답
  - `error: "FORBIDDEN"`
  - `message: "You do not have permission to complete this shopping list"`

---

## Data Integrity

### DI-1: 트랜잭션 원자성
- [ ] **Given**: 완료 API 호출 중 DB 에러 발생
- [ ] **When**: `pantry_items` 삽입 실패
- [ ] **Then**:
  - 전체 트랜잭션 롤백됨
  - `shopping_lists.is_completed = false` 유지됨
  - `meals.status = registered` 유지됨
  - 부분적 데이터 변경 없음

### DI-2: CHECK 제약 검증
- [ ] **Given**: `shopping_list_items.added_to_pantry = true` 설정 시도
- [ ] **When**: 해당 아이템이 `is_checked=false` 또는 `is_pantry_excluded=true`
- [ ] **Then**:
  - DB CHECK 제약 위반으로 삽입/업데이트 실패
  - 에러 메시지 반환

### DI-3: completed_at 타임스탬프
- [ ] **Given**: 완료 API 호출 성공
- [ ] **Then**:
  - `shopping_lists.completed_at`이 현재 시각으로 설정됨
  - ISO 8601 형식으로 반환됨
  - 타임존이 정확히 기록됨

### DI-4: pantry_added_item_ids 배열 순서
- [ ] **Given**: 여러 아이템이 팬트리에 추가됨
- [ ] **Then**:
  - `pantry_added_item_ids` 배열이 아이템 ID 순서대로 정렬됨 (또는 추가 순서)
  - 중복 ID 없음
  - 모든 ID가 유효한 `shopping_list_items.id`임

---

## Data Setup/Preconditions

### 테스트 데이터 시드
```sql
-- 사용자
INSERT INTO users (id, email, name) VALUES (1, 'test@example.com', 'Test User');

-- 식사
INSERT INTO meals (id, user_id, status, title) VALUES (1, 1, 'registered', '저녁 식사');

-- 쇼핑 목록
INSERT INTO shopping_lists (id, meal_id, user_id, is_completed)
VALUES (1, 1, 1, false);

-- 쇼핑 아이템
INSERT INTO shopping_list_items (id, shopping_list_id, name, is_checked, is_pantry_excluded) VALUES
(1, 1, '양파', true, false),
(2, 1, '당근', true, false),
(3, 1, '소금', false, false),  -- 체크 안 됨
(4, 1, '설탕', true, true),   -- pantry-excluded
(5, 1, '간장', true, false);

-- 기존 팬트리 아이템 (중복 테스트용)
INSERT INTO pantry_items (user_id, name, quantity) VALUES (1, '간장', 1);
```

### 사전 조건 검증
- [ ] DB에 테스트 사용자 존재 (`user_id=1`)
- [ ] `meals` 테이블에 `status=registered`인 레코드 존재
- [ ] `shopping_lists` 테이블에 `is_completed=false`인 레코드 존재
- [ ] `shopping_list_items`에 최소 5개 아이템 존재 (다양한 상태)
- [ ] `pantry_items` 테이블 존재 및 접근 가능

---

## Manual QA

### MQ-1: 팝업 UI 표시
- [ ] 완료 버튼 클릭 시 바텀시트 팝업이 화면 하단에서 슬라이드 업
- [ ] 팝업 제목: "팬트리에 추가할 아이템을 선택하세요"
- [ ] 체크된 아이템 중 `is_pantry_excluded=false`인 것만 리스트에 표시됨
- [ ] 각 아이템은 체크박스 + 이름 + 수량으로 표시됨

### MQ-2: 팝업 인터랙션
- [ ] "모두 추가" 버튼이 primary 색상 (`--brand`)으로 표시됨
- [ ] "선택 추가" 버튼은 아이템 선택 시에만 활성화됨
- [ ] "추가 안 함" 버튼은 항상 활성화됨
- [ ] 팝업 외부 클릭 시 팝업이 닫힘 (취소)
- [ ] 뒤로가기 버튼 동작 (팝업 닫힘)

### MQ-3: 로딩 상태
- [ ] 완료 API 호출 중 로딩 인디케이터 표시
- [ ] 버튼들이 비활성화되어 중복 클릭 방지됨
- [ ] API 완료 후 로딩 인디케이터 사라짐

### MQ-4: 에러 메시지 UX
- [ ] 네트워크 에러 시 "네트워크 연결을 확인해주세요" 메시지
- [ ] `400 INVALID_ITEM_IDS` 시 "잘못된 아이템이 포함되어 있습니다" 메시지
- [ ] `409 ALREADY_COMPLETED` 시 "이미 완료된 목록입니다" 메시지
- [ ] 에러 메시지는 토스트 또는 팝업 내부 인라인으로 표시됨

### MQ-5: 완료 후 UI 상태
- [ ] 쇼핑 목록 화면 상단에 "완료됨" 배지 표시
- [ ] 모든 mutation 버튼이 시각적으로 비활성화됨 (회색 처리)
- [ ] 팬트리에 추가된 아이템은 체크박스 옆에 작은 뱃지 표시
- [ ] 완료 시각 표시 (`completed_at`)

### MQ-6: 접근성
- [ ] 팝업이 키보드로 네비게이션 가능 (Tab, Enter, Esc)
- [ ] 스크린 리더가 팝업 제목과 버튼을 올바르게 읽음
- [ ] 포커스가 팝업 열릴 때 팝업 내부로 이동함
- [ ] Esc 키로 팝업 닫기 가능

### MQ-7: 모바일 UX
- [ ] 터치 타겟이 최소 44x44px
- [ ] 바텀시트가 스와이프 다운으로 닫힘
- [ ] 아이템 리스트가 스크롤 가능 (많은 아이템일 때)
- [ ] Safe area 고려 (아이폰 노치, 하단 홈 인디케이터)

---

## Automation Split

### Vitest 단위 테스트
- [ ] `completeShoppingList` 서비스 함수 — `add_to_pantry_item_ids: null` 처리
- [ ] `completeShoppingList` 서비스 함수 — `add_to_pantry_item_ids: []` 처리
- [ ] `completeShoppingList` 서비스 함수 — `add_to_pantry_item_ids: [1, 2]` 처리
- [ ] 4단계 검증 — pantry-excluded 필터링 로직
- [ ] 4단계 검증 — unchecked 필터링 로직
- [ ] 4단계 검증 — 중복 ID 제거 로직
- [ ] 카운트 일치 검증 (`pantry_added = pantry_added_item_ids.length`)
- [ ] `ALREADY_COMPLETED` 에러 핸들링
- [ ] `INVALID_ITEM_IDS` 에러 핸들링
- [ ] `INVALID_MEAL_STATUS` 에러 핸들링
- [ ] Mutation API 보호 로직 (완료 후 409 반환)
- [ ] 트랜잭션 롤백 시나리오 (모킹)

### Playwright E2E 테스트
- [ ] **E2E-1**: 완료 버튼 클릭 → 팝업 표시 → "모두 추가" → 완료 → 팬트리 확인
- [ ] **E2E-2**: 완료 버튼 클릭 → 팝업 표시 → 2개 선택 → "선택 추가" → 완료 → 팬트리에 2개만 존재
- [ ] **E2E-3**: 완료 버튼 클릭 → 팝업 표시 → "추가 안 함" → 완료 → 팬트리 비어있음
- [ ] **E2E-4**: 완료 후 쇼핑 목록 화면 재접근 → mutation 버튼 비활성화 확인
- [ ] **E2E-5**: 완료 후 아이템 추가 시도 → 409 에러 확인
- [ ] **E2E-6**: 이미 완료된 리스트에 재완료 시도 → 409 에러 확인
- [ ] **E2E-7**: meals 상태 전환 확인 (`registered → shopping_done`)
- [ ] **E2E-8**: pantry-excluded 아이템 필터링 확인 (팝업에 표시 안 됨)
- [ ] **E2E-9**: unchecked 아이템 자동 필터링 확인 (서버 측)

---

**작성일**: 2026-04-28
**작성자**: Claude (Stage 1)
**리뷰 상태**: Pending Codex internal 1.5 docs gate
