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

## Seed Incidents

### OMO-RETRO-001

- status: `open`
- boundary: `omo-system`
- bucket: `F. Auditor / Promotion Reset`
- stage_scope: `promotion gate / recurring audit`
- symptom: 과거 audit는 `not-ready`였는데 이후 promotion ledger와 auditor가 `ready`/`findings 0`로 전환되었고, 같은 시점에 slice07 failure corpus는 심각한 runtime/recovery 문제를 보여줬다.
- current_recovery: docs/ledger cutover로 readiness를 상향했고 incident-aware replay gate는 없었다.
- root_cause_hypothesis: auditor와 promotion readiness가 recent incident corpus, runtime anomaly, recovery cost를 입력으로 사용하지 않고 docs/ledger alignment를 과신한다.
- evidence_refs:
  - `.artifacts/meta-harness-auditor/h-omo-001-check/report.md`
  - `.artifacts/meta-harness-auditor/2026-04-20T10-11-50.130Z/report.md`
  - `.workflow-v2/promotion-evidence.json`

### OMO-RETRO-002

- status: `open`
- boundary: `omo-system`
- bucket: `B. Canonical State Reduction`
- stage_scope: `closeout / bookkeeping / reconcile`
- symptom: closeout truth가 README, acceptance, PR body, `.workflow-v2/status.json`에 분산되어 drift가 운영 부담이 됐다.
- current_recovery: reconcile, validator, manual markdown patch를 조합해 slice별로 봉합했다.
- root_cause_hypothesis: authoritative closeout owner가 하나가 아니고 여러 surface가 동시에 writable 하다.
- evidence_refs:
  - `.artifacts/meta-harness-auditor/h-omo-001-check/report.md`
  - `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`
  - `docs/engineering/workflow-v2/omo-evaluator.md`

### OMO-03-001

- status: `backfill-required`
- boundary: `mixed`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `slice03 pilot retention / Stage 4~6`
- symptom: 첫 product OMO-lite pilot slice03은 merged 상태지만, 현재 machine에는 canonical `omo-lite-dispatch` / supervisor artifact가 남아 있지 않고 runtime은 `.artifacts/tmp/claude-cli-provider-dogfood/...`를 마지막 artifact로 가리킨다. `codex_primary.session_id`도 비어 있어 product 결과는 남았지만 replayable 운영 흔적은 부분적으로만 보존됐다.
- current_recovery: 당시에는 pilot note와 merged status를 surrogate evidence로 사용했고, 별도 incident corpus에는 승격되지 않았다.
- root_cause_hypothesis: 초기 product pilot이 canonical repo-local artifact surface보다 dogfood / tmp execution surface에 더 의존했고, recovery history를 runtime/registry로 승격하는 규칙이 없었다.
- evidence_refs:
  - `.opencode/omo-runtime/03-recipe-like.json`
  - `docs/workpacks/03-recipe-like/omo-lite-notes.md`
  - `.workflow-v2/status.json`

### OMO-04-001

- status: `open`
- boundary: `omo-system`
- bucket: `C. Supervisor Contract Reset`
- stage_scope: `Stage 4 implementation / salvage`
- symptom: slice04는 frontend implementation에서 `stage-result.json` 미작성으로 `human_escalation`에 빠졌고, 이후에는 같은 lane에서 `Worktree is dirty.` escalation이 반복됐다. merged 결과는 남았지만 implementation 종료 조건과 salvage 경로가 deterministic하지 않았다.
- current_recovery: operator가 Stage 4/6을 다시 실행하고 dirty worktree 상태를 수동으로 해소하면서 salvage artifact를 따라 merge까지 진행했다.
- root_cause_hypothesis: implementation execute success가 stage-result emission과 clean worktree를 충분히 강제하지 못했고, dirty salvage는 supervisor의 정상 전이보다 operator 판단에 더 많이 의존했다.
- evidence_refs:
  - `.artifacts/omo-supervisor/2026-03-27T12-03-26-188Z-04-recipe-save/summary.json`
  - `.artifacts/omo-supervisor/2026-03-27T13-25-35-515Z-04-recipe-save/summary.json`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-04-recipe-save.log`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-04-recipe-save.err.log`

