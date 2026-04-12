# Local Worktree OMO Autonomous Supervisor

## Status

- 이 문서는 `generic session-orchestrator` 위에 얹는 `local autonomous supervisor` 규격을 고정한다.
- 현재 executable baseline은 `omo:supervise`, `omo:tick`, dedicated worktree manager, `gh` automation, `omo:status`, `omo:status:brief`까지 포함한다.
- hardening baseline은 `omo:smoke:control-plane`, `omo:smoke:providers`, `omo:scheduler:install/uninstall/verify`까지 포함한다.
- `omo:start`, `omo:continue`, `omo:resume-pending`은 low-level primitive로 남고, product slice full-autonomy는 supervisor state machine이 담당한다.
- fullauto v1은 low/medium autonomous slice에 대해 Stage 1~6 무인 merge까지 포함하는 의미로 고정한다.

## Purpose

autonomous supervisor는 stage 실행 자체보다 `stage 사이의 운영 전이`를 책임진다.

역할:

- work item별 전용 git worktree를 만든다.
- stage 실행 후 branch / push / PR / CI / merge를 자동화한다.
- autonomous low/medium product PR은 Stage 3 / 6 approve 뒤 `external smoke + current head 전체 checks green`을 통과하면 즉시 merge한다.
- Claude와 Codex가 같은 session ID를 유지한 채 다음 stage로 넘어가게 한다.
- Stage 1 merge 뒤 Stage 2 implementation 전에 supervisor-only `internal 1.5` doc gate를 실행한다.
- Claude-owned stage는 기본적으로 `claude-cli`, Codex-owned stage는 계속 `OpenCode`를 사용한다.
- scheduler tick이 다시 깨워야 하는 대기 조건을 runtime state에 남긴다.
- 실패 시 silent recovery 대신 `blocked` 또는 `human_escalation`으로 fail-closed 한다.

즉, session-orchestrator가 `한 stage를 같은 session으로 실행`하는 코어라면,
autonomous supervisor는 `그 stage 결과를 다음 GitHub 상태와 다음 stage 진입으로 연결`하는 코어다.

## Public Interface

새 상위 명령:

- `pnpm omo:supervise -- --work-item <id>`
- `pnpm omo:tick -- --all`
- `pnpm omo:tick -- --work-item <id>`
- `pnpm omo:reconcile -- --work-item <id>`
- `pnpm omo:tick:watch -- --work-item <id>`
- `pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name>`
- `pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name> --live-providers`
- `pnpm omo:smoke:providers`
- `pnpm omo:scheduler:install -- --work-item <id>`
- `pnpm omo:scheduler:uninstall -- --work-item <id>`
- `pnpm omo:scheduler:verify -- --work-item <id>`

기존 low-level 명령:

- `pnpm omo:start`
- `pnpm omo:continue`
- `pnpm omo:resume-pending`
- `pnpm omo:status`
- `pnpm omo:status:brief`

원칙:

1. `omo:supervise`는 한 work item을 가능한 만큼 전진시킨다.
2. `omo:tick`은 scheduler resume entrypoint다.
3. 사용자는 stage 번호, session ID, PR 번호, retry timer를 직접 맞춰 넣지 않는다.
4. 기존 low-level 명령은 디버깅과 manual recovery용 primitive로 유지한다.
5. Claude provider 기본값은 `claude-cli`이며, `opencode`는 emergency override다.
6. kickoff는 `omo:supervise`만 담당한다.
7. `omo:tick -- --work-item <id>`는 kickoff를 하지 않고 existing runtime의 unfinished action만 재개한다.
8. runtime이 없으면 `omo:tick`은 `noop: missing_runtime`을 반환한다.
9. runtime은 있지만 `wait`와 pending phase가 모두 없으면 `omo:tick`은 `noop: no_wait_state`를 반환한다.
10. 운영자가 현재 단계와 대기 상태를 빠르게 읽을 때는 `omo:status:brief`를 사용한다.
11. scheduler가 실제로 등록되어 있는지, 현재 running인지, 마지막 로그 갱신 시각이 언제인지는 `omo:tick:watch`로 읽는다.
12. live smoke는 sandbox GitHub repo와 실제 provider/auth 상태를 사용하며, autonomous merge gate를 검증한다.
13. `--live-providers` 모드의 backend smoke contract는 Stage 2/3만 실제 provider를 사용한다. Stage 3 첫 리뷰를 강제로 `request_changes`로 만들고, Codex Stage 2 재실행에는 최소 확인용 prompt만 주입해 같은 feedback token이 실제 marker file에 반영되는지까지 검증한다.
14. `omo:scheduler:verify`는 `launchctl print`와 `omo:tick:watch --json`을 비교해 label, interval, log path를 함께 점검한다.

