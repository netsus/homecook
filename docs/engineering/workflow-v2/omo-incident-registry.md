# OMO Incident Registry

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 범위: OMO supervisor reset Phase 0 incident corpus / freeze rule
- 이 문서는 slice07 failure log를 seed로 삼아, 그 이전 slice와 OMO pilot에서 누적된 문제를 "수동 patch의 기억"이 아니라 reset input corpus로 관리하기 위한 registry다.

## Purpose

이 registry의 목적은 두 가지다.

1. merged/passed 상태 뒤에 숨은 recovery cost를 기록한다.
2. reset 동안 "일단 돌아가게 만드는 patch"와 "구조를 줄이는 reset 작업"을 구분한다.

이 문서는 issue tracker가 아니다.
OMO reset의 우선순위를 잡기 위한 운영 corpus다.

## Working Rule During Reset

reset 기간의 기본 규칙은 아래와 같다.

- 새 OMO 기능은 원칙적으로 보류한다. 허용되는 변경은 reset bucket(A~G)에 직접 매핑되는 것만 포함한다.
- product slice를 막는 긴급 수정은 허용하되, fix 전후로 반드시 이 registry에 incident를 먼저 남긴다.
- promotion readiness는 replay acceptance 전까지 `ready`를 전제로 삼지 않는다.
- merged/passed만으로 incident를 종료 처리하지 않는다. manual patch, stale lock, no-op commit recovery, runtime edit가 있었으면 unresolved smell로 남긴다.
- ambiguous incident는 억지로 OMO bug로 확정하지 않고 `mixed` 또는 `product-local`로 분류한다.

## Taxonomy

각 incident는 아래 필드로 분류한다.

- `id`: stable identifier
- `status`: `open | monitoring | backfill-required | separated-product-bug | closed-by-replay`
- `boundary`: `omo-system | mixed | product-local`
- `bucket`: reset plan bucket (`A`~`G`)
- `stage_scope`: 관련 stage / subphase
- `symptom`: 실제로 관찰된 실패
- `current_recovery`: 당시 사용한 수동 복구 방식
- `root_cause_hypothesis`: 현재 시점 가설
- `evidence_refs`: 확인 가능한 문서 / tracked state / artifact

## Boundary And Status Decision Rule

이번 정리 pass에서는 incident를 "무조건 open으로 유지"하지 않고,
현재 reset 의사결정에 어떤 역할을 하는지 기준으로 다시 나눈다.

### Boundary Rule

- `omo-system`
  - fix owner가 supervisor / runtime / closeout projection / auditor / promotion policy에 있다.
- `mixed`
  - 현재 남은 문제의 핵심이 evidence retention, retrospective reconstruction, historical gap처럼 OMO와 product 실행 흔적이 함께 얽혀 있다.
- `product-local`
  - 제품 버그 자체가 본질이고 OMO는 발견 경로일 뿐이다.

### Status Rule

- `open`
  - 지금도 reset blocker로 직접 작동하는 활성 family다.
  - policy, projection, runtime, contract, promotion 판단을 바꾸는 실제 변경이 아직 남아 있다.
- `monitoring`
  - 역사적으로 중요한 seed incident지만, 현재는 더 구체적인 active incident가 같은 family를 대표하거나 recent replay/cleanup 이후 "관찰 대상"으로 내려간 상태다.
  - promotion 설명에는 참고할 수 있지만 primary unresolved blocker set에는 기본으로 넣지 않는다.
- `backfill-required`
  - 현재 문제의 핵심이 기능 오작동보다 evidence/disposition 공백이다.
  - replay나 정책 변경보다 먼저 "무슨 증거를 canonical로 인정할지"를 정해야 한다.
- `closed-by-replay`
  - representative replay에서 같은 family가 manual patch 없이 재현되지 않았고, replay ledger/evidence가 repo-local surface에 남아 있다.
- `separated-product-bug`
  - OMO failure family에서 분리된 제품 결함이다.

### Blocker Interpretation Rule

