# Slice: ingredient-nutrition-full-coverage

## Goal

서비스의 모든 canonical ingredient를 영양 계산 가능 여부까지 빠짐없이 분류한다. 공공 원본과 검수된 결정으로 정확히 연결된 재료만 영양 계산에 사용하고, 계산할 수 없는 재료는 숫자 `0`을 만들지 않은 채 명시적 제외 사유로 남긴다. 완료 기준은 inventory의 모든 재료가 정확히 한 번 분류되고 `unclassified=0`인 것이다.

## Branches

- 문서: `docs/ingredient-nutrition-full-coverage`
- 백엔드/데이터: `feature/be-ingredient-nutrition-full-coverage`
- 프론트엔드: N/A — internal operator batch와 검증 report만 다루는 BE/data slice

## In Scope

- 화면/public API: 없음
- internal operator command:
  - immutable ingredient inventory export + checksum
  - source candidate/coverage decision plan + sanitized report
  - `all-active` dry-run/apply/replay/report/disable
- 분모: inventory checkpoint 시점의 `public.ingredients` 전체 행. 현재 schema에는 `is_active`/`deleted_at`이 없으므로 일부 category나 FoodSafety-30으로 분모를 줄이지 않는다.
- 분류: 각 ingredient는 `eligible` 결정 하나 또는 허용된 `excluded` 결정 하나만 가진다.
- DB 영향: 기존 `ingredients`, `ingredient_synonyms`, `nutrition_sources`, `nutrition_source_items`, `nutrition_profiles`, `nutrition_values`, `ingredient_nutrition_profiles`, `operational_events`
- Schema Change:
  - [ ] 없음
  - [x] 있음 → 새 table/status 없이 검수 decision checksum을 기존 link insert/apply guard가 확인하도록 additive 후속 migration

## Out of Scope

- 전체 활성 recipe snapshot 재계산과 Recipe Detail 표시. 이는 `all-recipe-nutrition-recalculation`이 소유한다.
- 조리 손실, 흡수율, 임의 밀도, 범용 `개→g`, 이름 유사도 자동 승인
- 사용자에게 손질 상태·크기·가식부를 새 필수 입력으로 요구하는 UI
- 공공 원문 row/전체 dataset을 DB, git, log, PR, browser bundle에 저장하는 일
- 신규 public endpoint/response field/status, 제품 catalog, planner 동작
- 승인 artifact 없는 production/staging write

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| 2026-07-17 public-sharing 공식 계약 | merged — PR #1026, merge `403bf16c50cc4fd35c88a10510b4a216e866f991` | [x] |
| `public-nutrition-source-acquisition` | merged | [x] |
| `ingredient-nutrition-conversion-model` | merged | [x] |

## Backend First Contract

public API/UI 계약은 바꾸지 않는다. internal artifact와 CLI만 추가·확장한다.

### Inventory artifact

- `schema_version=ingredient-nutrition-inventory-v1`, `scope=all-active`, query version, sorted ingredient projection, `row_count`, SHA-256 checksum을 가진다.
- row는 `ingredient_id`, canonical name, category/category code, default unit, 검수된 synonyms만 포함하고 ID 순서를 고정한다.
- 현재 DB의 all-active 정의는 `public.ingredients` 전체다. schema에 공식 active marker가 생기기 전에는 category/null field로 제외하지 않는다.

### Coverage decision artifact

- inventory checksum과 같은 ingredient ID를 정확히 한 번씩 포함한다.
- `eligible`: operator가 pin한 `provider_code + external_item_key + source item fingerprint`가 approved/current source item 하나와 일치하고, 검수된 approved primary link 하나를 만든다.
- `excluded`: operator actor/time/reason과 아래 좁은 reason code 중 하나를 가진다.
  - `NON_INGESTED_PROCESS_INPUT`
  - `UNBOUNDED_COMPOSITE`
  - `CANONICAL_IDENTITY_INVALID`
- `NO_MATCH`, `AMBIGUOUS_MATCH`, `SOURCE_MISSING`, `LICENSE_UNKNOWN`, `UNIT_UNSUPPORTED`, `MISSING_NUTRIENT`는 제외 사유가 아니라 해결되지 않은 backlog이며 coverage gate를 실패시킨다.
- 이름 일치/유사도, category, confidence, source priority만으로 자동 승인하지 않는다. MFDS priority 1, RDA 10.4 priority 2는 semantic compatibility 이후 후보 정렬에만 사용한다.

### Run contract

| mode | write | gate |
| --- | --- | --- |
| inventory/plan/coverage dry-run | DB 0 | inventory/source/decision checksum, schema, secret/raw-row 검사 |
| apply local | 승인 link/version/run registry만 atomic write | explicit decision + checkpoint, exact target, duplicate/conflict 0 |
| apply staging/production | 기본 0 | target fingerprint + inventory/decision checksum + one-time checkpoint가 모두 일치하는 별도 approval artifact와 명시적 allow-write 값 필요 |
| disable | payload delete 0 | apply와 별개의 disable approval; affected batch만 inactive/revoked하고 감사 이력 유지 |

