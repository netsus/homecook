# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path

- [ ] SETTINGS 끼니 컬럼 관리에서 현재 컬럼 목록이 표시된다 <!-- omo:id=accept-column-list;stage=4;scope=frontend;review=5,6 -->
- [ ] 컬럼 이름을 변경하면 PLANNER_WEEK에 즉시 반영된다 <!-- omo:id=accept-rename-reflect;stage=4;scope=frontend;review=5,6 -->
- [ ] 컬럼을 추가하면 PLANNER_WEEK에 새 슬롯이 표시된다 <!-- omo:id=accept-add-reflect;stage=4;scope=frontend;review=5,6 -->
- [ ] 빈 컬럼을 삭제하면 PLANNER_WEEK에서 해당 슬롯이 제거된다 <!-- omo:id=accept-delete-reflect;stage=4;scope=frontend;review=5,6 -->
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [ ] GET /planner 응답의 columns가 사용자별 동적 목록을 반환한다 <!-- omo:id=accept-planner-dynamic-columns;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] 신규 사용자 bootstrap이 3개 컬럼(아침/점심/저녁)을 생성한다 <!-- omo:id=accept-bootstrap-three;stage=2;scope=backend;review=3,6 -->
- [ ] 컬럼 수 최소 1개 제한이 서버에서 강제된다 <!-- omo:id=accept-min-one;stage=2;scope=backend;review=3,6 -->
- [ ] 컬럼 수 최대 5개 제한이 서버에서 강제된다 <!-- omo:id=accept-max-five;stage=2;scope=backend;review=3,6 -->
- [ ] 삭제 후 남은 컬럼의 sort_order가 0부터 재정렬된다 <!-- omo:id=accept-reorder-after-delete;stage=2;scope=backend;review=3,6 -->
- [ ] 컬럼 추가 시 sort_order가 마지막 + 1로 설정된다 <!-- omo:id=accept-add-sort-order;stage=2;scope=backend;review=3,6 -->
- [ ] 중복 호출에도 결과가 꼬이지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 (컬럼 목록 로딩) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (API 실패) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 409 COLUMN_LIMIT_REACHED — 5개 초과 추가 시도 시 적절한 안내가 있다 <!-- omo:id=accept-limit-reached;stage=4;scope=frontend;review=5,6 -->
- [ ] 409 COLUMN_NAME_DUPLICATE — 중복 이름 시도 시 적절한 안내가 있다 <!-- omo:id=accept-name-duplicate;stage=4;scope=frontend;review=5,6 -->
- [ ] 409 COLUMN_HAS_MEALS — 식사가 연결된 컬럼 삭제 시도 시 삭제 불가 안내가 있다 <!-- omo:id=accept-has-meals;stage=4;scope=frontend;review=5,6 -->
- [ ] 409 MIN_COLUMN_REQUIRED — 마지막 1개 컬럼 삭제 시도 시 삭제 불가 안내가 있다 <!-- omo:id=accept-min-column-required;stage=4;scope=frontend;review=5,6 -->
- [ ] 422 — 이름이 빈 문자열이거나 30자 초과 시 적절한 에러 처리 <!-- omo:id=accept-invalid-name;stage=2;scope=backend;review=3,6 -->
- [ ] 404 — 존재하지 않는 컬럼 수정/삭제 시도 시 처리 <!-- omo:id=accept-not-found;stage=2;scope=backend;review=3,6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 타인 리소스를 수정할 수 없다 (user_id 소유자 검증) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [ ] 이름 공백 trim 후 중복 검사가 수행된다 <!-- omo:id=accept-name-trim;stage=2;scope=backend;review=3,6 -->
- [ ] 이름 길이 1~30자 범위가 서버에서 검증된다 <!-- omo:id=accept-name-length;stage=2;scope=backend;review=3,6 -->
- [ ] 삭제 전 meals FK 참조 확인이 서버에서 수행된다 <!-- omo:id=accept-fk-check;stage=2;scope=backend;review=3,6 -->
- [ ] 기존 4컬럼 사용자의 데이터가 손상되지 않는다 <!-- omo:id=accept-legacy-compat;stage=2;scope=backend;review=3,6 -->
- [ ] GET /meals가 사용자 소유의 동적 column_id를 가진 식사만 반환한다 <!-- omo:id=accept-meals-get-dynamic;stage=2;scope=backend;review=3,6 -->
- [ ] POST /meals가 column_id로 사용자 소유의 동적 컬럼만 허용하고 타인 컬럼은 거부한다 <!-- omo:id=accept-meals-post-dynamic;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] fixture에서 3컬럼/4컬럼/5컬럼/1컬럼 사용자 baseline이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 필요한 meal_plan_columns seed가 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] bootstrap 변경(×4 → ×3)이 신규 사용자 가입 flow에서 검증 가능하다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: Claude (Stage 4) / Codex (Stage 5-6)
- environment: `pnpm dev:local-supabase`, `pnpm dev:demo`
- scenarios:
  - 신규 사용자 가입 후 PLANNER_WEEK에서 3개 컬럼 확인
  - SETTINGS에서 컬럼 이름 변경 → PLANNER_WEEK 반영 확인
  - SETTINGS에서 컬럼 추가 (4개, 5개) → PLANNER_WEEK 반영 확인
  - 5개 상태에서 추가 시도 → 제한 안내 확인
  - 빈 컬럼 삭제 → PLANNER_WEEK 반영 확인
  - 식사가 있는 컬럼 삭제 시도 → 삭제 불가 안내 확인
  - 마지막 1개 컬럼 삭제 시도 → 삭제 불가 안내 확인
  - 중복 이름으로 추가/변경 시도 → 중복 안내 확인
  - 기존 4컬럼 사용자 로그인 → 4개 컬럼 유지 확인
  - 5컬럼 PLANNER_WEEK 표시 → 정보 축약 원칙 적용 확인

