# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path

- [ ] 팬트리 목록 조회가 정상 동작한다 (보유 재료 리스트 표시) <!-- omo:id=accept-pantry-list;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 직접 추가가 정상 동작한다 (검색/선택 → POST /pantry → 목록 갱신) <!-- omo:id=accept-direct-add;stage=4;scope=frontend;review=5,6 -->
- [ ] 묶음 추가가 정상 동작한다 (PANTRY_BUNDLE_PICKER → 체크 → POST /pantry → 복귀) <!-- omo:id=accept-bundle-add;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 삭제가 정상 동작한다 (선택 → DELETE /pantry → 목록 갱신) <!-- omo:id=accept-delete;stage=4;scope=frontend;review=5,6 -->
- [ ] 검색/카테고리 필터가 정상 동작한다 <!-- omo:id=accept-search-filter;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [x] GET /pantry/bundles에서 `is_in_pantry`가 현재 사용자 기준으로 정확하다 <!-- omo:id=accept-bundle-is-in-pantry;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [x] 팬트리는 보유 여부만 관리한다 (수량 필드 없음) <!-- omo:id=accept-no-quantity;stage=2;scope=backend;review=3,6 -->
- [x] 중복 재료 추가 시 silent skip (에러 아님, 멱등성) <!-- omo:id=accept-duplicate-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] 존재하지 않는 ingredient_id 추가 시 silent skip <!-- omo:id=accept-invalid-ingredient-skip;stage=2;scope=backend;review=3,6 -->
- [x] 이미 없는 재료 삭제 시 silent skip (멱등성) <!-- omo:id=accept-delete-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] `(user_id, ingredient_id)` UNIQUE 제약이 DB 레벨에서 보장됨 <!-- omo:id=accept-unique-constraint;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 (팬트리 목록, 묶음 목록 로딩 스켈레톤) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 (팬트리 비어있을 때 안내 + 추가 CTA) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (API 실패 시 재시도 안내) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (미로그인 → 로그인 게이트 모달) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 후 return-to-action `/pantry`가 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [x] POST /pantry에 빈 배열 전송 시 422 응답 <!-- omo:id=accept-empty-array-422;stage=2;scope=backend;review=3,6 -->
- [x] DELETE /pantry에 빈 배열 전송 시 422 응답 <!-- omo:id=accept-delete-empty-422;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] 타인 리소스를 수정할 수 없다 (다른 사용자의 pantry_items에 접근 불가) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid ingredient_id를 적절히 무시한다 (에러가 아닌 skip) <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] `added` count는 실제 신규 추가된 수와 일치한다 <!-- omo:id=accept-added-count;stage=2;scope=backend;review=3,6 -->
- [x] `removed` count는 실제 삭제된 수와 일치한다 <!-- omo:id=accept-removed-count;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (ingredients seed, bundles seed, 테스트용 pantry_items) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 (pantry_items, ingredients, ingredient_bundles, ingredient_bundle_items 존재 확인) <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] ingredients, ingredient_bundles seed data가 로컬 Supabase에 실제로 존재한다 <!-- omo:id=accept-seed-present;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: 사용자 또는 QA agent
- environment: `pnpm dev:local-supabase` 또는 `pnpm dev:demo`
- scenarios:
  - 팬트리 화면 진입 → 빈 상태 확인 → 재료 직접 추가 → 목록 반영 확인
  - 묶음 추가 → 체크리스트에서 일부 선택 → 추가 → 팬트리 반영 확인
  - 이미 있는 재료를 다시 추가 → 중복 없이 유지 확인
  - 재료 선택 삭제 → 목록에서 제거 확인
  - 검색/카테고리 필터 동작 확인
  - 미로그인 상태에서 팬트리 접근 → 로그인 게이트 → 로그인 후 /pantry 복귀 확인

## Automation Split

### Vitest

- [x] 팬트리 CRUD API 핸들러 단위 테스트 (happy path, 중복, 삭제, 소유자 가드, 빈 배열 422) <!-- omo:id=accept-vitest-pantry-api;stage=2;scope=backend;review=3,6 -->
- [x] 묶음 조회 API 단위 테스트 (is_in_pantry join 정확성) <!-- omo:id=accept-vitest-bundles-api;stage=2;scope=backend;review=3,6 -->
- [ ] 프론트 상태 관리 / API helper 단위 테스트 <!-- omo:id=accept-vitest-frontend;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] PANTRY 화면 진입 → 목록 조회 → 직접 추가 → 삭제 E2E 흐름 <!-- omo:id=accept-playwright-pantry-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] PANTRY_BUNDLE_PICKER 진입 → 묶음 선택 → 체크 → 추가 E2E 흐름 <!-- omo:id=accept-playwright-bundle-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 미로그인 팬트리 접근 → 로그인 게이트 표시 E2E <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 빈 팬트리 상태 → empty state 표시 확인 <!-- omo:id=accept-playwright-empty-state;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 소셜 로그인(OAuth) 후 return-to-action `/pantry` 복귀 확인 — live OAuth 필요
- [ ] 프로덕션 또는 스테이징 환경에서 ingredients/bundles seed 데이터 정합성 확인