### OMO-05-001

- status: `open`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `Stage 2 bootstrap -> Stage 6 closeout`
- symptom: slice05는 product logic와 무관한 supervisor-side escalation을 연속으로 밟았다. `gh auth status failed`, `master is already checked out`, `spawnSync opencode ENOENT`, 반복되는 `Required checks failed`, `Supervisor verify commands failed`, Stage 6 dirty worktree salvage, `claude CLI failed` partial stage failure가 모두 같은 slice 안에서 누적됐다.
- current_recovery: operator가 Stage 2 reset snapshot을 남기고 recovery patch를 수동 적용한 뒤 여러 번 rerun했고, 최종적으로는 formal GitHub review + human verification 경로를 거쳐 merge했다.
- root_cause_hypothesis: supervisor가 host auth/base branch/binary availability/verify environment를 지나치게 낙관적으로 가정했고, dirty salvage와 verify failure를 operator 수습에 맡겼다.
- evidence_refs:
  - `.artifacts/omo-supervisor/2026-03-31T15-37-48Z-05-planner-week-core-stage-2-reset-snapshot/runtime-before-reset.json`
  - `.artifacts/omo-supervisor/2026-03-31T15-37-48Z-05-planner-week-core-stage-2-reset-snapshot/recovery.patch`
  - `.artifacts/omo-supervisor/2026-03-31T17-34-44-530Z-05-planner-week-core/summary.json`
  - `.artifacts/omo-supervisor/2026-03-31T18-09-39-989Z-05-planner-week-core/summary.json`
  - `.artifacts/omo-supervisor/2026-03-31T19-05-25-606Z-05-planner-week-core/summary.json`
  - `/Users/cwj/Library/Logs/homecook/omo-tick-05-planner-week-core.err.log`

### OMO-06-001

- status: `monitoring`
- boundary: `omo-system`
- bucket: `D. Runtime / Observability Reset`
- stage_scope: `Stage 6 closeout`
- symptom: authority-required pilot slice06은 merged 됐지만 tracked status notes에 `merged_after_manual_stage6_handoff`가 남아 있다. 즉 대표 pilot lane이 auto-closeout이 아니라 manual handoff를 포함한 상태로 통과했다.
- current_recovery: Stage 6 manual handoff bundle 기반으로 merge했다.
- root_cause_hypothesis: authority-required lane의 운영 품질이 default autonomous baseline보다 낮았는데, lane pass가 곧 autonomous maturity로 해석됐다.
- evidence_refs:
  - `.workflow-v2/status.json`
  - `.workflow-v2/promotion-evidence.json`

### OMO-07-001

- status: `open`
- boundary: `omo-system`
- bucket: `C. Supervisor Contract Reset`
- stage_scope: `Stage 1 / internal 1.5 / Stage 2`
- symptom: `stage-result.json` 미작성, rebuttal alias mismatch, semantic incomplete result 제출이 반복됐다.
- current_recovery: rerun, manual repair, stricter prompt, 후행 validator 보강으로 그때그때 수습했다.
- root_cause_hypothesis: stage-result contract가 stage type별로 충분히 작고 명확하지 않으며 alias normalization과 semantic completeness 검사 시점이 늦다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `docs/engineering/workflow-v2/omo-evaluator.md`
  - `scripts/lib/omo-stage-result.mjs`

### OMO-07-002

- status: `open`
- boundary: `omo-system`
- bucket: `B. Canonical State Reduction`
- stage_scope: `internal 1.5 / closeout bookkeeping`
- symptom: stage-owned bookkeeping 파일인데 dirty blocker로 잘못 escalate되거나, `Design Status` ambiguity처럼 multi-surface drift가 invariant failure로 이어졌다.
- current_recovery: manual bookkeeping correction과 recheck로 복구했다.
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

- status: `open`
- boundary: `omo-system`
- bucket: `C. Supervisor Contract Reset`
- stage_scope: `Stage 4 implementation / authority_precheck`
- symptom: authority precheck 산출물이 Stage 4 implementation checklist snapshot을 계승하지 않아 다시 `human_escalation`이 발생했다.
- current_recovery: 이전 Stage 4 implementation `stage-result`의 checklist snapshot을 authority precheck result에 수동 병합했다.
- root_cause_hypothesis: authority precheck가 delta evidence를 내는 subphase인지, full closeout snapshot을 내는 stage인지 contract가 불명확하다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `tests/omo-lite-runner.test.ts`
  - `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`

