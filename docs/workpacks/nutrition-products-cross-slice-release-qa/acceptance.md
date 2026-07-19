# Acceptance Checklist

> 이 acceptance는 verification-only final release QA를 위한 living closeout 문서다.
> 체크는 exact current head의 real DB, real browser, review, authority, CI evidence가 생긴 뒤에만 한다.
> `Manual Only`를 제외한 각 체크박스는 `stage=2|4`만 사용한다.
> `scope=shared` + `stage=4` 항목은 `review=6`만 사용하고, frontend Stage 4만 `review=5,6`을 쓴다.
> PR `#1059` 당시 PASS와 이후 두 차례 blocker/repair 이력을 모두 보존했다. fresh authority, Stage 5/6, PR `#1064` exact-head checks와 merge `c931552015a51271273fb05040694d42cffaf46c`로 자동·로컬 acceptance를 다시 닫았다.

## Contract Boundary

- [x] 최신 공식 5종과 predecessor workpack을 다시 확인하고 새 endpoint/field/status/error/schema를 추가하지 않는다 <!-- omo:id=accept-release-qa-contract-boundary;stage=2;scope=shared;review=3,6 -->
- [x] verification-only slice라 defect는 separate TDD repair PR로만 수정하고, repaired exact head에서 release QA를 재실행한다 <!-- omo:id=accept-release-qa-repair-boundary;stage=2;scope=shared;review=3,6 -->
- [x] production/staging/provider write는 끝까지 `0`이고, runtime public/provider fetch를 하지 않는다 <!-- omo:id=accept-release-qa-external-write-zero;stage=2;scope=shared;review=3,6 -->

## Ingredient Coverage / Recipe Lifecycle

- [x] local ingredient inventory가 정확히 `845 = approved exactly once 838 + strict excluded 7`이고 `eligible_without_profile=0`, `unclassified=0`, `classification_conflict=0`, `multiple_qualified_primary=0`이다 <!-- omo:id=accept-release-qa-ingredient-counts;stage=2;scope=shared;review=3,6 -->
- [x] ingredient coverage 최초 apply 후 same-input replay는 `0` write이고 secret/auth query/cookie/raw row/private path leak는 `0`이다 <!-- omo:id=accept-release-qa-ingredient-replay-security;stage=2;scope=shared;review=3,6 -->
- [x] local all-recipe checkpoint가 정확히 `34 = ready(complete) 8 + partial 23 + unavailable 3`이고 replay `0` write, rollback `34`, current aggregate restore가 성립한다 <!-- omo:id=accept-release-qa-recipe-counts;stage=2;scope=shared;review=3,6 -->
- [x] missing/trace/to-taste/unconvertible/temporary는 0으로 정규화되지 않고 기존 `missing_reasons` / `warnings_json` taxonomy만 사용한다 <!-- omo:id=accept-release-qa-missing-not-zero;stage=2;scope=shared;review=3,6 -->
- [x] historical Meal pin은 unchanged이고 current recipe recalculation이 과거 Meal을 repin하지 않는다 <!-- omo:id=accept-release-qa-meal-pin;stage=2;scope=shared;review=3,6 -->

## Product Catalog / Sharing / Basis

- [x] local public catalog row count가 `287,041`이고 runtime provider search 없이 local-only 검색이 동작한다 <!-- omo:id=accept-release-qa-product-row-count;stage=2;scope=shared;review=3,6 -->
- [x] source filter/tag가 `공공 영양DB / 사용자 등록 / 비공개 보관`을 유지하고 shared manual public과 owner-only legacy private manual 경계를 섞지 않는다 <!-- omo:id=accept-release-qa-source-tags;stage=2;scope=shared;review=3,6 -->
- [x] `label_basis_text`를 보존하고 고형은 `100g`, 액상은 `100mL`, exact direct relation only, no inference를 유지한다 <!-- omo:id=accept-release-qa-basis-contract;stage=2;scope=shared;review=3,6 -->
- [x] shared manual create/search/edit/delete/report에서 auth A/B owner/moderation/read-only 경계가 보존되고 신고는 append-only다 <!-- omo:id=accept-release-qa-shared-manual-auth;stage=2;scope=shared;review=3,6 -->
- [x] account deletion 후 shared manual row는 anonymized read-only public으로 남고 기존 planner pin은 유지된다 <!-- omo:id=accept-release-qa-anonymization-pin;stage=2;scope=shared;review=3,6 -->
- [x] local 287,041-row smoke에서 item-level N+1과 unexplained query/route regression이 없고 predecessor baseline(SQL 약 28ms, route 약 349-559ms) 대비 결과가 보고된다 <!-- omo:id=accept-release-qa-performance-baseline;stage=2;scope=shared;review=3,6 -->

## Real DB / Stack Verification

- [x] fresh local Supabase full migrations가 올라오고 DB/Auth/Storage 등 required services가 running 또는 healthy다 <!-- omo:id=accept-release-qa-local-stack;stage=2;scope=shared;review=3,6 -->
- [x] RLS, PostgREST, auth bootstrap, target table digest, owner scope, zero external write를 real DB에서 검증한다 <!-- omo:id=accept-release-qa-rls-postgrest;stage=2;scope=shared;review=3,6 -->
- [x] latest master `fefbc298420dbe863b8847f60d7db9409647a578`의 fresh independent security / performance / code reviewers가 exact verification head를 읽고 unresolved blocker `0`이다 <!-- omo:id=accept-release-qa-independent-review;stage=2;scope=shared;review=3,6 -->

