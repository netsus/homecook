# Acceptance Checklist

> Stage 1 locks future shell and anchor evidence. Unchecked items do not claim runtime, refreshed design, browser evidence, #12 UI or #13 tombstones exist.
>
> Official authority is the current tuple `v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37`, the governed plan artifact `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md` at SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines), and relock base/tree `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` / `6b67f32a3a404b2d7d60a9c231a394c2e17c6c9a`.

## Dependency / Ownership Gate

- [ ] exact chain remains `#8 -> #9 -> (#10,#11) -> #12 -> #13 -> #14`; no successor is promoted by this docs relock <!-- omo:id=accept-planner-shell-chain;stage=2;scope=shared;review=3,6 -->
- [ ] #9 PR #1319 exact head `be93bfc47281e2795c59c0fd1052a4ecf6085837` is consumed only as merged backend code at base `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`; Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, capability, R/R+1/R+2 and activation stay pending <!-- omo:id=accept-planner-shell-meal-log-core-readiness;stage=2;scope=shared;review=3,6 -->
- [x] #10 adds no DB schema/migration/RLS/RPC/public endpoint/field/status; Stage 2 backend implementation is N/A except compatibility contract tests <!-- omo:id=accept-planner-shell-no-backend-scope;stage=2;scope=shared;review=3,6 -->
- [ ] #11 COOK_MODE/LEFTOVERS, #12 MEAL_LOG body and #13 tombstone ownership remain untouched <!-- omo:id=accept-planner-shell-adjacent-ownership;stage=2;scope=shared;review=3,6 -->
- [ ] #12 implementation does not start until #10 runtime is separately implemented, reviewed, merged and green <!-- omo:id=accept-planner-shell-meal-log-ui-gate;stage=2;scope=shared;review=3,6 -->

## Shell / Navigation

- [x] existing Planner route and bottom tab remain; no new tab or parallel route <!-- omo:id=accept-planner-shell-route;stage=4;scope=frontend;review=5,6 -->
- [x] internal segment has exactly `요리 계획|식사 기록` with PLANNER_WEEK/MEAL_LOG ownership <!-- omo:id=accept-planner-shell-segments;stage=4;scope=frontend;review=5,6 -->
- [x] selected date is preserved and plan/log scroll-input state remains isolated <!-- omo:id=accept-planner-shell-state-isolation;stage=4;scope=frontend;review=5,6 -->
- [x] route/deep-link/back returns to originating segment/date without duplicate history <!-- omo:id=accept-planner-shell-history;stage=4;scope=frontend;review=5,6 -->
- [x] segment `roving tabindex` leaves only the selected tab at `tabindex=0`; Arrow Left/Right and Home/End stay in the tablist and change focus/selection, and Tab enters the selected panel <!-- omo:id=accept-planner-shell-a11y;stage=4;scope=frontend;review=5,6 -->
- [x] automatic panel/heading focus occurs only for the `deep-link/auth-return/invoker-loss fallback`, never for ordinary segment selection <!-- omo:id=accept-planner-shell-focus-entry;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized actions preserve segment/date/slot/pending action and invoking focus without rendering private data <!-- omo:id=accept-planner-shell-auth-return;stage=4;scope=frontend;review=5,6 -->
- [x] missing/disabled #12 fails closed while 요리 계획 remains usable <!-- omo:id=accept-planner-shell-log-disabled;stage=4;scope=frontend;review=5,6 -->

## Plan-only PLANNER_WEEK

- [x] Recipe Meal status and shopping/cooking actions remain unchanged <!-- omo:id=accept-planner-shell-meal-workflow;stage=4;scope=frontend;review=5,6 -->
- [x] cook_done is never displayed as consumed or goal completion <!-- omo:id=accept-planner-shell-no-consumed;stage=4;scope=frontend;review=5,6 -->
- [x] pinned keep content and legacy_backfill copy remain authoritative <!-- omo:id=accept-planner-shell-pinned-content;stage=4;scope=frontend;review=5,6 -->
- [x] plan nutrition card and new GET /planner/nutrition UI calls are removed <!-- omo:id=accept-planner-shell-remove-plan-nutrition;stage=4;scope=frontend;review=5,6 -->
- [x] new product add and quantity-edit UI are removed <!-- omo:id=accept-planner-shell-remove-product-write;stage=4;scope=frontend;review=5,6 -->
- [x] completed shopping stays read-only with no recipe-reconcile CTA <!-- omo:id=accept-planner-shell-shopping-readonly;stage=4;scope=frontend;review=5,6 -->
- [x] an empty slot shows `비어 있음` and keeps current behavior/future-slice decision; no new add affordance or CTA is implemented unless separately approved as a Contract Evolution Candidate <!-- omo:id=accept-planner-shell-empty-slot;stage=4;scope=frontend;review=5,6 -->

## Legacy / Boundary

