# meal-log-ui #12 Stage 1 current-head fresh independent design re-review

> critic task ID: `019ffbb4-28ab-7410-b1c1-369c7848342e`
> review date: `2026-08-14`
> role: fresh independent design critic; latest repair author task `019ffba3-1c21-7f41-9ae0-8a6456dbd145`와 분리
> verdict: `🔴 HOLD`
> grade: `🔴` — P0 `0`, P1 `1`, P2 `0`
> scope: PR #1349 current design delta와 `ui/designs/MEAL_LOG.md` 전체 설계 계약. Design/workpack/projection/test/code, PR body, Ready/merge, Discord, runtime final authority는 이 critic이 변경하거나 승인하지 않는다.

## Reviewed exact tuple and provenance

- PR: #1349 Draft, branch `docs/meal-log-ui-stage1-relock-current`
- exact base: `c12afbccd15f4935a1a52b9f2c2c23882a5033ff`
- exact reviewed head: `69965f5292792d8b4b4555a518d3bbb4c4860971`
- exact reviewed tree: `3f7fd32e88c238ccebba6fc537f242e102055c09`
- reviewed artifact: `ui/designs/MEAL_LOG.md`
- reviewed artifact blob: `110b106cdb94034c9d46af8f86cf3652b1bb205a`
- current critique predecessor blob, superseded by this report: `56cbbeb89d9f9e556bfcabb9c834960158aeaa9c`
- immediate pre-delta integration: `ac188b6e4aa590cac35f5f6df873f5c654a69330`; design blob `103d67e470ee42aa751c6a52fff914460d9cc71a`
- generator task/head/tree: `019ffb5f-b4be-7153-84b8-e4f341bd5ae5` / `1b44bb7238cc6d0381805585f371fe12e0cb90f0` / `851ceaa34835b7f5288590a3f0b74f7666e50eb7`
- design repair task/head/tree: `019ffb73-1f48-7832-8d18-b043209f208a` / `910d14e99e71c9a05aa623cbf0a9c3b6f1f9456b` / `a578bf1d8da21a3bce230051399c6be1fd9da78c`
- prior fresh re-review task and verdict: `019ffb81-4bad-7353-b92b-add4924a4a40`, `APPROVE 0/0/0`, reviewed the earlier repaired design head/tree `910d14e99e71c9a05aa623cbf0a9c3b6f1f9456b` / `a578bf1d8da21a3bce230051399c6be1fd9da78c`
- latest successor repair author task: `019ffba3-1c21-7f41-9ae0-8a6456dbd145`; this report is its required independent current-head refresh
- current official authority: requirements `v1.7.32`, screen `v1.5.36`, flow `v1.3.34`, DB `v1.3.34`, API `v1.2.39`
- approved master plan: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

Remote `refs/heads/docs/meal-log-ui-stage1-relock-current`, GitHub PR #1349 `headRefOid`, local checkout head and tree를 각각 대조해 위 exact tuple이 일치함을 확인했다.

## Executive verdict

latest delta의 server-owned day total 수정은 공식 계약과 merged #9 projection에 맞다. `GET /meal-log`의 `day_total`은 active section뿐 아니라 `meal_plan_column_id IS NULL`인 deleted-column snapshot section까지 포함한 모든 visible non-deleted entry에서 계산되고, incomplete count도 같은 전체 집합에서 나온다. 설계가 이를 client active-only 합산으로 다시 만들지 않도록 잠근 점은 승인 가능하다.

deleted-column 기존 row에 add CTA/new target을 두지 않으면서 edit/delete를 노출한 방향도 공식 화면/API 계약에 맞다. DELETE의 expected revision, soft delete, own active batch event reversal, focus fallback, 44px action name은 구현 가능한 수준이다.

그러나 deleted-column edit의 저장 계약 한 곳이 현재 merged #9와 맞지 않아 Stage 1 current-head design prerequisite를 통과시킬 수 없다. 설계는 `meal_plan_column_id=null`과 snapshot slot을 유지한 quantity/source/date/timezone PATCH를 약속하지만, 현행 request type/parser/RPC는 모든 PATCH에 non-null active owner column UUID를 요구하고 성공 시 `slot_name_snapshot`도 그 active column name으로 교체한다. null 유지 요청은 보낼 수 없고, 삭제된 예전 UUID도 유효 target이 아니다. 이 모순은 구현자가 silent default, 실패하는 저장, 또는 문서 밖 partial PATCH를 선택하게 만든다.

