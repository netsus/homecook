# cooked-batch-weight-ui

## Goal

#8 `cooked-batch-weight-ledger`의 단일 mutation 계약을 그대로 소비해 `COOK_MODE`와 `LEFTOVERS`의 중량·잔량 UI를 완성한다. 음식-only 완성 중량, `나중에 입력`, local-only 용기 무게 보조, 지연 중량 등록, irreversible unrecoverable 전환, weighted/unweighed 소진 사유를 사용자가 혼동하지 않도록 표시한다. 이 slice는 새 API, DB field, batch mutation 또는 범용 reopen을 만들지 않는다.

## Official Sources

- `docs/요구사항기준선-v1.7.22.md`
- `docs/화면정의서-v1.5.28.md`
- `docs/유저flow맵-v1.3.25.md`
- `docs/db설계-v1.3.23.md`
- `docs/api문서-v1.2.27.md`
- approved plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Scope

### COOK_MODE completion

- preserve planner and standalone `snapshot_v2` completion behavior supplied by #8: exact pantry row selection plus exact-one `set_finished_weight | weigh_later`.
- explain that `finished_weight_g` is the food immediately after cooking, excluding pot/container/plate weight. Never ask for the current remainder as a substitute.
- provide a local-only container helper: measured food+container minus container tare previews the positive food-only grams. Only the resulting `finished_weight_g` enters the existing completion request; helper inputs are not persisted or added to the API.
- `나중에 입력` stores no grams and creates `weight_status=missing`; it does not guess servings-to-grams or create nutrition/meal-log evidence.
- loading, no eligible pantry row, submit pending, 409/422 and stored replay remain fail-closed. Error retry preserves exact pantry row selection and weight action; replay closes once without duplicating effects.
- creation rollback closes new v2 start only. Existing owner v2 read/cancel/complete remains usable.

### LEFTOVERS delayed weight

- consume the #8 `GET /cooked-batches` read model and show content/name, cooked time, cooking servings, finished/remaining g, `weight_status`, `batch_status`, `depleted_reason`, revision and nutrition availability.
- `missing+available` exposes `완성 중량 입력` and `원래 무게를 알 수 없음`.
- before delayed `set_finished_weight`, confirm that the value is the original food-only total and that the user has not eaten or discarded any of the batch. The server remains authority for event-count and revision eligibility.
- before `mark_unrecoverable`, explain that the transition is irreversible. After success or `409 WEIGHT_UNRECOVERABLE`, hide/disable gram input and gram meal-log actions; never offer known restore or marker reversal.
- `unrecoverable+available` displays `원래 무게 확인 불가` and only the eligible unweighed terminal path.

### Quantity and lifecycle actions

- `known+available` shows remaining grams and exposes only #11-owned `버림 | 조정`. #12 owns and later adds the meal-log consumed-amount CTA; it is absent until #12 is separately merged and enabled.
- discard requires grams, reason and current revision. It never creates a meal-log entry or XP.
- adjustment requires signed gram delta, reason and current revision, and explains that it cannot reach 0, exceed finished weight or reopen a depleted batch.
- discard and negative adjustment show a confirmation summary with amount/reason/result, explicit cancel, safe initial focus and focus restoration to the invoking CTA. Pending blocks duplicate submit; 409/422 moves focus to an actionable error while retaining correctable input.
- `missing|unrecoverable + available` close requires explicit `consumed|discarded|mixed` reason and a confirmation that no grams or meal nutrition will be recorded. Cancellation must be available before submit.
- current active `closed_unweighed` may expose the exact `cancel_current` reversal when the API says it is eligible. No generic `배치 다시 열기` action exists, and `marked_unrecoverable` is never a cancel target.
- discard/adjust/close actions remain hidden until #8 Train D reader-before-writer cutover is green.
- empty LEFTOVERS explains that no saved batch exists and offers only a safe return to Planner. Every depleted state is read-only: all weight, discard, adjust, close and consumed-entry affordances are absent.

### Display truth

| State | Required copy/action |
| --- | --- |
| `known+available` | finished/remaining g; #11 renders discard/adjust only, and #12 may later add consumed amount |
| `missing+available` | `무게 입력 필요`; delayed whole-food weight or irreversible unknown action |
| `unrecoverable+available` | `원래 무게 확인 불가`; no gram input/logging |
| `depleted+consumed` | `다 먹음` |
| `depleted+discarded` | `모두 버림` |
| `depleted+mixed` | `먹음·버림으로 소진` |
| `depleted+consumed_unweighed` | `무게 없이 다 먹음` |
| `depleted+discarded_unweighed` | `무게 없이 모두 버림` |
| `depleted+mixed_unweighed` | `무게 없이 먹고 버림` |

- only consumed variants participate in legacy eaten/automatic hiding/XP. Discarded or mixed variants must not look eaten or award XP.
- `partial/unavailable` nutrition remains explicit. Missing/unrecoverable never shows zero nutrition or a gram-based estimate.

## State / Error Matrix