- 현재 `not-ready`의 직접 blocker는 기본적으로 `boundary=omo-system`이면서 `status=open`인 incident다.
- `mixed + backfill-required` incident는 evidence/disposition 정리가 끝날 때까지 secondary blocker로 취급한다.
- `monitoring` incident는 historical context로 유지하되, active blocker를 설명할 때는 해당 family를 대표하는 더 구체적인 open incident를 우선 사용한다.

## Artifact Preservation Rule

### Canonical Rule

- current canonical evidence는 repo-local retained surface에 있어야 한다.
- 허용되는 기본 surface는 `.artifacts/**`, `.workflow-v2/**`, `docs/**`, `ui/designs/**`다.
- `/private/tmp/**`, 다른 machine 절대경로, 현재 열 수 없는 off-repo path는 historical breadcrumb일 수는 있어도 단독 canonical evidence는 아니다.

### Disposition Rule

- 원래 artifact를 다시 회수할 수 없고 repo-local substitute evidence만 남아 있으면 `artifact-missing accepted` disposition을 명시한다.
- dedicated disposition field가 아직 없으므로, 현재 pass에서는 `current_recovery` 또는 backfill note에 그 문구를 그대로 남긴다.
- `artifact-missing accepted`는 "문제가 사라졌다"는 뜻이 아니라 "원본 artifact 공백을 인정하고 현재 retained evidence로 운영 판단을 이어간다"는 뜻이다.

### Slice-Specific Preservation Direction

- slice06:
  - historical stage6 bundle / tmp evaluator path는 breadcrumb로 유지할 수 있다.
  - current retained evidence는 `.artifacts/meta-harness-auditor/slice06-replay/**`와 `.workflow-v2/replay-acceptance.json`을 우선 사용한다.
- slice03:
  - 현재는 `backfill-required`를 유지한다.
  - retrospective에서 off-repo evidence를 회수하지 못하면 `artifact-missing accepted` disposition과 repo-local surrogate refs를 남기는 쪽으로 정리한다.

## Seed Incidents

### OMO-RETRO-001

- status: `monitoring`
- boundary: `omo-system`
- bucket: `F. Auditor / Promotion Reset`
- stage_scope: `promotion gate / recurring audit`
- symptom: 과거 audit는 `not-ready`였는데 이후 promotion ledger와 auditor가 `ready`/`findings 0`로 전환되었고, 같은 시점에 slice07 failure corpus는 심각한 runtime/recovery 문제를 보여줬다.
- current_recovery: 현재는 더 구체적인 cutover drift incident `OMO-RETRO-003`이 active blocker를 대표하고, 이 incident는 "왜 auditor reset이 필요해졌는지"를 보여주는 umbrella seed로 남긴다.
- root_cause_hypothesis: auditor와 promotion readiness가 recent incident corpus, runtime anomaly, recovery cost를 입력으로 사용하지 않고 docs/ledger alignment를 과신한다.
- evidence_refs:
  - `.artifacts/meta-harness-auditor/h-omo-001-check/report.md`
  - `.artifacts/meta-harness-auditor/2026-04-20T10-11-50.130Z/report.md`
  - `.workflow-v2/promotion-evidence.json`

### OMO-RETRO-002

- status: `monitoring`
- boundary: `omo-system`
- bucket: `B. Canonical State Reduction`
- stage_scope: `closeout / bookkeeping / reconcile`
- symptom: closeout truth가 README, acceptance, PR body, `.workflow-v2/status.json`에 분산되어 drift가 운영 부담이 됐다.
- current_recovery: 현재 active closeout blocker는 `OMO-07-002`가 더 직접적으로 대표하고 있어, 이 incident는 canonical state reduction의 historical umbrella로 유지한다.
- root_cause_hypothesis: authoritative closeout owner가 하나가 아니고 여러 surface가 동시에 writable 하다.
- evidence_refs:
  - `.artifacts/meta-harness-auditor/h-omo-001-check/report.md`
  - `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`
  - `docs/engineering/workflow-v2/omo-evaluator.md`

### OMO-03-001

