# Slice: ingredient-nutrition-conversion-model

## 2026-07-22 Final Held Items Follow-up

- 사용자 후속 검수로 무염버터와 크림치즈는 현재값 유지, 그릭 요거트와 통밀 식빵은 컬리 식재료 영양정보 100g 기준 사용자 지정 출처로 확정했다. 컬리 페이지에 없는 포화지방·나트륨은 0으로 추정하지 않고 `missing`으로 보존한다.
- 최신 결과는 `공식 후보 승인 79`, `사용자 지정 출처 6`, `현재값 유지 9`, `보류 1`이다. report checksum은 `0007c08eb63e62cf144a5708165e419b4d6682801adf1d375eba35a5e0d3cec1`, apply payload checksum은 `79eac06a2b227a00075f839b3412364976cc60c49cd67b85e801f361f4977882`다.
- 변경된 payload apply는 기존 83개 승인 profile을 다시 versioning하지 않고 재사용했으며 새 profile 2개만 추가했다. 첫 실행은 `writes_committed=25`, 동일 payload replay는 `writes_committed=0`, `replayed=true`, remote/production write는 0이다.
- 공개 레시피 43개를 다시 계산해 그릭 요거트·통밀 식빵을 함께 쓰는 레시피 snapshot 1건만 갱신했다. 계산 상태는 `complete=16`, `partial=23`, `unavailable=4`, conflict/multiple/unclassified는 모두 0이다.
- 남은 보류 1건은 연어오븐구이에서 50g을 사용하는 `화이트크림`이다. 식재료 삭제는 해당 레시피 재료와 조리 단계의 대체·삭제 결정을 먼저 확정해야 하므로 이번 follow-up에서는 삭제하지 않았다.

## 2026-07-22 User Review Apply Evidence

- 사용자 검수 95건을 `공식 후보 승인 79`, `사용자 지정 출처 4`, `현재값 유지 7`, `제품별 영양 버전 설계까지 보류 5`로 확정했다. 최종 report checksum은 `807e2dc33da9fb57c10725480b78b7ebeed531645522da2a7457b5dbbb7b1026`, apply payload checksum은 `b18dda3a98b6c8142241b09060559461c89906916d30af8f80688540b188f066`이다.
- 사용자 지정 4건은 모시조개(기존값 + 나트륨 `557mg/100g`), 새송이버섯(식약처 `P116-702070100-0427`, `100g`), 오렌지 껍질(LogiFoodCoach 오렌지 제스트, `100g`), 오렌지즙(돈시몬 제품 표시값, `100mL`)이다. 오렌지즙은 승인 밀도 없이 `100g`으로 바꾸지 않았다.
- 모시조개는 이번 사용자 명시 승인에 한해서 기존 식약처 profile과 네이버 지식백과 나트륨을 결합한 새 immutable review profile을 만들었다. 원 profile/value는 수정하지 않았고 두 출처와 결합 사유를 item provenance에 남겼다. 이 예외는 일반적인 nutrient field 자동 혼합을 허용하지 않는다.
- 로컬 apply는 83개를 반영해 기존 link 81개를 append-only `superseded` 이력으로 남기고 profile이 없던 2개를 새로 연결했다. 첫 실행은 `writes_committed=1150`, 동일 payload replay는 `writes_committed=0`, `replayed=true`, remote/production write는 0이다.
- 적용 대상 83개 모두 `as_published` active approved primary가 정확히 1개이며 누락 0, 복수 0이다. 전체 active primary 중복도 0이다.
- 공개 레시피 43개 snapshot을 새 profile 기준으로 재계산했다. dry-run conflict/multiple/unclassified는 모두 0이었고 apply는 snapshot 40건을 갱신했다(`complete=16`, `partial=23`, `unavailable=4`). 남은 불완전 계산은 보류 제품, piece weight, 미지원 단위 같은 별도 후속 항목이다.
- 원본 후보 report/사용자 검수 입력은 같은 폴더의 `homecook-nutrition-candidate-report.source.json`과 `homecook-nutrition-candidate-review.source.json`으로 불변 보존한다. 최종 검수 HTML은 `homecook-nutrition-final-review.html`, 최종 report/decision은 `homecook-nutrition-final-review.json`과 `homecook-nutrition-final-review-decisions.json`, machine-readable apply 결과는 `homecook-nutrition-review-apply.json`과 `homecook-nutrition-review-apply-result.json`이다.
- 검수 재생성은 `pnpm nutrition:review:finalize`, 로컬 DB 반영은 명시적 플래그와 환경 승인을 함께 둔 `HOMECOOK_NUTRITION_REVIEW_WRITE_APPROVED=1 pnpm nutrition:review:apply -- --allow-write`만 허용한다. source snapshot이 없는 clean checkout에서도 저장된 apply payload로 같은 결과를 재적용할 수 있다.

