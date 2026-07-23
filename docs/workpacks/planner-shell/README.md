# planner-shell

## Goal

기존 Planner route와 하단 탭을 유지하면서 내부를 `요리 계획 | 식사 기록`으로 분리한다. `PLANNER_WEEK`는 Recipe Meal의 계획·장보기·요리 workflow만 표시하고, 실제 섭취와 계획 영양 및 신규 제품 계획 입력을 분리한다. 기존 product planner row는 호환 기간 동안 read-only 조회·상세와 사용자 삭제만 보존한다.

## Official Sources

- `docs/요구사항기준선-v1.7.22.md`
- `docs/화면정의서-v1.5.28.md`
- `docs/유저flow맵-v1.3.25.md`
- `docs/db설계-v1.3.23.md`
- `docs/api문서-v1.2.27.md`
- approved plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Scope

### Planner shell

- keep the existing Planner route and bottom tab. Add no new bottom tab or parallel planner route.
- expose one internal segment with exactly `요리 계획 | 식사 기록`.
- `PLANNER_WEEK` owns `요리 계획`; #12 `MEAL_LOG` owns `식사 기록` content after its own Stage 1/implementation gate.
- switching segments preserves the selected date and safely restores each surface's scroll/input state without combining their rows, totals, status chips, caches, or mutations.
- route/deep-link/back behavior is deterministic. Back from a child sheet/detail returns to the same segment/date/context; browser back does not duplicate history entries or unexpectedly switch segments.
- focus moves to the selected segment panel or its heading, the tab semantics and accessible names are explicit, keyboard order follows visual order, and reduced-motion does not hide state change.
- unauthenticated protected actions preserve date, slot and pending action for login return; private data is not rendered before authentication.

### PLANNER_WEEK plan-only composition

- retain future Recipe Meal date/slot cards, `registered → shopping_done → cook_done`, shopping and cooking actions.
- `cook_done` means cooking complete, never consumed. Plan cards and summaries must not show actual eaten calories, goal completion, or medical advice.
- a Meal pinned with `keep` continues to read title/ingredients/steps/nutrition from its content snapshot; `legacy_backfill` shows `당시 상세 내용 미보존`.
- remove the plan-nutrition aggregate card and new UI calls to `GET /planner/nutrition`.
- remove new product-plan CTA and product entry POST/PATCH UI. Do not redirect those actions to HOME or invent another product-planning surface.
- completed shopping remains read-only and never receives a `새 레시피에 맞춰 장보기 변경` CTA.

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
| empty | date/slot plan empty CTA only | #12 empty state after implementation |
| error | keep already-loaded plan visible where safe and offer retry | isolate error to log panel; do not hide plan state |
| unauthorized | login guidance and return-to-action | same shell auth boundary, no private data |
| shopping read-only | completed shopping remains immutable | not a meal-log state |
| legacy product read-only | historical card/detail + delete only | never auto-migrated |
| #12 not deployed/disabled | `요리 계획` remains fully usable | fail-closed unavailable placeholder; no fake local log |

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

- implementation predecessor: #9 `meal-log-core` runtime merged and green. Stage 1 docs may proceed now, but shell activation waits for the backend consumer contract.
- #12 owns MEAL_LOG day-first content, add/edit/delete sheets, recent/frequent, partial/unavailable UI and its own design authority.
- #13 owns legacy product API/decoder telemetry and tombstones; #10 cannot delete them.
- #14 owns cross-slice release QA.

## Out of Scope

- meal-log rows, aggregates, search, add/edit/delete sheets or actual intake mutations (#9/#12).
- batch weight/LEFTOVERS/COOK_MODE UI (#11).
- legacy product API/decoder removal or strict tombstone (#13).
- new nutrition goals, weekly analysis, medical guidance, bottom tab, route, API, field or status.

## Design / Accessibility Authority

- UI risk: high-risk anchor extension of `PLANNER_WEEK`.
- anchor screen: `PLANNER_WEEK`; required screen: `PLANNER_WEEK`.
- before Stage 2, update canonical `ui/designs/PLANNER_WEEK.md` for the two-segment shell, plan-only hierarchy, legacy read-only section and all states, then obtain independent critique at `ui/designs/critiques/PLANNER_WEEK-critique.md`.
- legacy design/critique/authority artifacts are not #10 evidence unless explicitly refreshed against this contract.
- Stage 4 requires mobile-default 390px, mobile-narrow 320px and desktop evidence covering default, loading, empty, error, unauthorized, shopping read-only, legacy read-only, segment/back/focus behavior and no horizontal overflow.
- authority report: `ui/designs/authority/PLANNER_WEEK-authority.md`, refreshed after new Stage 4 evidence.
- CTA hierarchy is status-dependent and stable: `registered` uses `장보기` as primary, `shopping_done` uses `요리하기` as primary, `상세` and week-level `남은요리` remain secondary, and legacy `삭제` is destructive tertiary after read-only `상세`. No CTA is promoted across the plan/log boundary.
- at 320px, keep primary before secondary in DOM and visual order, wrap secondary below rather than compressing touch targets, and place legacy destructive delete last; desktop may keep the same order inline.
- preserve day overview density, week controls proximity, readable 4–5 column behavior, 44px targets, screen-reader segment semantics and visible focus.

## Design Status

`temporary`. Stage 1 locks structure and interaction only; refreshed canonical design, independent critic and screenshot/Figma product-design-authority remain required.

## Stage 1 Current Gate

- run SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc tests, lint, typecheck, dependency audit and diff/parity only.
- component/E2E/visual/a11y/route-history/browser/remote commands are future Stage 4/6 evidence and are not claimed executable now.

## Security / Review Focus

- authentication/return-to-action and other-owner legacy delete nondisclosure.
- no plan/log cache, row, aggregate or mutation mixing.
- no new product-plan writer, `GET /planner/nutrition` early removal, HOME search widening or completed-shopping mutation.
- deterministic route/history/back/focus and fail-closed #12 absence.

## Delivery Checklist

- [x] Stage 1 exact-six docs authored
- [ ] internal1.5/security/five-axis/design reviews approved with zero findings
- [ ] every check started for the current head SHA is terminal green or an intended skip
- [ ] post-merge master QA/Policy/Security/Vercel checks green
- [ ] Stage 2 TDD RED before implementation
- [ ] Stage 4 390/320/desktop visual-a11y-route evidence green
- [ ] product-design-authority approved before confirmed
