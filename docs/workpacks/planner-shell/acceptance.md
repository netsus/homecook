# Acceptance Checklist

> Stage 1 locks future shell and anchor evidence. Unchecked items do not claim runtime, refreshed design, browser evidence, #12 UI or #13 tombstones exist.

## Shell / Navigation

- [ ] existing Planner route and bottom tab remain; no new tab or parallel route <!-- omo:id=accept-planner-shell-route;stage=4;scope=frontend;review=5,6 -->
- [ ] internal segment has exactly `요리 계획|식사 기록` with PLANNER_WEEK/MEAL_LOG ownership <!-- omo:id=accept-planner-shell-segments;stage=4;scope=frontend;review=5,6 -->
- [ ] selected date is preserved and plan/log scroll-input state remains isolated <!-- omo:id=accept-planner-shell-state-isolation;stage=4;scope=frontend;review=5,6 -->
- [ ] route/deep-link/back returns to originating segment/date without duplicate history <!-- omo:id=accept-planner-shell-history;stage=4;scope=frontend;review=5,6 -->
- [ ] focus, keyboard order, tab semantics, accessible names and reduced motion are correct <!-- omo:id=accept-planner-shell-a11y;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized actions preserve return context without rendering private data <!-- omo:id=accept-planner-shell-auth-return;stage=4;scope=frontend;review=3,5,6 -->
- [ ] missing/disabled #12 fails closed while 요리 계획 remains usable <!-- omo:id=accept-planner-shell-log-disabled;stage=4;scope=frontend;review=5,6 -->

## Plan-only PLANNER_WEEK

- [ ] Recipe Meal status and shopping/cooking actions remain unchanged <!-- omo:id=accept-planner-shell-meal-workflow;stage=4;scope=frontend;review=5,6 -->
- [ ] cook_done is never displayed as consumed or goal completion <!-- omo:id=accept-planner-shell-no-consumed;stage=4;scope=frontend;review=5,6 -->
- [ ] pinned keep content and legacy_backfill copy remain authoritative <!-- omo:id=accept-planner-shell-pinned-content;stage=4;scope=frontend;review=5,6 -->
- [ ] plan nutrition card and new GET /planner/nutrition UI calls are removed <!-- omo:id=accept-planner-shell-remove-plan-nutrition;stage=4;scope=frontend;review=5,6 -->
- [ ] new product add and quantity-edit UI are removed <!-- omo:id=accept-planner-shell-remove-product-write;stage=4;scope=frontend;review=5,6 -->
- [ ] completed shopping stays read-only with no recipe-reconcile CTA <!-- omo:id=accept-planner-shell-shopping-readonly;stage=4;scope=frontend;review=5,6 -->

## Legacy / Boundary

- [ ] historical product cards show pinned identity/quantity in a read-only section <!-- omo:id=accept-planner-shell-legacy-card;stage=4;scope=frontend;review=5,6 -->
- [ ] same-screen detail shows pinned nutrition; no new detail route <!-- omo:id=accept-planner-shell-legacy-detail;stage=4;scope=frontend;review=5,6 -->
- [ ] owner delete is the only legacy mutation and preserves nondisclosure <!-- omo:id=accept-planner-shell-legacy-delete;stage=4;scope=shared;review=3,5,6 -->
- [ ] no auto meal-log migration, current-version repin, cook/shop/XP/status action <!-- omo:id=accept-planner-shell-no-legacy-expansion;stage=4;scope=shared;review=3,5,6 -->
- [ ] GET /planner/nutrition, legacy GET/delete and v1 cursor survive at least one compatibility release and until #13 approved compatibility evidence/tombstone contract <!-- omo:id=accept-planner-shell-compat-floor;stage=2;scope=shared;review=3,6 -->
- [ ] HOME remains recipe-only and unified food search is not added there <!-- omo:id=accept-planner-shell-home-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] #12 owns MEAL_LOG UI and #13 owns tombstones <!-- omo:id=accept-planner-shell-successor-boundary;stage=2;scope=shared;review=3,5,6 -->

## UI States / Authority

- [ ] loading/empty/error/unauthorized/shopping-readonly/legacy-readonly are distinct <!-- omo:id=accept-planner-shell-states;stage=4;scope=frontend;review=5,6 -->
- [ ] registered 장보기 and shopping_done 요리하기 stay primary, 상세/남은요리 stay secondary, and legacy 삭제 stays destructive tertiary; 320px wraps in that order <!-- omo:id=accept-planner-shell-cta-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [ ] canonical PLANNER_WEEK design refresh and independent critic pass before Stage 2 <!-- omo:id=accept-planner-shell-design-critic;stage=2;scope=frontend;review=5,6 -->
- [ ] 390px/320px/desktop evidence covers density, focus, back and no overflow <!-- omo:id=accept-planner-shell-design-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] refreshed product-design-authority report approves before confirmed <!-- omo:id=accept-planner-shell-authority;stage=4;scope=frontend;review=5,6 -->

## Contract / Verification

- [ ] no unofficial API, route, field, status, bottom tab or writer is added <!-- omo:id=accept-planner-shell-no-invention;stage=2;scope=shared;review=3,5,6 -->
- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-planner-shell-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] implementation records failing component/route-history tests before code <!-- omo:id=accept-planner-shell-tdd-red;stage=2;scope=frontend;review=5,6 -->
- [ ] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-planner-shell-independent-review;stage=2;scope=shared;review=3,5,6 -->
- [ ] every check started for the current head SHA is terminal green or intended skip; post-merge master QA/Policy/Security/Vercel are green <!-- omo:id=accept-planner-shell-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: 390px/320px/desktop, keyboard/screen reader, history/back, merged-exact-SHA remote read-only
- scenarios: both segments, auth return, #12 unavailable, plan states, legacy read/detail/delete, completed shopping

## Manual Only

- [ ] legacy endpoint/tombstone removal occurs only under #13 approved compatibility evidence
