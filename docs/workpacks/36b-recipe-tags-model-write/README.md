# Slice: 36b-recipe-tags-model-write

## Goal

36a에서 잠근 레시피 태그 v2 계약의 canonical write 모델을 백엔드 authority로 구현한다. `tags` / `recipe_tags` 정규화 테이블을 additive로 추가하고, P0 semantic/source seed 36개를 시드하며, tag normalization helper와 원자적 projection writer를 만든다. YouTube/manual 등록 write path가 서버 자동 추천 또는 사용자 검수 태그를 같은 transaction에서 `recipe_tags`, `recipes.tags` projection, `tags.usage_count`에 일관되게 기록하게 한다. 검색/목록/테마는 36c로, rule fixture/backfill은 36d로, UI는 36e로 분리한다.

## Branches

- 백엔드: `feature/be-36b-recipe-tags-model-write`
- 프론트엔드: 없음 (FE는 `feature/fe-36e-recipe-tags-frontend`에서 진행)

## In Scope

- 화면: 없음. BE-only slice이며 MANUAL_RECIPE_CREATE / YT_IMPORT / HOME UI 적용은 36e에서 진행한다.
- API:
  - `POST /api/v1/recipes` (직접 등록 write path에 optional reviewed `tags` body + 서버 추천 fallback 반영)
  - `POST /api/v1/recipes/youtube/register` (YouTube 등록 write path에 optional reviewed `tags` body + session 추천 fallback 반영)
  - `POST /api/v1/recipes/tag-suggestions` (저장하지 않는 서버 추천 endpoint의 backend contract — recipe row를 만들지 않음)
- 상태 전이:
  - tag write는 상태 머신이 아니라 row 정책 전이다. 시스템 semantic/source tag는 `visibility='public'` + `review_status='approved'`로 기록한다.
  - 사용자 자유 tag는 `visibility='public_pending'`(또는 `private`) + `review_status='pending'` + `theme_eligible=false`로 기록한다.
  - 사용자 `tags` body가 없으면 서버/session 추천을 저장하고, 있으면 사용자 검수 완료 태그로 정규화/검증해 저장한다.