| Condition | UI response | Mutation guarantee |
| --- | --- | --- |
| loading / pending | skeleton or disabled sheet; no guessed default | request 0 or one in-flight |
| unauthenticated | login guidance + return-to-action | private batch data not rendered |
| other owner / private 404 | nondisclosing error and safe back | mutation 0 |
| stale revision | keep input, refresh read model, focus conflict message | event/projection unchanged |
| invalid delayed weight or prior event | explain original-total eligibility | mutation 0 |
| `WEIGHT_UNRECOVERABLE` | lock gram controls and refresh truth | no restore/reversal |
| `BATCH_ADJUSTMENT_INVALID` | preserve reason/delta for correction | projection unchanged |
| invalid discard/close/cancel | preserve safe inputs; no optimistic terminal copy | event/projection unchanged |
| same key replay | render stored result once | no duplicate event/effect |
| same key different payload | conflict; require a new deliberate action | mutation 0 |

## Interaction Wireframes

### COOK_MODE completion

```text
요리 완료
사용한 팬트리 재료
☐ 실제 제품명 · 브랜드 · 보관 위치

완성 직후 음식 전체 중량
○ 음식만 무게(g)  [ 1480 ]
  [용기 무게 계산 도움]
  음식+용기 [1800] - 용기 [320] = 음식 1480g
○ 나중에 입력
용기/그릇 무게는 제외해 주세요

[취소]                         [요리 완료]
```

### LEFTOVERS actions

```text
남은요리
카레 · 어제 요리
상태: 무게 입력 필요

[완성 중량 입력]              primary unblock
[원래 무게를 알 수 없음]      irreversible destructive

known:
완성 1480g · 남은 820g
[버림] [조정]
 destructive secondary

#12 merged separately:
- consumed-amount CTA may be added by #12 only; it is not rendered by #11

unweighed close:
무게가 없어 식사 영양에는 반영되지 않아요
○ 다 먹음  ○ 모두 버림  ○ 먹고 버림
[취소]                         [이 상태로 종료]
```

## API / Security Contract

- reuse only `POST /cooking/session-attempts/{id}/complete`, `GET /cooked-batches`, `PATCH /cooked-batches/{id}/weight`, `POST /cooked-batches/{id}/discard`, `POST /cooked-batches/{id}/adjust` and `POST /cooked-batches/{id}/close-unweighed`.
- all mutations send UUID `Idempotency-Key` and current `expected_revision` where the official contract requires it.
- server row-lock RPC and full replay remain authority. Client previews never author cached remaining/status/reason.
- responses retain `{ success, data, error }`; errors retain `{ code, message, fields[] }`.
- owner-only reads/actions and other-owner nondisclosure are unchanged. No direct protected-column DML is introduced.

## Dependencies / Successors

- implementation waits until #8 `cooked-batch-weight-ledger` runtime and `cook-mode-whole-board` are both merged and green. Stage 1 docs may proceed now; current roadmap state does not satisfy the runtime gate.
- #9 owns meal-log backend event links; #12 owns MEAL_LOG add/edit/delete and cooked-batch consumption sheet.
- #14 owns final cross-slice release QA and Train D/E integration evidence.

## Out of Scope

- new batch endpoint, field, status, event type, mutation, nutrition pointer or direct DML.
- meal-log day view, entry mutation, recent/frequent picker or consumed-event reversal UI (#12).
- servings-to-grams estimation, mutable-current nutrition recalculation or container/tare persistence.
- generic reopen, unrecoverable restore/reversal, adjustment depletion, discard XP or automatic meal entry.

## Design / Accessibility Authority

- UI risk: high-risk changes to required screens `COOK_MODE` and `LEFTOVERS`; neither is an official anchor screen.
- before Stage 2, refresh `ui/designs/COOK_MODE.md` and `ui/designs/LEFTOVERS.md` against this contract, then obtain independent critiques at `ui/designs/critiques/COOK_MODE-critique.md` and `ui/designs/critiques/LEFTOVERS-critique.md`.
- legacy design, critique, screenshot or authority artifacts are not #11 evidence unless explicitly refreshed against this contract.
- Stage 4 requires 390px, 320px and desktop evidence for completion known/later/container helper/pending/error/replay and LEFTOVERS known/missing/unrecoverable/close/depleted/error states.
- `ui/designs/evidence/cooked-batch-weight-ui/manifest.json` records implementation head SHA, each capture timestamp and evidence path. Both authority reports must be authored after and cite that fresh manifest; stale or prior-slice evidence fails closed.
- authority reports: `ui/designs/authority/COOK_MODE-authority.md` and `ui/designs/authority/LEFTOVERS-authority.md`, each refreshed after new runtime evidence.
- maintain 44px targets, clear destructive/irreversible hierarchy, keyboard/dialog focus trap and restoration, screen-reader state announcements, error focus, reduced motion and no horizontal/page overflow.
- at 320px keep primary action before secondary/destructive in DOM and visual order; stack rather than compress labels or touch targets.

## Design Status

`temporary`. Stage 1 locks information, state, action and evidence structure only. Refreshed canonical designs, independent critics and product-design-authority approvals remain required.

## Stage 1 Current Gate

- run SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc tests, lint, typecheck, dependency audit and diff/parity only.
- component/E2E/visual/a11y/browser/remote/design-authority commands are future Stage 4/6 evidence and are not claimed executable now.

## Delivery Checklist

- [x] Stage 1 exact-six docs authored
- [ ] internal1.5/security/five-axis/design reviews approved with zero findings
- [ ] every check started for the current head SHA is terminal green or an intended skip
- [ ] post-merge master QA/Policy/Security/Vercel checks green
- [ ] Stage 2 TDD RED before implementation
- [ ] 390/320/desktop authority evidence and both reports approved
