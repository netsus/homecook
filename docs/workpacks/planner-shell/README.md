# planner-shell

## Goal

기존 Planner route와 하단 탭을 유지하면서 내부를 `요리 계획 | 식사 기록`으로 분리한다. `PLANNER_WEEK`는 Recipe Meal의 계획·장보기·요리 workflow만 표시하고, 실제 섭취와 계획 영양 및 신규 제품 계획 입력을 분리한다. 기존 product planner row는 호환 기간 동안 read-only 조회·상세와 사용자 삭제만 보존한다.

## Official Sources

- `docs/요구사항기준선-v1.7.30.md`
- `docs/화면정의서-v1.5.34.md`
- `docs/유저flow맵-v1.3.32.md`
- `docs/db설계-v1.3.32.md`
- `docs/api문서-v1.2.37.md`
- approved Cooking Plan / Meal Log master plan: `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`, SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines
- Stage 1 relock base/tree: `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` / `6b67f32a3a404b2d7d60a9c231a394c2e17c6c9a`

## Release-Chain Position

- exact release chain stays `#8 -> #9 -> (#10, #11) -> #12 -> #13 -> #14`; #10 and #11 may proceed independently only inside their ownership boundaries.
- #9 backend implementation PR `#1319` exact head `be93bfc47281e2795c59c0fd1052a4ecf6085837` passed independent Stage 3 task `019feb79-152f-7891-bd3a-435694e57cac` with P0/P1/P2 `0/0/0`, then merged as this relock base `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`. Its 25 current-head checks were 23 success plus 2 intended historical skips.
- that merge satisfies #10's code predecessor, but it does not close #9's broader lifecycle. Merged-exact server-production/local-rehearsal, Manual/server-Mac/OAuth, capability, `R/R+1/R+2`, and activation evidence remain pending.
- #12 must wait for both the merged #9 backend and a separately implemented/green #10 shell. This Stage 1 relock does not make #10 runtime green and does not authorize #12 implementation.

## Scope

### Planner shell

- keep the existing Planner route and bottom tab. Add no new bottom tab or parallel planner route.
- expose one internal segment with exactly `요리 계획 | 식사 기록`.
- `PLANNER_WEEK` owns `요리 계획`; #12 `MEAL_LOG` owns `식사 기록` content after its own Stage 1/implementation gate.
- switching segments preserves the selected date and safely restores each surface's scroll/input state without combining their rows, totals, status chips, caches, or mutations.
- route/deep-link/back behavior is deterministic. Back from a child sheet/detail returns to the same segment/date/context; browser back does not duplicate history entries or unexpectedly switch segments.
- the segment control uses `roving tabindex`: the selected tab alone has `tabindex=0`; Arrow Left/Right and Home/End keep focus inside the tablist while moving focus and selection, and Tab enters the selected panel. Ordinary segment changes do not force focus into the panel or heading.
- unauthenticated protected actions preserve date, slot and pending action for login return; private data is not rendered before authentication.
- return-to-action also preserves the selected segment and the invoking control; after login, focus returns to that control or the restored panel heading when the original control no longer exists.
- forced panel/heading focus is limited to the `deep-link/auth-return/invoker-loss fallback`; normal pointer or keyboard selection keeps the tab as the focus origin.

### PLANNER_WEEK plan-only composition

- retain future Recipe Meal date/slot cards, `registered → shopping_done → cook_done`, shopping and cooking actions.
- `cook_done` means cooking complete, never consumed. Plan cards and summaries must not show actual eaten calories, goal completion, or medical advice.
- a Meal pinned with `keep` continues to read title/ingredients/steps/nutrition from its content snapshot; `legacy_backfill` shows `당시 상세 내용 미보존`.
- remove the plan-nutrition aggregate card and new UI calls to `GET /planner/nutrition`.
- remove new product-plan CTA and product entry POST/PATCH UI. Do not redirect those actions to HOME or invent another product-planning surface.
- completed shopping remains read-only and never receives a `새 레시피에 맞춰 장보기 변경` CTA.
- an empty slot renders only `비어 있음`. Its tap follows the current behavior; the exact future-slice behavior is decided by that future slice. A new add affordance or empty CTA is a `Contract Evolution Candidate`, not this implementation contract.

### Responsive planner containment

- `390px`, `320px`, and desktop must preserve `7-day containment`: all seven localized dates remain reachable inside the planner-local rail without page-level horizontal overflow.
- the first viewport preserves an `at least 2-day overview` before a user drills into one day. The selected day may expand, but it must not erase awareness of the adjacent day.
- fixtures cover user-configured `1/3/5 meal columns`; every day uses the same configured column set, and one, three, or five meal labels remain associated with their slots.
- stress fixtures include `long custom meal names`, `200% text scaling`, and `localization expansion`. Labels wrap without hiding state or actions; planner-local scrolling may be used, but the page itself must not overflow.
- sticky week/segment controls, when implemented, stay inside the Planner scroller and never cover day content. The final row reserves `bottom-tab safe-area` clearance, including the bottom tab and `env(safe-area-inset-bottom)`, with and without the virtual keyboard.