- DB 영향:
  - `tags` 신규 additive table (`v1.3.16` §4-1a)
  - `recipe_tags` 신규 additive table (`v1.3.16` §4-1b)
  - `recipes.tags` projection 컬럼 (기존, write path가 같은 transaction에서 갱신)
  - `recipe_sources` (YouTube register RPC 내 기존 INSERT 순서 안에서 tag UPSERT 통합)
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/20260617090000_36b_recipe_tags_model.sql` 생성 필요 (table 2종 + index + P0 seed)

## Out of Scope

- `GET /recipes?tag=<normalized_key>` 정확 태그 필터 (36c)
- `GET /recipes?q=` 제목 + 승인 tag 검색 (36c)
- `GET /tags` 공개 태그 목록/autocomplete (36c)
- HOME dynamic theme generation / theme seed 승격 실행 (36c)
- P0 의미 태그 rule fixture, 기존 레시피 backfill dry-run/report, usage count 전체 reconcile job, P1 후보 allowlist/승인 정책 (36d)
- MANUAL_RECIPE_CREATE / YT_IMPORT 태그 추천·검수 UI, HOME 태그 검색/filter/theme chip UI (36e)
- 자동 romanization slug 생성
- `유명셰프요리`, `SNS화제`, `검증된레시피` 자동 부여 (P1 후보)
- LLM 기반 자유 태그 생성. P0는 deterministic/rule-based recommender만 사용한다.
- 사용자 tag moderation / admin 편집 UI

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `36a-recipe-tags-contract-evolution` | merged | [x] |
| `18-manual-recipe-create` | merged | [x] |
| `19-youtube-import` | merged | [x] |
| `20-youtube-real-import` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스의 Stage 2 구현을 시작하지 않는다.
> `36a-recipe-tags-contract-evolution`은 PR #771로 main에 merge되었고, 공식 5대 문서 + `CURRENT_SOURCE_OF_TRUTH`가 v1.7.11 / v1.5.18 / v1.3.18 / DB v1.3.16 / API v1.2.20을 가리킨다.

## Backend First Contract

### `POST /api/v1/recipes` (직접 등록)

- Request body: 기존 `{ title, base_servings, thumbnail_url?, ingredients[], steps[] }`에 `tags?: string[]` 추가.
  - `tags` 미존재: 서버가 제목/재료/조리 과정/조리방법 라벨/source_type에서 추천 태그를 생성해 저장한다.
  - `tags` 존재: 사용자 검수 완료 태그로 보고 정규화/검증 후 저장한다.
- Response: `{ success, data, error }` envelope. data는 생성된 recipe 객체이며 `recipes.tags`는 canonical 관계의 projection이다.
- 권한: 로그인 필수, `created_by=current_user`. 다른 사용자 리소스 수정 불가.
- 멱등성: 등록 자체는 새 recipe 생성이므로 멱등 대상이 아니다. tag write 내부는 `recipe_tags` PK `(recipe_id, tag_id)`와 `tags.normalized_key` UNIQUE로 중복 관계/사전 row를 막는다.

### `POST /api/v1/recipes/youtube/register` (YouTube 등록)

- Request body: 기존 register body에 `tags?: string[]` 추가.
  - `tags` 미존재: session의 서버 추천 태그를 저장한다.
  - `tags` 존재: 사용자 검수 완료 태그로 정규화/검증 후 저장한다.
- 처리: 기존 `register_youtube_recipe_from_session` RPC 원자적 INSERT 순서(§6-4)의 `5. tags UPSERT + recipe_tags UPSERT`, `6. recipes.tags projection 갱신` 단계를 실제 구현한다.
- 권한: 로그인 필수, session 소유권/만료/소비/mismatch 검증은 기존 계약 유지.
- 멱등성: 기존 `EXTRACTION_ALREADY_REGISTERED(409)` 등 register 멱등/충돌 계약 유지. tag write 내부 중복 방지는 manual과 동일 기준.

### `POST /api/v1/recipes/tag-suggestions` (저장 없는 추천)

- Request body: `{ title, base_servings?, ingredients?[], steps?[], source_type? }`.
- Response: `{ success, data, error }`. data는 `{ suggested_tags: { normalized_key, label, kind, source, confidence }[], tags: string[] }`.
- 권한: 로그인 필수. recipe row를 만들지 않는 read-only 추천이다.
- 멱등성: side-effect 없음. 동일 입력은 동일 추천 결과를 반환하는 deterministic recommender여야 한다.
- 실패 격리: 추천 실패는 저장 자체를 막지 않으며 빈 `suggested_tags`/`tags`로 응답할 수 있다.

### 공통 에러 계약 (`{ code, message, fields[] }`)

- 401 `UNAUTHORIZED`: 비로그인 요청
- 403: 다른 사용자 리소스 접근 (해당 시)
- 404 `EXTRACTION_NOT_FOUND` / `FEATURE_DISABLED`: YouTube register 기존 계약 유지
- 409 `EXTRACTION_ALREADY_REGISTERED` / `EXTRACTION_MISMATCH` / `CANDIDATE_PROMOTION_REQUIRED`: YouTube register 기존 계약 유지
- 410 `EXTRACTION_EXPIRED`: YouTube register 기존 계약 유지
- 422 `VALIDATION_ERROR` (`fields: [{ field: "tags" }]`): 태그 개수/길이/금지어/중복 정규화 검증 실패

## Frontend Delivery Mode

- Design Status: N/A. 36b는 FE 화면이 없다.
- 36e에서 5개 필수 상태(`loading / empty / error / read-only / unauthorized`)와 태그 추천·검수 chip UI를 구현한다.
- 36b는 36e/36c가 그대로 소비할 API shape(`tags` body, `suggested_tags` preview, `recipes.tags` projection)만 제공한다.

## Design Authority

- UI risk: N/A (BE-only)
- Anchor screen dependency: `HOME`(태그 검색/테마)은 36c, `MANUAL_RECIPE_CREATE` / `YT_IMPORT`(태그 검수 UI)는 36e에서 다룬다.
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 36b는 canonical write 모델과 projection 일관성만 다룬다. 화면/시각 산출물은 36c/36e 범위다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> BE-only 근거: 36b의 In Scope에 FE 화면이 없다. Stage 4(FE 구현), Stage 5(디자인 리뷰), Stage 6(FE PR 리뷰)는 skip한다. Stage 3 백엔드 PR merge 시점에 슬라이스를 종료하고, 사용자-facing tag UI는 36e에서 별도로 닫는다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/36a-recipe-tags-contract-evolution/README.md`
- `docs/요구사항기준선-v1.7.11.md` §1-1, §2-4, §2-15 (P0 의미 태그 목록 / 추론 원칙)
- `docs/db설계-v1.3.16.md` §4-1 recipes, §4-1a tags, §4-1b recipe_tags (set_recipe_tags writer), index list
- `docs/api문서-v1.2.20.md` §6-4 youtube/register, §7-0b tag-suggestions, §7-1 POST /recipes
- `docs/유저flow맵-v1.3.18.md` (YouTube/manual 등록 중 추천→검수→canonical 저장→projection 흐름)

