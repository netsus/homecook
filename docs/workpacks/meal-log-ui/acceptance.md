# Acceptance Checklist

> Stage 1 locks future MEAL_LOG UI and evidence. Unchecked items do not claim runtime or design evidence exists.

## Day / Sections

- [ ] existing Planner shell hosts MEAL_LOG with no new bottom tab/route <!-- omo:id=accept-meal-log-ui-shell;stage=4;scope=frontend;review=5,6 -->
- [ ] 7-day strip shows one selected day and no weekly analysis <!-- omo:id=accept-meal-log-ui-day-strip;stage=4;scope=frontend;review=5,6 -->
- [ ] stored consumed_local_date controls grouping without current-timezone regroup <!-- omo:id=accept-meal-log-ui-date-authority;stage=4;scope=shared;review=3,5,6 -->
- [ ] day total and meal subtotals preserve incomplete counts and never treat unavailable as zero <!-- omo:id=accept-meal-log-ui-totals;stage=4;scope=shared;review=3,5,6 -->
- [ ] deleted meal-column history is read-only and cannot receive new entries <!-- omo:id=accept-meal-log-ui-deleted-column;stage=4;scope=shared;review=3,5,6 -->
- [ ] soft-deleted entries are absent from day reads and active aggregates <!-- omo:id=accept-meal-log-ui-deleted-entry-absence;stage=4;scope=shared;review=3,5,6 -->
- [ ] entries show exact label/brand/badge/quantity/nutrition state/edit/delete <!-- omo:id=accept-meal-log-ui-entry-display;stage=4;scope=frontend;review=5,6 -->

## Add Sheet / Search

- [ ] sheet preselects active date/meal and restores route/scroll/focus on close <!-- omo:id=accept-meal-log-ui-sheet-context;stage=4;scope=frontend;review=5,6 -->
- [ ] source switch is exactly 요리한 음식|제품·재료 <!-- omo:id=accept-meal-log-ui-source-switch;stage=4;scope=frontend;review=5,6 -->
- [ ] empty query shows owner/generation recent/frequent and confirms suggested amount <!-- omo:id=accept-meal-log-ui-recent;stage=4;scope=frontend;review=3,5,6 -->
- [ ] cooked cards show date/name/finished/remaining/weight state; missing/unrecoverable blocks g save <!-- omo:id=accept-meal-log-ui-batch-card;stage=4;scope=shared;review=3,5,6 -->
- [ ] product/ingredient typed union uses one server order/cursor with no client merge <!-- omo:id=accept-meal-log-ui-search-union;stage=4;scope=shared;review=3,5,6 -->
- [ ] exact product basis or ingredient conversion is required; missing conversion remains correctable 422 <!-- omo:id=accept-meal-log-ui-conversion;stage=4;scope=shared;review=3,5,6 -->

## Mutations / Security

- [ ] create/edit/delete use UUID idempotency; edit/delete use expected revision <!-- omo:id=accept-meal-log-ui-idempotency;stage=4;scope=shared;review=3,5,6 -->
- [ ] batch edit/delete targets only its own active consumed event and full replay <!-- omo:id=accept-meal-log-ui-batch-event;stage=4;scope=shared;review=3,5,6 -->
- [ ] product/ingredient edit pins exact evidence and never silently repins mutable current <!-- omo:id=accept-meal-log-ui-evidence-pin;stage=4;scope=shared;review=3,5,6 -->
- [ ] delete confirms destructive soft delete/reversal, offers cancel and restores invoking focus <!-- omo:id=accept-meal-log-ui-delete-confirm;stage=4;scope=frontend;review=5,6 -->
- [ ] local date/IANA timezone/nullable instant save together; unknown time is not fabricated <!-- omo:id=accept-meal-log-ui-timezone;stage=4;scope=shared;review=3,5,6 -->
- [ ] unauthorized preserves return context and other-owner/private/hidden sources remain nondisclosed <!-- omo:id=accept-meal-log-ui-auth;stage=4;scope=shared;review=3,5,6 -->

## States / Authority

- [ ] loading/empty/error/unauthorized/partial/unavailable/pending/replay/conflict are distinct <!-- omo:id=accept-meal-log-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] existing entry remains visible during scoped read error where safe <!-- omo:id=accept-meal-log-ui-error-preserve;stage=4;scope=frontend;review=5,6 -->
- [ ] canonical MEAL_LOG design and independent critique pass before Stage 2 <!-- omo:id=accept-meal-log-ui-design;stage=2;scope=frontend;review=5,6 -->
- [ ] 390px/320px/desktop evidence and fresh manifest cover all required states <!-- omo:id=accept-meal-log-ui-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] authority report approves density, strip/sheet containment, focus, 44px and no overflow <!-- omo:id=accept-meal-log-ui-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] no unofficial API/source/field/status/total/search merge is added <!-- omo:id=accept-meal-log-ui-no-invention;stage=2;scope=shared;review=3,5,6 -->
- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-meal-log-ui-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] implementation records failing component/history tests before code <!-- omo:id=accept-meal-log-ui-tdd-red;stage=2;scope=frontend;review=5,6 -->
- [ ] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-meal-log-ui-reviews;stage=2;scope=shared;review=3,5,6 -->
- [ ] current-head checks and post-merge QA/Policy/Security/Vercel are green/intended skip <!-- omo:id=accept-meal-log-ui-ci;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: 390px/320px/desktop, keyboard/screen reader, route/back/focus, current/immediate-previous client
- scenarios: selected day, deleted column history, soft-deleted entry absence, totals/incomplete, recent/search, three sources, create/edit/delete/replay/conflict

## Manual Only

- [ ] production enable only after #9 runtime and #10 shell plus required design/security evidence are green
