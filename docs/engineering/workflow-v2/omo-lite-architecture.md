# Homecook OMO-Lite Architecture

## Status

- 이 문서는 `Codex supervisor 기반 Homecook OMO-lite` 설계안이다.
- 아직 저장소의 기본 운영 규칙을 직접 대체하지 않는다.
- 현재 authoritative path는 계속 `AGENTS.md`, `docs/engineering/slice-workflow.md`, `docs/engineering/agent-workflow-overview.md`다.
- 이 설계안은 full OpenCode migration이 아니라, 현재 저장소 위에 얹는 `workflow supervisor` 아키텍처를 정의한다.

## Core Definition

Homecook OMO-lite는 `Codex supervisor가 slice workflow 전체를 집행`하고, Claude는 희소한 승인/감독 역할만 수행하는 orchestration layer다.

즉:

- `slice workflow`: 무엇을 어떤 순서로 해야 하는지 정의
- `plan loop`: 구현 전에 범위와 리스크를 수렴
- `stage review`: Stage 3, 5, 6에서 정식 리뷰를 수행
- `review loop`: product slice 바깥의 governance/tooling 변경 또는 예외적 recovery에서만 사용
- `OMO-lite`: stage를 읽고, 적절한 agent를 호출하고, 부족한 부분을 다시 loop로 보완하고, 상태를 갱신하는 상위 감독 시스템

이 구조에서 OMO-lite는 단순 worker launcher가 아니라 `workflow supervisor`다.

## Goal

- slice workflow 과정을 자동 집행한다.
- stage별 precondition, artifact, CI, review 조건을 자동 확인한다.
- 부족한 부분은 `validate -> fix -> revalidate` 루프로 자동 보완한다.
- Claude 토큰을 절약하면서도 독립적인 승인 구조는 유지한다.
- Codex 토큰이 풍부한 현실에 맞춰 집행과 회복을 Codex 중심으로 몰아준다.

## Why OMO-Lite

현재 저장소는 이미 아래를 갖췄다.

- v1 product slice SOP
- workflow v2 pilot
- machine-readable 상태 파일
- plan loop

부족한 것은 규칙 자체가 아니라 `이 규칙들을 연결해서 실제로 돌리는 상위 감독자`다.

OMO-lite는 그 빈칸을 메운다.

## Non-Goals

- Claude 완전 제거
- human review 제거
- v1 slice workflow 즉시 폐기
- worker 자율 merge
- 공식 문서보다 agent 판단을 우선시하기

## Architecture Summary

OMO-lite는 4개 plane으로 본다.

### 1. Policy Plane

무엇이 맞는지 정의한다.

- `AGENTS.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/git-workflow.md`
- `docs/workpacks/*`

OMO-lite는 이 plane의 집행자일 뿐, 규칙 생성자가 아니다.

### 2. Control Plane

실제 orchestration을 담당한다.

- `Codex supervisor`
- stage state machine
- dispatch engine
- loop trigger engine
- gate evaluator
- escalation engine

이 plane이 OMO-lite의 핵심이다.

### 3. Execution Plane

실제 작업을 수행한다.

- `Claude`
- `Codex worker`
- Codex가 만든 bounded subagents/workers

### 4. Evidence Plane

작업 증거와 상태를 남긴다.

- `.workflow-v2/work-items/*.json`
- `.workflow-v2/status.json`
- `.artifacts/agent-plan-loop/*`
- `.artifacts/agent-review-loop/*`
- PR / CI / verification logs

## Actor Model

### Codex Supervisor

OMO-lite의 중심이다.

책임:

- 현재 stage 판별
- precondition 확인
- 다음 actor 선택
- 정확한 요청 프롬프트 생성
- plan loop 실행 여부 판단
- exceptional recovery에서만 review loop 실행 여부 판단
- worker 생성/회수
- verification 실행
- 상태 파일 갱신
- stalled/blocker escalation

### Claude

희소한 high-value reviewer다.

책임:

- Stage 1 workpack 문서 작성
- Stage 3 백엔드 리뷰
- Stage 5 디자인 리뷰
- Stage 6 프론트 리뷰
- blocker/stalled에서 중요한 방향 판단

### Codex Workers

Codex supervisor가 필요할 때만 생성하는 bounded executor다.

권장 역할:

- `explorer`
- `testing`
- `security`
- `design-system`
- `ci-governance`
- `performance`

### Human

최종 escalation target이다.

언제 개입:

- blocker
- stalled
- product rule ambiguity
- external smoke failure
- Claude unavailable 상태가 장기화된 경우

## Stage Supervisor Model

OMO-lite는 slice workflow의 각 stage를 상태 기계처럼 다룬다.

### Stage 1

1. slice 상태가 `planned`인지 확인
2. 선행 슬라이스가 `merged/bootstrap`인지 확인
3. Claude에 Stage 1 요청
4. `README.md`, `acceptance.md` 존재 확인
5. PR open / merge 확인
6. 상태 `planned -> docs`

### Stage 2

1. Stage 1 merge 확인
2. 필요 시 plan loop 실행
3. Codex에 백엔드 구현 요청
4. TDD / contract / tests 확인
5. Draft PR / CI / Ready 상태 확인
6. 상태 `docs -> in-progress`

### Stage 3

1. PR not Draft 확인
2. required CI green 확인
3. Claude 리뷰 요청
4. 수정 요청이면 다시 Codex에 routing
5. 승인되면 merge 감시

### Stage 4

1. 백엔드 merge 확인
2. 필요 시 plan delta check
3. Codex에 프론트 구현 요청
4. UI state / contract consumption / tests 확인
5. Draft PR / CI / Ready 상태 확인

