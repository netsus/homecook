# 36a Recipe Tags Contract Evolution

## Goal

레시피 태그를 단순 `recipes.tags text[]` 표시값에서 검색, 테마, 등록 검수까지 연결되는 정식 기능으로 승격한다. 서버 자동 추천 기능은 유지하고, 사용자가 직접 등록 또는 YouTube 검수 중 태그를 추가/삭제할 수 있게 한다. 정규화 모델은 `tags` / `recipe_tags`를 canonical로 두고 기존 `recipes.tags`는 카드/레거시 API projection으로 유지한다.

## Slice Type

- Change type: `contract-evolution`
- Stage owner fallback: 사용자 지시에 따라 Codex가 docs-only contract-evolution을 작성한다.
- Branches:
  - docs: `docs/36a-recipe-tags-contract-evolution`
  - backend model/write: `feature/be-36b-recipe-tags-model-write`
  - backend search/themes: `feature/be-36c-recipe-tags-search-themes`
  - backend rules/backfill: `feature/be-36d-recipe-tags-rules-backfill`
  - frontend: `feature/fe-36e-recipe-tags-frontend`
- Implementation: 없음. 36a는 공식 문서와 acceptance 기준만 잠근다.

## Problem Evidence

- 기존 계약은 YouTube provider tag가 있을 때만 일부 tag를 살리고, 직접 등록은 사용자가 태그를 입력할 수 없다.
- 현재 자동 생성은 제목/재료/조리법에서 일반 tag를 뽑는 수준이라 `자취요리`, `초보가능`, `원팬요리`, `다이어트`, `디저트` 같은 의미 분류를 안정적으로 만들기 어렵다.
- `recipes.tags text[]`만으로는 HOME theme seed, 태그 검색, usage count, 사용자 자유 태그 품질 관리, 승인 정책을 안전하게 운영하기 어렵다.
- 자유 입력 태그를 그대로 HOME theme seed로 쓰면 스팸/개인 메모/품질 낮은 태그가 노출될 수 있다.
- `GET /recipes` cursor pagination은 단순 `recipe_tags` join을 붙이면 중복 row와 cursor 누락이 생길 수 있다.

## In Scope

- 공식 5대 문서 버전 갱신
  - `docs/요구사항기준선-v1.7.11.md`
  - `docs/화면정의서-v1.5.18.md`
  - `docs/유저flow맵-v1.3.18.md`
  - `docs/db설계-v1.3.16.md`
  - `docs/api문서-v1.2.20.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` 갱신
- `docs/workpacks/README.md`에 36a~36e roadmap row 추가
- P0 semantic/source tag seed 36개 고정
- 사용자 자유 태그와 시스템 의미 태그 경계
  - `tags.kind`
  - `tags.is_system`
  - `tags.theme_eligible`
  - `recipe_tags.visibility`
  - `recipe_tags.review_status`
- `recipes.tags` projection 유지 정책
- `GET /recipes?q=` title + approved tag 검색 계약
- `GET /recipes?tag=<normalized_key>` 정확 태그 필터 계약
- `GET /tags` 공개 태그 목록/autocomplete 계약
- `POST /recipes/tag-suggestions` 직접 등록용 서버 추천 계약
- YouTube/manual register의 optional reviewed `tags` body 계약

## Out of Scope

- DB migration, route handler, RPC, component 구현
- 운영 DB backfill 실행
- 사용자 tag moderation/admin UI
- 자동 romanization slug 생성
- `유명셰프요리`, `SNS화제`, `검증된레시피` 자동 부여
- LLM 기반 자유 태그 생성. P0는 deterministic/rule-based recommender와 검증 가능한 metadata만 사용한다.
- HOME theme에 사용자 자유 tag를 자동 노출

## P0 Semantic Tag Set

| 그룹 | 태그 |
| --- | --- |
| 생활/상황 | `자취요리`, `초보가능`, `밀프렙`, `도시락반찬`, `냉털요리`, `아이반찬`, `술안주`, `캠핑요리` |
| 시간/도구 | `10분컷`, `30분이내`, `간단요리`, `원팬요리`, `에어프라이어`, `전자레인지`, `불없이`, `노오븐` |
| 식단/건강 | `고단백`, `다이어트`, `저당`, `저탄수`, `채식한끼`, `발효한끼` |
| 장르/코스 | `한식`, `국물요리`, `밑반찬`, `디저트`, `K디저트`, `면요리`, `분식`, `샐러드`, `한그릇요리`, `해장요리` |
| 맛/식감 | `매콤`, `바삭`, `밥도둑` |
| 출처 | `유튜브레시피` |

P1 후보: `유명셰프요리`, `SNS화제`, `검증된레시피`

위 3개는 provider metadata, allowlist, 운영 승인 같은 검증 가능한 근거가 없으면 자동 부여하지 않는다.

## Tag Rule Direction

