# Slice: 36d-recipe-tags-rules-backfill

## Goal

36a에서 잠근 레시피 태그 v2 계약 중 P0 의미 태그 추천 규칙과 기존 데이터 정리 준비를 백엔드에서 닫는다. YouTube/직접 등록의 서버 자동 태그 생성 기능은 유지하되, 단순 재료명이나 조리법 나열이 아니라 공식 P0 semantic/source 태그를 근거 기반으로 추천한다. 기존 레시피에는 바로 쓰기 backfill을 실행하지 않고, dry-run report와 usage count reconcile 도구만 제공한다.

> Stage 1 note: 사용자 요청으로 36d를 바로 이어서 진행하는 과정에서 workpack 디렉터리가 누락되어 있었다. CI 정책상 구현 PR 전에 base branch에 Stage 1 문서가 있어야 하므로, 이 docs PR에서 36a 공식 계약을 기준으로 36d workpack/acceptance/automation metadata를 먼저 보강한다.

## Branches

- 문서: `docs/36d-recipe-tags-rules-backfill`
- 백엔드: `feature/be-36d-recipe-tags-rules-backfill`
- 프론트엔드: 없음 (태그 검수 UI와 HOME chip UX는 `feature/fe-36e-recipe-tags-frontend`에서 진행)

## In Scope

- 화면: 없음. BE-only slice이며 MANUAL_RECIPE_CREATE / YT_IMPORT 태그 검수 UI는 36e에서 진행한다.
- API:
  - 기존 `POST /api/v1/recipes/tag-suggestions` 추천 입력에 인분/조리시간/provider tag 참고 신호를 반영한다.
  - 기존 `POST /api/v1/recipes` 직접 등록 fallback 추천이 P0 의미 태그 규칙을 사용한다.
  - 기존 YouTube extract/register session 추천이 P0 의미 태그 규칙을 사용한다.
- 상태 전이:
  - 자동 추천은 저장 전 추천 또는 기존 write path fallback으로만 동작한다.
  - 기존 레시피 backfill은 production write를 하지 않고 dry-run report만 만든다.
  - P1 후보 태그(`유명셰프요리`, `SNS화제`, `검증된레시피`)는 allowlist/운영 승인 전 자동 부여하지 않는다.