## Automation Split

### Vitest

- [ ] GET/POST/PATCH/DELETE /planner/columns 응답 형식 테스트 <!-- omo:id=accept-vitest-api-response;stage=2;scope=backend;review=3,6 -->
- [ ] 컬럼 수 min/max 경계값 테스트 <!-- omo:id=accept-vitest-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] 이름 중복/trim/길이 검증 테스트 <!-- omo:id=accept-vitest-name-validation;stage=2;scope=backend;review=3,6 -->
- [ ] 삭제 시 meals FK 참조 확인 테스트 <!-- omo:id=accept-vitest-fk-guard;stage=2;scope=backend;review=3,6 -->
- [ ] 삭제 후 sort_order 재정렬 테스트 <!-- omo:id=accept-vitest-reorder;stage=2;scope=backend;review=3,6 -->
- [ ] 소유자 검증 테스트 (타인 컬럼 접근 금지) <!-- omo:id=accept-vitest-owner;stage=2;scope=backend;review=3,6 -->
- [ ] bootstrap ×3 생성 테스트 <!-- omo:id=accept-vitest-bootstrap;stage=2;scope=backend;review=3,6 -->
- [ ] GET/POST /meals 동적 column_id 소유자 검증 테스트 <!-- omo:id=accept-vitest-meals-dynamic;stage=2;scope=backend;review=3,6 -->

### Playwright

- [ ] SETTINGS 끼니 컬럼 관리 CRUD 전체 흐름 <!-- omo:id=accept-playwright-settings-crud;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 동적 컬럼 렌더링 확인 <!-- omo:id=accept-playwright-planner-dynamic;stage=4;scope=frontend;review=5,6 -->
- [ ] 에러 상태(409 제한, 중복) UI 반영 확인 <!-- omo:id=accept-playwright-error-states;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 후 return-to-action 확인 <!-- omo:id=accept-playwright-return-action;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 기존 production 사용자(4컬럼)의 실제 데이터 호환성 확인 — 실제 운영 DB에서만 검증 가능