따라서 verdict는 `🔴 HOLD`, P1 1건이다. 현행 공식 계약만으로 닫는 design-only repair 경로는 deleted-column row의 모든 edit save에서 active column 명시 선택을 필수화하는 것이다. null/snapshot 위치를 그대로 유지하는 edit가 제품 요구라면 public PATCH 계약 변경이 필요하지만, 이번 PR에는 Contract Evolution이 없으므로 그 경로를 설계에 포함하면 안 된다.

## Latest repair review

| Area | Result | Evidence and boundary |
| --- | --- | --- |
| server-owned day total | PASS | Official screen says day total equals every non-deleted meal subtotal; API returns active and deleted-column sections plus one day total. Merged #9 SQL calculates `v_total` from every non-deleted row, not only active sections. Design lines 88-90 and 610-641 preserve the server projection and incomplete truth. |
| deleted-column no-add boundary | PASS | Official screen/flow exclude deleted columns only from new record targets. Design removes add CTA from DOM and selection while retaining existing row actions. |
| deleted-column DELETE | PASS | Design lines 427-444 match official expected revision, all-source soft delete, batch own-event reversal/pointer null and nondestructive focus fallback. No new action exists. |
| deleted-column PATCH | **HOLD** | Design lines 421-422 promise a null/snapshot-preserving PATCH that current #9 cannot accept. See `P1-ML-05`. |
| provenance / self-approval | PASS | Generator, repair and earlier review lineage is recorded; latest author explicitly leaves exact-head critique refresh to a different task. This report supplies that refresh and does not promote runtime/final authority. |

## Prior four finding regression check

| Finding | Current result | Regression evidence |
| --- | --- | --- |
| `P1-ML-01` seven-day range movement | RESOLVED / NO REGRESSION | Exact ±7 calendar days, selected-date visibility, existing Planner `date` history, Back/Forward zero-write sync, bounded existing day reads remain intact. |
| `P1-ML-02` `availability=all` depleted/legacy-null | RESOLVED / NO REGRESSION | Exact six depleted reasons, legacy-null copy, server order/cursor and no inferred gram/nutrition/action remain intact. |
| `P1-ML-03` recent/frequent grouping | RESOLVED / NO REGRESSION | One server-ordered `최근·자주 먹은 음식` list, frequency metadata and one cursor remain intact. |
| `P1-ML-04` ingredient approved-unit projection | RESOLVED / NO REGRESSION | `default_unit` remains non-authoritative; mutation-owned evidence and correctable `422 UNIT_CONVERSION_MISSING` preserve input and cursor. |

## Mobile baseline and accessibility review

| Keyword / axis | Result | Evidence |
| --- | --- | --- |
| `mobile-first` information hierarchy | PASS | selected day → compact server summary → active sections → deleted snapshot history; plan rows and weekly analysis remain separate. |
| `390px mobile baseline` | PASS | 16px gutter, localized one-row rail, 44×44px range/edit/delete targets, visible subtotal/incomplete and safe-area clearance. |
| `320px narrow baseline` | PASS | page horizontal overflow is forbidden; only the rail scrolls; labels and edit/delete actions stack without shrinking targets. |
| `desktop adaptation` | PASS | Same route, segment, DOM/reading order and day-first model; no desktop-only dashboard/navigation/analysis. |
| `scroll containment` | PASS | Rail owns horizontal overflow; sheet body owns vertical scroll; background lock and header/body/footer boundaries are explicit. |
| `primary CTA / destructive hierarchy` | PASS | add/save primary, edit/cancel/retry secondary, delete destructive tertiary; DOM and visual order stay aligned. |
| `focus / keyboard / screen reader / reduced motion` | PASS WITH P1 DEPENDENCY | radiogroup, roving tabindex, dialog trap/restore, named deleted-row actions, live errors, 200% text and reduced motion are specified. Deleted edit error/focus behavior must be rebound to the required active-column selector when `P1-ML-05` is repaired. |
| `44px / no-overflow / state matrix` | PASS | Target geometry, rail-only overflow, 17 planned states and deterministic evidence matrix remain present across 390/320/desktop. |
| screenshot/Figma evidence | STAGE 1 PLAN ONLY | Fresh runtime screenshots/Figma and product-design-authority remain pending; markdown is not final visual authority. |

## State, typed-union and evidence boundaries

