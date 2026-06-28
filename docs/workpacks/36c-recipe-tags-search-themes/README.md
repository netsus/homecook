# Slice: 36c-recipe-tags-search-themes

## Goal

36a에서 잠근 레시피 태그 v2 계약 중 검색과 HOME 테마 조회를 백엔드에서 닫는다. 사용자는 HOME에서 제목뿐 아니라 승인된 공개 태그로 레시피를 찾을 수 있고, 태그 chip/테마 진입은 `normalized_key` 정확 필터로 동작한다. HOME 테마는 사용자 자유 태그가 아니라 승인된 시스템 semantic/source 태그에서만 만들어져 품질 낮은 태그가 홈 노출 seed가 되지 않게 한다.

> Stage 1 note: 36a 계약은 main에 merge되어 있었지만 36c 전용 workpack 디렉터리는 누락되어 있었다. 사용자 요청에 따라 이 브랜치에서 36a 공식 계약을 기준으로 36c workpack/acceptance/automation metadata를 보강하고 Stage 2 구현을 함께 진행한다.

## Branches

- 백엔드: `feature/be-36c-recipe-tags-search-themes`
- 프론트엔드: 없음 (HOME UI 연결은 `feature/fe-36e-recipe-tags-frontend`에서 진행)

## In Scope

- 화면: 없음. BE-only slice이며 HOME 검색 UI/chip UX는 36e에서 진행한다.
- API:
  - `GET /api/v1/recipes?tag=<normalized_key>` 정확 태그 필터
  - `GET /api/v1/recipes?q=` 제목 + public/approved tag label 검색
  - `GET /api/v1/tags` 공개 태그 목록/autocomplete
  - `GET /api/v1/recipes/themes` 승인된 system semantic/source tag 기반 dynamic theme 추가
- 상태 전이:
  - read-only 조회 slice다. recipe/tag 상태를 변경하지 않는다.
  - HOME theme seed는 `is_system=true`, `theme_eligible=true`, `kind in ('semantic','source')`, `recipe_tags.visibility='public'`, `recipe_tags.review_status='approved'`인 관계만 사용한다.
- DB 영향:
  - `tags.slug` nullable column 추가 (수동 seed slug만 사용, 자동 romanization 아님)
  - `tags.kind` check를 공식 계약의 `semantic / ingredient / method / source / user`로 확장
  - 공개 검색/테마 조회용 read RPC 3개 추가
  - `tags` / `recipe_tags` public read RLS policy 추가
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/20260617110000_36c_recipe_tags_search_themes.sql`

## Out of Scope

- 서버 자동 태그 추천 rule 확대, P0 rule fixture, 기존 레시피 backfill dry-run/report, usage count reconcile (36d)
- MANUAL_RECIPE_CREATE / YT_IMPORT 태그 추천·검수 UI (36e)
- HOME 태그 검색 input/chip/theme carousel UI 변경 (36e)
- 사용자 자유 태그 moderation/admin 승인 UI
- `유명셰프요리`, `SNS화제`, `검증된레시피` 같은 P1 후보 자동 부여
- 자동 romanization slug 생성. 36c slug는 P0 seed에 수동 지정된 값만 저장한다.

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `36a-recipe-tags-contract-evolution` | merged | [x] |
| `36b-recipe-tags-model-write` | merged | [x] |

## Backend First Contract

### `GET /api/v1/recipes`

- Query:
  - `q?: string`: 제목 또는 public/approved tag label 검색어
  - `tag?: string`: `tags.normalized_key` 정확 필터. P0에서는 한글 key를 그대로 사용한다.
  - 기존 `ingredient_ids`, `sort`, `cursor`, `limit` 계약 유지
- Response: 기존 `{ success, data: { items, next_cursor, has_next }, error }`
- 권한: 비로그인 가능. 로그인 사용자는 기존처럼 `user_status`가 포함된다.
- Cursor 안정성:
  - `recipe_tags`를 recipes list query에 직접 join하지 않는다.
  - 공개 승인 태그에 매칭되는 recipe id를 먼저 dedupe한 뒤 기존 recipes sort/cursor query에 적용한다.
  - `q` 검색은 title query와 tag recipe query를 분리하고 같은 sort 규칙으로 merge/dedupe한다.

### `GET /api/v1/tags`

- Query:
  - `q?: string`
  - `kind?: semantic | ingredient | method | source | user`
  - `theme_eligible?: boolean`
  - `limit?: number` (기본 30, 최대 100)
- Response: `{ success, data: { items: [{ normalized_key, label, slug, kind, is_system, theme_eligible, usage_count }] }, error }`
- private/pending user tag는 반환하지 않는다. system tag 또는 public/approved 관계가 있어 `usage_count > 0`인 tag만 autocomplete 대상이다.

### `GET /api/v1/recipes/themes`

- Response: 기존 `{ success, data: { themes }, error }` 유지.
- `popular` 기본 theme는 manual UI/UX review 89 follow-up에서 제거됐다. 현재 기본 큐레이션은 최근 3일 플래너 등록 수 기반 `recent-planner`와 명확 조건을 가진 theme만 반환한다.
- 추가 theme는 `list_home_theme_recipes` RPC 결과에서만 만든다.
- tag theme에는 `tag_key`와 `tag_label`을 additive로 포함할 수 있다.
- tag theme seed는 approved system semantic/source tag로 제한한다.

## Frontend Delivery Mode

- Design Status: N/A. 36c는 BE-only slice다.
- 36e에서 HOME의 `loading / empty / error / read-only / unauthorized` 상태와 태그 검색/filter/theme chip UX를 닫는다.

## Design Authority

- UI risk: N/A (BE-only)
- Anchor screen dependency: `HOME`은 36e에서 UI를 확장한다.
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 36c는 HOME이 소비할 API 계약만 제공한다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/36a-recipe-tags-contract-evolution/README.md`
- `docs/workpacks/36b-recipe-tags-model-write/README.md`
- `docs/요구사항기준선-v1.7.11.md` §1-1, §2-15
- `docs/db설계-v1.3.16.md` §4-1a, §4-1b, §15 indexes
- `docs/api문서-v1.2.20.md` §1-1, §1-2, §1-2b
- `docs/화면정의서-v1.5.18.md` HOME search/theme notes

