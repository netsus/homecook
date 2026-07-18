# Slice: prepared-food-standard-basis-ux

## Goal

완제품 검색·플래너 추가·수량 변경에서 고형 제품은 `100g`, 액상 제품은 `100mL`를 우선 비교 기준으로 사용한다. g/mL 수량은 기본 `100`에서 `1g`/`1mL`씩 조절하고, 원 라벨 기준과 source tag를 함께 보존한다. 이미 병합된 계약·백엔드·카탈로그를 다시 만들지 않고 `MEAL_SCREEN` 수량 변경의 남은 step 불일치와 교차 회귀만 닫는다.

## Branches

- 문서: `docs/prepared-food-standard-basis-ux`
- 백엔드: N/A — 공식 API/DB 계약과 direct relation 검증은 predecessor에서 병합 완료
- 프론트엔드: `feature/fe-prepared-food-standard-basis-ux`

## In Scope

- 화면: `FOOD_PRODUCT_PICKER`, `PLANNER_WEEK`, `MEAL_SCREEN`의 완제품 비교·추가·수량 변경 회귀
- 고형 제품은 `100g`, 액상 제품은 `100mL` 우선 비교
- picker의 g/mL 기본 수량 `100`과 `step=1` 유지
- `MEAL_SCREEN` 수량 변경 input을 g/mL일 때 `step=1`, serving/package일 때 기존 자유 양수 입력으로 정렬
- `label_basis_text`와 `공공 영양DB / 사용자 등록 / 비공개 보관` source tag 유지
- exactly-one direct basis relation만 사용하고 relation 0개/복수/chaining/추정은 금지
- 기존 `422 NUTRITION_BASIS_MISMATCH`와 dialog context 보존
- Recipe Meal/shopping/cooking/leftover/XP와 ProductPlannerEntry 분리 회귀

## Already Implemented / Predecessor Owned

- `community-prepared-food-catalog`: source filter/tag, 100g/100mL comparison-first, 비교 불가, picker 기본 100/step 1, real A/B browser 및 authority
- `prepared-food-planner-entry`: pinned nutrition version, exactly-one direct relation, mismatch 422, Recipe workflow 분리
- `planner-nutrition-summary`: recipe/product 합산, 결측·partial·unavailable 보존, PLANNER_WEEK/MEAL_SCREEN authority
- 이 slice는 위 구현을 새 endpoint/schema/status로 복제하지 않고 현재 master에서 회귀 잠금한다.

## Out of Scope

- API, DB schema, public field/status/error/endpoint 추가 또는 변경
- product create form의 초기 기준량을 공식 계약으로 고정하거나 기준량을 정수로 제한
- serving/package를 100g/100mL로 추정하거나 relation을 생성·연결·chaining하는 동작
- 이름·브랜드·밀도·임의 g↔mL로 환산
- 공공 데이터 import, 공동 catalog 권한/신고/moderation/account deletion 변경
- Recipe Meal, shopping, cooking, leftover, XP에 완제품을 포함
- production/staging/provider write, 실제 섭취·목표·의료 조언

## Dependencies

| 선행 슬라이스 | 상태 |
| --- | --- |
| `community-prepared-food-catalog` | merged — PR #1046 |
| `prepared-food-planner-entry` | merged — PR #1018 |
| `planner-nutrition-summary` | merged — PR #1024 |
| official v1.7.21/v1.5.27/v1.3.24/v1.3.22/v1.2.26 | merged |

> 사용자 승인 Codex-only 예외에 따라 Stage 1 작성, internal 1.5 검토/repair-final, Stage 4 TDD 구현, Stage 5/authority/Stage 6 검토를 각각 분리한다. 작성·구현 역할은 자기 변경을 최종 승인하지 않는다.

## Stage Contract

### Stage 1 / 1.5

- 이 문서와 acceptance/automation/design addendum을 먼저 병합한다.
- 독립 reviewer는 predecessor 중복 구현, create-form 계약 확장, backend reopen이 없는지 확인한다.

### Stage 2 / 3 — N/A

