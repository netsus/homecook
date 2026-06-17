# Acceptance: 36c Recipe Tags Search Themes

> acceptance는 living closeout 문서다. 체크는 테스트, migration 검증, PR evidence가 생긴 뒤에만 한다.
> 36c는 BE-only slice이며 HOME UI 적용은 36e에서 닫는다.

## Happy Path

- [ ] `GET /api/v1/recipes?tag=한식`이 `tags.normalized_key='한식'` 정확 필터로 레시피 목록을 반환한다 <!-- omo:id=accept-exact-tag-filter;stage=2;scope=backend;review=3,6 -->
- [ ] `GET /api/v1/recipes?q=디저트`가 제목과 public/approved tag label을 함께 검색한다 <!-- omo:id=accept-title-tag-search;stage=2;scope=backend;review=3,6 -->
- [ ] `GET /api/v1/tags`가 공개 autocomplete용 tag 목록을 `{ success, data, error }` envelope로 반환한다 <!-- omo:id=accept-tags-route-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] `GET /api/v1/recipes/themes`가 `popular`와 tag-backed theme를 기존 envelope로 반환할 수 있다 <!-- omo:id=accept-theme-route-envelope;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] recipe list 검색은 `recipe_tags` join으로 recipe row를 중복시키지 않는다 <!-- omo:id=accept-no-join-duplicates;stage=2;scope=backend;review=3,6 -->
- [ ] 검색 결과는 dedupe 후 기존 sort/cursor 규칙을 유지한다 <!-- omo:id=accept-stable-cursor;stage=2;scope=backend;review=3,6 -->
- [ ] HOME theme seed는 `is_system=true`, `theme_eligible=true`, `kind in ('semantic','source')`로 제한된다 <!-- omo:id=accept-theme-system-only;stage=2;scope=backend;review=3,6 -->
- [ ] HOME theme recipe 관계는 `recipe_tags.visibility='public'`, `recipe_tags.review_status='approved'`만 사용한다 <!-- omo:id=accept-theme-public-approved;stage=2;scope=backend;review=3,6 -->
- [ ] P0 exact tag key는 한글 `normalized_key`를 사용하며 자동 romanization을 추가하지 않는다 <!-- omo:id=accept-korean-tag-key;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [ ] invalid `kind` query는 DB를 호출하지 않고 빈 tag list를 반환한다 <!-- omo:id=accept-invalid-kind-empty;stage=2;scope=backend;review=3,6 -->
- [ ] private/pending user tag는 `GET /tags`, title+tag search, HOME theme seed에 노출되지 않는다 <!-- omo:id=accept-private-pending-hidden;stage=2;scope=backend;review=3,6 -->
- [ ] tag/theme RPC 오류는 API envelope를 깨지 않고 안전한 empty/fallback 응답으로 처리한다 <!-- omo:id=accept-rpc-fallback;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [ ] `tags.slug`는 nullable 수동 seed이며 자동 romanization으로 생성하지 않는다 <!-- omo:id=accept-manual-slug-only;stage=2;scope=backend;review=3,6 -->
- [ ] `tags.kind` check가 공식 계약의 `semantic / ingredient / method / source / user`와 일치한다 <!-- omo:id=accept-kind-check;stage=2;scope=backend;review=3,6 -->
- [ ] public read RLS policy는 system tag 또는 `usage_count > 0` tag만 허용한다 <!-- omo:id=accept-tags-public-rls;stage=2;scope=backend;review=3,6 -->
- [ ] `recipe_tags` public read RLS policy는 public/approved 관계만 허용한다 <!-- omo:id=accept-recipe-tags-public-rls;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] 36b의 `tags` / `recipe_tags` canonical write model이 merged 상태다 <!-- omo:id=accept-36b-merged;stage=2;scope=backend;review=3,6 -->
- [ ] fixture에서 duplicate tag lookup row, title-only row, tag-only row를 구성해 검색 dedupe를 검증한다 <!-- omo:id=accept-search-fixture;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke는 local Supabase migration reset/push와 RPC signature 확인으로 분리한다 <!-- omo:id=accept-real-db-smoke-plan;stage=2;scope=shared;review=3,6 -->
- [ ] 기존 레시피 backfill과 usage_count reconcile은 36d 범위로 남긴다 <!-- omo:id=accept-backfill-deferred;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest

- [ ] recipe tag search route 테스트가 exact tag filter, title+tag label search, dedupe를 고정한다 <!-- omo:id=accept-search-route-tests;stage=2;scope=backend;review=3,6 -->
- [ ] tags route 테스트가 public autocomplete RPC와 invalid kind empty behavior를 고정한다 <!-- omo:id=accept-tags-route-tests;stage=2;scope=backend;review=3,6 -->
- [ ] recipe theme helper 테스트가 tag-backed theme metadata를 고정한다 <!-- omo:id=accept-theme-helper-tests;stage=2;scope=shared;review=3,6 -->
- [ ] migration test가 36c public search/theme RPC와 HOME policy 조건을 고정한다 <!-- omo:id=accept-migration-tests;stage=2;scope=backend;review=3,6 -->

### Manual Only

- [ ] 운영 DB migration 적용
- [ ] 36e 구현 전 HOME tag chip/theme 밀도 모바일 확인
