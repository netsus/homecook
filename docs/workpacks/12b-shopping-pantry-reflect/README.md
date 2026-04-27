# 12b-shopping-pantry-reflect

## Goal

장보기 완료 시 **팬트리 반영 선택 팝업**을 제공하고, `add_to_pantry_item_ids`의 **3-way 의미론** (미전달 / `[]` / 선택값)을 프론트·백엔드 양쪽에서 정확히 구현한다. 서버는 4단계 검증 프로세스로 유효한 아이템만 팬트리에 추가하며, 무효 항목은 무시하고 진행한다. 완료 API는 멱등하며 재호출 시 `200`과 동일 결과를 반환한다.

**핵심 목표**:
1. 사용자가 장보기 완료 직전 팝업에서 팬트리 반영 대상을 선택할 수 있음
2. **미전달** (기본 동작), `[]` (반영 안 함), 선택된 UUID 배열 (해당 항목만 반영)의 3가지 시맨틱을 명확히 구분
3. 서버 4단계 검증/필터: list 소속 여부 → pantry-excluded 필터 → unchecked 필터 → 이미 `added_to_pantry=true` 중복 방지
4. 응답의 `pantry_added` 카운트와 `pantry_added_item_ids.length`가 일치
5. 무효 항목(다른 list 소속, excluded, unchecked)은 **무시하고 진행** (`200` 반환, 유효 항목만 처리)

---

## Branches

- **Backend branch**: `feature/be-12b-shopping-pantry-reflect`
- **Frontend branch**: `feature/fe-12b-shopping-pantry-reflect`
- **Docs branch**: `docs/12b-shopping-pantry-reflect` (현재 브랜치)
- **Base**: `master`
- **Predecessor**: `12a-shopping-complete` (merged)

---

## In Scope

### Frontend
- **팝업 UI** (기존 bottom sheet 패턴 재사용):
  - 장보기 완료 버튼 클릭 시 표시
  - 체크된 아이템 중 `is_pantry_excluded=false`인 항목만 선택지에 표시
  - "모두 추가", "선택 추가", "추가 안 함" 3가지 선택지 제공
  - 다중 선택 가능한 아이템 리스트 (체크박스)

- **3-way 의미론 구현**:
  - "모두 추가" 선택 → `add_to_pantry_item_ids` **미전달** (undefined)
  - "추가 안 함" 선택 → `add_to_pantry_item_ids: []` (빈 배열)
  - "선택 추가" → `add_to_pantry_item_ids: [uuid1, uuid2, ...]`

- **완료 API 호출**:
  - `POST /shopping/lists/{list_id}/complete`
  - 팝업에서 선택한 값을 `add_to_pantry_item_ids` 파라미터로 전달
  - 공통 응답 래퍼 `{ success, data, error }` 처리
  - 성공 시 쇼핑 목록 상태 업데이트, meals 상태 전환 (`shopping_done`)
  - 실패 시 에러 처리 (권한, 리소스 없음 등)

- **UI/UX 상태 관리**:
  - 완료 후 쇼핑 목록 화면을 read-only 모드로 전환 (이미 12a에서 구현됨)
  - 팬트리 추가된 아이템은 시각적 표시 (`added_to_pantry: true`)

### Backend
- **완료 API 엔드포인트**: `POST /shopping/lists/{list_id}/complete`
  - **4단계 검증/필터 프로세스** (무효 항목 무시):
    1. 모든 item_id가 해당 list_id 소속인지 확인 (아니면 무시)
    2. `is_pantry_excluded=true`인 항목은 무시
    3. `is_checked=false`인 항목은 무시
    4. 이미 `added_to_pantry=true`인 항목은 중복 반영하지 않음 (멱등성)

  - **3-way 의미론 처리**:
    - **미전달** (`undefined/null`): 기본값 정책 적용 (`is_checked=true AND is_pantry_excluded=false` 전부 추가)
    - `[]`: 팬트리 반영 안 함 (`pantry_added=0`)
    - `[uuid1, uuid2, ...]`: 해당 ID만 4단계 필터 후 추가

  - **트랜잭션 처리**:
    - `shopping_lists.is_completed = true`, `completed_at = NOW()`
    - 연결된 meals의 `status = shopping_done` 전환 (registered → shopping_done)
    - `shopping_list_items.added_to_pantry = true` (추가된 항목만)
    - `pantry_items` 레코드 생성 (아직 없는 ingredient만 INSERT)

  - **멱등성**:
    - 이미 `is_completed=true`인 리스트 재호출 시 `200` 반환, 동일 결과 응답
    - 응답의 `pantry_added` / `pantry_added_item_ids`는 리스트의 반영 상태를 기준으로 안정적으로 반환됨 (유효 선택 항목 기준)

  - **응답 (200)** 공통 래퍼 `{ success: true, data: {...}, error: null }`의 `data`:
    ```json
    {
      "completed": true,
      "meals_updated": 4,
      "pantry_added": 3,
      "pantry_added_item_ids": ["item-uuid-1", "item-uuid-3", "item-uuid-5"]
    }
    ```
    - `pantry_added` = `pantry_added_item_ids.length` (항상 일치)
    - pantry_items에 이미 존재하여 INSERT가 발생하지 않더라도, 사용자가 선택한 항목은 `added_to_pantry=true`로 마킹되며 `pantry_added_item_ids`에 포함됨

