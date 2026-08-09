# Stage 5 independent frontend review — 2026-08-09

## Review provenance and verdict

- Workpack: `cooked-batch-weight-ledger` (#8)
- Review role: fresh independent Stage 5 frontend reviewer; Stage 4 author task `019fe58f-a659-7172-a821-6e7c5083a4d4` 및 이전 author/critic/authority와 별개이며 제품 구현을 작성하지 않았다.
- Original repository: `/Users/shj/2025/2026/homecook1`
- Draft PR: [#1311](https://github.com/netsus/homecook/pull/1311)
- Branch: `feature/cooked-batch-weight-ledger-stage4-frontend-current`
- Exact base: `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1`
- Exact reviewed product head: `4cf710461c3254b7e75e3bf1298f7385c1906a2c`
- Superseded PR #1310은 검토·승인 근거로 사용하지 않았다.
- Verdict: **REQUEST_CHANGES**
- Findings: `P0/P1/P2 = 0/1/1`; unresolved required findings `2`
- Approval gate: actionable `P0/P1/P2 = 0/0/0` 및 unresolved required finding `0`을 충족하지 못했다.

이 판정은 exact product head `4cf710461c3254b7e75e3bf1298f7385c1906a2c`에 대한 것이다. 이 파일을 추가하는 successor는 report-only head이며 제품 판정 대상을 바꾸지 않는다. 보고서 커밋은 자신의 미래 SHA를 내부에 self-reference할 수 없으므로 exact report-only successor SHA는 커밋·push 후 handoff에 기록한다.

## Locked scope and material inspected

- `6981a4...4cf7104` 전체 diff: `24 files`, `1,680 additions`, `50 deletions`
- 공식 source-of-truth와 #8 README/acceptance/automation/evidence/work item/status
- Stage 5, Git/QA/TDD/Playwright/product-design-authority 운영 문서와 design tokens/mobile UX/anchor 기준
- `ui/designs/COOK_MODE.md`, Stage 1 critic/authority 보고서, Stage 1 390/320 PNG 원본
- PR #1311 body, exact diff, exact reviewed-head check runs
- Stage 4 구현·타입·component/API/E2E tests, retained evidence, exploratory checklist/report/eval
- Stage 4 runtime PNG 1280/390/320을 original size로 직접 확인

## Findings

### P1 — complete 성공 검증이 신규 v2/요청 불변식을 fail-closed로 잠그지 못한다

**Location**

- `lib/api/cooking.ts:41-65`, `lib/api/cooking.ts:118-178`
- `tests/cooking-snapshot-v2-api.test.ts:120-166`
- Official contract: `docs/api문서-v1.2.37.md:31-60`, `docs/api문서-v1.2.37.md:63-98`, `docs/api문서-v1.2.37.md:689-705`

**Evidence**

- `completeSnapshotV2CookingSession`은 validator에 `sessionId`만 전달한다. 따라서 응답 `mode`를 열린 session의 mode와, 응답 weight projection을 요청의 `weight_action`/`finished_weight_g`와 대조할 수 없다.
- validator는 snapshot-v2 complete가 새로 만든 v2 batch인데도 `cooking_servings`, `weight_status`, `batch_status`, `revision`, `nutrition_calculation_status`의 legacy-only `null`을 허용한다.
- validator는 완료 직후 initial batch에서 불가능한 `status=eaten`, `batch_status=depleted`, non-null `depleted_reason`, non-null `current_unweighed_closure_event_id`, known weight의 `remaining_weight_g < finished_weight_g` 조합도 허용한다.
- 공식 계약은 legacy-only null을 기존 legacy row에만 허용한다. 신규 v2 row의 servings/revision은 positive이고 weight/batch/nutrition 상태는 non-null이다. complete는 pantry delete, 새 batch·initial ledger와 session completion을 한 transaction에서 최초 1회 만들며 same-key replay도 그 최초 exact data를 반환한다.
- 현재 test는 exact keys와 일부 값 오류는 검사하지만 mode/request correlation, legacy-only null, initial available/leftover/null-reason/null-closure 및 initial known weight equality를 거부하는 regression을 잠그지 않는다. 오히려 두 번째 fixture는 `cooking_servings=null`, `nutrition_calculation_status=null`을 기본값으로 사용한다.

**Impact**

Malformed 또는 계약에서 벗어난 200 응답을 client가 정상 terminal completion으로 소비할 수 있다. 그러면 completion UI가 닫혀 사용자가 동일 payload/key로 안전하게 재시도할 경로를 잃고, server/client 계약 드리프트가 숨겨진다.

**Required repair**

1. complete validator가 expected session mode와 exact request body를 함께 받아 대조하도록 한다.
2. 신규 v2 complete batch에 legacy-only null을 금지하고, initial state를 `leftover + available + depleted_reason=null + current_unweighed_closure_event_id=null`로 잠근다.
3. `set_finished_weight`는 `known`이며 finished/remaining이 요청한 positive g와 동일하고, `weigh_later`는 `missing`이며 두 weight가 null임을 잠근다.
4. 위 malformed response 각각이 `INVALID_RESPONSE`가 되는 RED→GREEN regression test를 추가한다.

### P2 — retained runtime screenshot 해시가 exact head blob과 불일치하고 모바일 재캡처도 비결정적이다

**Location**

- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage4-frontend-implementation.md:29-35`
- `docs/workpacks/cooked-batch-weight-ledger/evidence/2026-08-09-stage4-frontend-stage-result.json:37-55`
- `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts:253-308`

**Evidence**

| Runtime evidence | Size | Retained SHA-256 | Exact reviewed-head blob SHA-256 | Fresh exact-grep regenerated SHA-256 |
| --- | ---: | --- | --- | --- |
| `COOK_MODE-implementation-desktop-1280.png` | `1280x900` | `e3e4c2b15253f4bb547ecfa4383bb3825dd374e14610654c9047cf6435c6a539` | `73fd2b9d36034c1cf84c32f1ea6fd1e8d1d8aeeb308a3dc5c976912385ce5b62` | `e3e4c2b15253f4bb547ecfa4383bb3825dd374e14610654c9047cf6435c6a539` |
| `COOK_MODE-implementation-mobile-default-390.png` | `390x844` | `3ad8e8239426d9e735219e9aa62aaa8e1425584e814beda5c9608e72b677fcb9` | `599ad98e281fd0bab26c959f5fffffe1b1ae8b8b53bc1a3820daa12474c0f589` | `4ab77e1ce52bb28bd976a9153f25a347c292732340ae4200022e221825824130` |
| `COOK_MODE-implementation-mobile-narrow-320.png` | `320x568` | `c6cc60b23a9c2ebbe6553ab2ba460c4729b1b283f44fba4b426ad78666e6985b` | `500ff117971f80f217d58b8680a616c8862ab7299495bc9e7958bad2fdc97ef8` | `4bd3d901171c8bd53cac714d1eb9d05fd3083acdfd7b653fe6e452fff6f3841b` |

- exact head의 committed blob 세 개가 retained Markdown/JSON의 해시와 모두 다르다.
- fresh exact Playwright grep에서 desktop은 retained hash를 재생했지만 390/320은 retained 값과 committed blob 모두와 다른 hash가 나왔다.
- fresh test가 만든 PNG는 검증 후 exact head blob으로 복구했고, 제품 branch는 보고서 작성 전에 clean임을 확인했다.

**Impact**

크기와 화면 내용은 직접 확인할 수 있지만, retained evidence가 어떤 exact binary를 증명하는지 재현할 수 없다. 따라서 현재 hash 기록을 Stage 5/final authority의 immutable provenance로 사용할 수 없다.

**Required repair**

1. 캡처 시점의 font/render/network/animation readiness를 고정해 390/320 결과를 결정적으로 만든다.
2. canonical PNG를 다시 생성·commit하고 Markdown과 stage-result JSON의 SHA-256을 같은 committed blob 기준으로 갱신한다.
3. fresh clone/exact head에서 exact grep을 다시 실행해 working tree가 clean이고 기록 해시와 blob 해시가 일치함을 검증한다.

## Passed review areas

- exact 8-key complete payload와 15-key `CookedBatchProjection` field set을 사용하며 owner/capability 내부 authority를 browser에 투영하지 않는다.
- pantry 후보의 exact row identity, 실제 product/brand 표시, 초기 선택 empty, explicit `[]`, 자동·추측 선택 금지를 지킨다.
- weight action은 original food-only positive g 또는 weigh-later null의 exact-one UI로 제한된다.
- pending 동안 전체 경로를 잠그고 duplicate submit을 in-flight ref로 dedupe한다.
- same payload retry는 같은 idempotency key, 변경 payload는 새 key를 사용한다.
- 409/422에서 선택·그램 입력을 유지하고 error summary로 focus를 이동하며 field 연결을 제공한다.
- stored terminal replay는 controls 없는 read-only 결과로 한 번만 종료된다.
- loading/empty/error/read-only coverage가 있고 #9 meal-log, #11 final delayed-weight/unrecoverable/LEFTOVERS, #12 및 R/R+1/R+2 activation을 구현하지 않는다.

## Runtime mobile/desktop UX review

- 1280 runtime은 430px 안팎의 중앙 mobile sheet로 표시되어 desktop에서도 hierarchy가 유지된다.
- 390 runtime은 familiar bottom sheet, drag handle/header/content/footer 구조가 명확하며 16px gutter, 44px target, footer safe-area 구조가 보인다.
- 320 runtime은 sheet 내부 content만 세로 scroll하고 footer가 유지된다. viewport clipping과 horizontal overflow는 보이지 않았다.
- heading→설명→선택 rows→weight action→primary action의 위계가 명확하고, 선택 row와 도움말 대비는 원본 PNG에서 식별 가능했다.
- exact Playwright는 focus trap/restore, Tab/Escape, error-summary focus, 44px target, 16px gutter, narrow internal scroll, horizontal overflow 없음, console error 0, axe serious/critical 0을 검증했다.

단, mock/runtime screenshot과 desktop Chrome emulation은 physical keyboard, 실제 iOS Safari/가상 키보드 resize, VoiceOver·TalkBack, 손가락 touch 정확도, 모든 WCAG success criterion을 완전히 증명하지 못한다. axe serious/critical 0도 전체 WCAG 준수 선언이 아니다.

## Independent verification

- Focused Vitest:
  - command: `pnpm exec vitest run tests/cooking-snapshot-v2-api.test.ts tests/cooked-batch-completion-sheet.test.tsx tests/cooked-batch-pantry-row-selection.test.tsx tests/cooked-batch-completion-replay.test.tsx tests/cooked-batch-api-contract-v1-2-36.test.ts`
  - result: `5 files / 23 tests passed`
- Exact Playwright grep:
  - command: `pnpm test:e2e:regression:ci --grep cooked-batch-weight-ledger`
  - result: `5 passed / 1 intended skip`
  - 첫 임시-worktree 시도는 외부 `node_modules` symlink를 Turbopack이 거부해 test 시작 전 실패했다. 정상 dependency가 있는 exact-head branch worktree에서 같은 명령을 재실행해 위 결과를 얻었다.
- `pnpm typecheck`: pass
- `pnpm lint`: pass
- original-size inspection: `1280x900`, `390x844`, `320x568`
- GitHub exact reviewed-head snapshot at `2026-08-09 18:35 KST`: `18 runs = 15 success + 2 intended skip + 1 in progress`; fail/cancel `0/0`. `quality`는 terminal success, `GitGuardian Security Checks`는 in progress였다.

진행 중 check는 승인 증거로 사용하지 않았다. 이 보고서 push로 새 head가 생기므로 successor head 전체 check 잠금은 오케스트레이터의 별도 책임이다.

## Lifecycle and pending boundaries

- Stage 5 frontend review: **complete with REQUEST_CHANGES**
- Design Status: `pending-review` 유지
- Lifecycle: `in_progress` 유지
- Final product-design-authority, Stage 6, Ready 전환, merge, Discord, migration/apply 및 capability activation: 수행·승인하지 않음
- Pending: author P1/P2 repair와 fresh independent Stage 5 re-review
- Pending: physical iOS/manual browser, Manual/server-Mac/OAuth
- Pending: merged-exact-SHA server-production/local-rehearsal read-only evidence
- Pending: full v1 compatibility 및 seeded R/R+1 drain E2E
- Pending: R+2 service-owner approval/activation과 rollback gate
