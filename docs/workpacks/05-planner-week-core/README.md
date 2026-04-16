# Slice: 05-planner-week-core

## Goal

사용자가 위클리 플래너 화면에서 공통 브랜드 헤더, compact secondary toolbar, 주간 범위 바, 날짜별 day card 리스트를 통해 자신의 식단 계획을 한눈에 조회할 수 있다. 각 날짜 카드 안에는 `아침 / 점심 / 간식 / 저녁` 4끼가 모두 고정 슬롯으로 보이며, 슬롯 메타는 인분 chip + 상태 chip으로 압축해 세로 스크롤 중심으로 빠르게 훑을 수 있다. 플래너 상단의 [장보기] [요리하기] [남은요리] CTA 버튼은 후속 슬라이스 전까지 비활성화된 상태로 노출하여 다음 목적지를 예고하되, 실제 이동은 허용하지 않는다.

## Branches

- 백엔드: `feature/be-05-planner-week-core`
- 프론트엔드: `feature/fe-05-planner-week-core`

## In Scope

- 화면:
  - `PLANNER_WEEK`: 위클리 플래너 메인 화면 (주간 범위 바, 요일 스트립, 하루 카드, 상단 CTA)
- API:
  - `GET /planner` — 플래너 조회 (주간 범위, 고정 4끼 slots + meals)
- 상태 전이:
  - 식사 상태 표시 (`registered` / `shopping_done` / `cook_done`)
  - 요일 스트립 스와이프 기반 주간 범위 이동 + `이번주로 가기`
- DB 영향:
  - `meal_plan_columns` — 조회, bootstrap/backfill로 canonical 4끼 보장
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
- 플래너 day card의 세부 시각 polish: Stage 5 디자인 리뷰에서 확정

## Contract Evolution Accepted

- `PLANNER_WEEK`는 사용자 정의 끼니 컬럼 대신 `아침 / 점심 / 간식 / 저녁` 4끼 고정 슬롯으로 제공한다
- `POST /planner/columns`, `PATCH /planner/columns/{column_id}`, `DELETE /planner/columns/{column_id}`는 제거한다
- 모바일 기본형은 `공통 브랜드 헤더 + compact secondary toolbar + 주간 범위 바 + 날짜별 day card 리스트`를 우선한다
- 같은 날짜의 4끼는 같은 카드 안에서 함께 읽히도록 정리한다
- 모바일에서는 요일 스트립을 좌우로 넘겨 이전 주 / 다음 주로 이동하고, `이번주로 가기`는 보조 복귀 액션으로만 남긴다
- 카드 메타데이터는 한 번만 보여주고, 끼니 슬롯은 `인분 chip + 상태 chip` 구조로 압축해 세로 길이를 줄인다

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
      { "id": "uuid", "name": "간식", "sort_order": 2 },
      { "id": "uuid", "name": "저녁", "sort_order": 3 }
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

### Planner Slot Policy

- 끼니 슬롯은 `아침 / 점심 / 간식 / 저녁` 4개 고정
- 사용자 정의 컬럼 추가/수정/삭제 API 없음
- 서버는 bootstrap/backfill 단계에서 canonical 4끼 row를 보장
- legacy custom column 데이터가 있어도 GET 응답은 4끼 슬롯으로 정규화

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - **loading**: 플래너 조회 중 스켈레톤 또는 로딩 인디케이터
  - **empty**: 주간 범위 내 식사 없음 안내 + 고정 4끼 day card 유지, meal 추가 동작은 비활성
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
- `docs/요구사항기준선-v1.6.3.md` — 1-4. 식단 플래너(위클리) + 끼니 화면
- `docs/화면정의서-v1.2.3.md` — 5) PLANNER_WEEK: 식단 플래너(위클리)
- `docs/api문서-v1.2.2.md` — 3. 식단 플래너 (PLANNER_WEEK)
- `docs/db설계-v1.3.1.md` — 5. 식단 플래너 (Meal Plan)
- `docs/유저flow맵-v1.2.3.md` — ③ 식단 계획 여정
- `docs/design/design-tokens.md` — 확정 디자인 토큰 (색상·간격·컴포넌트 규칙)

## QA / Test Data Plan

- QA fixture mode:
  - `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
  - auth override 필요: guest / authenticated
  - fixture baseline: 고정 슬롯 `아침 / 점심 / 간식 / 저녁`, 식사 3건 (`registered / shopping_done / cook_done`)
- 실 DB smoke:
  - 가장 쉬운 시작: `pnpm dev:demo`
  - 깨끗한 local demo dataset으로 다시 시작: `pnpm dev:demo:reset`
  - 팀 공용 local demo dataset 재생성: `pnpm local:reset:demo`
  - 브라우저에서 real local DB 흐름 확인: `pnpm dev:local-supabase`
  - local-only 로그인 카드에서 메인/다른 테스트 계정으로 진입 가능
  - 메인 계정 기준으로 기본 `아침 / 점심 / 간식 / 저녁` 슬롯과 데모 meals가 보여야 한다
  - local 테스트 계정 seed: `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
  - `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`
  - seed window는 실행 시점 기준 현재 기본 플래너 범위 안으로 생성된다
  - clean QA 계정을 쓰면 가장 결정적인 planner smoke를 얻을 수 있다

## Key Rules

### 플래너 조회 규칙
- `GET /planner`는 `start_date`와 `end_date` 범위 내의 식사를 조회한다.
- 응답에는 고정 4끼 슬롯(`columns`)과 해당 범위 내 식사(`meals`)를 포함한다.
- 슬롯 순서는 `아침 -> 점심 -> 간식 -> 저녁`으로 고정한다.
- `meals` 배열은 `plan_date ASC, column_id ASC, created_at ASC` 순서로 정렬한다.

### 권한 정책
- 모든 플래너 API는 로그인 필수 (401)
- 컬럼 CRUD API는 더 이상 제공하지 않는다

### 상태 뱃지 표시
- `meals` 배열의 각 식사에는 `status` 필드가 포함됨
- 가능한 값: `registered` (식사 등록 완료), `shopping_done` (장보기 완료), `cook_done` (요리 완료)
- 프론트엔드는 상태별로 시각적 구분 (색상, 아이콘 등) 제공
- 상태 전이 로직은 06, 09, 15a 슬라이스에서 구현

### 회원가입 시 기본 슬롯
- 신규 사용자 가입 시 `아침`, `점심`, `간식`, `저녁` 4개 슬롯을 서버가 자동 보장한다
- 이 슬라이스에서는 고정 4끼 슬롯 조회만 담당한다

### 상단 CTA 버튼
- [장보기] [요리하기] [남은요리] 버튼은 UI에 노출되지만, 이번 슬라이스에서는 모두 disabled 상태다
- 클릭/탭, 키보드 활성화, placeholder 라우팅을 제공하지 않는다

## Delivery Checklist
- [x] 백엔드 계약 고정
- [x] API 또는 adapter 연결
- [x] 타입 반영
- [x] UI 연결
- [x] 상태 전이 / 권한 / 멱등성 테스트
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분
- [x] fixture와 real DB smoke 경로 구분
- [x] seed / bootstrap / system row 준비 여부 점검
- [x] `loading / empty / error / read-only / unauthorized` 상태 점검
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리
