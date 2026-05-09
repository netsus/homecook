# Slice: planner-column-customization

## Goal

사용자가 설정 화면에서 플래너 끼니 컬럼을 이름 변경, 추가, 삭제할 수 있도록 한다. 신규 사용자 기본값은 `아침 / 점심 / 저녁` 3개이며, 최소 1개 ~ 최대 5개까지 허용한다. `PLANNER_WEEK`는 사용자별 동적 컬럼을 표시하고, 기존 사용자에게 이미 생성된 컬럼은 자동 삭제하지 않는다.

## Branches

- 백엔드: `feature/be-planner-column-customization`
- 프론트엔드: `feature/fe-planner-column-customization`

## In Scope

- 화면:
  - `PLANNER_WEEK` — 사용자별 동적 끼니 컬럼 표시 (기존 4고정 → 동적)
  - `SETTINGS` — 끼니 컬럼 관리 섹션 (목록 조회, 이름 변경, 추가, 삭제)
- API:
  - `GET /planner/columns` — 사용자별 끼니 컬럼 목록 조회
  - `POST /planner/columns` — 끼니 컬럼 추가
  - `PATCH /planner/columns/{column_id}` — 끼니 컬럼 이름 변경
  - `DELETE /planner/columns/{column_id}` — 끼니 컬럼 삭제
  - `GET /planner` — 응답의 `columns` 배열이 사용자별 동적 목록을 반환하도록 변경
  - `GET /meals`, `POST /meals` — 요청/응답 계약 변경 없음, 백엔드 검증 정책 변경: `column_id`가 요청 사용자 소유의 동적 컬럼인지 확인 (기존 고정 슬롯명 검증 → 소유 컬럼 ID 검증)
- 상태 전이:
  - 신규 사용자 bootstrap: `meal_plan_columns ×3` (아침 / 점심 / 저녁)으로 변경 (기존 ×4 → ×3)
  - 컬럼 추가 시 `sort_order = 현재 마지막 + 1`
  - 컬럼 삭제 후 남은 컬럼은 `sort_order ASC, id ASC` 기준으로 0부터 재정렬
- DB 영향:
  - `meal_plan_columns` (INSERT / UPDATE name / DELETE)
  - `meals` (READ — 삭제 전 연결된 식사 존재 여부 확인)
- Schema Change:
  - [x] 없음 (기존 `meal_plan_columns` 테이블 구조 변경 없음, 정책만 변경)

## Out of Scope

- 컬럼 순서 변경 (drag-and-drop reorder) — 1차 구현 범위 밖 (API v1.2.3 명시)
- 기존 사용자의 4번째 컬럼(간식) 자동 삭제 — 설정에서 사용자가 직접 정리
- `MEAL_SCREEN` 변경 — 기존 `column_id` FK 참조 유지
- prototype parity promotion — 이 슬라이스는 기존 화면 확장이므로 별도 parity 대상 아님

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `05-planner-week-core` | merged | [x] |
| `17c-settings-account` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태이므로 이 슬라이스를 시작할 수 있다.

## Backend First Contract

### GET /planner/columns

```
GET /planner/columns
```

- 로그인 필수
- 응답 (200):

```json
{
  "success": true,
  "data": {
    "columns": [
      { "id": "uuid", "name": "아침", "sort_order": 0 },
      { "id": "uuid", "name": "점심", "sort_order": 1 },
      { "id": "uuid", "name": "저녁", "sort_order": 2 }
    ]
  }
}
```

### POST /planner/columns

```
POST /planner/columns
```

- 로그인 필수
- Body: `{ "name": "string (1~30자)" }`
- 응답 (201):

```json
{
  "success": true,
  "data": {
    "column": { "id": "uuid", "name": "간식", "sort_order": 3 }
  }
}
```

- 에러:
  - 409 `COLUMN_LIMIT_REACHED` — 사용자별 컬럼 수가 이미 5개
  - 409 `COLUMN_NAME_DUPLICATE` — 공백 trim 후 같은 이름 중복
  - 422 — name이 빈 문자열이거나 30자 초과 (invalid body)

### PATCH /planner/columns/{column_id}

```
PATCH /planner/columns/{column_id}
```

- 로그인 필수
- Body: `{ "name": "string (1~30자)" }`
- 응답 (200):

```json
{
  "success": true,
  "data": {
    "column": { "id": "uuid", "name": "브런치", "sort_order": 1 }
  }
}
```

- 에러:
  - 404 — 존재하지 않는 컬럼
  - 403 — 타인의 컬럼
  - 409 `COLUMN_NAME_DUPLICATE` — 공백 trim 후 같은 이름 중복
  - 422 — name이 빈 문자열이거나 30자 초과 (invalid body)

### DELETE /planner/columns/{column_id}

```
DELETE /planner/columns/{column_id}
```

- 로그인 필수
- 응답 (200):

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