- **에러 응답** (공통 래퍼 `{ success: false, data: null, error: {...} }`):
  - `404 RESOURCE_NOT_FOUND`: 쇼핑 목록 존재하지 않음
  - `403 FORBIDDEN`: 권한 없음 (다른 유저의 리스트)
  - `500 INTERNAL_ERROR`: 서버 오류

### DB Schema

**Schema Change**: 없음

기존 테이블 활용:
- `shopping_lists`: `is_completed`, `completed_at` (기존 12a)
- `shopping_list_items.added_to_pantry` (기존 필드)
- `pantry_items` (기존 테이블)
- CHECK 제약: `added_to_pantry=false OR (is_checked=true AND is_pantry_excluded=false)` (기존)

> **중요**: `pantry_added`와 `pantry_added_item_ids`는 응답 payload에만 존재하는 **파생 값**이다. `shopping_lists` 테이블에 영구 저장되지 않는다. 서버는 `shopping_list_items`를 쿼리하여 매번 계산한다.

### Testing
- **Vitest 단위 테스트**:
  - 3-way 의미론 로직 (미전달, [], 선택값)
  - 4단계 검증/필터 로직
  - 멱등성 (재호출 시 200)
  - 무효 항목 무시 처리

- **Playwright E2E**:
  - 팝업 표시 → "모두 추가" → 완료 → 팬트리 확인
  - 팝업 표시 → "선택 추가" (2개 선택) → 완료 → 팬트리에 2개만 존재
  - 팝업 표시 → "추가 안 함" → 완료 → 팬트리 비어있음 확인
  - 완료 API 재호출 → 200 + 동일 결과 확인

---

## Out of Scope

- **팬트리 화면 UI 개선**: 팬트리 아이템 목록 표시는 기존 기능 활용, 이 슬라이스에서는 변경하지 않음
- **재료 중복 병합 로직**: 같은 재료가 이미 팬트리에 있을 때 수량 합산하는 기능은 향후 슬라이스
- **팬트리 아이템 카테고리 자동 분류**: 이 슬라이스에서는 단순 추가만 수행
- **팬트리 아이템 유효기간 관리**: 별도 기능으로 분리
- **bulk 완료 (여러 쇼핑 목록 동시 처리)**: 단일 목록만 처리

---

## Dependencies

### Prerequisite Slices (Merged)
- **12a-shopping-complete**: 기본 완료 API 엔드포인트, `is_completed` 플래그, meals 상태 전환 로직, 완료 후 read-only 보호

### External Dependencies
- `pantry_items` 테이블 존재 (기존 DB 설계에 포함)
- 로그인 사용자의 `user_id` 인증 필요

---

## Backend First Contract

**Yes** — 백엔드 API 먼저 구현하고 E2E 통과 후 프론트엔드 작업 시작.

### API Contract

```
POST /shopping/lists/{list_id}/complete
```

**Request Body**:
```typescript
{
  add_to_pantry_item_ids?: uuid[]  // 선택 사항
}
```

- **미전달** (`undefined`): 기본값 정책 적용 (`is_checked=true AND is_pantry_excluded=false` 전부 추가)
- `[]`: 팬트리 반영 안 함
- `[uuid1, uuid2, ...]`: 해당 ID만 추가 (4단계 필터 후)

**Response 200** (공통 래퍼 `{ success, data, error }`의 `data`):
```json
{
  "completed": true,
  "meals_updated": 4,
  "pantry_added": 3,
  "pantry_added_item_ids": ["item-uuid-1", "item-uuid-3", "item-uuid-5"]
}
```

