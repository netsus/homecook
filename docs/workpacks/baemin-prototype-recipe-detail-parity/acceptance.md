# Acceptance Checklist: baemin-prototype-recipe-detail-parity

> 이 acceptance file은 RECIPE_DETAIL body prototype parity 슬라이스를 검증한다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [ ] RECIPE_DETAIL body의 시각 처리가 prototype과 near-100% 일치한다 (3-way capture evidence 기반) <!-- omo:id=rd-accept-visual-parity;stage=4;scope=frontend;review=5,6 -->
- [ ] 7개 required states (initial, scrolled, planner-add-open, save-open, login-gate-open, loading, error)가 모두 캡처되고 채점되었다 <!-- omo:id=rd-accept-required-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Slice score (390px × 70% + 320px × 30%) >= 95 <!-- omo:id=rd-accept-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority blocker count = 0 <!-- omo:id=rd-accept-blocker-zero;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 RECIPE_DETAIL 기능이 regression 없이 동작한다 (좋아요, 저장, 플래너 추가, 로그인 게이트, 인분 조절, 공유, 요리하기) <!-- omo:id=rd-accept-no-regression;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] API 계약이 변경되지 않았다 (`GET /recipes/{id}`, `POST /meals`, `POST /recipes/{id}/save`, `POST /recipes/{id}/like` envelope 유지) <!-- omo:id=rd-accept-api-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] DB schema, endpoint, field, table, status value가 추가되지 않았다 <!-- omo:id=rd-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] h7 direction gate의 Near-100% Definition, Supersession Matrix, Visual Verdict Method가 변경 없이 상속된다 <!-- omo:id=rd-accept-h7-inherited;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL 정보 구조(공통 헤더, 미디어, breadcrumb+제목+태그, overview meta, 보조 액션, primary CTA, 인분 조절, 재료 리스트, 스텝 리스트)가 변경되지 않았다 <!-- omo:id=rd-accept-ia-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] 공식 source-of-truth 문서(요구사항/화면정의서/유저Flow/API/DB)가 변경되지 않았다 <!-- omo:id=rd-accept-no-docs-change;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 (좋아요/저장/플래너 추가)와 return-to-action이 기존과 동일하게 동작한다 <!-- omo:id=rd-accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] 인분 stepper 동작이 기존과 동일하다 (상세에서만 조절 가능, 재료량 즉시 반영) <!-- omo:id=rd-accept-servings-stepper;stage=4;scope=frontend;review=5,6 -->
- [ ] 저장 대상 레시피북은 saved/custom만 허용된다 <!-- omo:id=rd-accept-save-book-types;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] loading 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=rd-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=rd-accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL 조회는 비로그인 가능 상태를 유지한다 <!-- omo:id=rd-accept-public-access;stage=4;scope=frontend;review=5,6 -->
- [ ] 보호 액션(좋아요/저장/플래너 추가) 비로그인 탭 시 LoginGateModal이 열린다 <!-- omo:id=rd-accept-login-gate-opens;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] 새 endpoint, field, table, status, seed data가 도입되지 않았다 <!-- omo:id=rd-accept-no-new-data;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 fixture, route, component의 기능적 동작이 변경되지 않았다 <!-- omo:id=rd-accept-no-functional-change;stage=4;scope=frontend;review=5,6 -->
- [ ] `DELETE /recipes/{id}/save`가 UI에 등장하지 않는다 <!-- omo:id=rd-accept-no-delete-save;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] RECIPE_DETAIL fixture baseline이 foundation `fixture-route-matrix.md` 요건을 충족한다 (1 recipe with >= 3 ingredients, >= 2 cooking steps, image/emoji) <!-- omo:id=rd-accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [ ] 3-way capture의 current/after/prototype 모두 동일한 fixture seed와 route entry (`/recipe/[id]`)를 사용한다 <!-- omo:id=rd-accept-capture-consistency;stage=4;scope=frontend;review=5,6 -->
- [ ] login-gate-open 상태는 logged-out auth state로 캡처된다 <!-- omo:id=rd-accept-login-gate-auth;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [ ] 3-way capture가 390px + 320px 양 viewport에서 완성되었다 <!-- omo:id=rd-accept-viewport-pair;stage=4;scope=frontend;review=5,6 -->
- [ ] Visual-verdict artifact가 `visual-verdict-schema.json` 규격에 맞게 생성되었다 <!-- omo:id=rd-accept-verdict-schema;stage=4;scope=frontend;review=5,6 -->
- [ ] Score composition (skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15)이 h7과 동일하다 <!-- omo:id=rd-accept-score-composition;stage=4;scope=frontend;review=5,6 -->
- [ ] Slice score 가중치 (390px 70% + 320px 30%)가 h7과 동일하다 <!-- omo:id=rd-accept-score-weight;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority report에 390px + 320px screenshot evidence가 포함되었다 <!-- omo:id=rd-accept-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype-only exclusions (tabs, reviews section/cards, review count badge, star rating)이 deficit으로 채점되지 않았다 <!-- omo:id=rd-accept-exclusions-respected;stage=4;scope=frontend;review=5,6 -->
- [ ] Token mapping의 approved production divergences가 deficit으로 채점되지 않았다 <!-- omo:id=rd-accept-approved-divergences;stage=4;scope=frontend;review=5,6 -->
- [ ] Capture 파일 경로가 `qa/visual/parity/baemin-prototype-recipe-detail-parity/<viewport>-RECIPE_DETAIL-<state>-<layer>.png` 규약을 따른다 <!-- omo:id=rd-accept-capture-paths;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Frontend (Stage 4)

- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=rd-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` 통과 <!-- omo:id=rd-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workpack` 통과 <!-- omo:id=rd-accept-workpack;stage=4;scope=frontend;review=5,6 -->
- [ ] `git diff --check` 통과 <!-- omo:id=rd-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 RECIPE_DETAIL Vitest/Playwright 테스트 regression 없음 <!-- omo:id=rd-accept-test-regression;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- 사용자 최종 taste approval (시각적 느낌 확인)
- h7 prototype-only exclusion의 향후 promotion 결정
- Score waiver 판단 (h7 waiver 조건 기반: miss within 2 points, approved exclusion/divergence 원인, blocker 0, required-state evidence complete)
