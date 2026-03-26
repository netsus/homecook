# Generic OMO Session-Orchestrator

## Status

- 이 문서는 다음 OMO-lite phase에서 구현할 `generic session-orchestrated runner` 규격을 고정한다.
- 현재 저장소의 실행 가능 helper는 여전히 `dispatch-stage / sync-status / run-stage / claude-budget` 조합이다.
- 이 문서의 목적은 구현 전에 `세션 재사용`, `pause/resume`, `runtime state`의 단일 규격을 먼저 잠그는 것이다.

## Purpose

generic OMO session-orchestrator는 project-specific workflow 규칙과 OpenCode CLI 실행을 분리하는 reusable core다.

역할:

- work item 단위로 세션을 만들고 재사용한다.
- 어떤 stage가 어떤 세션 역할을 쓰는지 고정한다.
- runtime state와 retry timer를 repo-local로 기록한다.
- Claude budget unavailable 상황에서 같은 stage를 같은 세션으로 재개한다.
- project adapter가 제공하는 stage graph, prompt, verify command를 실제 실행으로 연결한다.
- 상위 autonomous supervisor가 읽을 수 있도록 stage execution metadata를 안정적으로 남긴다.

즉, project adapter가 `무엇을 실행할지`를 정하고, session-orchestrator가 `어떻게 같은 세션으로 이어갈지`를 책임진다.

## Supervisor CLI Surface

구현 기본 표면은 아래 4개 명령이다.

- `omo start <work-item>`
- `omo continue <work-item>`
- `omo resume-pending`
- `omo status <work-item>`

Homecook 저장소에서는 repo script alias를 함께 둔다.

- `pnpm omo:start -- --work-item <id>`
- `pnpm omo:continue -- --work-item <id>`
- `pnpm omo:resume-pending`
- `pnpm omo:status -- --work-item <id>`

원칙:

- 사용자는 stage 번호와 session ID를 직접 조합하지 않는다.
- 기존 `pnpm omo:run-stage`는 low-level primitive로 남기고, 상위 supervisor CLI가 이를 내부적으로 호출한다.
- `resume-pending`은 장시간 살아 있는 sleep process 대신 scheduler가 주기적으로 호출한다.

## Session Model

세션은 `per work item`으로 고정한다.

세션 역할:

- `claude_primary`
- `codex_primary`

기본 stage 매핑:

- Stage `1 / 3 / 5 / 6` -> `claude_primary`
- Stage `2 / 4` -> `codex_primary`

세션 규칙:

1. 어떤 역할이 처음 필요한 stage에서만 새 세션을 만든다.
2. 이후 같은 역할의 stage는 항상 저장된 session ID로 `continue`한다.
3. 기본 재개 방식은 `opencode run --session <id>`다.
4. `--fork`는 기본 경로가 아니라 명시적 operator recovery에서만 사용한다.
5. 저장된 session ID가 사라졌거나 재개가 불가능하면 조용히 새 세션을 만들지 않는다.
6. session loss는 `blocked + human_escalation` 조건이다.

이 규칙으로 Stage 1을 수행한 Claude 세션이 Stage 3/5/6에서도 같은 문맥을 유지하고, Stage 2를 수행한 Codex 세션이 Stage 4를 이어받는다.

## Runtime State Contract

runtime state는 tracked workflow 상태와 분리한다.

저장 위치:

- `.opencode/omo-runtime/<work-item-id>.json`

성격:

- repo-local
- non-committed
- operator/runtime 전용

최소 필드:

- `work_item_id`
- `repo_root`
- `current_stage`
- `last_completed_stage`
- `blocked_stage`
- `sessions.claude_primary.session_id`
- `sessions.codex_primary.session_id`
- `retry.at`
- `retry.reason`
- `retry.attempt_count`
- `last_artifact_dir`
- `lock.owner`
- `lock.acquired_at`

분리 원칙:

- `.workflow-v2/status.json`은 사람과 PR이 읽는 공식 상태다.
- `.opencode/omo-runtime/*.json`은 세션 ID, retry timer, lock 같은 실행 상태만 저장한다.
- tracked 상태에는 세션 ID를 넣지 않는다.

## Retry And Resume Policy

기본 retry 정책:

- 대상: Claude-owned stage (`1 / 3 / 5 / 6`)
- 기본 retry delay: `5 hours`
- 기본 sweeper cadence: `10 minutes`
- 기본 max retry attempts: `3`

Claude unavailable이면:

1. 해당 stage 실행을 시작하지 않는다.
2. runtime state에 `blocked_stage`와 `retry.at = now + 5h`를 기록한다.
3. `.workflow-v2/status.json`에는 `lifecycle = blocked`, `approval_state = awaiting_claude_or_human`을 기록한다.
4. `notes`에는 `retry_at`, `session_role`, `artifact_dir`를 남긴다.
5. `resume-pending`이 due item을 찾아 같은 stage를 같은 `claude_primary` session ID로 다시 시도한다.

재시도 중단 조건:

- retry attempts가 기본값 `3`을 초과
- session ID가 유효하지 않음
- runtime lock이 회수되지 않음
- 같은 blocker가 반복됨

위 경우에는 `human_escalation`으로 넘긴다.

## Adapter Boundary

generic core는 project-specific stage semantics를 직접 소유하지 않는다.

project adapter가 제공해야 하는 것:

- 현재 stage와 다음 stage 결정
- actor ownership
- required reads / deliverables / verify commands
- status patch 초안
- official docs refs
- branch / PR gate rules

generic core가 책임지는 것:

- session create / continue
- runtime state read/write
- retry timer 계산
- lock 획득/해제
- artifact directory 연결
- scheduler-friendly `resume-pending` 실행

autonomous supervisor가 따로 책임지는 것:

- worktree 생성/재사용
- branch checkout / fetch / sync
- PR create / ready / review / merge
- CI 상태 polling
- stage 간 route 결정

## Homecook Mapping

Homecook에서는 아래 원칙으로 adapter를 둔다.

- authoritative policy는 계속 `AGENTS.md`와 `workflow-v2` docs가 가진다.
- Homecook adapter는 기존 `omo-lite-supervisor`의 stage graph와 dispatch contract를 재사용한다.
- Stage 1/3/5/6의 actor는 여전히 Claude다.
- Stage 2/4의 actor는 여전히 Codex다.
- generic core는 actor ownership을 바꾸지 않고, 세션과 retry만 표준화한다.

## Non-Goals

- Claude stage ownership 제거
- `awaiting_claude_or_human`를 `dual_approved`와 동등하게 취급하기
- session loss 시 자동 새 세션 생성
- long-running `sleep 5h` 프로세스를 기본 경로로 채택하기
- project profile 없이 generic core만으로 stage semantics를 추론하기