**Response 404** (공통 래퍼 `{ success, data, error }`의 `error`):
```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "쇼핑 목록을 찾을 수 없습니다.",
  "fields": []
}
```

**Response 403** (공통 래퍼):
```json
{
  "code": "FORBIDDEN",
  "message": "권한이 없습니다.",
  "fields": []
}
```

### 4단계 검증/필터 프로세스 (서버)
1. **list 소속 확인**: 모든 item_id가 해당 list_id 소속인지 확인 (아니면 무시)
2. **pantry-excluded 필터**: `is_pantry_excluded=false`만 통과
3. **unchecked 필터**: `is_checked=true`만 통과
4. **중복 방지**: 이미 `added_to_pantry=true`이면 스킵 (멱등성)

### 무효 항목 처리 정책
- 무효 항목(다른 list, excluded, unchecked)은 **무시하고 진행**
- 유효한 항목만 처리
- 모든 item_id가 무효여도 `200` 반환 (`pantry_added=0`)

### 멱등성
- 이미 `is_completed=true`인 리스트 재호출 시 `200` + 동일 결과 반환
- 에러 반환 안 함

---

## Frontend Delivery Mode

**Backend First + E2E Gated**

1. **Stage 2** (Codex): 백엔드 API 구현 + Vitest 단위 테스트 (4단계 검증, 3-way 로직)
2. **Stage 3** (Claude): 백엔드 PR 리뷰
3. **Stage 4** (Claude): 프론트엔드 팝업 UI + 통합 + E2E 전체 통과
4. **Stage 5** (Codex): 디자인 리뷰 (low-risk UI change, lightweight 또는 스킵)
5. **Stage 6** (Codex): 프론트엔드 PR 리뷰 + 최종 closeout

---

## Design Authority

**Not Required** — 기존 `SHOPPING_DETAIL` 화면에 bottom sheet 팝업 추가는 **low-risk UI change**.

- 기존 confirmed `SHOPPING_DETAIL` 화면의 minor 확장
- 바텀시트 레이아웃: 프로젝트의 기존 bottom sheet 패턴 재사용
- 버튼 스타일: `--brand` 색상, `--radius-sm` radius
- 체크박스 리스트: 기존 `Checkbox` 컴포넌트 활용
- 디자인 토큰 준수: `design-tokens.md` 기준

**design-generator / design-critic / product-design-authority 스킵 근거**:
- 신규 화면이 아닌 기존 화면의 interaction 추가
- 새로운 디자인 패턴 도입 없음 (기존 bottom sheet 재사용)
- 스타일링 표면적이 작음 (1개 팝업, 표준 컴포넌트)

**Stage 5 Lightweight Design Check**:
- Codex가 spacing·typography·color 토큰 준수 확인
- 5개 UI 상태 (loading / empty / error / read-only / unauthorized) 확인
- full authority review는 스킵

---

## Design Status

**temporary** — low-risk UI change로 분류, full design authority 불필요.

Stage 4 완료 전 Stage 5 lightweight design check로 충분.

---

## Source Links

- **요구사항**: 요구사항기준선-v1.6.4.md § 1-6 장보기 > "장보기 완료 처리"
- **API**: api문서-v1.2.2.md § 8-5 `POST /shopping/lists/{id}/complete`, P0-2 (미전달 vs 빈배열), P0-3 (서버 검증 규칙)
- **DB**: db설계-v1.3.1.md § `shopping_lists`, `shopping_list_items`, `pantry_items`
- **화면**: 화면정의서-v1.5.1.md § SHOPPING_DETAIL 화면 (완료 버튼 및 팝업 레이아웃 참조)
- **Flow**: 유저flow맵-v1.3.1.md § "장보기 완료 → 팬트리 반영 선택 → 식사 진행"

---

## QA / Test Data Plan

### 테스트 데이터 준비
- **사용자**: `test_user_1` (uuid)
- **식사**: `meal_1`, `meal_2` (status=`registered`, user_id=test_user_1)
- **쇼핑 목록**: `shopping_list_1` (user_id=test_user_1, is_completed=false)
- **쇼핑 아이템**:
  - `item_1`: name="양파", is_checked=true, is_pantry_excluded=false
  - `item_2`: name="당근", is_checked=true, is_pantry_excluded=false
  - `item_3`: name="소금", is_checked=false, is_pantry_excluded=false (체크 안 됨)
  - `item_4`: name="설탕", is_checked=true, is_pantry_excluded=true (팬트리 제외)
  - `item_5`: name="간장", is_checked=true, is_pantry_excluded=false