### Legacy product compatibility

- preserve existing `product_planner_entries` for at least one compatibility release under the selected date's `과거 완제품 계획` read-only section.
- card shows pinned product name, brand and historical quantity. Same-screen read-only detail sheet shows the pinned nutrition version.
- the only mutation exposed is the existing user delete path with confirmation and owner protection. Quantity edit, add, copy, cook, shop, leftover, XP and status actions are absent.
- do not auto-migrate a legacy product row into meal log, create a new detail route, silently repin current product nutrition, or remove the legacy API/decoder.
- #13 `legacy-product-compat` owns telemetry, compatibility floor and final tombstone decisions. #10 only removes new UI producers while retaining read/delete consumers.

### HOME/search boundary

- HOME remains recipe-only. Planner shell never adds product/ingredient unified search to HOME.
- unified product/ingredient search remains limited to #12 MEAL_LOG food add and approved custom-recipe ingredient selection.
- Planner segment state must not leak product queries, actual-intake drafts, private row IDs or nutrition evidence into HOME navigation.

## State Matrix

| State | `요리 계획` | `식사 기록` shell destination |
| --- | --- | --- |
| loading | plan skeleton; actions fail closed | panel loading boundary; #12 owns content skeleton |
| empty | date/slot remains visible and each empty slot says `비어 있음`; no new add CTA | #12 empty state after implementation |
| error | keep already-loaded plan visible where safe and offer retry | isolate error to log panel; do not hide plan state |
| unauthorized | login guidance and return-to-action | same shell auth boundary, no private data |
| shopping read-only | completed shopping remains immutable | not a meal-log state |
| legacy product read-only | historical card/detail + delete only | never auto-migrated |
| #12 not deployed/disabled | `요리 계획` remains fully usable | fail-closed unavailable placeholder; no fake local log |

## Error / Auth Contract

- authenticated Planner reads and protected actions keep the existing `{ success, data, error }` wrapper and `{ code, message, fields[] }` error shape.
- unauthenticated access uses the existing `401 UNAUTHORIZED` contract. The shell must not render cached private plan/log rows while showing login guidance.
- the retained legacy delete path keeps its existing owner boundary and existing `401 UNAUTHORIZED`, `403 FORBIDDEN`, and `404 RESOURCE_NOT_FOUND` behavior; #10 adds no replacement error code.
- read errors are scoped to the active segment. Already loaded rows may remain visible only when safe, with mutation actions failed closed and an explicit retry.
- compatibility endpoints and decoders are retained server-side; removing their new UI producers is not permission to delete or rename their public contract.

## Interaction Wireframe

```text
PLANNER
[ 요리 계획 ] [ 식사 기록 ]
  └ selected: 요리 계획

‹  이번 주  ›                         [장보기] [남은요리]
                                      primary   secondary

7월 22일
  아침  Recipe Meal · registered       [장보기] [상세]
                                      primary   secondary
  점심  Recipe Meal · shopping_done    [요리하기] [상세]
                                      primary     secondary
  저녁  Recipe Meal · cook_done        [상세]

과거 완제품 계획                       read-only
  제품명 · 브랜드 · 1봉                [상세] [삭제]
                                      secondary destructive-tertiary

제거됨:
- 계획 영양 합계
- 완제품 새로 추가 / 수량 수정

segment switch:
- selected date preserved
- plan and log scroll/input state isolated
- back returns to the originating segment/date
```

## API / Compatibility Contract

- keep existing Planner/Meal/shopping/cooking routes unchanged; this slice adds no public endpoint.
- stop new PLANNER_WEEK UI calls to `GET /planner/nutrition`, but keep the endpoint through the approved compatibility release and until #13 tombstone evidence.
- preserve legacy product planner GET/delete and v1 cursor decode; remove POST/PATCH affordances only from the new UI.
- all existing responses retain `{ success, data, error }` and errors retain `{ code, message, fields[] }`.
- another owner's/private product or planner row remains nondisclosed; legacy delete remains owner-only and idempotency/read-only protections are not weakened.

## Dependencies / Successors

- implementation predecessor: #9 `meal-log-core` backend is merged at base `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` and its independently reviewed implementation is green. #10 may consume that local runtime, while the pending #9 release-lifecycle evidence above remains explicitly unclaimed.
- sibling #11 `cooked-batch-weight-ui` owns only COOK_MODE/LEFTOVERS #8-consumer UI. #10 does not edit its workpack or product files and does not absorb its batch lifecycle actions.
- #12 owns MEAL_LOG day-first content, add/edit/delete sheets, recent/frequent, partial/unavailable UI and its own design authority.
- #13 owns legacy product API/decoder telemetry and tombstones; #10 cannot delete them.
- #14 owns cross-slice release QA.

