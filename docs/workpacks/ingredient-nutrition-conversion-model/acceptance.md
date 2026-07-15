# Acceptance Checklist

> 이 문서는 Stage 2 TDD와 Stage 3 독립 검수의 executable contract다. 각 항목은 실제 test/report/RLS/local DB evidence가 생긴 뒤에만 체크한다. 작성자는 Stage 1.5 또는 Stage 3 독립 승인을 대신할 수 없다.

## Happy Path

### Handoff / Command Boundary

- [x] **Given** predecessor status가 `approved_pinned`이고 manifest/checksum이 유효한 bundle, **When** `nutrition:model:import --mode dry-run --pilot-scope foodsafety-30`, **Then** exit 0과 고정 summary schema를 내고 `writes_attempted=0`, `writes_committed=0`이다. <!-- omo:id=accept-valid-handoff-dry-run;stage=2;scope=backend;review=3 -->
- [x] **Given** approved 상태·manifest·checksum 중 하나가 유효하지 않은 bundle, **When** 어느 import mode든 실행, **Then** `INVALID_HANDOFF_BUNDLE`, non-zero exit, DB transaction 시작 전 0 writes다. <!-- omo:id=accept-invalid-handoff;stage=2;scope=backend;review=3 -->
- [x] **Given** `apply`인데 `--approval-file`이 없거나 decision schema가 유효하지 않음, **When** 실행, **Then** `APPROVAL_FILE_REQUIRED`, non-zero exit, 0 writes다. <!-- omo:id=accept-approval-file-required;stage=2;scope=backend;review=3 -->
- [x] **Given** 별도 production approval artifact가 없음, **When** `--mode apply --environment production`, **Then** `PRODUCTION_LOAD_APPROVAL_REQUIRED`로 transaction 전 종료하고 report의 production writes가 0이다. <!-- omo:id=accept-production-zero-write-guard;stage=2;scope=backend;review=3 -->
- [x] **Given** CLI input에 지원하지 않는 mode/scope/environment/flag가 있음, **When** parse, **Then** 명시적 validation error와 non-zero exit를 내고 알 수 없는 값을 무시하지 않으며 0 writes다. <!-- omo:id=accept-cli-invalid-input;stage=2;scope=backend;review=3 -->

## State / Policy

### Schema / Source Lifecycle

- [x] **Given** fresh migration DB, **When** schema를 inspect, **Then** README의 10개 table·FK·CHECK·partial unique index가 `docs/db설계-v1.3.18.md`와 일치한다. <!-- omo:id=accept-schema-contract;stage=2;scope=backend;review=3 -->
- [x] **Given** fresh migration DB, **When** `measurement_conversion_profiles`에 `VOLUME_G6↔6`, `VOLUME_G10↔10`, `VOLUME_G15↔15`, `VOLUME_G20↔20`, `VOLUME_G25↔25`의 5개 대표 profile을 각각 입력, **Then** code allowlist와 code↔weight CHECK를 모두 통과해 commit된다. <!-- omo:id=accept-volume-profile-valid-code-weight-pairs;stage=2;scope=backend;review=3 -->
- [x] **Given** `VOLUME_G6↔25` 같은 교차 조합 또는 임의 code와 허용 weight의 조합, **When** `measurement_conversion_profiles`에 입력, **Then** schema-level code allowlist 또는 code↔weight CHECK가 transaction을 거부한다. <!-- omo:id=accept-volume-profile-invalid-code-weight-pairs;stage=2;scope=backend;review=3 -->
- [x] **Given** 같은 provider/dataset/source version/manifest checksum, **When** source를 두 번 import, **Then** 하나의 logical `nutrition_sources` row/idempotency identity만 존재하고 duplicate write가 없다. <!-- omo:id=accept-source-idempotency;stage=2;scope=backend;review=3 -->
- [x] **Given** checksum 또는 source version drift, **When** import, **Then** 기존 source payload를 덮어쓰지 않고 새 inactive `needs_source_check` row를 만들며 기존 active source를 자동 교체하지 않는다. <!-- omo:id=accept-source-drift;stage=2;scope=backend;review=3 -->
- [x] **Given** source가 `stale|drifted|unknown`, review 미승인, 또는 inactive, **When** candidate generation, **Then** `SOURCE_NOT_CURRENT`로 해당 source를 제외하고 신규 approved/active link를 만들지 않는다. <!-- omo:id=accept-source-freshness-gate;stage=2;scope=backend;review=3 -->
- [x] **Given** approved current 새 source version과 기존 active version, **When** 명시적 supersede decision을 적용, **Then** 한 transaction에서 새 version만 active가 되고 old row는 `superseded_by_id`와 actor/time/reason을 남긴다. <!-- omo:id=accept-source-supersede;stage=2;scope=backend;review=3 -->