## 2026-07-21 Official Source Candidate Checkpoint Evidence

- 로컬 current snapshot에서 `partial_nutrient=90`, `missing_profile=5`, target `95`를 checksum `99c4104dab6c1b7e14488c197a21452c39810eb2e5e9f8709aeb1e23d554d34f`로 고정했다.
- `.env.local` 기본 공공데이터 키는 redacted smoke에서 HTTP 403이었지만 기존 보조 키가 MFDS `15127578`과 통합 원재료 `15100065` 모두 provider `00`으로 인증됐다. secret 값은 artifact/HTML/report에 저장하지 않았다.
- 농촌진흥청 공식 `식품성분표(10개정판).xlsx`는 `13,348,408 bytes`, SHA-256 `271cc431f2991b3c0c049ec6e05fb59a040319e984ab71468184530de61dec50`, 3,366행 pin과 일치했다. optional 3종을 포함해 3,206행을 정규화하고 160행은 원문 결측/비정상 token 규칙으로 quarantine했다.
- 공공데이터포털 통합 원재료 `15100065`는 3,704행을 수집해 3,701행 정규화, 3행 quarantine했으며 `srcNm`의 국립수산과학원 provenance를 보존했다.
- 식약처 제품 DB는 profile 없음 5개와 1차 exact 후보 없음 재료를 이름별 제한 query로만 보완했다. `물`처럼 범위가 과도한 query는 1,000행 cap에서 incomplete로 fail closed했고 부분 batch를 후보로 쓰지 않았다.
- 최종 검수 report는 95개를 `needs_review=85`, `keep_current=5`, `no_compatible_source=5`, `approved_replacement=0`, `unclassified=0`으로 분류했다. report checksum은 `e725345adc67119b60d021b60df81d4bf2d9d6f33f3a9654495fbdefabfbd88f`이고 이 checkpoint의 DB write는 0이다.
- 이 시점의 원본 machine-readable report는 `outputs/nutrition-review-20260721/homecook-nutrition-candidate-report.source.json`으로 보존한다. 승인 결과가 오기 전 local apply, snapshot backfill, mixed-display API/UI 구현은 시작하지 않는다.

## 2026-07-21 Official Nutrient Gap Enrichment Follow-up

- 최신 local review의 일부 결측 90개와 profile 없음 5개를 고정 inventory로 export한 뒤 official source candidate를 만든다.
- RDA 10.4는 공식 workbook의 optional nutrient column을 schema/unit 검증 후 수집하고, 수산물은 K-FIND 통합 파일의 NIFS 원기관 provenance를 우선 검토한다.
- 서로 다른 source의 nutrient field를 기존 profile에 섞지 않고 더 완전한 단일 source row의 immutable profile replacement만 허용한다.
- candidate HTML의 explicit review 전 write 0, 승인 후 local append-only apply + atomic supersede, remote write 0을 유지한다.

## 2026-07-21 Approved Consumer Correction

- recipe nutrition consumer는 active approved assignment가 연결한 active approved `measurement_source_evidence.normalized_g_per_15ml`을 계산값으로 직접 사용한다.
- `measurement_conversion_profiles`와 기존 `VOLUME_G*` row는 감사·과거 import 호환을 위해 보존하지만 신규 recipe 계산값을 결정하지 않는다.
- 실측값이 없거나 비정상·미승인·stale·복수 경로이면 임의의 1g/대표 등급으로 보충하지 않는다.
- 이 보정은 schema/table/public API를 늘리지 않으며 아래 최초 slice 기록의 대표 profile 후보 생성 acceptance를 소급 삭제하지 않는다.

