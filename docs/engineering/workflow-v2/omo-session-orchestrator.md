# Generic OMO Session-Orchestrator

## Status

- 이 문서는 다음 OMO-lite phase에서 구현할 `generic session-orchestrated runner` 규격을 고정한다.
- 현재 저장소의 실행 가능 helper는 여전히 `dispatch-stage / sync-status / run-stage / claude-budget` 조합이다.
- 이 문서의 목적은 구현 전에 `세션 재사용`, `pause/resume`, `runtime state`의 단일 규격을 먼저 잠그는 것이다.

## Purpose

generic OMO session-orchestrator는 project-specific workflow 규칙과 provider-specific CLI 실행을 분리하는 reusable core다.

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

- Stage `1 / 3 / 4` -> `claude_primary`
- Stage `2 / 5 / 6` -> `codex_primary`
- Stage 4 `authority_precheck` -> `codex_primary`
- Stage 5 `final_authority_gate` -> `claude_primary`

세션 규칙:

1. 어떤 역할이 처음 필요한 stage에서만 새 세션을 만든다.
2. 이후 같은 역할의 stage는 항상 저장된 session ID로 `continue`한다.
3. 기본 재개 방식은 provider-aware deterministic resume다.
4. `claude-cli` provider는 `claude --resume <id>`를 사용한다.
5. `opencode` provider는 `opencode run --session <id>`를 사용한다.
6. `--continue`는 deterministic하지 않으므로 자동화에서 금지한다.
7. `--fork`는 기본 경로가 아니라 명시적 operator recovery에서만 사용한다.
8. 저장된 session ID가 사라졌거나 재개가 불가능하면 조용히 새 세션을 만들지 않는다.
9. session loss는 `blocked + human_escalation` 조건이다.

이 규칙으로 Stage 1을 수행한 Claude 세션이 Stage 3/4와 Stage 5 `final_authority_gate`에서도 같은 문맥을 유지하고, Stage 2를 수행한 Codex 세션이 Stage 4 `authority_precheck`, Stage 5 public review, Stage 6 closeout을 이어받는다.

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
- `sessions.claude_primary.provider`
- `sessions.claude_primary.session_id`
- `sessions.codex_primary.provider`
- `sessions.codex_primary.session_id`
- `retry.at`
- `retry.reason`
- `retry.attempt_count`
- `last_artifact_dir`
- `lock.owner`
- `lock.acquired_at`
- `recovery.kind`
- `recovery.stage`
- `recovery.branch`
- `recovery.reason`
- `recovery.artifact_dir`
- `recovery.changed_files[]`
- `recovery.existing_pr`
- `recovery.salvage_candidate`
- `recovery.updated_at`

분리 원칙:

- `.workflow-v2/status.json`은 사람과 PR이 읽는 공식 상태다.
- `.opencode/omo-runtime/*.json`은 session provider, 세션 ID, retry timer, lock 같은 실행 상태만 저장한다.
- partial-stage recovery evidence도 repo-local runtime에 저장한다.
- tracked 상태에는 세션 ID를 넣지 않는다.

## Retry And Resume Policy

기본 retry 정책:

- 대상: Claude-owned public stage (`1 / 3 / 4`)와 Stage 5 `final_authority_gate`
- 기본 retry delay: `5 hours`
- 기본 sweeper cadence: `10 minutes`
- 기본 max retry attempts: `3`

Claude unavailable이면:

1. 해당 stage 실행을 시작하지 않는다.
2. runtime state에 `blocked_stage`와 `retry.at = now + 5h`를 기록한다.
3. `.workflow-v2/status.json`에는 `lifecycle = blocked`를 기록하고 approval_state는 이전 값을 유지한다.
4. `notes`에는 `retry_at`, `session_role`, `artifact_dir`를 남긴다.
5. `resume-pending`이 due item을 찾아 같은 stage를 같은 `claude_primary` session ID로 다시 시도한다.
6. `claude-cli` provider의 canonical retry path는 `claude --resume <session_id>`다.

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
- runtime의 `wait` / `retry` / `recovery` 이유를 operator-facing status guidance로 정규화

autonomous supervisor가 따로 책임지는 것:

- worktree 생성/재사용
- branch checkout / fetch / sync
- PR create / ready / review / merge
- CI 상태 polling
- stage 간 route 결정

status guidance 출력 규칙:

- `omo:status`는 runtime state를 직접 노출하는 대신 operator가 바로 행동할 수 있는 진단 정보로 요약한다.
- 최소 출력 항목은 `reason code`, `remediation`, 마지막 실패 validator, `failure path`, `artifact path`, `next recommendation`이다.
- `omo:status:brief`는 같은 guidance를 compact 형식으로 보여 주되, current stage와 active phase를 먼저 유지한다.
- `Phase 4` 이후에는 `runtime signal`도 함께 노출해 `running_live`, `running_stale_candidate`, `retry_due`, `waiting_ci`, `lock_residue`를 별도 해석 없이 바로 읽을 수 있어야 한다.
- 같은 출력에서 `last activity`, `activity source`, `session freshness`, `execution freshness`를 같이 보여 heartbeat proxy 역할을 하도록 만든다.
- `omo:tail`은 위 status guidance에 scheduler snapshot과 최근 stdout/stderr tail을 덧붙인 operator surface다. status만으로 stale/live 판단이 애매할 때 같은 work item의 recent tick 흔적을 한 번에 묶어 본다.

## Homecook Mapping

Homecook에서는 아래 원칙으로 adapter를 둔다.

- authoritative policy는 계속 `AGENTS.md`와 `workflow-v2` docs가 가진다.
- Homecook adapter는 기존 `omo-lite-supervisor`의 stage graph와 dispatch contract를 재사용한다.
- Stage 1/3/4의 public actor는 Claude다.
- Stage 2/5/6의 public actor는 Codex다.
- authority-required slice의 Stage 5 `final_authority_gate` actor는 Claude다.
- generic core는 actor ownership을 바꾸지 않고, 세션과 retry만 표준화한다.

## Non-Goals

- Claude stage ownership 제거
- blocked retry 중에는 approval_state를 덮어쓰지 않고 이전 승인 상태를 유지하기
- session loss 시 자동 새 세션 생성
- long-running `sleep 5h` 프로세스를 기본 경로로 채택하기
- `--continue`를 deterministic automation resume 경로로 채택하기
- project profile 없이 generic core만으로 stage semantics를 추론하기
