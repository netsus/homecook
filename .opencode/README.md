# Repo-Local OpenCode / OMO Configuration

이 디렉터리는 Homecook 저장소에서만 적용되는 OpenCode / Oh My OpenCode 설정을 둔다.

## Rules

- 이 저장소 루트에서 OpenCode `/init`를 실행하지 않는다.
- 이유: 저장소에는 이미 공식 운영 규칙인 `AGENTS.md`가 있고, 자동 생성된 `AGENTS.md`로 덮어쓰면 안 된다.
- authoritative policy는 계속 `AGENTS.md`, `docs/engineering/slice-workflow.md`, `docs/engineering/agent-workflow-overview.md`다.
- 실제 OpenCode CLI 실행 기준은 repo root의 `opencode.json`이다.
- OMO provider 기본값은 `.opencode/omo-provider.json`에 둔다.
- `.opencode/oh-my-opencode.json`은 Homecook agent/hook 기본값의 compatibility snapshot으로 계속 추적한다.

## Current Homecook Defaults

- 기본 실행 에이전트: `hephaestus`
- 의도:
  - Codex 중심 supervisor / execution
  - Claude는 Stage 1/3/4와 authority-required final authority gate에 집중한다
- Stage `1 / 3 / 4`와 Stage 5 `final_authority_gate`의 기본 provider는 raw `claude` CLI다.
- Stage `1 / 3 / 4`와 Stage 5 `final_authority_gate`용 OpenCode emergency fallback agent는 `athena`다.
- 위 agent/default 값은 `opencode.json`에 직접 등록하고, `.opencode/oh-my-opencode.json`은 같은 값을 mirrored snapshot으로 유지한다.
- `ralph-loop` command는 전역에서 사용할 수 있게 허용한다.
- 다만 Homecook OMO supervisor의 실제 자동 실행 표면은 계속 `$ralph` skill이다.
- `ralph-loop` hook는 일반 세션 UX와 충돌을 막기 위해 project 레벨에서 계속 비활성화한다.
- `comment-checker` hook는 현재 로컬 설치 상태 차이로 false positive가 날 수 있어 project 레벨에서 비활성화한다.
- `comment-checker`는 영구 제거가 아니라 known issue다. 바이너리 링크 이슈가 해결되면 re-enable 여부를 다시 판단한다.
- 일반 로컬 세션은 OMO supervisor처럼 stage branch를 미리 계산하지는 않는다.
- 대신 `pnpm branch:start -- --branch <name>` 또는 slice shortcut이 active work branch intent를 기록한다.
- project-level `.claude/settings.json` hook는 새 user prompt마다 branch reassert를 요구하고, 같은 prompt 안에서는 `Write/Edit` 전에 recorded intent 기준 auto-checkout 또는 deny를 수행한다.
- 따라서 같은 세션이라도 다른 PR 또는 다른 work item으로 넘어간 뒤 수정하려면 먼저 다시 `pnpm branch:start ...`를 실행해야 한다.
- 현재 intent 확인/초기화는 `pnpm branch:status`, `pnpm branch:clear`를 사용한다.
- OMO supervisor 경로만 `.worktrees/<work-item>` 안에서 stage별 branch checkout을 자동으로 수행한다.

## Local Auth

- provider 인증은 사용자 로컬 상태다.
- 필요 시 아래 명령으로 로그인한다.

```bash
claude login
opencode auth login
```

- 이 인증 상태는 Git에 커밋하지 않는다.
- `claude-cli` provider는 로컬 `claude login` 상태를 사용한다.
- `opencode` fallback provider는 `opencode auth login` 상태를 사용한다.

## Claude Budget Override

- reviewer stage에서 Claude 사용 가능 여부는 기본적으로 OpenCode auth 상태를 보고 해석한다.
- 강제로 상태를 바꿔야 하면 아래 명령을 사용한다.

```bash
pnpm omo:claude-budget -- --status
pnpm omo:claude-budget -- --set unavailable --reason "Claude Pro budget exhausted"
pnpm omo:claude-budget -- --clear
```

- override 파일은 `.opencode/claude-budget-state.json`이며 Git에 커밋하지 않는다.

## OMO Provider Defaults

