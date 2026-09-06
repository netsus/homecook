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
- Authority status: `approved`
- Notes: fresh independent final authority task `019fefdd-5706-72a2-8e58-da8785723edd` approved exact reviewed head `ffd33d029b7f03bcb231e5b352dddedeed2d437f` with P0/P1/P2 `0/0/0` and unresolved required findings `0`; Stage 6 and lifecycle/Manual/activation gates remain pending.
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

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

The fresh evidence generator, Stage 5 review and independent final product-design-authority gate approved the exact implemented/evidence lineage with blocker/major/minor `0/0/0`. This design projection does not approve Stage 6, Ready, merge, production or activation.

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
- [x] product-design-authority approved before confirmed <!-- omo:id=delivery-planner-shell-design-authority;stage=4;scope=frontend;review=5,6 -->

Stage 2 note: this test-only slice recorded an existing-behavior characterization baseline GREEN. Backend implementation and a behavioral TDD RED are N/A because no runtime repair was required; the stale generic checklist item therefore remains unchecked.

Stage 5 note: the fresh independent review at exact head `2d11ad27249d05de6d21397c8787ce6f470c4219` approved the 390/320/1280 screenshot matrix and deterministic browser evidence with P0/P1/P2 `0/0/0`. At that publication point, product-design final authority remained pending and Design Status stayed `pending-review`.

Final authority note: fresh independent task `019fefdd-5706-72a2-8e58-da8785723edd` approved exact head `ffd33d029b7f03bcb231e5b352dddedeed2d437f` with blocker/major/minor `0/0/0` and unresolved required findings `0`. Design Status is now `confirmed`; Stage 6, Ready, merge, Manual/device/server evidence and activation remain pending.

## 2026-09-06 사용자 승인 기존 조작 복원

사용자는 요리 계획과 실제 식사 기록의 분리를 유지하며 기존 플래너 조작을 복원하도록 명시적으로 요청했다. 이번 회귀 복구에서 빈/채운 끼니의 식사 추가, 3주 날짜 페이지를 통한 가로·키보드 주 이동, 고정 날짜 바, 모바일 7일 목록과 데스크톱 주간표를 복원한다. 위의 선택 하루 중심 composition 및 추가 CTA 유보 설명은 이 승인 범위에서 대체된다. 계획 영양 합계·신규 완제품 계획 UI는 복원하지 않으며 API/DB/권한/상태 전이는 유지한다. 구현과 검증 범위는 [복원 계획](evidence/2026-09-06-interaction-restoration-plan.md)을 따른다. 기존 Stage 완료 기록을 이번 변경의 승인으로 재사용하지 않는다.

## 2026-09-06 출시 전 UI 정리

추가 사용자 승인에 따라 공개 예시·로그인 액션 게이트, 랜딩 식단 이미지 기반 밀도, 중복 카드 버튼 제거, 개별 pin 영양 UI를 적용한다. [승인 범위/검증 계획](evidence/2026-09-06-prelaunch-ui-plan.md)을 따른다. 실제 합계 권한·새 완제품 계획 금지·현재 API/DB는 보존하고 이 승인 범위의 이전 시각/로그인 전 차단 설명을 대체한다.

### 2026-09-06 후속 UI 재배치 승인

사용자 실기기 피드백에 따라 밝은 포인트, 모바일 날짜 줄만 고정, 데스크톱 두 플래너 상단 메뉴, 계획 카드의 인분·상태 중심 표시, 항상 보이는 식사 영양 그래프와 중복 조작 제거를 적용한다. 구체 범위는 `docs/workpacks/planner-shell/evidence/2026-09-06-prelaunch-ui-plan.md`의 후속 승인 항목이다. 기존 개인 데이터 권한·실제 합계·API/DB 계약은 유지한다.

### 2026-09-06 iPhone 13 mini 후속 승인

사용자는 5개 모바일 하단 탭(홈/요리 계획/식사 기록/팬트리/마이), 상단 중복 segment 제거, 두 플래너 날짜 줄 swipe 주이동과 native 달력 날짜 점프, 기존 화살표·기간행 제거를 요청했다. 계획 카드는 색점+계획인분+1인분당 예상 kcal(전체 pinned 영양÷계획 인분, partial/minimum 및 unknown 보존), 식사기록의 음식별 영양은 상시 표시하며 ‘먹은 양’/‘요리한 음식’ 반복 문구를 제거한다. 인분/섭취량/영양의 원천·권한·API/DB는 유지한다. 375px Safari 계열과 320px 검증을 포함한다.

