# OMO Auditor Reset Requirements

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 목적: OMO reset Phase 6에서 meta-harness-auditor가 현실 incident를 놓치지 않도록 입력, 샘플링, finding, 승격 판정 기준을 다시 잠그기 위한 요구사항 문서

## Why This Document Exists

현재 auditor는 존재 자체가 문제인 것은 아니다.
문제는 "무엇을 읽고 무엇을 무시하는지"가 너무 좁다는 점이다.

실제 오판 사례가 이미 있다.

- `.artifacts/meta-harness-auditor/2026-04-20T10-11-50.130Z/report.md`
  - `Overall score: 5/5`
  - `Findings: 0`
  - `Promotion readiness: ready`
  - `Sampled slices: 01-discovery-detail-auth, 02-discovery-filter, 03-recipe-like`
- 같은 시점에 `omo-incident-registry.md`에는 slice04~07과 promotion cutover drift가 `open` 또는 `backfill-required`로 남아 있다.
- `scripts/lib/meta-harness-auditor.mjs`는 기본 sample slice를 workpack directory 정렬 후 앞의 3개만 사용한다.
- 현재 finding registry는 `H-CI-001`, `H-GOV-001`, `H-OMO-001` 세 개만 가진다.

즉 현 상태의 auditor는 "실패가 없다"가 아니라
"현실 incident corpus를 거의 읽지 않는다"에 가깝다.

## Relationship To Reset

이 문서는 reset plan의 `Phase 6. Auditor Reset`에 해당한다.

이 Phase의 목표는 auditor를 더 복잡하게 만드는 것이 아니라,
아래 네 가지를 강제하는 것이다.

1. 최근 representative reality를 읽게 만들기
2. incident/recovery cost를 finding으로 올리기
3. `ready` verdict를 replay-aware 판정으로 낮추기
4. score/report가 confidence를 솔직하게 표현하게 만들기

## Current Failure Modes

### 1. Sample Bias Toward Early Slices

- 현재 기본 sample은 `resolveSampleSlices()`에서 정렬된 slice 디렉터리의 앞 3개만 읽는다.
- 그 결과 slice06, slice07, recent bugfix, in-flight pilot이 기본 입력에서 빠질 수 있다.
- earliest slice 중심 sample은 현재 시스템의 고장 양상을 대표하지 못한다.

### 2. Finding Family Coverage Is Too Narrow

- 현재 active detector는 사실상 세 가족뿐이다.
  - CI path gap
  - bookkeeping overlap
  - promotion readiness text/evidence gap
- runtime stale lock, manual handoff, missing artifact retention, Stage 4/authority_precheck contract drift, PR/CI stale snapshot은 기본 detector에 없다.

### 3. Promotion Verdict Over-Trusts Ledger State

- `buildMetaHarnessPromotionReadiness()`는 finding bucket과 ledger status를 중심으로 verdict를 만든다.
- unresolved OMO incident, missing retrospective evidence, replay failure family는 직접 blocker로 계산하지 않는다.
- 그래서 incident registry가 열려 있어도 `promotion_evidence.status=ready`면 `ready`에 가까운 결론이 나올 수 있다.

### 4. Confidence Reporting Is Too Optimistic

- report는 5/5와 findings 0을 쉽게 출력하지만,
  sample이 좁거나 optional evidence가 누락된 경우 confidence를 실질적으로 낮추지 않는다.
- artifact missing이나 local-only evidence gap이 있어도 "unknown risk"를 score/report에 충분히 반영하지 않는다.

## Non-Goals

- auditor가 product correctness 자체를 채점하는 도구가 되지는 않는다.
- stage actor의 semantic review를 auditor가 대체하지 않는다.
- incident narrative 전체를 auditor output에 다 복제하지 않는다.
- reset 초기부터 autofix 대상을 넓히지 않는다.

## Required Inputs

reset 이후 auditor는 아래 입력을 기본적으로 고려해야 한다.

### Required

