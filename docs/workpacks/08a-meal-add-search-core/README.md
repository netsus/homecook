# Slice: 08a-meal-add-search-core

## Goal
플래너에서 식사를 추가할 때 검색 기반 경로를 제공한다. `MENU_ADD` 화면 shell과 `RECIPE_SEARCH_PICKER` 컴포넌트를 구현하여 사용자가 레시피를 검색하고 선택한 뒤 계획 인분을 입력하여 Meal을 생성할 수 있다. 이번 슬라이스는 레시피북/팬트리/남은요리/유튜브/직접등록 경로를 제외하고 **검색 path만** 닫는다.

## Branches

- 백엔드: `feature/be-08a-meal-add-search-core`
- 프론트엔드: `feature/fe-08a-meal-add-search-core`

## In Scope
- 화면:
  - `MENU_ADD` — 식사 추가 진입 화면 (로그인 필요, 바텀시트/풀스크린 구조)
  - `RECIPE_SEARCH_PICKER` — 레시피 검색 및 선택 컴포넌트
- API:
  - `GET /recipes` (기존 재사용, 검색 파라미터 활용)
  - `POST /meals` (기존 재사용, `recipe_id` + `planned_servings` 기반 생성)
- 상태 전이:
  - Meal 생성 시 `status='registered'` 고정
  - `leftover_dish_id`, `is_leftover` 필드는 이번 슬라이스 범위 외
- DB 영향:
  - `meals` — INSERT (새 식사 등록)
  - `recipes` — 검색 조회만 (수정 없음)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

## Out of Scope
- 레시피북에서 추가 (`08b`)
- 팬트리만 이용 (`08b`)
- 남은요리에서 추가 (`16`)
- 직접 레시피 등록 (`18`)
- 유튜브 링크로 추가 (`19`)
- `MENU_ADD` 내부의 위 4개 버튼(유튜브/레시피북/남은요리/팬트리) 및 직접 등록 링크는 비활성 placeholder 또는 "준비 중" 표시로 남긴다.

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `02-discovery-filter` | merged | [x] |
| `03-recipe-like` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `06-recipe-to-planner` | merged | [x] |
| `07-meal-manage` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태임을 확인했다.

## Backend First Contract
### `GET /recipes` (기존 재사용)
- Query: `?search=<keyword>&cursor=<cursor>&limit=<N>`
- Response: `{ success: true, data: { items: Recipe[], next_cursor } }`
- 권한: 비로그인 가능
- 기능: 제목 기반 검색, 커서 페이지네이션

### `POST /meals` (기존 재사용)
- Request body:
  ```json
  {
    "date": "2026-04-23",
    "column_id": "uuid",
    "recipe_id": "uuid",
    "planned_servings": 2
  }
  ```
- Response: `{ success: true, data: { id, date, column_id, recipe_id, planned_servings, status: "registered", ... } }`
- 권한: 로그인 필수 (401 Unauthorized)
- 소유자 검증: column_id 소유자와 현재 user_id 일치 확인 (403 Forbidden)
- 상태 전이: 새 Meal은 항상 `status='registered'`로 시작
- 멱등성: 중복 생성 방지는 클라이언트 책임 (백엔드는 동일 date/column_id/recipe_id 조합도 허용)

### Error 케이스
- 401: 비로그인 상태에서 `POST /meals` 호출
- 403: column_id 소유자 불일치
- 404: recipe_id 미존재, column_id 미존재
- 422: planned_servings 음수 또는 0

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태:
  - `loading` — 레시피 검색 중, Meal 생성 중
  - `empty` — 검색 결과 없음
  - `error` — 네트워크 오류, 서버 오류
  - `read-only` — N/A (이번 슬라이스는 생성 흐름만)
  - `unauthorized` — 로그인하지 않은 상태에서 `MENU_ADD` 진입 시 로그인 게이트 + return-to-action
- 로그인 보호 액션: `MENU_ADD` 진입, `POST /meals` 호출 시 로그인 필요. return-to-action 지원.

## Design Authority
- UI risk: `new-screen` (MENU_ADD는 신규 화면, RECIPE_SEARCH_PICKER는 신규 컴포넌트)
- Anchor screen dependency: 없음 (독립 화면)
- Visual artifact:
  - Stage 1: design-generator로 생성한 `ui/designs/MENU_ADD.md`, `ui/designs/RECIPE_SEARCH_PICKER.md` (placeholder button 포함)
  - Stage 4: screenshot evidence 필요 (`ui/designs/evidence/08a/MENU_ADD-mobile.png`, `ui/designs/evidence/08a/RECIPE_SEARCH_PICKER-mobile.png`)