## Goal

`public-nutrition-source-acquisition`이 만든 approved/pinned bundle을 재료에 안전하게 연결할 수 있도록 영양 source/item/profile/value, 재료 매칭 후보, 계량 evidence, 대표 환산 profile/assignment, 개당 중량의 DB·import·검수 계약을 구현한다. 공공 원문 관측, 서비스의 실용 대표값, 개별 재료의 승인 결정을 분리해 원문을 덮어쓰지 않고, 오직 active approved row만 후속 슬라이스가 소비하게 한다.

이 슬라이스는 data model과 internal/admin import·검수 경계에서 끝난다. 레시피 영양 계산/표시, 완제품, 플래너, 신규 public API/UI는 만들지 않는다.

## Branches

- 문서: `docs/ingredient-nutrition-conversion-model`
- 백엔드/데이터 모델: `feature/be-ingredient-nutrition-conversion-model`
- 프론트엔드: N/A — 화면·route·client state가 없는 BE/data-model slice

## In Scope

- 화면: 없음
- public API: 신규 endpoint/field/response/error 없음
- internal/admin import command:
  - `pnpm nutrition:model:import -- --bundle <approved-pinned-bundle> --mode dry-run --pilot-scope foodsafety-30`
  - `pnpm nutrition:model:import -- --bundle <approved-pinned-bundle> --mode apply --pilot-scope foodsafety-30 --approval-file <review-decisions.json> --environment <local|staging|production>`
  - `pnpm nutrition:model:report -- --run-id <run-id>`
  - `pnpm nutrition:model:disable -- --run-id <run-id> --approval-file <disable-decision.json> --environment <local|staging|production>`
- DB migration target:
  - `nutrient_definitions`
  - `nutrition_sources`
  - `nutrition_source_items`
  - `nutrition_profiles`
  - `nutrition_values`
  - `ingredient_nutrition_profiles`
  - `measurement_conversion_profiles`
  - `measurement_source_evidence`
  - `ingredient_conversion_assignments`
  - `piece_unit_weights`
- import run의 source version/freshness/checksum, row count, candidate/decision count, write count, idempotency key, 실패 사유, rollback/disable 결과를 machine-readable report로 남김
- FoodSafety pilot 30개 레시피와 그 canonical ingredient closure 안에서만 dry-run/apply 검증
- Schema Change:
  - [ ] 없음
  - [x] 있음 → `supabase/migrations/<timestamp>_add_ingredient_nutrition_conversion_model.sql` 생성 필요

## Out of Scope

- RECIPE_DETAIL 영양 계산·카드·`약/예상` UI, recipe nutrition snapshot
- 완제품 catalog/nutrition version, product planner entry, 끼니·날짜·주간 합계
- public endpoint, response field, route, client component, Playwright 사용자 흐름
- 외부 provider fetch/pagination/key smoke 재구현. 이는 merged predecessor가 소유한다.
- cron·자동 source refresh·무인 production promotion
- 원문 계량표 전체 scraping/복제/재배포, raw provider response·원문 row의 DB 저장
- 정확 화학 밀도·조리 손실·흡수율 추정
- 이름·category·confidence·source rank만으로 영양 link나 환산 assignment 자동 승인
- 범용 `개→g`, 크기·손질/가식부 상태가 없는 piece weight 추정
- production load 승인·실행. 별도 운영 승인 전 production write는 0이다.

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `public-nutrition-source-acquisition` | merged — PR #995, merge `f87ae75016a9b709ffc3b706e7ca3720a0940982` | [x] |
| 영양 공식 계약 기준선 | `요구사항 v1.7.17`, `화면정의서 v1.5.23`, `DB v1.3.18`, API/UI/Flow unchanged | [x] |
| FoodSafety pilot 30 seed | `20260626104000_seed_foodsafety_pilot_recipes.sql` | [x] |
| 별도 Codex Stage 1.5 독립 검수 | PR #999 merge로 승인 계약 반영 | [x] |

