# Homecook OMO-Lite Supervisor Spec

## Status

- 이 문서는 `Codex supervisor 기반 Homecook OMO-lite`의 실행 규격이다.
- 현재 executable baseline은 `설치 + repo-local config + dispatcher/status helper + direct Codex stage runner + budget-aware reviewer fallback`까지다.
- 이 문서는 다음 phase의 `generic session-orchestrator + Homecook adapter` target spec도 함께 잠근다.
- `scripts/omo-lite-dispatch-stage.mjs`, `scripts/omo-lite-sync-status.mjs`, `scripts/omo-lite-run-stage.mjs`가 이 문서의 최소 executable path다.
- `scripts/omo-lite-claude-budget.mjs`는 reviewer availability override를 관리하는 companion CLI다.
- 다음 phase에서는 reviewer stage direct execution, session reuse, repo-local runtime retry를 추가한다.

## Purpose

OMO-lite supervisor의 역할을 `누가 무엇을 언제 결정하는가` 수준까지 고정한다.

목표:

- slice workflow Stage 1~6의 자동 집행 기준을 명확히 한다.
- Codex supervisor가 무엇을 자동화하고, 무엇은 여전히 Claude 또는 human approval이 필요한지 분리한다.
- 상태 파일, loop artifact, PR/CI 증거가 어떤 시점에 필요한지 명시한다.

## Scope

적용 대상:

- `infra-governance`
- `workflow-tooling`
- `workflow-v2` pilot
- 명시적으로 OMO-lite supervision을 켠 product slice

비대상:

- 일반 product slice의 v1 authoritative path 자체를 즉시 대체하는 것
- Claude stage ownership을 건너뛰는 것

## Supervisor Layers

이 spec은 두 레이어를 함께 다룬다.

### Generic Session-Orchestrator Core

책임:

- session create / continue / lookup
- runtime state read/write
- retry scheduling
- scheduled sweeper entrypoint
- lock 관리

### Homecook Adapter

책임:

- stage graph
- actor ownership
- prompt bundle
- verify command
- status patch 의미
- official docs refs

## Supervisor Responsibilities

Codex supervisor는 아래를 책임진다.

1. `change_type / risk / preset / surface` 판별
2. 현재 stage와 선행 조건 확인
3. actor routing
4. dispatch prompt bundle 생성
5. plan loop 실행 여부 판단
6. review loop 허용 여부 판단
7. verification 실행
8. `.workflow-v2` 상태 갱신
9. external smoke 필요 여부 판단
10. stalled / blocker / fallback escalation
11. session role 결정과 session reuse
12. repo-local runtime state 갱신
13. budget-driven retry scheduling

## Supervisor Non-Responsibilities

Codex supervisor는 아래를 하지 않는다.

- 공식 문서보다 supervisor 판단을 우선하기
- Claude approval 없이 final merge-ready 선언하기
- blocker나 smoke failure를 숨기기
- 동일 artifact를 여러 agent가 동시에 수정하게 허용하기

## State Vocabulary

### Lifecycle

- `planned`
- `in_progress`
- `ready_for_review`
- `blocked`
- `merged`
- `archived`

### Approval State

- `not_started`
- `needs_revision`
- `codex_approved`
- `claude_approved`
- `dual_approved`
- `awaiting_claude_or_human`
- `human_escalation`

`awaiting_claude_or_human`은 Claude-owned stage가 budget 또는 session availability 문제로 pause 되었거나, 예외적 recovery에서 provisional review만 남은 상태를 뜻한다.
기본 의미는 `Claude-owned stage가 blocked 상태로 pause 되었고 Claude 또는 human intervention을 기다리는 상태`다.
이 상태는 절대 `dual_approved`와 동등하지 않다.

## Stage State Machine

| Stage | Primary Actor | Entry Checks | Required Evidence | Exit Condition |
|------|---------------|--------------|-------------------|----------------|
| 1 | Claude | 선행 slice `merged/bootstrap`, slice status `planned` | workpack README, acceptance, docs PR, `claude_primary` session binding | docs merge + status `docs` |
| 2 | Codex | Stage 1 merged, dependencies resolved | branch `feature/be-<slice>`, tests, backend PR, `codex_primary` session binding | Draft PR + green CI + Ready |
| 3 | Claude | PR not Draft, required CI green | review summary, requested changes or approval, reused `claude_primary` session | merge or fix routing |
| 4 | Codex | backend merged, FE scope unlocked | branch `feature/fe-<slice>`, tests, frontend PR, reused `codex_primary` session | Draft PR + green CI + Ready |
| 5 | Claude | FE PR ready, design scope defined | design review note, requested changes or approval, reused `claude_primary` session | proceed to Stage 6 or fix routing |
| 6 | Claude | FE PR not Draft, required CI green | FE review summary, reused `claude_primary` session | merge or fix routing |

## Session Model

세션은 work item 단위로 고정한다.

- Stage `1 / 3 / 5 / 6` -> `claude_primary`
- Stage `2 / 4` -> `codex_primary`

규칙:

1. 어떤 역할의 첫 stage에서만 새 세션을 만든다.
2. 이후 stage는 같은 session ID로 계속한다.
3. 기본 재개는 `opencode run --session <id>`다.
4. session ID가 사라졌거나 재개가 실패하면 조용히 새 세션을 만들지 않는다.
5. lost session은 `human_escalation` trigger다.

## Runtime State Contract

