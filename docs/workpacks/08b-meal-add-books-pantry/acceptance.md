# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [ ] 레시피북 목록 조회가 정상 동작한다 <!-- omo:id=accept-recipebook-list;stage=2;scope=backend;review=3,6 -->
- [ ] 레시피북 내 레시피 목록 조회가 정상 동작한다 <!-- omo:id=accept-recipebook-recipes;stage=2;scope=backend;review=3,6 -->
- [ ] 팬트리 기반 추천 목록 조회가 정상 동작한다 <!-- omo:id=accept-pantry-match;stage=2;scope=backend;review=3,6 -->
- [ ] 레시피북에서 레시피 선택 → Meal 생성 흐름이 정상 동작한다 <!-- omo:id=accept-recipebook-to-meal;stage=4;scope=frontend;review=5,6 -->
- [ ] 팬트리 추천에서 레시피 선택 → Meal 생성 흐름이 정상 동작한다 <!-- omo:id=accept-pantry-to-meal;stage=4;scope=frontend;review=5,6 -->
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=5,6 -->

## State / Policy
- [ ] Meal 생성 시 상태가 `registered`로 고정된다 <!-- omo:id=accept-meal-status-registered;stage=2;scope=backend;review=3,6 -->
- [ ] 레시피북 소유자 검증이 정상 동작한다 (타인 book_id 접근 시 403) <!-- omo:id=accept-recipebook-owner-guard;stage=2;scope=backend;review=3,6 -->
- [ ] column_id 소유자 검증이 정상 동작한다 (타인 column_id 접근 시 403) <!-- omo:id=accept-column-owner-guard;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [ ] loading 상태가 있다 (레시피북 목록, 레시피북 내 레시피, 팬트리 추천, Meal 생성) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 (레시피북 없음, 레시피북 내 레시피 없음, 팬트리 추천 없음) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (네트워크 오류, 서버 오류, 권한 오류) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (비로그인 시 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [ ] 404 처리 흐름이 있다 (recipe_id, column_id, book_id 미존재) <!-- omo:id=accept-not-found;stage=2;scope=backend;review=3,6 -->
- [ ] 422 처리 흐름이 있다 (planned_servings 음수 또는 0) <!-- omo:id=accept-validation-error;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [ ] 타인 레시피북을 조회할 수 없다 (403) <!-- omo:id=accept-recipebook-owner-isolation;stage=2;scope=backend;review=3,6 -->
- [ ] 타인 column에 Meal을 생성할 수 없다 (403) <!-- omo:id=accept-column-owner-isolation;stage=2;scope=backend;review=3,6 -->
- [ ] invalid input을 적절히 거부한다 (planned_servings 음수/0) <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [ ] fixture에서 시스템 레시피북 3개 (my_added, saved, liked)가 준비되어 있다 <!-- omo:id=accept-fixture-system-books;stage=2;scope=shared;review=3,6 -->
- [ ] fixture에서 커스텀 레시피북 1~2개가 준비되어 있다 <!-- omo:id=accept-fixture-custom-books;stage=2;scope=shared;review=3,6 -->
- [ ] fixture에서 각 레시피북에 레시피 2~5개가 준비되어 있다 <!-- omo:id=accept-fixture-book-recipes;stage=2;scope=shared;review=3,6 -->
- [ ] fixture에서 팬트리 항목 5~10개가 준비되어 있다 <!-- omo:id=accept-fixture-pantry-items;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 필요한 테이블 (recipe_books, pantry_items, recipes, meals)이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] 회원가입 시 시스템 레시피북 3개가 자동 생성되는지 확인했다 <!-- omo:id=accept-bootstrap-system-books;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier:
- environment:
- scenarios:

## Automation Split

### Vitest
- [ ] 레시피북 목록 조회 로직이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-recipebook-list;stage=2;scope=backend;review=3,6 -->
- [ ] 레시피북 내 레시피 목록 조회 로직이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-recipebook-recipes;stage=2;scope=backend;review=3,6 -->
- [ ] 팬트리 기반 추천 로직이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-pantry-match;stage=2;scope=backend;review=3,6 -->
- [ ] Meal 생성 로직 (status='registered' 고정)이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-meal-creation;stage=2;scope=backend;review=3,6 -->
- [ ] 권한 검증 (book_id, column_id 소유자 일치)이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-owner-guard;stage=2;scope=backend;review=3,6 -->

### Playwright
- [ ] 레시피북 버튼 → 레시피북 선택 → 레시피 선택 → Meal 생성 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-recipebook-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 팬트리 버튼 → 팬트리 추천 레시피 선택 → Meal 생성 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-pantry-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 + return-to-action 흐름이 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태 (레시피북 없음, 레시피 없음, 팬트리 추천 없음)가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-empty;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] live OAuth 기반 회원가입 시 시스템 레시피북 3개 자동 생성 확인 (local Supabase 환경에서 수동 검증)
