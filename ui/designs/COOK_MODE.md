# COOK_MODE — #11 cooked-batch weight UI refresh

> Stage: Homecook #11 `cooked-batch-weight-ui` fresh Stage 1 design-generator
> Lineage: HOLD report `337daa808971802c79698df64c70240205addba4` → parent/current base `c16102a3072e929e45bb24a69464cd3110d03db5`
> Current official tuple: 요구사항 `v1.7.30` / 화면정의서 `v1.5.34` / 유저 Flow `v1.3.32` / DB `v1.3.32` / API `v1.2.37`
> Contract lineage: API `v1.2.37` preserves #8 API `v1.2.36` section `0-CBW`.
> Classification: `prototype-derived design`, high-risk UI change, not an anchor screen
> Design status: `temporary` — fresh independent critic, runtime evidence, final authority pending

## 1. Purpose and ownership

The existing #8 COOK_MODE whole-board and cooked-batch completion sheet remain the interaction baseline. #11 adds only the final weight presentation and local container helper without changing the approved completion transaction.

- Keep the #8 whole-board, exact pantry-row selection, and exact-one `set_finished_weight | weigh_later` flow.
- Explain that weight means the original food-only total immediately after cooking, not the current remainder and not food plus pot/container/plate.
- Add a local-only helper that calculates `food + container - container tare`; only the positive result can populate `finished_weight_g`.
- Reuse the merged #8 GET/PATCH/POST contract and existing completion mutation. Do not add an API, DB field, status, error code, mutation action, or direct DML.
- #9 owns meal-log backend writes and links. #12 owns consumed-amount CTA and meal-log UI. Neither is rendered or implied here.
- COOK_MODE never adds serving adjustment. The pinned cooking servings remain read-only.

### Existing #8 reference boundary

The merged #8 implementation and its approved authority/Stage 6 evidence are a functional and interaction reference:

- `components/cooking/cooked-batch-completion-sheet.tsx`
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage4-frontend-implementation.md`
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-final-product-design-authority-post-typography-rereview.md`
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage6-frontend-successor-head-rereview.md`

Those artifacts approve #8 at its exact reviewed heads. They are not fresh #11 evidence and do not approve this design.

Historical #8 design-lock compatibility remains explicit: its source named API `v1.2.35` and the `Loading` / `Empty` / `Error` / `creation-off` drain states. #11 now follows current API `v1.2.37`, while preserving those behaviors, exact `pantry_item_id`, visible 제품명·브랜드 context, and the rule that the client `자동 선택하지 않는다`.

## 2. Mobile information architecture

```text
COOK_MODE whole-board
  ├─ pinned title + cooking servings (read-only)
  ├─ all ingredients
  ├─ all cooking steps
  └─ fixed action bar: cancel / cooking complete
        └─ familiar bottom sheet
             ├─ title + short guidance
             ├─ internally scrollable body
             │    ├─ exact pantry rows
             │    └─ food-only weight action
             │         ├─ direct grams
             │         ├─ local container helper
             │         └─ weigh later
             └─ fixed footer + safe area: back / save
