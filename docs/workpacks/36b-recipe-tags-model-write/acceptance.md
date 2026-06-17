# Acceptance: 36b Recipe Tags Model Write

> acceptance는 living closeout 문서다. 체크는 migration, 테스트, PR evidence가 생긴 뒤에만 한다.
> 36b는 BE-only slice이며 Stage 4~6 UI acceptance는 36c/36e에서 닫는다.

## Happy Path

- [x] 로그인 사용자가 `POST /api/v1/recipes`로 직접 등록할 때 `tags` body가 없으면 서버 추천 태그가 저장된다 <!-- omo:id=accept-manual-server-suggested-tags;stage=2;scope=backend;review=3,6 -->
- [x] 로그인 사용자가 `POST /api/v1/recipes`로 직접 등록할 때 `tags` body가 있으면 사용자 검수 태그로 정규화/검증되어 저장된다 <!-- omo:id=accept-manual-reviewed-tags;stage=2;scope=backend;review=3,6 -->
- [x] YouTube register에서 `tags` body가 없으면 session 추천 태그가 저장된다 <!-- omo:id=accept-youtube-session-tags;stage=2;scope=backend;review=3,6 -->
- [x] YouTube register에서 `tags` body가 있으면 사용자 검수 태그로 정규화/검증되어 저장된다 <!-- omo:id=accept-youtube-reviewed-tags;stage=2;scope=backend;review=3,6 -->
- [x] `POST /api/v1/recipes/tag-suggestions`는 recipe row 없이 deterministic 추천 결과를 반환한다 <!-- omo:id=accept-tag-suggestions-read-only;stage=2;scope=backend;review=3,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [x] canonical tag truth는 `tags` / `recipe_tags`이고 `recipes.tags`는 projection으로만 갱신된다 <!-- omo:id=accept-canonical-tag-truth;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_tags`, `recipes.tags`, `tags.usage_count`가 같은 transaction/RPC 또는 동등 writer에서 갱신된다 <!-- omo:id=accept-atomic-projection-writer;stage=2;scope=backend;review=3,6 -->
- [x] P0 semantic/source seed 36개가 idempotent하게 생성된다 <!-- omo:id=accept-p0-seed-count;stage=2;scope=backend;review=3,6 -->
- [x] 시스템 semantic/source tag만 `public` + `approved` + `theme_eligible=true`로 저장된다 <!-- omo:id=accept-system-tag-policy;stage=2;scope=backend;review=3,6 -->
- [x] 사용자 자유 tag는 승인 전 `public_pending` 또는 `private`, `pending`, `theme_eligible=false`로 저장된다 <!-- omo:id=accept-user-tag-policy;stage=2;scope=backend;review=3,6 -->
- [x] `normalized_key`는 한글 label을 그대로 보존하고 자동 romanization을 하지 않는다 <!-- omo:id=accept-korean-normalized-key;stage=2;scope=shared;review=3,6 -->
- [x] 서버 자동 추천 기능은 유지되고 사용자가 태그를 수정하지 않으면 추천값을 저장한다 <!-- omo:id=accept-server-auto-tag-preserved;stage=2;scope=backend;review=3,6 -->
- [x] HOME theme, 정확 tag 검색, 제목+태그 검색은 36c 범위로 남긴다 <!-- omo:id=accept-search-theme-out-of-scope;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [x] 비로그인 요청은 401 envelope로 실패한다 <!-- omo:id=accept-unauthorized;stage=2;scope=backend;review=3,6 -->
- [x] 타인 YouTube extraction session으로 register할 수 없다 <!-- omo:id=accept-youtube-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] 태그 개수/길이/빈 문자열/중복/금지어/스팸 입력은 422 `VALIDATION_ERROR`와 `fields: [{ field: "tags" }]`로 실패한다 <!-- omo:id=accept-tag-validation-error;stage=2;scope=backend;review=3,6 -->
- [x] 기존 YouTube register의 expired/consumed/mismatch/candidate promotion 오류 계약이 유지된다 <!-- omo:id=accept-youtube-existing-errors;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] `tags.normalized_key` UNIQUE와 `recipe_tags(recipe_id, tag_id)` PK로 중복 tag row/관계를 막는다 <!-- omo:id=accept-tag-dedupe;stage=2;scope=backend;review=3,6 -->
- [x] `recipes.tags` projection은 `recipe_tags.sort_order` 기준 label 배열과 일치한다 <!-- omo:id=accept-recipes-tags-projection;stage=2;scope=backend;review=3,6 -->
- [x] `tags.usage_count`는 public/approved recipe_tags 관계 기준으로 계산되거나 delta 갱신된다 <!-- omo:id=accept-usage-count;stage=2;scope=backend;review=3,6 -->
- [x] tag write 실패 시 recipe 생성/session consume이 부분 완료로 남지 않는다 <!-- omo:id=accept-atomic-failure;stage=2;scope=backend;review=3,6 -->
- [x] `recipe_sources` provenance와 기존 YouTube register 원자 INSERT 순서가 깨지지 않는다 <!-- omo:id=accept-youtube-provenance-preserved;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] `tags` / `recipe_tags` migration이 table, check constraints, unique/index, seed를 포함한다 <!-- omo:id=accept-migration-schema;stage=2;scope=backend;review=3,6 -->
- [x] Vitest fixture에서 manual/youtube recipe + tag seed baseline을 구성할 수 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke는 가능한 환경에서 `supabase db push` 후 table/index/seed 확인으로 분리된다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 운영 기존 레시피 backfill은 36d 범위로 분리되어 36b에서 실행하지 않는다 <!-- omo:id=accept-backfill-deferred;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest

- [x] tag normalization helper 테스트가 trim, `#` 제거, 중복, 한글 key 보존, invalid input을 고정한다 <!-- omo:id=accept-normalization-tests;stage=2;scope=shared;review=3,6 -->
- [x] projection writer 테스트가 `recipe_tags` / `recipes.tags` / `usage_count` 일관성을 고정한다 <!-- omo:id=accept-writer-tests;stage=2;scope=backend;review=3,6 -->
- [x] manual recipe route 테스트가 추천 fallback과 reviewed tags 저장을 고정한다 <!-- omo:id=accept-manual-route-tests;stage=2;scope=backend;review=3,6 -->
- [x] YouTube register route/RPC 테스트가 session 추천 fallback과 reviewed tags 저장을 고정한다 <!-- omo:id=accept-youtube-route-tests;stage=2;scope=backend;review=3,6 -->
- [x] tag suggestion endpoint 테스트가 read-only deterministic 응답을 고정한다 <!-- omo:id=accept-suggestion-route-tests;stage=2;scope=backend;review=3,6 -->

### Manual Only

- [ ] 운영 DB에 migration 적용
- [ ] 운영 기존 레시피 usage_count reconcile/backfill 실행과 spot check (36d)
