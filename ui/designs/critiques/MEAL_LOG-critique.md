# meal-log-ui #12 Stage 1 repaired exact-head fresh independent design re-review

> critic task ID: `019ffbc5-0c4a-7b11-afd9-6346a76b762c`
> review date: `2026-08-14`
> role: fresh independent design critic; HOLD critic task `019ffbb4-28ab-7410-b1c1-369c7848342e`, repair author task `019ffbbc`와 분리
> verdict: `APPROVE`
> grade: `🟢` — P0 `0`, P1 `0`, P2 `0`
> scope: repaired exact head의 `ui/designs/MEAL_LOG.md` 전체와 HOLD base 대비 한 design-file delta. PR/workpack, implementation, runtime evidence, final authority, Ready/merge 상태는 이 critic이 변경하거나 승인하지 않는다.

## Reviewed exact tuple and provenance

- repair branch: `docs/meal-log-ui-stage1-p1-ml-05-current-contract-repair`
- HOLD base/critique commit: `497faaab314e3c864eaf4f6b0d0f3179c16e58c0`
- exact reviewed design head: `e2959ef523e57770a4cb2b490f7b00a972ab8845`
- exact reviewed tree: `7932fc6d026d9f2c0aa963041efcf315be12c9e9`
- reviewed artifact: `ui/designs/MEAL_LOG.md`
- reviewed artifact blob: `9bade6235acd9c6f60d128216260d9c0408718c2`
- predecessor HOLD critique blob: `57fff2d5c641d24bf20fada31b76b57276ca7a54`
- current PR docs context: `69965f5292792d8b4b4555a518d3bbb4c4860971`, tree `3f7fd32e88c238ccebba6fc537f242e102055c09`
- current official authority: requirements `v1.7.32`, screen `v1.5.36`, flow `v1.3.34`, DB `v1.3.34`, API `v1.2.39`
- approved master plan: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines
- merged #9 contract evidence: `types/meal-log.ts`, `lib/server/meal-log.ts`, `supabase/migrations/20260810120000_meal_log_core.sql`, meal-log parser/projection/RPC tests

Local checkout head/tree, named repaired head/tree, one-file delta, artifact blob and predecessor critique blob을 각각 대조해 위 exact tuple이 일치함을 확인했다.

## Executive verdict

`P1-ML-05`는 current #9 계약을 바꾸지 않는 design-only repair로 해소됐다. 삭제된 끼니 row에서 시작한 모든 edit save는 수정 field 종류와 무관하게 현재 owner의 `active_columns[]` 중 하나를 사용자가 명시 선택해야 한다. selector는 매번 미선택으로 열리고, null snapshot·삭제된 UUID·첫 active column을 자동 선택하지 않으며, 선택 전 save는 disabled다.

선택 후에는 기존 full PATCH body와 current `expected_revision`, 선택한 active owner `meal_plan_column_id`만 사용한다. client가 `slot_name_snapshot`을 보내거나 null 위치를 보존하지 않고, server RPC가 선택 column의 current ID/name으로 `meal_plan_column_id`와 `slot_name_snapshot`을 함께 교체한다. 이는 non-null mutation type, strict parser, owner-column lookup, RPC update와 정확히 일치하며 새 endpoint/field/action/error를 만들지 않는다.

active column 0건, list read error, authorization loss, 선택 column 소실, stale revision에서는 correctable input/return context를 보존하면서 save를 fail closed한다. refresh 뒤 prior selection을 재사용하지 않고 selector/error로 focus한 다음 explicit reselection을 요구한다. corrected payload는 fresh key, identical network retry만 same key를 사용하고 stored replay는 한 번만 적용한다.

따라서 current exact head/tree의 Stage 1 design prerequisite verdict는 `APPROVE`, findings `0/0/0`이다.

## P1-ML-05 repair verification

| Required repair | Result | Exact design evidence |
| --- | --- | --- |
| every deleted-column edit save requires explicit active owner column | PASS | Edit sheet와 mutation rules가 quantity/source/date/timezone 변경 여부와 무관한 필수 선택을 고정한다. |
| no preselection/null snapshot preservation | PASS | 미선택 placeholder, disabled save, null/삭제 UUID/첫 active column 금지를 390/320/desktop과 accessibility contract에 반복 고정한다. |
| server replaces column ID and snapshot | PASS | Existing PATCH full body에는 selected `meal_plan_column_id`만 보내고 `slot_name_snapshot`은 server가 current column name으로 교체한다고 명시한다. |
| active 0/error/unauthorized fail closed | PASS | 입력과 return context를 보존하되 save를 disabled하고 retry/login/cancel만 허용한다. private 값은 authorization loss에서 숨긴다. |
| conflict/replay recovery | PASS | stale/list refresh/selected-column loss 뒤 selection clear, linked focus, explicit reselection, fresh corrected key, identical replay one-apply가 분리돼 있다. |
| DELETE retains official behavior | PASS | active-column 선택 없이 origin snapshot에서 expected revision + fresh key DELETE, soft delete, own event reversal, pointer null, focus fallback을 유지한다. |

## Prior four finding regression check