## Ownership Boundary

| Surface | #10 planner-shell owns | Explicit non-owner |
| --- | --- | --- |
| route/shell | existing Planner route, exact two-segment navigation, selected-date/history/focus restoration | no new tab/route; #12 owns MEAL_LOG body |
| plan UI | PLANNER_WEEK Recipe Meal plan hierarchy and state separation | #9 meal-log rows/totals/mutations; #11 batch weight/lifecycle UI |
| compatibility UI | legacy product read/detail/delete-only presentation | #13 endpoint/decoder telemetry and tombstone decision |
| backend/data | no schema, migration, RLS, RPC, status or endpoint addition | #9 owns meal-log backend; existing Planner contracts remain unchanged |
| search | no HOME widening and no product-plan producer | #12 owns food-add search consumption |

## Schema Change

- [x] no DB schema, migration, RLS, RPC, enum/status, API field or endpoint change.
- this is a frontend shell/compatibility consumer slice. Any discovered public-contract gap requires a separately approved `contract-evolution` docs-governance path before implementation.

## Backend First Contract

- Stage 2 backend implementation is `N/A`: #10 adds no backend writer or public contract.
- Stage 2 may only add failing compatibility/consumer contract tests before frontend work, covering retained Planner reads, `GET /planner/nutrition`, legacy GET/delete, v1 cursor decode, owner nondisclosure and completed-shopping read-only behavior.
- #9 backend data, events, projections and APIs are read-only dependencies for #10; this slice must not repair or extend them.

## Frontend Delivery Mode

- Stage 4 owns the shell implementation after this docs PR merges and fresh independent internal1.5, security/compatibility, five-axis and design-critic gates reach zero findings.
- the first failing tests must cover exact segment labels, date/scroll/input isolation, deep-link/back history, auth return, fail-closed #12 absence, plan/log boundary, legacy read/delete-only, and removed product/nutrition producers.
- component, route-history, E2E, a11y, visual, browser and authority commands are future Stage 4/5/6 evidence, not Stage 1 evidence.

## QA / Test Data Plan

- deterministic Stage 1 fixtures are repository documents and workflow projections only; no DB bootstrap, production write, remote migration or OAuth session is required or allowed.
- future component/E2E fixtures must include: authenticated owner with `registered`, `shopping_done`, `cook_done`; empty day; completed shopping; pinned `keep`; `legacy_backfill`; legacy product row; other-owner legacy row; unauthenticated return context; and #12 disabled.
- real-data verification is read-only against the merged-exact head. Test users/fixtures must be isolated and cleanup must not mutate production/staging.
- `PNG static-layout proof`: future screenshots prove only 390px/320px/desktop geometry, 7-day containment, at least 2-day overview, 1/3/5 meal columns, wrapping, sticky boundaries, bottom-tab safe-area and absence of page overflow.
- `Playwright history/focus/Escape proof`: future browser tests prove history/back, roving-tab selection, Tab entry, modal focus trap/restore and Escape behavior; screenshots do not prove these sequences.
- `Manual physical keyboard/screen reader/device keyboard proof`: Manual Only covers a physical keyboard, VoiceOver/TalkBack, real-device safe-area and device virtual-keyboard occlusion. It also retains server-Mac/OAuth, merged-exact server-production/local-rehearsal, and #9 capability/`R/R+1/R+2`/activation as pending.

## Primary User Path

1. open the existing Planner route and land on `요리 계획` without a new bottom tab or history entry.
2. select a date, inspect status-appropriate Recipe Meal actions, and open/return from details with date, segment, scroll and focus restored.
3. switch to `식사 기록`; until #12 is deployed, show the fail-closed unavailable panel while the plan panel remains intact.
4. unauthenticated protected action records segment/date/slot/pending action, completes login, restores context and focuses the invoking control or panel heading.
5. inspect a legacy product row and optionally delete it after confirmation; no add/edit/copy/cook/shop/XP/status action appears.

## Out of Scope

