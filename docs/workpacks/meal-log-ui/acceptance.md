# Acceptance Checklist

> Current successor lineage: remote #1349 head `bdd0280bddea8ad2caf32c98bd25ac65a70293fe` + security PR #1352 reviewed head `3708cd9fe3e86a85db17946b165ee6456c596af6` merged as latest master `fb1119baae72862efefdb1cad13cc811bbd91a1c`, then normal no-ff integration `f79cc89895e19e388422c4799f23cca5c095d6c0` (tree `b1bc3500da9ef9cbd0fb0b75359cac1d4abdd2f9`). Exact master post-merge checks were 13/13 success with fail/pending/rerun 0, and `postcss>nanoid` `3.3.18` leaves high/critical audit at 0 without changing #12 product contracts.
>
> Initial fetch matched expected `origin/master` `16cfce44d32d5b618742a0e20460df4772a19142`; base drift `c12afbccd15f4935a1a52b9f2c2c23882a5033ff` and latest `origin/master` `c4045705ef72c76f7e7258d10c460f56b6847dd7` were integrated without rebase/reset/force. Contract Evolution is N/A. The current official tuple is `v1.7.32 / v1.5.36 / v1.3.34 / DB v1.3.34 / API v1.2.39`; the approved repository plan remains SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines. #9 PR #1319 merged as `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` and #10 PR #1331 merged as `2185b59d1b460dac916aa4a4a5e061c8b795f0`. Current P1-ML-05 repair/review evidence is `019ffbbc-d4f1-7730-be56-0d8d6d28ce8c` / `019ffbc5-0c4a-7b11-afd9-6346a76b762c`, verdict `APPROVE P0/P1/P2 0/0/0`. Stage 1 independent internal1.5 `019ffc50-0573-7343-9d4d-00434f994398`, security/API `019ffc50-0573-7343-9d4d-002a97d92640`, five-axis/design `019ffc50-0572-7240-85fd-530ca4e8f5a2` reviews are all `APPROVE 0/0/0`; Stage 1 merge is `d5164357e85772833518c5e4766cef020735b7f1` with tree `f65303832851004f07df2b2ee6b3678cc6a56018`. Every edit save from a deleted/null origin requires explicit current active owner meal column selection; DELETE remains no relocation. Runtime Stage 4 evidence/final authority, Stage 5/6, Manual/server-Mac/OAuth/device/AT, R/R+1/R+2, production, and activation remain pending.

## Happy Path

- [x] existing Planner shell hosts MEAL_LOG with no new bottom tab/route <!-- omo:id=accept-meal-log-ui-shell;stage=4;scope=frontend;review=5,6 -->
- [x] 7-day strip shows one selected day and no weekly analysis <!-- omo:id=accept-meal-log-ui-day-strip;stage=4;scope=frontend;review=5,6 -->
- [x] entries show exact label/brand/badge/quantity/nutrition state/edit/delete <!-- omo:id=accept-meal-log-ui-entry-display;stage=4;scope=frontend;review=5,6 -->
- [x] sheet preselects active date/meal and restores route/scroll/focus on close <!-- omo:id=accept-meal-log-ui-sheet-context;stage=4;scope=frontend;review=5,6 -->
- [x] source switch is exactly 요리한 음식|제품·재료 <!-- omo:id=accept-meal-log-ui-source-switch;stage=4;scope=frontend;review=5,6 -->
- [x] empty query shows owner/generation recent/frequent and confirms suggested amount <!-- omo:id=accept-meal-log-ui-recent;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] stored consumed_local_date controls grouping without current-timezone regroup <!-- omo:id=accept-meal-log-ui-date-authority;stage=4;scope=shared;review=6 -->
- [x] day total is the server projection of all visible non-deleted entries and section subtotals, including deleted-column snapshot sections, with partial/unavailable counts included; server is authority <!-- omo:id=accept-meal-log-ui-totals;stage=4;scope=shared;review=6 -->
- [x] deleted column sections prohibit add CTA and new target only; existing entries retain edit and delete. every edit save from a deleted/null origin requires explicit current active owner meal column selection regardless of quantity/source/date/timezone fields; save fail-closed until selection; server replaces meal_plan_column_id + slot_name_snapshot. DELETE remains no relocation and focus returns to the invoking entry action or deleted section heading <!-- omo:id=accept-meal-log-ui-deleted-column;stage=4;scope=shared;review=6 -->
- [x] create/edit/delete use UUID idempotency; edit/delete use expected revision <!-- omo:id=accept-meal-log-ui-idempotency;stage=4;scope=shared;review=6 -->
- [x] batch edit/delete targets only its own active consumed event and full replay <!-- omo:id=accept-meal-log-ui-batch-event;stage=4;scope=shared;review=6 -->
- [x] product/ingredient edit pins exact evidence and never silently repins mutable current <!-- omo:id=accept-meal-log-ui-evidence-pin;stage=4;scope=shared;review=6 -->
- [x] local date/IANA timezone/nullable instant save together; unknown time is not fabricated <!-- omo:id=accept-meal-log-ui-timezone;stage=4;scope=shared;review=6 -->

