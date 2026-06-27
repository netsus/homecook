# Launch Recipe DB Load Plan - 2026-06-25

## Decision

정식 배포 전 recipe DB 보강은 **license-cleared public recipe source fetch -> deterministic normalization -> human review -> idempotent seed migration** 방식으로 진행한다.

무단 크롤링한 블로그/YouTube/커뮤니티 레시피를 운영 DB에 bulk insert하지 않는다. YouTube 레시피는 사용자가 직접 링크를 가져오는 기능의 핵심 flow로 유지하고, launch seed는 공공 API/파일 데이터 또는 집밥 팀이 직접 작성/검수한 레시피만 사용한다.

첫 launch 목표는 전체 source row 적재가 아니라 **100~200개 검수 레시피**다. 홈 화면이 비어 보이지 않고 검색/테마/플래너/장보기/요리모드가 충분히 작동하는 정도를 우선 달성한 뒤, 품질 점검을 통과한 source를 단계적으로 늘린다.

## Current Remote DB Baseline

2026-06-25 read-only Supabase REST 점검 결과:

| Table | Count |
| --- | ---: |
| `recipes` | 13 |
| `recipe_sources` | 11 |
| `recipe_ingredients` | 104 |
| `recipe_steps` | 82 |
| `recipe_tags` | 22 |
| `tags` | 70 |

Recipe source type:

| source_type | Count |
| --- | ---: |
| `manual` | 2 |
| `youtube` | 10 |
| `system` | 1 |

Quality notes:

- 현재 recipe 평균 재료 수는 8개, 평균 step 수는 6.31개다.
- 재료 또는 step이 0개인 recipe는 없다.
- 출시용 DB에는 테스트성 제목으로 보이는 row와 중복 YouTube title이 섞여 있으므로 recipe seed 전에 existing recipe hygiene review가 필요하다.
- 현재 `created_by`가 모두 null이라 user-owned recipe와 launch seed recipe를 구분하기 어렵다. launch seed는 deterministic UUID와 `recipe_sources.extraction_meta_json.source_provider`로 식별한다.

## Source Status

| Source | Role | Current decision |
| --- | --- | --- |
| 식품의약품안전처 `조리식품의 레시피 DB` | 1차 launch recipe source | 우선 검토. title, ingredient text, manual steps, nutrition, image URL, hash tag를 제공한다. |
| 농림수산식품교육문화정보원 `레시피 재료정보` | 보조 source/evidence | 재료/분량/영양 보조 evidence로 검토한다. 조리 step 품질이 충분한 row만 recipe 후보로 승격한다. |
| 전북특별자치도 `음식만드는법` CSV/XML/JSON | 지역/한식 보조 source | 875 row file data. 공공누리 제1유형 출처표시 조건을 지키고, 긴 문화 설명은 그대로 복사하지 않는다. |
| 기존 user/imported YouTube recipe rows | 품질 참고/cleanup 대상 | bulk seed source로 사용하지 않는다. 중복/테스트성 row는 별도 hygiene review에서 정리한다. |
| 블로그/커뮤니티/상업 레시피 사이트 | 제외 | 명시적 라이선스/제휴 없이 크롤링 금지. |

Source evidence:

- 공공데이터포털 `식품의약품안전처_조리식품의 레시피 DB`: JSON+XML, 무료, 수정일 2025-08-27, 이용허락범위 제한 없음.
  - https://www.data.go.kr/data/15060073/openapi.do
- 식품안전나라 `조리식품의 레시피 DB`: API 호출제한 1000, 출처표시/상업적 이용 가능/2차적 저작물 작성 가능으로 표시.
  - https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=COOKRCP01
- 공공데이터포털 `농림수산식품교육문화정보원_레시피 재료정보`: JSON+XML, 무료, 수정일 2025-07-29, 이용허락범위 제한 없음.
  - https://www.data.go.kr/data/15058981/openapi.do
- 공공데이터포털 `전북특별자치도_음식만드는법`: CSV/XML/JSON, 전체 행 875, 수정일 2025-08-19, 공공저작물 제1유형 출처표시.
  - https://www.data.go.kr/data/15050012/fileData.do

## Non-Negotiable Rules