- DB 영향:
  - 36a 공식 P0 semantic/source seed 36개를 idempotent하게 보정한다.
  - 36b/36c에 있던 deprecated seed label은 삭제하지 않고 HOME theme eligibility만 내린다.
  - service role 전용 usage count reconcile RPC와 projection backfill dry-run RPC를 추가한다.
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/20260617123000_36d_recipe_tags_rules_backfill.sql`

## Out of Scope

- production DB에서 기존 레시피 backfill을 실제 실행
- 사용자 자유 태그를 HOME theme seed로 승격
- P1 후보 태그 자동 부여
- tag moderation/admin 승인 UI
- MANUAL_RECIPE_CREATE / YT_IMPORT 태그 추천·검수 UI
- HOME 태그 검색/filter/theme chip UI
- LLM 기반 자유 태그 생성
- 자동 romanization slug 생성

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `36a-recipe-tags-contract-evolution` | merged | [x] |
| `36b-recipe-tags-model-write` | merged | [x] |
| `36c-recipe-tags-search-themes` | merged | [x] |

## Backend First Contract

### P0 semantic/source tag list

| 그룹 | 태그 |
| --- | --- |
| 생활/상황 | `자취요리`, `초보가능`, `밀프렙`, `도시락반찬`, `냉털요리`, `아이반찬`, `술안주`, `캠핑요리` |
| 시간/도구 | `10분컷`, `30분이내`, `간단요리`, `원팬요리`, `에어프라이어`, `전자레인지`, `불없이`, `노오븐` |
| 식단/건강 | `고단백`, `다이어트`, `저당`, `저탄수`, `채식한끼`, `발효한끼` |
| 장르/코스 | `한식`, `국물요리`, `밑반찬`, `디저트`, `K디저트`, `면요리`, `분식`, `샐러드`, `한그릇요리`, `해장요리` |
| 맛/식감 | `매콤`, `바삭`, `밥도둑` |
| 출처 | `유튜브레시피` |

### Rule confidence policy

- 추천기는 title, ingredient names, step texts, cooking method labels, source_type, base servings, total time, provider tags를 입력으로 받는다.
- source tag는 `source_type='youtube'`일 때 `유튜브레시피`를 추천할 수 있다.
- `자취요리`는 명시 텍스트 또는 1~2인분, 재료 수 적음, 30분 이내, step 수 적음 같은 조합 신호가 필요하다.
- `10분컷`/`30분이내`는 조리시간 숫자 또는 명시 텍스트가 필요하다.
- `전자레인지`, `에어프라이어`, `원팬요리`, `불없이`, `노오븐`은 도구/조리 방식의 명시 근거가 필요하다.
- `고단백`, `다이어트`, `저당`, `저탄수`, `채식한끼`, `아이반찬`처럼 오해 여지가 있는 태그는 provider tag만으로 붙이지 않는다.
- `유명셰프요리`, `SNS화제`, `검증된레시피`는 P1 후보 목록으로만 보관하고 P0 자동 추천 결과에는 포함하지 않는다.
- 추천 결과는 36b의 validation/order 정책을 유지하며, 사용자 검수 `tags` body가 있으면 사용자 검수값을 우선한다.

### Backfill dry-run

- 입력: 기존 recipe projection, title, ingredients, steps, source, created_at.
- 출력: recipe별 현재 projection, 추천 tag, 변경 필요 여부, reason code.
- 정렬: `created_at ASC`, `id ASC`로 deterministic해야 한다.
- mutation: 없음. dry-run helper/RPC는 recipe row, recipe_tags, usage_count를 수정하지 않는다.
- reason codes:
  - `missing_suggested_tags`
  - `stale_projection`
  - `empty_suggestion`
  - `legacy_projection_only` (DB dry-run RPC)

### Usage count reconcile

- 기준: `recipe_tags.visibility='public'` and `recipe_tags.review_status='approved'` 관계만 count한다.
- dry-run은 변경 후보만 보고한다.
- 실제 update RPC는 service role만 실행할 수 있어야 한다.
- 운영 실행은 이 slice의 code merge 이후 별도 manual operation으로 남긴다.

## Frontend Delivery Mode

- Design Status: N/A. 36d는 BE-only slice다.
- 36e에서 MANUAL_RECIPE_CREATE/YT_IMPORT 추천 chip 검수 UX와 HOME chip/theme UX를 닫는다.

## Design Authority

- UI risk: N/A (BE-only)
- Anchor screen dependency: `HOME`, `MANUAL_RECIPE_CREATE`, `YT_IMPORT`는 36e에서 UI 적용
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 36d는 추천 규칙과 data repair 준비만 다룬다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/36a-recipe-tags-contract-evolution/README.md`
- `docs/workpacks/36b-recipe-tags-model-write/README.md`
- `docs/workpacks/36c-recipe-tags-search-themes/README.md`
- `docs/요구사항기준선-v1.7.11.md` §1-1, §2-15
- `docs/db설계-v1.3.16.md` §4-1a, §4-1b
- `docs/api문서-v1.2.20.md` §1-1, §1-2, §1-2b, §6-2, §7-0b, §7-1

## QA / Test Data Plan

- Fixture baseline:
  - 공식 P0 seed 36개 exact list
  - YouTube source + 1~2인분 + 짧은 시간 + 명시 tool text
  - 민감 태그 provider-only 입력
  - diet/sugar/protein 명시 근거 입력
  - P1 후보 provider tag 입력
  - legacy projection만 있는 recipe
  - public/approved, private, pending recipe_tags usage count fixture
- Real DB smoke:
  - local Supabase reset 후 36d migration 적용 확인
  - P0 공식 seed 36개가 theme eligible system semantic/source로 존재하는지 확인
  - deprecated seed label의 theme eligibility가 내려갔는지 확인
  - `reconcile_recipe_tag_usage_counts(boolean)`와 `dry_run_recipe_tag_projection_backfill(integer)` signature 확인
  - service role 외 public/anon/authenticated grant가 없는지 확인
