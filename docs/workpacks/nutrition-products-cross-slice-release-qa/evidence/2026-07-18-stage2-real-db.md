# nutrition-products-cross-slice-release-qa Stage 2 real DB evidence

- 검증일: 2026-07-18
- exact head / `origin/master`: `a3301e1640eeeadcf1bc21e456a5de6f8f4e87b1`
- repair PR: `#1052` merged
- 범위: Stage 2 real DB / security / performance verification only
- 안전선: aggregate only, no raw provider rows / secrets / tokens / private filesystem paths

## Automation evidence

- target Vitest set: `17 passed`, `4 skipped`
- isolated PostgreSQL runners:
  - ingredient coverage: `14 passed`
  - recipe nutrition: `18 passed`
  - all-recipe nutrition lifecycle: `1 passed`
  - public prepared food import: `9 passed`
  - community prepared food catalog: `20 passed`
  - prepared food planner entry: `11 passed`
  - planner nutrition: `2 passed`
  - total: `75` tests covered by isolated PostgreSQL runners
- backend verification:
  - `pnpm verify:backend` passed
  - `lint` passed
  - `typecheck` passed
  - `test:product` passed: `123 passed`, `3 skipped`, `1598` tests passed with `24` skipped
  - `next build` passed
  - `test:e2e:security` passed: `12 passed`
- doc / workflow validators:
  - `validate:source-of-truth-sync` passed
  - `validate:workflow-v2` passed
  - `validate:workpack` passed
  - `validate:automation-spec` passed
  - `validate:omo-bookkeeping` passed
  - `git diff --check` passed

## Fresh isolated local Supabase evidence

- isolated cluster: `12` containers total
  - `10` healthy with healthcheck
  - `2` running without healthcheck
- required service responses:
  - auth: `200`
  - storage: `200`
  - PostgREST: `200`
- target digest counts:
  - ingredients: `845`
  - recipes: `34`
  - auth users: `2`
  - planner columns: `4`
  - target RLS policies: `5`
  - repair migration: `1`
- external writes: `0`

## Ingredient exact replay

- denominator: `845`
- approved exactly once: `838`
- strict excluded: `7`
- eligible without profile: `0`
- unclassified: `0`
- classification conflict: `0`
- multiple qualified primary: `0`
- exact registered input match: `1`
- status: `applied`
- replayed: `true`
- attempted writes: `0`
- committed writes: `0`
- external/provider/secret leakage: `0`

## All-recipe exact lifecycle

- denominator: `34`
- complete: `8`
- partial: `23`
- unavailable: `3`
- unclassified: `0`
- missing categories: `5`
- warning categories: `4`
- sources: `2`
- secret/conflict/multiple: `0`
- first apply writes: `34`
- replay writes: `0`
- rollback processed: `34`
- current restore: `true`
- Meal pin unchanged across apply/rollback: `true`
- history preserved: `true`
- final current aggregate: `34`

## Public product and anonymization evidence

- visible public dataset: `287,041`
- duplicate keys: `0`
- missing current version: `0`
- hidden/deleted public rows: `0`
- normalized basis amount `100`: `287,041`
  - solid basis `100g`: `250,297`
  - liquid basis `100mL`: `36,744`
- label basis text preserved: `287,041`
- nonempty / inferred relations: `0`
- core observed rows: `1,435,205`
- manual public visible: `3`
- anonymized: `2`
- hidden/deleted manual rows: `2`
- private visible: `0`
- anonymous repair actual DB:
  - target listed: `1`
  - editable strict false: `1`
  - editable null: `0`
  - retained pins: `3`
- current-version retention: `3 / 3`

### Source filter and local-only route

- real DB source-filter calls:
  - requested `public_dataset`: `20` items, returned source type only `public_dataset`
  - requested `manual`: `4` items, returned source type only `manual`
  - source-filter mismatches: `0`
  - returned basis amount different from `100`: `0`
  - public-dataset items without source attribution: `0`
- UI label mapping verified by `community-prepared-food-catalog-ui` Vitest (`14 passed`):
  - `public_dataset` -> `공공 영양DB`
  - public `manual` -> `사용자 등록`
  - private `manual` -> `비공개 보관`
- the authenticated catalog GET route used one local `list_food_products` RPC per page and has no provider client or outbound fetch path.
- runtime provider requests and production/staging/provider writes: `0`

## Performance evidence

- local SQL warmed 30 samples
  - browse: median `11.083ms`, p95 `15.724ms`, max `18.101ms`
  - search: median `19.342ms`, p95 `24.720ms`, max `25.482ms`
  - samples above `300ms`: `0`
- authenticated Next route warmed 30 samples
  - median `337.9ms`
  - p95 `392.1ms`
  - max `460.5ms`
  - samples above `600ms`: `0`
  - response status: `200`
  - wrapper shape: correct
  - items returned: `20`
  - public-only / attribution / basis100: true
  - one RPC per page: true
  - item-level N+1 absent by code inspection

## Actual auth A/B API smoke

- create: `201`
- B search: `200`, read-only
- B delete: `403`
- A patch: `200`
- report: `201`
- duplicate report: `409`
- A delete after one report: `200`
- anonymization candidate create: `201`
- planner pin create: `201`
- account delete: `200`
- public user removed: true
- product anonymized: true
- pin retained and current: true
- pin quantity preserved at `100g`: true
- B search after anonymization: `200`
- editable strict false boolean: true
- former owner patch after delete: `403`

## Pending by design

- independent Stage 3 code/security/performance results are recorded in `2026-07-18-stage3-reviews.md`.
- Stage 4 / 5 / 6 browser, authority, and merge-closeout evidence is intentionally not marked complete in this document.

## 2026-07-19 latest-master aggregate / targeted recheck addendum

- exact current master: `fefbc298420dbe863b8847f60d7db9409647a578`
- 범위: 기존 Stage 2 전체 lifecycle을 다시 실행한 것이 아니라, latest master에서 서비스 상태와 사용자 노출 aggregate가 drift하지 않았는지 확인한 targeted recheck다.
- local Supabase service state:
  - containers up: `12`
  - healthcheck healthy: `10`
  - REST / edge runtime: `up` (healthcheck 상태 표시는 없음)
- aggregate counts:
  - ingredients: `845`
  - recipes: `34`
  - current recipe snapshots: complete `8` / partial `23` / unavailable `3`
  - visible public dataset products: `287,041`
  - visible shared manual products: `5`
  - total visible public products: `287,046`
  - visible private manual products: `0`
- safety boundary:
  - raw provider row output/commit: `0`
  - secret/token/auth query output/commit: `0`
  - production/staging/provider write: `0`

이 addendum은 기존 Stage 2 full-run evidence를 대체하거나 전체 lifecycle 재실행을 주장하지 않는다. post-#1060 bounded rAF repair와 post-#1063 CSS hit-area repair가 DB/API 계약이나 aggregate dataset을 바꾸지 않았다는 targeted 확인만 추가한다. latest master fresh security/performance/code review 결과는 별도 review addendum에서 기록한다.
