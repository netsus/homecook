# Local Worktree OMO Autonomous Supervisor

## Status

- 이 문서는 `generic session-orchestrator` 위에 얹는 `local autonomous supervisor` 규격을 고정한다.
- 현재 executable baseline은 여전히 `omo:start`, `omo:continue`, `omo:resume-pending`, `omo:status`다.
- 다음 phase에서는 이 문서의 규격에 맞춰 `omo:supervise`, `omo:tick`, worktree manager, `gh` automation을 구현한다.

## Purpose

autonomous supervisor는 stage 실행 자체보다 `stage 사이의 운영 전이`를 책임진다.

역할:

- work item별 전용 git worktree를 만든다.
- stage 실행 후 branch / push / PR / CI / merge를 자동화한다.
- Claude와 Codex가 같은 session ID를 유지한 채 다음 stage로 넘어가게 한다.
- scheduler tick이 다시 깨워야 하는 대기 조건을 runtime state에 남긴다.
- 실패 시 silent recovery 대신 `blocked` 또는 `human_escalation`으로 fail-closed 한다.

즉, session-orchestrator가 `한 stage를 같은 session으로 실행`하는 코어라면,
autonomous supervisor는 `그 stage 결과를 다음 GitHub 상태와 다음 stage 진입으로 연결`하는 코어다.

## Public Interface

새 상위 명령:

- `pnpm omo:supervise -- --work-item <id>`
- `pnpm omo:tick -- --all`
- `pnpm omo:tick -- --work-item <id>`

기존 low-level 명령:

- `pnpm omo:start`
- `pnpm omo:continue`
- `pnpm omo:resume-pending`
- `pnpm omo:status`

원칙:

1. `omo:supervise`는 한 work item을 가능한 만큼 전진시킨다.
2. `omo:tick`은 scheduler entrypoint다.
3. 사용자는 stage 번호, session ID, PR 번호, retry timer를 직접 맞춰 넣지 않는다.
4. 기존 low-level 명령은 디버깅과 manual recovery용 primitive로 유지한다.

## Dedicated Worktree Policy

기본 작업공간은 현재 IDE worktree가 아니라 `work item 전용 worktree`다.

기본 경로:

- `.worktrees/<work-item-id>`

원칙:

1. supervisor는 work item 시작 시 전용 worktree가 없으면 생성한다.
2. 같은 work item은 같은 worktree를 계속 재사용한다.
3. Stage 1은 `docs/<slice>`, Stage 2는 `feature/be-<slice>`, Stage 4는 `feature/fe-<slice>`를 같은 worktree 안에서 순서대로 checkout 한다.
4. merge 직후에는 항상 `origin/master`를 fetch하고 worktree의 `master`를 fast-forward 한 뒤 다음 branch를 만든다.
5. 현재 IDE worktree는 supervisor가 건드리지 않는다.

## Stage Result Contract

stage 실행 결과는 supervisor가 읽을 수 있는 구조화된 결과를 남겨야 한다.

코드 stage (Stage 1 / 2 / 4) 최소 필드:

- `result`: `done | blocked`
- `summary_markdown`
- `pr.title`
- `pr.body_markdown`
- `checks_run[]`
- `next_route`: `open_pr | wait_for_ci | blocked`

리뷰 stage (Stage 3 / 5 / 6) 최소 필드:

- `decision`: `approve | request_changes | blocked`
- `body_markdown`
- `route_back_stage`
- `approved_head_sha`

원칙:

1. PR title/body는 stage agent가 만들고 supervisor는 검증 및 제출만 한다.
2. review body는 GitHub review/comment에 그대로 연결 가능한 수준으로 구조화한다.
3. supervisor는 structured result가 없거나 불완전하면 자동 진행 대신 fail-closed 한다.

## GitHub Automation Boundary

GitHub 자동화는 `gh CLI`만 사용한다.

허용 명령:

- `gh pr create`
- `gh pr ready`
- `gh pr checks --required --json`
- `gh pr review`
- `gh pr comment`
- `gh pr merge --merge --match-head-commit`
- `gh pr update-branch`

규칙:

1. docs PR는 일반 PR로 생성한다.
2. backend / frontend PR는 Draft로 생성하고 required checks green 뒤에만 `gh pr ready`를 호출한다.
3. Stage 3 / 6 approve는 `gh pr review --approve`로 기록한다.
4. Stage 5 approve 또는 findings는 PR comment로 기록한다.
5. merge는 기본 `merge commit`만 사용한다.
6. merge 직전 head SHA를 고정하고 drift가 있으면 다시 판단한다.
7. base drift가 clean update 가능한 경우에만 `gh pr update-branch`를 한 번 시도한다.
8. force-push, auto-rebase, silent branch recreation은 금지한다.

## Wait And Scheduler Contract

autonomous supervisor는 장시간 살아 있는 sleep 프로세스를 기본 경로로 두지 않는다.

runtime state는 아래 대기 이유를 저장할 수 있어야 한다.

- `wait.kind = ci`
- `wait.kind = merge`
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

## Fail-Closed Rules

아래 경우에는 자동 진행 대신 멈춘다.

- stored session missing / invalid
- `gh auth` 없음
- `opencode` auth 없음
- worktree dirty
- PR body validation 실패
- push reject
- required checks fail
- external smoke fail
- merge conflict
- review ping-pong 반복 초과

이때 supervisor는:

1. `.workflow-v2/status.json`을 `blocked` 또는 `human_escalation`으로 맞춘다.
2. runtime state에 대기 이유를 남긴다.
3. `.artifacts/omo-supervisor/*` 아래에 blocker artifact를 남긴다.

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
