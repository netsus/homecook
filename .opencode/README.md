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
  - Claude는 sparse approval checkpoint에서만 사용
- Stage `1 / 3 / 5 / 6`의 기본 provider는 raw `claude` CLI다.
- Stage `1 / 3 / 5 / 6`용 OpenCode emergency fallback agent는 `athena`다.
- 위 agent/default 값은 `opencode.json`에 직접 등록하고, `.opencode/oh-my-opencode.json`은 같은 값을 mirrored snapshot으로 유지한다.
- `ralph-loop`와 `ulw-loop`는 아직 Homecook stage dispatcher와 연결되지 않았으므로 project 레벨에서 비활성화한다.
- `comment-checker` hook는 현재 로컬 설치 상태 차이로 false positive가 날 수 있어 project 레벨에서 비활성화한다.
- `comment-checker`는 영구 제거가 아니라 known issue다. 바이너리 링크 이슈가 해결되면 re-enable 여부를 다시 판단한다.

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
- Stage `1 / 3 / 5 / 6`은 `claude_primary`, Stage `2 / 4`는 `codex_primary` 세션을 재사용한다.
- Claude-owned stage의 canonical resume 경로는 `claude --resume <session_id>`다.
- `--continue`는 deterministic하지 않으므로 자동화에서 사용하지 않는다.
- Claude budget unavailable이면 기본 동작은 human handoff가 아니라 `pause + scheduled resume`다.
- scheduler는 `resume-pending`을 주기적으로 호출하고, 기본 retry delay는 5시간이다.
- 빠른 운영 확인은 `pnpm omo:status:brief -- --work-item <id>`를 사용한다.

## Autonomous Supervisor

- 상위 명령:
  - `pnpm omo:supervise -- --work-item <id>`
  - `pnpm omo:tick -- --all`
- runtime이 없는 work item에서 `omo:tick -- --work-item <id>`는 kickoff하지 않고 no-op로 끝난다.
- `omo:tick`은 이제 `wait.kind`뿐 아니라 unfinished `phase`도 재개한다.
- code stage에서 valid `stage-result.json`이 있고 supervisor verify가 통과하면, supervisor가 commit/push/PR 생성/CI wait까지 auto-finalize한다.
- 빠른 운영 확인은 `pnpm omo:status:brief -- --work-item <id>`로 `activeStage`, `phase`, `nextAction`, `mode`를 함께 읽는다.
- supervisor는 기본적으로 `.worktrees/<work-item-id>` 전용 worktree에서만 실행한다.
- GitHub 자동화는 `gh` CLI만 사용한다.
- 기본 scheduler cadence는 10분이며, macOS에서는 `launchd` 예시를 우선 제공한다.
- `launchd`에서는 login shell PATH를 가정하지 않는다. `pnpm`, `gh`, `claude`, `opencode`는 절대경로 또는 고정 PATH로 실행하는 것을 기본값으로 둔다.
- active pilot 동안 루트 repo는 `ops/omo-<slice>-runtime-anchor` 같은 운영 브랜치에 두는 것을 기본값으로 권장한다.
- 이 운영 브랜치는 hygiene 목적이다. supervisor worktree의 base sync correctness는 이제 local `master`가 아니라 `origin/master` detached 정책이 담당한다.