- Blocker:
  - provider tag만으로 건강/유명/검증 태그가 자동 부여됨
  - P1 후보 태그가 P0 추천 결과에 포함됨
  - backfill dry-run이 실제 recipe/tag row를 수정함
  - usage count reconcile이 private/pending 관계를 count함
  - deprecated seed를 삭제해 기존 데이터 참조를 깨뜨림

## Key Rules

1. 서버 자동 태그 생성 기능은 유지한다.
2. 추천기는 단순 재료명보다 P0 의미/source 태그를 우선한다.
3. 의미 태그는 근거가 있을 때만 붙인다.
4. provider tag는 참고 신호일 뿐이며 민감/검증류 태그의 단독 근거가 될 수 없다.
5. P1 후보(`유명셰프요리`, `SNS화제`, `검증된레시피`)는 운영 승인 전 자동 부여하지 않는다.
6. 기존 레시피 backfill은 이 slice에서 production write로 실행하지 않는다.
7. usage count reconcile은 public/approved recipe_tags 관계만 기준으로 한다.
8. `recipes.tags`는 projection이며 canonical truth는 `tags` / `recipe_tags`다.
9. `normalized_key`는 P0에서 한글 key를 그대로 사용하고, 자동 romanization을 추가하지 않는다.
10. deprecated seed는 삭제하지 않고 theme eligibility만 조정한다.

## Contract Evolution Candidates

- 없음. 36a 공식 계약을 그대로 구현한다.

## Primary User Path

1. 사용자가 직접 등록 또는 YouTube 등록으로 레시피를 만든다.
2. 서버 추천기가 제목/재료/단계/조리법/인분/시간/source/provider tag를 근거로 P0 의미 태그를 추천한다.
3. 사용자가 태그를 수정하지 않으면 추천 태그가 저장된다.
4. 사용자가 태그를 수정하면 36b 검수 태그 write path가 사용자 값을 정규화해 저장한다.
5. 기존 레시피는 운영자가 dry-run report를 보고 별도 승인 후 backfill 실행 여부를 판단한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 갱신하는 living closeout 문서다. 36d는 BE-only이므로 Stage 4~6 항목은 두지 않는다.

- [x] 누락된 36d workpack/acceptance/automation metadata 보강 <!-- omo:id=delivery-36d-workpack-gap;stage=2;scope=shared;review=3,6 -->
- [x] 공식 P0 semantic/source tag 36개 exact fixture 고정 <!-- omo:id=delivery-p0-exact-fixture;stage=2;scope=backend;review=3,6 -->
- [x] P0 추천 rule engine이 source/time/tool/lifestyle/course/taste/diet 신호를 deterministic하게 해석 <!-- omo:id=delivery-semantic-rule-engine;stage=2;scope=backend;review=3,6 -->
- [x] 민감 태그와 P1 후보 태그가 provider-only 신호로 자동 부여되지 않도록 guard 구현 <!-- omo:id=delivery-sensitive-p1-guard;stage=2;scope=backend;review=3,6 -->
- [x] 직접 등록 fallback 추천에 base servings와 total step minutes 반영 <!-- omo:id=delivery-manual-rule-signals;stage=2;scope=backend;review=3,6 -->
- [x] YouTube 추천에 provider tags와 candidate base servings 참고 신호 반영 <!-- omo:id=delivery-youtube-rule-signals;stage=2;scope=backend;review=3,6 -->
- [x] 기존 레시피 backfill dry-run/report helper 구현 <!-- omo:id=delivery-backfill-dry-run;stage=2;scope=backend;review=3,6 -->
- [x] usage count reconcile helper/RPC가 public/approved 관계만 count하도록 구현 <!-- omo:id=delivery-usage-reconcile;stage=2;scope=backend;review=3,6 -->
- [x] 36d migration이 official P0 seed 보정, deprecated seed demotion, service-role-only RPC를 포함 <!-- omo:id=delivery-36d-migration;stage=2;scope=backend;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] targeted Vitest와 backend verification 실행 <!-- omo:id=delivery-backend-verification;stage=2;scope=backend;review=3,6 -->