### 2026-09-06 달력 즉시선택·음식 상세 후속 승인

사용자 실기기 피드백: native 날짜 선택의 확인단계·확대현상을 없애기 위해 앱 내부 버튼형 달력에서 날짜를 누르면 즉시 선택/닫힘으로 교체한다. 월·연도 직접 선택과 주 swipe는 유지한다. 식사 카드의 수정은 음식 상세 sheet로 옮기고 삭제는 이름있는 아이콘으로 표시한다. 목록은 양/kcal/탄단지 그래프, 나트륨은 상세에서만 표시한다. 기존 식사 데이터·수정삭제 API/권한/계산을 재사용하며 새로운 route/API/DB는 만들지 않는다. 홈 무먹 가이드 이미지는 랜딩의 실제 공유 OG 자산을 사용한다.

### 2026-09-06 상세 보류·계획 영양·가이드·랜딩 운영 승인

사용자는 현재 준비 모드에서 식사 이름의 상세 진입을 보류하고 비로그인은 로그인 페이지, 로그인 사용자는 준비 안내로 막도록 요청했다. 상세 구현과 준비 모드 해제는 추후 개발/검증 대상이며 기존 API·복귀 보호 코드는 유지한다. 계획 카드에는 인분과 1인분 기준 칼로리·탄단지를 표시한다. 가이드에는 실제 기능/준비 상태, 랜딩 체험 연결, 기존 귀여운 이미지 자산을 반영한다. 랜딩의 신규 유입/화면은 a·b·c만 운영하고 기본/d/잘못된 값은 a로 정규화하되 UTM과 과거 세션·DB 기록은 보존한다. 공유 결과의 읽기 전용 경로는 별도 Hero 버전이 아니며 그대로 보존한다.

### 2026-09-06 날짜 영역 통일

사용자 요청에 따라 두 플래너의 달력·오늘·주간 날짜 줄을 공통 구성으로 통일한다. 선택된 날짜, 날짜 줄의 위치·크기·색상은 탭 왕복 중 유지하고, 모바일에서 고정된 날짜 줄도 같은 위치에 남긴다. 각 본문의 기존 스크롤과 주간 이동·키보드·개인 데이터 권한은 보존한다. API/DB 변경은 없다.

### 2026-09-06 주간 식사 기록·출시 전 가입 차단

사용자 승인: 식사 기록을 주간 세로 날짜 카드로 표시하고 최초 진입 시 선택일(기본 오늘)에 맞춘다. 날짜별 합계는 숫자가 파란 4개 영양 타일, 개별 식사는 양/kcal/탄단지 텍스트로 표시한다. 계획은 전체 kcal/탄단지와 막대를 표시한다. 완성 무게는 추후 수율 기반 예상값·실측 덮어쓰기를 개발할 예정이며 지금 알고리즘/DB 쓰기를 추가하지 않는다. 정보가 없는 계획은 ‘무게 계산 준비 중’으로 표시한다.

선택 날짜는 테두리 없는 파랑/흰 글씨, 오늘은 별도 라벨로 구분한다. 오늘·장보기·남은요리는 버튼 형태로 보강하고 상단 준비 배너를 한 줄 기준선으로 정렬한다. 홈 YouTube 진입의 복귀는 홈이다.

출시 전 소셜 로그인 버튼과 앱 로그인 시작/콜백을 차단한다. 시작은 기존 AUTH_FLOW_UNAVAILABLE/503, 콜백은 교환 전에 준비 안내로 반환한다. 기존 세션·로컬 password QA·인증된 계정 연결은 보존한다. Supabase 외부 직접 인증 API 설정을 변경하는 것은 범위 밖이다. 로컬 랜딩은 허용 origin·공식 캠페인 기간 설정 누락을 로컬 전용으로 보완하고 실제 저장 인증 오류와 구분한다. 새 계정/리드 저장 성공을 가짜로 처리하지 않는다.
