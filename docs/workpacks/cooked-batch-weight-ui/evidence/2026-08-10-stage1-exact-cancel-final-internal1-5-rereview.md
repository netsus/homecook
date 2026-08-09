# cooked-batch-weight-ui Stage 1 exact-cancel final internal 1.5 독립 재검토

## 리뷰 메타데이터

- 리뷰 일자: 2026-08-10
- 역할: fresh independent final Stage 1 exact-cancel internal 1.5 rereviewer
- Codex task ID: `019fe78f-1cfd-71e3-9286-de905478ce9e`
- 실행 모델: GPT-5.6-Sol, high
- Claude CLI/app/API: 사용하지 않음
- author task ID: `019fe786-0f81-7c80-9238-d6088ae3d924`
- prior internal 1.5 APPROVE task ID: `019fe77a-424b-7532-b720-9206199a36e1`
- prior design rereview task ID: `019fe77a-69a8-74d2-a11a-e79e7afa39ce`
- 독립성: Stage 1 author, prior internal reviewer, prior design critics와 다른 fresh task에서 수행했다. 이 task는 자기 변경을 승인하지 않으며 이 보고서 외 제품·계약·설계·테스트 파일을 수정하지 않는다.

## Exact review target

| Object | Exact value |
| --- | --- |
| reviewed head | `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f` |
| reviewed tree | `51c79e12ad4ff76a62676b686698978519479bf6` |
| reviewed parent | `856d27001c8c87b85cc9f457ecb23944b43eecc3` |
| Stage 1 base/master | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| Stage 1 base tree | `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a` |
| prior design reports integration | `23c980c3c99450ce31d01437e2c2d4885702c0c4` |
| prior internal report cherry-pick | `856d27001c8c87b85cc9f457ecb23944b43eecc3` |
| exact-cancel repair | `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f` |

`413d8ffa...`의 parent, tree와 요청된 exact object가 일치한다. parent 대비 변경은 `README.md`, `acceptance.md`, exact-cancel repair evidence, Stage 1 semantic test의 허용된 4개 경로뿐이다. package manifest, lockfile, official docs/API, automation spec, work item, workflow status, design, critic 및 기존 review report의 parent 대비 diff는 0이다.

## 최종 판정

**APPROVE — reviewed exact repaired head**

| 등급 | 발견 | 미해결 required |
| --- | ---: | ---: |
| P0 | 0 | 0 |
| P1 | 0 | 0 |
| P2 | 0 | 0 |

원본 internal 1.5의 P1 6건과 prior design HOLD의 신규 exact-cancel P1 1건이 reviewed exact head에서 모두 닫혔다. 신규 endpoint, field, status, error, action, migration, dependency, RPC, Route Handler 또는 public contract는 추가되지 않았다. lifecycle은 계속 `planned`, approval은 `not_started`, verification은 `pending`, evaluation은 `not_started`, `auto_merge_eligible=false`다.

## 원본 internal 1.5 P1 6건 재검토

| Finding | 판정 | 근거 |
| --- | --- | --- |
| current tuple / historical digest / base lineage | CLOSED | 공식 튜플 `v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37`, base `c16102a...`/tree `674bc7...`, approved-plan SHA-256 `d4d0fb39...`/1,018 lines가 README, acceptance, automation, work item에서 일치한다. API v1.2.37은 v1.2.36의 `0-CBW` 계약을 보존한다. |
| #8 delivery와 broader lifecycle 혼합 | CLOSED | #8 PR #1311 head `2a2cd6fb...`와 merge `c16102a...`의 ancestry 및 Stage 6/authority evidence를 확인했다. Stage 2/3/4 delivery는 merged/green이지만 Manual/server-Mac/OAuth, R/R+1/R+2 drain/rollback과 activation은 별도 pending이다. |
| Stage 1 구조/metadata/artifact 누락 | CLOSED | Dependencies, Schema Change, Backend First Contract, Frontend Delivery Mode, QA/Test Data Plan, Primary User Path, Data Setup/Preconditions와 OMO metadata가 존재하며 current Stage 1, future Stage 4, Manual 증거를 분리한다. |
| two-design/two-critic lock | CLOSED | `COOK_MODE.md`, `LEFTOVERS.md`와 exact original critic 두 경로가 automation artifact assertions 및 회귀 테스트로 기계 고정된다. historical HOLD와 repaired-head 판정을 혼동하지 않는다. |
| UI-only ownership / Stage 2·3 N/A / #9·#12 경계 | CLOSED | #11은 Stage 4 frontend-only consumer다. Stage 2/3은 N/A이고 #9가 meal-log backend DB/API/write/event/pointer, #12가 consumed-amount UI를 소유한다. shared projection 변경은 순차 통합한다. |
| mobile/accessibility/manual evidence 경계 | CLOSED | 390/320, bottom sheet, 44px target, 16px numeric input, safe area/virtual keyboard, overflow, focus trap·restore·Escape, screen-reader label/live error가 future Stage 4 acceptance로 고정된다. runtime 및 physical-device evidence는 수행했다고 주장하지 않고 pending으로 유지한다. |