- PASS: default/loading/empty/error/unauthorized/partial/unavailable/deleted-column/missing/unrecoverable/depleted/legacy-null/pending/replay/conflict/correctable-422 stay distinct and fail closed.
- PASS: day total, section subtotal, incomplete count, active/deleted grouping and nutrition status remain server-owned; null is never rendered as zero.
- PASS: `GET /food-catalog/search` remains a single `ingredient | food_product` discriminated union with one server order and opaque cursor; no client merge or unofficial field is added.
- PASS: product exact basis, ingredient approved conversion/piece evidence, owner/generation visibility and raw ID/cursor/event/operation nondisclosure boundaries remain intact.
- PASS: pending locks duplicate submit/dismiss, same-key replay applies one stored result, and stale revision refreshes authority while retaining correctable input.
- HOLD: deleted-column edit conflict/replay can only be made deterministic after the payload-valid active-column selection rule is explicit.

## Findings

### P0 (0)

없음.

### P1 (1)

#### `P1-ML-05` Deleted-column edit promises a PATCH shape that merged #9 rejects

**Evidence**

- `ui/designs/MEAL_LOG.md:421-422` says quantity/source/date/timezone edits can preserve nullable `meal_plan_column_id` and `slot_name_snapshot`, and active-column selection is needed only when the user changes the slot.
- `types/meal-log.ts:14-21` defines mutation `mealPlanColumnId` as non-null `string`, while read entries correctly allow `meal_plan_column_id: string | null` at lines 33-40.
- `lib/server/meal-log.ts:117-165` requires the full mutation body for PATCH and rejects a null/non-UUID `meal_plan_column_id`.
- `supabase/migrations/20260810120000_meal_log_core.sql:299-314` builds deleted-column sections only from rows whose `meal_plan_column_id IS NULL`.
- The same RPC at lines 436-437 requires an existing owner column and at lines 647-650 always writes that active column ID and its current name snapshot.
- The edit wireframe itself says `기록 수정 · 7월 22일 · 아침` while the selected current context says `삭제된 끼니 · 야식`, leaving the exact context and required target ambiguous.

**Impact**

The promised “edit in place” path cannot be implemented from the current read projection and existing PATCH contract. Sending null fails validation, sending the deleted column's former UUID fails server lookup, silently selecting the first active column violates explicit choice, and inventing omit/preserve semantics would add an unofficial request shape. A user can therefore enter a valid-looking edit flow that cannot safely save, or have history moved to another meal without informed consent.

**Required design repair — no Contract Evolution**

1. For every PATCH opened from a deleted-column row, display the current snapshot slot as read-only origin context and require the user to explicitly choose one item from current `active_columns[]` before save, even when only quantity/source/date/timezone changes.
2. Keep save disabled until that selection exists. Do not send null, the deleted former UUID, or a silent/default active column. The existing PATCH operation and existing `meal_plan_column_id` field are sufficient; no endpoint/field/action is added.
3. Make the sheet title, origin context and target label consistent: for example `기록 수정 · 7월 22일 · 삭제된 끼니 야식` plus required `옮길 끼니` active-column selector.
4. If the selected active column disappears or authority becomes stale, retain every correctable input, refresh `active_columns[]` and entry revision, focus the linked selector/error, require explicit reselection and use the existing server code/message/fields without inventing an alias. A corrected payload is a new deliberate operation with a fresh UUID; retry of the identical payload reuses its key.
5. Preserve the current pending/replay/delete/focus contracts: duplicate submit and dismiss stay locked, replay applies once, cancel/error returns to the invoking edit action, successful move focuses the destination section/entry or its heading, and successful delete falls back to the deleted section heading/panel heading.
6. Update the deleted-column deterministic assertion so null-preserving PATCH is not expected. Assert `add/new target=0`, edit/delete visible, edit save requires explicit active target, no silent default, current contract fields only, stale selector recovery, own-event replacement, soft-delete reversal and focus restoration.

If preserving `meal_plan_column_id=null` after editing is non-negotiable, stop this Stage 1 path and request an explicitly approved Contract Evolution. That alternative is not approved or recommended by this review.

### P2 (0)

없음. The contradictory sheet title is included in `P1-ML-05` because it is part of the same payload/context ambiguity.

## Stage boundary and handoff

`🔴 HOLD`. The earlier four findings remain resolved and the new day-total/deleted-section inclusion is approved, but the current exact head/tree has one unresolved P1. The repair author should edit the design/workpack projections as needed on a normal successor commit and request a fresh exact-head critic re-review. This critic does not perform that repair.

Stage 1 design prerequisite is not current-head complete while `P1-ML-05` remains open. `Design Status` stays `temporary`. Stage 4 runtime implementation/evidence, fresh 390px/320px/desktop screenshots or Figma, Stage 5, final `product-design-authority`, Stage 6, Ready/merge, Manual/server-Mac/OAuth/device/AT, `R/R+1/R+2`, production and activation all remain pending and are not approved by this report.