1. 운영 `recipes`, `recipe_sources`, `recipe_ingredients`, `recipe_steps`, `recipe_tags`에 외부 source row를 직접 bulk insert하지 않는다.
2. source license, source URL, source modified date, source row id는 artifact와 `recipe_sources.extraction_meta_json`에 남긴다.
3. 블로그/YouTube/커뮤니티의 본문, 설명란, 이미지, 썸네일은 bulk seed에 사용하지 않는다.
4. source title이 같아도 재료/조리법이 다를 수 있으므로 dedupe key는 `source_provider + source_recipe_id`를 우선한다.
5. 공개 recipe seed는 `source_type='system'`, `created_by=null`로 넣는다.
6. 사용자 데이터와 섞이지 않도록 launch recipe UUID는 deterministic namespace로 생성한다.
7. 기존 user-owned recipe는 수정/삭제하지 않는다.
8. ingredient는 기존 `ingredients` / `ingredient_synonyms`로 resolve된 row만 seed한다.
9. 미해결 재료를 recipe seed 중 자동으로 새 ingredient로 만들지 않는다. 필요하면 ingredient DB follow-up으로 먼저 처리한다.
10. 조리방법은 기존 `cooking_methods`에 매핑된 row만 seed한다. 미해결 method는 review 대상이다.
11. recipe step은 최소 2개 이상, ingredient는 최소 3개 이상인 row만 launch 후보가 된다.
12. 이미지 URL은 license-cleared public source URL만 저장한다. 불명확한 이미지는 저장하지 않고 앱 fallback 이미지를 사용한다.
13. nutrition field는 현재 public recipe schema에 없으므로 DB column을 추가하지 않고 source metadata에 보존한다.
14. `recipes.tags` projection과 canonical `tags` / `recipe_tags` 관계를 함께 생성하거나, 둘 다 생성하지 않는다.
15. rollback SQL 또는 제거 대상 recipe/source id 목록을 PR 본문과 artifact에 남긴다.
16. public API shape를 바꾸지 않는다.

## Data Mapping

### `recipes`

| Field | Mapping |
| --- | --- |
| `id` | deterministic UUID from `homecook:launch-recipe-load:2026-06-25:<source_provider>:<source_recipe_id>` |
| `title` | source menu name, max 200 chars, obvious marketing/noise removed only after review |
| `description` | short neutral summary or null. Long source story text is not copied wholesale. |
| `thumbnail_url` | license-cleared source image URL only. Otherwise null. |
| `base_servings` | parse from source serving/weight when clear, default 2 if unknown. |
| `tags` | reviewed projection from canonical tag labels. |
| `source_type` | `system` |
| `created_by` | null |
| counts | 0 unless intentionally seeded for demo ranking. Prefer 0 for launch seed. |

### `recipe_sources`

Use existing table without schema change.

| Field | Mapping |
| --- | --- |
| `recipe_id` | launch recipe id |
| `youtube_url`, `youtube_video_id` | null |
| `extraction_methods` | `['public_api', 'manual_review']` or `['public_file', 'manual_review']` |
| `extraction_meta_json` | provider, source_recipe_id, source_url, source_modified_at, license, source_title, nutrition summary, image provenance |
| `raw_extracted_text` | compact normalized source row text only when license permits and useful for audit |

### `recipe_ingredients`

- Parse source ingredient text into `name`, `amount`, `unit`, `display_text`, `sort_order`.
- Resolve name through exact `ingredients.standard_name`, then `ingredient_synonyms.synonym`.
- If multiple target ingredients match one source token, mark `needs_review`.
- If amount is unclear but ingredient is real, use `TO_TASTE` only for true "약간/취향껏" cases.
- If a real quantity exists but parser cannot normalize it, keep candidate out of launch until reviewed.

### `recipe_steps`

- FoodSafety `MANUAL01` through `MANUAL20` become ordered steps after blank removal.
- Remove leading numbering only; do not rewrite source instructions unless human review marks a correction.
- Map cooking method through existing method labels/synonyms.
- If method is unresolved, mark candidate `needs_review`; do not auto-create launch cooking methods.
- Keep `ingredients_used` empty unless there is deterministic source evidence.

### Tags and Themes

