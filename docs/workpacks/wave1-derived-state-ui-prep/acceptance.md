# Acceptance Checklist: wave1-derived-state-ui-prep

> 이 acceptance는 fixed prototype에 직접 없는 상태 UI를 `prototype-derived design`으로 잠그는 선행 prep 기준이다.
> API/DB/status/auth 계약 변경은 범위 밖이다.

## Happy Path

- [x] 공통 상태 UI 규칙과 화면별 state inventory가 문서에 남아 있다 <!-- omo:id=wdsu-accept-inventory-doc;stage=4;scope=frontend;review=5,6 -->
- [x] `ContentState`, `Skeleton`, `EmptyState`, `ErrorState`가 Wave1-derived 기준을 공유한다 <!-- omo:id=wdsu-accept-shared-components;stage=4;scope=frontend;review=5,6 -->
- [x] HOME / RECIPE_DETAIL / PLANNER_WEEK 대표 상태가 새 기준을 소비한다 <!-- omo:id=wdsu-accept-anchor-representatives;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] fixed reference가 있는 surface는 `prototype parity`, 없는 상태 UI는 `prototype-derived design`으로 분리되어 있다 <!-- omo:id=wdsu-accept-classification;stage=4;scope=frontend;review=5,6 -->
- [x] loading/skeleton은 최종 콘텐츠 구조와 밀도를 예고한다 <!-- omo:id=wdsu-accept-skeleton-density;stage=4;scope=frontend;review=5,6 -->
- [x] empty/error/unauthorized/not-found는 다음 행동을 제공하거나 복귀/재시도 경로를 유지한다 <!-- omo:id=wdsu-accept-action-paths;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] HOME error state가 retry action을 유지한다 <!-- omo:id=wdsu-accept-home-error;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL error state가 retry action을 유지한다 <!-- omo:id=wdsu-accept-recipe-error;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK unauthorized state가 login return-to-action을 유지한다 <!-- omo:id=wdsu-accept-planner-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK error state가 retry action을 유지한다 <!-- omo:id=wdsu-accept-planner-error;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] API endpoint, payload, response envelope, DB schema, status transition을 변경하지 않는다 <!-- omo:id=wdsu-accept-no-contract-change;stage=4;scope=frontend;review=6 -->
- [x] 기존 기능 테스트를 삭제하지 않고 필요한 selector만 업데이트한다 <!-- omo:id=wdsu-accept-test-preservation;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [x] `wave1-prototype-repair` fixed SHA와 reference manifest가 source link에 기록되어 있다 <!-- omo:id=wdsu-accept-fixed-reference;stage=4;scope=frontend;review=6 -->
- [x] Phase4 Slice A~F 확산 범위와 이 prep의 non-goal이 분리되어 있다 <!-- omo:id=wdsu-accept-phase4-boundary;stage=4;scope=frontend;review=6 -->

## Automation

- [x] Component-level state UI regression passes <!-- omo:id=wdsu-accept-component-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] HOME state UI regression passes <!-- omo:id=wdsu-accept-home-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL state UI regression passes <!-- omo:id=wdsu-accept-recipe-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK state UI regression passes <!-- omo:id=wdsu-accept-planner-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` passes <!-- omo:id=wdsu-accept-verify-frontend;stage=4;scope=frontend;review=6 -->
- [x] `pnpm validate:workflow-v2` and `pnpm validate:workpack -- --slice wave1-derived-state-ui-prep` pass <!-- omo:id=wdsu-accept-validators;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 사용자 최종 visual feel 확인은 후속 Phase4 screenshot evidence에서 진행한다.