## Error / Permission

- [x] loading/empty/error/unauthorized/partial/unavailable/pending/replay/conflict are distinct <!-- omo:id=accept-meal-log-ui-states;stage=4;scope=frontend;review=5,6 -->
- [x] existing entry remains visible during scoped read error where safe <!-- omo:id=accept-meal-log-ui-error-preserve;stage=4;scope=frontend;review=5,6 -->
- [x] cooked cards show date/name/finished/remaining/weight state; missing/unrecoverable blocks g save <!-- omo:id=accept-meal-log-ui-batch-card;stage=4;scope=shared;review=6 -->
- [x] exact product basis or ingredient conversion is required; missing conversion remains correctable 422 <!-- omo:id=accept-meal-log-ui-conversion;stage=4;scope=shared;review=6 -->
- [x] unauthorized preserves return context and other-owner/private/hidden sources remain nondisclosed <!-- omo:id=accept-meal-log-ui-auth;stage=4;scope=shared;review=6 -->
- [x] delete confirms destructive soft delete/reversal, offers cancel and restores invoking focus <!-- omo:id=accept-meal-log-ui-delete-confirm;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] soft-deleted entries are absent from day reads and active aggregates <!-- omo:id=accept-meal-log-ui-deleted-entry-absence;stage=2;scope=shared;review=3,6 -->
- [x] product/ingredient typed union uses one server order/cursor with no client merge <!-- omo:id=accept-meal-log-ui-search-union;stage=2;scope=shared;review=3,6 -->
- [x] no unofficial API/source/field/status/total/search merge is added <!-- omo:id=accept-meal-log-ui-no-invention;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [x] #9 backend runtime and #10 Planner shell merged-green contracts are consumed without broader Manual/activation promotion <!-- omo:id=accept-meal-log-ui-runtime-predecessors;stage=2;scope=shared;review=3,6 -->
- [x] canonical MEAL_LOG design and independent critique pass before Stage 2 — exact generator/repair/re-review provenance above, `APPROVE 0/0/0` <!-- omo:id=accept-meal-log-ui-design;stage=2;scope=shared;review=3,6 -->
- [x] 390px/320px/desktop evidence and fresh manifest cover all required states <!-- omo:id=accept-meal-log-ui-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] authority report approves density, strip/sheet containment, focus, 44px and no overflow <!-- omo:id=accept-meal-log-ui-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] pinned isolated-local fixtures and any controlled full-local read-only smoke keep target identity/checksum evidence separate <!-- omo:id=accept-meal-log-ui-local-only-boundary;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: 390px/320px/desktop, keyboard/screen reader, route/back/focus, current/immediate-previous client
- scenarios: selected day, deleted column history, soft-deleted entry absence, totals/incomplete, recent/search, three sources, create/edit/delete/replay/conflict

## Automation Split

### Vitest

- [x] Stage 1 regression invokes actual evaluateDocGate pass and checklist error count 0 <!-- omo:id=accept-meal-log-ui-doc-gate-regression;stage=2;scope=shared;review=3,6 -->
- [x] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-meal-log-ui-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [ ] implementation records failing component/history tests before code <!-- omo:id=accept-meal-log-ui-tdd-red;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-meal-log-ui-reviews;stage=2;scope=shared;review=3,6 -->

### Playwright

- [x] user flow, route/scroll/focus, mutation, replay and conflict are fixed in browser tests <!-- omo:id=accept-meal-log-ui-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] current-head checks and post-merge QA/Policy/Security/Vercel are green/intended skip <!-- omo:id=accept-meal-log-ui-ci;stage=4;scope=shared;review=6 -->

### Manual Only

- [ ] Manual/server-Mac/OAuth, controlled full-local physical-device/AT, capability R/R+1/R+2, production and activation evidence remain pending; #12 does not perform or claim them
