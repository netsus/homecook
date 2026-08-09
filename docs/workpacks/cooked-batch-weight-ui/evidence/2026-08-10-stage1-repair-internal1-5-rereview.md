# cooked-batch-weight-ui Stage 1 repair internal 1.5 독립 재검토

## 리뷰 메타데이터

- 리뷰 일자: 2026-08-10
- 역할: fresh independent Stage 1 repair internal 1.5 docs-gate rereviewer
- Codex task ID: `019fe77a-424b-7532-b720-9206199a36e1`
- 실행 모델: GPT-5.6-Sol, high
- Claude CLI/app/API: 사용하지 않음
- integration task ID: `019fe771-88ef-73f1-b787-64522aee3d10`
- original internal 1.5 task ID: `019fe738-2551-7be0-993a-df0c172c9290`
- original design critic task ID: `019fe752-e4f6-7cc1-99b2-c57b438b069a`
- 독립성: Stage 1 author/generator/critic/integration task와 다른 fresh task에서 수행했으며, 이 task는 자기 변경을 승인하지 않는다.

## Exact review target

| Object | Exact value |
| --- | --- |
| reviewed head | `e52aa5c5583635c849c74c084337e702a3f58060` |
| reviewed tree | `8664f600497d8215b1c45d1478b2098d0b9c2ce6` |
| reviewed parent | `5be80d22682cbcee9e256027304710cc6c0c851a` |
| Stage 1 base/master | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| Stage 1 base tree | `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a` |
| design repair | `23356ffc2ad03d136076a91d7e5a677a1dfcf98a` |
| docs repair cherry-pick | `5be80d22682cbcee9e256027304710cc6c0c851a` |
| integration evidence | `e52aa5c5583635c849c74c084337e702a3f58060` |

`23356ffc...`는 두 design과 design repair evidence 3개 경로만, `5be80d22...`는 #11 docs/automation/status/test 7개 경로만 변경한다. 두 repair lane의 경로 교집합은 0개이고, `e52aa5c5...`는 integration evidence 1개 경로만 추가한다. 요청된 exact lineage와 실제 commit/tree/parent 및 `master` object가 일치하며 `git diff --check`도 통과했다.

## 최종 판정

**APPROVE — reviewed exact docs head**

| 등급 | 발견 | 미해결 required |
| --- | ---: | ---: |
| P0 | 0 | 0 |
| P1 | 0 | 0 |
| P2 | 0 | 0 |

원본 internal 1.5의 P1 6건과 원본 design critic의 unique P1/P2 7건이 reviewed exact head에서 모두 닫혔다. 신규 endpoint, field, status, error, action, migration, RPC, Route Handler, server helper 또는 public contract는 추가되지 않았다. lifecycle은 계속 `planned`, approval은 `not_started`, verification은 `pending`, evaluation은 `not_started`, `auto_merge_eligible=false`이며 이 승인으로 Stage 4 또는 activation 상태를 앞당기지 않는다.

## 원본 internal 1.5 P1 closure

| 원본 finding | 재검토 결과 | 근거 |
| --- | --- | --- |
| P1-01 current tuple / base / lineage | CLOSED | README, acceptance, automation, work item이 공식 튜플 `v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37`, base `c16102a...`/tree `674bc7...`, approved plan digest `d4d0fb39...`/1,018 lines, API v1.2.37의 v1.2.36 `0-CBW` 보존을 일치시킨다. |
| P1-02 #8 delivery와 broader lifecycle 혼합 | CLOSED | #8 PR #1311 head `2a2cd6fb...`와 merge `c16102a...`는 현재 master ancestry에서 확인된다. Stage 2/3/4 runtime delivery는 merged/green으로, Manual/server-Mac/OAuth/R/R+1/R+2/activation은 별도 pending으로 유지한다. |
| P1-03 Stage 1 구조/metadata 누락 | CLOSED | Dependencies, Schema Change, Backend First Contract, Frontend Delivery Mode, QA/Test Data Plan, Primary User Path, Data Setup/Preconditions, OMO metadata와 current/future command 구분이 존재한다. |
| P1-04 two-design/two-critic lock | CLOSED | 현재 두 design과 exact 두 historical critic 경로를 automation artifact assertions와 새 회귀 테스트가 기계적으로 잠근다. historical HOLD critic은 provenance이며 current-head 승인 보고서로 재해석하지 않는다. |
| P1-05 UI-only ownership / #9 경계 | CLOSED | #11 Stage 2/3은 N/A, 제품 구현은 Stage 4 UI-only다. backend endpoint/command 배열과 backend fix rounds는 비어 있거나 0이고, #9 backend/#12 consumed UI 제외 및 shared projection 순차 통합을 명시한다. |
| P1-06 mobile/accessibility/manual evidence | CLOSED | 390/320, bottom sheet, 44px touch, 16px numeric input, sheet scroll/fixed CTA/safe area/virtual keyboard, focus trap·restore·Escape, overflow, screen-reader label/live error, 상태 행렬과 자동/Manual 증거 경계가 acceptance와 automation에 고정된다. Runtime/physical evidence 자체는 정직하게 Stage 4/Manual pending이다. |

## Design critic P1/P2 repair 재검토

원본 두 critic의 unique starting findings `P0/P1/P2 = 0/4/3`도 reviewed exact head에서 모두 닫혔다.

