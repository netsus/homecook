# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] PLANNER_WEEK [남은요리] → LEFTOVERS 화면 진입 시 남은요리 리스트가 최근순으로 표시된다 <!-- omo:id=accept-happy-leftovers-list;stage=4;scope=frontend;review=5,6 -->
- [x] LEFTOVERS 아이템 카드에 레시피명, 요리완료일, [다먹음], [플래너에 추가] 버튼이 표시된다 <!-- omo:id=accept-happy-leftovers-card;stage=4;scope=frontend;review=5,6 -->
- [x] [다먹음] 클릭 시 해당 항목이 eaten 상태로 전이되고 LEFTOVERS 리스트에서 사라진다 <!-- omo:id=accept-happy-eat;stage=4;scope=frontend;review=5,6 -->
- [x] ATE_LIST 화면에서 다먹은 항목이 최신순으로 표시된다 (레시피명, 다먹은 날짜) <!-- omo:id=accept-happy-ate-list;stage=4;scope=frontend;review=5,6 -->
- [x] ATE_LIST에서 [덜먹음] 클릭 시 해당 항목이 leftover 상태로 복귀하고 LEFTOVERS 리스트에 다시 나타난다 <!-- omo:id=accept-happy-uneat;stage=4;scope=frontend;review=5,6 -->
- [x] [플래너에 추가] 클릭 시 날짜/끼니 선택 + 인분 입력 → Meal 생성 성공 (is_leftover=true, leftover_dish_id 포함) <!-- omo:id=accept-happy-planner-add;stage=4;scope=frontend;review=5,6 -->
- [x] GET /leftovers 응답이 공식 API §10-1 형식과 일치한다 <!-- omo:id=accept-happy-get-response;stage=2;scope=backend;review=3,6 -->
- [x] POST /leftovers/{id}/eat 응답이 공식 API §10-2 형식과 일치한다 <!-- omo:id=accept-happy-eat-response;stage=2;scope=backend;review=3,6 -->
- [x] POST /leftovers/{id}/uneat 응답이 공식 API §10-3 형식과 일치한다 <!-- omo:id=accept-happy-uneat-response;stage=2;scope=backend;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] leftover_dishes.status 전이가 공식 문서와 일치한다 (leftover ↔ eaten) <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] eat 시 eaten_at=now(), auto_hide_at=eaten_at+30d가 설정된다 <!-- omo:id=accept-state-eat-fields;stage=2;scope=backend;review=3,6 -->
- [x] uneat 시 eaten_at=NULL, auto_hide_at=NULL이 설정된다 <!-- omo:id=accept-state-uneat-fields;stage=2;scope=backend;review=3,6 -->
- [x] DB CHECK 제약을 위반하는 상태 전이가 없다 <!-- omo:id=accept-state-check-constraint;stage=2;scope=backend;review=3,6 -->
- [x] eat은 이미 eaten이면 200 + 동일 결과 반환 (멱등) <!-- omo:id=accept-idempotency-eat;stage=2;scope=backend;review=3,6 -->
- [x] uneat은 이미 leftover이면 200 + 동일 결과 반환 (멱등) <!-- omo:id=accept-idempotency-uneat;stage=2;scope=backend;review=3,6 -->
- [x] 남은요리 → 플래너 추가 시 meals.is_leftover=true, meals.leftover_dish_id가 올바르게 설정된다 <!-- omo:id=accept-state-planner-add-fields;stage=2;scope=backend;review=3,6 -->
- [x] GET /leftovers?status=eaten에서 auto_hide_at 만료 항목이 제외된다 <!-- omo:id=accept-state-auto-hide;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [x] loading 상태가 있다 (LEFTOVERS/ATE_LIST 데이터 로딩 중) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (남은요리/다먹은 항목 없을 때 안내 메시지) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (API 오류 시 에러 메시지 + 재시도) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (비로그인 → 로그인 유도) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [x] 타인 소유 leftover에 eat/uneat 시 403 반환 <!-- omo:id=accept-error-403;stage=2;scope=backend;review=3,6 -->
- [x] 미존재 leftover_id에 eat/uneat 시 404 반환 <!-- omo:id=accept-error-404;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [x] eat/uneat에서 user_id = current_user.id만 처리된다 (소유자 검증) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 타인 소유 leftover에 대한 상태 전이가 거부된다 <!-- omo:id=accept-owner-guard-reject;stage=2;scope=backend;review=3,6 -->
- [x] 남은요리 → 플래너 추가 시 leftover_dish_id 소유자 검증이 된다 <!-- omo:id=accept-planner-add-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] leftover_dishes.recipe_id가 recipes 테이블에 실재하는 레시피를 참조한다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 leftover_dishes (leftover, eaten, 만료 eaten) + recipes + meal_plan_columns가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에서 leftover_dishes, meals, recipes, meal_plan_columns 테이블이 존재한다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] leftover_dishes는 요리 완료(15a/15b) flow에서 생성되는 owning flow가 확인되었다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: agent or human
- environment: fixture + local Supabase
- scenarios:
  - PLANNER_WEEK [남은요리] → LEFTOVERS 진입 → 목록 확인 → [다먹음] → ATE_LIST 이동 확인
  - ATE_LIST에서 [덜먹음] → LEFTOVERS 복귀 확인
  - LEFTOVERS에서 [플래너에 추가] → 날짜/끼니/인분 선택 → Meal 생성 확인 → 플래너에서 is_leftover 표시 확인
  - LEFTOVERS empty 상태 확인 (leftover 항목 없을 때 안내 메시지)
  - ATE_LIST empty 상태 확인
  - 비로그인 → LEFTOVERS 접근 → 로그인 유도 확인
  - 30일 초과 eaten 항목이 ATE_LIST에서 숨김 처리되는지 확인