## 신규 P1 exact-cancel closure

**P1-LO-RR-01 — CLOSED.** README의 LEFTOVERS scope, Frontend Delivery Mode, State/Error Matrix와 acceptance가 official API v1.2.37의 exact rule과 일치한다.

1. ordinary depleted card에서는 weight/discard/adjust/close/consume CTA를 모두 제거한다.
2. `current_unweighed_closure_event_id != null`인 exact current active `closed_unweighed` projection에서만 `[방금 종료 취소]`를 허용한다.
3. `cancel_current`는 projected event ID와 `reverses_event_id`가 일치하고 `expected_revision`이 일치하는 현재 closure에만 적용한다.
4. later event, non-current closure, `marked_unrecoverable`, legacy-null 또는 generic reopen은 reversal을 제공하지 않으며 server 409 경계를 완화하지 않는다.

두 design의 기존 UI 계약과 모순도 없다. COOK_MODE의 legacy-null/depleted는 LEFTOVERS read-model only이므로 N/A이고, LEFTOVERS는 legacy/v2 두 영역과 cursor pagination을 보존한다. exact-cancel은 새로운 action이 아니라 기존 #8 official mutation의 조건부 노출이다. 추가 product/API/schema/migration/dependency 변화는 없다.

새 semantic regression은 ordinary depleted mutation CTA absent, exact current-closure cancel present, generic reopen/non-current/unrecoverable reversal absent를 README의 세 관련 구간과 acceptance에 걸쳐 한 규칙으로 잠근다.

## Report lineage와 상태 진실성

| Commit | 역할 | 이 재검토의 해석 |
| --- | --- | --- |
| `e52aa5c5583635c849c74c084337e702a3f58060` | parallel repair integration head | prior design/internal review가 실제로 검토한 historical docs head |
| `23c980c3c99450ce31d01437e2c2d4885702c0c4` | fresh design report integration | COOK_MODE `APPROVE 0/0/0`, LEFTOVERS `HOLD 0/1/0`; exact-cancel contradiction을 P1으로 남김 |
| `856d27001c8c87b85cc9f457ecb23944b43eecc3` | prior internal APPROVE report cherry-pick | task `019fe77a-424b-7532-b720-9206199a36e1`의 `e52aa5c...` 승인 기록이며 repaired head 승인이 아님 |
| `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f` | exact-cancel repair | prior internal approval 이후 README/acceptance/test bytes가 바뀐 현재 reviewed exact head |

lineage는 `c16102a... → 337daa80... → 0d64660f... → ec1f1d81... → 23356ffc... → 5be80d22... → e52aa5c5... → 23c980c3... → 856d2700... → 413d8ffa...`로 연속이다. 모든 보고서는 자신이 검토한 head를 별도로 밝히며 historical APPROVE/HOLD를 current-head 승인으로 재해석하지 않는다.

## Artifact digest 확인