| Finding 묶음 | 재검토 결과 | 확인 내용 |
| --- | --- | --- |
| lineage evidence role 혼합 | CLOSED | 두 design이 reviewed input, internal HOLD, critic HOLD와 repair base를 분리하고 어느 historical HOLD도 승인이 아님을 명시한다. |
| four-artifact machine lock 부재 | CLOSED | 두 design + exact 두 critic이 automation과 회귀 테스트에 exact path로 고정된다. |
| legacy LEFTOVERS 기능 소실 | CLOSED | legacy `/leftovers`와 v2 `/cooked-batches`를 별도 section/read model로 유지하며 planner-add, 다먹음, ATE_LIST, 덜먹음, stale-review를 보존한다. |
| cursor pagination UX 부재 | CLOSED | 더 보기, opaque cursor/has-next, pending/error/retry/422 refresh, stable append, duplicate 보호, focus/live announce가 정의된다. |
| COOK_MODE unreachable legacy/depleted | CLOSED | COOK_MODE는 `N/A — LEFTOVERS read-model only`로 명시하고 hidden GET, 신규 field, guessed state를 금지한다. |
| unsupported `[상세 확인]` | CLOSED | action을 제거하고 exact 15-field read-only card가 legacy-null truth를 완결한다. |
| nonexistent `--border` | CLOSED | 기존 `--line`과 `--danger-border`만 사용하며 신규 token/hex를 만들지 않는다. |

### Exact four-artifact digest

| Artifact | SHA-256 |
| --- | --- |
| `ui/designs/COOK_MODE.md` | `f639aaef8bb611022dccf1a6b5cfdc8a7e963fee13613e610c7090ca814915c8` |
| `ui/designs/LEFTOVERS.md` | `25a19c6bf55c98107daff2aff75270aa6b57b65afdce46b8bed822f43cd649ab` |
| `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md` | `1729a7ae3246610419ac66a099723506938b57f8127beaff0fd90714570d480f` |
| `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md` | `644152c52308f5932a635d92baf451472ea7ddaeb8cea15bc25394cdc2c72623` |

## Contract, ownership and state audit

- #11은 food-only cooked-batch weight의 known/later/legacy-null/depleted 표현과 #8의 discard/adjust/close mutation을 UI로 소비할 뿐이다.
- #9가 meal-log DB/API/write/event/pointer를 소유하고 #12가 consumed-amount add/edit/delete UI를 소유한다. #11은 이 표면을 미리 생성하거나 렌더하지 않는다.
- shared `CookedBatchProjection` 또는 client adapter 변경이 필요하면 #9/#11/#12가 같은 파일을 병렬 수정하지 않고 순차 통합한다.
- official five-doc tuple과 exact 15-key projection, exact 8-key completion result, 세 mutation, error wrapper/status 의미를 바꾸지 않는다.
- two-screen repair는 legacy LEFTOVERS와 cooked-batch read model을 구분하며 새로운 join, client-synthesized field 또는 server capability를 요구하지 않는다.
- Contract Evolution Candidate는 없다.

## Verification

첫 focused Vitest 시도는 이 worktree에 `node_modules`가 없어 `vitest`를 찾지 못해 exit 254였다. `pnpm install --frozen-lockfile`로 lockfile과 package manifest를 바꾸지 않고 의존성을 복원한 뒤 같은 검증을 재실행했다.

| Check | Result |
| --- | --- |
| focused Vitest 11 files | `129 passed / 129`, failed 0 |
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
| commit/tree/parent/base and path-lineage audit | pass |
| `git diff --check` | pass |

집중 테스트 파일:

- `tests/cooked-batch-weight-ui-stage1-repair.test.ts`
- `tests/cooked-batch-weight-ledger-stage1-relock.test.ts`
- `tests/cooked-batch-api-contract-v1-2-36.test.ts`
- `tests/cooked-batch-compatibility.test.ts`
- `tests/leftovers.frontend.test.tsx`
- `tests/workflow-v2-docs.test.ts`
- `tests/omo-automation-spec.test.ts`
- `tests/omo-bookkeeping.test.ts`
- `tests/omo-doc-gate.test.ts`
- `tests/source-of-truth-sync.test.ts`
- `tests/authority-evidence-presence.test.ts`

## 범위와 남은 gate

이번 task는 이 재검토 보고서만 작성했다. product/design/original critic/README/acceptance/automation/work item/status/test를 수정하지 않았고 PR, merge, Discord, design authority, Stage 4 또는 activation을 수행하지 않았다.

이 판정은 reviewed exact docs head `e52aa5c...`에 대한 internal 1.5 승인이다. 병렬로 작성되는 fresh design critic 재검토 보고서와 이 internal 1.5 보고서는 아직 reviewed head에 통합되지 않았으므로, 두 final report의 report-only commit을 별도 integration task가 충돌 없이 결합하고 exact final tree에서 경로·verdict·독립 task ID를 다시 확인해야 한다. 보고서 통합은 lifecycle/approval/verification/evaluation 상태를 자동 승격하지 않는다.

Stage 4 component/E2E/visual/a11y/browser/runtime evidence와 390px/320px physical-device evidence는 계속 pending이다. physical keyboard focus order/trap/restore/Escape, VoiceOver/TalkBack 또는 동등 screen reader, 실제 기기 safe area와 virtual keyboard는 Manual Only다. server-Mac/OAuth, R/R+1/R+2 drain/rollback과 capability activation도 broader lifecycle pending이며 이번 리뷰의 승인 범위가 아니다.

보고서 delivery commit/tree/parent/branch는 자기참조를 피하기 위해 commit 후 task 최종 handoff에 기록한다.