- Generate candidate tags with existing rule code where possible.
- Always include source tag candidates such as `공공레시피` and source-specific tag candidates such as `식약처레시피` only if the tag seed is explicitly approved.
- Theme eligibility must follow 36a/36c policy: public/approved system semantic/source tags only.
- Do not promote overly broad source categories into HOME themes without recipe count and quality review.

## Execution Plan

### Phase 0. Existing DB Hygiene Review

Before adding launch recipes:

- Export current recipe list with `id`, `title`, `source_type`, `created_by`, source metadata, ingredient count, step count, tag count.
- Flag likely test rows, duplicate titles, missing source metadata, non-license-cleared images.
- Do not delete automatically. Produce `existing-recipe-hygiene-report.md`.
- If deleting is approved later, create a separate rollback-safe cleanup migration with reference guards.

Current suspected review items from remote DB sample:

- test-like manual title: `ㄴㅇㄹㅇ`
- test-like manual title: `토블론`
- duplicate YouTube title: `서브웨이 뺨치는 오이 참치 샌드위치🥒 #레시피`

### Phase 1. Source Credential and License Lock

Environment candidates:

```dotenv
FOODSAFETYKOREA_API_KEY=식품안전나라_인증키
DATA_GO_KR_API_KEY=공공데이터포털_인증키
DATA_GO_KR_API_KEY1=공공데이터포털_보조_인증키
```

Key rules:

- Actual key names must be verified by a small live request before tooling is finalized.
- `.env.local` is local secret storage and must not be committed.
- Logs and artifacts record key source names only, never raw key values.
- If FoodSafetyKorea and data.go.kr keys differ, use separate env vars and do not silently reuse one key.

### Phase 2. Fetch Tooling

Add or extend recipe-source tooling:

- `scripts/external-recipe-live-fetch.mjs`
- `scripts/external-recipe-file-dry-run.mjs`
- `scripts/external-recipe-review-pack.mjs`
- `scripts/external-recipe-load-sql-generator.mjs`
- tests mirroring the external ingredient ingest pattern.

Tooling requirements:

- Pagination and request cap support.
- Resume from cached source artifacts.
- Source-specific parser adapters.
- License/source metadata lock in every output.
- Production writes remain 0 until migration generation.

Initial output root:

```bash
export LOAD_DATE=2026-06-25
export RECIPE_LOAD_DIR=.artifacts/external-recipe-ingest/launch-${LOAD_DATE}
```

### Phase 3. Source Fetch

Primary FoodSafetyKorea fetch target:

```bash
pnpm external:recipes:live-fetch -- \
  --providers foodsafety-cookrcp \
  --output-dir "$RECIPE_LOAD_DIR/foodsafety-source" \
  --generated-at "${LOAD_DATE}T00:00:00.000Z" \
  --page-size 100 \
  --max-requests-per-run 200
```

Secondary source fetches should run only after primary source parser and review pack are stable.

### Phase 4. Candidate Normalization and Risk Report

Generate a candidate report with:

- source row count
- candidate recipe count
- blocked count
- duplicate by source id
- duplicate by normalized title
- missing/invalid ingredient count
- unresolved ingredient names
- unresolved cooking methods
- missing or weak step count
- image URL/license status
- tag candidates
- nutrition/source metadata preservation status

Blocking rules:

- no title
- fewer than 3 resolved ingredients
- fewer than 2 valid steps
- any ingredient unresolved without approved fallback
- cooking method unresolved
- source license missing
- image URL present but license/provenance missing
- duplicate source id
- source instruction looks like story/article rather than step list

### Phase 5. Human Review Pack

Create review pack:

- `recipe-candidates.json`
- `recipe-review-worklist.tsv`
- `recipe-review.html`
- `recipe-load-risk-report.md`
- `recipe-load-risk-report.json`

Review UI should show:

- title, source provider, source id, license, image preview
- ingredient mapping table: raw text -> parsed name -> target ingredient -> amount/unit
- step list and cooking method mapping
- tag candidates
- risk flags

Default decision behavior:

- approved only when reviewer explicitly approves
- unreviewed means exclude from launch migration
- rename/retitle is allowed only in review decision artifact
- hold means keep in artifact but do not generate migration

### Phase 6. Pilot Load Migration

First pilot target:

- 20 to 30 recipes
- mostly home-cooking friendly recipes
- include at least 5 categories/themes
- every recipe has ingredients, steps, tags, and source metadata

Pilot source rule:

- Use FoodSafetyKorea `COOKRCP01` as the only pilot source unless it cannot cover the minimum category mix.
- Do not mix MAFRA or Jeonbuk rows into the first pilot. Those sources can enter Phase 7 after the parser/review/load path is proven.
- Existing YouTube/manual rows are not pilot seed sources. They are hygiene review/reference data only.
- Prefer source rows that include `RCP_SEQ`, `RCP_NM`, `RCP_PAT2`, `RCP_WAY2`, `RCP_PARTS_DTLS`, `MANUAL01..20`, and source image/provenance fields.

Pilot selection criteria:

| Criterion | Rule |
| --- | --- |
| License/source | source URL, provider, source id, license note, fetched_at are present |
| Ingredient mapping | at least 3 ingredients resolve to existing `ingredients` through standard name or synonym |
| Ingredient quality | core ingredients have amount/unit or clear display text; vague-only rows are excluded |
| Step quality | at least 2 non-empty cooking steps after blank/manual cleanup |
| Cooking method | `RCP_WAY2` or step evidence maps to an existing `cooking_methods` row |
| Home fit | ingredients are common enough for pantry/shopping flows; avoid professional equipment and rare specialty-only recipes |
| UX coverage | recipe should exercise recipe detail, planner, shopping list, pantry search, and cook mode without special-case UI |
| Duplicate risk | duplicate normalized title/source id is excluded unless human review chooses the better source row |
| Image | image is optional; if stored, source provenance/license must be clear |
| Text quality | title/instructions must not look like fixture data, broken encoding, article body, or promotion copy |

Pilot category mix:

| Bucket | Target count | Reason |
| --- | ---: | --- |
| 한식 국/찌개/탕 | 4 to 5 | 홈/테마와 장보기 flow에서 가장 익숙한 core recipe |
| 밥/면/일품 | 4 to 5 | 한 끼 식사로 플래너에 넣기 좋음 |
| 반찬/볶음/구이 | 4 to 5 | 여러 끼니 조합과 장보기 재료 합산 검증에 좋음 |
| 간단/30분 이내 | 3 to 4 | 홈 추천 태그와 빠른 조리 UX 검증 |
| 고단백/다이어트/샐러드 | 3 to 4 | 현재 추천 태그/테마와 겹치되 필터 품질 검증 가능 |
| 간식/디저트 | 2 to 3 | 홈 탐색 다양성 보강 |
| 예비 슬롯 | 2 to 4 | 위 bucket 중 품질 좋은 후보로 채움 |

Pilot scoring:

| Score area | Points |
| --- | ---: |
| ingredient resolve ratio and amount quality | 30 |
| step clarity and method mapping | 25 |
| home-cooking fit | 20 |
| category/theme coverage value | 15 |
| duplicate/noise risk is low | 10 |

Selection algorithm:

1. Fetch FoodSafetyKorea source rows into artifacts only.
2. Normalize and block rows that fail non-negotiable gates.
3. Score remaining rows with the pilot scoring table.
4. Pick the highest-scoring rows while satisfying the category mix.
5. Generate `recipe-pilot-selection-2026-06-25.md` with selected/excluded reasons.
6. Human-review the selected 20 to 30 rows.
7. Generate pilot migration only from explicitly approved rows.

Migration writes:

- `recipes`
- `recipe_sources`
- `recipe_ingredients`
- `recipe_steps`
- `tags` only if new approved system/source tags are needed
- `recipe_tags`

The pilot PR must include rollback SQL.

### Phase 7. Launch Load Migration

After pilot smoke:

- expand to 100 to 200 total recipes
- keep PR batches reviewable, ideally 50 to 100 recipes per PR
- avoid inserting all source rows at once
- keep image-heavy rows separate if thumbnail policy needs extra verification

### Phase 8. Apply and Smoke

Before remote apply:

```bash
supabase db push --linked --dry-run
pnpm exec vitest run \
  tests/recipe-api-contracts.test.ts \
  tests/recipe-tags-search.test.ts \
  tests/recipe-tags-backfill.test.ts \
  tests/ingredient-dictionary.backend.test.ts
pnpm typecheck
pnpm lint
```

