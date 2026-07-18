# Acceptance Checklist

> 새 API/DB 계약을 만들지 않는 frontend residual slice다. predecessor evidence는 재사용할 수 있지만 새 exact implementation head의 테스트·브라우저·authority 검증을 생략하지 않는다.

## Contract Boundary

- [x] 최신 공식 5종과 predecessor workpack을 다시 확인하고 새 endpoint/field/status/error를 추가하지 않는다 <!-- omo:id=accept-standard-basis-contract-boundary;stage=4;scope=shared;review=5,6 -->
- [x] Stage 2/3 backend는 N/A이며 기존 pinned version/direct relation/mismatch 계약을 변경하지 않는다 <!-- omo:id=accept-standard-basis-backend-na;stage=4;scope=shared;review=5,6 -->
- [x] product create-form prefill·basis 정수 제한을 새 계약으로 만들지 않는다 <!-- omo:id=accept-standard-basis-create-boundary;stage=4;scope=frontend;review=5,6 -->

## Comparison / Source / Label

- [x] 비교 가능한 고형 제품은 `100g 기준`, 액상 제품은 `100mL 기준`을 핵심 영양보다 먼저 식별할 수 있다 <!-- omo:id=accept-standard-basis-comparison;stage=4;scope=frontend;review=5,6 -->
- [x] direct relation이 없는 serving/package는 `100g/100mL 비교 불가`와 원 basis를 표시하고 추정하지 않는다 <!-- omo:id=accept-standard-basis-no-inference;stage=4;scope=frontend;review=5,6 -->
- [x] `label_basis_text`가 있을 때 원 라벨 기준을 보조 문구로 유지한다 <!-- omo:id=accept-standard-basis-label-text;stage=4;scope=frontend;review=5,6 -->
- [x] source tag는 `공공 영양DB / 사용자 등록 / 비공개 보관`을 일관되게 사용한다 <!-- omo:id=accept-standard-basis-source-tags;stage=4;scope=frontend;review=5,6 -->
- [x] missing/null/unavailable은 0으로 표시하지 않는다 <!-- omo:id=accept-standard-basis-missing-not-zero;stage=4;scope=frontend;review=5,6 -->

## Quantity Add / Edit

- [x] picker에서 g/mL 수량은 기본 `100`이고 input step은 `1`이다 <!-- omo:id=accept-standard-basis-picker-default-step;stage=4;scope=frontend;review=5,6 -->
- [x] `MEAL_SCREEN` 수량 변경에서 현재 단위가 g/mL이면 input step은 `1`이다 <!-- omo:id=accept-standard-basis-meal-edit-gml-step;stage=4;scope=frontend;review=5,6 -->
- [x] `MEAL_SCREEN` 수량 변경에서 serving/package이면 input step은 `any`이고 원 basis를 유지한다 <!-- omo:id=accept-standard-basis-meal-edit-serving-step;stage=4;scope=frontend;review=5,6 -->
- [x] 단위 select 변경 즉시 step semantics가 현재 단위와 일치한다 <!-- omo:id=accept-standard-basis-unit-step-switch;stage=4;scope=frontend;review=5,6 -->
- [x] `NUTRITION_BASIS_MISMATCH`는 공식 문구로 표시하고 dialog·입력·플래너 context를 보존한다 <!-- omo:id=accept-standard-basis-mismatch-context;stage=4;scope=frontend;review=5,6 -->
- [x] exactly-one direct relation만 허용하며 0개/복수/chaining/이름·브랜드·밀도 추정을 하지 않는다 <!-- omo:id=accept-standard-basis-direct-only;stage=4;scope=shared;review=5,6 -->

## Domain / Security / Performance Regression

- [x] ProductPlannerEntry는 Recipe Meal status/shopping/cooking/leftover/XP에 들어가지 않는다 <!-- omo:id=accept-standard-basis-domain-isolation;stage=4;scope=shared;review=5,6 -->
- [x] 기존 owner/auth/RLS 권한과 pin은 변하지 않고 secret/raw provider row/private path 노출이 0이다 <!-- omo:id=accept-standard-basis-security-regression;stage=4;scope=shared;review=5,6 -->
- [x] 수량 step 표현 때문에 추가 fetch/query/N+1이 생기지 않는다 <!-- omo:id=accept-standard-basis-performance-regression;stage=4;scope=frontend;review=5,6 -->
- [x] production/staging/provider write는 별도 승인 전 0이다 <!-- omo:id=accept-standard-basis-external-write-zero;stage=4;scope=shared;review=5,6 -->

## TDD / Automation

- [x] MealScreen g/ml step 테스트가 구현 전 RED로 실패한 증거가 있다 <!-- omo:id=accept-standard-basis-tdd-red;stage=4;scope=frontend;review=5,6 -->
- [x] focused Vitest가 g/ml, serving/package, unit switch, mismatch, comparison/source/label 회귀를 통과한다 <!-- omo:id=accept-standard-basis-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 prepared-food catalog/entry/planner nutrition backend·PostgreSQL 회귀가 통과한다 <!-- omo:id=accept-standard-basis-backend-regression;stage=4;scope=shared;review=5,6 -->
- [x] Playwright가 공공 g/ml, 사용자 등록, legacy no-relation, add/edit/error flow를 통과한다 <!-- omo:id=accept-standard-basis-playwright;stage=4;scope=frontend;review=5,6 -->
- [x] real local Supabase와 Chrome에서 같은 흐름을 검증한다 <!-- omo:id=accept-standard-basis-real-local;stage=4;scope=shared;review=5,6 -->

## Responsive / Authority / Merge

- [x] 320/390/1280에서 modal overflow, 44px target, focus, keyboard, sticky CTA, safe area가 정상이다 <!-- omo:id=accept-standard-basis-responsive;stage=4;scope=frontend;review=5,6 -->
- [x] before/after evidence와 exploratory QA/eval report가 있다 <!-- omo:id=accept-standard-basis-exploratory;stage=4;scope=frontend;review=5,6 -->
- [x] fresh independent code review가 blocker/important 0으로 승인한다 <!-- omo:id=accept-standard-basis-review;stage=5;scope=shared;review=6 -->
- [x] exact implementation head authority report가 PASS/blocker 0이다 <!-- omo:id=accept-standard-basis-authority;stage=5;scope=frontend;review=6 -->
- [ ] Ready current-head의 시작된 모든 check가 success 또는 의도된 skip이고 pending/fail이 0이다 <!-- omo:id=accept-standard-basis-current-head;stage=6;scope=shared;review=6 -->

### Manual Only

- [ ] production/staging migration·promotion·provider write
- [ ] 실제 물리 기기 screen reader와 production-scale query 측정
