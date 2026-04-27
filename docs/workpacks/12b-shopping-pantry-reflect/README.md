# 12b-shopping-pantry-reflect

## Goal

장보기 완료 시 **팬트리 반영 선택 팝업**을 제공하고, `add_to_pantry_item_ids`의 **3-way 의미론** (`null` / `[]` / 선택값)을 프론트·백엔드 양쪽에서 정확히 구현한다. 서버는 4단계 검증 프로세스로 유효한 아이템만 팬트리에 추가하고, 완료 후 쇼핑 목록 read-only 상태를 유지한다.

**핵심 목표**:
1. 사용자가 장보기 완료 직전 팝업에서 팬트리 반영 대상을 선택할 수 있음
2. `null` (기본 동작), `[]` (반영 안 함), 선택된 ID 배열 (해당 항목만 반영)의 3가지 시맨틱을 명확히 구분
3. 서버 4단계 검증: 소유권 확인 → pantry-excluded 필터 → unchecked 필터 → 중복 제거
4. `pantry_added` 카운트와 `pantry_added_item_ids` 길이가 일치
5. 완료 후 mutation API는 `409 Conflict` 반환

---

## Branches

- **Target branch**: `feature/12b-shopping-pantry-reflect`
- **Docs branch**: `docs/12b-shopping-pantry-reflect` (현재 브랜치)
- **Base**: `master`
- **Predecessor**: `12a-shopping-complete` (merged)

---

## In Scope

### Frontend
- **팝업 UI** (`ShoppingPantryReflectPopup.tsx`):
  - 장보기 완료 버튼 클릭 시 표시
  - 체크된 아이템 중 `is_pantry_excluded=false`인 항목만 선택지에 표시
  - "모두 추가", "선택 추가", "추가 안 함" 3가지 선택지 제공
  - 다중 선택 가능한 아이템 리스트 (체크박스)

- **3-way 의미론 구현**:
  - "모두 추가" 선택 → `add_to_pantry_item_ids: null` (기본 동작)
  - "추가 안 함" 선택 → `add_to_pantry_item_ids: []` (빈 배열)
  - "선택 추가" → `add_to_pantry_item_ids: [선택된 ID들]`

- **완료 API 호출**:
  - `POST /shopping/lists/{list_id}/complete`
  - 팝업에서 선택한 값을 `add_to_pantry_item_ids` 파라미터로 전달
  - 성공 시 쇼핑 목록 상태 업데이트, meals 상태 전환 (`shopping_done`)
  - 실패 시 에러 처리 (유효성, 권한, 중복 완료 등)

- **UI/UX 상태 관리**:
  - 완료 후 쇼핑 목록 화면을 read-only 모드로 전환
  - mutation 버튼들 (추가, 삭제, 수정, 체크) 비활성화
  - 팬트리 추가된 아이템은 시각적 표시 (`added_to_pantry: true`)

### Backend
- **완료 API 엔드포인트**: `POST /shopping/lists/{list_id}/complete`
  - **4단계 검증 프로세스**:
    1. 리스트 소유권 확인 (`user_id` 일치)
    2. `is_pantry_excluded=true`인 아이템 필터링
    3. `is_checked=false`인 아이템 필터링
    4. 중복 ID 제거 (이미 팬트리에 있는 경우)

  - **3-way 의미론 처리**:
    - `null`: 모든 유효 아이템 추가 (2·3·4 단계 필터 후)
    - `[]`: 팬트리 추가 없음
    - `[id1, id2, ...]`: 해당 ID만 2·3·4 단계 필터 후 추가

  - **트랜잭션 처리**:
    - `shopping_lists.is_completed = true`, `completed_at = NOW()`
    - `meals.status = shopping_done` 전환 (registered → shopping_done)
    - `shopping_list_items.added_to_pantry = true` (추가된 항목만)
    - `pantry_items` 레코드 생성
    - `shopping_lists.pantry_added` 카운트 업데이트 (추가된 개수)
    - `shopping_lists.pantry_added_item_ids` 배열 저장 (추가된 ID 목록)

  - **검증 규칙**:
    - `is_completed=true`인 리스트는 재완료 불가 (`409 Conflict`)
    - meals가 `registered` 상태가 아니면 `409 Conflict`
    - `pantry_added` = `pantry_added_item_ids.length`