- tracked config: `.opencode/omo-provider.json`
- Claude defaults:
  - `provider = claude-cli`
  - `bin = claude`
  - `model = sonnet`
  - `effort = high`
  - `permission_mode = acceptEdits`
- Codex defaults:
  - `provider = opencode`
  - `bin = opencode`
  - `agent = hephaestus`
- CLI override가 repo-local default보다 우선한다.

## Runtime State

- session-orchestrated runner는 repo-local runtime state를 `.opencode/omo-runtime/` 아래에 저장한다.
- 여기에 work item별 session ID, retry timer, lock, 마지막 artifact 경로를 둔다.
- autonomous supervisor를 켜면 worktree 경로, active PR, wait reason뿐 아니라 `active_stage`, `phase`, `next_action`, `execution`, `recovery`도 같은 runtime state에 저장한다.
- tracked 상태인 `.workflow-v2/status.json`에는 session ID를 넣지 않는다.
- 이 runtime state도 Git에 커밋하지 않는다.

## Phase 5 Runner

- `pnpm omo:run-stage -- --slice <id> --stage <n>`은 stage dispatch artifact를 `.artifacts/omo-lite-dispatch/` 아래에 만든다.
- `--mode execute`는 `Codex`와 `Claude` primary stage 모두에 적용된다.
- Claude budget unavailable이면 실행 대신 same-stage retry artifact와 runtime state를 남긴다.
- `--sync-status`를 함께 주면 artifact 경로와 blocked/human escalation patch를 `.workflow-v2/status.json`에 같이 기록한다.

## Session-Orchestrated Runner

- 상위 명령:
  - `pnpm omo:start -- --work-item <id>`
  - `pnpm omo:continue -- --work-item <id>`
  - `pnpm omo:resume-pending`
  - `pnpm omo:status -- --work-item <id>`
  - `pnpm omo:status:brief -- --work-item <id>`
- Stage `1 / 3 / 4`는 `claude_primary`, Stage `2 / 5 / 6`은 `codex_primary` 세션을 재사용한다.
- Stage 4 `authority_precheck`는 `codex_primary`, Stage 5 `final_authority_gate`는 `claude_primary`를 사용한다.
- Claude-owned stage의 canonical resume 경로는 `claude --resume <session_id>`다.
- `--continue`는 deterministic하지 않으므로 자동화에서 사용하지 않는다.
- Claude budget unavailable이면 기본 동작은 human handoff가 아니라 `pause + scheduled resume`다.
- scheduler는 `resume-pending`을 주기적으로 호출하고, 기본 retry delay는 5시간이다.
- 빠른 운영 확인은 `pnpm omo:status:brief -- --work-item <id>`를 사용한다.

## Autonomous Supervisor

- 상위 명령:
  - `pnpm omo:supervise -- --work-item <id>`
  - `pnpm omo:tick -- --all`
  - `pnpm omo:reconcile -- --work-item <id>`
  - `pnpm omo:tick:watch -- --work-item <id>`
  - `pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name>`
  - `pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name> --live-providers`
  - `pnpm omo:smoke:providers`
  - `pnpm omo:scheduler:install -- --work-item <id>`
  - `pnpm omo:scheduler:uninstall -- --work-item <id>`
  - `pnpm omo:scheduler:verify -- --work-item <id>`