- `자취요리`: 1~2인분, 재료 수 적음, 30분 이내, 복잡한 공정 없음
- `초보가능`: step 수 적음, 고난도 조리방법 없음, 실패 위험 낮음
- `원팬요리`: 팬/냄비 하나 중심, 설거지/동시 조리 복잡도 낮음
- `에어프라이어` / `전자레인지`: cooking method, step text, 도구 표현 명시
- `밀프렙` / `도시락반찬` / `밑반찬`: 보관/반찬/도시락/대량 조리 신호
- `고단백`, `다이어트`, `저당`, `저탄수`, `채식한끼`: 재료/조리법 근거가 약하면 붙이지 않음
- `한식`, `국물요리`, `디저트`, `면요리`, `분식`, `샐러드`, `한그릇요리`: title, ingredient category, cooking method, dish pattern 조합
- `매콤`, `바삭`, `밥도둑`: 재료와 조리법이 맛/식감 신호를 충분히 줄 때만 부여
- `유튜브레시피`: `source_type='youtube'`

## Backend Follow-up Split

### 36b model/write/projection

- Additive migration: `tags`, `recipe_tags`
- P0 seed tags
- tag normalization helper
- `set_recipe_tags` RPC or transaction writer
- YouTube/manual create write path update
- `recipes.tags` projection consistency tests

### 36c search/themes

- `GET /recipes?tag=<normalized_key>`
- `GET /recipes?q=` title + approved tag search
- stable cursor strategy: DB function/view or 2-step id lookup + dedupe + existing sort
- `GET /tags`
- HOME theme generation from approved semantic/source tags only

### 36d semantic rules/backfill

- P0 rule fixture tests
- existing recipes backfill dry-run/report
- P1 후보 allowlist/review policy
- usage count reconcile

### 36e frontend

- MANUAL_RECIPE_CREATE tag suggestions and editable chip UI
- YT_IMPORT tag review UI
- HOME tag search/filter and theme chip behavior
- loading/empty/error states

## Dependencies

| Slice | Status | Required |
| --- | --- | --- |
| `31-recipe-media-tags` | in-progress | [x] |
| `18-manual-recipe-create` | merged | [x] |
| `19-youtube-import` | merged | [x] |
| `20-youtube-real-import` | merged | [x] |
| `taxonomy-v2-contract-evolution` | in-progress | [x] |

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.11.md`
- `docs/화면정의서-v1.5.18.md`
- `docs/유저flow맵-v1.3.18.md`
- `docs/db설계-v1.3.16.md`
- `docs/api문서-v1.2.20.md`

## Verification Strategy

Stage 1 docs:

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 36a-recipe-tags-contract-evolution
git diff --check
```

36b backend:

```bash
pnpm vitest run tests/recipe-tags-normalization.test.ts tests/recipe-tags-write-projection.test.ts tests/recipe-tags-youtube-register.test.ts tests/recipe-tags-manual-create.test.ts
pnpm validate:source-of-truth-sync
pnpm validate:workpack -- --slice 36b-recipe-tags-model-write
git diff --check
```

36c backend:

```bash
pnpm vitest run tests/recipe-tags-search.test.ts tests/recipe-themes.test.ts tests/recipes-route.test.ts
pnpm validate:source-of-truth-sync
pnpm validate:workpack -- --slice 36c-recipe-tags-search-themes
git diff --check
```

36d backend:

```bash
pnpm vitest run tests/recipe-semantic-tags.test.ts tests/recipe-tags-backfill.test.ts
pnpm validate:source-of-truth-sync
pnpm validate:workpack -- --slice 36d-recipe-tags-rules-backfill
git diff --check
```

36e frontend:

```bash
pnpm vitest run tests/manual-recipe-tags.test.tsx tests/youtube-import-tags.test.tsx tests/home-tag-search.test.tsx
pnpm exec playwright test tests/e2e/slice-36e-recipe-tags.spec.ts
pnpm validate:source-of-truth-sync
pnpm validate:workpack -- --slice 36e-recipe-tags-frontend
git diff --check
```

## Key Rules

1. 서버 자동 추천 기능은 유지한다.
2. 사용자가 태그를 수정하지 않으면 서버 추천값을 저장한다.
3. 사용자 자유 tag는 HOME theme seed로 자동 승격하지 않는다.
4. HOME theme seed는 public/approved/theme_eligible system semantic/source tag만 사용한다.
5. `recipes.tags`는 projection이며 canonical truth는 `recipe_tags`다.
6. `recipe_tags`, `recipes.tags`, `tags.usage_count`는 같은 transaction/RPC에서 갱신한다.
7. tag 검색은 cursor pagination을 깨지 않도록 dedupe + stable sort를 보장한다.
8. P0 `normalized_key`는 한글 key를 그대로 사용하고 자동 romanization을 하지 않는다.
9. 건강/다이어트/유명/검증류 태그는 근거가 약하면 붙이지 않는다.
10. P1 후보는 allowlist/운영 승인 전 자동 부여하지 않는다.
