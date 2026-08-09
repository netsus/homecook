# LEFTOVERS — #11 cooked-batch weight and lifecycle UI

> Stage: Homecook #11 `cooked-batch-weight-ui` fresh Stage 1 design-generator
> Reviewed design input: commit `0d64660ff8a7059754f1534cf7663573247a5263`, tree `f41f2ed854a3596dc09928063a11308f38c6552f` (the exact bytes reviewed by the two cooked-batch-weight-ui critics)
> Internal 1.5 HOLD evidence: commit `337daa808971802c79698df64c70240205addba4`, report `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage1-internal1-5-review.md`
> Critic HOLD evidence / repair base: commit `ec1f1d816089bdb8973972107f7f0fedd7dbe033`, tree `7d244a636527d1530217b6b99c92b7de84fb6f22`, parent `0d64660ff8a7059754f1534cf7663573247a5263`
> Evidence role rule: both HOLD sources are repair inputs only; neither approves this design or serves as its parent/base claim
> Current official tuple: 요구사항 `v1.7.30` / 화면정의서 `v1.5.34` / 유저 Flow `v1.3.32` / DB `v1.3.32` / API `v1.2.37`
> Contract lineage: API `v1.2.37` preserves #8 API `v1.2.36` section `0-CBW`.
> Classification: `prototype-derived design`, high-risk UI change, not an anchor screen
> Design status: `temporary` — fresh independent critic, runtime evidence, final authority pending

## 1. Purpose and ownership

LEFTOVERS preserves the official legacy leftover-management journey and adds the owner-facing #8 cooked-batch weight/lifecycle presentation. These are two independent sections backed by two independent read models. A legacy row and a v2 batch row are never guessed to be the same record.

#11 owns only the UI/client-adapter lane:

- preserve the existing `/leftovers` section, `PlannerAddSheet`, planner reuse, `다먹음`, `ATE_LIST`, `덜먹음`, and stale-review/`계속 보관` behaviors without changing their contracts;
- read the existing owner-only `GET /cooked-batches?availability=all` model;
- display content/name, cooked time, cooking servings, finished/remaining grams, weight/batch/depleted state, revision, and nutrition availability;
- present existing delayed weight, unrecoverable, discard, adjust, unweighed close, and exact current-closure cancel mutations;
- preserve permission, revision, idempotency, replay, and nondisclosure behavior from #8.

#11 does not own or render:

- #9 meal-log backend write paths, entry/event links, or consumed events;
- #12 `먹은 양 기록` / consumed-amount CTA, meal-log add/edit/delete sheet, or meal-log UI;
- new endpoint, field, status, error code, action enum, mutation, direct DML, generic reopen, or unrecoverable restore;
- servings-to-grams estimates, zero-filled nutrition, discard XP, or automatic meal entry.

### Two-source identity and action isolation

The official legacy journey is required existing behavior, not an optional compatibility surface. It remains visible in its own first section and retains its current route/action group:

- **Legacy section source/identity:** `GET /leftovers?status=leftover`, keyed only by its returned `leftover_id` (`items[].id`). `다먹음`, `계속 보관`, and planner reuse send that exact `leftover_id`; ATE_LIST separately reads `status=eaten` and `덜먹음` sends its exact `leftover_id`.
- **Cooked-batch section source/identity:** `GET /cooked-batches?availability=all`, keyed only by its returned `batch_id` (`items[].id`). Weight/discard/adjust/close/cancel send that exact `batch_id` and projected revision/event ID.
- A client may namespace local DOM/state keys as `legacy:<leftover_id>` and `batch:<batch_id>` only to avoid collisions. Those prefixes are not public fields and are never persisted or sent.
- Never join, merge, deduplicate, or cross-route the two sources by `id`, `recipe_id`, title, thumbnail, `cooked_at`, servings, array position, or any other guessed similarity. If both APIs return visually similar records, both remain in their clearly labeled sections until an approved contract supplies a stable relation.
- Legacy cards never receive cooked-batch weight mutations. Cooked-batch cards never call legacy `eat`, `uneat`, `keep`, or planner-add actions. A v2 compatibility `status=eaten` is display compatibility only and does not authorize a legacy action.
- Stale-review banner/card copy comes only from `/leftovers.stale_reviewed_at`; `source_meal_label` and `source_planned_servings` also remain legacy-only. They are never synthesized for a 15-field batch item.

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
LEFTOVERS page — one vertical page scroll
  ├─ sticky app bar: back / 남은요리 / 다먹은 목록
  ├─ Section A: 남은요리 관리 (legacy `/leftovers` read model)
  │    ├─ stale-storage banner + 계속 보관
  │    └─ legacy card: planner-add / 다먹음 only
  ├─ section divider + source-specific explanation
  ├─ Section B: 중량·잔량 기록 (v2 `/cooked-batches` read model)
  │    ├─ batch cards: weight/lifecycle truth + #11 actions only
  │    └─ cursor control: 더 보기 / next pending / error / retry
  └─ existing bottom navigation + safe area