### 시나리오별 기대 결과
1. **"모두 추가" (미전달)**:
   - 입력: `add_to_pantry_item_ids` 미전달
   - 기대: item_1, item_2, item_5만 팬트리에 추가 (item_3 unchecked, item_4 excluded 무시)
   - 응답: `pantry_added=3`, `pantry_added_item_ids=[uuid1, uuid2, uuid5]`

2. **"선택 추가" ([uuid1, uuid2])**:
   - 입력: `add_to_pantry_item_ids: [item_1_uuid, item_2_uuid]`
   - 기대: item_1, item_2만 팬트리에 추가
   - 응답: `pantry_added=2`, `pantry_added_item_ids=[uuid1, uuid2]`

3. **"추가 안 함" ([])**:
   - 입력: `add_to_pantry_item_ids: []`
   - 기대: 팬트리 추가 없음
   - 응답: `pantry_added=0`, `pantry_added_item_ids=[]`

4. **무효 ID 포함 ([uuid1, invalid_uuid])**:
   - 입력: `add_to_pantry_item_ids: [item_1_uuid, "invalid-uuid"]`
   - 기대: 무효 ID 무시, item_1만 추가, `200` 반환
   - 응답: `pantry_added=1`, `pantry_added_item_ids=[uuid1]`

5. **완료 후 재완료**:
   - 입력: `is_completed=true`인 리스트에 재요청
   - 기대: `200` + 동일 결과 반환 (멱등)
   - 응답: `completed=true`, `pantry_added=N`, `pantry_added_item_ids=[...]` (이번 요청 기준)

### Manual QA 체크리스트
- [ ] 팝업이 완료 버튼 클릭 시 표시되는가?
- [ ] "모두 추가" 선택 시 모든 유효 아이템이 팬트리에 추가되는가?
- [ ] "선택 추가" 시 선택한 아이템만 추가되는가?
- [ ] "추가 안 함" 시 팬트리에 아무것도 추가되지 않는가?
- [ ] 완료 후 mutation 버튼이 비활성화되는가? (12a 기능)
- [ ] 팬트리 화면에서 추가된 아이템이 표시되는가?
- [ ] meals 상태가 `shopping_done`으로 전환되는가?

---

## Key Rules

### Domain Rules
1. **3-way 의미론**: **미전달** (기본), `[]` (추가 안 함), `[uuids]` (선택 추가)
2. **4단계 검증/필터**: list 소속 → pantry-excluded 필터 → unchecked 필터 → 중복 방지
3. **카운트 일치**: `pantry_added = pantry_added_item_ids.length`
4. **멱등성**: 재호출 시 `200` + 동일 결과
5. **Meals 상태 전환**: `registered → shopping_done` (완료 시)
6. **CHECK 제약**: `added_to_pantry=true`이면 `is_checked=true AND is_pantry_excluded=false` (기존 DB 제약)

### Validation Rules
- 무효 항목(다른 list, excluded, unchecked)은 무시하고 진행 (에러 아님)
- 모든 item_id가 무효여도 `200` 반환 (`pantry_added=0`)
- 리스트 미존재 시 `404`
- 권한 없음 시 `403`

### Error Handling
- `404 RESOURCE_NOT_FOUND`: 쇼핑 목록 존재하지 않음
- `403 FORBIDDEN`: 권한 없음 (다른 유저의 리스트)
- `500 INTERNAL_ERROR`: 서버 오류

### UI/UX Rules
- 팝업은 바텀시트 형태로 표시 (화면 하단에서 슬라이드 업)
- 체크된 아이템 중 `is_pantry_excluded=false`인 것만 선택지에 표시
- "모두 추가" 버튼은 primary 색상 (`--brand`)
- 완료 후 쇼핑 목록 화면은 읽기 전용 모드 (12a 기능)
- 팬트리 추가된 아이템은 체크박스 옆에 작은 뱃지 표시 (`added_to_pantry=true`)

---

## Contract Evolution Candidates