- **Mutation API 보호**:
  - `POST /shopping/lists/{list_id}/items`
  - `PATCH /shopping/lists/{list_id}/items/{item_id}`
  - `DELETE /shopping/lists/{list_id}/items/{item_id}`
  - `PATCH /shopping/lists/{list_id}/items/{item_id}/check`
  - 위 4개 API는 `is_completed=true`일 때 `409 Conflict` 반환

### DB Schema
- **shopping_lists 테이블**:
  - `pantry_added_item_ids JSONB` (추가된 아이템 ID 배열)
  - 기존 `pantry_added INTEGER` 필드 활용

- **shopping_list_items 테이블**:
  - 기존 `added_to_pantry BOOLEAN` 필드 활용
  - CHECK 제약: `added_to_pantry=true`이면 `is_checked=true AND is_pantry_excluded=false`

### Testing
- **Vitest 단위 테스트**:
  - 3-way 의미론 로직 (null, [], 선택값)
  - 4단계 검증 필터링 로직
  - 중복 ID 제거 로직
  - 카운트 일치 검증

- **Playwright E2E**:
  - 팝업 표시 → "모두 추가" → 완료 → 팬트리 확인
  - 팝업 표시 → "선택 추가" (2개 선택) → 완료 → 팬트리 확인
  - 팝업 표시 → "추가 안 함" → 완료 → 팬트리 비어있음 확인
  - 완료 후 mutation API 호출 시 409 에러 확인

---

## Out of Scope

- **팬트리 화면 UI 개선**: 팬트리 아이템 목록 표시는 기존 기능 활용, 이 슬라이스에서는 변경하지 않음
- **추가 후 팬트리 아이템 수정/삭제**: 별도 슬라이스에서 처리
- **재료 중복 병합 로직**: 같은 재료가 이미 팬트리에 있을 때 수량 합산하는 기능은 향후 슬라이스
- **팬트리 아이템 카테고리 자동 분류**: 이 슬라이스에서는 단순 추가만 수행
- **팬트리 아이템 유효기간 관리**: 별도 기능으로 분리
- **bulk 완료 (여러 쇼핑 목록 동시 처리)**: 단일 목록만 처리

---

## Dependencies

### Prerequisite Slices (Merged)
- **12a-shopping-complete**: 기본 완료 API 엔드포인트, `is_completed` 플래그, meals 상태 전환 로직

### Blocked Slices (Waiting)
- **12c-shopping-pantry-sync** (planned): 팬트리 아이템 수량 병합, 중복 재료 처리
- **12d-pantry-item-edit** (planned): 팬트리 아이템 수정/삭제 기능

### External Dependencies
- DB 스키마: `shopping_lists.pantry_added_item_ids JSONB` 컬럼 필요 (migration)
- `pantry_items` 테이블 존재 가정 (기존 DB 설계에 포함)

---

## Backend First Contract

**Yes** — API 먼저 구현하고 E2E 통과 후 프론트엔드 작업 시작.

### API Contract
```typescript
// POST /shopping/lists/{list_id}/complete
Request Body:
{
  add_to_pantry_item_ids?: null | [] | number[]
}

Response 200:
{
  list_id: number
  is_completed: true
  completed_at: string (ISO 8601)
  pantry_added: number
  pantry_added_item_ids: number[]
  meal: {
    id: number
    status: "shopping_done"
  }
}

Response 400:
{
  error: "INVALID_ITEM_IDS"
  message: "One or more item IDs do not belong to this shopping list"
  invalid_ids: number[]
}

Response 404:
{
  error: "SHOPPING_LIST_NOT_FOUND"
  message: "Shopping list not found"
}

Response 409:
{
  error: "ALREADY_COMPLETED"
  message: "Shopping list is already completed"
}

Response 409:
{
  error: "INVALID_MEAL_STATUS"
  message: "Meal status must be 'registered' to complete shopping"
  current_status: string
}
```

### 4단계 검증 프로세스 (서버)
1. **소유권 확인**: `shopping_lists.user_id = 현재 사용자 ID`
2. **pantry-excluded 필터**: `is_pantry_excluded=false`만 통과
3. **unchecked 필터**: `is_checked=true`만 통과
4. **중복 제거**: 이미 `pantry_items`에 같은 재료가 있으면 스킵