Eligible action
  └─ familiar bottom sheet
       ├─ title + state consequence
       ├─ internally scrollable form / confirmation
       ├─ inline or live error
       └─ fixed footer + safe area: cancel / confirm
```

- The page and cards never create horizontal page scroll. Both sections share one familiar vertical page scroll; neither creates a nested list scroll.
- Each section owns its own loading, empty, error, ready, and action state. Failure or emptiness in one source does not erase or relabel the other section.
- Every #11 cooked-batch mutation uses a familiar bottom sheet to preserve the list context. Destructive/irreversible batch actions are not inline one-tap mutations; existing legacy action patterns remain unchanged.
- Sheet body scrolls internally, background is locked, and fixed footer stays above `env(safe-area-inset-bottom)`.
- Default mobile width is 390px; 320px is the narrow sentinel. At 320px action buttons stack, labels wrap, numeric inputs remain at least 16px, and all targets stay at least 44×44px.

## 4. 390px wireframes

### 4.1 Two-section list and action hierarchy

```text
┌──────────────────────────────────────┐ 390
│ ‹                남은요리   [다먹은 목록]│ sticky app bar
├──────────────────────────────────────┤
│ 남은요리 관리                         │ Section A · `/leftovers`
│ 플래너에 다시 쓰거나 다 먹음 처리해요 │
│ 오래 보관한 요리 1개                  │ legacy stale banner
│                                      │
│ 김치찌개                     8월 1일  │ legacy card / leftover_id
│ 저녁 · 계획 2인분 · 요리 4인분        │ legacy-only metadata
│ 보관한 지 30일이 지났어요             │ stale_reviewed_at=null
│ [계속 보관]                           │ `/leftovers/{id}/keep`
│ [플래너에 추가]             [다먹음]  │ legacy action group
├──────────────────────────────────────┤ strong section divider
│ 중량·잔량 기록                        │ Section B · `/cooked-batches`
│ 요리 직후 무게와 남은 양을 관리해요   │ no legacy actions in this section
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
├──────────────────────────────────────┤
│ 카레                         모두 버림│ depleted+discarded
│ 완성 900g · 남은 양 0g               │
│ 종료된 기록이에요                    │ read-only
├──────────────────────────────────────┤
│               [더 보기]              │ has_next=true, 44px+
└──────────────────────────────────────┘
```

The same recipe title may appear once in each section. The UI does not imply that those cards share an ID or state. Section labels and spacing are always visible before their first cards, including at 320px.

`먹은 양 기록` or any consumed-amount CTA is intentionally absent from the cooked-batch section. #12 may add it later only after its own merge and activation. Legacy `다먹음` remains only in Section A and is not a gram consumption action.

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

### 4.6 Cursor pagination — familiar `더 보기`

```text
last loaded batch card
├──────────────────────────────────────┤
│               [더 보기]              │ idle, has_next=true
│                                      │
│          더 불러오는 중…             │ pending; current cards stay
│                                      │
│ 다음 기록을 불러오지 못했어요        │ next-page error, role=alert
│              [다시 시도]             │ same untouched opaque cursor
│                                      │
│ 목록 조건이 바뀌었어요               │ cursor/filter 422
│         [처음부터 새로고침]           │ no cursor, same `availability=all`
└──────────────────────────────────────┘
```

- First and next pages use the exact `availability=all` filter. The client does not display, parse, edit, decode, log, or transplant the opaque cursor; it only returns the unchanged `next_cursor` from the immediately preceding successful page.
- `has_next=false` requires `next_cursor=null` and removes the control. `has_next=true` requires a non-null next cursor; an invalid container fails closed as a read error rather than guessing a cursor.
- Append order remains the server order `cooked_at DESC, id DESC`. Within the cooked-batch section, duplicate `batch.id` cards are not appended; this is page-overlap protection only, never a cross-source join or content-based dedupe.
- Next-page pending keeps every already rendered card, open sheet, correctable input, idempotency key, and mutation pending state intact. It disables only duplicate `더 보기` requests and never cancels or replays an action.
- While a batch mutation is pending, pagination retry/refresh controls are disabled. An already-running next-page request may append its cards but must not close, reset, replace, or refocus the mutation sheet or its invoking card.
- A network/server next-page error keeps loaded cards and offers `[다시 시도]` with the same untouched cursor. A filter-bound/malformed cursor `422 VALIDATION_ERROR` is not retried as valid: `[처음부터 새로고침]` requests the first `availability=all` page without a cursor and replaces the batch list only after success.
- On append, a polite live region announces `중량·잔량 기록 N개를 더 불러왔어요`. When pagination still owns focus, focus stays on `[더 보기]` while it remains; if the final append removes the control, focus moves to the first newly appended batch-card heading (`tabindex=-1`). If a mutation sheet has since taken focus, append never steals it. Error focus moves to the next-page alert only when pagination still owns focus; retry success follows the same rule.

## 5. 320px narrow wireframes

### 5.1 Both sections, known/missing, and pagination

```text
┌──────────────────────────────┐ 320
│ ‹       남은요리 [다먹은 목록]│
├──────────────────────────────┤
│ 남은요리 관리                │ Section A
│ 플래너 재사용·다먹음         │
│ 김치찌개 · 저녁 · 2인분      │ legacy card
│ 보관한 지 30일이 지났어요    │
│ [계속 보관]                  │
│ [플래너에 추가]              │ 44px+, stack
│ [다먹음]                     │
├──────────────────────────────┤ strong section divider
│ 중량·잔량 기록               │ Section B
│ 음식 무게와 남은 양 관리     │
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
├──────────────────────────────┤
│ [더 보기]                    │ full width, 44px+
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
- At 320px, the two section headings remain visible and action groups never share a row. `더 보기`, retry, and refresh controls use the same full-width 44px minimum pattern.

