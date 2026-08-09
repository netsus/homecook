# cooked-batch-weight-ui

## Goal

#8 `cooked-batch-weight-ledger`가 제공하는 기존 cooked-batch API를 그대로 소비해 `COOK_MODE`와 `LEFTOVERS`에서 음식-only 완성 중량, `나중에 입력`, local-only 용기 무게 보조, 지연 중량, unrecoverable, discard/adjust/unweighed close 상태를 정확하고 접근 가능하게 보여준다. 사용자는 현재 잔량과 요리 직후 원래 중량을 혼동하지 않고, irreversible/destructive action의 결과를 제출 전에 이해할 수 있어야 한다. 이 slice는 UI-only이며 새 backend/public contract를 만들지 않는다.

## Official Sources / Exact Lineage

- `docs/요구사항기준선-v1.7.30.md`
- `docs/화면정의서-v1.5.34.md`
- `docs/유저flow맵-v1.3.32.md`
- `docs/db설계-v1.3.32.md`
- `docs/api문서-v1.2.37.md`
- Stage 1 master base: `c16102a3072e929e45bb24a69464cd3110d03db5`
- Stage 1 master tree: `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a`
- approved cooking master plan SHA-256: `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

API v1.2.37은 #8 API v1.2.36의 `0-CBW` cooked-batch 계약을 보존한다. #11은 그 existing request/response/error shape만 소비한다. 신규 public contract가 필요해지면 구현하지 않고 Contract Evolution Candidate로 전환하며, 현재 승인된 candidate는 없다.

## In Scope

### COOK_MODE completion

- planner/standalone `snapshot_v2` completion의 exact pantry row 선택과 exact-one `set_finished_weight | weigh_later`를 보존한다.
- `finished_weight_g`는 용기·냄비·접시를 뺀 요리 직후 음식 전체 중량이며 현재 잔량이나 servings-to-grams 추정값이 아니다.
- 음식+용기 무게에서 빈 용기 무게를 빼는 local-only helper를 제공한다. 양수 결과만 기존 `finished_weight_g`로 복사하며 raw helper input은 저장·전송하지 않는다.
- `나중에 입력`은 grams를 추정하지 않고 `finished_weight_g=null`을 기존 completion request로 보낸다.
- loading/empty/pending/409/422/replay/unauthorized/private-404를 fail-closed로 표시하고 exact selection과 correctable input을 안전하게 보존한다.

### LEFTOVERS weight and lifecycle UI

- 기존 owner-only `GET /cooked-batches`의 exact `CookedBatchProjection`을 표시한다.
- `known`, `missing`, `unrecoverable`, `legacy-null`, `available`, `depleted`를 서로 다른 truth로 보여준다.
- 기존 delayed weight, mark-unrecoverable, discard, adjust, close-unweighed, exact current closure cancel mutation만 호출한다.
- `known+available`에는 #11 소유 `버림 | 양 조정`만 제공한다. #12가 별도 merge/activation되기 전 consumed-amount CTA를 렌더하지 않는다.
- depleted reason 여섯 종류를 구분하고 consumed 두 종류만 legacy eaten/XP 의미를 가진다.
- every depleted state는 read-only이며 generic reopen, unrecoverable restore/reversal, gram action을 제공하지 않는다.

## Schema Change

- [x] 없음 — #11은 UI/client consumer다.
- [ ] 있음

Migration, Route Handler, RPC, server helper, backend write transaction, protected-column DML, public type/field/status/error/action 확장은 #11 범위가 아니다.

## Dependencies

| Dependency / successor | Current state | #11 meaning |
| --- | --- | --- |
| #8 `cooked-batch-weight-ledger` Stage 2/3/4 | merged/green — PR #1311 head `2a2cd6fb81265ffa1f49e1c34ee68a26e1ddc49d`, merge `c16102a3072e929e45bb24a69464cd3110d03db5` | 기존 API/runtime을 Stage 4 UI가 소비할 수 있다. reader-before-writer cutover도 merged predecessor fact다. |
| `cook-mode-whole-board` | merged/green — PR #711 head `55b93ad7d29cfa8cba19e7942b18e6275fdc986a`, merge `2f8569cb56a53e9508d8d9571b94b260ec0bce73` | 기존 whole-board interaction을 보존한다. |
| #8 broader lifecycle | pending — Manual/server-Mac/OAuth, R/R+1/R+2 drain/rollback, capability activation | merged delivery와 분리한다. #11이 완료·활성화했다고 주장하거나 activation을 수행하지 않는다. |
| #9 `meal-log-core` | parallel backend owner; #11 비차단 | meal-log DB/API/write/events/pointers를 소유한다. #11은 해당 파일/계약을 수정하지 않는다. |
| #12 `meal-log-ui` | successor | consumed-amount add/edit/delete UI를 소유한다. #11이 선점하지 않는다. |
| #14 cross-slice release QA | successor | broader integration/release evidence를 소유한다. |

Shared projection integration은 병렬 편집하지 않고 순차 merge/rebase한다. #9와 #11이 같은 public type 또는 shared projection 파일을 동시에 바꾸지 않는다.

## Backend First Contract

### Stage ownership

- #11 Stage 2/3: **N/A — #8 existing backend contract consumer**.
- #11 implementation lane: **Stage 4 frontend only**.
- #8의 API v1.2.37/`0-CBW` wrapper, owner nondisclosure, idempotency, expected revision, row-lock/full replay가 authority다.

### Existing endpoints consumed by Stage 4

- `POST /cooking/session-attempts/{id}/complete`
- `GET /cooked-batches`
- `PATCH /cooked-batches/{id}/weight`
- `POST /cooked-batches/{id}/discard`
- `POST /cooked-batches/{id}/adjust`
- `POST /cooked-batches/{id}/close-unweighed`

All mutations keep UUID `Idempotency-Key` and the official `expected_revision` requirement. Success keeps `{ success, data, error }`; error keeps `{ code, message, fields[] }`. Same-key/same-payload replays the stored result once; same-key/different-payload, stale revision, invalid bounds/state and unrecoverable rules remain server-authoritative. #11 never authors cached remaining/status/reason.

## Frontend Delivery Mode

Design Status는 `temporary`다. Stage 4는 current design/critic findings가 repaired and independently re-reviewed된 뒤 existing #8 client/API adapters를 소비한다.

Required states:

- `loading`: stable skeleton/status, guessed row/action/grams 없음
- `empty`: COOK_MODE no-eligible-row는 explicit `[]`; LEFTOVERS empty는 safe Planner return only
- `error`: 401/private-404/409/422/read failure/replay conflict를 nondisclosing·actionable하게 표시
- `read-only`: completed/cancelled, `legacy-null`, every `depleted` state에서 mutation affordance 제거
- `unauthorized`: private data를 렌더하지 않고 login guidance + return-to-action 제공
- `ready/interactive`: known/missing/unrecoverable + available truth에 eligible #11 action만 제공
- `pending`: duplicate submit, Escape, backdrop/close를 잠그고 input과 opener context 보존

COOK_MODE에서 `legacy-null`/depleted projection이 실제 existing binding으로 도달 가능한지 여부와 LEFTOVERS legacy planner-add/pagination 결합은 design-generator 소유 repair다. #11 docs/automation author는 새 read나 route를 발명하지 않는다.

## State / Error Matrix

| Condition | UI response | Guarantee |
| --- | --- | --- |
| loading / pending | skeleton 또는 disabled bottom sheet | request 0 또는 one in-flight |
| empty | 명시적 empty copy와 safe return | guessed mutation 0 |
| unauthorized | login guidance + return-to-action | private projection 미표시 |
| other-owner/private 404 | nondisclosing error + safe back | mutation 0 |
| legacy-null | `이전 기록 · 중량 상태를 확인할 수 없음` | missing/0g/depleted로 추정 금지 |
| depleted | exact reason label, read-only | weight/discard/adjust/close/consume CTA 없음 |
| stale revision / 409 / 422 | input 유지, authority refresh, actionable error focus | optimistic terminal copy 없음 |
| `WEIGHT_UNRECOVERABLE` | gram control 제거, unrecoverable truth refresh | restore/reversal 없음 |
| stored replay | stored result 한 번 반영 | duplicate event/effect 없음 |

## Primary User Path

1. 사용자가 COOK_MODE에서 요리를 마치고 actual pantry row와 음식-only 원래 완성 중량 또는 `나중에 입력`을 선택한다.
2. 기존 #8 completion response가 authoritative cooked batch를 반환하고 UI는 replay를 포함해 결과를 한 번만 반영한다.
3. 사용자는 LEFTOVERS에서 known/missing/unrecoverable/legacy-null/depleted truth를 확인한다.
4. eligible state에서만 delayed weight, irreversible mark, discard/adjust 또는 unweighed close를 familiar bottom sheet로 확인·제출한다.
5. 오류·취소 후 input/focus가 복원되고, 성공 후 exact server projection으로 카드가 갱신된다. #12 consumed UI는 나타나지 않는다.

## Ownership / Parallel File Boundaries

| Surface | Owner / rule |
| --- | --- |
| `app/api/v1/meal-log/**`, meal-log schema/migration/RPC/write/events/pointers | #9 only; #11 금지 |
| `app/api/v1/cooked-batches/**`, cooked-batch server helpers/migration | #8 contract surface; #11 수정 금지 |
| `types/cooking.ts` `CookedBatchProjection` | #8 public contract; #9/#11 임의 확장 금지 |
| `lib/api/cooking.ts`, COOK_MODE completion UI | #11 existing-client consumer lane; #9 회피 |
| LEFTOVERS screen/client adapter | #11 UI lane; public contract 확장 금지 |
| consumed-amount CTA / meal-log sheet | #12 only; #11 선점 금지 |
| shared projection/style files | 순차 integration; 병렬 same-file edit 금지 |

## QA / Test Data Plan

### Deterministic fixture baseline

- COOK_MODE: actual product/generic pantry rows, explicit empty `[]`, known/weigh-later/container helper, pending, 409/422, same-key replay.
- LEFTOVERS: known/missing/unrecoverable/legacy-null, six depleted reasons, partial/unavailable nutrition, unauthorized/private-404, stale revision, replay.
- 390px/320px: familiar bottom sheet, internal scroll, fixed CTA, safe area, 44px target, 16px numeric input, no page/sheet horizontal overflow.

### Real DB / seed / cleanup

- Schema creation, migration apply and backend write smoke are #8/#9 evidence이며 #11 Stage 2/3에는 N/A다.
- Stage 4 real read smoke는 already-merged #8 seed/runtime을 read-only로 소비하고, #11이 DB row를 직접 만들거나 고치지 않는다.
- UI fixture reset은 test-owned local state만 정리한다. server/production/server-Mac mutation과 capability activation은 금지한다.
- #8 exact projection 또는 required seed가 없으면 UI가 guessed fallback으로 진행하지 않고 blocker로 중단한다.

### Current Stage 1 commands

- SOT/workflow/workpack/automation/bookkeeping validators
- focused Stage 1/workflow Vitest
- lint, typecheck, dependency audit, `git diff --check`

### Future Stage 4 commands

- component/history Vitest, Playwright 390px/320px/desktop, a11y/visual, exploratory QA/eval, `verify:frontend`
- runtime focus, virtual keyboard, overflow and automated WCAG evidence

## Design / Accessibility Authority

- UI risk: `high-risk`; required screens are `COOK_MODE`, `LEFTOVERS`; neither is an official anchor screen.
- Canonical Stage 1 design paths:
  - `ui/designs/COOK_MODE.md`
  - `ui/designs/LEFTOVERS.md`
- Canonical current critic report paths:
  - `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
  - `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`
- `automation-spec.json`의 supported `frontend.artifact_assertions` index가 위 two designs + two exact critics를 모두 기계적으로 잠근다. 한 화면, 단일 critic 또는 legacy generic critic path만 남으면 Stage 1 regression이 실패한다.
- critic artifact-lock findings `P1-CM-02`와 `P1-LO-02`는 이 docs/automation/test repair가 닫는다. Critic의 design-content findings는 병렬 design-generator 소유이며 새 exact head/tree의 fresh independent critic 전까지 HOLD다.
- Future authority reports: `ui/designs/authority/COOK_MODE-authority.md`, `ui/designs/authority/LEFTOVERS-authority.md`.
- Stage 4는 390px/320px/desktop에서 familiar bottom sheet, 44px target, 16px numeric input, sheet internal scroll/fixed CTA/safe-area, focus trap/focus restore/Escape, virtual keyboard, overflow, screen reader label/live error, serious/critical automated accessibility 0을 runtime evidence로 남긴다.
- Static Markdown/PNG는 runtime focus, virtual keyboard, VoiceOver/TalkBack, full WCAG 또는 physical device를 증명하지 않는다. 그 evidence는 Stage 4/manual pending이다.

## Out of Scope

- 신규 endpoint/field/status/error/event/action/mutation/public contract/direct DML.
- migration, Route Handler, RPC, server helper, backend write transaction.
- #9 meal-log DB/API/write/events/pointers 또는 #12 consumed-amount UI.
- servings-to-grams, current remainder→original total, zero nutrition, tare persistence.
- generic reopen, unrecoverable restore/reversal, adjustment depletion, discard XP/meal entry.
- server-Mac/OAuth, R/R+1/R+2, rollback rehearsal, capability activation.
- design-generator-owned design content repair와 critic/authority/final approval.

## Lifecycle / Stage Boundary

- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- #11 Stage 2/3: N/A
- next product implementation lane: Stage 4, but only after fresh independent internal 1.5 and design re-review resolve required findings.

Stage 1 repair는 lifecycle을 docs/complete/merged로 올리지 않는다. #8 Stage 2/3/4 merged/green fact와 broader Manual/server-Mac/OAuth/R/R+1/R+2/activation pending을 계속 분리한다.

## Delivery Checklist

- [ ] COOK_MODE가 existing #8 completion contract와 five UI states를 정확히 소비한다. <!-- omo:id=delivery-batch-weight-ui-cook-mode;stage=4;scope=frontend;review=5,6 -->
- [ ] LEFTOVERS가 known/missing/unrecoverable/legacy-null/depleted truth와 eligible #11 action만 표시한다. <!-- omo:id=delivery-batch-weight-ui-leftovers;stage=4;scope=frontend;review=5,6 -->
- [ ] #9 backend와 #12 consumed UI ownership을 선점하지 않고 new public contract가 없다. <!-- omo:id=delivery-batch-weight-ui-ownership;stage=4;scope=shared;review=5,6 -->
- [ ] two designs + two exact current critic paths가 regression으로 유지된다. <!-- omo:id=delivery-batch-weight-ui-artifact-index;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px/desktop runtime visual·focus·overflow·a11y evidence와 authority reports가 준비된다. <!-- omo:id=delivery-batch-weight-ui-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh independent internal 1.5/design/Stage 5/6/final authority에서 unresolved required finding이 0이다. <!-- omo:id=delivery-batch-weight-ui-independent-review;stage=4;scope=shared;review=5,6 -->

## Manual Only

- [ ] physical keyboard의 focus order/trap/restore/Escape를 실제 browser에서 확인한다.
- [ ] VoiceOver/TalkBack 또는 동등 screen reader의 label/status/live error 발화를 확인한다.
- [ ] 실제 390px/320px device safe-area와 virtual keyboard occlusion을 확인한다.
- [ ] server-Mac/OAuth evidence는 broader lifecycle owner가 별도로 확인한다.
- [ ] R/R+1/R+2와 capability activation은 계속 pending이며 #11이 수행하지 않는다.