### Parser / Normalizer / Missing Versus Zero

- [x] **Given** 원문 기준량·1회 제공량·총내용량·가식부가 모두 있는 source item, **When** normalize, **Then** 네 의미를 별도 field로 보존하고 어느 값도 다른 값을 대신하지 않는다. <!-- omo:id=accept-source-measure-fields;stage=2;scope=backend;review=3 -->
- [x] **Given** 기준량 text를 안전하게 질량으로 parse할 수 있는 ingredient item, **When** profile 생성, **Then** `basis_amount=100`, `basis_unit=g`, `normalization_method=mass_100g`인 immutable version을 만든다. <!-- omo:id=accept-default-100g-profile;stage=2;scope=backend;review=3 -->
- [x] **Given** source가 `100mL` 부피 기준만 제공하고 승인 밀도가 없음, **When** normalize, **Then** `100mL` profile을 유지하고 대표 volume profile 또는 임의 밀도로 `100g`을 만들지 않는다. <!-- omo:id=accept-volume-basis-preserved;stage=2;scope=backend;review=3 -->
- [x] **Given** source nutrient code/unit와 내부 nutrient mapping, **When** normalize, **Then** 내부 `nutrient_code`, canonical unit, 제한된 `source_nutrient_code`, `source_unit`을 함께 보존한다. <!-- omo:id=accept-nutrient-code-unit;stage=2;scope=backend;review=3 -->
- [x] **Given** 원문 숫자 `0`, **When** parse, **Then** `amount=0`, `value_status=observed`이며 missing count에 포함하지 않는다. <!-- omo:id=accept-observed-zero;stage=2;scope=backend;review=3 -->
- [x] **Given** `-`, trace, 빈 문자열, field 부재, parse error, **When** normalize, **Then** 각각 `amount=null`과 `missing|trace|parse_error` 상태를 남기고 숫자 0으로 바꾸지 않는다. <!-- omo:id=accept-missing-not-zero;stage=2;scope=backend;review=3 -->
- [ ] **Given** 음수 영양값, 비호환 unit, edible portion `<=0` 또는 `>100`, **When** normalize, **Then** invalid row를 승인 profile에 넣지 않고 reason count와 non-success disposition을 남긴다. <!-- omo:id=accept-normalizer-invalid-values;stage=2;scope=backend;review=3 -->

### Ingredient Nutrition Candidate / Decision