## 6. Display truth and state matrix

### 6.1 Legacy `/leftovers` truth

| Legacy source state | Required UI/action | Forbidden crossover |
| --- | --- | --- |
| `status=leftover`, not stale | recipe/date/latest meal/planned + cooking servings | cooked-batch revision/weight/status inference |
| `status=leftover`, stale and unreviewed | `보관한 지 N일이 지났어요`, `계속 보관` | automatic `eaten`, batch close/discard |
| `status=leftover` action group | `플래너에 추가`, `다먹음` | weight/discard/adjust/close/cancel mutation |
| `status=eaten` in ATE_LIST | eaten date + `덜먹음`; 30-day auto-hide policy | cooked-batch reopen/cancel inference |

Planner-add, `다먹음`, ATE_LIST, `덜먹음`, and stale review retain their existing loading/pending/error/focus behavior and current contracts. This design changes only their placement into the explicit legacy section; it does not rename their endpoint bodies or make them batch actions.

### 6.2 Weight/batch truth

| Projection | Required label and values | #11 actions | Forbidden |
| --- | --- | --- | --- |
| `known + available` | finished/remaining g; nutrition status; revision | `버림`, `양 조정` | consumed-amount CTA before #12 |
| `missing + available` | `무게 입력 필요`; no zero/estimate | `완성 중량 입력`, `원래 무게를 알 수 없음`, `무게 없이 종료` | g meal-log, guessed grams |
| `unrecoverable + available` | `원래 무게 확인 불가`; weight values remain null | `무게 없이 종료` | weight input, restore, marker reversal, g meal-log |
| legacy all-null authority | `이전 기록 · 중량 상태를 확인할 수 없음` | none; card copy is locally complete | treating as missing, unrecoverable, available, or depleted; detail endpoint/action |
| `depleted` | one exact reason label; known weights may show remaining 0g | read-only; exact current-closure cancel only when projection provides eligibility | weight/discard/adjust/close/consume controls; generic reopen |