## QA / Test Data Plan

- Fixture baseline:
  - P0 seed 36개(`semantic` 35 + `source` 1)가 `is_system=true`, `theme_eligible=true`로 존재하는 baseline
  - 추천 결과만 있는 레시피: `tags` body 없음 → 서버/session 추천 저장
  - 사용자 검수 레시피: `tags` body 있음 → 정규화/검증 저장
  - 자유 입력 태그 레시피: P0 미매칭 user tag → `public_pending`/`pending`/`theme_eligible=false`
  - 정규화 edge: 앞 `#`, 공백, 중복, 빈 문자열, 최대 길이 초과, 금지어/스팸 입력
- Real DB smoke:
  - migration file 존재 및 SQL 정합성 확인 (table 2종 + unique/index + seed)
  - local Supabase가 가능한 환경에서는 `supabase db push` 후 `tags` / `recipe_tags` table, `tags.normalized_key` UNIQUE, `recipe_tags` PK/index 확인
  - 현재 CI는 migration을 적용하지 않으므로 SQL file + repository tests를 기본 evidence로 둔다.
- Seed/reset:
  - P0 seed는 migration의 idempotent UPSERT로 적용한다 (`normalized_key` 기준).
  - Vitest fixture builder로 recipe/ingredient/step/tag baseline을 구성한다.
  - 운영 DB 기존 레시피 backfill 실행은 36d 범위이며 36b에서 실행하지 않는다.
- bootstrap이 생성해야 하는 시스템 row:
  - P0 semantic/source seed 36개 (migration이 owning flow). 신규 회원 bootstrap과 무관하다.
- Blocker:
  - `tags` / `recipe_tags` schema 누락
  - `recipes.tags` projection을 `recipe_tags`와 다른 transaction에서 비동기로 갱신
  - 사용자 자유 tag가 `public`/`approved`/`theme_eligible=true`로 저장됨
  - 자동 romanization slug 생성
  - `36a` contract-evolution 미merge 상태에서 Stage 2 착수

## Key Rules

1. canonical truth는 `tags` / `recipe_tags`이고 `recipes.tags`는 카드/legacy projection이다.
2. writer는 `recipe_tags`, `recipes.tags`, `tags.usage_count`를 같은 transaction/RPC(`set_recipe_tags` 또는 동등 writer)에서 갱신한다. route에서 `recipe_tags`만 쓰고 projection을 나중에 맞추는 비동기 방식은 금지한다.
3. 사용자 `tags` body가 없으면 서버/session 추천을 저장하고, 있으면 사용자 검수 완료 태그로 정규화/검증해 저장한다. 서버 자동 추천 기능은 유지한다.
4. 사용자 자유 tag는 기본 `visibility='public_pending'`(또는 `private`), `review_status='pending'`, `theme_eligible=false`로 기록한다.
5. system semantic/source tag만 `visibility='public'`, `review_status='approved'`, `theme_eligible=true`가 될 수 있다.
6. P0 `normalized_key`는 한글 label을 그대로 사용한다. 자동 romanization 금지. `slug`는 필요한 seed/system tag에만 수동 지정한다.
7. P0 semantic seed 35개는 `kind='semantic'`, `유튜브레시피` 1개는 `kind='source'`로 시드해 합계 36개를 만든다.
8. tag 정규화는 trim, 앞 `#` 제거, 중복 제거, 최대 길이 제한, 빈/홍보/채널/해시 전용 제거, 금지어/스팸 필터를 적용한다.
9. 건강/다이어트/유명/검증류 태그(`고단백`, `다이어트`, `저당` 등)는 명시 근거가 약하면 붙이지 않는다.
10. P1 후보(`유명셰프요리`, `SNS화제`, `검증된레시피`)는 allowlist/운영 승인 전 자동 부여하지 않는다.
11. HOME theme seed 승격 실행은 36b에서 구현하지 않지만, seed 정책(`theme_eligible`/`visibility`/`review_status`)을 깨지 않게 저장한다.
12. `POST /recipes/tag-suggestions`는 recipe row를 만들지 않는 read-only 추천이며 deterministic해야 한다.

