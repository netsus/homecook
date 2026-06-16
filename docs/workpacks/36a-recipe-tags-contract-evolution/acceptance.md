# Acceptance: 36a Recipe Tags Contract Evolution

> acceptance는 living closeout 문서다. 체크는 문서 검증, source-of-truth 동기화, reviewer 확인처럼 evidence가 생긴 뒤에만 한다.

## Contract Lock

- [x] 공식 5대 문서가 새 버전으로 갱신되고 `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`가 같은 버전을 가리킨다 <!-- omo:id=accept-official-docs-versioned;stage=1;scope=docs;review=1 -->
- [x] 36 계획이 36a docs, 36b model/write/projection, 36c search/themes, 36d semantic rules/backfill, 36e frontend로 분리되어 있다 <!-- omo:id=accept-slice-split;stage=1;scope=docs;review=1 -->
- [x] 36a에는 구현, migration, route handler, component 변경이 포함되지 않는다 <!-- omo:id=accept-docs-only;stage=1;scope=docs;review=1 -->

## Product Policy

- [x] 서버 자동 태그 추천 기능을 유지한다고 명시되어 있다 <!-- omo:id=accept-server-auto-tags-preserved;stage=1;scope=docs;review=1 -->
- [x] 사용자가 태그를 수정하지 않으면 서버 추천 태그를 저장한다는 기준이 있다 <!-- omo:id=accept-default-suggested-tags;stage=1;scope=docs;review=1 -->
- [x] 사용자 자유 태그와 시스템 의미 태그의 경계가 문서화되어 있다 <!-- omo:id=accept-user-system-boundary;stage=1;scope=docs;review=1 -->
- [x] 사용자 자유 태그는 승인 전 HOME 테마 seed로 자동 승격되지 않는다 <!-- omo:id=accept-user-tags-not-theme-seed;stage=1;scope=docs;review=1 -->

## Semantic Tags

- [x] 사용자 요청 필수 태그가 P0 목록에 모두 포함되어 있다 <!-- omo:id=accept-required-tags-included;stage=1;scope=docs;review=1 -->
- [x] P0 semantic/source tag seed 36개가 문서에 고정되어 있다 <!-- omo:id=accept-p0-tag-set;stage=1;scope=docs;review=1 -->
- [x] `유명셰프요리`, `SNS화제`, `검증된레시피`는 검증 메타데이터/운영 승인 전 P1 후보로 정의되어 있다 <!-- omo:id=accept-p1-gated-tags;stage=1;scope=docs;review=1 -->
- [x] 건강/다이어트/유명/검증류 태그는 근거가 약하면 붙이지 않는다는 기준이 있다 <!-- omo:id=accept-conservative-sensitive-tags;stage=1;scope=docs;review=1 -->

## API / DB Contract

- [x] `tags` / `recipe_tags` canonical schema가 정의되어 있다 <!-- omo:id=accept-canonical-tag-schema;stage=1;scope=docs;review=1 -->
- [x] `recipes.tags`는 projection으로 유지된다는 기준이 있다 <!-- omo:id=accept-recipes-tags-projection;stage=1;scope=docs;review=1 -->
- [x] projection writer가 `recipe_tags`, `recipes.tags`, `tags.usage_count`를 같은 transaction/RPC에서 갱신해야 한다는 기준이 있다 <!-- omo:id=accept-projection-writer;stage=1;scope=docs;review=1 -->
- [x] `normalized_key`는 P0에서 한글 key를 그대로 쓰며 자동 romanization을 하지 않는다는 기준이 있다 <!-- omo:id=accept-korean-normalized-key;stage=1;scope=docs;review=1 -->
- [x] `GET /recipes?q=` title + approved tag search 계약이 있다 <!-- omo:id=accept-q-tag-search;stage=1;scope=docs;review=1 -->
- [x] `GET /recipes?tag=<normalized_key>` 정확 필터 계약이 있다 <!-- omo:id=accept-tag-filter;stage=1;scope=docs;review=1 -->
- [x] 검색 구현이 dedupe + stable sort로 cursor pagination을 보호해야 한다는 기준이 있다 <!-- omo:id=accept-cursor-safe-search;stage=1;scope=docs;review=1 -->
- [x] `GET /tags`와 `POST /recipes/tag-suggestions` endpoint 계약이 있다 <!-- omo:id=accept-new-tag-endpoints;stage=1;scope=docs;review=1 -->
- [x] YouTube/manual register에서 optional reviewed `tags` body를 허용하되 없으면 서버 추천을 쓰는 기준이 있다 <!-- omo:id=accept-reviewed-tags-body;stage=1;scope=docs;review=1 -->

## UI / Flow Contract

- [x] MANUAL_RECIPE_CREATE에 서버 추천 tag chip과 사용자 추가/삭제 UI가 정의되어 있다 <!-- omo:id=accept-manual-tag-ui;stage=1;scope=docs;review=1 -->
- [x] YT_IMPORT에 서버 추천 tag chip 검수 UI가 정의되어 있다 <!-- omo:id=accept-youtube-tag-ui;stage=1;scope=docs;review=1 -->
- [x] HOME 검색 placeholder와 상호작용이 제목+태그 검색으로 갱신되어 있다 <!-- omo:id=accept-home-tag-search-ui;stage=1;scope=docs;review=1 -->
- [x] HOME theme seed가 public/approved/theme_eligible system semantic/source tag로 제한되어 있다 <!-- omo:id=accept-home-theme-policy;stage=1;scope=docs;review=1 -->

## Verification

- [x] `pnpm validate:source-of-truth-sync` 통과 <!-- omo:id=accept-validate-source-of-truth;stage=1;scope=docs;review=1 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=accept-validate-workflow-v2;stage=1;scope=docs;review=1 -->
- [x] `pnpm validate:workpack -- --slice 36a-recipe-tags-contract-evolution` 통과 <!-- omo:id=accept-validate-workpack;stage=1;scope=docs;review=1 -->
- [x] `git diff --check` 통과 <!-- omo:id=accept-diff-check;stage=1;scope=docs;review=1 -->

### Manual Only

- [ ] P0 semantic/source tag seed label 톤을 운영자가 최종 승인한다.
- [ ] 36e 구현 전 HOME theme 노출 개수와 태그 chip 밀도를 모바일 화면에서 확인한다.