### 6.3 Depleted reason labels

| `depleted_reason` | User label | Legacy eaten / XP meaning |
| --- | --- | --- |
| `consumed` | `다 먹음` | yes |
| `discarded` | `모두 버림` | no |
| `mixed` | `먹음·버림으로 소진` | no |
| `consumed_unweighed` | `무게 없이 다 먹음` | yes |
| `discarded_unweighed` | `무게 없이 모두 버림` | no |
| `mixed_unweighed` | `무게 없이 먹고 버림` | no |

Only the two consumed variants may look eaten. Discarded and mixed variants must not use eaten color, icon, copy, navigation, or celebration.

### 6.4 Screen and request states

| Scope/state | Visible response | Action behavior |
| --- | --- | --- |
| page `loading` | two stable section shells; each source reports its own progress | no stale/guessed buttons |
| legacy section `empty` | official `남은 요리가 없어요. 요리를 완료하면 여기에 저장돼요.`; ATE_LIST link remains | safe Planner return; no fabricated batch meaning |
| batch section `empty` | `중량·잔량 기록이 없어요` | no batch action; legacy section remains usable |
| either section read `error` | source-local non-private retry message | retry only that source; the other section remains visible |
| legacy `ready` | `/leftovers` recent order and exact legacy metadata | planner-add/eat/keep only; ATE_LIST remains separate route |
| batch first page `ready` | authoritative `cooked_at DESC, id DESC` cards | state-eligible #11 actions and `더 보기` only |
| batch next pending | existing cards + `더 불러오는 중` | one page request; all card/action state preserved |
| batch next error | loaded cards + alert + retry | same cursor retry; mutation 0 |
| batch cursor/filter 422 | loaded cards + `목록 조건이 바뀌었어요` | first-page refresh without cursor; no cursor repair/decoding |
| `permission` 401 | login guidance | return-to-action; private cards not rendered |
| private 404 | same nondisclosing missing message | safe back; no owner/state clue |
| batch `read-only` | batch-model legacy unknown or depleted truth | no mutation affordance except exact eligible current-closure cancel |
| mutation pending | values retained; progress/live status | duplicate submit, Escape, backdrop, and close locked |
| 409 stale/state/bounds | actionable alert; refreshed card truth | input retained if still safe; require fresh deliberate retry |
| 409 `WEIGHT_UNRECOVERABLE` | card refreshes to unrecoverable | all gram controls removed; no restore offered |
| 409 `BATCH_ADJUSTMENT_INVALID` | reason/delta retained | correct input; no optimistic result |
| 422 validation | field-linked message | focus alert then first invalid field |
| same-key replay | stored result rendered once | one sheet close/card update; no duplicate feedback/effect |
| same-key different payload | existing conflict alert | mutation 0; new deliberate action required |

The page is fully empty only when both independent sections are empty. Even then, the existing ATE_LIST route remains reachable if its product navigation normally exposes it; the page does not infer its contents from either empty response.

## 7. Action interaction notes

### Legacy action group

- `플래너에 추가` opens the existing `PlannerAddSheet` with its date/meal/serving controls and existing `POST /meals` body containing the exact legacy `leftover_dish_id`. It never receives a `batch_id`.
- `다먹음` and `계속 보관` use the exact legacy card `leftover_id`. ATE_LIST reads its own `/leftovers?status=eaten` response, and `덜먹음` uses the exact ID from that response.
- A legacy action pending/error is confined to its legacy card/sheet. It does not disable, remove, or update a visually similar batch card. Likewise, a batch success never optimistically changes a legacy card.
- Existing stale-review, PlannerAddSheet, `다먹음`, ATE_LIST, and `덜먹음` focus/error/return behavior stays protected by current tests. #11 adds no new legacy mutation or navigation.