- status: `monitoring`
- boundary: `mixed`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `slice03 pilot retention / Stage 4~6`
- symptom: 첫 product OMO-lite pilot slice03은 merged 상태지만, 현재 machine에는 canonical `omo-lite-dispatch` / supervisor artifact가 남아 있지 않고 runtime은 `.artifacts/tmp/claude-cli-provider-dogfood/...`를 마지막 artifact로 가리킨다. `codex_primary.session_id`도 비어 있어 product 결과는 남았지만 replayable 운영 흔적은 부분적으로만 보존됐다.
- current_recovery: off-repo artifact 회수 대신 `artifact-missing accepted` disposition을 기록했다. 현재 retained surrogate evidence는 `docs/workpacks/03-recipe-like/omo-lite-notes.md`, `.opencode/omo-runtime/03-recipe-like.json`, `.workflow-v2/status.json`이다. 즉 original artifact gap은 historical limitation으로 남기고, 현재 promotion/retrospective 판단은 repo-local surrogate evidence 기준으로 이어간다.
- root_cause_hypothesis: 초기 product pilot이 canonical repo-local artifact surface보다 dogfood / tmp execution surface에 더 의존했고, recovery history를 runtime/registry로 승격하는 규칙이 없었다.
- evidence_refs:
  - `.opencode/omo-runtime/03-recipe-like.json`
  - `docs/workpacks/03-recipe-like/omo-lite-notes.md`
  - `.workflow-v2/status.json`

### OMO-04-001

- status: `monitoring`
- boundary: `omo-system`
- bucket: `C. Supervisor Contract Reset`
- stage_scope: `Stage 4 implementation / salvage`
- symptom: slice04는 frontend implementation에서 `stage-result.json` 미작성으로 `human_escalation`에 빠졌고, 이후에는 같은 lane에서 `Worktree is dirty.` escalation이 반복됐다. merged 결과는 남았지만 implementation 종료 조건과 salvage 경로가 deterministic하지 않았다.
- current_recovery: 현재 contract reset의 active surface는 `OMO-07-004`와 replayed `OMO-07-001`이 더 직접적으로 대표한다. 이 incident는 pre-reset contract failure seed로 유지한다.
- root_cause_hypothesis: implementation execute success가 stage-result emission과 clean worktree를 충분히 강제하지 못했고, dirty salvage는 supervisor의 정상 전이보다 operator 판단에 더 많이 의존했다.
- evidence_refs:
  - `.artifacts/omo-supervisor/2026-03-27T12-03-26-188Z-04-recipe-save/summary.json`
  - `.artifacts/omo-supervisor/2026-03-27T13-25-35-515Z-04-recipe-save/summary.json`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-04-recipe-save.log`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-04-recipe-save.err.log`

### OMO-05-001