- [x] **Given** 동일 canonical ingredient에 MFDS와 RDA 10.4 후보가 있고 name/preparation/edible portion/basis가 모두 호환, **When** rank, **Then** MFDS rank 1, RDA rank 2가 되지만 둘 다 `pending`이고 active 0이다. <!-- omo:id=accept-compatible-source-precedence;stage=2;scope=backend;review=3 -->
- [x] **Given** MFDS 후보는 preparation 또는 edible portion이 불일치하고 RDA 10.4 후보는 호환, **When** rank, **Then** MFDS를 priority만으로 선택하지 않고 호환 RDA 후보를 `pending`으로 남긴다. <!-- omo:id=accept-precedence-after-compatibility;stage=2;scope=backend;review=3 -->
- [x] **Given** 같은 rank/score의 호환 영양 후보가 여러 개, **When** candidate generation, **Then** `AMBIGUOUS_NUTRITION_MATCH`, 각 후보 `needs_review`, active primary 0으로 fail-closed한다. <!-- omo:id=accept-ambiguous-nutrition-fail-closed;stage=2;scope=backend;review=3 -->
- [x] **Given** exact name 또는 confidence 1.0인 단일 후보, **When** candidate generation, **Then** 자동 승인하지 않고 `pending`, `is_active=false`로 저장한다. <!-- omo:id=accept-confidence-never-auto-approves;stage=2;scope=backend;review=3 -->
- [x] **Given** pending 후보와 actor/reason이 있는 approve decision, **When** apply, **Then** `approved + is_primary + is_active`가 되고 같은 ingredient/preparation의 active primary는 정확히 하나다. <!-- omo:id=accept-nutrition-approval-activation;stage=2;scope=backend;review=3 -->
- [ ] **Given** pending/needs_review 후보와 reject decision, **When** apply, **Then** immutable candidate를 `rejected` 결정 이력으로 남기고 active primary로 선택하지 않는다. <!-- omo:id=accept-nutrition-rejection-history;stage=2;scope=backend;review=3 -->
- [ ] **Given** 기존 active approved link와 새 replacement approval, **When** apply, **Then** 새 link와 old `superseded` 이력을 한 transaction으로 기록하고 원 source item/profile은 변경하지 않는다. <!-- omo:id=accept-nutrition-replacement-history;stage=2;scope=backend;review=3 -->
- [x] **Given** active approved link, **When** revoke decision을 적용, **Then** `revoked`, inactive가 되고 후속 selector는 그 row를 반환하지 않으며 원 profile/value는 보존한다. <!-- omo:id=accept-revoked-nutrition-link;stage=2;scope=backend;review=3 -->
- [x] **Given** `approved → pending`, `rejected → approved` 직접 변경, actor/reason 없는 승인 등 허용되지 않은 전이, **When** apply, **Then** `INVALID_REVIEW_TRANSITION`과 transaction rollback이다. <!-- omo:id=accept-invalid-nutrition-transition;stage=2;scope=backend;review=3 -->

### Decision Audit Triplet

- [x] **Given** review decision table의 status가 해당 table enum이 허용하는 `approved`, `rejected`, `revoked`, `superseded` 중 하나, **When** row를 INSERT/UPDATE, **Then** `NULLIF(BTRIM(decision_reason), '')` 또는 assignment table의 `NULLIF(BTRIM(assignment_reason), '')`, `reviewed_by`, `reviewed_at`이 모두 값을 가져야 commit된다. <!-- omo:id=accept-decision-audit-triplet-required;stage=2;scope=backend;review=3 -->
- [x] **Given** status가 `pending`, `needs_review`, `needs_source_check`, `self_reported` 중 해당 table enum이 허용하는 값, **When** row를 INSERT/UPDATE, **Then** audit triplet은 nullable이며 `needs_source_check` row의 non-empty drift reason은 보존된다. <!-- omo:id=accept-nondecision-audit-triplet-optional;stage=2;scope=backend;review=3 -->

### Evidence / Representative Profile / Assignment Separation

- [x] **Given** 농진청 계량 evidence, **When** persist, **Then** URL·확인일·subject/preparation·원문 단위/수량·관측 g·정규화 g/15mL·fingerprint만 저장하고 원문 표/문장/행열/이미지/전체 dataset은 저장하지 않는다. <!-- omo:id=accept-limited-measurement-evidence;stage=2;scope=backend;review=3 -->
- [x] **Given** evidence `approved + active`, **When** selector를 실행, **Then** evidence 승인만으로 `ingredient_conversion_assignments` 또는 계산 가능한 active assignment가 생기지 않는다. <!-- omo:id=accept-evidence-not-assignment;stage=2;scope=backend;review=3 -->
- [x] **Given** `20.6g/15mL` 또는 `21.0g/15mL` evidence, **When** nearest candidate 계산, **Then** 원문 evidence 값은 그대로 유지하고 `VOLUME_G20`만 각각 distance `0.6`, `1.0`의 pending 후보이며 active 0이다. <!-- omo:id=accept-practical-g20-candidates;stage=2;scope=backend;review=3 -->
- [x] **Given** approved `VOLUME_G20` assignment, **When** 후속 selector가 반환, **Then** evidence observed value, representative `20g/15mL`, `display_qualifier=approximate`, review/source status를 서로 다른 field로 구분한다. <!-- omo:id=accept-approximate-profile-projection;stage=2;scope=backend;review=3 -->