### 3-way 의미론 우선순위
- `add_to_pantry_item_ids` 파라미터가 명시되지 않으면 `null`로 처리
- `null`: 모든 유효 아이템 추가 (기본 동작)
- `[]`: 명시적으로 추가 안 함
- `[1, 2, 3]`: 해당 ID만 추가 (단, 4단계 검증 통과한 것만)

### Mutation API 보호 계약
```typescript
// POST /shopping/lists/{list_id}/items
// PATCH /shopping/lists/{list_id}/items/{item_id}
// DELETE /shopping/lists/{list_id}/items/{item_id}
// PATCH /shopping/lists/{list_id}/items/{item_id}/check

Response 409 (when is_completed=true):
{
  error: "SHOPPING_LIST_COMPLETED"
  message: "Cannot modify a completed shopping list"
  completed_at: string
}
```

---

## Frontend Delivery Mode

**Backend First + E2E Gated**

1. **Stage 3**: 백엔드 API 구현 + Vitest 단위 테스트 (4단계 검증, 3-way 로직)
2. **E2E Gate**: Playwright 시나리오 작성 + API 테스트 (팝업 없이 직접 API 호출)
3. **Stage 4**: 프론트엔드 팝업 UI + 통합 + E2E 전체 통과

---

## Design Authority

**Not Required** — 팝업 UI는 기존 바텀시트 패턴 재사용, 새로운 디자인 검토 불필요.

- 바텀시트 레이아웃: `BottomSheet` 공용 컴포넌트
- 버튼 스타일: `--brand` 색상, `--radius-sm` radius
- 체크박스 리스트: 기존 `Checkbox` 컴포넌트 활용
- 디자인 토큰 준수: `design-tokens.md` 기준

---

## Design Status

**temporary** — 팝업 와이어프레임 미확정, Stage 1에서 텍스트 기반 레이아웃 제안 포함.

Stage 4 진입 전 `pending-review` 전환 필요 (design-critic 리뷰).

---

## Source Links

- **요구사항**: 요구사항기준선-v1.6.4.md § 1-6 장보기 > "장보기 완료 처리"
- **API**: api문서-v1.2.2.md § 8-5 `POST /shopping/lists/{list_id}/complete`, P0-2, P0-3 패치
- **DB**: db설계-v1.3.1.md § `shopping_lists`, `shopping_list_items`, `pantry_items`
- **화면**: 화면정의서-v1.5.1.md § SHOPPING_COMPLETE 화면 (팝업 레이아웃 참조)
- **Flow**: 유저flow맵-v1.3.1.md § "장보기 완료 → 팬트리 반영 선택 → 식사 진행"

---

## QA / Test Data Plan

### 테스트 데이터 준비
- **사용자**: `test_user_1` (user_id=1)
- **식사**: `meal_1` (status=`registered`, user_id=1)
- **쇼핑 목록**: `shopping_list_1` (meal_id=1, user_id=1, is_completed=false)
- **쇼핑 아이템**:
  - `item_1`: name="양파", is_checked=true, is_pantry_excluded=false
  - `item_2`: name="당근", is_checked=true, is_pantry_excluded=false
  - `item_3`: name="소금", is_checked=false, is_pantry_excluded=false (체크 안 됨)
  - `item_4`: name="설탕", is_checked=true, is_pantry_excluded=true (팬트리 제외)
  - `item_5`: name="간장", is_checked=true, is_pantry_excluded=false

### 시나리오별 기대 결과
1. **"모두 추가" (null)**:
   - 입력: `add_to_pantry_item_ids: null`
   - 기대: item_1, item_2, item_5만 팬트리에 추가 (item_3 unchecked, item_4 excluded 제외)
   - `pantry_added=3`, `pantry_added_item_ids=[1, 2, 5]`

2. **"선택 추가" ([1, 2])**:
   - 입력: `add_to_pantry_item_ids: [1, 2]`
   - 기대: item_1, item_2만 팬트리에 추가
   - `pantry_added=2`, `pantry_added_item_ids=[1, 2]`

3. **"추가 안 함" ([])**:
   - 입력: `add_to_pantry_item_ids: []`
   - 기대: 팬트리 추가 없음
   - `pantry_added=0`, `pantry_added_item_ids=[]`

4. **잘못된 ID 포함 ([1, 999])**:
   - 입력: `add_to_pantry_item_ids: [1, 999]`
   - 기대: `400 Bad Request`, `invalid_ids=[999]`