- status: `monitoring`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `Stage 2 bootstrap -> Stage 6 closeout`
- symptom: slice05는 product logic와 무관한 supervisor-side escalation을 연속으로 밟았다. `gh auth status failed`, `master is already checked out`, `spawnSync opencode ENOENT`, 반복되는 `Required checks failed`, `Supervisor verify commands failed`, Stage 6 dirty worktree salvage, `claude CLI failed` partial stage failure가 모두 같은 slice 안에서 누적됐다.
- current_recovery: control-plane smoke replay와 newer runtime incidents(`OMO-07-003`, `OMO-07-007`)가 현재 active surface를 더 직접적으로 대표한다. 이 incident는 broad supervisor fragility의 seed evidence로 유지한다.
- root_cause_hypothesis: supervisor가 host auth/base branch/binary availability/verify environment를 지나치게 낙관적으로 가정했고, dirty salvage와 verify failure를 operator 수습에 맡겼다.
- evidence_refs:
  - `.artifacts/omo-supervisor/2026-03-31T15-37-48Z-05-planner-week-core-stage-2-reset-snapshot/runtime-before-reset.json`
  - `.artifacts/omo-supervisor/2026-03-31T15-37-48Z-05-planner-week-core-stage-2-reset-snapshot/recovery.patch`
  - `.artifacts/omo-supervisor/2026-03-31T17-34-44-530Z-05-planner-week-core/summary.json`
  - `.artifacts/omo-supervisor/2026-03-31T18-09-39-989Z-05-planner-week-core/summary.json`
  - `.artifacts/omo-supervisor/2026-03-31T19-05-25-606Z-05-planner-week-core/summary.json`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-05-planner-week-core.err.log`

### OMO-06-001

- status: `closed-by-replay`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `Stage 6 closeout`
- symptom: authority-required pilot slice06은 merged 됐지만 tracked status notes에는 `merged_after_manual_stage6_handoff`가 남아 있고, local `omo-tick` 로그는 `blocked_retry (retry_not_due)` 반복, `run -> human_escalation`, `unsupported_wait_kind=human_escalation`, `skip_locked -> none`을 보여준다. 즉 대표 pilot lane이 autonomous closeout이 아니라 repeated recovery 후 manual handoff로 끝났다.
- current_recovery: post-reset slice06 authority replay에서 closeout/bookkeeping/authority validators가 green으로 통과했고, repo-local audit bundle `.artifacts/meta-harness-auditor/slice06-replay/report.md`와 replay ledger `.workflow-v2/replay-acceptance.json`에 lane `pass`를 남겼다. 이번 replay에서는 runtime JSON 수동 편집, stale lock 수동 해제, stale CI snapshot 수동 보정이 필요하지 않았다.
- root_cause_hypothesis: authority-required lane이 human_escalation/locked 상태에 들어간 뒤 scheduler resume과 closeout recovery를 deterministic하게 이어가지 못했고, manual handoff가 실제 completion path가 됐다.
- evidence_refs:
  - `.workflow-v2/status.json`
  - `.workflow-v2/promotion-evidence.json`
  - `.workflow-v2/replay-acceptance.json`
  - `.artifacts/meta-harness-auditor/slice06-replay/report.md`
  - `docs/engineering/workflow-v2/replay-slice06-authority.md`
  - `ui/designs/authority/authority-report-06-recipe-to-planner.md`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-06-recipe-to-planner.log`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-06-recipe-to-planner.err.log`
  - `docs/engineering/workflow-v2/slice06-pilot-checklist.md`

### OMO-06-002

- status: `closed-by-replay`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `slice06 local artifact retention / scheduler path`
- symptom: promotion ledger는 `.artifacts/meta-harness-auditor/slice06-stage6/report.md`와 `/private/tmp/homecook-slice06-omo-run/.artifacts/omo-evaluator/...`를 canonical evidence처럼 참조하지만, 현재 machine에는 해당 bundle과 tmp worktree가 없다. 대신 남아 있는 것은 `Cannot find module '/private/tmp/homecook-slice06-omo-run/scripts/omo-tick.mjs'` 로그뿐이다.
- current_recovery: representative replay를 repo-local artifact 기준으로 다시 수행해 `.artifacts/meta-harness-auditor/slice06-replay/` bundle과 `.workflow-v2/replay-acceptance.json` lane evidence를 남겼다. 과거 tmp worktree artifact는 여전히 historical gap이지만, 현재 Phase 8 replay acceptance는 ephemeral tmp path 없이 repo-local canonical evidence로 재생 가능해졌다. 따라서 historical tmp/stage6 ref는 breadcrumb로만 남기고 current retained proof는 replay bundle 쪽으로 읽는다.
- root_cause_hypothesis: slice06 checkpoint evidence가 ephemeral tmp worktree 경로에 묶였고, promotion/cutover 전에 repo-local canonical artifact storage로 승격되지 않았다.
- evidence_refs:
  - `.workflow-v2/work-items/06-recipe-to-planner.json`
  - `.workflow-v2/promotion-evidence.json`
  - `.workflow-v2/replay-acceptance.json`
  - `.artifacts/meta-harness-auditor/slice06-replay/report.md`
  - `docs/engineering/workflow-v2/replay-slice06-authority.md`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-06-recipe-to-planner.err.log`
  - `docs/engineering/workflow-v2/slice06-pilot-checklist.md`

