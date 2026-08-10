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
- 모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거한다. 단, `current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에서만 secondary `[방금 종료 취소]`를 허용한다. generic reopen, non-current closure cancel, unrecoverable reversal은 금지한다.

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
| #9 `meal-log-core` | merged — PR #1319 head `be93bfc47281e2795c59c0fd1052a4ecf6085837`, merge `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` | meal-log DB/API/write/events/pointers를 소유한다. #11은 normal two-parent merge로 shared projection을 순차 통합했으며 해당 계약 의미를 수정하지 않는다. |
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

Design Status는 `confirmed`다. Draft PR [#1323](https://github.com/netsus/homecook/pull/1323)의 제품 repair `a381f23237c001b232172317a948770d0efa364b` → fresh evidence `531055aca7038041411293b8a7e10a9cd27c2e8c` → Stage 5 publication `a17b0961f9aca4fc6ec740d62f81022fded962fc` → final authority publication `6cbfaf053b63d119f91225ce5fec500a229a7ad1` 계보가 현재 근거다. Fresh Stage 5 task `019feb85-1b83-7662-9c10-ab91d834c4f6`와 final authority task `019feb94-4d4f-7831-9000-01eaaf3a7569`는 각각 `APPROVE 0/0/0`이다. Stage 6 task `019feba0-7a3b-7851-bcf0-4ea106cc7c3c`는 제품 결함이 아니라 PR 본문/closeout 투영 drift 2건으로 `HOLD 0/2/0`을 냈고, repair author task `019febac-5498-73e0-bacf-b6948ff9c3a0`가 `CBW-S6-P1-01/02`만 수리했다. 이 수리는 Stage 6 승인이 아니며 fresh independent Stage 6 rereview가 pending이다.

Required states:

- `loading`: stable skeleton/status, guessed row/action/grams 없음
- `empty`: COOK_MODE no-eligible-row는 explicit `[]`; LEFTOVERS empty는 safe Planner return only
- `error`: 401/private-404/409/422/read failure/replay conflict를 nondisclosing·actionable하게 표시
- `read-only`: completed/cancelled와 `legacy-null`은 mutation affordance를 제거한다. 모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거한다. 단, `current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에서만 secondary `[방금 종료 취소]`를 허용한다. generic reopen, non-current closure cancel, unrecoverable reversal은 금지한다.
- `unauthorized`: private data를 렌더하지 않고 login guidance + return-to-action 제공
- `ready/interactive`: known/missing/unrecoverable + available truth에 eligible #11 action만 제공
- `pending`: duplicate submit, Escape, backdrop/close를 잠그고 input과 opener context 보존

COOK_MODE의 `legacy-null`/depleted는 LEFTOVERS read-model only이므로 N/A이며, LEFTOVERS의 legacy/v2 two-section과 cursor pagination 보수는 완료됐다. Fresh Stage 5와 final authority는 위 exact lineage에서 승인됐고, closeout repair publication head에 대한 fresh Stage 6 rereview만 남아 있다. #11 closeout repair author는 새 read나 route를 발명하지 않는다.

## State / Error Matrix

| Condition | UI response | Guarantee |
| --- | --- | --- |
| loading / pending | skeleton 또는 disabled bottom sheet | request 0 또는 one in-flight |
| empty | 명시적 empty copy와 safe return | guessed mutation 0 |
| unauthorized | login guidance + return-to-action | private projection 미표시 |
| other-owner/private 404 | nondisclosing error + safe back | mutation 0 |
| legacy-null | `이전 기록 · 중량 상태를 확인할 수 없음` | missing/0g/depleted로 추정 금지 |
| depleted | exact reason label; 모든 depleted card에서 weight/discard/adjust/close/consume CTA를 제거한다. 단, `current_unweighed_closure_event_id != null`인 exact current `closed_unweighed` projection에서만 secondary `[방금 종료 취소]`를 허용한다. | generic reopen, non-current closure cancel, unrecoverable reversal은 금지한다. |
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

### Stage 4 implementation commands

- component/history Vitest, Playwright 390px/320px/desktop, a11y/visual, exploratory QA/eval, `verify:frontend`
- runtime focus/overflow evidence와 #11 신규 sheet/section scoped serious/critical axe 0
- COOK_MODE full-page에는 #11 소유 밖 기존 color-contrast residual node 2개가 남아 있다. 신규 UI scoped 0과 분리해 manifest/PR/authority handoff에 기록하며 page-wide 0으로 주장하지 않는다.

## Design / Accessibility Authority