### Nearest Profile Boundary / Tie

- [x] **Given** unique nearest distance가 정확히 `2.5g/15mL`, **When** candidate generation, **Then** threshold 포함으로 pending 후보를 만들되 자동 승인/active 전환하지 않는다. <!-- omo:id=accept-nearest-boundary-inclusive;stage=2;scope=backend;review=3 -->
- [x] **Given** unique nearest distance `2.5001g/15mL`, **When** candidate generation, **Then** assignment row를 만들지 않고 `NO_PROFILE_WITHIN_DISTANCE`, active 0을 report한다. <!-- omo:id=accept-nearest-boundary-exceeded;stage=2;scope=backend;review=3 -->
- [x] **Given** `17.5g/15mL`, **When** nearest calculation, **Then** `VOLUME_G15`와 `VOLUME_G20`이 각각 distance 2.5, 같은 rank의 `needs_review`, inactive이고 하나를 선택하지 않는다. <!-- omo:id=accept-exact-halfway-tie-15-20;stage=2;scope=backend;review=3 -->
- [x] **Given** `22.5g/15mL`, **When** nearest calculation, **Then** `VOLUME_G20`과 `VOLUME_G25` 동률을 `TIED_CONVERSION_PROFILE`로 report하고 active 0이다. <!-- omo:id=accept-exact-halfway-tie-20-25;stage=2;scope=backend;review=3 -->
- [x] **Given** 형태/preparation이 evidence와 ingredient candidate 사이에 불명확, **When** nearest distance가 범위 안이어도, **Then** `needs_review`이며 자동 승인하지 않는다. <!-- omo:id=accept-conversion-form-ambiguity;stage=2;scope=backend;review=3 -->
- [x] **Given** unique pending conversion candidate와 actor/reason approve decision, **When** apply, **Then** active approved assignment 하나만 존재하고 계산 selector는 그 profile version만 반환한다. <!-- omo:id=accept-conversion-approval-activation;stage=2;scope=backend;review=3 -->
- [x] **Given** active approved assignment, **When** revoke/disable decision, **Then** assignment는 inactive `revoked`가 되고 selector는 이를 사용하지 않으며 evidence/profile은 삭제되지 않는다. <!-- omo:id=accept-revoked-conversion-assignment;stage=2;scope=backend;review=3 -->

### Unit Contract / Piece Fail-Closed

- [x] **Given** tbsp/tsp/cup/mL/L quantity, **When** volume normalize, **Then** `1큰술=15mL`, `1작은술=5mL`, `1컵=200mL`, `1000mL=1L`로 결정론적으로 변환한다. <!-- omo:id=accept-volume-unit-normalization;stage=2;scope=backend;review=3 -->
- [x] **Given** exact ingredient+size+preparation/edible-state active approved piece row, **When** `개→g`, **Then** `piece_count × weight_g`만 반환하고 volume profile을 사용하지 않는다. <!-- omo:id=accept-approved-piece-conversion;stage=2;scope=backend;review=3 -->
- [x] **Given** size 누락, 다른 size/preparation, evidence 부재, pending/rejected/revoked/superseded piece row, **When** `개→g`, **Then** `PIECE_WEIGHT_REQUIRED`, gram result 없음, DB write 없음이다. <!-- omo:id=accept-unsupported-piece-conversion;stage=2;scope=backend;review=3 -->
- [x] **Given** category 평균 또는 범용 piece fallback 설정 시도, **When** validate, **Then** 이를 거부하고 `개`를 `VOLUME_G*` profile에 넣지 않는다. <!-- omo:id=accept-no-generic-piece-fallback;stage=2;scope=backend;review=3 -->

