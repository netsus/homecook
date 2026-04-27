# Acceptance Checklist: baemin-style-modal-system-fit

> Modal/sheet 오버레이 패밀리의 배민 스타일 시각 정합.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).
> `Manual Only`를 제외한 각 체크박스에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### LoginGateModal H5 합류

- [ ] LoginGateModal이 ModalHeader 공유 컴포넌트를 사용함 <!-- omo:id=bsmsf-accept-login-modal-header;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal close button이 icon-only 44x44 원형 (H5 D3) <!-- omo:id=bsmsf-accept-login-close;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal "보호된 작업" eyebrow badge 제거됨 (H5 D2) <!-- omo:id=bsmsf-accept-login-eyebrow;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal 제목/description/social login 구조 보존 <!-- omo:id=bsmsf-accept-login-structure;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal return-to-action 기능 보존 <!-- omo:id=bsmsf-accept-login-return;stage=4;scope=frontend;review=5,6 -->

### Modal Surface Token Fit

- [ ] ModalHeader의 shadow/radius/surface 토큰이 배민 스타일과 일관됨 <!-- omo:id=bsmsf-accept-header-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] ModalFooterActions의 olive CTA + cancel 토큰이 일관됨 <!-- omo:id=bsmsf-accept-footer-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilterModal panel/skeleton/footer 토큰이 배민 스타일과 일관됨 <!-- omo:id=bsmsf-accept-ingredient-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] SortMenu mobile sheet의 surface/shadow/radius 토큰이 일관됨 <!-- omo:id=bsmsf-accept-sort-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAddSheet panel/loading/error 토큰이 배민 스타일과 일관됨 <!-- omo:id=bsmsf-accept-planner-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] SaveModal panel/book rows/loading/error 토큰이 배민 스타일과 일관됨 <!-- omo:id=bsmsf-accept-save-tokens;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 모든 리스타일이 `app/globals.css` CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bsmsf-accept-token-usage;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D1 보존: olive accent + thin orange highlight 정책 <!-- omo:id=bsmsf-accept-d1;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D2 보존: 인터랙션 모달 eyebrow 기본 제거 (LoginGateModal 포함) <!-- omo:id=bsmsf-accept-d2;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D3 보존: close = icon-only 44x44 (LoginGateModal 포함) <!-- omo:id=bsmsf-accept-d3;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D4 보존: PlannerAdd 날짜 chip = 요일 + M/D 변경 없음 <!-- omo:id=bsmsf-accept-d4;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D5 보존: Save 제목 = 레시피 저장 변경 없음 <!-- omo:id=bsmsf-accept-d5;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D6 보존: modal family 통일 (LoginGateModal 합류로 완성) <!-- omo:id=bsmsf-accept-d6;stage=4;scope=frontend;review=5,6 -->
- [ ] 기능 플로우 불변: 정렬 즉시 적용, PlannerAdd 성공 동작, Save 성공 동작, Filter 적용 흐름 <!-- omo:id=bsmsf-accept-flow-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 TypeScript props 인터페이스 보존 — visual-only 변경 <!-- omo:id=bsmsf-accept-props-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] LoginGateModal 비로그인 보호 작업 게이트 기능 보존 <!-- omo:id=bsmsf-accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal Escape 키 닫기 보존 <!-- omo:id=bsmsf-accept-login-escape;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilterModal error state 보존 (ContentState error with retry) <!-- omo:id=bsmsf-accept-ingredient-error;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilterModal empty state 보존 <!-- omo:id=bsmsf-accept-ingredient-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAddSheet error state 보존 (retry 버튼) <!-- omo:id=bsmsf-accept-planner-error;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAddSheet loading state 보존 (skeleton) <!-- omo:id=bsmsf-accept-planner-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] SaveModal loading state 보존 <!-- omo:id=bsmsf-accept-save-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] SaveModal error state 보존 <!-- omo:id=bsmsf-accept-save-error;stage=4;scope=frontend;review=5,6 -->
- [ ] Jua 또는 prototype-only 폰트 미사용 <!-- omo:id=bsmsf-accept-no-font;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] API field, endpoint, table, status, seed data 미변경 <!-- omo:id=bsmsf-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive`, `--cook-*` 토큰 값 미변경 <!-- omo:id=bsmsf-accept-token-values-stable;stage=4;scope=frontend;review=5,6 -->

## Scope Guard

- [ ] Runtime app code diff가 선언된 7개 파일로 제한됨; docs, evidence, workflow, test 파일은 지원 artifact로 허용 <!-- omo:id=bsmsf-accept-scope-guard;stage=4;scope=frontend;review=5,6 -->
- [ ] `components/ui/*` 프리미티브 파일 미수정 (소비만) <!-- omo:id=bsmsf-accept-no-ui-edit;stage=4;scope=frontend;review=5,6 -->
- [ ] 앵커 화면(HOME, RECIPE_DETAIL, PLANNER_WEEK) 본문 리스타일 없음 <!-- omo:id=bsmsf-accept-no-anchor-edit;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 shared 컴포넌트(OptionRow, SelectionChipRail, NumericStepperCompact) 구조/API 변경 없음 <!-- omo:id=bsmsf-accept-no-h5-shared-change;stage=4;scope=frontend;review=5,6 -->
- [ ] 프로토타입 `HANDOFF.md`는 REFERENCE ONLY로 사용 — 직접 복사 금지 <!-- omo:id=bsmsf-accept-handoff-reference-only;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [ ] LoginGateModal before/after screenshots 캡처 (H5 합류 전후) <!-- omo:id=bsmsf-accept-login-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] 4개 interaction modal (PlannerAdd, Save, IngredientFilter, Sort) 정합 후 screenshots <!-- omo:id=bsmsf-accept-interaction-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Mobile default(390px)에서 모달 horizontal overflow 없음 <!-- omo:id=bsmsf-accept-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal에서 소셜 로그인 버튼 클리핑 없음 <!-- omo:id=bsmsf-accept-no-clip;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] `h5-modal-system-redesign`가 merge된 후 구현 시작 <!-- omo:id=bsmsf-accept-h5-merged;stage=4;scope=frontend;review=6 -->
- [ ] `baemin-style-planner-week-retrofit`가 merge된 후 구현 시작 <!-- omo:id=bsmsf-accept-planner-retrofit-merged;stage=4;scope=frontend;review=6 -->
- [ ] Fixture 변경 불필요 <!-- omo:id=bsmsf-accept-no-fixture;stage=4;scope=frontend;review=6 -->

## Automation

- [ ] `git diff --check` 통과 <!-- omo:id=bsmsf-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` 통과 <!-- omo:id=bsmsf-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm typecheck` 통과 <!-- omo:id=bsmsf-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm lint` 통과 <!-- omo:id=bsmsf-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=bsmsf-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bsmsf-accept-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 사용자 최종 시각적 느낌 확인 (merge 후)
- [ ] LoginGateModal H5 합류 결과가 modal family와 일관적인지 사용자 확인
- [ ] 모든 모달/시트가 배민 스타일 앵커 화면과 시각적으로 어울리는지 사용자 확인
- [ ] Desktop 화면에서 모달 레이아웃 sanity check
