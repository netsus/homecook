# Slice: all-recipe-nutrition-recalculation

## Goal

현재 레시피 영양 스냅샷을 승인된 재료 영양 체인만으로 전수 재계산해, 모든 레시피가 `complete / partial / unavailable` 중 하나의 current 결과를 갖도록 만든다. 이 슬라이스는 checkpoint 시점 `public.recipes` 전체를 분모로 쓰며, 현재 schema에 active/deleted marker가 없기 때문에 일부 subset으로 범위를 줄이지 않는다. 결과 리포트는 `complete + partial + unavailable`과 정확히 일치해야 하고, `unclassified / conflict / multiple current`는 0이어야 한다.

FoodSafety-30에서 검증한 operator batch를 all-public-recipes checkpoint inventory/checksum으로 확장해 dry-run / apply / replay / report / rollback을 닫는다. 기존 Meal pin은 immutable하게 유지하고, 같은 checkpoint 입력 재실행은 0 write가 되어야 하며, rollback은 delete 없이 이전 current snapshot으로 원자 복원해야 한다.

## Branches

- 문서: `docs/all-recipe-nutrition-recalculation`
- 백엔드/데이터: `feature/be-all-recipe-nutrition-recalculation`
- 프론트엔드: N/A — BE/data only, Stage 4~6 스킵

## In Scope

- 화면/public API: 없음
- internal operator command:
  - immutable recipe inventory export + checksum
  - all-public-recipes checkpoint batch dry-run / apply / replay / report / rollback
  - predecessor snapshot `missing_reasons` + canonical ordered `warnings_json`만 재사용하는 current snapshot report for `complete / partial / unavailable`
- denominator and accounting:
  - checkpoint 시점 `public.recipes` 전체를 denominator로 사용
  - denominator = `complete + partial + unavailable`
  - `unclassified = 0`
  - `conflict = 0`
  - `multiple current = 0`
- exact calculation contract:
  - exact active / current / approved chain만 사용
  - actual edible-use amount만 사용
  - 새 `preparation_state` / `size_code` / `edible_state` 입력을 추가하지 않는다
  - missing은 0이 아니다
  - report taxonomy는 predecessor snapshot `missing_reasons`와 canonical ordered `warnings_json`만 재사용하며 새 status / reason enum을 추가하지 않는다
  - existing Meal pins remain immutable
- DB 영향:
  - `recipe_nutrition_snapshots`
  - `recipes`
  - `recipe_ingredients`
  - `meals.recipe_nutrition_snapshot_id` read-only
  - `meals.nutrition_snapshot_origin` read-only
  - read-only predecessors: `nutrition_sources`, `nutrition_profiles`, `nutrition_values`, `ingredient_nutrition_profiles`, `measurement_conversion_profiles`, `ingredient_conversion_assignments`, `piece_unit_weights`
- Schema Change:
  - [x] 없음 — public API / schema / status / field 추가 없음
  - [ ] 있음

## Out of Scope

- community-prepared-food-catalog, public prepared-food import, 100g/100mL standard basis UX, Chrome QA
- public API shape / status / field 변경
- new preparation_state / size_code / edible_state inputs
- production/staging writes without a separate approval artifact
- raw / secret / private path exposure in report, logs, browser, or PR
- recipe product catalog, planner aggregate, or community moderation changes

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `ingredient-nutrition-full-coverage` | merged — PR #1038, merge `3c737eae` | [x] |
| `recipe-nutrition-calculation` | merged | [x] |
| `public-nutrition-source-acquisition` | merged | [x] |

> `ingredient-nutrition-full-coverage`가 merged 상태여야만 이 슬라이스의 Stage 1 문서 기준으로 전수 recipe 재계산을 시작할 수 있다. `recipe-nutrition-calculation`은 current snapshot writer와 rollback semantics의 직접 predecessor다.

## Backend First Contract

### Public contract

- 신규 public API는 없다.
- existing recipe query and snapshot read path만 사용한다.
- report는 current result만 반환하고, 상태는 `complete / partial / unavailable` 밖으로 확장하지 않는다.
- report taxonomy는 predecessor snapshot `missing_reasons`와 canonical ordered `warnings_json`만 재사용하며 새 status / reason enum을 추가하지 않는다.

### Operator inventory

- inventory artifact는 checkpoint 시점의 `public.recipes` 전체 row를 고정된 순서로 export하고, checksum과 row count를 함께 보존한다.
- current recipe schema에 active/deleted marker가 없으므로 `FoodSafety-30`처럼 subset을 임의로 좁히지 않는다.
- inventory checksum과 result checksum이 일치하지 않으면 apply / rollback을 진행하지 않는다.

### Calculation contract

- calculator는 ingredient source/profile/conversion의 승인된 active / current / approved chain만 따라간다.
- recipe row에 새로운 preparation/size/edible 입력을 추가하지 않는다.
- actual edible-use amount만 사용하고, missing을 0으로 바꾸지 않는다.
- `meals.recipe_nutrition_snapshot_id`와 `meals.nutrition_snapshot_origin`은 read-only이며, already pinned Meal row는 current 변경과 무관하게 그대로 유지한다.
- historical Meal repin은 허용하지 않는다.

### Run contract