## Bookkeeping Invariants

공식 external bookkeeping의 canonical source는 다음 두 파일이다.

- `docs/workpacks/README.md`의 Slice Order Status
- `docs/workpacks/<slice>/README.md`의 Design Status

runtime과 `.workflow-v2/*`는 orchestration state이며, official docs와 drift가 나면 official docs를 기준으로 복구한다.

고정 invariant:

1. Stage 2 finalize 이후 slice status는 최소 `in-progress`여야 한다.
2. Stage 5 approve 이후 frontend slice의 Design Status는 `confirmed`여야 한다.
3. Stage 6 closeout 이후 slice status는 반드시 `merged`여야 한다.
4. runtime `phase=done` 또는 workflow-v2 `lifecycle=merged`인데 roadmap이 `merged`가 아니면 post-merge drift다.
5. active slice drift가 현재 branch에서 docs-only로 안전하게 반영 가능하면 supervisor가 먼저 bookkeeping commit/push를 수행하고 계속 진행한다.
6. drift source가 모호하거나 docs-only가 아니면 `human_escalation`으로 fail-closed 한다.
7. 이미 merge된 뒤 발견된 safe docs-only drift는 `omo:reconcile`이 closeout PR로 복구한다.

## Dedicated Worktree Policy

기본 작업공간은 현재 IDE worktree가 아니라 `work item 전용 worktree`다.

기본 경로:

- `.worktrees/<work-item-id>`

원칙:

1. supervisor는 work item 시작 시 전용 worktree가 없으면 생성한다.
2. 같은 work item은 같은 worktree를 계속 재사용한다.
3. Stage 1은 `docs/<slice>`, Stage 2는 `feature/be-<slice>`, Stage 4는 `feature/fe-<slice>`를 같은 worktree 안에서 순서대로 checkout 한다.
4. worktree 생성과 다음 branch checkout의 기준점은 local `master`가 아니라 `origin/master`다.
5. merge 직후에는 항상 `origin/master`를 fetch하고 worktree를 `origin/master` detached 상태로 되돌린 뒤 다음 branch를 만든다.
6. 현재 IDE worktree는 supervisor가 건드리지 않는다.

## Stage Result Contract

stage 실행 결과는 supervisor가 읽을 수 있는 구조화된 결과를 남겨야 한다.

코드 stage (Stage 1 / 2 / 4) 최소 필드:

- `result`: `done | blocked`
- `summary_markdown`
- `pr.title`
- `pr.body_markdown`
- `commit.subject`
- `commit.body_markdown` optional
- `checks_run[]`
- `next_route`: `open_pr | wait_for_ci | blocked`
- `claimed_scope`
- `changed_files[]`
- `tests_touched[]`
- `artifacts_written[]`
- `checklist_updates[]`
  - `id`
  - `status`
  - `evidence_refs[]`
- `contested_fix_ids[]`
- `rebuttals[]`
  - `fix_id`
  - `rationale_markdown`
  - `evidence_refs[]`

Stage 4 `authority_precheck` subphase는 위 code-stage contract를 유지하되 아래 authority 필드를 추가로 남긴다.