### Shared bottom-sheet behavior

This behavior applies to the #11 cooked-batch action sheets and to the existing PlannerAddSheet where its current contract already matches. It does not silently convert legacy `다먹음` or `계속 보관` into new sheets.

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

### 9.1 Legacy leftover-management read model

`GET /leftovers?status=leftover` and the separate ATE_LIST `GET /leftovers?status=eaten`

| Legacy UI | Existing field/source |
| --- | --- |
| card identity | `items[].id` as `leftover_id` only |
| recipe/title/thumbnail | `recipe_id`, `recipe_title`, `recipe_thumbnail_url` |
| time/status | `cooked_at`, `eaten_at`, `status` |
| stale review | `stale_reviewed_at` |
| planner context | `source_meal_label`, `source_planned_servings`, `cooking_servings` |
| planner reuse | existing `POST /meals` with exact `leftover_dish_id` |
| done / undo / keep | existing `/leftovers/{leftover_id}/eat|uneat|keep` |

This read model is the only source for PlannerAddSheet, `다먹음`, ATE_LIST, `덜먹음`, stale banner, and `계속 보관`. None of its fields authorize a cooked-batch mutation or supply `expected_revision`.

### 9.2 Cooked-batch read model

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

The card itself completes the read-only legacy-null presentation with `recipe_title`, optional thumbnail, `cooked_at`, optional `cooking_servings`, and the explicit unknown labels derived only from null authority fields. There is no `[상세 확인]`, detail route, detail endpoint, hidden read, or mutation for that card.

Nutrition copy:

- `complete` → `영양 계산 가능`
- `partial` → `일부 영양 정보 없음`
- `unavailable` → `영양 정보 없음`
- legacy `null` → `영양 상태를 확인할 수 없음`

Pagination container and client rules:

- Consume only exact `{ items, next_cursor, has_next }`.
- `next_cursor` is opaque and filter-bound; the client neither interprets nor modifies it.
- Append only within the batch section in server-provided `cooked_at DESC, id DESC` order, suppressing an overlapping duplicate `batch.id` without joining either read model.
- Page state (`idle|pending|error`) is local UI state, not a new public status or response field.

### 9.3 Existing cooked-batch mutation bodies

| User action | Existing request |
| --- | --- |
| delayed weight | `PATCH /cooked-batches/{id}/weight` `{ action:"set_finished_weight", finished_weight_g, expected_revision }` |
| mark unknown forever | `PATCH /cooked-batches/{id}/weight` `{ action:"mark_unrecoverable", expected_revision }` |
| discard | `POST /cooked-batches/{id}/discard` `{ discarded_g, reason, expected_revision }` |
| adjust | `POST /cooked-batches/{id}/adjust` `{ delta_g, reason, expected_revision }` |
| unweighed close | `POST /cooked-batches/{id}/close-unweighed` `{ action:"close", closure_reason, expected_revision }` |
| exact cancel | same endpoint `{ action:"cancel_current", reverses_event_id, expected_revision }` |

Every success uses exact 3-key `{ action, batch, event_id }`. The wrapper remains `{ success, data, error }`; error remains `{ code, message, fields[] }`. No alias field, local status, new error name, or new mutation action is added.

No endpoint in this table receives a `leftover_id`. No legacy endpoint in §9.1 receives a `batch_id`, batch revision, or batch event ID.

## 10. Visual hierarchy and tokens

- Use current app palette and shape tokens: `--brand-primary`, `--brand-primary-soft`, `--surface`, `--surface-fill`, `--text-2/3`, `--line`, `--danger`, `--danger-border`, `--radius-control/card/sheet`, `--control-height-md/lg`.
- General card/section dividers use canonical `--line`; destructive confirmation borders use existing `--danger-border`. Do not add `--border`, a new global token, fallback hex, or ad-hoc color in this slice.
- Known remaining grams are the strongest card datum after the recipe title. Status labels are text plus shape/icon, not color alone.
- Unblocking `완성 중량 입력` is primary for missing state. Irreversible `원래 무게를 알 수 없음` is a separated danger secondary action.
- `버림` is destructive secondary; `양 조정` is neutral secondary. Neither visually competes with a future #12 consumed CTA.
- Depleted cards reduce action affordance and emphasize terminal reason. Consumed, discarded, and mixed use distinct text/icon treatment; discarded/mixed never use eaten celebration styling.
- The required existing stale-storage notice stays visually separate from batch weight status and cannot introduce a new depleted reason.