- meal-log rows, aggregates, search, add/edit/delete sheets or actual intake mutations (#9/#12).
- batch weight/LEFTOVERS/COOK_MODE UI (#11).
- legacy product API/decoder removal or strict tombstone (#13).
- new nutrition goals, weekly analysis, medical guidance, bottom tab, route, API, field or status.

## Design Authority

- UI risk: high-risk anchor extension of `PLANNER_WEEK`.
- Anchor screen dependency: `PLANNER_WEEK`; required screen: `PLANNER_WEEK`.
- Visual artifact: canonical `ui/designs/PLANNER_WEEK.md`; future Stage 4 screenshot evidence paths are declared in `automation-spec.json`.
- Authority status: `required`
- Notes: refreshed Stage 4 runtime evidence and a fresh product-design-authority verdict remain pending; this metadata repair does not claim Stage 4 authority completion.
- before Stage 2, update canonical `ui/designs/PLANNER_WEEK.md` for the two-segment shell, plan-only hierarchy, legacy read-only section and all states, then obtain independent critique at `ui/designs/critiques/PLANNER_WEEK-critique.md`.
- legacy design/critique/authority artifacts are not #10 evidence unless explicitly refreshed against this contract.
- Stage 4 requires mobile-default 390px, mobile-narrow 320px and desktop evidence covering default, loading, empty, error, unauthorized, shopping read-only and legacy read-only. Static PNG, Playwright interaction, and Manual Only proof remain separate evidence classes.
- authority report: `ui/designs/authority/PLANNER_WEEK-authority.md`, refreshed after new Stage 4 evidence.
- CTA hierarchy is status-dependent and stable: `registered` uses `장보기` as primary, `shopping_done` uses `요리하기` as primary, `상세` and week-level `남은요리` remain secondary, and legacy `삭제` is destructive tertiary after read-only `상세`. No CTA is promoted across the plan/log boundary.
- at 320px, keep primary before secondary in DOM and visual order, wrap secondary below rather than compressing touch targets, and place legacy destructive delete last; desktop may keep the same order inline.
- use 16px mobile horizontal content padding, preserve 7-day containment and at least 2-day overview, verify user-configured 1/3/5 meal columns, and retain minimum 44px targets, screen-reader segment semantics and visible focus under long custom meal names, 200% text scaling and localization expansion.
- segment controls use roving tabindex. Arrow Left/Right and Home/End remain inside the tablist and change selection; Tab enters the selected panel. Forced panel/heading focus is reserved for the deep-link/auth-return/invoker-loss fallback.
- switching segments must not move the page unexpectedly. Localized planner overflow may follow the approved prototype, but unintended page-level horizontal overflow is forbidden at 390px, 320px and desktop.
- sheets/details trap focus, close with Escape where the platform pattern permits, restore invoking focus, remain visible above the virtual keyboard and preserve scroll context.

## Design Status

`pending-review`. Stage 4 implements the locked structure and interaction. The separate evidence generator, Stage 5 review and refreshed screenshot/Figma product-design-authority verdict remain required; this status is not an approval.

## Stage 1 Current Gate

- current: run SOT/workflow/workpack/automation/bookkeeping validators, the focused planner-shell Stage1 relock test plus workflow-doc tests, lint, typecheck, dependency audit and diff only.
- component/E2E/visual/a11y/route-history/browser/local-first production-rehearsal commands are future Stage 4/6 evidence and are not claimed executable now.

## Security / Review Focus

- authentication/return-to-action and other-owner legacy delete nondisclosure.
- no plan/log cache, row, aggregate or mutation mixing.
- no new product-plan writer, `GET /planner/nutrition` early removal, HOME search widening or completed-shopping mutation.
- deterministic route/history/back/focus and fail-closed #12 absence.

## Delivery Checklist

- [x] Stage 1 exact-six docs authored <!-- omo:id=delivery-planner-shell-stage1-docs;stage=2;scope=shared;review=3,6 -->
- [ ] internal1.5/security/five-axis/design reviews approved with zero findings <!-- omo:id=delivery-planner-shell-independent-reviews;stage=2;scope=shared;review=3,6 -->
- [ ] every check started for the current head SHA is terminal green or an intended skip <!-- omo:id=delivery-planner-shell-current-head-checks;stage=2;scope=shared;review=3,6 -->
- [ ] post-merge master QA/Policy/Security/Vercel checks green <!-- omo:id=delivery-planner-shell-post-merge-checks;stage=2;scope=shared;review=6 -->
- [ ] Stage 2 TDD RED before implementation <!-- omo:id=delivery-planner-shell-stage2-characterization;stage=2;scope=backend;review=3,6 -->
- [x] Stage 4 390/320/desktop visual-a11y-route evidence green <!-- omo:id=delivery-planner-shell-stage4-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] product-design-authority approved before confirmed <!-- omo:id=delivery-planner-shell-design-authority;stage=4;scope=frontend;review=5,6 -->

Stage 2 note: this test-only slice recorded an existing-behavior characterization baseline GREEN. Backend implementation and a behavioral TDD RED are N/A because no runtime repair was required; the stale generic checklist item therefore remains unchecked.

Stage 5 note: the fresh independent review at exact head `2d11ad27249d05de6d21397c8787ce6f470c4219` approved the 390/320/1280 screenshot matrix and deterministic browser evidence with P0/P1/P2 `0/0/0`. Product-design final authority, Stage 6, Manual/device/server evidence and activation remain pending; Design Status stays `pending-review`.