> predecessor의 workpack 기록은 소급 수정하지 않는다. PR #995의 merge commit `f87ae75016a9b709ffc3b706e7ca3720a0940982`는 이 slice base `7543b9e06659b9f3e34ffea7e3314065412a1a82`의 ancestry에 포함되며, 위 exact dependency pin이 approved/pinned handoff 계약의 merge를 증명한다.

## Backend First Contract

### Public Contract

- public API/UI 계약 변화는 없다.
- 기존 `{ success, data, error }`와 `{ code, message, fields[] }` shape는 손대지 않는다.
- 후속 public consumer가 필요하면 별도 slice/contract-evolution에서 approved 최소 projection을 정의한다.
- raw/source item/evidence/candidate/admin decision은 브라우저와 일반 사용자에게 직접 노출하지 않는다.

### Internal/Admin Import Contract

`nutrition:model:import`는 merged predecessor의 approved/pinned bundle과 explicit review decision file만 입력으로 받는다. provider URL 호출, API key 조회, production credential 접근을 하지 않는다.

- request/input 경계: approved/pinned bundle, `foodsafety-30` scope, mode/environment, 명시적 review 또는 disable decision만 받는다.
- output 경계: 성공/실패 모두 아래 고정 machine-readable summary와 sanitized report registry만 남긴다.
- error 경계: `Failure And Reason Codes`의 fail-closed code와 non-zero exit를 사용하며 실패 transaction은 전부 rollback한다.
- permission 경계: `Permission / RLS`의 service-role/operator capability와 actor/reason 요구를 적용한다.
- idempotency 경계: 같은 input/decision은 같은 idempotency key와 candidate set을 만들고 duplicate DB write를 만들지 않는다.

| mode | 필수 입력 | 허용 write | 성공 조건 |
| --- | --- | --- | --- |
| `dry-run` | bundle, `foodsafety-30` scope | 항상 0 | 전체 parse/normalize/match/candidate/approval simulation과 report 생성 |
| `apply local|staging` | bundle, scope, explicit approval file | 단일 transaction의 승인된 row만 | schema·scope·freshness·decision·secret gate 통과, report count와 committed count 일치 |
| `apply production` | 위 입력 + 별도 production approval artifact | 이번 slice 기본값 0 | 승인 artifact가 없으면 transaction 시작 전 `PRODUCTION_LOAD_APPROVAL_REQUIRED` |
| `disable` | run id, explicit disable decision | active pointer/decision audit만 | payload DELETE/UPDATE 없이 승인 row를 revoke/supersede하고 후속 선택에서 제외 |

모든 명령은 성공/실패 모두 machine-readable summary를 출력하고 실패 시 non-zero exit code를 반환한다. summary 최소 field:

- `run_id`, `mode`, `environment`, `pilot_scope`
- `input_checksum`, `source_versions[]`, `freshness_statuses[]`, `idempotency_key`
- `scope_recipe_count`(항상 30), `scope_ingredient_count`
- `source_item_count`, `profile_count`, `nutrient_value_count`, `missing_value_count`, `zero_value_count`
- `nutrition_candidate_count`, `conversion_candidate_count`, `piece_candidate_count`
- `approved_count`, `rejected_count`, `needs_review_count`, `revoked_count`, `superseded_count`
- `writes_attempted`, `writes_committed`, `secret_leak_count`
- `reason_counts`, `report_artifact`, `rollback_artifact`

report에는 key, 인증 query, raw payload, 원문 row, 전체 계량표, private filesystem 절대 경로를 넣지 않는다.

- `writes_attempted/writes_committed`는 DB write count다. dry-run도 sanitized report artifact를 만들 수 있다.
- report registry는 gitignored `.artifacts/ops/ingredient-nutrition-conversion-model/<run-id>/`에 sanitized summary, input/decision checksum, affected immutable row ID만 불변 보존한다. raw bundle/row와 secret은 복사하지 않는다.
- `nutrition:model:report`와 `nutrition:model:disable`은 이 registry의 checksum을 검증한다. report 누락·변조·row ID 불일치는 `INVALID_RUN_REPORT`, 0 DB writes로 실패한다.