- `docs/engineering/workflow-v2/omo-incident-registry.md`
- `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`
- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`
- `docs/engineering/workflow-v2/promotion-readiness.md`
- `.workflow-v2/promotion-evidence.json`
- `.workflow-v2/replay-acceptance.json`
- `.workflow-v2/status.json`
- representative `.workflow-v2/work-items/*.json`
- 최근 `.artifacts/meta-harness-auditor/*` bundle 1개 이상

### Required When Present

- `.artifacts/omo-findings/slice07-omo-failure-log.md`
- `.opencode/omo-runtime/*.json`
- recent `.artifacts/omo-supervisor/**/summary.json`
- recent `~/Library/Logs/homecook/omo-tick-*.log` evidence that has been copied or referenced into repo docs

### Rule

- required-when-present input이 있는데 audit context에 포함되지 않았다면, auditor는 `coverage gap`을 finding 또는 confidence downgrade로 반영해야 한다.

## Sampling Requirements

### Default Sample Set

explicit sample이 없더라도 기본 sample은 아래를 포함해야 한다.

1. 최근 merged product slice 2개 이상
2. authority-required representative slice 1개
3. current in-flight slice 1개가 있으면 반드시 포함
4. recent bugfix or control-plane lane 1개
5. incident registry에서 `open` 또는 `backfill-required`인 slice family 1개 이상

### Forbidden Default

아래는 reset 이후 금지한다.

- earliest slice 3개만 읽는 default
- incident registry를 읽지 않은 채 `findings 0` 출력
- in-flight slice가 있는데 sample에서 빠진 상태로 promotion verdict 계산

### Audit Context Requirements

`audit-context.json`에는 아래가 추가로 남아야 한다.

- sampled slice selection reason
- incident IDs consulted
- runtime artifacts consulted
- missing evidence summary
- confidence downgrade reasons

## Finding Model Requirements

reset 이후 finding registry는 최소 아래 families를 지원해야 한다.

### Family A. Incident Coverage Gap

- incident registry의 `open` / `backfill-required` 항목을 현재 audit가 읽지 않았거나 반영하지 않은 경우

### Family B. Runtime Anomaly

- stale lock
- `skip_locked -> none`
- `stage_running` residue
- blocked retry / human escalation loop
- missing heartbeat / transcript freshness visibility

### Family C. Contract Drift

- `stage-result` missing
- semantic incomplete result
- authority_precheck delta/full snapshot mismatch
- closeout projection owner drift

### Family D. Artifact Retention Gap

- tmp path / off-repo path만 canonical evidence처럼 남아 있는 경우
- repo-local artifact retention이 없는 경우

### Family E. PR / CI Reality Drift

- current head green인데 runtime은 failed snapshot 유지
- PR body evidence가 projection이 아니라 handwritten dependency가 되는 경우
- body-only recovery 때문에 no-op commit이 필요한 경우

### Family F. Promotion Drift

- incident가 unresolved인데 ledger/status만으로 `ready`가 선언된 경우
- `not-ready`와 `ready` evidence가 같은 cutover window에 공존하는 경우

## Promotion Readiness Requirements

reset 이후 auditor는 아래를 만족하지 않으면 `ready` verdict를 내리면 안 된다.

1. incident registry에 recent `open` OMO-system incident가 남아 있지 않다.
2. `backfill-required` incident가 있다면 `artifact-missing accepted` 같은 명시적 disposition이 있다.
3. representative replay acceptance가 통과했다.
4. manual handoff가 representative lane의 사실상 기본 completion path가 아니다.
5. promotion evidence와 recent runtime/incident corpus가 서로 모순되지 않는다.

### Verdict Policy

- `not-ready`
  - unresolved open incident
  - replay missing
  - major evidence gap
  - promotion drift 발견
- `candidate`
  - structure는 맞지만 replay 또는 backfill disposition이 아직 미완료
- `ready`
  - replay passed
  - incident-aware audit passed
  - promotion evidence, runtime evidence, incident corpus가 서로 일치
  - replay ledger가 required lane `pass`를 명시한다.

## Scorecard And Confidence Rules

### Confidence Downgrade Triggers

아래 중 하나라도 있으면 관련 axis confidence를 `medium` 이하로 낮춘다.

- sample coverage 부족
- incident registry open item 미반영
- artifact missing
- local-only evidence gap
- 최근 runtime anomaly evidence 미검토

### Score Guardrail

- unresolved runtime anomaly family가 있으면 `automation / OMO runtime` 축은 5/5를 줄 수 없다.
- promotion drift family가 있으면 governance 축과 automation 축 모두 5/5를 줄 수 없다.
- findings 0은 "sample coverage satisfied + incident coverage satisfied + recent runtime anomaly absent"일 때만 허용한다.

## Output Bundle Requirements

reset 이후 audit bundle에는 아래가 추가되어야 한다.

- `incident-coverage.json`
- `runtime-anomaly-summary.json`
- `promotion-rationale.json`

그리고 `report.md`는 최소 아래를 보여야 한다.

- 어떤 incident IDs를 읽었는지
- 어떤 sample slices를 왜 읽었는지
- 어떤 evidence가 없어서 confidence를 낮췄는지
- 왜 `candidate` 또는 `ready`가 아닌지

## Implementation Constraints

- 초기 구현은 requirements-first로 간다.
- detector 추가 전에 finding registry와 schema부터 넓힌다.
- `fix-one-finding` 범위는 이번 reset 동안 확대하지 않는다.
- incident registry narrative를 auditor code 안에 복붙하지 않고, stable IDs와 compact signals로 연결한다.

## Acceptance Criteria

이 문서가 실제로 반영됐다면 최소 아래가 성립해야 한다.

1. slice07 failure family가 기본 audit에서 더 이상 `findings 0`으로 묻히지 않는다.
2. slice06 manual handoff/history가 promotion verdict에 반영된다.
3. recent open incident가 있는데 `ready`가 나오는 경우가 사라진다.
4. audit report가 sample selection과 confidence 한계를 숨기지 않는다.

## Immediate Follow-Up

1. auditor bundle/schema 확장 초안 작성
2. detector를 `sample coverage -> incident coverage -> runtime anomaly -> promotion drift` 순으로 추가
3. promotion verdict builder를 incident-aware / replay-aware 정책으로 교체
4. replay acceptance 이후에만 `ready` verdict 복구
