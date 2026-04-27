# Acceptance Checklist: baemin-prototype-home-parity

> 이 acceptance file은 HOME body prototype parity 슬라이스를 검증한다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] HOME body의 시각 처리가 prototype과 near-100% 일치한다 (3-way capture evidence 기반) <!-- omo:id=home-accept-visual-parity;stage=4;scope=frontend;review=5,6 -->
- [x] 7개 required states (initial, scrolled-to-recipes-entry, sort-open, filter-active, loading, empty, error)가 모두 캡처되고 채점되었다 <!-- omo:id=home-accept-required-states;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score (390px × 70% + 320px × 30%) >= 95 <!-- omo:id=home-accept-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [x] Authority blocker count = 0 <!-- omo:id=home-accept-blocker-zero;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 HOME 기능이 regression 없이 동작한다 (검색, 재료 필터, 정렬, 테마 carousel, 레시피 카드 탭) <!-- omo:id=home-accept-no-regression;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] API 계약이 변경되지 않았다 (`GET /recipes`, `GET /recipes/themes`, `GET /ingredients` envelope 유지) <!-- omo:id=home-accept-api-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] DB schema, endpoint, field, table, status value가 추가되지 않았다 <!-- omo:id=home-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [x] h7 direction gate의 Near-100% Definition, Supersession Matrix, Visual Verdict Method가 변경 없이 상속된다 <!-- omo:id=home-accept-h7-inherited;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 정보 구조(공통 헤더, 검색, 재료 필터, 테마 carousel, 모든 레시피 + 정렬, 레시피 그리드)가 변경되지 않았다 <!-- omo:id=home-accept-ia-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] 공식 source-of-truth 문서(요구사항/화면정의서/유저Flow/API/DB)가 변경되지 않았다 <!-- omo:id=home-accept-no-docs-change;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] loading 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=home-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=home-accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 prototype 수준의 시각 처리로 존재한다 <!-- omo:id=home-accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] HOME 조회는 비로그인 가능 상태를 유지한다 <!-- omo:id=home-accept-public-access;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 새 endpoint, field, table, status, seed data가 도입되지 않았다 <!-- omo:id=home-accept-no-new-data;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 fixture, route, component의 기능적 동작이 변경되지 않았다 <!-- omo:id=home-accept-no-functional-change;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] HOME fixture baseline이 foundation `fixture-route-matrix.md` 요건을 충족한다 (>= 6 recipes, >= 1 theme, ingredient categories) <!-- omo:id=home-accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [x] 3-way capture의 current/after/prototype 모두 동일한 fixture seed와 route entry (`/`)를 사용한다 <!-- omo:id=home-accept-capture-consistency;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [x] 3-way capture가 390px + 320px 양 viewport에서 완성되었다 <!-- omo:id=home-accept-viewport-pair;stage=4;scope=frontend;review=5,6 -->
- [x] Visual-verdict artifact가 `visual-verdict-schema.json` 규격에 맞게 생성되었다 <!-- omo:id=home-accept-verdict-schema;stage=4;scope=frontend;review=5,6 -->
- [x] Score composition (skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15)이 h7과 동일하다 <!-- omo:id=home-accept-score-composition;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score 가중치 (390px 70% + 320px 30%)가 h7과 동일하다 <!-- omo:id=home-accept-score-weight;stage=4;scope=frontend;review=5,6 -->
- [x] Authority report에 390px + 320px screenshot evidence가 포함되었다 <!-- omo:id=home-accept-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only exclusions (hero greeting, promo strip, inline ingredient chips, Jua, bottom tabs)이 deficit으로 채점되지 않았다 <!-- omo:id=home-accept-exclusions-respected;stage=4;scope=frontend;review=5,6 -->
- [x] Token mapping의 approved production divergences가 deficit으로 채점되지 않았다 <!-- omo:id=home-accept-approved-divergences;stage=4;scope=frontend;review=5,6 -->
- [x] Capture 파일 경로가 `qa/visual/parity/baemin-prototype-home-parity/<viewport>-HOME-<state>-<layer>.png` 규약을 따른다 <!-- omo:id=home-accept-capture-paths;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Frontend (Stage 4)

- [x] `pnpm verify:frontend` 통과 <!-- omo:id=home-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=home-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workpack` 통과 <!-- omo:id=home-accept-workpack;stage=4;scope=frontend;review=5,6 -->
- [x] `git diff --check` 통과 <!-- omo:id=home-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 HOME Vitest/Playwright 테스트 regression 없음 <!-- omo:id=home-accept-test-regression;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- 사용자 최종 taste approval (시각적 느낌 확인)
- h7 prototype-only exclusion의 향후 promotion 결정
- Score waiver 판단 (h7 waiver 조건 기반: miss within 2 points, approved exclusion/divergence 원인, blocker 0, required-state evidence complete)