- UI risk: `high-risk`; required screens are `COOK_MODE`, `LEFTOVERS`; neither is an official anchor screen.
- Canonical Stage 1 design paths:
  - `ui/designs/COOK_MODE.md`
  - `ui/designs/LEFTOVERS.md`
- Canonical current critic report paths:
  - `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
  - `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`
- `automation-spec.json`의 supported `frontend.artifact_assertions` index가 위 two designs + two exact critics를 모두 기계적으로 잠근다. 한 화면, 단일 critic 또는 legacy generic critic path만 남으면 Stage 1 regression이 실패한다.
- Stage 1 final internal task `019fe78f-1cfd-71e3-9286-de905478ce9e`와 final design task `019fe78e-f5a4-7662-b89a-8bdc9ee98269`는 두 화면/combined `APPROVE 0/0/0`이었다.
- Fresh Stage 5 task `019feb85-1b83-7662-9c10-ab91d834c4f6`의 report `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage5-p2-repair-rereview.md`와 final authority task `019feb94-4d4f-7831-9000-01eaaf3a7569`의 report `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md`는 모두 `APPROVE 0/0/0`이다.
- Stage 6 task `019feba0-7a3b-7851-bcf0-4ea106cc7c3c`의 `HOLD 0/2/0`은 `CBW-S6-P1-01` PR body drift와 `CBW-S6-P1-02` closeout projection drift에 한정된다. Repair evidence는 `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage6-closeout-drift-repair.md`이며 fresh Stage 6 rereview 전에는 승인으로 보지 않는다.
- Future authority reports: `ui/designs/authority/COOK_MODE-authority.md`, `ui/designs/authority/LEFTOVERS-authority.md`.
- Stage 4는 390px/320px/desktop에서 familiar bottom sheet, 44px target, 16px numeric input, sheet internal scroll/fixed CTA/safe-area, focus trap/focus restore/Escape, overflow, screen reader label/live error를 자동 evidence로 남겼다. #11 신규 sheet/section scoped serious/critical은 0이며, 기존 COOK_MODE full-page contrast residual node 2개는 별도 한계다.
- Static Markdown/PNG와 deterministic runtime JSON은 실제 OS virtual keyboard, physical keyboard, VoiceOver/TalkBack, full WCAG 또는 physical device를 증명하지 않는다. 해당 evidence는 Manual pending이다.

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
- completed independent lanes: fresh Stage 5 `APPROVE 0/0/0` → final authority `APPROVE 0/0/0`.
- next review lane: closeout repair publication head의 fresh independent Stage 6 rereview. Repair author는 자기 수리를 Stage 6 승인하지 않는다.

Stage 1 repair는 lifecycle을 docs/complete/merged로 올리지 않는다. #8 Stage 2/3/4 merged/green fact와 broader Manual/server-Mac/OAuth/R/R+1/R+2/activation pending을 계속 분리한다.

## Delivery Checklist

- [x] COOK_MODE가 existing #8 completion contract와 five UI states를 정확히 소비한다. <!-- omo:id=delivery-batch-weight-ui-cook-mode;stage=4;scope=frontend;review=5,6 -->
- [x] LEFTOVERS가 known/missing/unrecoverable/legacy-null/depleted truth와 eligible #11 action만 표시한다. <!-- omo:id=delivery-batch-weight-ui-leftovers;stage=4;scope=frontend;review=5,6 -->
- [x] #9 backend와 #12 consumed UI ownership을 선점하지 않고 new public contract가 없다. <!-- omo:id=delivery-batch-weight-ui-ownership;stage=4;scope=shared;review=5,6 -->
- [x] two designs + two exact current critic paths가 regression으로 유지된다. <!-- omo:id=delivery-batch-weight-ui-artifact-index;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px/desktop runtime visual·focus·overflow·a11y evidence와 fresh Stage 5/final authority reports가 준비된다. <!-- omo:id=delivery-batch-weight-ui-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] closeout repair publication head의 fresh independent Stage 6 rereview에서 unresolved required finding이 0이다. <!-- omo:id=delivery-batch-weight-ui-independent-review;stage=4;scope=shared;review=5,6 -->

## Manual Only

- [ ] physical keyboard의 focus order/trap/restore/Escape를 실제 browser에서 확인한다.
- [ ] VoiceOver/TalkBack 또는 동등 screen reader의 label/status/live error 발화를 확인한다.
- [ ] 실제 390px/320px device safe-area와 virtual keyboard occlusion을 확인한다.
- [ ] server-Mac/OAuth evidence는 broader lifecycle owner가 별도로 확인한다.
- [ ] R/R+1/R+2와 capability activation은 계속 pending이며 #11이 수행하지 않는다.