## Data Model Responsibilities

| 책임 | canonical table | 불변 경계 |
| --- | --- | --- |
| source/version/license/freshness | `nutrition_sources` | drift는 새 inactive version; MFDS rank 1, RDA 10.4 rank 2는 호환 후보에만 적용 |
| source food와 원문 기준 | `nutrition_source_items` | 기준량·1회 제공량·총내용량·가식부를 분리 보존; raw row 금지 |
| normalize 기준 | `nutrition_profiles` | 안전한 질량 normalize는 기본 `100g`; 부피-only는 `100mL`; 새 version으로 정정 |
| nutrient value | `nutrition_values` | source code/unit 보존; observed 0과 missing/trace/parse error 분리 |
| 재료↔영양 후보/결정 | `ingredient_nutrition_profiles` | 여러 후보와 approve/reject/revoke/supersede 이력; active approved primary 하나 |
| 서비스 대표 환산 | `measurement_conversion_profiles` | 15mL당 `6/10/15/20/25g`, `approximate`; source 관측과 별도 |
| 공공 원문 계량 근거 | `measurement_source_evidence` | URL/확인일/원문 단위·값/정규화 사실만 제한 보존; 승인해도 assignment 미활성 |
| 재료별 부피 환산 결정 | `ingredient_conversion_assignments` | 후보/사람 승인/거절/철회/대체 이력; active approved 하나 |
| 재료별 `개→g` | `piece_unit_weights` | ingredient+size+preparation/edible state 일치 active approved만 사용 |

## Matching And Review Contract

### Ingredient Nutrition

1. source item과 canonical ingredient의 normalized name/synonym, preparation state, edible portion, basis 호환성을 계산한다.
2. 호환되지 않는 후보는 rank 대상에서 제외하고 reason code를 남긴다.
3. 호환 후보 안에서 MFDS `priority_rank=1`, RDA 10.4 `priority_rank=2`를 적용한다.
4. 한 후보가 높게 평가되어도 `pending`; ambiguity는 `needs_review`다.
5. 사람 decision만 `approved/rejected`로 전이하며 기존 active row 대체는 새 row + supersede transaction으로 수행한다.
6. `approved AND is_active AND is_primary`만 후속 소비 대상이다.

### Volume To Gram

- 단위 normalize: `1큰술=15mL`, `1작은술=5mL`, 국내 조리용 `1컵=200mL`; `mL/L`는 같은 차원 안에서 정확 변환한다.
- candidate distance: `abs(evidence.normalized_g_per_15ml - profile.representative_weight_g)`.
- 최소 거리가 `<=2.5`인 unique profile만 `pending` 후보가 된다.
- 정확히 같은 최소 거리의 profile이 둘 이상이면 모두 `needs_review`, `is_active=false`; 자동 선택은 없다.
- 최소 거리가 `>2.5`이면 assignment row 없이 `NO_PROFILE_WITHIN_DISTANCE`를 report한다.
- `20.6g/15mL`, `21.0g/15mL`은 각각 `VOLUME_G20` 후보가 될 수 있으나, evidence 값은 그대로이고 승인 전 계산에는 쓰지 않는다.
- approved assignment의 후속 표시 성격은 `estimated`/`approximate`; 실제 UI는 후속 slice가 소유한다.

### Piece To Gram

- volume profile과 piece weight는 별도 경로다.
- `개`는 `ingredient_id + size_code + preparation_state`와 `piece_weight` evidence가 일치하는 active approved row가 있을 때만 g으로 계산한다.
- `size_code` 누락, evidence 부재, pending/rejected/revoked/superseded row는 모두 `PIECE_WEIGHT_REQUIRED`이며 범용 평균을 쓰지 않는다.

## State And Audit Contract