## QA / Test Data Plan

- Fixture baseline:
  - recipe rows with `recipes.tags` projection
  - duplicate `recipe_tags` matches for one recipe id to prove dedupe
  - title-only match and tag-label-only match for `GET /recipes?q=`
  - system semantic/source tag with public/approved relation for HOME theme
  - pending/private user tag with `theme_eligible=false` for exclusion
- Real DB smoke:
  - local Supabase migration reset/push can verify `tags.slug`, public read policies, and 36c RPC signatures.
  - SQL smoke should call `to_regprocedure` for `find_recipe_ids_by_public_tags`, `list_public_recipe_tags`, `list_home_theme_recipes`.
- Seed/reset:
  - P0 seed slug update is idempotent through `normalized_key` UPSERT.
  - Existing recipe backfill is not executed in 36c.
- Blocker:
  - tag search implemented through direct recipes join that duplicates rows
  - HOME theme seed includes user/pending/private tags
  - `tag=hansik` 자동 romanization support가 추가됨
  - `GET /tags` returns private/pending user tags

## Key Rules

1. `normalized_key` 정확 필터는 한글 key를 그대로 사용한다.
2. `GET /recipes?q=`는 title과 public/approved tag label을 함께 검색한다.
3. 검색 구현은 recipe row 중복 없이 dedupe + stable sort + 기존 cursor를 유지한다.
4. 사용자 자유 tag는 검색/표시 가능하더라도 public/approved 전에는 전역 검색과 HOME theme seed에서 제외한다.
5. HOME theme seed는 public/approved system semantic/source tag만 사용한다.
6. 36c는 read-only slice다. tag 추천, write path, backfill은 변경하지 않는다.

## Contract Evolution Candidates

- 없음. 36a 공식 계약을 그대로 구현한다.

## Primary User Path

1. 사용자가 HOME에서 태그 chip 또는 theme를 선택한다.
2. 클라이언트가 `GET /api/v1/recipes?tag=<normalized_key>`를 호출한다.
3. 서버는 canonical `recipe_tags`에서 public/approved tag 매칭 recipe id를 dedupe하고 기존 list sort/cursor로 카드 목록을 반환한다.
4. 사용자가 검색어를 입력하면 `GET /api/v1/recipes?q=`가 제목과 승인 태그 라벨을 함께 검색해 목록을 갱신한다.
5. HOME 테마 섹션은 `recent-planner` 등 명확 기준 theme와 승인된 시스템 태그 기반 theme를 함께 보여줄 수 있다.

## Delivery Checklist

- [x] 누락된 36c workpack/acceptance/automation metadata 보강 <!-- omo:id=delivery-36c-workpack-gap;stage=2;scope=shared;review=3,6 -->
- [x] `GET /api/v1/recipes?tag=<normalized_key>` exact tag filter 구현 <!-- omo:id=delivery-exact-tag-filter;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/recipes?q=` title + public/approved tag label 검색 구현 <!-- omo:id=delivery-title-tag-search;stage=2;scope=backend;review=3,6 -->
- [x] 검색 결과 dedupe + stable sort + cursor 보존 테스트 <!-- omo:id=delivery-search-cursor-safe;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/tags` 공개 태그 목록/autocomplete route 구현 <!-- omo:id=delivery-public-tags-route;stage=2;scope=backend;review=3,6 -->
- [x] HOME dynamic theme generation을 approved system semantic/source tag로 제한 <!-- omo:id=delivery-home-theme-policy;stage=2;scope=backend;review=3,6 -->
- [x] `tags.slug` 수동 seed와 공개 read/search/theme RPC migration 추가 <!-- omo:id=delivery-36c-migration;stage=2;scope=backend;review=3,6 -->
- [x] API helper/type에 `tag` query와 tag list type 반영 <!-- omo:id=delivery-types-api-helper;stage=2;scope=shared;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