- `authority_verdict`: `pass | conditional-pass | hold`
- `reviewed_screen_ids[]`
- `authority_report_paths[]`
- `evidence_artifact_refs[]`
- `blocker_count`
- `major_count`
- `minor_count`

리뷰 stage (Stage 3 / 5 / 6) 최소 필드:

- `decision`: `approve | request_changes | blocked`
- `body_markdown`
- `route_back_stage`
- `approved_head_sha`
- `review_scope`
- `reviewed_checklist_ids[]`
- `required_fix_ids[]`
- `waived_fix_ids[]`
- `authority_verdict` optional — Stage 5 authority-required slice에서 필수
- `reviewed_screen_ids[]` optional — Stage 5 authority-required slice에서 필수
- `authority_report_paths[]` optional — Stage 5 authority-required slice에서 필수
- `blocker_count` / `major_count` / `minor_count` optional — Stage 5 authority-required slice에서 필수
- `findings[]` optional — 문제가 있을 경우 반드시 포함:
  - `file`: 문제 파일 경로
  - `line_hint`: 해당 라인 번호 (optional)
  - `severity`: `critical | major | minor`
  - `category`: `contract | tests | scope | logic | style`
  - `issue`: 문제 설명
  - `suggestion`: 수정 제안

핑퐁 협업 원칙:

- supervisor는 리뷰 결과의 `findings[]`를 `last_review.<role>.findings`에 저장한다.
- supervisor는 `review_scope`, `reviewed_checklist_ids`, `required_fix_ids`, `waived_fix_ids`도 `last_review.<role>`에 저장한다.
- supervisor는 Codex rebuttal bundle을 `last_rebuttal.<role>`에 저장한다.
- Stage 2/4 재실행 시, `findings[]`가 있으면 prompt에 "## Structured Findings from Prior Review" 섹션으로 주입한다.
- Stage 2/4 재실행 시, `required_fix_ids[]`가 있으면 prompt에 "## Required Checklist Fix IDs" 섹션으로 같이 주입한다.
- Stage 3/5/6 재리뷰 시, latest rebuttal bundle이 있으면 prompt에 같이 주입한다.
- Stage 3/5 실행 시, 이전 code stage의 `stage-result.json` 경로를 `required_reads`에 주입해 Claude가 Codex의 의도를 읽고 리뷰한다.

원칙:

1. PR title/body는 stage agent가 만들고 supervisor는 검증 및 제출만 한다.
2. review body는 GitHub review/comment에 그대로 연결 가능한 수준으로 구조화한다.
3. review feedback 본문은 runtime `last_review.<role>.body_markdown`에 저장하고, Stage 2/4 재실행 prompt에 다시 주입한다.
4. supervisor는 structured result가 없거나 불완전하면 자동 진행 대신 fail-closed 한다.
4. code stage의 success는 `clean branch state + valid stage-result 작성`까지다.
5. PR 생성, Ready 전환, CI polling, merge는 supervisor 책임이다.
6. code stage의 git commit/push ownership도 supervisor가 가진다.
7. Stage 2 finalize는 `docs/workpacks/README.md` Slice Status `docs -> in-progress`를, Stage 4 finalize는 Design Status `temporary -> pending-review`를 함께 반영한다.
8. `docs/workpacks/<slice>/automation-spec.json`이 있는 product slice는 README `Delivery Checklist`와 acceptance checkbox metadata contract를 strict mode로 사용한다.
9. strict mode에서는 Stage 2/4가 자신의 stage-owned checklist id만 `checklist_updates[]`로 기록할 수 있고, Stage 3/5/6은 자신의 review scope 전체를 `reviewed_checklist_ids[]`로 기록해야 한다.
10. Codex는 `required_fix_ids[]`에 대해 `contested_fix_ids[]`와 `rebuttals[]`로 구조적 반박을 제출할 수 있다.
11. Claude가 rebuttal을 수용하면 해당 checklist id를 `waived_fix_ids[]`에 넣고, supervisor가 markdown metadata waiver comment를 반영한다.
12. Stage 2/4는 strict slice에서 `$ralph` skill 기반 loop를 기본 실행 표면으로 사용한다.
13. authority-required frontend slice는 Stage 4 구현 뒤 Codex-owned `authority_precheck` subphase를 먼저 통과해야 한다.
14. `authority_precheck`는 최종 authority가 아니라 mobile UX evidence와 blocker 구조화를 담당하는 preflight gate다.
15. Stage 5는 Claude final authority다. `authority_verdict=pass`와 blocker 0개가 아니면 `confirmed`를 줄 수 없다.
16. `high-risk` / `anchor-extension` slice는 stage execution은 허용하지만 automatic merge는 금지하고 manual merge handoff로 종료한다.
17. Stage 5 approve 뒤에는 supervisor가 Design Status `confirmed` bookkeeping commit/push를 수행할 수 있다.
18. Stage 6 approve 뒤에는 frontend PR에 slice status `merged` bookkeeping commit/push를 반영하고, 그 CI와 external smoke가 끝나면 자동 merge한다. 단 manual merge handoff slice는 auto-merge 대신 human escalation으로 끝낸다.
19. legacy artifact에서 `commit.subject`가 없으면 migration 경로에서만 `pr.title`을 commit subject로 fallback 한다.

