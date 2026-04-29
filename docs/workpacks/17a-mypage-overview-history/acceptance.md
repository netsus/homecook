# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path
- [x] 마이페이지 진입 시 상단에 닉네임, 프로필 이미지, 소셜 제공자가 정상 표시된다 <!-- omo:id=accept-profile-display;stage=4;scope=frontend;review=5,6 -->
- [x] 기본 탭(레시피북)에서 시스템 레시피북 3개(내가 추가한/저장한/좋아요한)가 표시된다 <!-- omo:id=accept-system-books-display;stage=4;scope=frontend;review=5,6 -->
- [x] 각 레시피북의 `recipe_count`가 정확하게 표시된다 <!-- omo:id=accept-recipe-count;stage=2;scope=backend;review=3,6 -->
- [x] 커스텀 레시피북 목록이 시스템 레시피북 아래에 표시된다 <!-- omo:id=accept-custom-books-display;stage=4;scope=frontend;review=5,6 -->
- [x] `[+ 새 레시피북]`으로 커스텀 레시피북을 생성할 수 있다 <!-- omo:id=accept-create-book;stage=4;scope=frontend;review=5,6 -->
- [x] 커스텀 레시피북의 ⋯ 메뉴에서 이름을 변경할 수 있다 <!-- omo:id=accept-rename-book;stage=4;scope=frontend;review=5,6 -->
- [x] 커스텀 레시피북의 ⋯ 메뉴에서 삭제할 수 있다 <!-- omo:id=accept-delete-book;stage=4;scope=frontend;review=5,6 -->
- [x] 장보기 기록 탭에서 목록이 최신순으로 표시된다 <!-- omo:id=accept-shopping-history-display;stage=4;scope=frontend;review=5,6 -->
- [x] 장보기 기록 항목 탭 시 `SHOPPING_DETAIL` read-only 모드로 이동한다 <!-- omo:id=accept-shopping-detail-nav;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] 시스템 레시피북(my_added/saved/liked)의 이름 변경 시도 시 403 반환 <!-- omo:id=accept-system-book-rename-forbidden;stage=2;scope=backend;review=3,6 -->
- [x] 시스템 레시피북 삭제 시도 시 403 반환 <!-- omo:id=accept-system-book-delete-forbidden;stage=2;scope=backend;review=3,6 -->
- [x] 커스텀 레시피북만 rename/delete가 가능하다 <!-- omo:id=accept-custom-only-crud;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_count`가 book_type별 source of truth와 일치한다 (my_added=recipes.created_by, saved=recipe_book_items, liked=recipe_likes, custom=recipe_book_items) <!-- omo:id=accept-recipe-count-source;stage=2;scope=backend;review=3,6 -->
- [x] 장보기 기록은 목록 조회만 가능하고 수정/삭제 액션은 없다 <!-- omo:id=accept-shopping-read-only-list;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [x] loading 상태가 있다 (프로필, 레시피북, 장보기 기록 각각 스켈레톤) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (커스텀 레시피북 없음, 장보기 기록 없음) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (API 실패 시 오류 안내 + 다시 시도) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (비로그인 시 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 후 return-to-action이 MYPAGE로 복귀한다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [x] 존재하지 않는 book_id로 PATCH/DELETE 시 404 반환 <!-- omo:id=accept-book-not-found;stage=2;scope=backend;review=3,6 -->
- [x] 빈 name으로 POST /recipe-books 시 422 반환 <!-- omo:id=accept-empty-name-validation;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [x] 타인 레시피북을 수정/삭제할 수 없다 (403) <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 타인 장보기 기록을 조회할 수 없다 (소유자 필터) <!-- omo:id=accept-shopping-owner-filter;stage=2;scope=backend;review=3,6 -->
- [x] 커스텀 레시피북 삭제 시 관련 recipe_book_items도 정리된다 <!-- omo:id=accept-cascade-delete;stage=2;scope=backend;review=3,6 -->
- [x] recipe_count가 실제 데이터와 일치한다 (파생 필드 정합성) <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (인증 사용자, 시스템 레시피북 ×3, 커스텀 레시피북, 장보기 기록) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 (회원가입 → recipe_books ×3) <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: 사용자 또는 QA 에이전트
- environment: `pnpm dev:local-supabase` 또는 `pnpm dev:demo`
- scenarios:
  - 회원가입 직후 마이페이지 진입 → 시스템 레시피북 3개만 보임, 커스텀 empty 상태 확인
  - 커스텀 레시피북 생성 → 이름 변경 → 삭제 flow
  - 장보기 기록 탭 → 기록 탭 → 상세 이동 → read-only 확인
  - 비로그인 상태에서 마이페이지 탭 → 로그인 게이트 → 로그인 후 MYPAGE 복귀
  - Live OAuth 소셜 로그인 (카카오/네이버/구글) 후 마이페이지 프로필 확인

## Automation Split

### Vitest
- [x] GET /users/me 성공 응답, 401 응답 <!-- omo:id=accept-vitest-users-me;stage=2;scope=backend;review=3,6 -->
- [x] GET /recipe-books 시스템+커스텀 목록 반환, recipe_count 정합성 <!-- omo:id=accept-vitest-recipe-books-list;stage=2;scope=backend;review=3,6 -->
- [x] POST /recipe-books 성공, 빈 name 422 <!-- omo:id=accept-vitest-create-book;stage=2;scope=backend;review=3,6 -->
- [x] PATCH /recipe-books 커스텀 성공, 시스템 403 <!-- omo:id=accept-vitest-rename-book;stage=2;scope=backend;review=3,6 -->
- [x] DELETE /recipe-books 커스텀 성공, 시스템 403, 타인 403, 없는 404 <!-- omo:id=accept-vitest-delete-book;stage=2;scope=backend;review=3,6 -->
- [x] GET /shopping/lists 최신순, cursor pagination <!-- omo:id=accept-vitest-shopping-lists;stage=2;scope=backend;review=3,6 -->
- [x] 소유자 검증 (recipe-books, shopping/lists) <!-- omo:id=accept-vitest-owner-guard;stage=2;scope=backend;review=3,6 -->

### Playwright
- [x] MYPAGE 진입 → 프로필 표시 → 탭 전환 → 레시피북/장보기 기록 확인 <!-- omo:id=accept-playwright-mypage-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 커스텀 레시피북 CRUD flow (생성 → 이름 변경 → 삭제) <!-- omo:id=accept-playwright-book-crud;stage=4;scope=frontend;review=5,6 -->
- [ ] 장보기 기록 탭 → 항목 클릭 → SHOPPING_DETAIL 이동 <!-- omo:id=accept-playwright-shopping-nav;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 → 마이페이지 → 로그인 게이트 <!-- omo:id=accept-playwright-login-gate;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태 (커스텀 레시피북 없음, 장보기 기록 없음) <!-- omo:id=accept-playwright-empty-states;stage=4;scope=frontend;review=5,6 -->

### Manual Only
- [ ] Live OAuth 소셜 로그인 후 프로필 이미지/제공자 표시 정확성
- [ ] 실기기 모바일 브라우저에서 탭 전환 UX 확인