## Real Browser / UI States

- [x] real Chrome + real local Supabase에서 auth A/B `FOOD_PRODUCT_CREATE` create/search/edit/delete/report와 `SETTINGS_ACCOUNT_DELETE_CONFIRM` account anonymization flow가 통과한다 <!-- omo:id=accept-release-qa-browser-auth-flows;stage=4;scope=frontend;review=5,6 -->
- [x] ProductPlannerEntry add/edit/delete와 `100→101g` 재계산이 통과하고 Recipe Meal / shopping / cooking / leftover / XP와 섞이지 않는다 <!-- omo:id=accept-release-qa-browser-planner-flow;stage=4;scope=frontend;review=5,6 -->
- [x] `RECIPE_DETAIL`은 ready(complete) / partial / unavailable / temporarily unavailable을 구분하고 snapshot이 있는 모든 recipe를 `정보 준비 중`으로 뭉개지 않는다 <!-- omo:id=accept-release-qa-browser-recipe-states;stage=4;scope=frontend;review=5,6 -->
- [x] `PLANNER_WEEK` / `MEAL_SCREEN`은 recipe + product planned nutrition, incomplete indicator, warning guidance를 유지하고 false zero를 보이지 않는다 <!-- omo:id=accept-release-qa-browser-planned-nutrition;stage=4;scope=frontend;review=5,6 -->
- [x] `PLANNER_WEEK`는 initial `7/13–7/19`, 다음 주 `7/20–7/26`, `이번 주` 복귀 `7/13–7/19`에서 주간 제목 = 실제 보이는 요일 strip = 날짜 카드 범위가 320/390/1280 모두 일치한다 <!-- omo:id=accept-release-qa-planner-week-range-coherence;stage=4;scope=frontend;review=5,6 -->
- [x] `RECIPE_DETAIL` / `FOOD_PRODUCT_PICKER` / `FOOD_PRODUCT_CREATE` / `PLANNER_WEEK` / `MEAL_SCREEN` / `SETTINGS_ACCOUNT_DELETE_CONFIRM`이 320 / 390 / desktop 1280에서 overflow 없이 읽히고 44px target을 유지한다 <!-- omo:id=accept-release-qa-responsive-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] exploratory QA / eval과 fresh post-#1063 current-head authority report가 exact verification head 기준으로 다시 남아 있다 <!-- omo:id=accept-release-qa-exploratory-authority;stage=4;scope=frontend;review=5,6 -->

## Merge Gate

- [x] final closeout PR exact head의 started checks는 모두 success 또는 intentional skip이고 pending/fail이 `0`이다 <!-- omo:id=accept-release-qa-current-head-checks;stage=4;scope=shared;review=6 -->
- [x] fresh independent Stage 6 reviewer가 acceptance, review reports, authority evidence, actual verification refs를 읽고 unresolved finding `0`이다 <!-- omo:id=accept-release-qa-stage6;stage=4;scope=shared;review=6 -->

## Data Setup / Preconditions

- [x] `pnpm local:reset:demo`와 `pnpm dev:local-supabase`가 real DB baseline을 재현하고 fixture browser와 분리된다고 문서화되어 있다 <!-- omo:id=accept-release-qa-data-setup;stage=2;scope=shared;review=3,6 -->
- [x] test account A/B, breakfast/lunch/dinner columns, shared manual product, anonymization candidate, planner product entry baseline이 준비된다 <!-- omo:id=accept-release-qa-bootstrap;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: primary Codex orchestrator + separated product-design authority + independent Stage 5 evidence reviewer
- environment: real local Supabase + the user's existing logged-in Chrome test-account session; fixture browser was not used as release evidence
- scenarios:
  - fresh local Supabase + real Chrome auth A/B + `FOOD_PRODUCT_CREATE` + `SETTINGS_ACCOUNT_DELETE_CONFIRM`
  - ingredient coverage / all-recipe / public product / shared manual / planner / `RECIPE_DETAIL` cross-slice flow
  - `RECIPE_DETAIL` / `FOOD_PRODUCT_PICKER` / `FOOD_PRODUCT_CREATE` / `PLANNER_WEEK` / `MEAL_SCREEN` / `SETTINGS_ACCOUNT_DELETE_CONFIRM` 320 / 390 / desktop 1280 screenshot and authority capture

## Automation Split

### Stage 2 Deterministic / Integration

- [x] ingredient coverage / all-recipe / public import / community catalog / planner nutrition related backend tests와 validators를 실행한다 <!-- omo:id=accept-release-qa-backend-automation;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke는 fixture browser나 isolated-only evidence로 대체하지 않는다 <!-- omo:id=accept-release-qa-real-db-not-substituted;stage=2;scope=shared;review=3,6 -->

### Stage 4 Browser / Authority

- [x] planner / product / recipe nutrition 관련 frontend Vitest, Playwright, exploratory QA/eval, authority evidence를 실행한다 <!-- omo:id=accept-release-qa-frontend-automation;stage=4;scope=frontend;review=5,6 -->
- [x] Stage 4 shared closeout은 final closeout PR current-head checks / fresh Stage 6 final review까지 포함해 frontend review와 분리 기록한다 <!-- omo:id=accept-release-qa-shared-closeout;stage=4;scope=shared;review=6 -->

### Manual Only

- [ ] physical device 검증
- [ ] 실제 screen reader 검증
- [ ] true production-scale query/load 측정
- [ ] production / staging / provider write 승인 실행
- [ ] Discord / Amphetamine 후속 automation (merge + closeout 이후만)