## Data Integrity

### Idempotence / Failure / Retry / Report

- [x] **Given** 동일 bundle checksum, scope, decision checksum, schema version, **When** dry-run을 반복, **Then** 동일 idempotency key, row ordering, candidate/decision counts, content hash를 만들고 timestamp/path는 identity에 포함하지 않는다. <!-- omo:id=accept-dry-run-determinism;stage=2;scope=backend;review=3 -->
- [x] **Given** 이미 성공한 local/staging apply와 동일 input/decision, **When** 재실행, **Then** duplicate rows/versions/active pointers가 생기지 않고 `writes_committed=0`인 idempotent replay report를 낸다. <!-- omo:id=accept-apply-idempotency;stage=2;scope=backend;review=3 -->
- [x] **Given** transaction 중 FK/CHECK/decision conflict, **When** apply 실패, **Then** 모든 row/active pointer가 rollback되고 non-zero exit 및 reason count가 남는다. <!-- omo:id=accept-atomic-import-rollback;stage=2;scope=backend;review=3 -->
- [x] **Given** 실패 후 같은 수정된 유효 input으로 재시도, **When** apply, **Then** 실패 run과 새 run을 구분하고 partial residue 없이 한 번만 commit한다. <!-- omo:id=accept-failure-retry;stage=2;scope=backend;review=3 -->
- [x] **Given** 성공/실패/dry-run/disable run id, **When** `nutrition:model:report`, **Then** README의 필수 summary field와 source/decision/count/write/rollback audit를 machine-readable하게 반환한다. <!-- omo:id=accept-run-report-contract;stage=2;scope=backend;review=3 -->
- [x] **Given** report registry가 없거나 checksum/affected row ID가 변조됨, **When** report 또는 disable, **Then** `INVALID_RUN_REPORT`, non-zero exit, 0 DB writes이며 임의 row를 추정하지 않는다. <!-- omo:id=accept-run-report-integrity;stage=2;scope=backend;review=3 -->
- [x] **Given** approved run과 explicit disable decision, **When** `nutrition:model:disable`, **Then** payload DELETE 없이 해당 active link/assignment/piece rows를 revoke/supersede하고 재실행은 멱등하다. <!-- omo:id=accept-disable-rollback-boundary;stage=2;scope=backend;review=3 -->
- [x] **Given** manual override가 source/profile/evidence의 observed payload를 직접 UPDATE하려 함, **When** apply, **Then** 거부하고 새 version/candidate/decision 경로만 허용한다. <!-- omo:id=accept-manual-override-append-only;stage=2;scope=backend;review=3 -->

### Pilot 30 Scope

- [x] **Given** `20260626104000_seed_foodsafety_pilot_recipes.sql`, **When** scope resolve, **Then** unique recipe ID가 정확히 30이고 report `scope_recipe_count=30`이다. <!-- omo:id=accept-pilot-exact-thirty;stage=2;scope=backend;review=3 -->
- [x] **Given** pilot recipe ingredients, **When** canonical closure를 계산, **Then** 그 30개 recipe가 참조하는 canonical ingredient만 대상이며 unrelated ingredient/source item은 candidate/apply count에 포함되지 않는다. <!-- omo:id=accept-pilot-ingredient-closure;stage=2;scope=backend;review=3 -->
- [x] **Given** recipe 29/31개, unknown recipe ID, closure 밖 ingredient를 포함한 scope, **When** import, **Then** `PILOT_SCOPE_MISMATCH`, non-zero exit, 0 writes다. <!-- omo:id=accept-pilot-scope-mismatch;stage=2;scope=backend;review=3 -->