## 11. Accessibility contract

- `남은요리 관리` and `중량·잔량 기록` are real section headings in the accessibility tree. Card accessible names include their section context so same-title records remain distinguishable without exposing IDs.
- Card actions include recipe context: `김치찌개 버린 양 기록`, `김치찌개 남은 양 조정`, `닭볶음탕 완성 중량 입력`.
- Numeric inputs have 16px+ text, visible unit, explicit label, `inputMode=decimal`, and field-linked errors. Reason input has a programmatic label and visible requirement.
- Radio groups expose group labels and checked state. Irreversible confirmations are not prechecked.
- Updated batch status is announced politely; mutation failure uses a live alert. Status meaning is not conveyed by color alone.
- Batch-page append uses one polite announcement with the appended count. Focus behavior follows §4.6; cursor text and internal pagination state are never announced.
- Every interactive target is 44×44px minimum. At 320px, controls stack and text reflows without horizontal scrolling or content loss.
- Raw UUIDs, opaque cursor, revision integer, and event ID may be used internally. If revision is shown to satisfy auditability, it is labeled `기록 버전 N`, not exposed as an unlabeled developer value. Event IDs/cursors are never displayed or announced.

## 12. Evidence plan and limitations

Stage 4 must create fresh implementation evidence under `ui/designs/evidence/cooked-batch-weight-ui/` for 390px, 320px, and desktop. It must cover:

- both section headings in one viewport/scroll journey, with legacy and batch action groups visibly separated;
- legacy PlannerAddSheet, `다먹음`, ATE_LIST/`덜먹음`, stale-review/`계속 보관` preservation and exact legacy-ID routing;
- no title/date/recipe/ID join, cross-source dedupe, legacy action on a batch card, or weight action on a legacy card;
- known available with discard/adjust and no #12 consumed CTA;
- missing delayed-weight confirmation;
- unrecoverable irreversible confirmation and post-409 lock;
- unweighed close plus exact current cancel eligibility;
- batch-model legacy unknown/null as a complete read-only card with no `[상세 확인]`, distinct from every depleted reason;
- all six depleted labels and read-only affordance removal;
- independent section loading/empty/read error plus unauthorized/private nondisclosure, mutation pending, stale revision, 422, replay;
- `더 보기` idle/pending/error/retry/final-page and filter-bound cursor 422 refresh, stable append/dedupe, action-state preservation, focus, and announcement;
- sheet internal scroll, fixed CTA, safe area, 44px targets, 16px numeric input, keyboard avoidance, and no overflow.

`ui/designs/evidence/cooked-batch-weight-ui/manifest.json` must record implementation head SHA, capture time, viewport, state, and path. Fresh authority reports may cite only that post-implementation manifest and artifacts.

This Markdown and its ASCII wireframes do not prove runtime keyboard navigation, focus order/trap/restore, Escape behavior, virtual-keyboard occlusion, computed target size, screen-reader labels/live errors, contrast, or WCAG conformance. Static PNGs will prove only visible layout states. DOM/runtime tests plus Manual physical keyboard, real-device safe area, and VoiceOver/TalkBack checks remain separate. No runtime screenshot, full WCAG, or final authority claim is made in Stage 1.

## 13. Independent review handoff

- Fresh critic path: `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`
- Future runtime authority path: `ui/designs/authority/LEFTOVERS-authority.md`
- The design-generator author does not write either report and does not approve this design.
- Critic must check current tuple and exact evidence roles, #8 contract reuse, #9/#12 exclusions, required legacy feature preservation, two-source identity/action isolation, 390/320 two-section hierarchy, cursor pagination, all state and depleted distinctions, permission/replay, sheet behavior, keyboard/focus/accessibility, canonical tokens, and the no-runtime-claim boundary.