- candidate decision: `pending|needs_review → approved|rejected`; `approved → revoked|superseded`만 허용한다.
- source/profile/evidence payload와 영양값은 append-only다. correction은 새 version/row를 만들고 old row를 supersede한다.
- active pointer 교체는 단일 transaction이며 한 ingredient/preparation에 active approved primary nutrition link 및 active approved volume assignment가 각각 최대 하나다.
- confidence는 `0..1` advisory field이며 state transition을 일으키지 않는다.
- `nutrition_sources`, `nutrition_source_items`, `nutrition_profiles`, `ingredient_nutrition_profiles`, `measurement_source_evidence`, `ingredient_conversion_assignments`, `piece_unit_weights`는 각 table이 허용하는 `approved/rejected/revoked/superseded` 결정 상태에서 공백이 아닌 reason, `reviewed_by`, `reviewed_at`을 모두 남긴다. conversion assignment의 reason column은 `assignment_reason`이고 나머지는 `decision_reason`이다.
- `pending`, `needs_review`, `needs_source_check`, `self_reported`는 audit triplet 필수 상태가 아니다. 이 상태들의 triplet에 NULL을 강제하지 않으며 `needs_source_check` drift reason을 보존한다.
- disable/rollback은 payload를 삭제하지 않고 active pointer와 revoke/supersede audit만 바꾼다.
- failed transaction은 전부 rollback하고 동일 input 재시도는 같은 idempotency key와 candidate set을 만든다.

## Source Freshness And Priority

- MFDS 식품영양성분 DB `15127578`: ingredient nutrition 후보 우선순위 1.
- 농촌진흥청 국가표준식품성분 DB `10.4(2026)`: 후보 우선순위 2.
- 이 순위는 source acquisition의 수집/이용조건 판단을 소급 변경하지 않고, 이 slice의 ingredient linking 후보 결정에만 적용한다.
- `current + approved + is_active` source만 신규 후보를 만든다.
- checksum/version/license/freshness drift는 새 inactive `needs_source_check` version을 만들고 기존 active source를 자동 교체하지 않는다.
- 농촌진흥청 양념재료 계량표는 자동 feed가 아니라 초기 후보 제안과 사람 검수 evidence다. 공개 페이지라는 사실만으로 자유 재배포 권리를 주장하지 않는다.

## Failure And Reason Codes

| code | 조건 | write/상태 |
| --- | --- | --- |
| `INVALID_HANDOFF_BUNDLE` | predecessor schema/checksum/approved state 불일치 | 0 writes |
| `PILOT_SCOPE_MISMATCH` | recipe count가 30이 아니거나 closure 밖 ingredient 포함 | 0 writes |
| `SOURCE_NOT_CURRENT` | source가 stale/drifted/unknown/inactive | 0 writes |
| `AMBIGUOUS_NUTRITION_MATCH` | 호환 후보가 동률/불명확 | candidate `needs_review`, active 0 |
| `NO_PROFILE_WITHIN_DISTANCE` | nearest distance `>2.5` | assignment 0 |
| `TIED_CONVERSION_PROFILE` | 최소 거리 동률 | tied candidates `needs_review`, active 0 |
| `PIECE_WEIGHT_REQUIRED` | 승인된 exact piece row 없음 | gram result 없음 |
| `INVALID_REVIEW_TRANSITION` | 허용되지 않은 state transition | transaction rollback |
| `INVALID_RUN_REPORT` | run report 누락·checksum/affected row ID 불일치 | 0 writes |
| `APPROVAL_FILE_REQUIRED` | apply/disable decision file 없음 | 0 writes |
| `PRODUCTION_LOAD_APPROVAL_REQUIRED` | 별도 production 승인 없음 | transaction 전 종료, 0 writes |
| `SECRET_OR_RAW_DATA_LEAK` | key/auth query/raw payload/raw row 패턴 탐지 | artifact 폐기, 0 writes |

## Permission / RLS

- raw snapshot은 predecessor artifact storage에서 immutable/read-only다.
- `nutrition_sources`부터 검수/assignment table까지 write는 service-role/operator capability 전용이다. 기존 `admin_members`의 viewer role은 write 권한이 아니다.
- `anon`과 일반 `authenticated` 사용자는 source item/evidence/candidate/decision을 직접 SELECT/INSERT/UPDATE/DELETE할 수 없다.
- 일반 사용자는 approved row도 직접 수정·삭제할 수 없다. public read projection은 이번 slice에서 만들지 않는다.
- 승인/거절/disable은 actor와 reason이 없는 호출을 거부한다.