## Error / Permission

### Permission / RLS / Immutability

- [x] **Given** `anon`, **When** raw/source/item/profile/value/evidence/candidate/decision table SELECT/INSERT/UPDATE/DELETE, **Then** 모두 거부된다. <!-- omo:id=accept-anon-rls-denial;stage=2;scope=backend;review=3 -->
- [x] **Given** 일반 `authenticated` user, **When** 같은 operation, **Then** approved row를 포함해 직접 접근/수정/삭제가 거부된다. <!-- omo:id=accept-authenticated-rls-denial;stage=2;scope=backend;review=3 -->
- [ ] **Given** 기존 `admin_members` viewer만 가진 user, **When** 검수 write, **Then** operator capability로 승격되지 않고 거부된다. <!-- omo:id=accept-admin-viewer-no-write;stage=2;scope=backend;review=3 -->
- [x] **Given** service-role/operator command, **When** actor/reason 없는 approve/reject/revoke/supersede, **Then** 거부하고 audit 빈칸을 허용하지 않는다. <!-- omo:id=accept-audit-actor-reason-required;stage=2;scope=backend;review=3 -->
- [x] **Given** approved source/profile/value/evidence payload, **When** UPDATE/DELETE 시도, **Then** 허용된 decision/active/superseded field 외 변경은 거부되고 correction은 새 version으로만 가능하다. <!-- omo:id=accept-payload-immutability;stage=2;scope=backend;review=3 -->
- [x] **Given** 같은 ingredient/preparation에 두 active approved primary nutrition links 또는 volume assignments, **When** commit, **Then** partial unique 제약이 transaction을 거부한다. <!-- omo:id=accept-active-uniqueness;stage=2;scope=backend;review=3 -->

### Secret / Raw / Copyright Boundary

- [x] **Given** `DATA_GO_KR_API_KEY1`, `DATA_GO_KR_API_KEY`, `serviceKey` auth query, cookie/token-like value가 input/error에 포함, **When** command가 처리, **Then** `SECRET_OR_RAW_DATA_LEAK`, artifact 폐기, log/report/DB에 실제 값 0건, DB writes 0이다. <!-- omo:id=accept-secret-auth-query-leak-zero;stage=2;scope=backend;review=3 -->
- [x] **Given** raw provider response/원문 row/전체 양념 계량표/페이지 이미지 fixture 또는 DB 저장 시도, **When** boundary scan, **Then** fail-closed하며 제한 evidence field 외 content를 commit하지 않는다. <!-- omo:id=accept-raw-row-republication-block;stage=2;scope=backend;review=3 -->
- [x] **Given** report/PR-safe output, **When** leak scan, **Then** `secret_leak_count=0`이고 private absolute path, key, auth query, raw payload/row가 없다. <!-- omo:id=accept-report-leak-scan;stage=2;scope=backend;review=3 -->
- [x] **Given** 농진청 계량 evidence, **When** license disposition이 미확정 또는 `human_review_required`, **Then** 자유이용/저작권 보유를 주장하지 않고 production assignment 승인 근거로 단독 승격하지 않는다. <!-- omo:id=accept-measurement-license-fail-closed;stage=2;scope=backend;review=3 -->

## Data Setup / Preconditions

- [x] **Given** synthetic fixture suite, **When** tests 실행, **Then** 실제 key/raw row 없이 MFDS/RDA 호환·불일치, missing/zero, 2.5/tie, piece, drift, failure cases를 모두 재현한다. <!-- omo:id=accept-fixture-baseline;stage=2;scope=backend;review=3 -->
- [ ] **Given** local Supabase reset, **When** migration 적용, **Then** 10개 table seed/profile 제약/RLS/index가 깨끗하게 생성되고 repeat reset이 성공한다. <!-- omo:id=accept-local-db-bootstrap;stage=2;scope=backend;review=3 -->
- [x] **Given** local DB pilot flow, **When** dry-run → explicit approved apply → duplicate replay → report → disable 순서로 실행, **Then** 각 count/write/active/audit 상태가 이 acceptance와 일치한다. <!-- omo:id=accept-local-db-smoke;stage=2;scope=backend;review=3 -->
- [x] **Given** 이번 BE-only slice, **When** closeout, **Then** frontend route/component/API public contract가 변하지 않았고 Design/Accessibility/Playwright가 근거 있는 N/A다. <!-- omo:id=accept-be-only-boundary;stage=2;scope=shared;review=3 -->

