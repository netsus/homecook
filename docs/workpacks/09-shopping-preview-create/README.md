# Slice: 09-shopping-preview-create

## Goal
플래너에서 "장보기" 버튼을 클릭하면 "식사 등록 완료" 상태이면서 아직 다른 장보기 리스트에 묶이지 않은 식사들을 자동으로 선택하고, 사용자가 인분을 조정한 뒤 장보기 리스트를 생성하면 생성된 장보기 상세 화면으로 자동 이동한다. 이를 통해 사용자는 플래너에서 장보기 흐름을 시작하고 체크리스트를 바로 확인할 수 있다.

## Branches

- 백엔드: `feature/be-09-shopping-preview-create`
- 프론트엔드: `feature/fe-09-shopping-preview-create`

## In Scope
- 화면:
  - `SHOPPING_FLOW` (장보기 preview + 인분 조정 + 생성)
- API:
  - `GET /shopping/preview` (Step A~C: 장보기 대상 취합)
  - `POST /shopping/lists` (Step D: 장보기 목록 생성)
- 상태 전이:
  - 장보기 리스트 생성 시 대상 `meals`의 `shopping_list_id` 필드를 새로 생성된 리스트 ID로 할당 (status는 `registered` 유지)
- DB 영향:
  - `meals` (shopping_list_id UPDATE)
  - `shopping_lists` (INSERT)
  - `shopping_list_recipes` (INSERT)
  - `shopping_list_items` (INSERT)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 장보기 상세 화면 조회 (`GET /shopping/lists/{id}`) — slice 10a
- 장보기 항목 체크 / 제외 / 순서 변경 — slice 10a, 11
- 장보기 완료 처리 — slice 12a
- 팬트리 반영 선택 — slice 12b
- 장보기 공유 텍스트 — slice 10b
- 장보기 기록 재열람 — slice 17a

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `08b-meal-add-books-pantry` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

### GET /shopping/preview
- **권한**: 로그인 필수 (401)
- **Query**: 없음
- **Response**: `{ success, data, error }`
  - `data.eligible_meals[]`: `status='registered' AND shopping_list_id IS NULL`인 식사 목록
  - 각 meal은 `id`, `recipe_id`, `recipe_name`, `recipe_thumbnail`, `planned_servings`, `created_at` 포함
- **검증**:
  - 소유자 일치: `meals.user_id = 요청 user_id` (타인 리소스 403)
- **Error**:
  - 401: UNAUTHORIZED (토큰 없음)
  - 403: FORBIDDEN (타인 리소스 접근)
  - 500: INTERNAL_ERROR

### POST /shopping/lists
- **권한**: 로그인 필수 (401)
- **Body**:
  ```json
  {
    "meal_configs": [
      {
        "meal_id": "uuid",
        "shopping_servings": 4
      }
    ]
  }
  ```
- **Response**: `{ success, data, error }`
  - `data`: 생성된 장보기 리스트 객체 (`id`, `title`, `is_completed`, `created_at`)
- **Server 검증 (4단계)**:
  1. 소유자 일치: `meals.user_id = 요청 user_id`
  2. status 조건: `meals.status = 'registered'`
  3. shopping_list_id 미할당: `meals.shopping_list_id IS NULL`
  4. 무효 meal_id는 무시하고 진행 (유효한 것만 처리)
- **상태 전이**:
  - `shopping_lists` INSERT (`is_completed=false`)
  - `shopping_list_recipes` INSERT (레시피별 인분 기록)
  - `shopping_list_items` INSERT (재료 취합/합산 후 팬트리 자동 제외, `is_pantry_excluded` 초기값 설정)
  - 대상 `meals.shopping_list_id` UPDATE (생성된 리스트 ID로 할당, status는 `registered` 유지)
- **멱등성**: 동일 meal_id 중복 포함 시 무시하고 진행, 생성 후 200 반환
- **Error**:
  - 401: UNAUTHORIZED
  - 403: FORBIDDEN (소유자 불일치)
  - 409: CONFLICT (이미 다른 리스트에 묶인 meal 포함 시)
  - 422: VALIDATION_ERROR (meal_configs 빈 배열, shopping_servings < 1)
  - 500: INTERNAL_ERROR

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: preview 로딩, 리스트 생성 중
  - `empty`: 장보기 대상 없음 (eligible_meals 빈 배열)
  - `error`: API 호출 실패
  - `read-only`: N/A (이 슬라이스는 생성 플로우만)
  - `unauthorized`: 로그인 필요 (플래너 상단 "장보기" 버튼은 이미 로그인 게이트가 있으므로 실질적으로 401 케이스는 드물지만, API 호출 시 401 처리는 포함)
- 로그인 보호 액션: 플래너의 "장보기" 버튼은 이미 로그인 게이트 통과 후이므로 return-to-action은 상위 플래너 컴포넌트에서 처리됨