5. **완료 후 재완료**:
   - 입력: `is_completed=true`인 리스트에 재요청
   - 기대: `409 Conflict`, `error: ALREADY_COMPLETED`

6. **완료 후 mutation 시도**:
   - `POST /shopping/lists/{list_id}/items` 호출
   - 기대: `409 Conflict`, `error: SHOPPING_LIST_COMPLETED`

### Manual QA 체크리스트
- [ ] 팝업이 완료 버튼 클릭 시 표시되는가?
- [ ] "모두 추가" 선택 시 모든 유효 아이템이 팬트리에 추가되는가?
- [ ] "선택 추가" 시 선택한 아이템만 추가되는가?
- [ ] "추가 안 함" 시 팬트리에 아무것도 추가되지 않는가?
- [ ] 완료 후 아이템 추가/수정/삭제 버튼이 비활성화되는가?
- [ ] 팬트리 화면에서 추가된 아이템이 표시되는가?
- [ ] meals 상태가 `shopping_done`으로 전환되는가?

---

## Key Rules

### Domain Rules
1. **3-way 의미론**: `null` (기본), `[]` (추가 안 함), `[ids]` (선택 추가)
2. **4단계 검증**: 소유권 → pantry-excluded 필터 → unchecked 필터 → 중복 제거
3. **카운트 일치**: `pantry_added = pantry_added_item_ids.length`
4. **Read-only 보장**: `is_completed=true` 후 mutation API는 `409 Conflict`
5. **Meals 상태 전환**: `registered → shopping_done` (완료 시)
6. **CHECK 제약**: `added_to_pantry=true`이면 `is_checked=true AND is_pantry_excluded=false`

### Validation Rules
- `add_to_pantry_item_ids`에 포함된 모든 ID는 해당 쇼핑 목록에 속해야 함 (아니면 `400`)
- `is_completed=true`인 리스트는 재완료 불가 (`409`)
- meals 상태가 `registered`가 아니면 완료 불가 (`409`)
- unchecked 또는 pantry-excluded 아이템은 자동 필터 (에러 아님)

### Error Handling
- `400 INVALID_ITEM_IDS`: 잘못된 아이템 ID 포함 시
- `404 SHOPPING_LIST_NOT_FOUND`: 리스트 존재하지 않음
- `409 ALREADY_COMPLETED`: 이미 완료된 리스트
- `409 INVALID_MEAL_STATUS`: meals 상태가 `registered`가 아님
- `409 SHOPPING_LIST_COMPLETED`: 완료된 리스트에 mutation 시도

### UI/UX Rules
- 팝업은 바텀시트 형태로 표시 (화면 하단에서 슬라이드 업)
- 체크된 아이템 중 `is_pantry_excluded=false`인 것만 선택지에 표시
- "모두 추가" 버튼은 primary 색상 (`--brand`)
- 완료 후 쇼핑 목록 화면은 읽기 전용 모드 (mutation 버튼 비활성화)
- 팬트리 추가된 아이템은 체크박스 옆에 작은 뱃지 표시 (`added_to_pantry=true`)

---

## Contract Evolution Candidates

### 향후 확장 가능성
1. **수량 병합 로직**: 같은 재료가 팬트리에 이미 있으면 수량 합산 (현재는 중복 스킵)
2. **카테고리 자동 분류**: 팬트리 아이템을 카테고리별로 자동 분류
3. **유효기간 설정**: 팬트리 추가 시 유효기간 입력 옵션
4. **bulk 완료**: 여러 쇼핑 목록을 한 번에 완료 + 팬트리 반영
5. **팬트리 아이템 메타데이터**: 추가 시각, 출처 (쇼핑 목록 ID) 기록

### 현재 계약에서 보장하지 않는 것
- 팬트리 아이템 수정/삭제 (별도 슬라이스)
- 중복 재료 수량 병합 (현재는 스킵)
- 팬트리 화면 UI 개선 (기존 기능 활용)

---

## Primary User Path