### OMO-07-001

- status: `closed-by-replay`
- boundary: `omo-system`
- bucket: `C. Supervisor Contract Reset`
- stage_scope: `Stage 1 / internal 1.5 / Stage 2`
- symptom: `stage-result.json` 미작성, rebuttal alias mismatch, semantic incomplete result 제출이 반복됐다.
- current_recovery: post-reset slice07 fullstack replay에서 slice-specific unit/E2E regression, targeted supervisor harness regression, closeout/bookkeeping validators를 다시 실행해 representative replay evidence를 repo-local surface에 남겼다. 이번 replay에서는 runtime JSON 수동 편집, stale lock 수동 해제, stale CI snapshot 수동 보정이 필요하지 않았고, replay ledger `.workflow-v2/replay-acceptance.json`에 lane `pass`를 기록했다.
- root_cause_hypothesis: stage-result contract가 stage type별로 충분히 작고 명확하지 않으며 alias normalization과 semantic completeness 검사 시점이 늦다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `.artifacts/meta-harness-auditor/slice07-replay/report.md`
  - `.workflow-v2/replay-acceptance.json`
  - `docs/engineering/workflow-v2/replay-slice07-fullstack.md`
  - `docs/engineering/workflow-v2/omo-evaluator.md`
  - `scripts/lib/omo-stage-result.mjs`

### OMO-07-002