## Contract Evolution Candidates

- 없음. 36a에서 공식 계약이 잠겼고, 36b는 해당 계약의 backend write 구현만 다룬다.

## Primary User Path

1. 사용자가 MANUAL_RECIPE_CREATE 또는 YT_IMPORT에서 레시피를 작성/검수한다.
2. (선택) FE가 `POST /recipes/tag-suggestions`(manual) 또는 register session 추천으로 서버 추천 태그를 미리 본다.
3. 사용자가 태그를 그대로 두거나 추가/삭제한 뒤 `POST /recipes` 또는 `POST /recipes/youtube/register`로 저장한다.
4. 서버는 정규화/검증 후 `set_recipe_tags` 동등 writer로 `tags` UPSERT → `recipe_tags` upsert/delete → `recipes.tags` projection → `tags.usage_count`를 한 transaction에서 갱신한다.
5. 저장된 레시피는 카드에서 `recipes.tags` projection을 표시하고, 이후 36c 검색/테마가 canonical `recipe_tags`를 소비한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 갱신하는 living closeout 문서다. 36b는 BE-only이므로 Stage 4~6 항목은 두지 않는다.

- [x] `tags` / `recipe_tags` additive migration 작성 (table + unique/index + P0 seed) <!-- omo:id=delivery-tags-migration;stage=2;scope=backend;review=3,6 -->
- [x] P0 semantic 35 + source 1 = 36개 seed를 `is_system=true`, `theme_eligible=true`로 idempotent UPSERT <!-- omo:id=delivery-p0-seed;stage=2;scope=backend;review=3,6 -->
- [x] tag normalization helper 구현 (trim, `#` 제거, 중복 제거, 최대 길이, 금지어/스팸, 한글 key 보존) <!-- omo:id=delivery-tag-normalization;stage=2;scope=shared;review=3,6 -->
- [x] `set_recipe_tags` 동등 atomic writer 구현 (`recipe_tags` + `recipes.tags` + `tags.usage_count` 동일 transaction) <!-- omo:id=delivery-projection-writer;stage=2;scope=backend;review=3,6 -->
- [x] `POST /api/v1/recipes` write path에 `tags` body + 서버 추천 fallback 반영 <!-- omo:id=delivery-manual-write-path;stage=2;scope=backend;review=3,6 -->
- [x] `POST /api/v1/recipes/youtube/register` RPC tag UPSERT/projection 단계 구현 <!-- omo:id=delivery-youtube-write-path;stage=2;scope=backend;review=3,6 -->
- [x] `POST /api/v1/recipes/tag-suggestions` 저장 없는 추천 endpoint backend contract 구현 <!-- omo:id=delivery-tag-suggestions;stage=2;scope=backend;review=3,6 -->
- [x] 사용자 자유 tag/시스템 tag visibility·review_status·theme_eligible 정책 경계 고정 <!-- omo:id=delivery-visibility-policy;stage=2;scope=backend;review=3,6 -->
- [x] request/response/error 타입 반영 (`tags` body, `suggested_tags` preview, projection) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] projection 일관성 / 멱등성 / 권한 / 정규화 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / migration readiness 점검 (`tags`/`recipe_tags` 존재) <!-- omo:id=delivery-seed-readiness;stage=2;scope=shared;review=3,6 -->
- [x] targeted Vitest와 backend verification 실행 <!-- omo:id=delivery-backend-verification;stage=2;scope=backend;review=3,6 -->
