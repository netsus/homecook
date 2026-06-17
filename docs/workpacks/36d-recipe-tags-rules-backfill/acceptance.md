# Acceptance: 36d Recipe Tags Rules Backfill

> acceptance는 living closeout 문서다. 체크는 테스트, migration 검증, PR evidence가 생긴 뒤에만 한다.
> 36d는 BE-only slice이며 HOME/등록 화면 UI 적용은 36e에서 닫는다.

## Happy Path

- [ ] YouTube 레시피 추천이 `source_type='youtube'`에서 `유튜브레시피`를 포함한다 <!-- omo:id=accept-youtube-source-tag;stage=2;scope=backend;review=3,6 -->
- [ ] 직접 등록 추천이 제목/재료/단계/조리방법/인분/조리시간 신호로 P0 의미 태그를 추천한다 <!-- omo:id=accept-manual-semantic-tags;stage=2;scope=backend;review=3,6 -->
- [ ] `POST /api/v1/recipes/tag-suggestions`가 확장 입력을 받아 기존 envelope로 deterministic 추천 결과를 반환한다 <!-- omo:id=accept-tag-suggestions-expanded-input;stage=2;scope=backend;review=3,6 -->
- [ ] 사용자 `tags` body가 없으면 서버 자동 추천값이 저장되는 기존 기능이 유지된다 <!-- omo:id=accept-auto-tag-preserved;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] 공식 P0 semantic/source tag seed 36개가 exact list로 고정된다 <!-- omo:id=accept-p0-exact-list;stage=2;scope=backend;review=3,6 -->
- [ ] `유명셰프요리`, `SNS화제`, `검증된레시피`는 P1 후보로만 남고 자동 추천 결과에 포함되지 않는다 <!-- omo:id=accept-p1-gated;stage=2;scope=backend;review=3,6 -->
- [ ] provider tag만으로 `다이어트`, `저당`, `고단백`, `유명셰프요리`, `SNS화제`, `검증된레시피`가 붙지 않는다 <!-- omo:id=accept-provider-only-sensitive-guard;stage=2;scope=backend;review=3,6 -->
- [ ] `자취요리`는 명시 텍스트 또는 인분/시간/재료 수/step 수 조합 신호가 있을 때만 추천된다 <!-- omo:id=accept-living-alone-combined-signal;stage=2;scope=backend;review=3,6 -->
- [ ] HOME theme 후보는 official P0 system semantic/source tag 중심으로 유지되고 deprecated seed는 theme eligible에서 제외된다 <!-- omo:id=accept-deprecated-theme-demotion;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] backfill dry-run helper는 recipe/tag row를 수정하지 않는다 <!-- omo:id=accept-backfill-no-mutation;stage=2;scope=backend;review=3,6 -->
- [ ] usage count reconcile RPC 실제 update는 service role만 실행할 수 있다 <!-- omo:id=accept-reconcile-service-role-only;stage=2;scope=backend;review=3,6 -->
- [ ] public/anon/authenticated role은 36d maintenance RPC 실행 권한을 갖지 않는다 <!-- omo:id=accept-maintenance-rpc-revoked;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [ ] backfill dry-run report는 `created_at ASC`, `id ASC`로 deterministic하다 <!-- omo:id=accept-backfill-deterministic-order;stage=2;scope=backend;review=3,6 -->
- [ ] backfill dry-run report는 `current_tags`, `suggested_tags`, `would_update`, `reason_codes`를 포함한다 <!-- omo:id=accept-backfill-report-shape;stage=2;scope=backend;review=3,6 -->
- [ ] usage count reconcile은 `public` + `approved` recipe_tags 관계만 count한다 <!-- omo:id=accept-usage-count-public-approved;stage=2;scope=backend;review=3,6 -->
- [ ] deprecated seed는 삭제하지 않고 `theme_eligible=false`로만 낮춘다 <!-- omo:id=accept-deprecated-no-delete;stage=2;scope=backend;review=3,6 -->
- [ ] `normalized_key`는 한글 key를 유지하고 자동 romanization을 추가하지 않는다 <!-- omo:id=accept-korean-normalized-key;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [ ] `36b-recipe-tags-model-write`가 merged 상태다 <!-- omo:id=accept-36b-merged;stage=1;scope=shared;review=1 -->
- [ ] `36c-recipe-tags-search-themes`가 merged 상태다 <!-- omo:id=accept-36c-merged;stage=1;scope=shared;review=1 -->
- [ ] fixture에서 official P0 list, provider-only 민감 태그, P1 후보, public/private/pending usage count 관계를 구성한다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke는 local Supabase migration reset과 service-role RPC signature/grant 확인으로 분리한다 <!-- omo:id=accept-real-db-smoke-plan;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest

- [ ] semantic tag rule 테스트가 official P0 list와 주요 rule inference를 고정한다 <!-- omo:id=accept-semantic-rule-tests;stage=2;scope=backend;review=3,6 -->
- [ ] provider-only/P1 guard 테스트가 민감 태그와 P1 후보 자동 부여 금지를 고정한다 <!-- omo:id=accept-sensitive-p1-tests;stage=2;scope=backend;review=3,6 -->
- [ ] backfill dry-run 테스트가 no mutation, deterministic order, report shape를 고정한다 <!-- omo:id=accept-backfill-tests;stage=2;scope=backend;review=3,6 -->
- [ ] migration test가 36d seed/RPC/grant 정책을 고정한다 <!-- omo:id=accept-migration-tests;stage=2;scope=backend;review=3,6 -->

### Manual Only

- [ ] 운영 DB에 36d migration 적용
- [ ] 운영 기존 레시피 backfill dry-run report 검토
- [ ] 운영 기존 레시피 backfill 실제 적용 여부 승인
- [ ] 운영 usage count reconcile 실행과 spot check