| Finding | Current result | Regression evidence |
| --- | --- | --- |
| `P1-ML-01` seven-day range movement | RESOLVED / NO REGRESSION | Exact ±7 calendar days, selected-date visibility, existing Planner `date` history, Back/Forward zero-write sync, bounded existing day reads가 유지된다. |
| `P1-ML-02` `availability=all` depleted/legacy-null | RESOLVED / NO REGRESSION | Known/missing/unrecoverable, six depleted reasons, legacy-null copy, one server order/cursor와 no inferred action이 유지된다. |
| `P1-ML-03` recent/frequent grouping | RESOLVED / NO REGRESSION | One server-ordered `최근·자주 먹은 음식` list, frequency metadata, one cursor, no client split/re-sort가 유지된다. |
| `P1-ML-04` ingredient approved-unit projection | RESOLVED / NO REGRESSION | `default_unit`은 suggestion일 뿐이고 quantity/unit은 correctable하며 mutation-owned `422 UNIT_CONVERSION_MISSING`이 input/cursor를 보존한다. |

## Day total and deleted-history behavior

- PASS: day total은 active section과 `meal_plan_column_id IS NULL` deleted-column snapshot section을 모두 포함하는 모든 visible non-deleted entry의 server projection이다. client active-only 재합산이 금지되고 incomplete count도 같은 전체 집합을 사용한다.
- PASS: deleted section은 snapshot label/subtotal/incomplete/history를 표시하고 add CTA/new target은 DOM과 selection source 모두에서 0이다.
- PASS: existing deleted-column entry의 edit/delete는 유지된다. edit 성공은 선택 destination으로 이동하고 DELETE는 origin에서 그대로 수행된다.
- PASS: `partial`/`unavailable`은 zero/complete로 승격되지 않으며 soft-deleted entry는 read/aggregate에서 제외된다.

## Focus, accessibility, conflict and replay

- PASS: deleted edit는 read-only origin을 먼저 연결하고 최초 focus를 required selector에 둔다. selector는 `required`, help/error, selection state를 programmatically 노출한다.
- PASS: 44×44px row actions, named edit/delete actions, dialog focus trap, Escape/cancel contract, linked `role=alert`, reduced motion, 200% text와 no color-only meaning이 명시돼 있다.
- PASS: cancel/error는 invoking action과 scroll을 복원하고, edit success는 destination entry/section heading, delete success는 deleted section/panel heading으로 deterministic fallback한다.
- PASS: pending 중 duplicate submit/dismiss를 잠그고 same key/same payload replay는 authoritative result를 한 번만 적용한다. same key/different payload는 성공처럼 반영하지 않는다.
- PASS: stale authority에서는 entry와 `active_columns[]`를 refresh하되 correctable draft를 유지하고, selection을 clear한 뒤 explicit reselection을 요구한다.

## 390px, 320px and desktop review

| Axis | Result | Evidence |
| --- | --- | --- |
| 390px mobile baseline / mobile-first hierarchy | PASS | selected day → compact server summary → active sections → deleted history 순서이며 origin/required selector가 편집 field보다 먼저 온다. |
| 320px narrow | PASS | page overflow는 금지, rail만 local x-scroll, action/selector/error/CTA는 세로 stack, label/target 축소와 silent default가 금지된다. |
| desktop adaptation | PASS | 같은 route/segment/DOM/reading order와 limited-width dialog를 유지하고 첫 active column 자동 선택 또는 origin/target 축약이 금지된다. |
| scroll containment | PASS | rail만 horizontal overflow, sheet body만 vertical scroll, background lock과 safe-area footer 경계가 명확하다. |
| CTA hierarchy | PASS | add/save primary, edit/cancel/retry secondary, delete destructive tertiary이며 DOM/visual order가 일치한다. |

## Contract and invention audit

- PASS: existing 7 endpoints, `active_columns[]`, full PATCH `meal_plan_column_id`, current error `code/message/fields[]`만 사용한다.
- PASS: `slot_name_snapshot` client field, partial PATCH, relocation endpoint/action, null-preserve alias, new status/error는 추가하지 않는다.
- PASS: product/ingredient typed union은 one server order/cursor이며 client merge가 없다.
- PASS: owner/generation, exact evidence, own-event reversal, nullable instant, nondisclosure 경계를 완화하지 않는다.
- PASS: current repair는 official API와 merged #9 implementation을 presentation에 정확히 binding하므로 Contract Evolution이 필요하지 않다.

## Findings

### P0 (0)

없음.

### P1 (0)

없음. `P1-ML-05`는 resolved다.

### P2 (0)

없음.

## Evidence limits and stage handoff

- 이 리뷰는 Stage 1 markdown design contract 심사다. static markdown은 실제 DOM geometry, focus trap/restore, live announcement, virtual keyboard, screen reader 또는 physical device 동작을 증명하지 않는다.
- Stage 4는 exact implementation head에서 390px, 320px, desktop의 17-state screenshot/manifest와 deterministic browser/axe evidence를 만들어야 한다.
- 별도 `product-design-authority`는 runtime visual evidence를 읽고 mobile UX/visual hierarchy/scroll containment를 다시 판정해야 한다. 그 전까지 `Design Status`는 `temporary`이며 `confirmed`가 아니다.
- Stage 1 **design prerequisite만** current exact repaired head/tree에서 pass다. internal 1.5, Stage 2/4 implementation, Stage 5/final authority, Stage 6, Ready/merge, Manual/server-Mac/OAuth/device/AT, `R/R+1/R+2`, production/activation은 모두 pending이며 이 리뷰가 승인하지 않는다.

## Integration handoff

`APPROVE 0/0/0`. Reviewer-owned critique commit을 repaired design head `e2959ef523e57770a4cb2b490f7b00a972ab8845` 위에 normal integration하면 current-head Stage 1 design+critique prerequisite를 충족한다. 후속 구현은 explicit active-column selection, server-owned snapshot replacement, fail-closed recovery와 unchanged DELETE를 deterministic tests로 그대로 고정해야 한다.