## Design Authority
- UI risk: `new-screen`
- Anchor screen dependency: `PLANNER_WEEK` (상단 "장보기" 버튼에서 진입)
- Visual artifact: `ui/designs/SHOPPING_FLOW.md` (Stage 1에서 생성), screenshot evidence는 Stage 4에서 확보
- Authority status: `required`
- Notes: 신규 화면이므로 Stage 1에서 design-generator/design-critic 실행 필수, Stage 4에서 screenshot/Figma evidence 기반 authority review 필요

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료
> 신규 화면 / high-risk / anchor-extension은 `confirmed` 전에 authority review 근거가 필요하다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` § 1-4 장보기 진입 flow, § 1-6 장보기, § 2-7 장보기 취합/합산 규칙, § 2-12 장보기 상세 화면 정책
- `docs/화면정의서-v1.5.0.md` § 0-6 장보기 합산 표시 규칙, § 0-7 장보기 상세 공통 정책, § 11 SHOPPING_FLOW
- `docs/api문서-v1.2.2.md` § 8-1 GET /shopping/preview, § 8-2 POST /shopping/lists
- `docs/db설계-v1.3.1.md` (meals, shopping_lists, shopping_list_recipes, shopping_list_items, pantry_items)

## QA / Test Data Plan
- **Fixture baseline**:
  - 로그인 유저 1명 (auth override)
  - `meals` × 3개 (`status='registered'`, `shopping_list_id IS NULL`, 각기 다른 recipe, planned_servings 다양)
  - `meals` × 1개 (`status='registered'`, `shopping_list_id='existing-list-id'`) — 이미 묶인 케이스
  - `meals` × 1개 (`status='shopping_done'`) — 장보기 완료 상태
  - `recipes` × 3개 (각 meal과 연결)
  - `recipe_ingredients` × 다수 (각 recipe별 재료 목록)
  - `pantry_items` × 일부 (팬트리 자동 제외 검증용)
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - seed script로 위 baseline 데이터 생성 후 브라우저에서 플래너 → 장보기 preview → 인분 조정 → 생성 → 상세 이동 흐름 확인
- **Bootstrap 요구사항**:
  - `meal_plan_columns` (회원가입 시 자동 생성, 4끼 고정)
  - `recipe_books` (회원가입 시 기본 3개 생성)
  - owning flow: 회원가입 → 자동 생성 로직 (slice 01 bootstrap)
  - 기대 row: `meal_plan_columns` × 4 (아침, 점심, 간식, 저녁), `recipe_books` × 3
- **Blocker 조건**:
  - `meals`, `recipes`, `recipe_ingredients`, `pantry_items` 테이블 부재
  - 로컬 Supabase에 seed가 없어서 eligible_meals 빈 배열만 나오는 상태에서 empty UI만 반복 확인

## Key Rules
- **장보기 대상**: `status='registered' AND shopping_list_id IS NULL`인 meals만
- **Server 검증 4단계**:
  1. 소유자 일치
  2. status='registered' 확인
  3. shopping_list_id IS NULL 확인
  4. 무효 meal_id 무시하고 유효한 것만 처리
- **상태 전이**:
  - 장보기 리스트 생성 시 대상 meals의 `shopping_list_id`를 새 리스트 ID로 UPDATE
  - status는 `registered` 유지 (장보기 완료 시에만 `shopping_done`으로 전이, slice 12a)
- **재료 합산**:
  - 변환 가능 단위(kg↔g, L↔ml): 변환 후 합산
  - 변환 불가 단위(개 vs g, 망 vs g): 복합 표기 (예: "양파 2개 + 200g + 1망")
- **팬트리 자동 제외**:
  - `shopping_list_items` INSERT 시 `pantry_items`와 매칭되는 재료는 `is_pantry_excluded=true` 초기값
  - 구매 섹션과 팬트리 제외 섹션은 slice 10a에서 처리
- **생성 후 이동**:
  - `POST /shopping/lists` 응답의 `id`로 `SHOPPING_DETAIL`로 자동 라우팅
  - 생성 직후 리스트는 `is_completed=false` (미완료 상태)
- **멱등성**: 생성 API는 멱등하지 않음 (중복 호출 시 새 리스트 생성), 클라이언트는 생성 버튼 중복 클릭 방지
- **Empty 처리**: eligible_meals 빈 배열이면 "장보기 대상이 없어요" + "플래너로 돌아가기" CTA

## Contract Evolution Candidates (Optional)
없음

## Primary User Path
1. 플래너(`PLANNER_WEEK`) 상단 "장보기" 버튼 클릭
2. `SHOPPING_FLOW` 진입 → 자동 선택된 eligible_meals 확인 (Step A~C)
3. 레시피별 "장보기 기준 인분" 조정 (shopping_servings)
4. [장보기 목록 만들기] 클릭 → 리스트 생성
5. 생성 완료 후 `SHOPPING_DETAIL`로 자동 이동 (slice 10a에서 구현)

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 Codex rebuttal을 받아들인 checklist는 checkbox를 바꾸지 않고 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가해 닫는다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
