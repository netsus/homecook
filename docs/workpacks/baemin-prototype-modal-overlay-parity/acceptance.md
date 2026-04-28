# Acceptance Checklist: baemin-prototype-modal-overlay-parity

> 이 acceptance file은 modal/sheet overlay family prototype parity 슬라이스를 검증한다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] 5개 modal/sheet overlay의 시각 처리가 prototype과 near-100% 일치한다 (3-way capture evidence 기반) <!-- omo:id=mo-accept-visual-parity;stage=4;scope=frontend;review=5,6 -->
- [x] 5개 required states (planner-add-open, save-open, ingredient-filter-open, sort-open, login-gate-open)가 모두 캡처되고 채점되었다 <!-- omo:id=mo-accept-required-states;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score (390px x 70% + 320px x 30%) >= 93 <!-- omo:id=mo-accept-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [x] Authority blocker count = 0 <!-- omo:id=mo-accept-blocker-zero;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 modal 기능이 regression 없이 동작한다 <!-- omo:id=mo-accept-no-regression;stage=4;scope=frontend;review=5,6 -->

### Modal별 기능 regression 확인

- [x] PlannerAddSheet: 날짜 chip 선택, 끼니 선택, 인분 stepper, 제출, 성공 토스트가 정상 동작한다 <!-- omo:id=mo-accept-planner-add-regression;stage=4;scope=frontend;review=5,6 -->
- [x] SaveModal: 책 목록 표시, 책 선택, 새 책 생성, 저장이 정상 동작한다 <!-- omo:id=mo-accept-save-regression;stage=4;scope=frontend;review=5,6 -->
- [x] IngredientFilterModal: 카테고리 전환, 검색(debounce 300ms), 재료 체크, 적용/초기화가 정상 동작한다 <!-- omo:id=mo-accept-filter-regression;stage=4;scope=frontend;review=5,6 -->
- [x] SortSheet: 옵션 탭 시 즉시 적용, 선택 옵션 시각 표시가 정상 동작한다 <!-- omo:id=mo-accept-sort-regression;stage=4;scope=frontend;review=5,6 -->
- [x] LoginGateModal: 비로그인 보호 액션에서 열림, 소셜 로그인 버튼, return-to-action이 정상 동작한다 <!-- omo:id=mo-accept-login-gate-regression;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] API 계약이 변경되지 않았다 (POST /meals, POST /recipes/{id}/save, GET /ingredients, Supabase Auth envelope 유지) <!-- omo:id=mo-accept-api-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] DB schema, endpoint, field, table, status value가 추가되지 않았다 <!-- omo:id=mo-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [x] h7 direction gate의 Near-100% Definition, Supersession Matrix, Visual Verdict Method가 변경 없이 상속된다 <!-- omo:id=mo-accept-h7-inherited;stage=4;scope=frontend;review=5,6 -->
- [x] H5 copy lock이 변경되지 않았다 (PlannerAdd/Save/Sort/Filter/LoginGate 제목·설명·CTA 텍스트) <!-- omo:id=mo-accept-h5-copy-lock;stage=4;scope=frontend;review=5,6 -->
- [x] Modal 동작 계약이 변경되지 않았다 (open/close/dismiss, focus trap, ESC, backdrop, keyboard avoidance) <!-- omo:id=mo-accept-modal-behavior-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] 공식 source-of-truth 문서(요구사항/화면정의서/유저Flow/API/DB)가 변경되지 않았다 <!-- omo:id=mo-accept-no-docs-change;stage=4;scope=frontend;review=5,6 -->
- [x] 로그인 게이트 return-to-action이 기존과 동일하게 동작한다 <!-- omo:id=mo-accept-login-gate-rta;stage=4;scope=frontend;review=5,6 -->
- [x] IngredientFilter의 `전체` sentinel, category 전환 시 search query 보존, debounce 300ms가 유지된다 <!-- omo:id=mo-accept-filter-contract;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerAdd 날짜 chip 포맷 (요일 + M/D)과 성공 토스트 포맷이 유지된다 <!-- omo:id=mo-accept-planner-add-contract;stage=4;scope=frontend;review=5,6 -->
- [x] SaveModal에서 saved/custom 레시피북만 저장 대상으로 허용된다 <!-- omo:id=mo-accept-save-book-types;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] PlannerAddSheet loading 상태 (컬럼 로딩 skeleton)가 존재한다 <!-- omo:id=mo-accept-planner-loading;stage=4;scope=frontend;review=5,6 -->
- [x] SaveModal loading 상태 (책 목록 로딩)가 존재한다 <!-- omo:id=mo-accept-save-loading;stage=4;scope=frontend;review=5,6 -->
- [x] IngredientFilterModal loading 상태 (재료 목록 skeleton)가 존재한다 <!-- omo:id=mo-accept-filter-loading;stage=4;scope=frontend;review=5,6 -->
- [x] IngredientFilterModal empty 상태 ("검색 결과가 없어요")가 존재한다 <!-- omo:id=mo-accept-filter-empty;stage=4;scope=frontend;review=5,6 -->
- [x] IngredientFilterModal error 상태 ("재료 목록을 불러오지 못했어요" + 다시 시도)가 존재한다 <!-- omo:id=mo-accept-filter-error;stage=4;scope=frontend;review=5,6 -->
- [x] LoginGateModal이 비로그인 보호 액션(좋아요/저장/플래너 추가)에서 정상 열린다 <!-- omo:id=mo-accept-login-gate-opens;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 새 endpoint, field, table, status, seed data가 도입되지 않았다 <!-- omo:id=mo-accept-no-new-data;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 fixture, route, component의 기능적 동작이 변경되지 않았다 <!-- omo:id=mo-accept-no-functional-change;stage=4;scope=frontend;review=5,6 -->
- [x] `DELETE /recipes/{id}/save`가 UI에 등장하지 않는다 <!-- omo:id=mo-accept-no-delete-save;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] Modal family fixture baseline이 foundation `fixture-route-matrix.md` 요건을 충족한다 <!-- omo:id=mo-accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [x] 3-way capture의 current/after/prototype 모두 동일한 fixture seed와 route entry를 사용한다 <!-- omo:id=mo-accept-capture-consistency;stage=4;scope=frontend;review=5,6 -->
- [x] login-gate-open 상태는 logged-out auth state로 캡처된다 <!-- omo:id=mo-accept-login-gate-auth;stage=4;scope=frontend;review=5,6 -->
- [x] planner-add-open, save-open 상태는 logged-in auth state로 캡처된다 <!-- omo:id=mo-accept-protected-modal-auth;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [x] 3-way capture가 390px + 320px 양 viewport에서 완성되었다 <!-- omo:id=mo-accept-viewport-pair;stage=4;scope=frontend;review=5,6 -->
- [x] Visual-verdict artifact가 `visual-verdict-schema.json` 규격에 맞게 생성되었다 <!-- omo:id=mo-accept-verdict-schema;stage=4;scope=frontend;review=5,6 -->
- [x] Score composition (skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15)이 h7과 동일하다 <!-- omo:id=mo-accept-score-composition;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score 가중치 (390px 70% + 320px 30%)가 h7과 동일하다 <!-- omo:id=mo-accept-score-weight;stage=4;scope=frontend;review=5,6 -->
- [x] Authority report에 390px + 320px screenshot evidence가 포함되었다 <!-- omo:id=mo-accept-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only exclusions (SortSheet tab-like semantic, LoginGate prototype social asset)이 deficit으로 채점되지 않았다 <!-- omo:id=mo-accept-exclusions-respected;stage=4;scope=frontend;review=5,6 -->
- [x] Token mapping의 approved production divergences (coral vs mint, warm cream vs white, olive vs teal, font stack)가 deficit으로 채점되지 않았다 <!-- omo:id=mo-accept-approved-divergences;stage=4;scope=frontend;review=5,6 -->
- [x] Capture 파일 경로가 `qa/visual/parity/baemin-prototype-modal-overlay-parity/<viewport>-<ModalId>-<state>-<layer>.png` 규약을 따른다 <!-- omo:id=mo-accept-capture-paths;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Frontend (Stage 4)

- [x] `pnpm verify:frontend` 통과 <!-- omo:id=mo-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=mo-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workpack` 통과 <!-- omo:id=mo-accept-workpack;stage=4;scope=frontend;review=5,6 -->
- [x] `git diff --check` 통과 <!-- omo:id=mo-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 modal 관련 Vitest/Playwright 테스트 regression 없음 <!-- omo:id=mo-accept-test-regression;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- 사용자 최종 taste approval (시각적 느낌 확인)
- h7 prototype-only exclusion의 향후 promotion 결정
- Score waiver 판단 (h7 waiver 조건 기반: miss within 2 points, approved exclusion/divergence 원인, blocker 0, required-state evidence complete)
- Live OAuth login gate 브라우저 확인 (소셜 로그인 실제 동작)