## Internal 1.5

public stage numbering은 계속 `1~6`을 유지한다.
`internal 1.5`는 Stage 1 merge 이후, Stage 2 implementation 전에만 실행되는 supervisor-only subphase다.

순서:

1. `doc_gate_check`
2. `doc_gate_repair`
3. `doc_gate_review`
4. `doc_gate_recheck`

원칙:

1. `doc_gate_check`는 `README.md`, `acceptance.md`, `automation-spec.json`이 구현을 시작해도 되는 수준으로 잠겼는지 deterministic하게 판단한다.
2. 결과는 `pass | fixable | blocked`로 정규화한다.
3. `fixable`이면 Codex가 docs-only remediation을 수행한다.
4. docs-only remediation의 허용 파일은 아래 세 개로 고정한다.
   - `docs/workpacks/<slice>/README.md`
   - `docs/workpacks/<slice>/acceptance.md`
   - `docs/workpacks/<slice>/automation-spec.json`
5. `doc_gate_repair`는 `docs/<slice>-repair` 브랜치에서만 수행한다.
6. `doc_gate_review`는 Claude가 같은 `claude_primary` 세션으로 수행한다.
7. docs repair PR은 `doc_gate_review approve` 전에는 merge하지 않는다.
8. docs repair PR이 main에 merge되고 `doc_gate_recheck`가 다시 `pass`가 나와야만 Stage 2 implementation을 시작한다.
9. docs review ping-pong은 최대 3회까지만 허용한다. 초과 시 `human_escalation`으로 fail-closed 한다.
10. `claude_primary`는 `Stage 1 -> doc_gate_review -> Stage 3/5/6`, `codex_primary`는 `doc_gate_repair -> Stage 2/4`로 계속 재사용한다.

## Internal 6.5

public stage numbering은 계속 `1~6`을 유지하고, `internal 6.5`는 Stage 6 approve 뒤 merge 직전에만 실행되는 supervisor-only closeout reconcile subphase로 둔다.

순서:

1. `closeout_reconcile_check`
2. `closeout_reconcile_repair`
3. `closeout_reconcile_recheck`

원칙:

1. `closeout_reconcile_check`는 `pnpm validate:closeout-sync`, `pnpm validate:source-of-truth-sync`, `pnpm validate:exploratory-qa-evidence`를 묶어 실행한다.
2. 결과는 `pass | fixable | blocked`로 정규화한다.
3. `fixable`은 slice-local closeout drift만 의미한다. 현재 executable baseline의 허용 범위는 해당 slice의 `README.md`, `acceptance.md`, `automation-spec.json`과 merged bookkeeping이다.
4. repo-wide governing doc drift, validator/tooling 코드 변경, 공식 문서 버전 전파 문제는 `blocked`로 올리고 별도 docs-governance PR로 분리한다.
5. `closeout_reconcile_repair`는 product contract를 바꾸지 않고 closeout bookkeeping과 evidence references만 고친다.
6. exploratory QA가 required인 slice에서 evidence가 비어 있으면 merge 대신 fail-closed 한다. 현재 baseline은 existing frontend PR body 또는 local QA artifact bundle을 evidence source로 사용한다.
7. `closeout_reconcile_recheck`가 다시 `pass`가 나와야만 merge로 진행한다.
8. repair 후에도 같은 drift가 남아 recheck가 다시 fail하면 자동 merge 대신 `human_escalation`으로 fail-closed 한다.
9. `pnpm omo:reconcile -- --work-item <id>`의 dedicated closeout PR 경로도 같은 validator bundle과 safe repair policy를 재사용한다.
10. supervisor baseline은 Stage 6 approve 뒤 같은 frontend PR branch에서 `check -> repair -> recheck`를 수행하고, recheck 통과 후에만 `merge_pending` CI gate로 진입한다.

## Runtime State Machine

runtime state는 더 이상 “마지막 stage 번호 몇 번”만 저장하지 않고, 재시작 가능한 상태 머신을 가진다.

핵심 필드:

- `active_stage`
- `phase`
- `next_action`
- `execution`

`phase` 값:

- `stage_running`
- `stage_result_ready`
- `verify_pending`
- `commit_pending`
- `push_pending`
- `pr_pending`
- `wait`
- `review_pending`
- `closeout_reconcile_check`
- `closeout_reconcile_repair`
- `closeout_reconcile_recheck`
- `merge_pending`
- `escalated`
- `done`

`next_action` 값:

- `run_stage`
- `finalize_stage`
- `poll_ci`
- `run_review`
- `merge_pr`
- `noop`

`execution` 최소 필드:

- `provider`
- `session_role`
- `session_id`
- `artifact_dir`
- `stage_result_path`
- `started_at`
- `finished_at`
- `verify_commands`
- `verify_bucket`
- `commit_sha`
- `pr_role`

원칙:

1. `current_stage`는 호환성을 위해 남기되 `active_stage`의 mirror로 취급한다.
2. `last_completed_stage`는 stage agent가 끝났다고 바로 올리지 않는다.
3. code stage는 `verify -> commit -> push -> PR 생성 -> wait.kind=ci`까지 끝나야 완료로 본다.
4. review stage는 review 기록과 route/human gate 후처리까지 끝나야 완료로 본다.
5. `omo:tick`은 `wait.kind`뿐 아니라 `phase`를 보고 unfinished action을 재개한다.

legacy migration 규칙:

- `wait=null`, valid `stage-result.json`, active PR 없음 -> `phase=stage_result_ready`
- dirty worktree + valid stage-result -> `phase=stage_result_ready`
- dirty worktree + no stage-result -> `phase=escalated` + `recovery`

## GitHub Automation Boundary

GitHub 자동화는 `gh CLI`만 사용한다.

허용 명령:

- `gh pr create`
- `gh pr edit`
- `gh pr ready`
- `gh pr checks --json`
- `gh pr review`
- `gh pr comment`
- `gh pr merge --merge --match-head-commit`
- `gh pr update-branch`

규칙:

1. docs PR는 일반 PR로 생성한다.
2. backend / frontend PR는 Draft로 생성하고 required checks green 뒤에만 `gh pr ready`를 호출한다.
   merge 판단은 required subset이 아니라 current head 기준 시작된 PR checks 전체를 사용한다.