### OMO-07-005

- status: `open`
- boundary: `omo-system`
- bucket: `E. PR / CI Integration Reset`
- stage_scope: `Stage 4 PR preparation / Policy CI`
- symptom: PR body evidence가 canonical closeout state에서 자동 투영되지 않아 policy fail이 발생했고, body edit만으로는 policy가 재실행되지 않아 no-op commit recovery가 필요했다.
- current_recovery: QA/eval artifact를 수동 보정해 PR body를 수정하고, no-op commit과 commit message repair로 policy rerun을 유도했다.
- root_cause_hypothesis: PR body가 canonical projection이 아니라 fragile handwritten artifact로 남아 있고, policy rerun semantics도 body-only recovery 경로를 충분히 지원하지 않는다.
- evidence_refs:
  - `.artifacts/omo-findings/slice07-omo-failure-log.md`
  - `.github/pull_request_template.md`
  - `scripts/lib/omo-github.mjs`

### OMO-07-006

- status: `open`
- boundary: `omo-system`
- bucket: `E. PR / CI Integration Reset`
- stage_scope: `Stage 6 / CI wait`
- symptom: 실제 `gh pr checks`는 all green인데 runtime은 계속 `pr_checks_failed` / stale wait 상태를 유지했다.
- current_recovery: current PR head와 runtime의 CI wait snapshot을 수동으로 다시 맞췄다.
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

- status: `open`
- boundary: `omo-system`
- bucket: `G. Session / Cost Reset`
- stage_scope: `Stage 4 long-running session`
- symptom: Stage 4 Claude session에서 cache read input이 급증하며 비용이 크게 뛰었다.
- current_recovery: 즉시 구조 수정 없이 run을 끝내고 사후 분석으로만 남겼다.
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

- status: `backfill-required`
- boundary: `mixed`
- bucket: `A. Governance Simplification`
- stage_scope: `slice03~slice05 retrospective`
- symptom: 이번 pass로 slice04/05의 supervisor-side recovery는 formal incident로 끌어올렸지만, slice03은 여전히 pilot note/runtime 잔재 위주여서 canonical artifact replay가 불가능하다.
- current_recovery: slice04/05는 formal incident로 분리했고, slice03은 current machine 기준 missing-artifact 상태를 그대로 registry에 남긴다.
- root_cause_hypothesis: OMO가 recovery history를 공식 tracked state로 남기지 않았고, 초반 pilot일수록 tmp/dogfood 경로 의존도가 높아 retrospective artifact가 약하다.
- evidence_refs:
  - `.opencode/omo-runtime/03-recipe-like.json`
  - `docs/workpacks/03-recipe-like/omo-lite-notes.md`
  - `.artifacts/omo-supervisor/2026-03-27T12-03-26-188Z-04-recipe-save/summary.json`
  - `.artifacts/omo-supervisor/2026-03-31T15-37-48Z-05-planner-week-core-stage-2-reset-snapshot/recovery.patch`

## Backfill Queue

아래는 다음 retrospective pass에서 우선 수집할 항목이다.

1. slice03 canonical artifact bundle 부재를 `artifact-missing accepted`로 둘지, 별도 off-repo evidence 회수를 시도할지 결정
2. slice06 Stage 4~6 manual handoff의 실제 blocker와 operator action sequence
3. OMO promotion `candidate -> ready` cutover를 정당화한 docs-governance PR과 그 당시 반대 신호
4. no-op commit, force-push, runtime JSON edit처럼 공식 상태 밖에서 수행된 복구 작업 목록

## Exit Rule For Seed Incidents

seed incident는 아래 둘을 모두 만족할 때만 닫는다.

1. 해당 reset bucket 변경이 merged 됐다.
2. replay acceptance에서 같은 family가 manual patch 없이 재현되지 않았다.

replay 전에는 `merged`가 아니라 `monitoring` 또는 `open`으로 남긴다.