| Artifact | SHA-256 |
| --- | --- |
| `ui/designs/COOK_MODE.md` | `f639aaef8bb611022dccf1a6b5cfdc8a7e963fee13613e610c7090ca814915c8` |
| `ui/designs/LEFTOVERS.md` | `25a19c6bf55c98107daff2aff75270aa6b57b65afdce46b8bed822f43cd649ab` |
| `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md` | `1729a7ae3246610419ac66a099723506938b57f8127beaff0fd90714570d480f` |
| `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md` | `644152c52308f5932a635d92baf451472ea7ddaeb8cea15bc25394cdc2c72623` |
| `docs/workpacks/cooked-batch-weight-ui/README.md` | `a3aead9f7d2e581ad5aabc9dc4be36a80a40c97cc7eeb21afe881a90f708e300` |
| `docs/workpacks/cooked-batch-weight-ui/acceptance.md` | `615669888c980a29b0d00b2788dce6f2970ce82b30df1ff4b44de313c4fc799f` |
| `tests/cooked-batch-weight-ui-stage1-repair.test.ts` | `86e0e2a0f2d39230047912e48e814ff4a308d3836b887862c9fcdcbae9938f3d` |

## 독립 검증

초기 focused 시도는 clean worktree에 `vitest`가 없어 exit 254였다. `pnpm install --frozen-lockfile`로 기존 lockfile의 668 packages를 복원했고 package/lockfile 변경은 없다. 첫 확장 시도는 정확한 prior design 범위보다 작은 14-file/138-test 조합임을 발견해 승인 근거로 사용하지 않았다. prior 11-file Stage 1 범위에 exact completion replay/sheet 및 official cooked-batch mutation contract를 더한 정확한 14-file 범위를 재구성해 142 tests를 모두 실행했다.

| Check | Result |
| --- | --- |
| focused Vitest | `14 files / 142 tests` pass, failed 0 |
| `pnpm validate:source-of-truth-sync` | pass |
| `pnpm validate:workflow-v2` | pass |
| `BRANCH_NAME=docs/cooked-batch-weight-ui pnpm validate:workpack -- --slice cooked-batch-weight-ui` | pass |
| `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ui` | pass |
| `pnpm validate:omo-bookkeeping` | pass |
| `pnpm validate:authority-evidence-presence -- --slice cooked-batch-weight-ui` | pass |
| `pnpm validate:closeout-sync -- --slice cooked-batch-weight-ui` | pass |
| `pnpm lint` | pass, errors 0 |
| `pnpm typecheck` | pass |
| `pnpm audit --audit-level high` | exit 0; high/critical 0, residual low 1 / moderate 1 |
| exact head/tree/parent/base, ancestry, path scope | pass |
| `git diff --check` | pass |

집중 테스트 파일:

- `tests/cooked-batch-weight-ui-stage1-repair.test.ts`
- `tests/cooked-batch-weight-ledger-stage1-relock.test.ts`
- `tests/cooked-batch-api-contract-v1-2-36.test.ts`
- `tests/cooked-batch-compatibility.test.ts`
- `tests/cooked-batch-weight-ledger.test.ts`
- `tests/leftovers.frontend.test.tsx`
- `tests/cooked-batch-completion-replay.test.tsx`
- `tests/cooked-batch-completion-sheet.test.tsx`
- `tests/workflow-v2-docs.test.ts`
- `tests/omo-automation-spec.test.ts`
- `tests/omo-bookkeeping.test.ts`
- `tests/omo-doc-gate.test.ts`
- `tests/source-of-truth-sync.test.ts`
- `tests/authority-evidence-presence.test.ts`

## 범위와 남은 gate

이번 task는 이 final internal 1.5 rereview report만 작성한다. README, acceptance, automation, work item/status, design, test, original report, official docs, product/API/schema/migration/dependency는 수정하지 않는다. PR, merge, Discord, Stage 4, final authority 또는 activation을 수행하지 않는다.

이 판정은 repaired exact head `413d8ffa...`의 Stage 1 internal 1.5 승인이다. 별도 역할인 fresh exact-head design critic artifact는 source metadata상 계속 pending이며 이 internal reviewer가 대신 작성하거나 자기 승인하지 않는다.

Stage 4 component/E2E/visual/a11y/browser/runtime evidence, 390px/320px 실제 화면과 physical keyboard·screen reader·safe area·virtual keyboard Manual Only evidence, final product-design-authority가 남아 있다. #8 broader Manual/server-Mac/OAuth, R/R+1/R+2 drain/rollback과 capability activation도 pending이며 #11이 완료하거나 수행하지 않는다.

보고서 delivery commit/tree/parent/branch는 자기참조를 피하기 위해 commit 후 task 최종 handoff에 기록한다.