### Happy Path (완료 + 팬트리 반영)
1. 사용자가 쇼핑 목록 화면에서 아이템들을 체크
2. "장보기 완료" 버튼 클릭
3. **팝업 표시**: "팬트리에 추가할 아이템을 선택하세요"
4. 사용자가 선택:
   - **옵션 A**: "모두 추가" 버튼 클릭 → `add_to_pantry_item_ids: null`
   - **옵션 B**: 일부 아이템 선택 후 "선택 추가" 클릭 → `add_to_pantry_item_ids: [1, 2]`
   - **옵션 C**: "추가 안 함" 클릭 → `add_to_pantry_item_ids: []`
5. `POST /shopping/lists/{list_id}/complete` 호출
6. **서버 처리**:
   - 4단계 검증 수행
   - `shopping_lists.is_completed = true`, `completed_at = NOW()`
   - `meals.status = shopping_done` 전환
   - 유효 아이템만 `pantry_items` 추가
   - `pantry_added`, `pantry_added_item_ids` 업데이트
7. **응답 수신**: `200 OK` + 완료된 리스트 정보
8. **UI 업데이트**:
   - 쇼핑 목록 화면 읽기 전용 모드 전환
   - mutation 버튼 비활성화
   - 성공 토스트 메시지 표시
9. 사용자가 팬트리 화면으로 이동 → 추가된 아이템 확인

### Edge Cases
- **체크된 아이템 없음**: 팝업에서 "추가할 아이템이 없습니다" 메시지 표시, "추가 안 함"만 활성화
- **모든 아이템이 pantry-excluded**: 위와 동일 처리
- **잘못된 ID 선택**: `400 Bad Request` 에러 → 팝업에서 에러 메시지 표시
- **완료 후 재접근**: "이미 완료된 목록입니다" 메시지, mutation 버튼 비활성화 상태 유지

---

## Delivery Checklist

### Stage 1 (Docs) — Claude 담당
- [x] `docs/workpacks/12b-shopping-pantry-reflect/README.md` 생성
- [ ] `docs/workpacks/12b-shopping-pantry-reflect/acceptance.md` 생성
- [ ] `docs/workpacks/12b-shopping-pantry-reflect/automation-spec.json` 생성
- [ ] `.workflow-v2/work-items/12b-shopping-pantry-reflect.json` 생성
- [ ] `.workflow-v2/status.json` 업데이트
- [ ] `docs/workpacks/README.md` 상태 변경 (`planned` → `docs`)
- [ ] Internal 1.5 docs gate 통과 (Codex 리뷰)

### Stage 2 (Scaffold) — Codex 담당
- [ ] DB migration: `shopping_lists.pantry_added_item_ids JSONB` 컬럼 추가
- [ ] 타입 정의: `CompleteShopping` request/response types
- [ ] API route 뼈대: `POST /shopping/lists/:id/complete`
- [ ] Repository 메서드 시그니처
- [ ] 프론트엔드 컴포넌트 파일 생성 (`ShoppingPantryReflectPopup.tsx`)

### Stage 3 (Backend) — Claude 담당
- [ ] 완료 API 로직 구현 (4단계 검증, 3-way 의미론)
- [ ] Vitest 단위 테스트 (필터링, 중복 제거, 카운트 일치)
- [ ] Mutation API 보호 로직 (`409` 응답)
- [ ] E2E API 테스트 (Playwright, 팝업 없이 직접 호출)

### Stage 4 (Frontend) — Claude 담당
- [ ] 팝업 UI 구현 (`ShoppingPantryReflectPopup.tsx`)
- [ ] 완료 버튼 클릭 → 팝업 표시 로직
- [ ] 3가지 선택지 핸들러 (모두/선택/안 함)
- [ ] API 호출 + 응답 처리
- [ ] 읽기 전용 모드 전환 로직
- [ ] E2E 전체 시나리오 통과 (팝업 포함)

### Stage 5 (Polish) — Codex 담당
- [ ] 에러 메시지 다국어 처리
- [ ] 로딩 상태 UX 개선
- [ ] 접근성 검증 (키보드 네비게이션, 스크린 리더)
- [ ] 성능 최적화 (불필요한 리렌더링 제거)

### Stage 6 (Review) — Codex 담당
- [ ] Codex self-review (코드 품질, 테스트 커버리지)
- [ ] Claude authority review (계약 준수, 에러 처리)
- [ ] Manual QA 체크리스트 완료
- [ ] PR 생성 + 머지

---

**작성일**: 2026-04-28
**작성자**: Claude (Stage 1)
**리뷰 상태**: Pending Codex internal 1.5 docs gate
