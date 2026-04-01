# Slice: 05-planner-week-core

## Goal

사용자가 위클리 플래너 화면에서 날짜×끼니 그리드를 통해 자신의 식단 계획을 한눈에 조회하고, 끼니 컬럼을 추가/수정/삭제하여 플래너를 자신의 생활 패턴에 맞게 관리할 수 있다. 플래너 상단의 [장보기] [요리하기] [남은요리] CTA 버튼은 후속 슬라이스 전까지 비활성화된 상태로 노출하여 다음 목적지를 예고하되, 실제 이동은 허용하지 않는다. 각 식사 셀에는 상태 뱃지(식사 등록 완료/장보기 완료/요리 완료)를 표시하여 현재 진행 상황을 시각적으로 전달한다.

## Branches

- 백엔드: `feature/be-05-planner-week-core`
- 프론트엔드: `feature/fe-05-planner-week-core`

## In Scope

- 화면:
  - `PLANNER_WEEK`: 위클리 플래너 메인 화면 (끼니 컬럼 그리드, 식사 셀, 상단 CTA)
- API:
  - `GET /planner` — 플래너 조회 (주간 범위, columns + meals)
  - `POST /planner/columns` — 끼니 컬럼 추가 (최대 5개 제한)
  - `PATCH /planner/columns/{column_id}` — 끼니 컬럼 수정 (name, sort_order)
  - `DELETE /planner/columns/{column_id}` — 끼니 컬럼 삭제 (소속 meals 존재 시 409)
- 상태 전이:
  - 끼니 컬럼 추가/수정/삭제 (최대 5개 제한, 소속 meals 존재 시 삭제 불가)
  - 식사 상태 뱃지 표시 (`registered` / `shopping_done` / `cook_done`)
- DB 영향:
  - `meal_plan_columns` — 조회, 생성, 수정, 삭제
  - `meals` — 조회 (플래너 화면 표시용, CRUD는 06/07 슬라이스)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- 식사(Meal) 생성/수정/삭제: 슬라이스 06, 07에서 처리
- 끼니 셀 탭 → `MEAL_SCREEN` 이동: 슬라이스 07에서 처리
- 빈 셀 탭 시 `MENU_ADD` 이동 또는 placeholder 라우팅: 이번 슬라이스에서는 제공하지 않음
- 장보기 실제 flow (`SHOPPING_FLOW`): 슬라이스 09에서 처리
- 요리하기 실제 flow (`COOK_READY_LIST`): 슬라이스 14에서 처리
- 남은요리 화면 (`LEFTOVERS`): 슬라이스 16에서 처리
- 상단 CTA의 실제 destination 진입 또는 "준비 중" placeholder 안내: 이번 슬라이스에서는 제공하지 않음
- 플래너 날짜/끼니 그리드의 세부 UI 디자인 확정: Stage 5 디자인 리뷰에서 확정

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | [x] |
| `02-discovery-filter` | merged | [x] |
| `03-recipe-like` | merged | [x] |
| `04-recipe-save` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 또는 `bootstrap` 상태이므로 이 슬라이스 시작 가능.

## Backend First Contract

### GET /planner

**Request**
- Query: `start_date` (date), `end_date` (date)
- 권한: 로그인 필수 (401 Unauthorized)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "columns": [
      { "id": "uuid", "name": "아침", "sort_order": 0 },
      { "id": "uuid", "name": "점심", "sort_order": 1 },
      { "id": "uuid", "name": "저녁", "sort_order": 2 }
    ],
    "meals": [
      {
        "id": "uuid",
        "recipe_id": "uuid",
        "recipe_title": "김치찌개",
        "recipe_thumbnail_url": "https://...",
        "plan_date": "2026-03-01",
        "column_id": "uuid",
        "planned_servings": 2,
        "status": "registered",
        "is_leftover": false
      }
    ]
  },
  "error": null
}
```

**Error Cases**
- 401: 비로그인
- 422: 날짜 범위 유효성 검증 실패 (start_date > end_date 등)

### POST /planner/columns

**Request**
- Body: `{ "name": "간식" }`
- 권한: 로그인 필수

**Response (201)**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "간식",
    "sort_order": 3
  },
  "error": null
}
```

