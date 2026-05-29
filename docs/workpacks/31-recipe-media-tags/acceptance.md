# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## YouTube Media / Tags
- [x] `extract` 응답은 provider thumbnail URL과 서버 생성 tag preview를 반환한다 <!-- omo:id=accept-youtube-extract-preview;stage=2;scope=backend;review=3,6 -->
- [x] `register`는 session thumbnail을 `recipes.thumbnail_url`에 저장한다 <!-- omo:id=accept-youtube-register-thumbnail;stage=2;scope=backend;review=3,6 -->
- [x] `register`는 서버 생성 tags를 `recipes.tags`에 저장한다 <!-- omo:id=accept-youtube-register-tags;stage=2;scope=backend;review=3,6 -->
- [x] YouTube register body로 전달된 `thumbnail_url`/`tags` override는 허용하지 않는다 <!-- omo:id=accept-youtube-no-client-override;stage=2;scope=backend;review=3,6 -->
- [x] YouTube 썸네일은 다운로드/리호스팅/크롭/압축하지 않는다 <!-- omo:id=accept-youtube-no-rehost;stage=2;scope=backend;review=3,6 -->

## Manual Image Upload
- [x] 로그인 사용자는 직접 등록용 이미지 1장을 업로드할 수 있다 <!-- omo:id=accept-manual-upload-happy-path;stage=2;scope=backend;review=3,6 -->
- [x] 업로드 API는 jpeg/png/webp, 최대 5MB 정책을 서버에서 검증한다 <!-- omo:id=accept-upload-validation;stage=2;scope=backend;review=3,6 -->
- [x] 업로드 객체는 `recipe-images/{user_id}/{uuid}.{ext}` 경로에 저장된다 <!-- omo:id=accept-storage-path;stage=2;scope=backend;review=3,6 -->
- [x] `POST /recipes`는 현재 사용자 업로드 참조만 `thumbnail_url`로 허용한다 <!-- omo:id=accept-manual-current-user-image-only;stage=2;scope=backend;review=3,6 -->
- [x] 임의 외부 URL, signed URL, cross-user Storage URL은 거부한다 <!-- omo:id=accept-manual-image-negative;stage=2;scope=backend;review=3,6 -->
- [ ] 사용자가 저장 전에 이미지를 제거하거나 교체하면 미사용 업로드 cleanup 경로가 정의되어 있다 <!-- omo:id=accept-unused-upload-cleanup;stage=2;scope=backend;review=3,6 -->

## Tag Generator
- [x] YouTube/직접 등록은 같은 결정론 tag generator를 사용한다 <!-- omo:id=accept-shared-tag-generator;stage=2;scope=shared;review=3,6 -->
- [x] tag generator는 제목, 재료, step, 조리방법 label을 입력으로 사용한다 <!-- omo:id=accept-tag-inputs-common;stage=2;scope=shared;review=3,6 -->
- [x] YouTube tag generator는 provider `snippet.tags`를 필터링해 참고한다 <!-- omo:id=accept-tag-inputs-youtube;stage=2;scope=backend;review=3,6 -->
- [x] 태그는 정규화되고 중복 제거되며 최대 6개로 제한된다 <!-- omo:id=accept-tags-normalized-capped;stage=2;scope=shared;review=3,6 -->
- [x] 태그를 생성할 수 없으면 `recipes.tags`는 `[]`이다 <!-- omo:id=accept-tags-empty-fallback;stage=2;scope=shared;review=3,6 -->
- [ ] 사용자는 태그를 수동 입력/수정/삭제할 수 없다 <!-- omo:id=accept-tags-readonly;stage=4;scope=frontend;review=5,6 -->

## Happy Path
- [ ] YouTube URL 입력 → extract → 썸네일/태그 preview → 검수 → 등록 → 상세 표시가 동작한다 <!-- omo:id=accept-youtube-happy-path;stage=4;scope=frontend;review=5,6 -->
- [ ] 직접 등록 이미지 선택 → upload → 저장 → 상세 표시가 동작한다 <!-- omo:id=accept-manual-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy
- [x] YouTube session 상태 전이가 공식 문서와 일치한다 (draft → consumed / expired) <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] consumed session 재사용은 409로 막힌다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 중복 호출에도 결과가 꼬이지 않는다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] DB에는 이미지 바이너리를 저장하지 않는다 <!-- omo:id=accept-no-db-binary;stage=2;scope=backend;review=3,6 -->
- [x] `recipes.thumbnail_url`에는 만료 signed URL을 저장하지 않는다 <!-- omo:id=accept-no-signed-url-persist;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 (이미지 없음 placeholder, 태그 없음 영역 숨김) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (업로드 실패, 저장 실패, YouTube provider 실패) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (이미지 업로드/등록 401 → 로그인 게이트) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] conflict 처리 흐름이 있다 (consumed/expired/mismatch session) <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- [x] 타인 이미지/세션/레시피 리소스를 수정할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] 파생 필드와 비정규화 값이 맞다 (`thumbnail_url`, `tags`, session draft/meta) <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
- [x] YouTube thumbnail URL/source text를 operational logs에 과도하게 저장하지 않는다 <!-- omo:id=accept-log-minimization;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions
- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / Storage bucket / policy가 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 신규 system row가 필요 없음을 확인했다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA
- verifier: Codex + 사용자 수동 확인 필요 시 Stage 5/6에서 지정
- environment: `pnpm dev:demo` 또는 Vercel preview/prod + 실제 Supabase Auth session
- scenarios:
  1. YouTube thumbnail/tag preview가 있는 URL → 등록 → 상세 이미지/source note/tags 확인
  2. YouTube thumbnail이 없거나 provider thumbnail이 null인 URL → placeholder 확인
  3. 직접 등록 이미지 업로드 → 저장 → 상세/카드 이미지 확인
  4. 직접 등록 이미지 제거 후 저장 → placeholder 확인
  5. 임의 외부 이미지 URL submit 시 422 확인
  6. 태그 생성 결과 0개인 레시피 → 태그 영역 미표시 확인

## Automation Split

### Vitest
- [x] 이미지 upload validation / storage path helper 테스트 <!-- omo:id=accept-vitest-upload-validation;stage=2;scope=backend;review=3,6 -->
- [x] current-user image reference validator 테스트 <!-- omo:id=accept-vitest-image-owner;stage=2;scope=backend;review=3,6 -->
- [x] shared tag generator unit tests <!-- omo:id=accept-vitest-tag-generator;stage=2;scope=shared;review=3,6 -->
- [x] YouTube register thumbnail/tags persistence tests <!-- omo:id=accept-vitest-youtube-register;stage=2;scope=backend;review=3,6 -->
- [x] manual create thumbnail/tags persistence tests <!-- omo:id=accept-vitest-manual-create;stage=2;scope=backend;review=3,6 -->
- [x] 기존 YouTube corpus/readiness/dictionary regression 하네스 통과 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright
- [ ] YouTube thumbnail/tag preview fixture-backed flow <!-- omo:id=accept-playwright-youtube-preview;stage=4;scope=frontend;review=5,6 -->
- [ ] Manual image upload fixture-backed flow <!-- omo:id=accept-playwright-manual-upload;stage=4;scope=frontend;review=5,6 -->
- [ ] Recipe detail placeholder/source-note/tag display flow <!-- omo:id=accept-playwright-detail-display;stage=4;scope=frontend;review=5,6 -->
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] 실제 YouTube URL + 실제 provider + 실제 Supabase Auth/DB/Storage를 사용한 end-to-end smoke
- [ ] 운영 Storage bucket/policy 적용 확인
