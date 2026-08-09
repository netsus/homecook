# LEFTOVERS — #11 cooked-batch weight and lifecycle UI

> Stage: Homecook #11 `cooked-batch-weight-ui` fresh Stage 1 design-generator
> Lineage: HOLD report `337daa808971802c79698df64c70240205addba4` → parent/current base `c16102a3072e929e45bb24a69464cd3110d03db5`
> Current official tuple: 요구사항 `v1.7.30` / 화면정의서 `v1.5.34` / 유저 Flow `v1.3.32` / DB `v1.3.32` / API `v1.2.37`
> Contract lineage: API `v1.2.37` preserves #8 API `v1.2.36` section `0-CBW`.
> Classification: `prototype-derived design`, high-risk UI change, not an anchor screen
> Design status: `temporary` — fresh independent critic, runtime evidence, final authority pending

## 1. Purpose and ownership

LEFTOVERS becomes the owner-facing presentation of the existing #8 `CookedBatchProjection`. It lets a user understand known, missing, unrecoverable, legacy-unknown, available, and depleted truth without treating discard/mixed states as eaten.

#11 owns only the UI/client-adapter lane:

- read the existing owner-only `GET /cooked-batches?availability=all` model;
- display content/name, cooked time, cooking servings, finished/remaining grams, weight/batch/depleted state, revision, and nutrition availability;
- present existing delayed weight, unrecoverable, discard, adjust, unweighed close, and exact current-closure cancel mutations;
- preserve permission, revision, idempotency, replay, and nondisclosure behavior from #8.

#11 does not own or render:

- #9 meal-log backend write paths, entry/event links, or consumed events;
- #12 `먹은 양 기록` / consumed-amount CTA, meal-log add/edit/delete sheet, or meal-log UI;
- new endpoint, field, status, error code, action enum, mutation, direct DML, generic reopen, or unrecoverable restore;
- servings-to-grams estimates, zero-filled nutrition, discard XP, or automatic meal entry.

### Legacy planner-add separation

The previous LEFTOVERS design centered `다먹음` and `플래너에 추가`, including `PlannerAddSheet`, serving stepper, and `POST /meals`. That is an older planner-reuse context and is not the #11 cooked-batch weight/lifecycle surface.

- This artifact removes PlannerAddSheet, planner date/meal/serving controls, optimistic `다먹음`, ATE_LIST routing, and `POST /meals` binding from the #11 design.
- If the existing product keeps a legacy planner-reuse entry elsewhere, it must remain a visually and semantically separate existing surface. It cannot appear inside the #11 batch action group or be mistaken for a weight, discard, adjust, close, or consume action.
- The #11 empty state has only a safe Planner return, matching the workpack. It does not use empty-state planner-add as a mutation shortcut.

## 2. Existing #8 reference boundary

The #8 merged implementation/API/authority/Stage 6 lineage is the state and mutation authority. #11 must consume it, not redesign it:

- `types/cooking.ts` → exact `CookedBatchProjection`
- `app/api/v1/cooked-batches/**` → existing owner-only mutations
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage4-frontend-implementation.md`
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-final-product-design-authority-post-typography-rereview.md`
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage6-frontend-successor-head-rereview.md`

Those artifacts are references only. They are not fresh #11 design, runtime, critic, or authority evidence and do not approve this document.

## 3. Mobile information architecture

```text
LEFTOVERS page
  ├─ sticky app bar: back / 남은요리
  ├─ optional existing stale-storage notice (separate concern)
  ├─ vertically scrolling cooked-batch list
  │    └─ batch card
  │         ├─ recipe identity + cooked metadata
  │         ├─ weight and nutrition truth
  │         ├─ state-specific explanation
  │         └─ #11 eligible actions only
  └─ existing bottom navigation + safe area

Eligible action
  └─ familiar bottom sheet
       ├─ title + state consequence
       ├─ internally scrollable form / confirmation
       ├─ inline or live error
       └─ fixed footer + safe area: cancel / confirm
