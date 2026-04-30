# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] MYPAGE 레시피북 탭에서 레시피북 탭 → RECIPEBOOK_DETAIL 진입, 레시피 목록 표시 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] 레시피 카드 탭 → RECIPE_DETAIL 이동 <!-- omo:id=accept-recipe-card-navigate;stage=4;scope=frontend;review=5,6 -->
- [x] saved/custom 책에서 레시피 제거 → 목록에서 사라짐 <!-- omo:id=accept-remove-saved-custom;stage=4;scope=frontend;review=5,6 -->
- [x] liked 책에서 레시피 제거 → 좋아요 해제, 목록에서 사라짐 <!-- omo:id=accept-remove-liked;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] my_added 책에서 제거 불가 (403), 제거 버튼 미표시 <!-- omo:id=accept-my-added-forbidden;stage=2;scope=shared;review=3,6 -->
- [x] liked 제거 시 recipe_likes 삭제 + like_count -= 1 <!-- omo:id=accept-liked-count-sync;stage=2;scope=backend;review=3,6 -->
- [x] saved/custom 제거 시 recipe_book_items 삭제 + save_count -= 1 <!-- omo:id=accept-saved-count-sync;stage=2;scope=backend;review=3,6 -->
- [x] cursor pagination 동작 (next_cursor, has_next) <!-- omo:id=accept-cursor-pagination;stage=2;scope=backend;review=3,6 -->
- [x] 중복 삭제 호출 시 404 (멱등성) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (레시피 0건) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (비로그인 → 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 다른 유저의 레시피북 접근 시 403 처리 <!-- omo:id=accept-forbidden-other-user;stage=2;scope=backend;review=3,6 -->
- [x] 존재하지 않는 book_id → 404 처리 <!-- omo:id=accept-not-found-book;stage=2;scope=backend;review=3,6 -->
- [x] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] 타인 리소스를 수정할 수 없다 (owner-guard) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 비정규화 카운트(like_count, save_count) 제거 후 정확히 갱신된다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (사용자 + 레시피북 4종 + 레시피 할당) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 (17a에서 검증됨) <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: Codex (Stage 5/6)
- environment: `pnpm dev:local-supabase`
- scenarios:
  - saved 책 진입 → 레시피 2개 표시 → 1개 제거 → 1개 남음
  - liked 책 진입 → 좋아요 해제 → 목록에서 사라짐 + RECIPE_DETAIL에서 좋아요 상태 해제 확인
  - my_added 책 진입 → 제거 버튼 없음 확인
  - custom 책 진입 → 레시피 전부 제거 → empty 상태 표시
  - 비로그인 → 로그인 게이트 → 로그인 후 RECIPEBOOK_DETAIL 복귀

## Automation Split

### Vitest
- [x] GET /recipe-books/{book_id}/recipes 응답 형식, cursor pagination, owner-guard 검증 <!-- omo:id=accept-vitest-detail-list;stage=2;scope=backend;review=3,6 -->
- [x] DELETE book_type별 분기 (liked/saved/custom/my_added) + count 갱신 검증 <!-- omo:id=accept-vitest-remove-policy;stage=2;scope=backend;review=3,6 -->
- [x] 멱등성, 403/404 에러 시나리오 <!-- omo:id=accept-vitest-error-scenarios;stage=2;scope=backend;review=3,6 -->

### Playwright
- [x] RECIPEBOOK_DETAIL 진입, 레시피 목록 표시, 제거, empty 전환 브라우저 테스트 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] 실 OAuth 로그인 후 RECIPEBOOK_DETAIL 진입 및 제거 동작 확인 (HTTPS + 실 기기)