3. Stage 3 / 5 / 6 review 결과는 PR comment로 기록한다.
4. merge authority는 GitHub review 상태가 아니라 supervisor가 읽는 structured review artifact다.
5. merge는 기본 `merge commit`만 사용한다.
6. merge 직전 head SHA를 고정하고 drift가 있으면 다시 판단한다.
7. base drift가 clean update 가능한 경우에만 `gh pr update-branch`를 한 번 시도한다.
8. force-push, auto-rebase, silent branch recreation은 금지한다.
9. 기존 PR을 재사용하는 경우에도 title/body는 supervisor가 `gh pr edit`로 최신 stage result에 맞춰 정렬할 수 있다.
10. autonomous low/medium product backend/frontend PR은 GitHub formal approval을 merge gate로 사용하지 않는다. Claude의 structured review artifact를 공식 approval 신호로 사용한다.
11. autonomous low/medium product backend/frontend PR은 current head 기준 전체 PR checks green + Claude approve artifact + external smoke pass 뒤 자동 merge한다.
12. `merge_pending` 상태에서 `mergePullRequest` 실행 직전 supervisor는 반드시 `stageResult.decision === "approve"`를 코드 수준에서 단언한다. 이 조건이 충족되지 않으면 `blockWithRecovery`로 escalate하며 절대 merge를 실행하지 않는다.

## Wait And Scheduler Contract

autonomous supervisor는 장시간 살아 있는 sleep 프로세스를 기본 경로로 두지 않는다.

runtime state는 아래 대기 이유를 저장할 수 있어야 한다.

- `wait.kind = ci`
- `wait.kind = blocked_retry`
- `wait.kind = ready_for_next_stage`
- `wait.kind = human_escalation`

원칙:

1. `omo:tick`은 runtime state가 있는 work item만 스캔한다.
2. `omo:tick -- --all`은 lock이 없는 항목만 순회한다.
3. 기본 cadence는 `10 minutes`다.
4. Claude retry delay는 기존 `5 hours`를 유지한다.
5. `blocked_retry`가 due 되지 않았으면 no-op로 끝난다.
6. due 이후에는 같은 Claude session ID로 재개한다.
7. `tick -- --work-item <id>`는 kickoff를 하지 않고 existing wait만 재개한다.
8. locked item은 전체 tick을 실패시키지 않고 skip 결과로 남긴다.
9. launchd/cron에서 `pnpm`, `gh`, `claude`, `opencode`를 실행할 때는 절대경로 또는 고정 PATH를 사용한다.
10. active pilot 동안 루트 repo는 `ops/omo-<slice>-runtime-anchor` 같은 운영 브랜치에 두는 것을 기본값으로 권장한다.
11. `tick -- --work-item <id>`는 `phase=stage_result_ready | verify_pending | commit_pending | push_pending | pr_pending | merge_pending`도 재개 대상으로 본다.
12. code stage auto-finalize는 `valid stage-result + supervisor verify pass`일 때만 진행한다.
13. `omo:tick`은 `ci`, `blocked_retry`, `ready_for_next_stage`를 scheduler 재개 대상으로 처리해 autonomous merge 이후 후속 상태 전이를 계속 수행한다.
14. approval-required branch protection이 남아 있으면 supervisor는 merge를 강행하지 않고 blocked로 종료한다.
15. closeout PR는 `wait.kind=ci`, `pr_role=closeout`으로 추적한다.
16. closeout PR의 current head 기준 started PR checks가 모두 green이면 상태는 `ready_for_review`를 유지하고, merge 후 다음 `omo:tick`이 closeout finalize를 수행한다.
17. macOS launchd install/uninstall/verify는 저장소가 관리하는 템플릿과 CLI로 제공한다.

## Fail-Closed Rules

아래 경우에는 자동 진행 대신 멈춘다.

- stored session missing / invalid
- `gh auth` 없음
- `opencode` auth 없음
- worktree dirty
- active slice bookkeeping drift가 ambiguous
- PR body validation 실패
- push reject
- started PR checks fail
- external smoke fail
- merge conflict
- review ping-pong 반복 초과