## Frontend Delivery Mode

- BE/data-model only이며 frontend route, client component, client state, public API를 추가하지 않는다.
- 필수 UI 상태 `loading / empty / error / read-only / unauthorized`는 소비 화면 자체가 없으므로 모두 N/A다.
- Stage 4~6, Design, Accessibility, Playwright는 N/A이며 frontend 산출물이나 가짜 checklist를 만들지 않는다.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: DB/internal CLI only. Design/Accessibility/Playwright는 명시적 N/A다.

## Design Status

- [x] N/A — BE/data-model only, FE 화면 없음, Stage 4~6 스킵

## Source Links

### Repository authority

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.17.md`
- `docs/db설계-v1.3.18.md`
- `docs/화면정의서-v1.5.23.md` — 이번 nutrition slice의 UI 비확장 확인용
- `docs/유저flow맵-v1.3.20.md` — 변경 없음 확인용
- `docs/api문서-v1.2.22.md` — public contract 비확장 확인용
- `docs/workpacks/public-nutrition-source-acquisition/`
- `supabase/migrations/20260626104000_seed_foodsafety_pilot_recipes.sql`
- predecessor merge PR #995: `https://github.com/netsus/homecook/pull/995`

### Official source evidence

- 식약처 식품영양성분DB정보: `https://www.data.go.kr/data/15127578/openapi.do` (재확인 2026-07-14)
- 농촌진흥청 국가표준식품성분 DB 검색: `https://www.nics.go.kr/food/kfi/fct/fctFoodSrch/list` (10.4(2026), 재확인 2026-07-14)
- 농촌진흥청 국가표준식품성분 DB 개요: `https://www.nics.go.kr/food/kfi/fct/fctIntro/list` (DB Excel 공공누리 제1유형, 재확인 2026-07-14)
- 농촌진흥청 양념재료 계량표: `https://www.nics.go.kr/food/kfi/hsMarinade/list_03` (`1T=15mL`, `1t=5mL`, `1컵=200mL`; 제한 evidence만 사용, 재확인 2026-07-14)
- 농촌진흥청 저작권정책: `https://www.nics.go.kr/u/100000165.do` (재확인 2026-07-14)

> 공식 페이지가 일시적으로 불안정해도 predecessor가 2026-07-13에 고정한 URL·확인일·제한 evidence disposition을 보존한다. 전체 표나 페이지를 repository fixture로 복제하지 않는다.

## QA / Test Data Plan

### TDD RED targets

- `tests/ingredient-nutrition-normalizer.test.ts`
- `tests/ingredient-nutrition-matching.test.ts`
- `tests/ingredient-conversion-profile.test.ts`
- `tests/ingredient-nutrition-import.test.ts`
- `tests/ingredient-nutrition-rls.test.ts`

Stage 2는 acceptance의 RED 목록을 먼저 작성하고 각 test가 의도한 이유로 실패함을 확인한 뒤 migration/importer를 구현한다. parser/normalizer, missing vs zero, idempotence, source precedence, ambiguity, 2.5 경계/동률, 승인/철회, piece fail-closed, leak 방지, dry-run, pilot 30을 독립 test로 둔다.

### Fixture baseline

- approved/pinned handoff의 최소 fake bundle과 review decision fixture
- MFDS/RDA 동일 재료 호환 후보, 준비상태/가식부 불일치 후보, missing/zero/trace/parse error 영양값
- volume evidence `20.6`, `21.0`, exact boundary, exact midpoint tie, threshold 초과
- piece evidence의 exact size/preparation match와 missing/revoked cases
- 실제 key·인증 query·raw provider response·전체 원문 table이 없는 synthetic fixture만 사용

### Required verification

