# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] unresolved/needs_review 재료 2건 이상일 때 bulk CTA가 노출된다 <!-- omo:id=accept-bulk-cta-visibility;stage=4;scope=frontend;review=5,6 -->
- [x] bulk sheet에서 선택된 row를 일괄 등록하면 성공 row가 resolved로 전환된다 <!-- omo:id=accept-bulk-register-success;stage=4;scope=frontend;review=5,6 -->
- [x] bulk sheet 닫기 후 검수 화면에 resolved 상태가 반영된다 <!-- omo:id=accept-bulk-state-sync;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 단건 등록 flow(`IngredientRegisterModal`)가 정상 동작한다 <!-- omo:id=accept-single-register-intact;stage=4;scope=frontend;review=5,6 -->
- [x] 모든 재료 resolved + blocking step 0건이면 레시피 등록이 가능하다 <!-- omo:id=accept-register-gate;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 (기존 API 재사용) <!-- omo:id=accept-api-envelope;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] bulk helper가 기존 `POST /api/v1/recipes/youtube/ingredient-registration`을 순차 호출한다 <!-- omo:id=accept-sequential-call;stage=4;scope=frontend;review=5,6 -->
- [x] 개별 row 실패가 다른 row 등록을 막지 않는다 <!-- omo:id=accept-partial-failure-isolation;stage=4;scope=frontend;review=5,6 -->
- [x] session 만료(410) 감지 시 남은 row 호출을 중단하고 재추출 안내를 표시한다 <!-- omo:id=accept-session-expired-abort;stage=4;scope=frontend;review=5,6 -->
- [x] 같은 row를 두 번 등록해도 서버에서 idempotent하게 처리된다 <!-- omo:id=accept-idempotency;stage=4;scope=frontend;review=5,6 -->
- [x] `draft_ingredient_id`가 없는 client-only row는 bulk sheet 대상에서 제외된다 <!-- omo:id=accept-client-only-exclusion;stage=4;scope=frontend;review=5,6 -->
- [x] skip 체크한 row는 등록 호출 대상에서 제외된다 <!-- omo:id=accept-skip-exclusion;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] loading 상태가 있다 (bulk 등록 중 sheet disable + 현재 row spinner) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (unresolved/needs_review 0건이면 bulk CTA 미노출) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (행별 등록 실패 메시지 + 재시도) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (401 → 로그인 안내 → return-to-action) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름이 있다 (409 → session 상태 변경 안내) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] bulk 등록 중 일부 성공 후 session이 만료되어도, 이미 성공한 row는 resolved 상태를 유지한다 <!-- omo:id=accept-partial-success-durability;stage=4;scope=frontend;review=5,6 -->
- [x] 등록된 재료의 `ingredient_id`와 `standard_name`이 서버 응답값과 일치한다 <!-- omo:id=accept-response-fidelity;stage=4;scope=frontend;review=5,6 -->
- [x] bulk 등록이 기존 row의 수량/단위/`display_text`/`raw_text`를 변경하지 않는다 <!-- omo:id=accept-preserve-amount-unit;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 5+ unresolved 재료가 있는 extraction session이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=4;scope=shared;review=6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=4;scope=shared;review=6 -->
- [x] `register_youtube_ingredient` RPC가 존재한다 <!-- omo:id=accept-rpc-ready;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier: Claude / Codex
- environment: `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
- scenarios:
  - YouTube URL 추출 → 3건 이상 unresolved → bulk sheet 열기 → 일괄 등록 → resolved 확인 → 레시피 저장
  - bulk 등록 중 1건 validation 실패 → 나머지 성공 → 실패 row 재시도
  - 실제 YouTube API를 통한 라이브 추출 (외부 서비스 의존)

## Automation Split

### Vitest

- [x] bulk helper 순차 호출 로직이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-bulk-helper;stage=4;scope=frontend;review=5,6 -->
- [x] 부분 성공/부분 실패 시나리오가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-partial-failure;stage=4;scope=frontend;review=5,6 -->
- [x] session 만료 중단 로직이 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-session-abort;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] bulk CTA 노출 → sheet 열기 → 일괄 등록 → resolved 전환 흐름이 E2E로 고정되어 있다 <!-- omo:id=accept-playwright-bulk-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 단건 등록 흐름이 회귀하지 않았다 <!-- omo:id=accept-playwright-single-regression;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 실제 YouTube API를 통한 라이브 추출 → bulk 등록 → 레시피 저장 end-to-end (외부 서비스 의존)