- [x] historical product cards show pinned identity/quantity in a read-only section <!-- omo:id=accept-planner-shell-legacy-card;stage=4;scope=frontend;review=5,6 -->
- [x] same-screen detail shows pinned nutrition; no new detail route <!-- omo:id=accept-planner-shell-legacy-detail;stage=4;scope=frontend;review=5,6 -->
- [ ] owner delete is the only legacy mutation and preserves nondisclosure <!-- omo:id=accept-planner-shell-legacy-delete;stage=2;scope=shared;review=3,6 -->
- [x] unauthenticated access keeps existing `401 UNAUTHORIZED`; retained legacy delete keeps existing `401 UNAUTHORIZED`, `403 FORBIDDEN` and `404 RESOURCE_NOT_FOUND` without a new error code <!-- omo:id=accept-planner-shell-errors;stage=2;scope=shared;review=3,6 -->
- [x] no auto meal-log migration, current-version repin, cook/shop/XP/status action <!-- omo:id=accept-planner-shell-no-legacy-expansion;stage=4;scope=shared;review=6 -->
- [x] GET /planner/nutrition, legacy GET/delete and v1 cursor survive at least one compatibility release and until #13 approved compatibility evidence/tombstone contract <!-- omo:id=accept-planner-shell-compat-floor;stage=2;scope=shared;review=3,6 -->
- [x] HOME remains recipe-only and unified food search is not added there <!-- omo:id=accept-planner-shell-home-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] #12 owns MEAL_LOG UI and #13 owns tombstones <!-- omo:id=accept-planner-shell-successor-boundary;stage=2;scope=shared;review=3,6 -->

## UI States / Authority

- [x] loading/empty/error/unauthorized/shopping-readonly/legacy-readonly are distinct <!-- omo:id=accept-planner-shell-states;stage=4;scope=frontend;review=5,6 -->
- [x] registered 장보기 and shopping_done 요리하기 stay primary, 상세/남은요리 stay secondary, and legacy 삭제 stays destructive tertiary; 320px wraps in that order <!-- omo:id=accept-planner-shell-cta-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [x] canonical PLANNER_WEEK design refresh and independent critic pass before Stage 2 <!-- omo:id=accept-planner-shell-design-critic;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px/desktop static evidence covers 16px padding, 44px targets, 7-day containment, at least 2-day overview, user-configured 1/3/5 meal columns, long custom meal names, 200% text scaling, localization expansion, sticky boundaries, bottom-tab safe-area and no page overflow <!-- omo:id=accept-planner-shell-design-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] child sheet/detail traps focus, supports Escape where appropriate, restores the invoking control and preserves scroll context <!-- omo:id=accept-planner-shell-focus-trap;stage=4;scope=frontend;review=5,6 -->
- [x] refreshed product-design-authority report approves before confirmed <!-- omo:id=accept-planner-shell-authority;stage=4;scope=frontend;review=5,6 -->

## Contract / Verification

- [ ] no unofficial API, route, field, status, bottom tab or writer is added <!-- omo:id=accept-planner-shell-no-invention;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-planner-shell-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [x] implementation records failing component/route-history tests before code <!-- omo:id=accept-planner-shell-tdd-red;stage=4;scope=frontend;review=5,6 -->
- [ ] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-planner-shell-independent-review;stage=2;scope=shared;review=3,6 -->
- [ ] every check started for the current head SHA is terminal green or intended skip; post-merge master QA/Policy/Security/Vercel are green <!-- omo:id=accept-planner-shell-ci;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- Stage 1 uses repository docs/workflow fixtures only; DB bootstrap, external write, remote migration, browser login and OAuth are N/A.
- future deterministic fixtures: owner plan with `registered`, `shopping_done`, `cook_done`; empty day; completed shopping; `keep` pin; `legacy_backfill`; legacy product read/delete; other-owner nondisclosure; unauthenticated return context; and #12 disabled.
- fixture cleanup must be isolated and idempotent. Production/staging writes and destructive legacy migration are forbidden.
- real-data/server verification is read-only and must record the merged-exact head SHA, environment, capture time and unchanged target digests where applicable.

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: 390px/320px/desktop, physical keyboard/screen reader, safe-area/virtual keyboard, history/back, merged-exact-SHA server-production/local-rehearsal read-only, server-Mac/OAuth
- scenarios: both segments, auth return, #12 unavailable, plan states, legacy read/detail/delete, completed shopping
- evidence split: `PNG static-layout proof` for geometry only; `Playwright history/focus/Escape proof` for browser sequences; `Manual physical keyboard/screen reader/device keyboard proof` for hardware and assistive-technology behavior

### Manual Only

- [ ] legacy endpoint/tombstone removal occurs only under #13 approved compatibility evidence
- [ ] physical-device 390px/320px, VoiceOver/TalkBack-equivalent, server-Mac/OAuth, merged-exact server-production/local-rehearsal and #9 capability/R/R+1/R+2/activation evidence remain pending and are not claimed by Stage 1
