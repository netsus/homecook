# Acceptance Checklist: baemin-style-planner-week-retrofit

> PLANNER_WEEK anchor screen visual retrofit to Baemin-style design language.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).
> `Manual Only`를 제외한 각 체크박스에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Superseded note: 2026-04-27 Baemin prototype parity contract removes the planner-level "가로 스크롤 없음" lock. This acceptance file remains historical evidence for the merged retrofit slice.

## Happy Path

### PLANNER_WEEK Screen Retrofit

- [x] PlannerWeekScreen hero section이 토큰 기반 panel/border/shadow로 표시됨 (`glass-panel` 제거) <!-- omo:id=bspwr-accept-hero;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen secondary CTA toolbar이 토큰 기반 surface/shadow로 표시됨 (hardcoded rgba shadow → token/color-mix) <!-- omo:id=bspwr-accept-cta-toolbar;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen 장보기 CTA가 토큰 기반 brand + `text-[var(--surface)]`로 표시됨 <!-- omo:id=bspwr-accept-cta-brand;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen week context bar가 토큰 기반 panel/shadow로 표시됨 (`glass-panel` + `bg-white/88` 제거) <!-- omo:id=bspwr-accept-week-context;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen weekday strip items가 토큰 기반 radii로 표시됨 <!-- omo:id=bspwr-accept-weekday-strip;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen day cards가 토큰 기반 panel/border/shadow로 표시됨 (`glass-panel` 제거) <!-- omo:id=bspwr-accept-day-cards;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen weekday badge가 토큰 기반 radii + `text-[var(--surface)]`로 표시됨 <!-- omo:id=bspwr-accept-weekday-badge;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen slot row의 leftover meal 텍스트가 `text-[var(--olive)]`로 표시됨 <!-- omo:id=bspwr-accept-leftover-text;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen serving chip이 토큰 기반 `bg-[var(--surface)]`로 표시됨 <!-- omo:id=bspwr-accept-serving-chip;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen STATUS_META 상태 chip이 `color-mix()` 파생으로 동일하게 렌더됨 <!-- omo:id=bspwr-accept-status-meta;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen loading skeleton이 토큰 기반 surface/radius로 표시됨 <!-- omo:id=bspwr-accept-skeleton;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen empty state가 토큰 기반 panel/radius로 표시됨 <!-- omo:id=bspwr-accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] PlannerWeekScreen unauthorized state가 토큰 기반 surface/radius로 표시됨 <!-- omo:id=bspwr-accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] `components/ui/` 공유 프리미티브가 적합한 곳에서 소비됨 (Skeleton) <!-- omo:id=bspwr-accept-ui-consumed;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] 모든 리스타일이 `app/globals.css` CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bspwr-accept-token-usage;stage=4;scope=frontend;review=5,6 -->
- [x] Brand tokens 사용: `--brand` (#ED7470), `--brand-deep` (#C84C48), `--brand-soft` (#FDEBEA) <!-- omo:id=bspwr-accept-brand-tokens;stage=4;scope=frontend;review=5,6 -->
- [x] Additive tokens 사용 (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`) <!-- omo:id=bspwr-accept-additive-tokens;stage=4;scope=frontend;review=5,6 -->
- [x] `STATUS_META` rgba → `color-mix()` 전환 후 시각적 결과 보존 <!-- omo:id=bspwr-accept-status-tint-visual;stage=4;scope=frontend;review=5,6 -->
- [x] `--olive` 사용 보존 (STATUS_META shopping_done, range context label) <!-- omo:id=bspwr-accept-olive-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK 정보 구조 보존: hero, CTA toolbar, week context bar, weekday strip, day cards, slot rows 순서 미변경 <!-- omo:id=bspwr-accept-structure-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] H2/H4 day-card interaction contract 보존: 세로 스크롤 전용, 가로 스크롤 없음, 2일 이상 mobile overview <!-- omo:id=bspwr-accept-h2h4-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] Weekday strip swipe/keyboard navigation 동작 보존 <!-- omo:id=bspwr-accept-strip-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 TypeScript props 인터페이스 보존 — visual-only 변경 <!-- omo:id=bspwr-accept-props-preserved;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] checking 상태 보존 (ContentState loading tone) <!-- omo:id=bspwr-accept-checking;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 상태 보존 (ContentState gate tone + SocialLoginButtons) <!-- omo:id=bspwr-accept-unauthorized-state;stage=4;scope=frontend;review=5,6 -->
- [x] loading 상태 보존 (skeleton cards) <!-- omo:id=bspwr-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태 보존 (ContentState error with retry) <!-- omo:id=bspwr-accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태 보존 (empty message + day cards with empty slots) <!-- omo:id=bspwr-accept-empty-state;stage=4;scope=frontend;review=5,6 -->
- [x] Jua 또는 prototype-only 폰트 미사용 <!-- omo:id=bspwr-accept-no-font;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] API field, endpoint, table, status, seed data 미변경 <!-- omo:id=bspwr-accept-no-data-change;stage=4;scope=frontend;review=5,6 -->
- [x] `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive` 토큰 값 미변경 <!-- omo:id=bspwr-accept-c2-values-stable;stage=4;scope=frontend;review=5,6 -->

## Scope Guard

- [x] Runtime app code diff가 `components/planner/planner-week-screen.tsx`로 제한됨; docs, evidence, workflow, test 파일은 지원 artifact로 허용 <!-- omo:id=bspwr-accept-scope-guard;stage=4;scope=frontend;review=5,6 -->
- [x] `components/ui/*` 프리미티브 파일 미수정 (소비만) <!-- omo:id=bspwr-accept-no-ui-edit;stage=4;scope=frontend;review=5,6 -->
- [x] 다른 화면(HOME, RECIPE_DETAIL 등) 리트로핏 없음 <!-- omo:id=bspwr-accept-no-other-screen;stage=4;scope=frontend;review=5,6 -->
- [x] BottomTabs, AppShell 구조 변경 없음 <!-- omo:id=bspwr-accept-no-shell-change;stage=4;scope=frontend;review=5,6 -->
- [x] 프로토타입 `HANDOFF.md`는 REFERENCE ONLY로 사용 — 직접 복사 금지 <!-- omo:id=bspwr-accept-handoff-reference-only;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype hero+transparent AppBar fade 미구현 (out of scope) <!-- omo:id=bspwr-accept-no-proto-features;stage=4;scope=frontend;review=5,6 -->

## Visual Evidence

- [x] PLANNER_WEEK before/after screenshots 캡처 (mobile default 390px) <!-- omo:id=bspwr-accept-before-after-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK after screenshot 캡처 (narrow 320px) <!-- omo:id=bspwr-accept-after-narrow;stage=4;scope=frontend;review=5,6 -->
- [x] Key active state screenshots (loading skeleton, empty state, unauthorized, scrolled day cards) <!-- omo:id=bspwr-accept-active-states;stage=4;scope=frontend;review=5,6 -->
- [x] Mobile default(390px) 및 320px에서 horizontal overflow 없음 <!-- omo:id=bspwr-accept-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [x] Brand-colored 요소 내 텍스트 클리핑 없음 <!-- omo:id=bspwr-accept-no-text-clip;stage=4;scope=frontend;review=5,6 -->
- [x] STATUS_META 상태 chip의 시각적 결과 보존 확인 <!-- omo:id=bspwr-accept-status-tint-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] 390px에서 2일 이상 day card overview 자연 노출 확인 <!-- omo:id=bspwr-accept-2day-overview;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] `baemin-style-recipe-detail-retrofit`가 merge된 후 구현 시작 <!-- omo:id=bspwr-accept-recipe-detail-merged;stage=4;scope=frontend;review=6 -->
- [x] `baemin-style-shared-components`가 merge된 후 구현 시작 <!-- omo:id=bspwr-accept-shared-merged;stage=4;scope=frontend;review=6 -->
- [x] Fixture 변경 불필요 <!-- omo:id=bspwr-accept-no-fixture;stage=4;scope=frontend;review=6 -->

## Automation

- [x] `git diff --check` 통과 <!-- omo:id=bspwr-accept-diff-check;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=bspwr-accept-workflow-v2;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm typecheck` 통과 <!-- omo:id=bspwr-accept-typecheck;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm lint` 통과 <!-- omo:id=bspwr-accept-lint;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 통과 <!-- omo:id=bspwr-accept-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [x] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bspwr-accept-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 사용자 최종 시각적 느낌 확인 (merge 후)
- [ ] 리트로핏된 PLANNER_WEEK이 배민 스타일 방향과 일관적인지 사용자 확인
- [ ] Desktop 화면에서 PLANNER_WEEK 전체 레이아웃 sanity check
- [ ] STATUS_META 상태 chip의 `color-mix()` 전환 결과가 기존 rgba와 시각적으로 동등한지 사용자 확인
- [ ] 390px에서 2일 이상 overview가 자연스럽게 보이는지 사용자 확인
