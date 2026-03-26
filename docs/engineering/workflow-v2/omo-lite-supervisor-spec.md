# Homecook OMO-Lite Supervisor Spec

## Status

- 이 문서는 `Codex supervisor 기반 Homecook OMO-lite`의 실행 규격이다.
- 현재는 `설치 + repo-local config + spec 고정 + minimal dispatcher/status helper` 단계까지를 다룬다.
- `scripts/omo-lite-dispatch-stage.mjs`와 `scripts/omo-lite-sync-status.mjs`가 이 문서의 최소 executable path다.
- direct OMO agent execution까지 연결되지는 않았으므로, 사람과 Codex supervisor가 helper 출력을 보고 다음 액션을 실행한다.

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

`awaiting_claude_or_human`은 Claude budget exhaustion 또는 reviewer unavailability 때문에 임시 Codex review summary만 남긴 상태를 뜻한다.
이 상태는 절대 `dual_approved`와 동등하지 않다.

## Stage State Machine

| Stage | Primary Actor | Entry Checks | Required Evidence | Exit Condition |
|------|---------------|--------------|-------------------|----------------|
| 1 | Claude | 선행 slice `merged/bootstrap`, slice status `planned` | workpack README, acceptance, docs PR | docs merge + status `docs` |
| 2 | Codex | Stage 1 merged, dependencies resolved | branch `feature/be-<slice>`, tests, backend PR | Draft PR + green CI + Ready |
| 3 | Claude | PR not Draft, required CI green | review summary, requested changes or approval | merge or fix routing |
| 4 | Codex | backend merged, FE scope unlocked | branch `feature/fe-<slice>`, tests, frontend PR | Draft PR + green CI + Ready |
| 5 | Claude | FE PR ready, design scope defined | design review note, requested changes or approval | proceed to Stage 6 or fix routing |
| 6 | Claude | FE PR not Draft, required CI green | FE review summary | merge or fix routing |

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

### Stage 4

- backend PR merged
- frontend scope가 workpack에 잠겨 있음
- 필요 시 plan delta check

### Stage 5

- FE PR ready
- design token / state UI / modal / interaction scope가 정의됨

### Stage 6

- FE PR not Draft
- required CI green
- Stage 5 feedback 반영 상태 확인

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

### Fallback

Claude가 unavailable이면:

1. Codex supervisor는 provisional review summary를 만들 수 있다.
2. 상태는 `awaiting_claude_or_human`으로 기록한다.
3. merge-ready 선언은 금지한다.
4. Claude 복귀 또는 human review 후에만 `dual_approved`로 전환 가능하다.

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

## Evidence Contract

각 supervised item은 최소한 아래를 남긴다.

- work item metadata
- stage transition note
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
- verification passed와 실제 동작 실패가 충돌

## Immediate Implementation Target

Phase 1~4에서 현재까지 갖춘 것은 아래다.

- OpenCode / OMO 설치
- repo-local `opencode.json`
- repo-local `.opencode/oh-my-opencode.json`
- OMO-lite supervisor / dispatch spec
- `.workflow-v2` tracked work item
- `scripts/omo-lite-dispatch-stage.mjs`
- `scripts/omo-lite-sync-status.mjs`

다음 phase에서는 direct OMO execution binding과 stage artifact automation을 다룬다.
