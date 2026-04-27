# Acceptance Checklist: baemin-style-recipe-detail-retrofit

> RECIPE_DETAIL anchor screen visual retrofit to Baemin-style design language.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).
> `Manual Only`를 제외한 각 체크박스에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### RECIPE_DETAIL Screen Retrofit

- [ ] RecipeDetailScreen hero gradient가 배민 스타일 토큰 기반 `color-mix()` gradient로 표시됨 <!-- omo:id=bsrdr-accept-hero;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen overview card가 토큰 기반 surface/shadow/border로 표시됨 (`glass-panel` 제거) <!-- omo:id=bsrdr-accept-overview;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen tag chips가 토큰 기반 olive tint로 표시됨 <!-- omo:id=bsrdr-accept-tags;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen utility metrics row가 토큰 기반 tone으로 표시됨 <!-- omo:id=bsrdr-accept-metrics;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen action buttons(ActionButton, MetricActionButton, IconActionButton)가 토큰 기반 tone으로 표시됨 <!-- omo:id=bsrdr-accept-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen serving stepper가 토큰 기반 surface로 표시됨 <!-- omo:id=bsrdr-accept-stepper;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen ingredient list가 토큰 기반 surface/text로 표시됨 <!-- omo:id=bsrdr-accept-ingredients;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen step cards가 토큰 기반 surface로 표시되고 cooking method 배지 tint가 `color-mix()` 파생으로 동일하게 렌더됨 <!-- omo:id=bsrdr-accept-steps;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen feedback toasts가 토큰 기반으로 표시됨 <!-- omo:id=bsrdr-accept-toasts;stage=4;scope=frontend;review=5,6 -->
- [ ] RecipeDetailScreen loading skeleton이 토큰 기반 surface/radius로 표시됨 <!-- omo:id=bsrdr-accept-skeleton;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAddSheet가 토큰 기반 modal chrome으로 표시됨 (H5 decisions 보존) <!-- omo:id=bsrdr-accept-planner-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] SaveModal이 토큰 기반 modal chrome으로 표시됨 (H5 decisions 보존) <!-- omo:id=bsrdr-accept-save-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal이 토큰 기반 modal chrome으로 표시됨 <!-- omo:id=bsrdr-accept-login-gate;stage=4;scope=frontend;review=5,6 -->
- [ ] `components/ui/` 공유 프리미티브가 적합한 곳에서 소비됨 (Badge, Skeleton) <!-- omo:id=bsrdr-accept-ui-consumed;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 모든 리스타일이 `app/globals.css` CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bsrdr-accept-token-usage;stage=4;scope=frontend;review=5,6 -->
- [ ] Brand tokens 사용: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA) <!-- omo:id=bsrdr-accept-brand-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] Additive tokens 사용 (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`) <!-- omo:id=bsrdr-accept-additive-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] `--cook-*` 조리방법 토큰 값 미변경 <!-- omo:id=bsrdr-accept-cook-stable;stage=4;scope=frontend;review=5,6 -->
- [ ] `COOKING_METHOD_TINTS` rgba → `color-mix()` 전환 후 시각적 결과 보존 <!-- omo:id=bsrdr-accept-cook-tint-visual;stage=4;scope=frontend;review=5,6 -->
- [ ] `--olive` 사용 보존 (PlannerAddSheet/SaveModal per H5) <!-- omo:id=bsrdr-accept-olive-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL 정보 구조 보존: overview, utility metrics, primary CTA, 재료, 스텝 순서 미변경 <!-- omo:id=bsrdr-accept-structure-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 modal 결정 보존: PlannerAddSheet/SaveModal에서 icon close, olive accent, eyebrow 제거 준수 <!-- omo:id=bsrdr-accept-h5-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 TypeScript props 인터페이스 보존 — visual-only 변경 <!-- omo:id=bsrdr-accept-props-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] loading 상태 보존 (RecipeDetailLoadingSkeleton) <!-- omo:id=bsrdr-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태 보존 (ContentState error with retry) <!-- omo:id=bsrdr-accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAddSheet loading/error 상태 보존 <!-- omo:id=bsrdr-accept-planner-states;stage=4;scope=frontend;review=5,6 -->
- [ ] SaveModal loading/ready/error 상태 보존 <!-- omo:id=bsrdr-accept-save-states;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal return-to-action 흐름 보존 <!-- omo:id=bsrdr-accept-rta-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] Jua 또는 prototype-only 폰트 미사용 <!-- omo:id=bsrdr-accept-no-font;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] API field, endpoint, table, status, seed data 미변경 <!-- omo:id=bsrdr-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [ ] `--cook-*` 토큰 값 미변경 <!-- omo:id=bsrdr-accept-cook-token-value;stage=4;scope=frontend;review=5,6 -->
- [ ] `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` 토큰 값 미변경 <!-- omo:id=bsrdr-accept-c2-values-stable;stage=4;scope=frontend;review=5,6 -->

## Scope Guard

- [ ] Runtime app code diff가 `components/recipe/*`, 조건부 `components/auth/login-gate-modal.tsx`로 제한됨; docs, evidence, workflow, test 파일은 지원 artifact로 허용 <!-- omo:id=bsrdr-accept-scope-guard;stage=4;scope=frontend;review=5,6 -->
- [ ] `components/ui/*` 프리미티브 파일 미수정 (소비만) <!-- omo:id=bsrdr-accept-no-ui-edit;stage=4;scope=frontend;review=5,6 -->
- [ ] 다른 화면(HOME, PLANNER_WEEK 등) 리트로핏 없음 <!-- omo:id=bsrdr-accept-no-other-screen;stage=4;scope=frontend;review=5,6 -->
- [ ] BottomTabs, AppShell 구조 변경 없음 <!-- omo:id=bsrdr-accept-no-shell-change;stage=4;scope=frontend;review=5,6 -->
- [ ] 프로토타입 `HANDOFF.md`는 REFERENCE ONLY로 사용 — 직접 복사 금지 <!-- omo:id=bsrdr-accept-handoff-reference-only;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype hero+transparent AppBar fade / tabs+reviews 미구현 (out of scope) <!-- omo:id=bsrdr-accept-no-proto-features;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [ ] RECIPE_DETAIL before/after screenshots 캡처 (mobile default 390px) <!-- omo:id=bsrdr-accept-before-after-mobile;stage=4;scope=frontend;review=5,6 -->
- [ ] RECIPE_DETAIL after screenshot 캡처 (narrow 320px) <!-- omo:id=bsrdr-accept-after-narrow;stage=4;scope=frontend;review=5,6 -->
- [ ] Key active state screenshots (planner-add sheet open, save modal open, login gate modal) <!-- omo:id=bsrdr-accept-active-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Loading/error state screenshots <!-- omo:id=bsrdr-accept-state-screenshots;stage=4;scope=frontend;review=5,6 -->
- [ ] Mobile default(390px) 및 320px에서 horizontal overflow 없음 <!-- omo:id=bsrdr-accept-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [ ] Brand-colored 요소 내 텍스트 클리핑 없음 <!-- omo:id=bsrdr-accept-no-text-clip;stage=4;scope=frontend;review=5,6 -->
- [ ] Cooking method 배지 tint의 시각적 결과 보존 확인 <!-- omo:id=bsrdr-accept-cook-tint-evidence;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] `baemin-style-home-retrofit`가 merge된 후 구현 시작 <!-- omo:id=bsrdr-accept-home-merged;stage=4;scope=frontend;review=6 -->
- [ ] `baemin-style-shared-components`가 merge된 후 구현 시작 <!-- omo:id=bsrdr-accept-shared-merged;stage=4;scope=frontend;review=6 -->
- [ ] Fixture 변경 불필요 <!-- omo:id=bsrdr-accept-no-fixture;stage=4;scope=frontend;review=6 -->

## Automation

- [ ] `git diff --check` 통과 <!-- omo:id=bsrdr-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm validate:workflow-v2` 통과 <!-- omo:id=bsrdr-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm typecheck` 통과 <!-- omo:id=bsrdr-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm lint` 통과 <!-- omo:id=bsrdr-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=bsrdr-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bsrdr-accept-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 사용자 최종 시각적 느낌 확인 (merge 후)
- [ ] 리트로핏된 RECIPE_DETAIL이 배민 스타일 방향과 일관적인지 사용자 확인
- [ ] Desktop 화면에서 RECIPE_DETAIL 전체 레이아웃 sanity check
- [ ] Cooking method 배지 tint의 `color-mix()` 전환 결과가 기존 rgba와 시각적으로 동등한지 사용자 확인