```

- The page must not scroll horizontally. A long recipe scrolls only in the whole-board content region.
- Opening the sheet locks background/body scroll. The sheet body owns vertical scroll; its footer stays visible above `env(safe-area-inset-bottom)`.
- Default mobile width is 390px; 320px is the narrow sentinel. Sheet labels stack at 320px rather than shrinking targets or input text.
- All controls have a minimum 44×44px target. Numeric inputs use at least 16px text so mobile browsers do not zoom the page.
- Virtual-keyboard resize must keep the active numeric input, its error, and the fixed CTA reachable through sheet-internal scrolling.

## 3. 390px wireframes

### 3.1 Whole-board and entry

```text
┌──────────────────────────────────────┐ 390
│ 김치찌개                       4인분 │ read-only
│ 오늘 저녁 · 요리 중                 │
├──────────────────────────────────────┤
│ 재료                                 │
│ 돼지고기 300g · 김치 400g · …        │
│                                      │
│ 조리순서                             │ internal vertical scroll
│ 1  볶기   돼지고기와 김치를 볶아요   │
│ 2  끓이기 물을 넣고 끓여요           │
│ 3  마무리 간을 맞춰요                │
├──────────────────────────────────────┤
│ [취소]                  [요리 완료]  │ fixed + safe area
└──────────────────────────────────────┘
```

### 3.2 Completion sheet — ready / direct weight

```text
┌──────────────────────────────────────┐
│ ───                                  │ drag handle
│ 요리 완료                        [×] │
│ 실제 사용한 팬트리 항목과            │
│ 완성된 음식 전체 무게를 확인해요     │
├──────────────────────────────────────┤ internal scroll starts
│ 같은 원재료라도 실제 제품은 달라요   │
│                                      │
│ 사용한 팬트리 항목             1개   │
│ 김치                                 │
│ ☑ 종가집 맛김치                      │ exact pantry row
│   대상 · 제품 팬트리 항목 1           │ raw UUID hidden
│ ☐ 일반 김치                          │
│   일반 재료 · 팬트리 항목 1           │
│                                      │
│ 완성 직후 음식 전체 중량             │
│ ● 음식만 무게(g)          [1480]     │ 16px+ numeric
│   [용기 무게 계산 도움]               │ local only
│ ○ 나중에 입력                        │
│ 용기·그릇을 뺀 음식만의 원래 무게예요│
│ 현재 남은 양을 입력하지 마세요       │
├──────────────────────────────────────┤
│ [돌아가기]              [완료 저장]  │ fixed + safe area
└──────────────────────────────────────┘
```

### 3.3 Local container helper, expanded

```text
│ 용기 무게 계산 도움              [접기]│
│ 이 계산은 이 기기 화면에서만 써요     │
│ 음식+용기 무게(g)           [1800]    │
│ 빈 용기 무게(g)              [ 320]    │
│ ──────────────────────────────────── │
│ 음식만 무게                   1480g   │ live preview
│ [이 무게 사용]                         │
```

- Helper values never leave local component state and are cleared when the sheet closes/unmounts.
- Result is valid only when both inputs are finite and positive and `food+container > tare`; otherwise `[이 무게 사용]` is disabled and an inline, live error explains what to fix.
- `[이 무게 사용]` selects `음식만 무게(g)` and copies only the calculated positive result into the existing `finished_weight_g` input. It does not submit.
- Direct edits to `finished_weight_g` do not silently rewrite the two helper inputs.

## 4. 320px narrow wireframes

```text
┌──────────────────────────────┐ 320
│ 요리 완료                [×] │
│ 실제 사용 항목과 음식만의    │
│ 원래 무게를 확인해요         │
├──────────────────────────────┤ sheet body scrolls
│ 사용한 팬트리 항목       1개 │
│ ☑ 종가집 맛김치              │
│   대상 · 제품 항목 1          │
│                              │
│ 완성 직후 음식 전체 중량     │
│ ● 음식만 무게(g)             │ stack, do not compress
│   [              ] g         │ 16px+, full row
│ [용기 무게 계산 도움]         │
│ ○ 나중에 입력                │
│                              │
│ expanded helper              │
│ 음식+용기(g) [          ]    │
│ 빈 용기(g)   [          ]    │
│ 음식만 무게  1480g           │
│ [이 무게 사용]               │
├──────────────────────────────┤
│ [완료 저장]                  │ primary first in DOM/visual order
│ [돌아가기]                   │ stacked 48px secondary
│ safe area                    │
└──────────────────────────────┘
```

- At 320px, the footer stacks with primary submit before secondary cancel/close in both DOM and visual order. A shared overlay implementation must support this scoped order without shrinking or reordering only through CSS.
- Labels wrap; controls never shrink below 44px. There is no horizontal scroll or clipped unit suffix.

## 5. State matrix

| State | Visible UI | Enabled actions | Fail-closed rule |
| --- | --- | --- | --- |
| `loading` | whole-board or sheet skeleton; `불러오는 중` status | close/back only when safe | no row, action, or grams guessed |
| `empty` pantry candidates | `사용할 팬트리 항목이 없어요`; selection stays `[]` | weight choice; save after valid explicit choice | no equivalent/first/recent row auto-selection |
| `ready` known | exact rows + food-only grams/container helper | save after valid explicit weight action | completion request is existing #8 body only |
| `ready` weigh later | `나중에 입력`; grams/helper visually subordinate or collapsed | save | submits `finished_weight_g=null`; no estimate/nutrition evidence |
| `pending` | progress status, retained values | none; Escape/close disabled | one request in flight; duplicate tap/Enter blocked |
| `error` 409/422 | server message + linked `fields[]`; retained selection/input | correct and retry, back | sheet stays open; focus moves to actionable error |
| `permission` 401 | login guidance without private rows | login / safe back | return-to-action reloads latest server state |
| private 404 | nondisclosing safe error | safe back | batch/session existence and owner hidden |
| stored replay | authoritative first success shown once | safe continuation only | sheet closes once; no duplicate toast/animation/effect |
| completed/cancelled read-only | terminal session summary | return only | no new completion controls |
| unknown / legacy-null projection | `이전 기록 · 중량 상태를 확인할 수 없음` | return only | do not infer missing, 0g, or depleted |
| depleted projection | reason-specific terminal label | return only | distinct from unknown; no weight/helper/mutation controls |

`unknown / legacy-null` is not `missing`: legacy null means the new state cannot be proven. `missing` is an explicit v2 weight state. A depleted projection is terminal and must never fall back to the completion form.

## 6. Interaction notes

### Open, close, and focus

1. `[요리 완료]` stores the opener and opens the bottom sheet.
2. Initial focus moves to the sheet title; background becomes inert and unavailable to pointer/assistive technology.
3. Tab order follows title → pantry rows → direct-weight radio/input → helper disclosure/inputs/use → weigh-later radio → submit → cancel/close.
4. Tab and Shift+Tab are trapped inside the sheet. Escape, `[×]`, and `[돌아가기]` close only while not pending.
5. Closing restores focus to the original `[요리 완료]` control. A 409/422 moves focus to `role=alert`; correction then proceeds to the linked input.
6. Pending blocks dismiss to avoid ambiguous completion. Success restores focus to the next meaningful terminal control after the sheet closes.

### Selection and validation

- Every pantry checkbox maps to exactly one `pantry_item_id`; raw IDs are neither visible nor announced.
- Initial pantry selection and weight action are empty. Explicit `[]` is valid.
- Direct weight accepts a positive finite number only. The UI must not convert servings to grams or current remainder to original total.
- Helper calculation is a convenience preview, not server authority. The server response remains the displayed batch truth.
- Changing the canonical payload after a failed attempt creates a new deliberate idempotency operation. Retrying the same canonical payload reuses the same UUID key.

### Permission, idempotency, and replay

- Unauthorized flows do not render private row data. Login returns to the same session URL, then reloads current authority.
- Same key + same payload consumes the stored first result and closes exactly once.
- Same key + different payload displays the existing `409 IDEMPOTENCY_KEY_REUSED`; it never projects completion.
- A stale/revision/state conflict retains correctable local input but refreshes authoritative server state before retry.

## 7. Data and API binding

| UI datum/action | Existing contract binding | UI rule |
| --- | --- | --- |
| pinned recipe / servings / rows | existing snapshot-v2 cook-mode read | immutable/read-only; no mutable recipe reread |
| pantry checkbox | `consumed_pantry_item_ids[]` | exact row IDs, candidate order, explicit `[]` allowed |
| direct grams | `weight_action=set_finished_weight`, positive `finished_weight_g` | original food-only total only |
| weigh later | `weight_action=weigh_later`, `finished_weight_g=null` | no estimate or meal evidence |
| container inputs | local component state only | never persisted, logged, or added to request |
| submit | existing `POST /cooking/session-attempts/{id}/complete` + UUID `Idempotency-Key` | #8 transaction/replay remains authority |
| success | exact 8-key data with `cooked_batch: CookedBatchProjection` | render response truth, never client-computed batch status |
| errors | existing wrapper `{ success, data, error }`; `{ code, message, fields[] }` | no new public code/copy contract invented |

The #8 batch mutation endpoints may be used by the LEFTOVERS surface only. COOK_MODE completion does not call `PATCH /cooked-batches/{id}/weight`, discard, adjust, close, or meal-log endpoints.

## 8. Visual and token rules

- Preserve the approved dark whole-board. The white/surface bottom sheet uses current app tokens, not new hex values.
- Use `--brand-primary`, `--brand-primary-hover`, `--brand-primary-soft`, `--surface`, `--surface-fill`, `--text-2/3`, `--radius-control/card/sheet`, and `--control-height-md/lg`.
- Primary completion uses the strongest brand treatment. Back/cancel is neutral; error uses existing danger tokens and text/icon, never color alone.
- The helper is a low-emphasis inset panel below direct weight, not a competing primary section.
- Reduced-motion preference removes nonessential sheet/feedback motion without changing state timing.

## 9. Accessibility contract

- Exact labels: `완성 직후 음식 전체 중량`, `음식과 용기를 합친 무게`, `빈 용기 무게`, `계산한 음식만 무게 사용`, and row-specific checkbox names.
- Weight result and helper validation use a polite live region; submit/pending status uses `role=status`; server failure uses `role=alert` and linked descriptions.
- Selection, invalid, pending, disabled, and terminal states are expressed programmatically and in text, not only by color.
- Screen-reader reading order is product name → brand/context → selection state. UUID, cursor, event ID, and internal operation data are not announced.
- Target size is 44×44px minimum; numeric font is 16px minimum; text reflows at 320px without loss.

## 10. Evidence plan and limitations

Stage 4 must create fresh runtime evidence under `ui/designs/evidence/cooked-batch-weight-ui/` for 390px, 320px, and desktop, covering known, weigh-later, container helper, pending, error, and replay. The manifest must record the implementation head and capture times before independent authority reports cite it.

Required runtime checks include:

- sheet/body scroll lock, internal scroll, fixed footer and safe-area geometry;
- 44px hit boxes, 16px numeric input, no page/sheet horizontal overflow;
- title initial focus, Tab/Shift+Tab trap, Escape/close, pending lock, error focus, and opener restoration;
- virtual-keyboard avoidance with the active input, error, and CTA reachable;
- accessible names/descriptions, live status/error, reduced motion, and serious/critical automated accessibility findings zero;
- same-payload replay single close and different-payload conflict with no duplicate effect.

This Markdown and its ASCII wireframes do not prove runtime keyboard behavior, focus order/trap/restore, virtual-keyboard occlusion, computed 44px geometry, screen-reader announcements, contrast, or WCAG conformance. Static PNGs in Stage 4 will prove only visible pixels; DOM/runtime tests plus Manual physical keyboard, real device, and VoiceOver/TalkBack evidence remain separate. No runtime screenshot or final authority claim is made in Stage 1.

## 11. Independent review handoff

- Fresh critic path: `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
- Future runtime authority path: `ui/designs/authority/COOK_MODE-authority.md`
- The design-generator author does not write either report and does not approve this design.
- Critic must check #11 scope, current tuple/base, 390/320 stacking, helper locality, all states, permission/replay, keyboard/focus/accessibility, and #9/#12 exclusions.