- 에러:
  - 404 — 존재하지 않는 컬럼
  - 403 — 타인의 컬럼
  - 409 `COLUMN_HAS_MEALS` — 해당 컬럼에 등록된 식사가 있음
  - 409 `MIN_COLUMN_REQUIRED` — 삭제하면 컬럼 수가 0개가 됨 (최소 1개 유지)
- 삭제 성공 후 남은 컬럼은 `sort_order ASC, id ASC` 기준으로 0부터 재정렬

### GET /planner (변경 사항)

- 기존 계약 유지, `columns` 배열이 사용자별 동적 목록을 반환
- 신규 사용자 기본값: 3개 (아침 / 점심 / 저녁)

### Bootstrap 변경

- 회원가입 시 자동 생성: `meal_plan_columns ×3` (아침 sort_order=0, 점심 sort_order=1, 저녁 sort_order=2)
- 기존 4개 bootstrap에서 `간식` 제거

## Frontend Delivery Mode

- SETTINGS 끼니 컬럼 관리 섹션: 기능 가능한 UI로 먼저 개발
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - loading: 컬럼 목록 로딩 중
  - empty: N/A — 컬럼이 0개인 상태는 불가능 (서버가 최소 1개를 강제)
  - error: API 실패 시 에러 표시
  - read-only: N/A — 끼니 컬럼은 read-only 전환 정책 없음 (항상 편집 가능)
  - unauthorized: 로그인 게이트 → return-to-action
- PLANNER_WEEK: 기존 4고정 렌더링을 동적 컬럼 배열 기반으로 변경
- 5-column 대응: 화면정의서 v1.5.2 §5 정보 축약 원칙 적용

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact: Stage 4 완료 후 implementation screenshot 생성
- Authority status: `required`
- Notes: `PLANNER_WEEK`는 앵커 스크린이므로 동적 컬럼 표시가 기존 레이아웃/밀도를 해치지 않는지 authority review 필요. `SETTINGS` 컬럼 관리 섹션은 기존 설정 화면 확장이므로 low-risk.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.5.md` — 1-4 플래너 끼니 컬럼 정책, 1-9 마이페이지/설정
- `docs/화면정의서-v1.5.2.md` — PLANNER_WEEK §5 동적 컬럼, SETTINGS §D 끼니 컬럼 관리
- `docs/api문서-v1.2.3.md` — 3-2~3-5 `/planner/columns` CRUD
- `docs/db설계-v1.3.2.md` — 5-1 `meal_plan_columns` 정책
- `docs/유저flow맵-v1.3.2.md` — ② bootstrap ×3, ⑨ 설정 컬럼 관리

## QA / Test Data Plan

- fixture baseline:
  - 기본 사용자: 3개 컬럼 (아침/점심/저녁)
  - 기존 사용자: 4개 컬럼 (아침/점심/간식/저녁) — 마이그레이션 호환 테스트
  - 5개 컬럼 사용자: 최대 개수 경계 테스트
  - 1개 컬럼 사용자: 최소 개수 경계 테스트
  - 식사가 연결된 컬럼 보유 사용자: 삭제 제한 테스트
- real DB smoke 경로: `pnpm dev:local-supabase`, `pnpm dev:demo`
- seed / reset: 기존 seed 스크립트에 3개 기본 컬럼 bootstrap 반영
- bootstrap 생성 데이터: `meal_plan_columns ×3` (아침/점심/저녁)
- blocker 조건: `05-planner-week-core`와 `17c-settings-account`가 merged 상태여야 함 (확인 완료)

## Key Rules

- 컬럼 수 최소 1개, 최대 5개 — 서버에서 강제
- 삭제 시 `meals` FK 참조 확인 — 연결된 식사가 있으면 409 `COLUMN_HAS_MEALS`
- 삭제 후 sort_order 재정렬 — `sort_order ASC, id ASC` 기준으로 0부터
- 이름 중복 검사 — 공백 trim 후 같은 사용자 내 unique
- 이름 길이 — 1~30자, 위반 시 422
- 타인 리소스 수정 불가 — `user_id` 소유자 검증
- `GET /meals`, `POST /meals` — `column_id`가 요청 사용자 소유의 동적 컬럼인지 검증 (요청/응답 계약 변경 없음)
- 순서 변경 API 없음 — 1차 구현 범위 밖
- 기존 사용자 자동 삭제 없음 — 설정에서 사용자가 직접 정리
- PLANNER_WEEK 5-column 대응 — 화면정의서 §5 정보 축약 원칙 적용

## Contract Evolution Candidates (Optional)

- 없음 — 이 슬라이스 자체가 contract-evolution(PR #367) 결과물이며 공식 문서에 이미 반영됨

## Primary User Path

1. `SETTINGS` 진입 → 끼니 컬럼 관리 섹션 확인
2. 컬럼 이름 변경 / 추가 / 삭제 액션 수행
3. `PLANNER_WEEK`에서 변경된 컬럼 구성 확인
4. 식사가 연결된 컬럼 삭제 시도 → 삭제 불가 안내 확인

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

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