After remote apply:

- `GET /api/v1/recipes` returns new seed recipes.
- `GET /api/v1/recipes?q=<new recipe title>` finds expected row.
- `GET /api/v1/recipes?tag=<approved tag>` returns seeded tag recipes.
- `GET /api/v1/recipes/themes` includes only approved system/source tag themes.
- `GET /api/v1/recipes/{id}` shows ingredients and steps.
- Add seeded recipe to planner.
- Create shopping list from seeded recipe.
- Enter cook mode from seeded recipe.
- Pantry ingredient search resolves seeded recipe ingredients.
- Production data quality scan has no fixture/demo text.

## Rollback Plan

Rollback SQL must delete dependent rows before `recipes`.

Order:

1. Guard check references:
   - `meals`
   - `recipe_book_items`
   - `recipe_likes`
   - `shopping_list_recipes`
   - `cook_sessions` / cooking session tables if present
   - any user-owned table with `recipe_id`
2. Delete launch `recipe_tags`.
3. Delete launch `recipe_steps`.
4. Delete launch `recipe_ingredients`.
5. Delete launch `recipe_sources`.
6. Delete launch-only tags if no other recipe uses them.
7. Delete launch `recipes`.

If any user data references a launch recipe, rollback must stop. In that case use a forward correction migration, for example hide/unpublish if such a field exists in a future contract, or fix the bad recipe rows in place. Current schema does not have `published` / `deleted_at` for recipes, so destructive rollback must be guarded.

## Launch Acceptance Criteria

- Source/license lock exists.
- Existing recipe hygiene report exists.
- Candidate review pack exists.
- Approved decision artifact exists.
- Pilot load migration and rollback SQL exist.
- Pilot remote smoke passes.
- Launch migration batch has deterministic IDs and idempotent inserts.
- Every launch recipe has at least 3 resolved ingredients and 2 steps.
- Every launch recipe has source metadata in `recipe_sources.extraction_meta_json`.
- No launch recipe comes from unlicensed third-party scraping.
- `recipe_tags` and `recipes.tags` projection are consistent.
- Rollback SQL blocks when user references exist.

## Pilot Status - 2026-06-26

Completed locally and merged:

- Approved decision artifact: `recipe-review-decisions-pilot-30-2026-06-26.json`
- Pilot ingredient follow-up migration: `supabase/migrations/20260626103000_foodsafety_pilot_ingredient_followup.sql`
- Pilot recipe seed migration: `supabase/migrations/20260626104000_seed_foodsafety_pilot_recipes.sql`
- Pilot rollback SQL: `rollback-20260626104000_foodsafety_pilot_recipe_seed.sql`

Local verification completed:

- `pnpm exec vitest run tests/external-recipe-ingest-scripts.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm dlx supabase db reset`
- Local DB smoke for 30 seeded recipes and the corrected `근채류주먹밥` ingredient order.

Remote status:

- `supabase migration list` on 2026-06-26 showed `20260626102000`, `20260626103000`, and `20260626104000` as local-only.
- Remote DB apply and remote smoke are still pending.

Pilot seed quality follow-up:

- Corrected pre-remote seed quality issues in `다이어트국수`, `백김치콩비지찌개`, `근채류주먹밥`, `구운채소와 간장레몬 소스`, `새우 두부 계란찜`, and `전복리조또`.
- Re-ran local `supabase db reset`; pilot quality gates passed with 30 recipes, 299 ingredient rows, 146 steps, and 135 recipe tag rows.
- Re-ran `supabase db push --linked --dry-run`; remote apply still pending and would push only the three 2026-06-26 pilot migrations.

Pilot post-remote follow-up:

- After remote apply, DB held the expected 43 total recipes and 30 FoodSafety pilot recipes, but HOME still showed only the first recipe page because `/api/v1/recipes` already paginates and HOME did not consume `next_cursor`.
- HOME now appends the next page from `next_cursor` with an explicit `더 보기` action and labels the count as displayed rows instead of implying the loaded page is the whole DB.
- The original FoodSafety API only provided recipe-level `RCP_WAY2`, so the seed copied one cooking method to every step in each recipe. Added `20260626121000_fix_foodsafety_pilot_step_methods.sql` to reclassify all 146 pilot steps by step instruction using existing `cooking_methods`.