### 향후 확장 가능성 (공식 문서 미포함, 승인 필요)
1. **수량 병합 로직**: 같은 재료가 팬트리에 이미 있으면 수량 합산 (현재는 INSERT 스킵)
2. **카테고리 자동 분류**: 팬트리 아이템을 카테고리별로 자동 분류
3. **유효기간 설정**: 팬트리 추가 시 유효기간 입력 옵션
4. **bulk 완료**: 여러 쇼핑 목록을 한 번에 완료 + 팬트리 반영
5. **`pantry_added` / `pantry_added_item_ids` 영구 저장**: 현재는 응답 파생 값, 향후 `shopping_lists` 테이블에 저장 고려 가능

### 현재 계약에서 보장하지 않는 것
- 팬트리 아이템 수정/삭제 (별도 슬라이스)
- 중복 재료 수량 병합 (현재는 INSERT 스킵)
- 팬트리 화면 UI 개선 (기존 기능 활용)

---

## Primary User Path

### Happy Path (완료 + 팬트리 반영)
1. 사용자가 쇼핑 목록 화면에서 아이템들을 체크
2. "장보기 완료" 버튼 클릭
3. **팝업 표시**: "팬트리에 추가할 아이템을 선택하세요"
4. 사용자가 선택:
   - **옵션 A**: "모두 추가" 버튼 클릭 → `add_to_pantry_item_ids` **미전달**
   - **옵션 B**: 일부 아이템 선택 후 "선택 추가" 클릭 → `add_to_pantry_item_ids: [uuid1, uuid2]`
   - **옵션 C**: "추가 안 함" 클릭 → `add_to_pantry_item_ids: []`
5. `POST /shopping/lists/{list_id}/complete` 호출
6. **서버 처리**:
   - 4단계 검증/필터 수행 (무효 항목 무시)
   - `shopping_lists.is_completed = true`, `completed_at = NOW()`
   - `meals.status = shopping_done` 전환
   - 유효 아이템만 `pantry_items` 추가 (아직 없는 ingredient만 INSERT)
   - 해당 `shopping_list_items.added_to_pantry = true`
7. **응답 수신**: `200 { success: true, data: { completed: true, meals_updated: N, pantry_added: M, pantry_added_item_ids: [...] } }`
8. **UI 업데이트**:
   - 쇼핑 목록 화면 읽기 전용 모드 전환 (12a 기능)
   - 성공 토스트 메시지 표시
9. 사용자가 팬트리 화면으로 이동 → 추가된 아이템 확인

### Edge Cases
- **체크된 아이템 없음**: 팝업에서 "추가할 아이템이 없습니다" 메시지 표시, "추가 안 함"만 활성화
- **모든 아이템이 pantry-excluded**: 위와 동일 처리
- **무효 ID 포함**: 무효 ID 무시, 유효 항목만 처리, `200` 반환
- **완료 후 재접근**: 재호출 시 `200` + 동일 결과 반환 (멱등)

---

## Delivery Checklist

### Stage 1 (Docs) — Claude 담당
- [x] `docs/workpacks/12b-shopping-pantry-reflect/README.md` 생성 <!-- omo:id=stage1_readme;stage=1;scope=docs;review=1.5 -->
- [x] `docs/workpacks/12b-shopping-pantry-reflect/acceptance.md` 생성 <!-- omo:id=stage1_acceptance;stage=1;scope=docs;review=1.5 -->
- [x] `docs/workpacks/12b-shopping-pantry-reflect/automation-spec.json` 생성 <!-- omo:id=stage1_automation_spec;stage=1;scope=docs;review=1.5 -->
- [x] `.workflow-v2/work-items/12b-shopping-pantry-reflect.json` 생성 <!-- omo:id=stage1_work_items;stage=1;scope=docs;review=1.5 -->
- [x] `.workflow-v2/status.json` 업데이트 <!-- omo:id=stage1_status;stage=1;scope=docs;review=1.5 -->
- [x] `docs/workpacks/README.md` 상태 변경 (`planned` → `docs`) <!-- omo:id=stage1_roadmap;stage=1;scope=docs;review=1.5 -->
- [x] Internal 1.5 docs gate 통과 (Codex 리뷰) <!-- omo:id=stage1_docs_gate;stage=1;scope=docs;review=1.5 -->

### Stage 2 (Backend) — Codex 담당
- [x] 완료 API 로직 구현 (4단계 검증/필터, 3-way 의미론, 멱등성) <!-- omo:id=stage2_api_impl;stage=2;scope=backend;review=3 -->
- [x] 타입 정의: `CompleteShopping` request/response types <!-- omo:id=stage2_types;stage=2;scope=backend;review=3 -->
- [x] Vitest 단위 테스트 (필터링, 멱등성, 무효 항목 무시) <!-- omo:id=stage2_unit_tests;stage=2;scope=backend;review=3 -->
- [ ] Playwright E2E API 테스트 (직접 호출, 팝업 없이) <!-- omo:id=stage2_e2e_api;stage=2;scope=backend;review=3 -->

