# Acceptance Checklist: baemin-style-home-retrofit

> HOME anchor screen visual retrofit to Baemin-style design language.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).
> `Manual Only`를 제외한 각 체크박스에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

### HOME Screen Retrofit

- [x] Discovery panel(검색바, 재료필터 버튼)이 배민 스타일 토큰으로 리스타일됨 <!-- omo:id=bshr-accept-discovery-panel;stage=4;scope=frontend;review=5,6 -->
- [x] RecipeCard가 토큰 기반 surface/shadow/badge/stats로 표시됨 <!-- omo:id=bshr-accept-recipe-card;stage=4;scope=frontend;review=5,6 -->
- [x] ThemeCarouselStrip/Card가 토큰 기반 card surface/shadow로 표시됨 <!-- omo:id=bshr-accept-theme-carousel;stage=4;scope=frontend;review=5,6 -->
- [x] SortMenu(mobile sheet + desktop dropdown)가 토큰 기반으로 리스타일됨 <!-- omo:id=bshr-accept-sort-menu;stage=4;scope=frontend;review=5,6 -->
- [x] AppHeader가 토큰 기반 surface/shadow로 리스타일됨 <!-- omo:id=bshr-accept-app-header;stage=4;scope=frontend;review=5,6 -->
- [x] IngredientFilterModal 잔여 inline 스타일이 토큰으로 교체됨 <!-- omo:id=bshr-accept-ingredient-modal;stage=4;scope=frontend;review=5,6 -->
- [x] Skeleton 컴포넌트가 `Skeleton` primitive 또는 토큰 기반 스타일 사용 <!-- omo:id=bshr-accept-skeleton;stage=4;scope=frontend;review=5,6 -->
- [x] `components/ui/` 공유 프리미티브가 적합한 곳에서 소비됨 (Card, Badge, Chip, Skeleton, EmptyState, ErrorState) <!-- omo:id=bshr-accept-ui-consumed;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] 모든 리스타일이 `app/globals.css` CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bshr-accept-token-usage;stage=4;scope=frontend;review=5,6 -->
- [x] Brand tokens 사용: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA) <!-- omo:id=bshr-accept-brand-tokens;stage=4;scope=frontend;review=5,6 -->
- [x] Additive tokens 사용 (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`) <!-- omo:id=bshr-accept-additive-tokens;stage=4;scope=frontend;review=5,6 -->
- [x] `--cook-*` 조리방법 토큰 미변경 <!-- omo:id=bshr-accept-cook-stable;stage=4;scope=frontend;review=5,6 -->
- [x] `--olive` 사용 보존 (재료필터 per H5) <!-- omo:id=bshr-accept-olive-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] H1 정보 구조(D1-D4) 보존: 섹션 순서, 컨트롤 배치, 테마 처리 방식 미변경 <!-- omo:id=bshr-accept-h1-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] H5 modal 결정 보존: SortMenu sheet에서 icon close, olive accent(해당 시), eyebrow 제거 준수 <!-- omo:id=bshr-accept-h5-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 TypeScript props 인터페이스 보존 — visual-only 변경 <!-- omo:id=bshr-accept-props-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] loading 상태 보존 (ThemeCarouselSkeleton, RecipeListSkeleton) <!-- omo:id=bshr-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태 보존 (ContentState empty) <!-- omo:id=bshr-accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태 보존 (ContentState error with retry) <!-- omo:id=bshr-accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] Jua 또는 prototype-only 폰트 미사용 <!-- omo:id=bshr-accept-no-font;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] API field, endpoint, table, status, seed data 미변경 <!-- omo:id=bshr-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [x] `--cook-*` 토큰 값 미변경 <!-- omo:id=bshr-accept-cook-token-value;stage=4;scope=frontend;review=5,6 -->
- [x] `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` 토큰 값 미변경 <!-- omo:id=bshr-accept-c2-values-stable;stage=4;scope=frontend;review=5,6 -->

## Scope Guard

- [x] Runtime app code diff가 `components/home/*`, `components/layout/app-header.tsx`로 제한됨; docs, evidence, workflow, test 파일은 지원 artifact로 허용 <!-- omo:id=bshr-accept-scope-guard;stage=4;scope=frontend;review=5,6 -->
- [x] `components/ui/*` 프리미티브 파일 미수정 (소비만) <!-- omo:id=bshr-accept-no-ui-edit;stage=4;scope=frontend;review=5,6 -->
- [x] 다른 화면(RECIPE_DETAIL, PLANNER_WEEK 등) 리트로핏 없음 <!-- omo:id=bshr-accept-no-other-screen;stage=4;scope=frontend;review=5,6 -->
- [x] BottomTabs, AppShell 구조 변경 없음 <!-- omo:id=bshr-accept-no-shell-change;stage=4;scope=frontend;review=5,6 -->
- [x] 프로토타입 `HANDOFF.md`는 REFERENCE ONLY로 사용 — 직접 복사 금지 <!-- omo:id=bshr-accept-handoff-reference-only;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [x] HOME before/after screenshots 캡처 (mobile default 390px) <!-- omo:id=bshr-accept-before-after-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] HOME after screenshot 캡처 (narrow 320px) <!-- omo:id=bshr-accept-after-narrow;stage=4;scope=frontend;review=5,6 -->
- [x] Key active state screenshots (sort sheet open, ingredient filter active) <!-- omo:id=bshr-accept-active-states;stage=4;scope=frontend;review=5,6 -->
- [x] Loading/empty/error state screenshots <!-- omo:id=bshr-accept-state-screenshots;stage=4;scope=frontend;review=5,6 -->
- [x] Mobile default(390px) 및 320px에서 horizontal overflow 없음 <!-- omo:id=bshr-accept-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [x] Brand-colored 요소 내 텍스트 클리핑 없음 <!-- omo:id=bshr-accept-no-text-clip;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] `baemin-style-shared-components`가 merge된 후 구현 시작 <!-- omo:id=bshr-accept-shared-merged;stage=4;scope=frontend;review=6 -->
- [x] `h1-home-first-impression`이 merge된 후 구현 시작 <!-- omo:id=bshr-accept-h1-merged;stage=4;scope=frontend;review=6 -->
- [x] Fixture 변경 불필요 <!-- omo:id=bshr-accept-no-fixture;stage=4;scope=frontend;review=6 -->

## Automation

- [x] `git diff --check` 통과 <!-- omo:id=bshr-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=bshr-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm typecheck` 통과 <!-- omo:id=bshr-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm lint` 통과 <!-- omo:id=bshr-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 통과 <!-- omo:id=bshr-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [x] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bshr-accept-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 사용자 최종 시각적 느낌 확인 (merge 후)
- [ ] 리트로핏된 HOME이 배민 스타일 방향과 일관적인지 사용자 확인
- [ ] Desktop 화면에서 HOME 전체 레이아웃 sanity check