- request/response/error/schema/RLS/RPC 변경이 없다.
- 기존 server의 pinned version, exactly-one direct relation, `NUTRITION_BASIS_MISMATCH`를 소비한다.
- backend test는 새 구현이 아니라 교차 회귀 검증으로 Stage 4/최종 QA에서 재실행한다.

### Stage 4 — Frontend TDD

1. `MEAL_SCREEN` product edit에서 g/mL input의 `step=1`이 아니라는 실패 테스트를 먼저 만든다.
2. serving/package가 `step=any`를 유지하는 테스트를 함께 잠근다.
3. picker 100g/100mL 비교, 기본 100, label basis, source tag, 비교 불가, mismatch context의 기존 테스트를 회귀 실행한다.
4. 최소 구현 뒤 320/390/1280 real local browser evidence를 수집한다.

### Stage 5 / Authority / Stage 6

- independent code review와 product design authority는 구현 exact head를 검토한다.
- `PLANNER_WEEK`/`MEAL_SCREEN` anchor-extension으로 authority-required다.
- current-head 전체 checks가 성공 또는 정책상 의도된 skip일 때만 merge한다.

## UX Contract

- 비교 가능한 고형 제품: `100g 기준`; 액상 제품: `100mL 기준`.
- 직접 relation이 없는 serving/package: 원 라벨 기준과 `100g/100mL 비교 불가`를 표시한다.
- g/mL 추가·수정 input: 기본 수량은 picker에서 `100`, browser step은 `1`.
- serving/package 수량: 원 basis를 유지하고 임의 100g 환산을 하지 않는다.
- 원 라벨 문구는 정규화 기준을 대체하지 않고 보조 정보로 함께 표시한다.
- missing/null/unavailable은 0이 아니다.
- 변경 실패 시 modal, 선택 단위, 입력량, 플래너 context를 유지한다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screens: `PLANNER_WEEK`, `MEAL_SCREEN`
- Stage 1 artifact: `ui/designs/MEAL_SCREEN.md`의 Standard Basis UX addendum
- Stage 4 evidence: `ui/designs/evidence/prepared-food-standard-basis-ux/{before,after}/{390,320,1280}/`
- Authority report: `ui/designs/authority/PLANNER_WEEK-prepared-food-standard-basis-ux-authority.md`
- Status: pending — predecessor authority는 historical evidence이며 새 exact head 승인이 아니다.

## QA / Test Data Plan

- Vitest: g/ml edit step 1, serving/package any, comparison quantity, direct relation only, mismatch context, source/label display
- Playwright: public g product, public ml product, shared manual g/ml, legacy serving/package no-relation
- Real local DB/browser: 기존 local Supabase의 공공·사용자·legacy fixture를 read/add/edit하고 target 외 digest를 보존한다.
- Responsive: 320, 390, 1280에서 modal overflow, 44px target, keyboard/focus, sticky CTA, safe area를 확인한다.
- Security: 새 trust boundary 없음; 기존 auth/owner/RLS와 secret/raw row 비노출 회귀만 필수다.
- Performance: 새 query/fetch 없음; quantity unit 변경이 추가 network request나 item N+1을 만들지 않는지 확인한다.
- production/staging/provider write는 별도 승인 전 0이며 Manual Only다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.21.md`
- `docs/화면정의서-v1.5.27.md`
- `docs/유저flow맵-v1.3.24.md`
- `docs/db설계-v1.3.22.md`
- `docs/api문서-v1.2.26.md`
- `docs/workpacks/community-prepared-food-catalog/README.md`
- `docs/workpacks/prepared-food-planner-entry/README.md`
- `docs/workpacks/planner-nutrition-summary/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`

## Delivery Checklist

- [x] Stage 1 scope and predecessor boundary drafted
- [x] Stage 2 backend N/A rationale documented
- [x] independent internal 1.5 review — APPROVE, blocker/major/minor 0/0/0
- [ ] Stage 1 docs PR merged
- [ ] Stage 4 RED test captured before implementation
- [ ] MealScreen g/ml step repair and inherited UX regression green
- [ ] 320/390/1280 real local browser evidence
- [ ] independent Stage 5 code review and authority blocker 0
- [ ] current-head full checks and Stage 6 merge