| mode | write | gate |
| --- | --- | --- |
| dry-run / report | DB 0 | inventory checksum, result checksum, secret/raw/private path scan |
| apply local | current snapshot write only | explicit target set, exact checksum match, atomic current switch |
| replay local | DB 0 | same-input replay must keep `writes_committed=0` |
| rollback local | current pointer restore only | restore previous immutable current without deletes |
| staging / production | 0 | separate approval artifact required; not opened by this slice |

### Coverage gate

- `denominator_count = complete_count + partial_count + unavailable_count`
- `unclassified_count = 0`
- `conflict_count = 0`
- `multiple_current_count = 0`
- `same_input_replay_writes_committed = 0`
- missing / partial rows stay missing or partial; they are not coerced to numeric zero.
- report `missing_reasons`와 `warnings_json` ordering은 predecessor snapshot과 동일해야 한다.

## Frontend Delivery Mode

- BE/data only.
- `loading / empty / error / read-only / unauthorized` UI states, return-to-action, and Playwright are N/A for this slice.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: public UI, browser QA, and design authority are out of scope.

## Design Status

- [x] N/A — BE/data-only, Stage 4~6 스킵

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/ingredient-nutrition-full-coverage/README.md`
- `docs/workpacks/recipe-nutrition-calculation/README.md`
- `docs/workpacks/public-nutrition-source-acquisition/README.md`

## QA / Test Data Plan

- RED first: all-public-recipes checkpoint denominator, exact ingredient active/current/approved chain selection, missing-not-zero, complete/partial/unavailable counts, current switch atomicity, same-input replay `0` write, rollback without delete, Meal pin immutability, predecessor `missing_reasons`/`warnings_json` ordering lock
- fixture: synthetic recipe inventory and approved chain rows only; no raw/secret/private path in fixture or report
- real DB: isolated local Supabase/PostgreSQL only. Run inventory export → dry-run → apply → replay → report → rollback in a clean local DB
- performance: bounded cursor only, per-ingredient N+1 금지, inventory/export, dry-run, apply, replay, report, rollback의 query/write count를 같은 checkpoint 입력에서 결정론적으로 기록하고 문서화 없는 drift 시 실패 처리
- blocker: missing checksum match, stale inventory, non-zero replay writes, delete-based rollback, Meal repin, staging/prod write attempt without separate approval

## Key Rules

- No public API / schema / status / field additions.
- No new preparation_state / size_code / edible_state inputs.
- missing is not zero.
- current snapshots may switch atomically, but previous immutable snapshots and existing Meal pins remain available.
- rollback restores the previous current snapshot without deleting historical rows.
- raw / secret / private path exposure is forbidden in code, logs, reports, and browser output.
- staging / production writes remain blocked unless a separate approval artifact is introduced later.

## Primary User Path

1. 운영자가 checkpoint 시점의 all-public-recipes inventory와 checksum을 고정한다.
2. dry-run으로 complete / partial / unavailable 분포와 누락 사유를 검수한다.
3. local apply로 current snapshot을 원자 전환하고 replay가 0 write인지 확인한다.
4. report와 rollback으로 이전 current를 delete 없이 복원하고, 기존 Meal pins가 그대로 유지되는지 확인한다.

## Delivery Checklist

- [ ] all-public-recipes checkpoint inventory/checksum contract <!-- omo:id=delivery-recipe-inventory-contract;stage=2;scope=backend;review=3 -->
- [ ] exact ingredient active/current/approved chain selection and missing-not-zero accounting <!-- omo:id=delivery-recipe-chain-selection;stage=2;scope=backend;review=3 -->
- [ ] atomic current switch, idempotent same-input replay, rollback without deletes <!-- omo:id=delivery-recipe-snapshot-lifecycle;stage=2;scope=backend;review=3 -->
- [ ] Meal pin immutability and no silent repin across backfills <!-- omo:id=delivery-recipe-meal-pin-immutability;stage=2;scope=shared;review=3 -->
- [ ] predecessor `missing_reasons` / canonical ordered `warnings_json` reuse with no new enum <!-- omo:id=delivery-recipe-report-taxonomy;stage=2;scope=shared;review=3 -->
- [ ] bounded cursor, no per-ingredient N+1, deterministic query/write counts, and local DB-only smoke <!-- omo:id=delivery-recipe-qa-baseline;stage=2;scope=shared;review=3 -->
- [ ] staging / production remain write-blocked without a separate approval artifact <!-- omo:id=delivery-recipe-prod-guard;stage=2;scope=backend;review=3 -->

## Stage 1.5 Evidence

- initial rereview: `REQUEST_CHANGES` with blocker4 on report taxonomy / checkpoint wording / Stage state drift.
- repair applied: predecessor `missing_reasons` + canonical ordered `warnings_json` reuse, all-public-recipes checkpoint wording, Meal read-only/no historical repin, bounded cursor + no per-ingredient N+1, and roadmap `planned` restoration were patched in this pass.
- final rereview: pending. Stage 1 PR is not open yet, so this slice remains draft/planned until a docs PR exists.

## Contract Evolution Candidates

- 없음. 이 슬라이스는 기존 recipe nutrition contract를 전수 재계산으로만 재적용하며 public API / schema / status / field를 확장하지 않는다.