동일 입력/결정/target 재실행은 같은 idempotency key를 만들고 `writes_committed=0`이어야 한다. rollback은 과거 payload를 수정·삭제하지 않고 새 승인 link version 또는 batch disable로 수행한다.

### Coverage gate

- `denominator_count = approved_exactly_one_count + excluded_count`
- `eligible_without_profile=0`
- `unclassified=0`
- `classification_conflict=0`
- `multiple_qualified_primary=0`
- 결측 nutrient/unit은 `missing/partial/unavailable`로 남고 영양 `0`으로 대체되지 않는다.

## Frontend Delivery Mode

- BE/data only. `loading / empty / error / read-only / unauthorized`, return-to-action, Playwright는 소비 화면이 없어 N/A다.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: internal CLI/report와 DB guard만 변경한다.

## Design Status

- [x] N/A — BE/data-only, Stage 4~6 스킵

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.21.md`
- `docs/화면정의서-v1.5.27.md`
- `docs/유저flow맵-v1.3.24.md`
- `docs/db설계-v1.3.22.md`
- `docs/api문서-v1.2.26.md`
- `docs/workpacks/public-nutrition-source-acquisition/`
- `docs/workpacks/ingredient-nutrition-conversion-model/`

## QA / Test Data Plan

- RED first: inventory sorting/checksum, exact external key, ambiguous/no-match fail-closed, decision completeness/duplicate, forbidden exclusion, missing-vs-zero, duplicate active primary, production checkpoint mismatch
- fixture: synthetic source items/ingredients/decisions only. 실제 key/auth query/raw provider row는 fixture/log/report에 넣지 않는다.
- real DB: fresh local Supabase reset → inventory → dry-run → approved apply → replay → coverage → disable → replay. 기존 user service data를 destructive reset하지 않는 격리 경로를 사용한다.
- baseline 확인: local catalog row count는 실행 시 inventory artifact가 결정하며 문서의 관측값(2026-07-17 로컬 845)은 acceptance 상수가 아니다.
- blocker: inventory checksum drift, unresolved classification, missing source license/freshness, duplicate qualified primary, decision/source fingerprint mismatch, unapproved external write

## Key Rules

- missing은 0이 아니다. 실제 공인 source에 명시된 observed zero만 0이다.
- excluded는 coverage 숫자를 맞추기 위한 우회가 아니며 좁은 비영양 대상에만 사용한다.
- 하나의 ingredient는 전체 preparation state를 통틀어 후속 recipe calculator가 선택할 qualified primary가 정확히 하나여야 한다.
- source/profile/value payload는 append-only이며 correction은 새 version이다.
- API key, auth query, cookie, raw response/row, 절대 private path를 artifact/report에 노출하지 않는다.
- 신규 필수 손질/크기/가식 상태 입력 없이 현재 recipe ingredient 종류·양을 사용한다.

## Primary User Path

1. 운영자가 현재 canonical ingredient inventory를 export해 checksum을 고정한다.
2. 공공 source 후보와 검수 결정을 dry-run하고 애매함/결측/제외 오용을 해결한다.
3. 승인 batch를 적용·재실행한 뒤 coverage report의 `unclassified=0`과 primary uniqueness를 확인한다.
4. 후속 recipe 전수 재계산이 승인된 link만 소비한다.

## Delivery Checklist

- [ ] all-active inventory/checksum 계약과 CLI 고정 <!-- omo:id=delivery-inventory-contract;stage=2;scope=backend;review=3 -->
- [ ] exact-key 후보·검수 decision·strict exclusion 구현 <!-- omo:id=delivery-decision-model;stage=2;scope=backend;review=3 -->
- [ ] atomic apply/replay/report/disable와 production checkpoint guard <!-- omo:id=delivery-batch-lifecycle;stage=2;scope=backend;review=3 -->
- [ ] missing≠0와 source payload/version 불변성 보존 <!-- omo:id=delivery-missing-immutability;stage=2;scope=backend;review=3 -->
- [ ] coverage 4종 zero gate와 전체-state duplicate primary 방지 <!-- omo:id=delivery-coverage-gates;stage=2;scope=backend;review=3 -->
- [ ] fixture와 fresh local Supabase real DB smoke 분리 <!-- omo:id=delivery-real-db-split;stage=2;scope=shared;review=3 -->
- [ ] secret/raw-row/production write 안전선 테스트 <!-- omo:id=delivery-security-boundary;stage=2;scope=backend;review=3 -->
- [ ] Stage 3 독립 reviewer가 exact head와 report를 승인 <!-- omo:id=delivery-independent-review;stage=2;scope=shared;review=3 -->

## Contract Evolution Candidates

- 없음. 사용자 승인 계약은 PR #1026으로 공식 문서에 반영됐고, 이 workpack은 public contract를 확장하지 않는다.