**Error Cases**
- 401: 비로그인
- 409 CONFLICT: 이미 5개 컬럼 존재 (최대 5개 제한)
- 422: name 필드 누락 또는 빈 문자열

### PATCH /planner/columns/{column_id}

**Request**
- Body: `{ "name": "브런치", "sort_order": 1 }` (둘 다 optional)
- 권한: 로그인 필수, 소유자 일치 검증

**Response (200)**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "브런치",
    "sort_order": 1
  },
  "error": null
}
```

**Error Cases**
- 401: 비로그인
- 403 FORBIDDEN: 다른 사용자의 컬럼 수정 시도
- 404: column_id 미존재
- 422: name이 빈 문자열이거나 sort_order가 음수

### DELETE /planner/columns/{column_id}

**Request**
- 권한: 로그인 필수, 소유자 일치 검증

**Response (204)**: No Content

**Error Cases**
- 401: 비로그인
- 403 FORBIDDEN: 다른 사용자의 컬럼 삭제 시도
- 404: column_id 미존재
- 409 CONFLICT: 소속 meals 1개 이상 존재 시 (식사 먼저 삭제/이동 필요)

**멱등성**
- `DELETE /planner/columns/{id}`: 이미 삭제된 컬럼 재삭제 시 404 반환 (멱등 처리 불필요, 명확한 오류 메시지 우선)

**권한 검증**
- 모든 엔드포인트에서 `user_id` 일치 검증
- 타인의 컬럼 수정/삭제 시도 시 403 반환

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - **loading**: 플래너 조회 중 스켈레톤 또는 로딩 인디케이터
  - **empty**: 주간 범위 내 식사 없음 안내 + 컬럼 관리 UI 유지, meal 추가 동작은 비활성
  - **error**: 플래너 조회 실패 시 오류 안내 + [다시 시도]
  - **read-only**: 해당 없음 (플래너 조회는 항상 수정 가능)
  - **unauthorized**: 비로그인 시 플래너 탭 진입 차단 또는 로그인 안내 모달
- 로그인 보호 액션: 플래너 전체가 로그인 필수 화면이므로, 탭 진입 시 로그인 게이트 적용

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료, Claude Stage 5 디자인 리뷰 필요
- [x] 확정 (confirmed) — Stage 5 리뷰 통과, Tailwind/공용 컴포넌트 정리 완료
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료, Codex가 변경)
>   → `confirmed` (Stage 5 리뷰 통과, Claude가 변경)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.md` — 1-4. 식단 플래너(위클리) + 끼니 화면
- `docs/화면정의서-v1.2.md` — 5) PLANNER_WEEK: 식단 플래너(위클리)
- `docs/api문서-v1.2.1.md` — 3. 식단 플래너 (PLANNER_WEEK)
- `docs/db설계-v1.3.md` — 5. 식단 플래너 (Meal Plan)
- `docs/유저flow맵-v1.2.md` — ③ 식단 계획 여정
- `docs/design/design-tokens.md` — 확정 디자인 토큰 (색상·간격·컴포넌트 규칙)

## QA / Test Data Plan