### Stage 5

1. 디자인 리뷰 전제 조건 확인
2. Claude에 디자인 리뷰 요청
3. spacing/token/state 문제면 Codex에 다시 routing

### Stage 6

1. FE PR not Draft + CI green 확인
2. Claude FE 코드 리뷰 요청
3. 수정 요청이면 Codex fix routing
4. 승인 후 merge 감시
5. 상태 `in-progress -> merged`

## Loop Placement

### Plan Loop

역할:

- 구현 전에 모호한 범위를 줄이는 planning gate

trigger:

- medium/high risk
- infra-governance
- ambiguous contract
- new integration

supervisor 동작:

1. workpack/official docs 읽기
2. `agent-plan-loop` 실행
3. `approved`면 다음 stage 진행
4. `stalled/blocked`면 escalation

### Review Loop

역할:

- docs-governance, workflow/tooling 변경, 또는 exceptional recovery에서 diff를 자동 수렴

trigger:

- infra-governance
- cross-cutting workflow/tooling change
- 정식 Stage 리뷰 후 반복 수정이 길어지는 exceptional recovery

지원 대상:

- working tree diff
- PR diff (`--base-ref`, `--head-ref`)
- commit range

supervisor 동작:

1. diff 수집
2. `agent-review-loop` 실행
3. verification 결과 확인
4. `approved`면 recovery 종료
5. `needs_revision/stalled/blocked`면 Codex fix 또는 escalation

## Claude Token Budget Model

이 설계의 중요한 전제다.

### Default Policy

- Claude는 `sparse, high-value checkpoints`에만 사용한다.
- Codex는 `always-on execution and recovery engine`으로 사용한다.

### Claude Unavailable Mode

Claude가 토큰 소진 등으로 멈추면 아래처럼 동작한다.

1. Codex supervisor는 임시 reviewer subagent를 생성할 수 있다.
2. 이 결과는 `provisional review`로만 기록한다.
3. 최종 상태는 `dual-approved`가 아니라 `awaiting_claude_or_human`이다.
4. Claude 복귀 또는 human approval이 있어야 final merge-ready가 된다.

즉, Claude 대체가 아니라 `Claude 절약 + fallback buffering`이다.

## Worker Orchestration Rules

- worker는 disjoint scope만 맡는다.
- 같은 파일을 여러 worker에게 동시에 주지 않는다.
- 긴급 blocking task는 supervisor인 Codex가 직접 처리한다.
- worker 결과 통합 책임은 Codex supervisor에 있다.
- Claude는 worker 결과를 승인 없이 merge-ready로 간주하지 않는다.

## Supervisor Responsibilities

OMO-lite supervisor가 반드시 자동화해야 하는 항목:

- stage entry/exit condition check
- branch naming check
- workpack/status sync
- PR draft/ready transition check
- CI green check
- required artifact existence check
- loop result parse
- verification command execution
- unresolved question / blocker routing

## Required Evidence

slice 하나를 감독했다면 최소한 아래가 남아야 한다.

- work item metadata
- status transition history
- plan-loop final summary (사용 시)
- review-loop final summary (docs-governance / exceptional recovery에서만)
- verification result
- PR URL
- remaining risks 또는 out-of-scope note

## Safety Rules

### Dual Approval Stays

Codex supervisor가 있어도 `Claude approve + Codex approve` 원칙은 유지한다.

### Single Writer Rule

authoritative artifact는 한 시점에 한 agent만 수정한다.

### No Silent Drift

공식 문서에 없는 API, 상태, 필드, endpoint를 임의 추가하지 않는다.

### External Smoke Gate

auth / OAuth / deployment 같은 외부 의존 작업은 test green만으로 닫지 않는다.

## Homecook Mapping

### 지금 바로 적용 가능한 부분

- Codex supervisor 개념
- slice stage state machine
- plan loop auto-trigger policy
- review loop는 non-slice governance / exceptional recovery에만 사용
- `.workflow-v2` 상태 추적
- Claude sparse review model
- Codex provisional fallback review
- Codex stage direct execution binding + `.artifacts/omo-lite-dispatch/*` artifact bundle
- automatic Claude budget resolution + repo-local override file

### 아직 추가로 만들어야 할 것

- supervisor summary artifact
- external smoke artifact schema

## Recommended Rollout

### Phase 0

완료:

- workflow v2 foundation
- review-loop PR diff / commit range 지원

### Phase 1

다음 pilot:

- `02-discovery-filter`를 대상으로
- `v1 authoritative path + OMO-lite supervision` 적용
- handoff, review round, CI recovery 데이터를 수집

### Phase 2

supervisor helper 추가:

- stage precondition checker
- loop dispatcher
- status sync tool

### Phase 3

완료:

- Claude budget-aware mode
- sparse review scheduling
- provisional fallback review
- repo-local override file

### Phase 4

완료:

- Codex stage runner
- dispatch artifact bundle
- repo-local OpenCode/OMO execution path

### Phase 5

다음:

- Supabase / OAuth / env / callback URL

## Decision

Homecook의 권장 방향은 아래다.

- full OMC 도입이 아니라 `Codex supervisor 기반 OMO-lite`
- Claude는 scarce reviewer, Codex는 always-on workflow supervisor
- slice workflow는 유지하고, OMO-lite가 그 위에서 stage를 자동 집행

이 방향이 현재 저장소의 문서 중심 문화와 토큰 현실을 동시에 만족시키는 가장 현실적인 구조다.