## Next Batch Parking Plan - 2026-06-27

Additional recipe loading is intentionally parked until the current pilot display-quality issues are addressed.

Proceed when the following gates are complete or explicitly deferred:

1. Recipe detail public-image gallery fix is implemented:
   - preserve original image ratio for the main detail image,
   - show public recipe image candidates as secondary thumbnails,
   - support `사진 모두 보기`.
2. Cook mode readability fixes are implemented or scheduled in the same release batch:
   - larger ingredient text,
   - stable cook-mode skeleton,
   - horizontal multi-method badges.
3. Home theme taxonomy is corrected:
   - theme names must be backed by current DB fields such as tags, ingredients, cooking methods, source metadata, or counters,
   - do not create themes like `불 없이` unless the recipe method data can prove no heat-based method is used,
   - avoid themes that duplicate existing sort controls such as save-count sort.
4. Pilot 30 quality lessons are folded into the next review pack:
   - visible source tags are internalized,
   - step cooking methods can be multi-valued,
   - ingredient order follows likely step usage,
   - sauce/dressing components are preserved as sections,
   - image candidates and their dimensions/roles are exported for review.

Recommended next load shape:

- Use a small batch before any large import: 50 recipes first, then 100 if the quality gates pass.
- Prioritize recipes that improve theme coverage with reliable data:
  - no-heat / cold-prep only if cooking methods prove it,
  - main meal / one-bowl / soup / side / salad only when tags and ingredients support it,
  - beginner-friendly only when step count, method complexity, and ingredient count are low enough.
- Generate an editable HTML review pack again, but include:
  - pilot number and source id,
  - all image candidates with dimensions,
  - editable visible tags,
  - editable step methods with multiple methods per step,
  - ingredient section/order editing,
  - theme eligibility preview.
- Create migration, rollback SQL, local dry-run, remote dry-run, and smoke checks only after the review decisions are exported.

Do not bulk-load hundreds of recipes until the 50-recipe batch passes UI review on home, detail, cook mode, planner add, and shopping-list creation.

## Prep Status - 2026-06-25

The first tooling pass for this plan is implemented and recorded in:

- `recipe-db-pilot-prep-report-2026-06-25.md`

Available commands:

```bash
pnpm external:recipes:hygiene-report -- \
  --output-dir .artifacts/external-recipe-ingest/launch-2026-06-25/hygiene \
  --generated-at 2026-06-25T00:00:00.000Z

pnpm external:recipes:live-fetch -- \
  --output-dir .artifacts/external-recipe-ingest/launch-2026-06-25/foodsafety-source \
  --generated-at 2026-06-25T00:00:00.000Z \
  --start-index 1 \
  --end-index 30

pnpm external:recipes:review-pack -- \
  --source-export .artifacts/external-recipe-ingest/launch-2026-06-25/foodsafety-source/live-source-export.json \
  --output-dir .artifacts/external-recipe-ingest/launch-2026-06-25/review-pack \
  --target-count 30 \
  --generated-at 2026-06-25T00:00:00.000Z
```

Current status:

- Existing recipe hygiene report generation works through read-only Supabase REST.
- FoodSafetyKorea `COOKRCP01` response shape is verified through the official `sample` key.
- `DATA_GO_KR_API_KEY` and `DATA_GO_KR_API_KEY1` do not authenticate against FoodSafetyKorea `COOKRCP01`; both returned invalid-key HTML alerts.
- `.env.local` needs `FOODSAFETYKOREA_API_KEY` before a real 20-30 recipe pilot batch can be generated.
- Sample response review pack generated 5 candidates and 4 sample pilot selections. These are parser/review proof only and must not be used as launch seed rows.

## Deferred Work

- Admin recipe review UI.
- Recipe staging tables.
- Recipe edit/delete/publish workflow.
- Image asset hosting/proxy strategy.
- Nutrition display schema.
- Third-party creator partnership/import flow.
- Scheduled recipe source refresh.
- Bulk YouTube channel import. This requires explicit licensing/permission and is not part of launch seed.
