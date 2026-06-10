# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, real DB smoke, 실제 route 검증처럼 evidence가 생긴 뒤에만 한다.
> 33a는 BE-only slice이므로 Stage 4~6 frontend acceptance는 N/A다.
> `Manual Only`를 제외한 각 체크박스 끝에는 `omo:id` metadata를 유지한다.

## Happy Path

- [ ] 신규 사용자가 progress summary 없이 `GET /api/v1/users/me/progress`를 호출하면 level 1 / 0 XP 응답을 받는다 <!-- omo:id=accept-zero-xp-progress;stage=2;scope=backend;review=3 -->
- [ ] XP 보유 사용자가 `GET /api/v1/users/me/progress`를 호출하면 공식 문서의 `{ success, data, error }` envelope와 `level`, `event_counts`, `last_updated_at` shape를 받는다 <!-- omo:id=accept-progress-response-shape;stage=2;scope=backend;review=3 -->
- [ ] `cooking_completed` source action 후 ledger/projection이 증가한다 <!-- omo:id=accept-cooking-award;stage=2;scope=backend;review=3 -->
- [ ] `shopping_completed` source action 후 ledger/projection이 증가한다 <!-- omo:id=accept-shopping-award;stage=2;scope=backend;review=3 -->
- [ ] `recipe_saved` 최초 savable membership 생성 후 distinct-ever count가 증가한다 <!-- omo:id=accept-recipe-saved-award;stage=2;scope=backend;review=3 -->
- [ ] `custom_book_created` custom book 생성 후 ledger/projection이 증가한다 <!-- omo:id=accept-custom-book-award;stage=2;scope=backend;review=3 -->
- [ ] 백엔드 계약과 TypeScript response type이 일치한다 <!-- omo:id=accept-backend-types;stage=2;scope=shared;review=3 -->

## State / Policy

- [ ] 같은 source action retry는 idempotency key로 중복 award되지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3 -->
- [ ] 이미 완료된 shopping list 재요청은 XP를 재적립하지 않는다 <!-- omo:id=accept-shopping-retry-no-award;stage=2;scope=backend;review=3 -->
- [ ] 저장 해제 후 다시 저장해도 `recipe_saved:{user_id}:{recipe_id}`가 이미 있으면 재적립하지 않는다 <!-- omo:id=accept-resave-no-award;stage=2;scope=backend;review=3 -->
- [ ] `liked` / `my_added` / system books는 `recipe_saved` 또는 `custom_book_created` XP source가 아니다 <!-- omo:id=accept-system-book-exclusions;stage=2;scope=backend;review=3 -->
- [ ] XP curve와 level 계산은 server authority이며 client-side 공식 복제가 필요 없다 <!-- omo:id=accept-server-authority-level;stage=2;scope=backend;review=3 -->
- [ ] `GET /users/me` response에 progress field를 추가하지 않는다 <!-- omo:id=accept-users-me-profile-only;stage=2;scope=backend;review=3 -->

## Error / Permission

- [ ] 비로그인 사용자는 `GET /api/v1/users/me/progress`에서 401 envelope를 받는다 <!-- omo:id=accept-unauthorized;stage=2;scope=backend;review=3 -->
- [ ] 다른 사용자의 progress ledger/summary를 조회하거나 수정할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3 -->
- [ ] progress 내부 실패는 endpoint error envelope로 반환되고 기존 source action 경계를 오염시키지 않는다 <!-- omo:id=accept-progress-error-boundary;stage=2;scope=backend;review=3 -->
- [ ] projection row가 없거나 mismatch가 있어도 reconcile 가능한 경로가 있다 <!-- omo:id=accept-reconcile-path;stage=2;scope=backend;review=3 -->

## Data Integrity

- [ ] `user_progress_events`는 `(user_id, event_type, source_key)` unique constraint를 가진다 <!-- omo:id=accept-ledger-unique;stage=2;scope=backend;review=3 -->
- [ ] `xp_delta`는 양수만 허용한다 <!-- omo:id=accept-positive-xp;stage=2;scope=backend;review=3 -->
- [ ] `event_counts.recipe_saved_distinct_ever`는 ledger distinct-ever 기준이며 현재 membership 수나 `recipes.save_count`가 아니다 <!-- omo:id=accept-recipe-saved-distinct-ever;stage=2;scope=backend;review=3 -->
- [ ] backfill은 surviving rows lower-bound이며 삭제된 과거 활동 복원을 주장하지 않는다 <!-- omo:id=accept-backfill-lower-bound;stage=2;scope=backend;review=3 -->
- [ ] `operational_events`를 사용자 보상 truth로 재사용하지 않는다 <!-- omo:id=accept-no-operational-events-truth;stage=2;scope=backend;review=3 -->
- [ ] RLS 또는 service-role boundary가 사용자별 progress table 접근을 보호한다 <!-- omo:id=accept-rls-boundary;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [ ] fixture에서 0 XP, XP 보유, duplicate source, legacy backfill case가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3 -->
- [ ] real DB smoke에서 progress tables, indexes, constraints가 존재한다 <!-- omo:id=accept-real-db-schema;stage=2;scope=backend;review=3 -->
- [ ] source action 4종 중 최소 2종을 real route로 수행해 ledger/projection 증가를 확인한다 <!-- omo:id=accept-real-route-smoke;stage=2;scope=backend;review=3 -->
- [ ] recipe book bootstrap system books가 XP 대상에서 제외되는지 확인한다 <!-- omo:id=accept-bootstrap-exclusion;stage=2;scope=backend;review=3 -->

## Manual QA

- verifier: Codex Stage 2 implementer + Claude Stage 3 reviewer
- environment: local Supabase 또는 agreed smoke DB
- scenarios:
  - 신규 로그인 사용자로 progress 조회 시 level 1 / 0 XP 확인
  - 장보기 완료 또는 요리 완료 후 XP 증가 확인
  - 같은 완료 action retry 후 XP가 중복 증가하지 않는지 확인
  - saved -> unsave -> resave 후 `recipe_saved_distinct_ever`가 재증가하지 않는지 확인

## Automation Split

### Vitest

- [ ] XP curve boundary와 `progress_percent` 계산 단위 테스트 <!-- omo:id=accept-vitest-level-curve;stage=2;scope=backend;review=3 -->
- [ ] canonical event writer 4종 unit/integration 테스트 <!-- omo:id=accept-vitest-event-writers;stage=2;scope=backend;review=3 -->
- [ ] idempotency duplicate source 테스트 <!-- omo:id=accept-vitest-idempotency;stage=2;scope=backend;review=3 -->
- [ ] `GET /api/v1/users/me/progress` route 테스트 <!-- omo:id=accept-vitest-route;stage=2;scope=backend;review=3 -->
- [ ] backfill/reconcile lower-bound 테스트 <!-- omo:id=accept-vitest-backfill;stage=2;scope=backend;review=3 -->

### Playwright

- N/A - 33a는 BE-only foundation이며 사용자 화면 변경 없음

### Manual Only

- [ ] legacy production-like data에서 backfill이 lower-bound로만 집계되는지 운영자가 표본 확인