- runtime이 없는 work item에서 `omo:tick -- --work-item <id>`는 kickoff하지 않고 no-op로 끝난다.
- `omo:tick`은 이제 `wait.kind`뿐 아니라 unfinished `phase`도 재개한다.
- code stage에서 valid `stage-result.json`이 있고 supervisor verify가 통과하면, supervisor가 commit/push/PR 생성/CI wait까지 auto-finalize한다.
- 이미 merge된 slice에서 공식 docs bookkeeping만 어긋나면 `omo:reconcile`이 docs-only closeout PR를 생성해 drift를 복구한다.
- 빠른 운영 확인은 `pnpm omo:status:brief -- --work-item <id>`로 `activeStage`, `phase`, `nextAction`, `mode`를 함께 읽는다.
- scheduler 자체가 지금 도는지, 마지막으로 언제 로그를 남겼는지는 `pnpm omo:tick:watch -- --work-item <id>`로 본다.
- supervisor는 기본적으로 `.worktrees/<work-item-id>` 전용 worktree에서만 실행한다.
- GitHub 자동화는 `gh` CLI만 사용한다.
- 기본 scheduler cadence는 10분이며, macOS에서는 `launchd` 예시를 우선 제공한다.
- `omo:scheduler:install`은 절대경로 `pnpm`, `gh`, `claude`, `opencode`와 `~/Library/Logs/homecook/` 로그 경로를 렌더링한다.
- `omo:scheduler:verify`는 `launchctl print`와 `omo:tick:watch --json`을 비교해 label/interval/log path drift를 막는다.
- `omo:smoke:control-plane`은 반드시 별도 sandbox GitHub repo에서만 실행하고, `homecook` 본 repo를 대상으로는 거부한다.
- `omo:smoke:control-plane -- --live-providers`는 backend Stage 2/3만 실제 Claude/Codex를 사용하고, backend review 첫 시도에서 `request_changes` token contract를 강제한 뒤 Codex가 최소 확인용 prompt만으로 그 feedback을 marker file에 반영했는지까지 검증한다.
- `omo:smoke:providers`는 실제 Claude/Codex auth 상태에서 session reuse와 stage-result 생성을 분리 검증한다.
- fullauto v1은 수동 리뷰/실동작 확인 직전까지 자동화한다.
- `launchd`에서는 login shell PATH를 가정하지 않는다. `pnpm`, `gh`, `claude`, `opencode`는 절대경로 또는 고정 PATH로 실행하는 것을 기본값으로 둔다.
- active pilot 동안 루트 repo는 `ops/omo-<slice>-runtime-anchor` 같은 운영 브랜치에 두는 것을 기본값으로 권장한다.
- 이 운영 브랜치는 hygiene 목적이다. supervisor worktree의 base sync correctness는 이제 local `master`가 아니라 `origin/master` detached 정책이 담당한다.

## Manual Handoff Standard

- manual handoff는 `high-risk`, `anchor-extension`, `exceptional recovery`에서만 허용한다.
- provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.
- handoff bundle은 아래를 반드시 포함한다.
  - latest `stage-result.json` 경로
  - authority/final gate artifact 경로(해당 시)
  - 남은 blocker 요약
  - 다음 권장 명령
  - 대상 workpack / PR ref

## Live Smoke Standard

- live smoke는 `external_smokes[]`가 비어 있지 않은 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.
- canonical evidence는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.
- rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox repo rehearsal 중 더 이른 쪽을 따른다.
- control-plane smoke는 sandbox GitHub repo에서만 실행하고, product repo에서는 promotion evidence 재검증에만 사용한다.

## Scheduler Standard

- team-shared default scheduler는 현재 `macOS launchd`다.
- non-macOS 환경은 persistent daemon parity를 요구하지 않고, `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending`을 fallback으로 사용한다.
- scheduler install 뒤와 scheduler config/provider path 변경 뒤에는 `pnpm omo:scheduler:verify -- --work-item <id>`를 실행한다.
- 운영 확인은 `pnpm omo:tick:watch -- --work-item <id>`로 하고, 최소 `slice-batch-review`마다 1회 verify/watch 상태를 재점검한다.

## Bookkeeping Validation

- `pnpm validate:omo-bookkeeping`는 runtime / workflow-v2 / 공식 workpack docs 사이의 drift를 검사한다.
- OMO 기본 승격 여부는 `docs/engineering/workflow-v2/promotion-readiness.md`와 `.workflow-v2/promotion-evidence.json`을 기준으로 따로 관리한다.
- slice06 같은 authority-required pilot checkpoint 결과는 `pnpm omo:promotion:update`로 `.workflow-v2/promotion-evidence.json`에 기록한다.
- 특히 아래를 막는다.
  - runtime 또는 workflow-v2는 merged인데 `docs/workpacks/README.md`가 아직 `merged`가 아님
  - non-authority slice가 Stage 5 이후인데, 또는 authority-required slice가 final authority gate 이후인데 workpack README의 Design Status가 `confirmed`가 아님
  - closeout branch가 docs 외 파일을 수정함