## Automation Split

### TDD RED List

Stage 2는 아래 test를 구현보다 먼저 추가하고, 각 항목이 예상 failure message로 RED임을 기록한다.

- [x] parser/normalizer: 원문 기준·serving·total·edible portion 분리 및 100g/100mL normalize RED <!-- omo:id=red-parser-normalizer;stage=2;scope=backend;review=3 -->
- [x] missing vs zero: observed 0과 missing/trace/parse error 분리 RED <!-- omo:id=red-missing-zero;stage=2;scope=backend;review=3 -->
- [x] idempotence: 동일 dry-run/apply/disable replay의 duplicate write 0 RED <!-- omo:id=red-idempotence;stage=2;scope=backend;review=3 -->
- [x] source precedence: compatibility filter 후 MFDS 1/RDA 2 RED <!-- omo:id=red-source-precedence;stage=2;scope=backend;review=3 -->
- [x] ambiguous match: 자동 승인 없이 `AMBIGUOUS_NUTRITION_MATCH` RED <!-- omo:id=red-ambiguous-match;stage=2;scope=backend;review=3 -->
- [x] nearest boundary: exactly 2.5 포함, 2.5001 초과 거부 RED <!-- omo:id=red-nearest-boundary;stage=2;scope=backend;review=3 -->
- [x] exactly halfway tie: 17.5와 22.5 동률 fail-closed RED <!-- omo:id=red-halfway-tie;stage=2;scope=backend;review=3 -->
- [x] approval activation: pending은 inactive, explicit approve만 active RED <!-- omo:id=red-approval-activation;stage=2;scope=backend;review=3 -->
- [x] revoked assignment: revoked nutrition/conversion/piece row selector 제외 RED <!-- omo:id=red-revoked-assignment;stage=2;scope=backend;review=3 -->
- [x] unsupported piece: exact approved row 없으면 `PIECE_WEIGHT_REQUIRED` RED <!-- omo:id=red-unsupported-piece;stage=2;scope=backend;review=3 -->
- [x] leak prevention: secret/auth query/raw payload/raw row artifact 0 RED <!-- omo:id=red-leak-prevention;stage=2;scope=backend;review=3 -->
- [x] dry-run: 모든 성공/실패 path writes 0 RED <!-- omo:id=red-dry-run-zero-write;stage=2;scope=backend;review=3 -->
- [x] pilot scope: exact 30/closure만 허용, 29/31/외부 ingredient 거부 RED <!-- omo:id=red-pilot-thirty;stage=2;scope=backend;review=3 -->

## Manual QA

- verifier: Stage 2 구현자와 다른 Codex Stage 3 reviewer
- environment: local Supabase only; actual secret/env access 없음
- scenarios: migration/reset, dry-run, local approved apply, duplicate replay, RLS denial, revoke/disable, report/leak scan

### Manual Only

- [ ] 별도 Codex Stage 1.5 reviewer가 이 문서 계약을 승인한다.
- [ ] 사람이 nutrition candidate의 승인/거절/대체 decision과 reason을 작성한다.
- [ ] 사람이 measurement evidence의 license disposition과 conversion assignment를 승인/거절한다.
- [ ] 사람이 재료·크기·손질/가식부별 piece weight를 승인/거절한다.
- [ ] production load는 별도 운영 승인 전 실행하지 않으며 현재 증거는 `0 writes`다.
- [ ] production 승인 이후 실제 실행·rollback rehearsal은 후속 운영 기록으로 남긴다.
