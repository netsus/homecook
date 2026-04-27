# Acceptance Checklist: baemin-prototype-planner-week-parity-contract

> 이 acceptance file은 PLANNER_WEEK prototype parity contract sync 슬라이스를 검증한다.
> Docs-only 슬라이스이므로 runtime app code 변경 검증은 없다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Contract Verification

- [x] H2/H4 conflict table이 superseded / kept를 정확히 구분한다 <!-- omo:id=pw-accept-conflict-table;stage=4;scope=frontend;review=5,6 -->
- [x] "가로 스크롤 없음" lock 제거가 v1.6.4에 반영되었음을 확인했다 <!-- omo:id=pw-accept-scroll-lock-removed;stage=4;scope=frontend;review=5,6 -->
- [x] v1.5.1 §5 PLANNER_WEEK이 Baemin prototype을 priority basis로 명시함을 확인했다 <!-- omo:id=pw-accept-prototype-priority;stage=4;scope=frontend;review=5,6 -->
- [x] v1.3.1 유저flow맵이 planner prototype scroll/affordance를 허용함을 확인했다 <!-- omo:id=pw-accept-flow-map-scroll;stage=4;scope=frontend;review=5,6 -->
- [x] 추가 공식 문서 변경이 불필요함을 확인했다 <!-- omo:id=pw-accept-no-docs-change-needed;stage=4;scope=frontend;review=5,6 -->

## Kept Contracts

- [x] API response envelope (`{ success, data, error }`) 보존 계약이 기록되었다 <!-- omo:id=pw-accept-api-envelope;stage=4;scope=frontend;review=5,6 -->
- [x] meals.status 전이 (`registered -> shopping_done -> cook_done`) 보존 계약이 기록되었다 <!-- omo:id=pw-accept-status-transition;stage=4;scope=frontend;review=5,6 -->
- [x] 4 fixed meal slots 정책 보존 및 `/planner/columns` CRUD 미재도입 규칙이 기록되었다 <!-- omo:id=pw-accept-fixed-slots;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 / unauthorized 상태 보존이 기록되었다 <!-- omo:id=pw-accept-auth-gate;stage=4;scope=frontend;review=5,6 -->
- [x] 4-slot 고정 구조(아침/점심/간식/저녁) 보존이 기록되었다 <!-- omo:id=pw-accept-4slot;stage=4;scope=frontend;review=5,6 -->
- [x] No endpoint/field/table/status addition 규칙이 기록되었다 <!-- omo:id=pw-accept-no-data-addition;stage=4;scope=frontend;review=5,6 -->

## Evidence Target

- [x] Follow-up slice score threshold (>= 94)이 기록되었다 <!-- omo:id=pw-accept-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [x] Required states (initial, prototype-overview, scrolled, loading, empty, unauthorized, error)가 기록되었다 <!-- omo:id=pw-accept-required-states;stage=4;scope=frontend;review=5,6 -->
- [x] Viewports (390×844 70%, 320×568 30%)가 기록되었다 <!-- omo:id=pw-accept-viewports;stage=4;scope=frontend;review=5,6 -->
- [x] Score composition (skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15)이 h7과 동일하게 기록되었다 <!-- omo:id=pw-accept-score-composition;stage=4;scope=frontend;review=5,6 -->
- [x] Evidence paths와 artifact paths가 기록되었다 <!-- omo:id=pw-accept-evidence-paths;stage=4;scope=frontend;review=5,6 -->

## Exclusions and Divergences

- [x] Prototype-only exclusions (PLANNER_WEEK 관련)이 기록되었다 <!-- omo:id=pw-accept-exclusions;stage=4;scope=frontend;review=5,6 -->
- [x] Approved production divergences (brand color, background, foreground, font, olive/teal)가 기록되었다 <!-- omo:id=pw-accept-approved-divergences;stage=4;scope=frontend;review=5,6 -->

## Docs Integrity

- [x] Runtime app code 변경이 없다 <!-- omo:id=pw-accept-no-runtime;stage=4;scope=frontend;review=5,6 -->
- [x] 공식 source-of-truth 문서가 변경되지 않았다 <!-- omo:id=pw-accept-no-official-docs-change;stage=4;scope=frontend;review=5,6 -->
- [x] h7 direction gate의 Near-100% Definition, Supersession Matrix, Visual Verdict Method가 변경 없이 상속된다 <!-- omo:id=pw-accept-h7-inherited;stage=4;scope=frontend;review=5,6 -->

## Automation

- [x] `git diff --check` 통과 <!-- omo:id=pw-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=pw-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workpack` 통과 <!-- omo:id=pw-accept-workpack;stage=4;scope=frontend;review=5,6 -->

## Manual Only

- 사용자 최종 contract 확인 (conflict table, kept contracts 검토)
- follow-up implementation slice 착수 승인