이때 supervisor는:

1. `.workflow-v2/status.json`을 `blocked` 또는 `human_escalation`으로 맞춘다.
2. runtime state에 대기 이유를 남긴다.
3. `.artifacts/omo-supervisor/*` 아래에 blocker artifact를 남긴다.

## Assisted Recovery

부분 성공 후 structured stage result만 빠진 경우에도 supervisor는 자동 salvage를 하지 않는다.

대상:

- `stage-result missing + dirty worktree`
- `contract_violation after code changes`
- `partial success with salvage candidate`

원칙:

1. 위 경우에는 `wait.kind = human_escalation`으로 멈춘다.
2. runtime state에 `recovery` snapshot을 남긴다.
3. recovery snapshot은 최소한 아래를 포함한다.
   - `kind`
   - `stage`
   - `branch`
   - `reason`
   - `artifact_dir`
   - `changed_files[]`
   - `existing_pr`
   - `salvage_candidate`
   - `updated_at`
4. operator는 recovery evidence를 보고 `현재 변경을 살려 수동 PR/commit로 이어갈지` 또는 `worktree 정리 후 같은 stage를 fresh rerun할지`를 결정한다.
5. supervisor는 recovery가 존재한다고 해서 자동으로 새 PR을 만들거나 dirty worktree를 커밋하지 않는다.

반대로 아래 케이스는 auto-finalize 대상이다.

- valid `stage-result.json`
- supervisor verify pass
- in-scope 변경과 clean commit/push/PR 후처리가 가능한 상태

즉, `assisted recovery`는 invalid/missing artifact용 경로이고, `auto-finalize`는 valid artifact용 경로다.

## Reconcile Command

`pnpm omo:reconcile -- --work-item <id>`는 이미 merge된 slice의 docs-only bookkeeping drift를 closeout PR로 복구한다.

원칙:

1. closeout branch는 `docs/omo-closeout-<slice>`다.
2. 허용 수정 범위는 `docs/workpacks/README.md`와 target workpack의 `README.md`, `acceptance.md`, `automation-spec.json`, closeout/evidence metadata뿐이다.
3. closeout PR는 runtime `prs.closeout`에 기록한다.
4. closeout PR 생성 후 workflow-v2 status는 `ready_for_review`를 유지하고 notes에 `closeout_pr=<url>`를 남긴다.
5. closeout PR에 docs 외 파일이 섞이면 validator와 supervisor가 fail-closed 한다.
6. closeout PR 생성 전 `internal 6.5` preflight subset으로 `validate:closeout-sync`, `validate:source-of-truth-sync`, `validate:exploratory-qa-evidence`, PR body template 검사를 함께 실행한다.
7. exploratory QA evidence가 required인 slice의 closeout PR은 merged frontend PR QA evidence를 본문에 다시 연결할 수 있어야 한다.
8. safe slice-local drift는 closeout branch 안에서 `README.md`, `acceptance.md`, `automation-spec.json`, PR closeout/evidence metadata만 수정한다.
9. source-of-truth reference drift, validator/tooling 코드 변경 필요, missing authority report처럼 repo-wide 또는 non-deterministic drift는 fail-closed 하고 별도 `docs-governance` PR로 분리한다.

## Evidence Contract

autonomous supervisor는 최소한 아래를 남긴다.

- stage result JSON
- worktree path
- PR URL / number
- `gh` 응답 JSON
- review body / comment body
- checks summary
- merge 결과
- blocker 이유

기본 artifact 위치:

- `.artifacts/omo-supervisor/<timestamp>-<work-item-id>/`

## Non-Goals

- 일반 docs-governance나 engineering task 전면 자동화
- GitHub Actions 재구성
- Claude stage ownership 제거
- failed stage를 새 session으로 조용히 재실행하기
- merge queue 우회