runtime state는 repo-local non-tracked 상태로 둔다.

위치:

- `.opencode/omo-runtime/<work-item-id>.json`

최소 필드:

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

원칙:

- session ID는 `.workflow-v2/status.json`에 넣지 않는다.
- tracked status는 사람과 PR용 상태만 저장한다.
- runtime lock 없이 같은 work item을 두 프로세스가 동시에 재개하지 않는다.

## Stage Entry Rules

### Stage 1

- `docs/workpacks/README.md`에서 선행 slice 상태 확인
- 관련 official docs version 확인
- product slice면 design scope 존재 여부 확인

### Stage 2

- Stage 1 PR main merge 확인
- workpack README / acceptance 존재 확인
- 필요 시 `agent-plan-loop` 실행
- branch naming rule 확인

### Stage 3

- backend PR not Draft
- required CI green
- 변경 범위가 README Backend First Contract와 일치
- `claude_primary` session이 이미 있으면 재사용하고, 없으면 이 stage에서 최초 생성

### Stage 4

- backend PR merged
- frontend scope가 workpack에 잠겨 있음
- 필요 시 plan delta check
- `codex_primary` session 재사용

### Stage 5

- FE PR ready
- design token / state UI / modal / interaction scope가 정의됨
- `claude_primary` session 재사용

### Stage 6

- FE PR not Draft
- required CI green
- Stage 5 feedback 반영 상태 확인
- `claude_primary` session 재사용

## Loop Policy

### Plan Loop

사용 조건:

- medium/high risk
- infra-governance
- 여러 source of truth 충돌 가능성
- 새로운 external integration

supervisor는 plan loop 결과가 `approved`일 때만 구현 단계로 넘긴다.

### Review Loop

사용 조건:

- `docs-governance`
- `workflow-tooling`
- 정식 Stage 리뷰 후 반복 수정이 길어지는 exceptional recovery

product slice Stage 2/4 기본 경로에서는 사용하지 않는다.
정식 리뷰는 Stage 3, 5, 6이 담당한다.

## Claude Budget Policy

### Default

- Claude는 sparse high-value checkpoint에만 배정한다.
- Codex는 always-on execution / recovery engine으로 동작한다.
- reviewer stage의 budget state는 `explicit CLI override -> env -> .opencode/claude-budget-state.json -> OpenCode auth presence` 순서로 해석한다.
- 기본 retry delay는 `5 hours`, 기본 sweeper cadence는 `10 minutes`, 기본 max retry attempts는 `3`이다.

### Fallback

Claude가 unavailable이면:

1. Claude-owned stage는 시작하지 않는다.
2. runtime state에 `blocked_stage`, `retry.at`, `retry.reason=claude_budget_unavailable`, `retry.attempt_count`를 기록한다.
3. `.workflow-v2/status.json`에는 `lifecycle = blocked`, `approval_state = awaiting_claude_or_human`을 기록한다.
4. `notes`에는 `retry_at`, `session_role=claude_primary`, `artifact_dir`를 남긴다.
5. `resume-pending` 또는 scheduler가 due 시점 이후 같은 stage를 같은 Claude session으로 재시도한다.
6. repeated retry exhaustion 또는 session loss일 때만 `human_escalation`으로 전환한다.

## Status Sync Rules

OMO-lite supervisor는 아래 시점마다 `.workflow-v2/status.json`을 갱신해야 한다.

1. work item 생성 직후
2. stage 시작 직후
3. verification 결과 확보 직후
4. PR open / Ready 전환 직후
5. approval state 변경 직후
6. merge 직후

필수 기록:

- `branch`
- `pr_path`
- `lifecycle`
- `approval_state`
- `verification_status`
- `required_checks`
- `notes`

pause/resume가 개입한 경우 `notes`에는 아래를 포함한다.

- `retry_at`
- `session_role`
- `artifact_dir`

## Evidence Contract

각 supervised item은 최소한 아래를 남긴다.

- work item metadata
- stage transition note
- stage dispatch artifact (`.artifacts/omo-lite-dispatch/*`, 사용 시)
- verify commands
- PR URL
- remaining risks 또는 out-of-scope note
- loop final summary path (사용 시)

## Human Escalation Triggers

아래 중 하나면 사람이 개입한다.

- 같은 필수 수정 이슈 반복
- product rule ambiguity
- external smoke failure
- official docs conflict
- Claude unavailable 장기화
- session ID invalid / missing
- retry exhaustion
- verification passed와 실제 동작 실패가 충돌

## Immediate Implementation Target

현재 executable baseline은 아래다.

- OpenCode / OMO 설치
- repo-local `opencode.json`
- repo-local `.opencode/oh-my-opencode.json`
- OMO-lite supervisor / dispatch spec
- `.workflow-v2` tracked work item
- `scripts/omo-lite-dispatch-stage.mjs`
- `scripts/omo-lite-sync-status.mjs`
- `scripts/omo-lite-run-stage.mjs`
- `scripts/omo-lite-claude-budget.mjs`
- reviewer fallback의 automatic `awaiting_claude_or_human` routing
- optional fallback status sync with artifact note

다음 phase에서 구현할 목표는 아래다.

- generic supervisor CLI (`omo:start`, `omo:continue`, `omo:resume-pending`, `omo:status`)
- reviewer stage direct execution
- per-work-item session registry
- repo-local `.opencode/omo-runtime/` state
- scheduled sweeper 기반 pause/resume
