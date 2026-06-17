# Acceptance: 36e Recipe Tags Frontend

> acceptance는 living closeout 문서다. 체크는 테스트, screenshot evidence, exploratory QA, PR evidence가 생긴 뒤에만 한다.
> 36e는 FE-only slice이며 DB migration/backfill/reconcile은 범위 밖이다.

## Happy Path

- [x] HOME 검색어 입력이 `GET /api/v1/recipes?q=`를 호출하고 제목+승인 tag label 검색 결과를 표시한다 <!-- omo:id=accept-home-title-tag-search;stage=4;scope=frontend;review=5,6 -->
- [x] HOME tag chip 선택이 `GET /api/v1/recipes?tag=한식`처럼 한글 `normalized_key` exact filter를 호출한다 <!-- omo:id=accept-home-exact-tag-filter;stage=4;scope=frontend;review=5,6 -->
- [x] HOME tag-backed theme 선택이 해당 theme의 `tag_key`로 recipe list를 필터링한다 <!-- omo:id=accept-home-theme-tag-key;stage=4;scope=frontend;review=5,6 -->
- [x] 직접 등록 화면이 서버 추천 tag를 chip으로 보여주고 사용자가 삭제/추가할 수 있다 <!-- omo:id=accept-manual-tag-review;stage=4;scope=frontend;review=5,6 -->
- [x] YouTube 검수 화면이 session 추천 tag를 chip으로 보여주고 사용자가 삭제/추가할 수 있다 <!-- omo:id=accept-youtube-tag-review;stage=4;scope=frontend;review=5,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] 사용자가 직접 등록 tag를 수정하지 않으면 `POST /recipes`에서 `tags` body를 생략해 서버 추천 저장을 유지한다 <!-- omo:id=accept-manual-omit-unmodified-tags;stage=4;scope=frontend;review=5,6 -->
- [x] 사용자가 직접 등록 tag를 수정하면 검수된 label 배열만 `tags` body로 전송한다 <!-- omo:id=accept-manual-send-reviewed-tags;stage=4;scope=frontend;review=5,6 -->
- [x] 사용자가 YouTube tag를 수정하지 않으면 `POST /recipes/youtube/register`에서 `tags` body를 생략해 session 추천 저장을 유지한다 <!-- omo:id=accept-youtube-omit-unmodified-tags;stage=4;scope=frontend;review=5,6 -->
- [x] 사용자가 YouTube tag를 수정하면 검수된 label 배열만 `tags` body로 전송한다 <!-- omo:id=accept-youtube-send-reviewed-tags;stage=4;scope=frontend;review=5,6 -->
- [x] HOME theme UI는 사용자 자유/private/pending tag를 클라이언트에서 theme seed로 승격하지 않는다 <!-- omo:id=accept-theme-policy-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 자동 romanization slug를 만들거나 `tag=hansik` filter를 만들지 않는다 <!-- omo:id=accept-no-romanization-ui;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] HOME search/theme/tag list loading 상태가 있다 <!-- omo:id=accept-home-loading;stage=4;scope=frontend;review=5,6 -->
- [x] HOME search/tag filter empty 상태가 있다 <!-- omo:id=accept-home-empty;stage=4;scope=frontend;review=5,6 -->
- [x] HOME search/theme/tag API error 상태가 있다 <!-- omo:id=accept-home-error;stage=4;scope=frontend;review=5,6 -->
- [x] MANUAL_RECIPE_CREATE tag suggestion loading/error가 저장 flow를 막지 않는다 <!-- omo:id=accept-manual-suggestion-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] YT_IMPORT tag suggestion/session tag가 비어도 등록 flow가 유지된다 <!-- omo:id=accept-youtube-empty-tags;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 MANUAL_RECIPE_CREATE/YT_IMPORT unauthorized와 return-to-action 흐름이 유지된다 <!-- omo:id=accept-auth-return-to-action-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] tag validation API 오류는 tag 영역 inline error로 표시된다 <!-- omo:id=accept-tag-validation-error;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 빈 tag, 중복 tag, 앞 `#`, 길이 초과 tag가 UI validation으로 정리되거나 막힌다 <!-- omo:id=accept-tag-input-validation;stage=4;scope=frontend;review=5,6 -->
- [x] suggestion 실패 시 클라이언트가 빈 `tags: []`를 보내 서버 자동 추천을 덮어쓰지 않는다 <!-- omo:id=accept-no-empty-tag-overwrite;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 image upload, quantity review, unresolved ingredient registration body가 tag body 추가 후에도 유지된다 <!-- omo:id=accept-existing-register-body-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] `recipes.tags` projection 표시 계약을 카드/상세에서 그대로 소비한다 <!-- omo:id=accept-tags-projection-display;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] 36b `tags` / `recipe_tags` write path가 merged 상태다 <!-- omo:id=accept-36b-merged;stage=4;scope=shared;review=6 -->
- [x] 36c search/theme/tag list endpoint가 merged 상태다 <!-- omo:id=accept-36c-merged;stage=4;scope=shared;review=6 -->
- [x] 36d semantic rule/backfill dry-run/reconcile helper가 merged 상태다 <!-- omo:id=accept-36d-merged;stage=4;scope=shared;review=6 -->
- [x] fixture/mock에서 HOME tag search/theme, manual suggestion, YouTube session tag baseline을 구성한다 <!-- omo:id=accept-fixture-baseline;stage=4;scope=shared;review=5,6 -->
- [x] real DB smoke는 36e가 아니라 36b~36d migration 적용 확인으로 분리한다 <!-- omo:id=accept-real-db-split;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier: Stage 4 implementer + Stage 5/6 reviewer
- environment: local dev server with mocked or seeded tag API responses
- scenarios:
  - HOME 390px/320px에서 검색, tag chip 선택/해제, tag-backed theme 진입
  - MANUAL_RECIPE_CREATE에서 추천 tag 표시, 삭제, `#새태그` 추가, 중복 validation, 저장
  - YT_IMPORT 검수에서 session tag 표시, 삭제/추가, 등록

## Automation Split

### Vitest

- [x] HOME tag search/filter state와 API helper를 단위/컴포넌트 테스트로 고정한다 <!-- omo:id=accept-home-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] manual tag suggestion/editor/submit policy를 컴포넌트 테스트로 고정한다 <!-- omo:id=accept-manual-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] YouTube tag editor/register body policy를 컴포넌트 또는 route helper 테스트로 고정한다 <!-- omo:id=accept-youtube-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] tag input normalization/validation을 단위 테스트로 고정한다 <!-- omo:id=accept-tag-validation-vitest;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] HOME 검색/tag filter/theme chip 실제 사용자 흐름을 브라우저 테스트로 고정한다 <!-- omo:id=accept-home-playwright;stage=4;scope=frontend;review=5,6 -->
- [x] MANUAL_RECIPE_CREATE tag suggestion/review/submit 흐름을 브라우저 테스트 또는 targeted component smoke로 고정한다 <!-- omo:id=accept-manual-playwright;stage=4;scope=frontend;review=5,6 -->
- [x] YT_IMPORT tag review/register 흐름은 외부 YouTube 의존 없이 mock/session fixture 경로로 고정한다 <!-- omo:id=accept-youtube-playwright;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 운영 DB에 36b~36d migration 적용
- [ ] 운영 기존 레시피 backfill dry-run report 검토
- [ ] 운영 기존 레시피 backfill 실제 적용 여부 승인
- [ ] 운영 usage count reconcile 실행 여부 승인 및 spot check