### Stage 3 (Backend Review) — Claude 담당
- [ ] 백엔드 PR 리뷰 (계약 준수, 멱등성, 무효 항목 처리) <!-- omo:id=stage3_be_review;stage=3;scope=backend;review=3 -->

## Stage 2 Backend Evidence
- Implemented: `app/api/v1/shopping/lists/[list_id]/complete/route.ts`
- Types/API helper: `types/shopping.ts`, `lib/api/shopping.ts`
- Tests: `tests/shopping-complete.backend.test.ts`
- Regression compatibility: `tests/shopping-detail.frontend.test.tsx`
- Backend behavior locked:
  - `add_to_pantry_item_ids` 미전달: checked + not excluded 항목 기본 반영
  - `add_to_pantry_item_ids: []`: 팬트리 반영 없음
  - 선택 UUID 배열: list 소속/checked/not excluded 항목만 반영, invalid/excluded/unchecked 무시
  - 이미 존재하는 pantry ingredient는 duplicate INSERT 없이 `shopping_list_items.added_to_pantry=true`와 응답 id 목록 유지
  - 완료 API 재호출은 200 멱등 응답 유지
- Verification:
  - `pnpm test:product tests/shopping-complete.backend.test.ts` passed (14 tests)
  - `pnpm test:product tests/shopping-complete.backend.test.ts tests/shopping-detail.frontend.test.tsx` passed (43 tests)
  - `pnpm lint` passed
  - `pnpm typecheck` passed
  - `pnpm validate:workpack -- --slice 12b-shopping-pantry-reflect` passed
  - `pnpm validate:workflow-v2` passed
  - `pnpm validate:branch` passed
  - `pnpm verify:backend` passed (lint, typecheck, product tests 310, build, security E2E 9)
- Real DB/schema readiness: `pnpm verify:backend` includes `tests/supabase-server.test.ts`, confirming the documented shopping and pantry tables exist in migrations. Real browser/local Supabase pantry reflection smoke remains Stage 4/6 evidence because the user-facing popup is not implemented until Stage 4.

### Stage 4 (Frontend) — Claude 담당
- [ ] 팝업 UI 구현 (기존 bottom sheet 패턴 재사용) <!-- omo:id=stage4_popup_ui;stage=4;scope=frontend;review=5 -->
- [ ] 완료 버튼 클릭 → 팝업 표시 로직 <!-- omo:id=stage4_popup_trigger;stage=4;scope=frontend;review=5 -->
- [ ] 3가지 선택지 핸들러 (모두/선택/안 함) <!-- omo:id=stage4_handlers;stage=4;scope=frontend;review=5 -->
- [ ] API 호출 + 응답 처리 (공통 래퍼) <!-- omo:id=stage4_api_integration;stage=4;scope=frontend;review=5 -->
- [ ] E2E 전체 시나리오 통과 (팝업 포함) <!-- omo:id=stage4_e2e_full;stage=4;scope=frontend;review=6 -->
- [ ] 5개 UI 상태 (loading / empty / error / read-only / unauthorized) <!-- omo:id=stage4_ui_states;stage=4;scope=frontend;review=5 -->

### Stage 5 (Design Review) — Codex 담당
- [ ] Lightweight design check (spacing, typography, color 토큰 준수) <!-- omo:id=stage5_design_check;stage=5;scope=frontend;review=5 -->
- [ ] 5개 UI 상태 확인 <!-- omo:id=stage5_ui_states;stage=5;scope=frontend;review=5 -->

### Stage 6 (Frontend Review) — Codex 담당
- [ ] Codex 프론트엔드 PR 리뷰 (코드 품질, 테스트 커버리지) <!-- omo:id=stage6_fe_review;stage=6;scope=frontend;review=6 -->
- [ ] Manual QA 체크리스트 완료 <!-- omo:id=stage6_manual_qa;stage=6;scope=frontend;review=6 -->
- [ ] PR 생성 + 머지 <!-- omo:id=stage6_merge;stage=6;scope=frontend;review=6 -->

---

**작성일**: 2026-04-28
**작성자**: Claude (Stage 1)
**리뷰 상태**: Codex internal 1.5 docs gate passed after Claude repair 2