## Automation Split

### Vitest
- [x] GET /leftovers 핸들러: status=leftover 조회, status=eaten 조회, 30일 초과 eaten 필터링, 정렬 순서, 401 에러 <!-- omo:id=accept-vitest-get-leftovers;stage=2;scope=backend;review=3,6 -->
- [x] POST /leftovers/{id}/eat 핸들러: 정상 전이, 멱등성, 소유자 검증(403), 미존재(404), 비로그인(401) <!-- omo:id=accept-vitest-eat;stage=2;scope=backend;review=3,6 -->
- [x] POST /leftovers/{id}/uneat 핸들러: 정상 전이, 멱등성, 소유자 검증(403), 미존재(404), 비로그인(401) <!-- omo:id=accept-vitest-uneat;stage=2;scope=backend;review=3,6 -->
- [x] POST /meals (leftover_dish_id): is_leftover=true 자동 세팅, leftover 소유자 검증 <!-- omo:id=accept-vitest-planner-add-leftover;stage=2;scope=backend;review=3,6 -->
- [x] DB CHECK 제약 일치 검증 (eaten → eaten_at+auto_hide_at 동시 세팅, leftover → eaten_at NULL) <!-- omo:id=accept-vitest-check-constraint;stage=2;scope=backend;review=3,6 -->
- [x] 프론트 LEFTOVERS/ATE_LIST 상태 전이 로직 (목록 로딩, eat/uneat 후 리스트 갱신) <!-- omo:id=accept-vitest-frontend-state;stage=4;scope=frontend;review=5,6 -->
- [x] 프론트 empty state 렌더링 검증 <!-- omo:id=accept-vitest-frontend-empty;stage=4;scope=frontend;review=5,6 -->
- [x] 프론트 플래너 추가 flow 검증 (PlannerAddSheet 연동, leftover_dish_id 전달) <!-- omo:id=accept-vitest-frontend-planner-add;stage=4;scope=frontend;review=5,6 -->

### Playwright
- [x] LEFTOVERS 진입 → 리스트 표시 → [다먹음] → 항목 사라짐 + ATE_LIST에 나타남 <!-- omo:id=accept-playwright-eat-flow;stage=4;scope=frontend;review=5,6 -->
- [x] ATE_LIST → [덜먹음] → LEFTOVERS에 복귀 <!-- omo:id=accept-playwright-uneat-flow;stage=4;scope=frontend;review=5,6 -->
- [x] LEFTOVERS → [플래너에 추가] → 날짜/끼니/인분 선택 → Meal 생성 성공 <!-- omo:id=accept-playwright-planner-add;stage=4;scope=frontend;review=5,6 -->
- [x] LEFTOVERS empty 상태 표시 <!-- omo:id=accept-playwright-empty;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 → LEFTOVERS 접근 → 로그인 게이트 + return-to-action <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] live OAuth 로그인 후 LEFTOVERS/ATE_LIST 접근 및 eat/uneat/플래너 추가 동작 확인 (실제 소셜 로그인 환경)
- [ ] 30일 경과 eaten 항목의 실제 시간 기반 자동 숨김 확인 (시간 조작 또는 장기 테스트)
- [ ] 모바일 기기에서 LEFTOVERS/ATE_LIST 레이아웃 및 터치 인터랙션 확인