```

- The page and cards never create horizontal page scroll. The batch list owns vertical page scrolling.
- Every mutation uses a familiar bottom sheet to preserve the list context. Destructive/irreversible actions are not inline one-tap mutations.
- Sheet body scrolls internally, background is locked, and fixed footer stays above `env(safe-area-inset-bottom)`.
- Default mobile width is 390px; 320px is the narrow sentinel. At 320px action buttons stack, labels wrap, numeric inputs remain at least 16px, and all targets stay at least 44×44px.

## 4. 390px wireframes

### 4.1 List with distinct batch states

```text
┌──────────────────────────────────────┐ 390
│ ‹                남은요리            │ sticky app bar
├──────────────────────────────────────┤
│ 김치찌개                    남은 요리 │
│ 8월 10일 요리 · 4인분                │
│                                      │
│ 완성 1,480g       남은 양 820g       │ known+available
│ 영양 계산 가능 · 기록 버전 3         │
│                                      │
│ [양 조정]                    [버림]   │ neutral before destructive
├──────────────────────────────────────┤
│ 닭볶음탕               무게 입력 필요│ missing+available
│ 8월 9일 요리 · 3인분                 │
│ 완성 직후 음식 전체 무게가 필요해요  │
│ 영양 계산은 무게 입력 전 사용할 수   │
│ 없어요                               │
│ [완성 중량 입력]                     │ primary unblock
│ [원래 무게를 알 수 없음]             │ irreversible secondary/danger
├──────────────────────────────────────┤
│ 된장찌개          원래 무게 확인 불가 │ unrecoverable+available
│ g 입력과 g 식사 기록을 사용할 수     │
│ 없어요                               │
│ [무게 없이 종료]                     │
├──────────────────────────────────────┤
│ 미역국                     이전 기록 │ legacy null / unknown
│ 중량 상태를 확인할 수 없어요         │ no action; not “missing”
│ [상세 확인]                          │ read-only
├──────────────────────────────────────┤
│ 카레                         모두 버림│ depleted+discarded
│ 완성 900g · 남은 양 0g               │
│ 종료된 기록이에요                    │ read-only
└──────────────────────────────────────┘
```

`먹은 양 기록` or any consumed-amount CTA is intentionally absent. #12 may add it later only after its own merge and activation.

### 4.2 Delayed original-weight sheet

```text
┌──────────────────────────────────────┐
│ ───                                  │
│ 완성 중량 입력                   [×] │
│ 닭볶음탕의 요리 직후 음식 전체 무게  │
├──────────────────────────────────────┤ internal scroll
│ 음식만의 원래 전체 중량(g)           │
│ [                              ] g   │ 16px+
│ 용기·그릇·접시 무게는 제외해 주세요  │
│ 현재 남은 양이 아니에요              │
│                                      │
│ □ 이 음식을 먹거나 버린 적이 없고,   │ required explicit confirmation
│   요리 직후 전체 무게가 맞아요        │
│                                      │
│ 영양 상태: 무게 입력 뒤 다시 계산됨  │ server truth only
├──────────────────────────────────────┤
│ [취소]                  [중량 저장]  │ fixed + safe area
└──────────────────────────────────────┘
```

The server remains authority for no-prior-event eligibility and revision. The checkbox is user confirmation, not a replacement for server validation.

### 4.3 Mark unrecoverable confirmation

```text
┌──────────────────────────────────────┐
│ 원래 무게를 알 수 없음          [×] │
│ 이 변경은 되돌릴 수 없어요           │
├──────────────────────────────────────┤
│ 이후에는 완성 중량 입력, known 복원, │
│ g 식사 기록을 사용할 수 없어요       │
│ 무게·영양을 0으로 기록하지 않아요    │
│                                      │
│ □ 되돌릴 수 없음을 이해했어요        │
├──────────────────────────────────────┤
│ [취소]            [확인하고 변경]    │ danger, not brand-primary
└──────────────────────────────────────┘
```

### 4.4 Discard and adjustment sheets

```text
discard input                         negative-adjust confirm
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ 버린 양 기록            [×] │      │ 조정 내용 확인          [×] │
│ 버린 양(g) [        ]        │      │ 현재 남은 양       820g     │
│ 사유       [상해서      ]    │      │ 조정               -20g     │
│ 예상 남은 양      700g       │      │ 조정 후            800g     │
│ meal-log/XP는 만들지 않아요  │      │ 사유        계량 보정       │
│ [취소] [내용 확인]           │      │ [취소] [조정 적용]           │
└──────────────────────────────┘      └──────────────────────────────┘
```

- Discard always requires positive grams, non-empty reason, and current revision, then a second confirmation summary of amount/reason/result.
- Adjustment requires signed `delta_g`, non-empty reason, and current revision. A negative delta requires the confirmation summary above. Positive correction may submit from the form only after its resulting preview is valid.
- Client result preview is guidance only. It cannot reach 0, exceed finished weight, or reopen a depleted batch; the server response replaces the preview.
- Discard never creates a meal-log entry or XP. Adjustment never depletes or reopens.

### 4.5 Unweighed close and exact cancel

```text
┌──────────────────────────────────────┐
│ 무게 없이 종료                  [×] │
│ 종료 이유를 선택해 주세요            │
│                                      │
│ ○ 다 먹음                           │ consumed
│ ○ 모두 버림                         │ discarded
│ ○ 먹고 버림                         │ mixed
│                                      │
│ 무게·식사 영양·meal-log 기록은       │
│ 남지 않아요                          │
│ □ 위 내용을 확인했어요              │
├──────────────────────────────────────┤
│ [취소]              [이 상태로 종료]│
└──────────────────────────────────────┘
```

After an exact current `closed_unweighed` projection, `current_unweighed_closure_event_id` may expose one secondary action labeled `[방금 종료 취소]`. It calls only `cancel_current` with that exact event ID. It is not called `다시 열기`, is absent after later events, and is never available for `marked_unrecoverable`.

## 5. 320px narrow wireframes

### 5.1 Known and missing cards

```text
┌──────────────────────────────┐ 320
│ ‹          남은요리          │
├──────────────────────────────┤
│ 김치찌개            남은 요리│
│ 8월 10일 · 4인분             │
│ 완성 1,480g                  │
│ 남은 양 820g                 │
│ 영양 계산 가능               │
│ [양 조정]                    │ 44px+, safe/neutral first
│ [버림]                       │ stacked destructive
├──────────────────────────────┤
│ 닭볶음탕       무게 입력 필요│
│ 원래 음식 전체 무게가        │
│ 필요해요                     │
│ [완성 중량 입력]             │
│ [원래 무게를 알 수 없음]     │
└──────────────────────────────┘
```

### 5.2 Action sheet with keyboard

```text
┌──────────────────────────────┐
│ 버린 양 기록            [×] │
├──────────────────────────────┤ internal scroll
│ 버린 양(g)                   │
│ [                          ] │ 16px+
│ 사유                         │
│ [                          ] │
│ error/status remains reachable│
│                              │ virtual keyboard may reduce body
├──────────────────────────────┤
│ [계속]                       │ fixed CTA, primary first visually
│ [취소]                       │ safe area
└──────────────────────────────┘
```

- Sheet width remains within viewport and has no page-level horizontal overflow.
- Long Korean labels wrap. Buttons stack instead of reducing target height, font, or padding.
- The active input, live error, and CTA remain reachable by internal scroll when the virtual keyboard is visible.

## 6. Display truth and state matrix

### 6.1 Weight/batch truth

| Projection | Required label and values | #11 actions | Forbidden |
| --- | --- | --- | --- |
| `known + available` | finished/remaining g; nutrition status; revision | `버림`, `양 조정` | consumed-amount CTA before #12 |
| `missing + available` | `무게 입력 필요`; no zero/estimate | `완성 중량 입력`, `원래 무게를 알 수 없음`, `무게 없이 종료` | g meal-log, guessed grams |
| `unrecoverable + available` | `원래 무게 확인 불가`; weight values remain null | `무게 없이 종료` | weight input, restore, marker reversal, g meal-log |
| legacy all-null authority | `이전 기록 · 중량 상태를 확인할 수 없음` | read-only detail/safe return | treating as missing, unrecoverable, available, or depleted |
| `depleted` | one exact reason label; known weights may show remaining 0g | read-only; exact current-closure cancel only when projection provides eligibility | weight/discard/adjust/close/consume controls; generic reopen |

### 6.2 Depleted reason labels

| `depleted_reason` | User label | Legacy eaten / XP meaning |
| --- | --- | --- |
| `consumed` | `다 먹음` | yes |
| `discarded` | `모두 버림` | no |
| `mixed` | `먹음·버림으로 소진` | no |
| `consumed_unweighed` | `무게 없이 다 먹음` | yes |
| `discarded_unweighed` | `무게 없이 모두 버림` | no |
| `mixed_unweighed` | `무게 없이 먹고 버림` | no |

Only the two consumed variants may look eaten. Discarded and mixed variants must not use eaten color, icon, copy, navigation, or celebration.

### 6.3 Screen and request states

| State | Visible response | Action behavior |
| --- | --- | --- |
| `loading` | stable card skeletons and `불러오는 중` status | no stale/guessed buttons |
| `empty` | `저장된 요리 기록이 없어요` + explanation | safe `[플래너로 돌아가기]` only |
| `ready` | authoritative cards in `cooked_at DESC,id DESC` order | state-eligible #11 actions only |
| `error` read | non-private retry message | retry + safe back; no cached mutation controls |
| `permission` 401 | login guidance | return-to-action; private cards not rendered |
| private 404 | same nondisclosing missing message | safe back; no owner/state clue |
| `read-only` | legacy unknown or depleted truth | no mutation affordance except exact eligible current-closure cancel |
| mutation pending | values retained; progress/live status | duplicate submit, Escape, backdrop, and close locked |
| 409 stale/state/bounds | actionable alert; refreshed card truth | input retained if still safe; require fresh deliberate retry |
| 409 `WEIGHT_UNRECOVERABLE` | card refreshes to unrecoverable | all gram controls removed; no restore offered |
| 409 `BATCH_ADJUSTMENT_INVALID` | reason/delta retained | correct input; no optimistic result |
| 422 validation | field-linked message | focus alert then first invalid field |
| same-key replay | stored result rendered once | one sheet close/card update; no duplicate feedback/effect |
| same-key different payload | existing conflict alert | mutation 0; new deliberate action required |

## 7. Action interaction notes

### Shared bottom-sheet behavior

1. Invoking CTA is stored for focus restoration.
2. Sheet opens with initial focus on the title; background is inert and scroll-locked.
3. In a non-destructive sheet, focus order is title → help → inputs/radios → primary submit → cancel/close. In a destructive or irreversible confirmation, the safe cancel action precedes the danger confirm in both DOM and visual order; initial focus never lands on the danger action.
4. Tab and Shift+Tab are trapped. Escape, close button, and cancel dismiss only while not pending.
5. Cancel/dismiss returns focus to the exact invoking card CTA. Success moves focus to the updated card heading/status.
6. 409/422 moves focus to a `role=alert` summary connected through `aria-describedby`; correctable values stay present.
7. Pending uses `role=status`, disables all actions, blocks duplicate pointer/keyboard submit, and prevents ambiguous dismiss.

### Delayed weight

- Open only for explicit `missing+available`.
- Require positive original food-only total and explicit no-eating/no-discard confirmation.
- On success render the returned known projection. On eligibility conflict keep the input only if still safe and refresh the server card.
- `WEIGHT_UNRECOVERABLE` immediately removes input and transitions visual truth to unrecoverable.

### Mark unrecoverable

- Present as irreversible/danger secondary, never as the default primary path.
- Confirmation explicitly states no later grams, known restore, g nutrition, or g meal-log.
- Success and same-result replay close once. Existing `WEIGHT_UNRECOVERABLE` also refreshes and locks the UI.

### Discard / adjust

- Discard requires grams, reason, revision, and a confirmation summary with calculated remaining guidance.
- Adjustment requires signed delta, reason, and revision; negative delta gets the same summary step.
- All previews are non-authoritative. Only the returned `batch` changes the displayed remaining/status/reason.
- Discard and adjustment remain hidden unless the already-merged #8 reader-before-writer cutover is confirmed in the implementation lineage.

### Unweighed close / cancel current

- Close is available only for missing/unrecoverable + available and requires exact `consumed|discarded|mixed` plus no-grams/no-nutrition confirmation.
- Cancel uses the exact projected `current_unweighed_closure_event_id`, current revision, and `action=cancel_current` only.
- There is no generic reopen label, no cancel of a non-current closure, and no reversal of `marked_unrecoverable`.

## 8. Permission, idempotency, and replay

- All reads and mutations are owner-only. Other-owner/missing batch stays the same `404 RESOURCE_NOT_FOUND` with `fields=[]` and no existence clue.
- Every mutation sends a UUID `Idempotency-Key` and the current `expected_revision` required by the existing contract.
- A retry of the same canonical payload reuses the operation key. Editing any canonical payload field creates a new deliberate key; the client never retries a changed payload under the old key.
- Same-key replay consumes exact stored `action`, `batch`, and nullable `event_id`; it updates the card and closes once without duplicate toast, animation, event, or XP projection.
- The client never authors `remaining_weight_g`, `batch_status`, `depleted_reason`, revision, nutrition state, or replay result.

## 9. Data and API binding

### 9.1 Read model

`GET /cooked-batches?availability=all&limit=20[&cursor=opaque]`

| UI | Existing `CookedBatchProjection` field |
| --- | --- |
| recipe title/thumbnail | `recipe_title`, `recipe_thumbnail_url` |
| cooked metadata | `cooked_at`, `cooking_servings` |
| weight values | `finished_weight_g`, `remaining_weight_g`, `weight_status` |
| lifecycle truth | `batch_status`, `depleted_reason` |
| request concurrency | `revision` |
| nutrition copy | `nutrition_calculation_status` |
| exact cancel eligibility | `current_unweighed_closure_event_id` |
| legacy compatibility only | `status`; never overrides new non-null authority |

All 15 fields are present for authorized items, but legacy-only fields may be explicit `null`. The UI never derives grams or state from servings, title, thumbnail, or legacy `status`.

Nutrition copy:

- `complete` → `영양 계산 가능`
- `partial` → `일부 영양 정보 없음`
- `unavailable` → `영양 정보 없음`
- legacy `null` → `영양 상태를 확인할 수 없음`

### 9.2 Existing mutation bodies

| User action | Existing request |
| --- | --- |
| delayed weight | `PATCH /cooked-batches/{id}/weight` `{ action:"set_finished_weight", finished_weight_g, expected_revision }` |
| mark unknown forever | `PATCH /cooked-batches/{id}/weight` `{ action:"mark_unrecoverable", expected_revision }` |
| discard | `POST /cooked-batches/{id}/discard` `{ discarded_g, reason, expected_revision }` |
| adjust | `POST /cooked-batches/{id}/adjust` `{ delta_g, reason, expected_revision }` |
| unweighed close | `POST /cooked-batches/{id}/close-unweighed` `{ action:"close", closure_reason, expected_revision }` |
| exact cancel | same endpoint `{ action:"cancel_current", reverses_event_id, expected_revision }` |

Every success uses exact 3-key `{ action, batch, event_id }`. The wrapper remains `{ success, data, error }`; error remains `{ code, message, fields[] }`. No alias field, local status, new error name, or new mutation action is added.

## 10. Visual hierarchy and tokens

- Use current app palette and shape tokens: `--brand-primary`, `--brand-primary-soft`, `--surface`, `--surface-fill`, `--text-2/3`, `--border`, `--danger`, `--radius-control/card/sheet`, `--control-height-md/lg`.
- Known remaining grams are the strongest card datum after the recipe title. Status labels are text plus shape/icon, not color alone.
- Unblocking `완성 중량 입력` is primary for missing state. Irreversible `원래 무게를 알 수 없음` is a separated danger secondary action.
- `버림` is destructive secondary; `양 조정` is neutral secondary. Neither visually competes with a future #12 consumed CTA.
- Depleted cards reduce action affordance and emphasize terminal reason. Consumed, discarded, and mixed use distinct text/icon treatment; discarded/mixed never use eaten celebration styling.
- Existing stale-storage notice, if retained by the surrounding screen, stays visually separate from batch weight status and cannot introduce a new depleted reason.

## 11. Accessibility contract

- Card actions include recipe context: `김치찌개 버린 양 기록`, `김치찌개 남은 양 조정`, `닭볶음탕 완성 중량 입력`.
- Numeric inputs have 16px+ text, visible unit, explicit label, `inputMode=decimal`, and field-linked errors. Reason input has a programmatic label and visible requirement.
- Radio groups expose group labels and checked state. Irreversible confirmations are not prechecked.
- Updated batch status is announced politely; mutation failure uses a live alert. Status meaning is not conveyed by color alone.
- Every interactive target is 44×44px minimum. At 320px, controls stack and text reflows without horizontal scrolling or content loss.
- Raw UUIDs, opaque cursor, revision integer, and event ID may be used internally. If revision is shown to satisfy auditability, it is labeled `기록 버전 N`, not exposed as an unlabeled developer value. Event IDs/cursors are never displayed or announced.

## 12. Evidence plan and limitations

Stage 4 must create fresh implementation evidence under `ui/designs/evidence/cooked-batch-weight-ui/` for 390px, 320px, and desktop. It must cover:

- known available with discard/adjust and no #12 consumed CTA;
- missing delayed-weight confirmation;
- unrecoverable irreversible confirmation and post-409 lock;
- unweighed close plus exact current cancel eligibility;
- legacy unknown/null distinct from every depleted reason;
- all six depleted labels and read-only affordance removal;
- loading, empty, read error, unauthorized/private nondisclosure, pending, stale revision, 422, replay;
- sheet internal scroll, fixed CTA, safe area, 44px targets, 16px numeric input, keyboard avoidance, and no overflow.

`ui/designs/evidence/cooked-batch-weight-ui/manifest.json` must record implementation head SHA, capture time, viewport, state, and path. Fresh authority reports may cite only that post-implementation manifest and artifacts.

This Markdown and its ASCII wireframes do not prove runtime keyboard navigation, focus order/trap/restore, Escape behavior, virtual-keyboard occlusion, computed target size, screen-reader labels/live errors, contrast, or WCAG conformance. Static PNGs will prove only visible layout states. DOM/runtime tests plus Manual physical keyboard, real-device safe area, and VoiceOver/TalkBack checks remain separate. No runtime screenshot, full WCAG, or final authority claim is made in Stage 1.

## 13. Independent review handoff

- Fresh critic path: `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`
- Future runtime authority path: `ui/designs/authority/LEFTOVERS-authority.md`
- The design-generator author does not write either report and does not approve this design.
- Critic must check current tuple/base, #8 contract reuse, #9/#12 exclusions, legacy planner-add separation, 390/320 hierarchy, all state and depleted distinctions, permission/replay, sheet behavior, keyboard/focus/accessibility, and the no-runtime-claim boundary.