- `pnpm exec vitest run tests/ingredient-nutrition-normalizer.test.ts tests/ingredient-nutrition-matching.test.ts tests/ingredient-conversion-profile.test.ts tests/ingredient-nutrition-import.test.ts tests/ingredient-nutrition-rls.test.ts`
- `pnpm verify:backend`
- local Supabase reset 후 dry-run → approved local apply → 동일 재실행 → revoke/disable smoke
- dry-run/실패/중복의 `writes_committed=0`, apply의 report↔DB count, RLS denial, rollback 이후 active selection을 대조

## Key Rules

- public 원문 evidence, 대표 profile, 재료 assignment를 결합하거나 서로 덮어쓰지 않는다.
- 결측은 0이 아니며 source nutrient code/unit와 원문 기준 정보를 잃지 않는다.
- 이름, category, confidence, source priority만으로 자동 승인하지 않는다.
- nearest profile threshold는 포함 경계 `<=2.5g/15mL`; exact tie는 fail-closed다.
- `개`는 volume group에 넣지 않고 승인된 exact piece weight 없이는 환산하지 않는다.
- dry-run/production guard/재시도/중복/실패는 write 경계가 검증 가능해야 한다.
- pilot 30 밖 데이터, key/secret/raw, 신규 public API/UI는 scope 위반이다.

## Primary User Path

사용자-facing 화면 흐름이 없는 슬라이스이므로 아래 primary path의 actor는 internal 운영자다.

1. merged predecessor의 approved/pinned bundle과 30-recipe scope를 dry-run한다.
2. report에서 source freshness, missing/zero, nutrition candidates, conversion tie/distance, piece candidates를 검토한다.
3. 별도 사람이 explicit approval/rejection decision file을 만든다.
4. local/staging apply가 한 transaction으로 versioned rows와 active approved pointers를 기록한다.
5. 동일 input 재실행이 0 duplicate writes임을 확인하고 report를 대조한다.
6. 필요하면 disable decision으로 payload를 삭제하지 않고 active assignment/link를 revoke/supersede한다.

## Delivery Checklist

> Stage 1.5 독립 문서 검수 후 Stage 2/3만 수행한다. BE-only이므로 Stage 4~6, Design, Accessibility, Playwright는 N/A다.

- [x] Stage 1.5 독립 문서 계약 검수 통과 <!-- omo:id=delivery-stage1-independent-review;stage=2;scope=shared;review=3 -->
- [x] DB migration과 10개 table 제약/RLS 반영 <!-- omo:id=delivery-data-model;stage=2;scope=backend;review=3 -->
- [x] internal import/report/disable command 계약 반영 <!-- omo:id=delivery-internal-command-contract;stage=2;scope=backend;review=3 -->
- [x] source/item/profile/value normalize와 missing≠zero 테스트 <!-- omo:id=delivery-normalization-tests;stage=2;scope=backend;review=3 -->
- [x] 영양 후보·우선순위·승인/거절/철회/대체 테스트 <!-- omo:id=delivery-nutrition-link-tests;stage=2;scope=backend;review=3 -->
- [x] evidence/profile/assignment 분리와 2.5/tie 테스트 <!-- omo:id=delivery-conversion-tests;stage=2;scope=backend;review=3 -->
- [x] exact piece weight 및 unsupported piece 테스트 <!-- omo:id=delivery-piece-tests;stage=2;scope=backend;review=3 -->
- [x] RLS/append-only/active uniqueness/rollback 테스트 <!-- omo:id=delivery-integrity-tests;stage=2;scope=backend;review=3 -->
- [x] idempotent import/dry-run/production guard/report 테스트 <!-- omo:id=delivery-import-safety-tests;stage=2;scope=backend;review=3 -->
- [x] FoodSafety 30 recipe scope local DB smoke <!-- omo:id=delivery-pilot-smoke;stage=2;scope=backend;review=3 -->
- [x] secret/auth query/raw row leak scan 0건 <!-- omo:id=delivery-secret-boundary;stage=2;scope=backend;review=3 -->
- [x] Stage 3 독립 구현 검수 및 current-head checks green <!-- omo:id=delivery-stage3-independent-review;stage=2;scope=shared;review=3 -->
