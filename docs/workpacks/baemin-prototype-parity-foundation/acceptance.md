# Acceptance Checklist: baemin-prototype-parity-foundation

> 이 acceptance file은 scored parity 슬라이스들이 공유하는 foundation 계약을 검증한다.
> Runtime UI 구현은 이 슬라이스 범위가 아니다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] 3-way capture recipe가 완성되어 있고, scored parity 슬라이스 개발자가 current/after/prototype 비교를 수행할 수 있다 <!-- omo:id=found-accept-capture-usable;stage=4;scope=frontend;review=5,6 -->
- [x] Artifact schema가 확정되어 있고, visual-verdict 결과를 정해진 경로와 필드로 기록할 수 있다 <!-- omo:id=found-accept-artifact-usable;stage=4;scope=frontend;review=5,6 -->
- [x] Token/material mapping scope 문서가 prototype HANDOFF.md 기반으로 parity 범위의 토큰 매핑을 정의한다 <!-- omo:id=found-accept-token-mapping;stage=4;scope=frontend;review=5,6 -->
- [x] Exclusion inventory가 h7 prototype-only exclusions를 구체 자산/폰트 수준으로 열거한다 <!-- omo:id=found-accept-exclusion-list;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] 이 슬라이스가 API, DB, status-transition, permission, auth, read-only 동작을 변경하지 않는다 <!-- omo:id=found-accept-no-contract-change;stage=4;scope=frontend;review=5,6 -->
- [x] h7 direction gate의 Near-100% Definition, Supersession Matrix, Visual Verdict Method가 변경 없이 상속된다 <!-- omo:id=found-accept-h7-inherited;stage=4;scope=frontend;review=5,6 -->
- [x] h7 prototype-only exclusions가 보존된다 (Jua, RECIPE_DETAIL tabs/reviews, PANTRY/MYPAGE production, prototype-only assets, bottom tabs) <!-- omo:id=found-accept-exclusions-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 공식 source-of-truth 문서(요구사항/화면정의서/유저Flow/API/DB)가 변경되지 않는다 <!-- omo:id=found-accept-no-docs-change;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] 해당 없음 — 이 슬라이스에는 runtime UI가 없으므로 loading/empty/error/unauthorized/read-only 상태가 적용되지 않는다 <!-- omo:id=found-accept-no-ui-states;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 새 endpoint, field, table, status, seed data가 도입되지 않는다 <!-- omo:id=found-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 fixture, route, component에 대한 수정이 없다 <!-- omo:id=found-accept-no-existing-change;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] Scored parity 슬라이스용 공통 fixture baseline 규칙이 정의되어 있다 <!-- omo:id=found-accept-fixture-baseline-defined;stage=4;scope=frontend;review=5,6 -->
- [x] Route-entry point 규칙이 surface별로 정의되어 있다 <!-- omo:id=found-accept-route-entry-defined;stage=4;scope=frontend;review=5,6 -->
- [x] 이 sliced에서 fixture 변경이나 real DB smoke가 필요하지 않다 <!-- omo:id=found-accept-no-fixture-change;stage=4;scope=frontend;review=5,6 -->

## Design Authority / Visual Evidence

- [x] 3-way capture는 viewport `390px` + `320px`를 필수로 포함한다 <!-- omo:id=found-accept-viewport-pair;stage=4;scope=frontend;review=5,6 -->
- [x] Required states 체크리스트가 h7 required-state matrix와 일치한다 (HOME 7, RECIPE_DETAIL 7, PLANNER_WEEK 7, Modal 5) <!-- omo:id=found-accept-required-states-match;stage=4;scope=frontend;review=5,6 -->
- [x] Score composition(skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15)이 h7과 동일하다 <!-- omo:id=found-accept-score-composition;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score 가중치(390px 70% + 320px 30%)가 h7과 동일하다 <!-- omo:id=found-accept-score-weight;stage=4;scope=frontend;review=5,6 -->
- [x] Merge threshold(HOME>=95, RECIPE_DETAIL>=95, PLANNER_WEEK>=94, Modal>=93)가 h7과 동일하다 <!-- omo:id=found-accept-thresholds;stage=4;scope=frontend;review=5,6 -->
- [x] Authority blocker count 0 요건이 명시되어 있다 <!-- omo:id=found-accept-blocker-zero;stage=4;scope=frontend;review=5,6 -->
- [x] Body screen score와 overlay score가 독립 게이트로 취급된다 <!-- omo:id=found-accept-score-independence;stage=4;scope=frontend;review=5,6 -->
- [x] Capture 파일 경로 규약이 확정되어 있다 <!-- omo:id=found-accept-capture-paths;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Docs / Evidence Harness (Stage 4)

- [x] Capture recipe 문서가 생성되었다 <!-- omo:id=found-accept-capture-doc;stage=4;scope=frontend;review=5,6 -->
- [x] Artifact schema 문서가 생성되었다 <!-- omo:id=found-accept-artifact-doc;stage=4;scope=frontend;review=5,6 -->
- [x] Evidence harness script 또는 template이 필요 시 생성되었다 <!-- omo:id=found-accept-harness-created;stage=4;scope=frontend;review=5,6 -->
- [x] `git diff --check` 통과 <!-- omo:id=found-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=found-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workpack` 통과 <!-- omo:id=found-accept-workpack;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- 사용자 최종 taste approval (scored parity 슬라이스에서 실행)
- h7 prototype-only exclusion의 향후 promotion 결정
- score waiver 판단 (h7 waiver 조건 기반)
