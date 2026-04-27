# Acceptance Checklist: baemin-prototype-planner-week-parity

> 이 acceptance file은 PLANNER_WEEK body prototype parity 슬라이스를 검증한다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [ ] PLANNER_WEEK body의 시각 처리가 prototype과 near-100% 일치한다 (3-way capture evidence 기반) <!-- omo:id=pw-accept-visual-parity;stage=4;scope=frontend;review=5,6 -->
- [ ] 7개 required states (initial, prototype-overview, scrolled, loading, empty, unauthorized, error)가 모두 캡처되고 채점되었다 <!-- omo:id=pw-accept-required-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Slice score (390px × 70% + 320px × 30%) >= 94 <!-- omo:id=pw-accept-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority blocker count = 0 <!-- omo:id=pw-accept-blocker-zero;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 PLANNER_WEEK 기능이 regression 없이 동작한다 (주간 이동, 셀 탭, CTA 버튼, unauthorized gate, loading/empty/error) <!-- omo:id=pw-accept-no-regression;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] API 계약이 변경되지 않았다 (`GET /planner`, `POST /meals`, `GET /meals`, `PATCH /meals/{meal_id}`, `DELETE /meals/{meal_id}` envelope 유지) <!-- omo:id=pw-accept-api-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] DB schema, endpoint, field, table, status value가 추가되지 않았다 <!-- omo:id=pw-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] `/planner/columns` CRUD가 재도입되지 않았다 <!-- omo:id=pw-accept-no-column-crud;stage=4;scope=frontend;review=5,6 -->
- [ ] h7 direction gate의 Near-100% Definition, Supersession Matrix, Visual Verdict Method가 변경 없이 상속된다 <!-- omo:id=pw-accept-h7-inherited;stage=4;scope=frontend;review=5,6 -->
- [ ] Contract slice의 H2/H4 conflict table, scroll policy, kept contracts가 변경 없이 상속된다 <!-- omo:id=pw-accept-contract-inherited;stage=4;scope=frontend;review=5,6 -->
- [ ] PLANNER_WEEK 정보 구조(브랜드 헤더, compact toolbar, 주간 컨텍스트 바, 요일 스트립, day card, 4-slot 구조)가 변경되지 않았다 <!-- omo:id=pw-accept-ia-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] 공식 source-of-truth 문서(요구사항/화면정의서/유저Flow/API/DB)가 변경되지 않았다 <!-- omo:id=pw-accept-no-docs-change;stage=4;scope=frontend;review=5,6 -->
- [ ] meals.status 전이 (`registered -> shopping_done -> cook_done`)가 보존된다 <!-- omo:id=pw-accept-status-transition;stage=4;scope=frontend;review=5,6 -->
- [ ] 4 fixed meal slots 정책이 보존된다 (아침/점심/간식/저녁) <!-- omo:id=pw-accept-4slot;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] loading 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=pw-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=pw-accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=pw-accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 상태에서 SocialLoginButtons가 포함된 gate가 표시된다 <!-- omo:id=pw-accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 성공 후 planner로 return한다 <!-- omo:id=pw-accept-login-return;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only 상태 N/A — PLANNER_WEEK 자체는 read-only 대상이 아님. 완료된 장보기의 read-only는 SHOPPING_DETAIL 범위 <!-- omo:id=pw-accept-readonly-na;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 새 endpoint, field, table, status, seed data가 도입되지 않았다 <!-- omo:id=pw-accept-no-new-data;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 fixture, route, component의 기능적 동작이 변경되지 않았다 <!-- omo:id=pw-accept-no-functional-change;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] PLANNER_WEEK fixture baseline이 foundation `fixture-route-matrix.md` 요건을 충족한다 (>= 3 days with meals across breakfast/lunch/dinner, at least 1 empty slot) <!-- omo:id=pw-accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [ ] 3-way capture의 current/after/prototype 모두 동일한 fixture seed와 route entry (`/planner`)를 사용한다 <!-- omo:id=pw-accept-capture-consistency;stage=4;scope=frontend;review=5,6 -->
- [ ] `meal_plan_columns` ×4 bootstrap row가 존재한다 <!-- omo:id=pw-accept-bootstrap-columns;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 상태는 logged-out auth state로 캡처된다 <!-- omo:id=pw-accept-unauthorized-auth;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [ ] 3-way capture가 390px + 320px 양 viewport에서 완성되었다 <!-- omo:id=pw-accept-viewport-pair;stage=4;scope=frontend;review=5,6 -->
- [ ] Visual-verdict artifact가 `visual-verdict-schema.json` 규격에 맞게 생성되었다 <!-- omo:id=pw-accept-verdict-schema;stage=4;scope=frontend;review=5,6 -->
- [ ] Score composition (skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15)이 h7과 동일하다 <!-- omo:id=pw-accept-score-composition;stage=4;scope=frontend;review=5,6 -->
- [ ] Slice score 가중치 (390px 70% + 320px 30%)가 h7과 동일하다 <!-- omo:id=pw-accept-score-weight;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority report에 390px + 320px screenshot evidence가 포함되었다 <!-- omo:id=pw-accept-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype-only exclusions (Pantry coupling, bottom tab behavior, Jua, prototype-only assets)이 deficit으로 채점되지 않았다 <!-- omo:id=pw-accept-exclusions-respected;stage=4;scope=frontend;review=5,6 -->
- [ ] Token mapping의 approved production divergences가 deficit으로 채점되지 않았다 <!-- omo:id=pw-accept-approved-divergences;stage=4;scope=frontend;review=5,6 -->
- [ ] Capture 파일 경로가 `qa/visual/parity/baemin-prototype-planner-week-parity/<viewport>-PLANNER_WEEK-<state>-<layer>.png` 규약을 따른다 <!-- omo:id=pw-accept-capture-paths;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Frontend (Stage 4)

- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=pw-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` 통과 <!-- omo:id=pw-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workpack` 통과 <!-- omo:id=pw-accept-workpack;stage=4;scope=frontend;review=5,6 -->
- [ ] `git diff --check` 통과 <!-- omo:id=pw-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 PLANNER_WEEK Vitest/Playwright 테스트 regression 없음 <!-- omo:id=pw-accept-test-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA 실행 및 통과 (high-risk anchor-extension 필수) <!-- omo:id=pw-accept-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- 사용자 최종 taste approval (시각적 느낌 확인)
- h7 prototype-only exclusion의 향후 promotion 결정
- Score waiver 판단 (h7 waiver 조건 기반: miss within 2 points, approved exclusion/divergence 원인, blocker 0, required-state evidence complete)