- status: `monitoring`
- boundary: `omo-system`
- bucket: `B. Canonical State Reduction`
- stage_scope: `internal 1.5 / closeout bookkeeping`
- symptom: stage-owned bookkeeping 파일인데 dirty blocker로 잘못 escalate되거나, `Design Status` ambiguity처럼 multi-surface drift가 invariant failure로 이어졌다.
- current_recovery: closeout projection mode 정리와 `design_status_ambiguous -> repairable drift` classifier 보강이 merge됐다. 현재는 같은 family가 replay 없이 다시 열리는지 관찰하는 단계라 `monitoring`으로 내린다.
- root_cause_hypothesis: stage-owned writable scope와 canonical closeout projection이 분리돼 있지 않다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`
  - `scripts/lib/omo-bookkeeping.mjs`

### OMO-07-003

- status: `open`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `Stage 2 / Stage 4 authority_precheck`
- symptom: background task 대기 중 run 종료, stale lock, `skip_locked -> none`, runtime `stage_running` residue가 발생했다.
- current_recovery: runtime을 수동으로 `stage_result_ready`로 복구하거나 stale lock을 직접 풀었다.
- root_cause_hypothesis: runtime state machine이 실제 actor lifecycle과 맞지 않고, stale/live 판단에 필요한 heartbeat와 process visibility가 부족하다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `scripts/lib/omo-session-runtime.mjs`
  - `scripts/lib/omo-autonomous-supervisor.mjs`

### OMO-07-004

- status: `monitoring`
- boundary: `omo-system`
- bucket: `C. Supervisor Contract Reset`
- stage_scope: `Stage 4 implementation / authority_precheck`
- symptom: authority precheck 산출물이 Stage 4 implementation checklist snapshot을 계승하지 않아 다시 `human_escalation`이 발생했다.
- current_recovery: authority_precheck가 prior Stage 4 implementation snapshot을 runtime/artifact 양쪽에서 deterministic하게 계승하도록 contract와 테스트를 보강했다. 현재는 replay 전 단계이므로 `monitoring`으로 유지한다.
- root_cause_hypothesis: authority precheck가 delta evidence를 내는 subphase인지, full closeout snapshot을 내는 stage인지 contract가 불명확하다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `tests/omo-lite-runner.test.ts`
  - `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`

### OMO-07-005

- status: `monitoring`
- boundary: `omo-system`
- bucket: `E. PR / CI Integration Reset`
- stage_scope: `Stage 4 PR preparation / Policy CI`
- symptom: PR body evidence가 canonical closeout state에서 자동 투영되지 않아 policy fail이 발생했고, body edit만으로는 policy가 재실행되지 않아 no-op commit recovery가 필요했다.
- current_recovery: current-head recovery 경로에서 PR body projection replay를 no-op commit 없이 유지하도록 보강했고, 관련 supervisor 회귀 테스트를 추가했다. 추가 audit/replay 전까지는 `monitoring`으로 유지한다.
- root_cause_hypothesis: PR body가 canonical projection이 아니라 fragile handwritten artifact로 남아 있고, policy rerun semantics도 body-only recovery 경로를 충분히 지원하지 않는다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `.github/pull_request_template.md`
  - `scripts/lib/omo-github.mjs`

### OMO-07-006

- status: `monitoring`
- boundary: `omo-system`
- bucket: `E. PR / CI Integration Reset`
- stage_scope: `Stage 6 / CI wait`
- symptom: 실제 `gh pr checks`는 all green인데 runtime은 계속 `pr_checks_failed` / stale wait 상태를 유지했다.
- current_recovery: live PR summary에서 current head를 다시 읽을 때 wait/pr metadata도 함께 최신 head로 맞추도록 보강했다. stale current-head drift는 줄었지만, auditor rerun 전까지는 `monitoring`으로 본다.
- root_cause_hypothesis: runtime이 current head SHA와 CI snapshot invalidation을 자동 재평가하지 못한다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `scripts/lib/omo-autonomous-supervisor.mjs`

### OMO-07-007

- status: `open`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `in-flight operator visibility`
- symptom: `running`, `stage_running`, stdout/stderr, transcript, stale lock, retry wait를 operator가 즉시 구분하기 어렵다.
- current_recovery: artifact 디렉터리와 runtime JSON을 수동으로 대조했다.
- root_cause_hypothesis: runtime summary가 heartbeat, transcript freshness, live process, recent tool activity를 직접 노출하지 않는다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `.opencode/README.md`

### OMO-07-008

- status: `monitoring`
- boundary: `omo-system`
- bucket: `G. Session / Cost Reset`
- stage_scope: `Stage 4 long-running session`
- symptom: Stage 4 Claude session에서 cache read input이 급증하며 비용이 크게 뛰었다.
- current_recovery: 누적 threshold뿐 아니라 single-run cost spike 기준으로도 session rollover를 권고하도록 telemetry와 runner 정책을 보강했다. 실제 운영 재측정 전까지는 `monitoring`으로 유지한다.
- root_cause_hypothesis: 장수 session reuse와 누적 transcript/subagent context가 Stage 4/5의 문서/테스트/authority workload와 결합해 비용을 폭증시킨다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `.opencode/README.md`

### PROD-07-001

- status: `separated-product-bug`
- boundary: `product-local`
- bucket: `none`
- stage_scope: `Stage 4 frontend E2E`
- symptom: MealScreen authenticated E2E가 login redirect에서 멈췄다.
- current_recovery: auth override를 cookie와 localStorage에 함께 동기화하고 server-side redirect 판정에 override를 반영했다.
- root_cause_hypothesis: client-only auth override가 server redirect보다 늦었다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `app/planner/[date]/[columnId]/page.tsx`
  - `tests/e2e/slice-07-meal-manage.spec.ts`

### OMO-BACKFILL-03-05-001

- status: `monitoring`
- boundary: `mixed`
- bucket: `A. Governance Simplification`
- stage_scope: `slice03~slice05 retrospective`
- symptom: 이번 pass로 slice04/05의 supervisor-side recovery는 formal incident로 끌어올렸지만, slice03은 여전히 pilot note/runtime 잔재 위주여서 canonical artifact replay가 불가능하다.
- current_recovery: slice04/05는 formal incident로 분리했고, slice03은 `artifact-missing accepted` disposition과 repo-local surrogate evidence로 정리했다. 이 incident는 retrospective classification pass가 왜 필요했는지 설명하는 umbrella note로 유지한다.
- root_cause_hypothesis: OMO가 recovery history를 공식 tracked state로 남기지 않았고, 초반 pilot일수록 tmp/dogfood 경로 의존도가 높아 retrospective artifact가 약하다.
- evidence_refs:
  - `.opencode/omo-runtime/03-recipe-like.json`
  - `docs/workpacks/03-recipe-like/omo-lite-notes.md`
  - `.artifacts/omo-supervisor/2026-03-27T12-03-26-188Z-04-recipe-save/summary.json`
  - `.artifacts/omo-supervisor/2026-03-31T15-37-48Z-05-planner-week-core-stage-2-reset-snapshot/recovery.patch`

### OMO-RETRO-003

- status: `open`
- boundary: `omo-system`
- bucket: `F. Auditor / Promotion Reset`
- stage_scope: `promotion default-cutover`
- symptom: `promotion-gate-final-review`는 같은 날 `not-ready`와 `H-OMO-001`을 남겼지만, 이어진 `promotion-gate-default-cutover`는 sampled slices를 `01~03`으로 제한한 채 findings 0 / `ready`를 선언했다. 그 다음날 promotion ledger는 `ready` + `execution_mode=default`로 올라갔고, slice06 manual handoff와 runtime/recovery signal은 cutover 판단에서 사라졌다.
- current_recovery: docs-governance cutover는 positive audit/ledger alignment를 사용했고, incident-aware replay나 slice06 local artifact retention proof는 요구하지 않았다.
- root_cause_hypothesis: promotion audit sampling과 gate logic가 recent incident corpus, unsampled pilot lane, contradictory audit output을 함께 소화하지 못한 채 cutover를 허용했다.
- evidence_refs:
  - `.artifacts/meta-harness-auditor/promotion-gate-final-review/report.md`
  - `.artifacts/meta-harness-auditor/promotion-gate-default-cutover/report.md`
  - `.artifacts/meta-harness-auditor/promotion-gate-final-review/audit-context.json`
  - `.artifacts/meta-harness-auditor/promotion-gate-default-cutover/audit-context.json`
  - `.workflow-v2/promotion-evidence.json`

## Current Active Blocker Set

현재 `not-ready`를 직접 설명하는 incident set은 아래처럼 읽는다.

- promotion / auditor drift
  - `OMO-RETRO-003`
- runtime / observability
  - `OMO-07-003`
  - `OMO-07-007`

`OMO-RETRO-001`, `OMO-RETRO-002`, `OMO-04-001`, `OMO-05-001`은 여전히 중요한 seed evidence지만,
이번 pass에서는 active blocker를 중복 설명하지 않도록 `monitoring`으로 낮춰 historical context 역할에 집중시킨다.

`OMO-03-001`, `OMO-BACKFILL-03-05-001`도 이번 pass에서 `artifact-missing accepted` disposition을 기록했으므로,
더 이상 primary/secondary blocker가 아니라 historical limitation + retrospective context로 본다.

`OMO-07-002`, `OMO-07-004`, `OMO-07-005`, `OMO-07-006`, `OMO-07-008`도 구현/테스트 기준으로는 완화 경로가 merge됐으므로,
현 시점에는 active blocker가 아니라 `monitoring` 대상으로 본다.

## Backfill Queue

아래는 다음 retrospective pass에서 우선 수집할 항목이다.

1. slice06 Stage 6 audit bundle / tmp worktree artifact를 durable repo-local evidence로 회수할 수 있는지 확인
2. OMO promotion `candidate -> ready/default` cutover를 정당화한 docs-governance PR과 그 당시 반대 신호를 같이 묶은 chain 재구성
3. no-op commit, force-push, runtime JSON edit처럼 공식 상태 밖에서 수행된 복구 작업 목록

## Exit Rule For Seed Incidents

seed incident는 아래 둘을 모두 만족할 때만 닫는다.

1. 해당 reset bucket 변경이 merged 됐다.
2. replay acceptance에서 같은 family가 manual patch 없이 재현되지 않았다.

replay 전에는 `merged`가 아니라 `monitoring` 또는 `open`으로 남긴다.