- Authority status: `required` (신규 화면)
- Notes:
  - `MENU_ADD`는 검색창 상단 배치, 하단 4개 버튼(유튜브/레시피북/남은요리/팬트리) + 직접등록 링크 placeholder 구조
  - 이번 슬라이스는 검색창만 활성화, 나머지는 비활성 또는 "준비 중" 표시
  - `RECIPE_SEARCH_PICKER`는 검색 결과 리스트 + 선택 시 계획 인분 입력 모달

## Design Status

- [x] 임시 UI (temporary) — Stage 1 기본값, 기능 완성 우선
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후 전환
- [ ] 확정 (confirmed) — Stage 5 public review 통과 + authority gate 통과 후
- [ ] N/A — (이번 슬라이스는 FE 화면 있음)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.3.md` — §1-4 플래너, MENU_ADD 설명
- `docs/화면정의서-v1.5.0.md` — §7 MENU_ADD, §8 RECIPE_SEARCH_PICKER
- `docs/api문서-v1.2.2.md` — §5-1 레시피 검색, §2-5 POST /meals
- `docs/유저flow맵-v1.3.0.md` — ③-a 검색해서 추가
- `docs/db설계-v1.3.1.md` — meals, recipes 테이블

## QA / Test Data Plan
- fixture baseline:
  - `tests/__fixtures__/recipes.json` — 검색 테스트용 레시피 샘플 (기존 fixture 재사용)
  - `tests/__fixtures__/meal_plan_columns.json` — 사용자 컬럼 샘플
  - auth override: 로그인 사용자 fixture
- real DB smoke 경로:
  - `pnpm dev:local-supabase` — 로컬 Supabase 환경
  - `pnpm dev:demo` — 데모 환경 (선택)
  - seed script: `supabase/seed.sql` 또는 `scripts/seed-*.mjs`
- bootstrap이 생성해야 하는 시스템 row:
  - `meal_plan_columns` ×3 (아침/점심/저녁 기본 컬럼)
  - `recipes` — 검색 테스트용 샘플 레시피 최소 5개
- blocker 조건:
  - `meal_plan_columns` 테이블 부재 또는 사용자 기본 컬럼 미생성 시 POST /meals 404 발생
  - `recipes` 테이블 부재 시 GET /recipes 실패
  - 로그인 사용자 fixture 미설정 시 POST /meals 401 발생

## Key Rules
- Meal 생성 시 `status='registered'` 고정 (등록 완료 상태)
- `planned_servings`는 양수 필수 (0 이하 → 422)
- column_id 소유자 검증: 다른 사용자 컬럼에 Meal 추가 불가 (403)
- 비로그인 상태에서 `MENU_ADD` 진입 시 로그인 게이트 표시 후 return-to-action
- 검색 결과가 없어도 error가 아닌 empty 상태로 처리
- 레시피 선택 후 인분 입력 모달에서 취소하면 Meal 생성 없이 검색 결과로 복귀
- Meal 생성 성공 후 `MEAL_SCREEN`으로 복귀 (토스트 표시 선택 사항)

## Contract Evolution Candidates (Optional)
없음. 공식 문서 기준 계약이 명확하고 현재 범위에 충분하다.

## Primary User Path
1. 사용자가 `PLANNER_WEEK` → `MEAL_SCREEN`에서 [식사 추가] 버튼을 탭
2. `MENU_ADD` 화면 진입 (로그인하지 않았다면 로그인 게이트 표시 → return-to-action)
3. 상단 검색창에 키워드 입력 (예: "김치찌개")
4. `RECIPE_SEARCH_PICKER` 컴포넌트가 `GET /recipes?search=김치찌개` 호출 → 검색 결과 표시
5. 사용자가 레시피 선택 → 계획 인분 입력 모달 표시
6. 인분 입력 후 [추가] 버튼 탭 → `POST /meals` 호출
7. 성공 시 `MEAL_SCREEN`으로 복귀, 새 식사 카드 표시

## Delivery Checklist
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 프론트/QA/디자인/closeout 항목을 닫는다.
> `automation-spec.json`과 함께 각 체크박스 끝에 metadata를 유지한다.

- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