- QA fixture mode:
  - `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
  - auth override 필요: guest / authenticated
  - fixture baseline: 컬럼 `아침 / 점심 / 저녁 / 간식`, 식사 3건 (`registered / shopping_done / cook_done`)
- 실 DB smoke:
  - `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`
  - seed window는 실행 시점 기준 현재 기본 플래너 범위 안으로 생성된다
  - clean QA 계정을 쓰면 가장 결정적인 planner smoke를 얻을 수 있다

## Key Rules

### 플래너 조회 규칙
- `GET /planner`는 `start_date`와 `end_date` 범위 내의 식사를 조회한다.
- 응답에는 사용자의 모든 끼니 컬럼 (`columns`)과 해당 범위 내 식사 (`meals`)를 포함한다.
- `meals` 배열은 `plan_date ASC, column_id ASC, created_at ASC` 순서로 정렬한다.

### 끼니 컬럼 제한
- 사용자당 최대 5개 컬럼 제한 (애플리케이션 레벨)
- 6번째 컬럼 추가 시도 시 `409 CONFLICT` 반환
- 에러 메시지: `{ "code": "MAX_COLUMNS_REACHED", "message": "최대 5개까지 추가할 수 있어요" }`

### 컬럼 삭제 조건
- 컬럼에 소속된 `meals`가 1개 이상 존재하면 `409 CONFLICT` 반환
- 에러 메시지: `{ "code": "COLUMN_HAS_MEALS", "message": "식사가 등록된 컬럼은 삭제할 수 없어요. 식사를 먼저 삭제하거나 이동해주세요." }`
- 식사 삭제/이동 기능은 07 슬라이스에서 구현

### 권한 정책
- 모든 플래너 API는 로그인 필수 (401)
- 다른 사용자의 컬럼 수정/삭제 시도 시 403 FORBIDDEN

### 상태 뱃지 표시
- `meals` 배열의 각 식사에는 `status` 필드가 포함됨
- 가능한 값: `registered` (식사 등록 완료), `shopping_done` (장보기 완료), `cook_done` (요리 완료)
- 프론트엔드는 상태별로 시각적 구분 (색상, 아이콘 등) 제공
- 상태 전이 로직은 06, 09, 15a 슬라이스에서 구현

### 회원가입 시 기본 컬럼
- 신규 사용자 가입 시 `아침`, `점심`, `저녁` 3개 컬럼 자동 생성 (auth flow에서 처리)
- 이 슬라이스에서는 이미 생성된 컬럼을 조회/수정/삭제만 담당

### 상단 CTA 버튼
- [장보기] [요리하기] [남은요리] 버튼은 UI에 노출되지만, 이번 슬라이스에서는 모두 disabled 상태다
- 클릭/탭, 키보드 활성화, placeholder 라우팅을 제공하지 않는다
- 실제 destination 활성화는 각 후속 슬라이스(09, 14, 16)에서 담당한다

## Contract Evolution Candidates (Optional)

없음

## Primary User Path

1. 사용자가 하단 탭에서 [플래너] 탭 선택 → `PLANNER_WEEK` 진입
2. 플래너 조회 API 호출 (`GET /planner?start_date=...&end_date=...`)
   - 기본 범위: 오늘 기준 ±7일 (프론트엔드 결정)
3. 끼니 컬럼 그리드와 식사 셀이 표시됨
   - 각 셀에는 레시피명, 인분, 상태 뱃지가 표시됨
4. [+] 버튼으로 끼니 컬럼 추가 (`POST /planner/columns`)
   - 최대 5개 제한, 초과 시 409 안내
5. 컬럼명 편집 또는 순서 변경 (`PATCH /planner/columns/{id}`)
6. 컬럼 삭제 버튼 클릭 (`DELETE /planner/columns/{id}`)
   - 소속 meals 존재 시 409 안내
7. 상단 CTA는 비활성화 상태로만 노출되어 후속 목적지를 예고하고, 위/아래 스크롤 시 새로운 범위로 플래너 재조회

## Delivery Checklist

- [ ] 백엔드 계약 고정 (`GET /planner`, `POST /planner/columns`, `PATCH /planner/columns/{id}`, `DELETE /planner/columns/{id}`)
- [ ] API Route Handlers 구현 (`app/api/v1/planner/...`)
- [ ] TypeScript 타입 정의 (request/response/error)
- [ ] 권한 검증 (로그인 필수, 소유자 일치)
- [ ] 끼니 컬럼 최대 5개 제한 로직
- [ ] 컬럼 삭제 시 소속 meals 검증 (409 CONFLICT)
- [ ] Vitest 단위 테스트 (권한, 상태 전이, 예외 케이스)
- [ ] 프론트엔드 `PLANNER_WEEK` 화면 구현
- [ ] Zustand 상태 관리 (플래너 데이터, 컬럼 CRUD)
- [ ] 5개 UI 상태 구현 (`loading / empty / error / read-only / unauthorized`)
- [ ] 상단 CTA 버튼 UI (장보기/요리하기/남은요리) — 동작은 추후 슬라이스
- [ ] 상태 뱃지 시각화 (registered / shopping_done / cook_done)
- [ ] 날짜 범위 스크롤 인터랙션
- [ ] `ui/designs/PLANNER_WEEK.md` + critique 산출물 유지
- [ ] Playwright E2E (플래너 조회, 컬럼 추가/수정/삭제 흐름)
- [ ] 자동화 범위 구분 (Vitest vs Playwright)
- [ ] 수동 QA 시나리오 정리 (acceptance.md Manual Only 섹션)
