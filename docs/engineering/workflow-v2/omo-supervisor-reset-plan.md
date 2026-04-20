# OMO Supervisor Reset Plan

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 범위: Homecook OMO supervisor / workflow-v2 / meta-harness reset plan
- 이 문서는 slice07과 그 이전 pilot 운영에서 누적된 OMO failure family를 "개별 패치 backlog"가 아니라 "시스템 축소와 재잠금" 관점에서 다시 정리하기 위한 계획 문서다.
- 목표는 supervisor를 더 똑똑하게 덧대는 것이 아니라, 책임을 줄이고 규칙 표면을 축소해 반복 가능한 kernel만 남기는 것이다.

## Why This Reset Exists

slice07 failure log는 단일 슬라이스의 특수 사고 기록이 아니다.
그동안 수동 patch와 exceptional recovery로 넘어간 실패가 slice07에서 처음 구조적으로 드러난 것이다.

현재 징후:

- stage-result 계약, checklist closeout, PR body, `.workflow-v2/*`, runtime state가 서로 다른 truth surface처럼 동작한다.
- supervisor가 orchestration뿐 아니라 semantic reviewer, closeout reconciler, PR/CI recovery operator, bookkeeping repair engine 역할까지 동시에 떠안고 있다.
- Claude/Codex stage actor는 구현보다 규칙 회피에 더 많은 에너지를 쓰게 되고, 문서/프롬프트 길이도 계속 늘어난다.
- merged/passed 상태는 남지만, manual patch / stale lock / retry / recovery cost는 공식 tracked state에서 사라진다.
- auditor는 실제 incident corpus를 거의 읽지 않아 "현실과 다른 green"을 만들 수 있다.

즉 현재 문제는 버그 수보다도 "시스템의 역할 과적재"에 가깝다.

## Problem Statement

현재 OMO는 아래 역할을 동시에 하려 한다.

1. stage orchestrator
2. session/runtime/lock manager
3. semantic contract reviewer
4. closeout bookkeeping synchronizer
5. PR body / CI / current-head recovery operator
6. promotion-readiness narrator

이 구조는 세 가지 비용을 만든다.

- 규칙이 늘수록 예외 경로가 늘고, slice 구현 에이전트는 제품 작업보다 workflow 회피에 집중하게 된다.
- true source of truth가 분산되어 drift가 operational burden이 된다.
- "최종적으로는 merged"라는 결과만 남고, 그 과정에서 시스템이 얼마나 자주 망가졌는지는 측정되지 않는다.

## Reset Hypothesis

대부분의 OMO failure는 개별 기능 누락보다 아래 4개 mismatch에서 나온다.

1. truth surface mismatch
2. supervisor responsibility mismatch
3. runtime model mismatch
4. observability and measurement mismatch

따라서 개선 방향도 "세부 예외를 더 추가"하는 것이 아니라 아래를 줄이는 데 있어야 한다.

- authoritative state surface 수
- supervisor가 직접 의미 판단하는 영역
- 장수 세션과 긴 프롬프트 의존도
- stage actor가 반드시 읽어야 하는 governing prose 양

## Reset Principles

### 1. Delete Before Add

- 새 상태, 새 validator, 새 예외를 추가하기 전에 동일 역할을 하는 기존 surface를 제거한다.
- 문서, runtime, PR body, tracked JSON가 같은 사실을 중복 소유하면 reset 대상이다.

### 2. Thin Supervisor

- supervisor는 orchestration, deterministic validation, state transition, runtime recovery만 맡는다.
- nuanced semantic judgment와 최종 제품 의미 판단은 stage actor와 explicit review artifact에 남기고 supervisor는 이를 "해석"하지 않는다.

### 3. One Canonical Closeout State

- closeout truth는 한 surface에서만 authoritative 하게 관리한다.
- README, acceptance, PR body, `.workflow-v2/status.json`는 projection 또는 evidence carrier로 본다.

### 4. Incident Visibility Over Green Cosmetics

- merged/passed만 저장하지 않는다.
- stale lock, manual patch, CI stale wait, contract auto-repair, retry count를 운영 품질 신호로 남긴다.

### 5. Shorter Rules, Smaller Reads

- stage actor가 읽어야 하는 핵심 rule set을 줄인다.
- 길고 반복적인 prose 규칙보다 machine-checkable contract를 우선한다.

### 6. Separate Product Bugs From OMO Bugs

- slice07 auth override/E2E route wiring 같은 제품 결함은 OMO runtime failure와 같은 backlog에 넣지 않는다.
- OMO reset은 workflow/tooling/system 문제에 집중한다.

## What The Reset Will Stop Doing

- supervisor를 "최종 semantic reviewer"처럼 확장하지 않는다.
- stage-owned bookkeeping drift를 ad-hoc patch로 계속 봉합하지 않는다.
- promotion readiness를 docs/ledger 일치만으로 선언하지 않는다.
- 긴 session reuse를 기본값처럼 유지하지 않는다.
- 여러 governing doc에 같은 규칙을 장문으로 반복하지 않는다.
- merged slice의 recovery history를 버리지 않는다.

## Target Kernel

reset 이후 supervisor kernel은 아래만 확실하게 책임진다.

1. stage dispatch and actor routing
2. structured artifact ingestion (`stage-result`, review artifact)
3. runtime lock / heartbeat / retry / stale recovery
4. current-head PR / CI tracking
5. deterministic gate execution
6. canonical closeout snapshot projection

아래는 kernel 밖으로 밀어낸다.

- 과도한 semantic reconciliation
- multi-surface markdown patching
- promotion narrative self-certification
- 비용이 큰 long-session persistence를 기본 전제로 한 운영

## Reset Scope Buckets

### Bucket A. Governance Simplification

- `AGENTS.md`, `slice-workflow.md`, `agent-workflow-overview.md`, `workflow-v2/*`, `.opencode/README.md`의 역할 경계를 다시 자른다.
- stage actor가 읽는 core doc set과 engineering operator가 읽는 core doc set을 분리한다.
- 같은 규칙의 반복 서술을 제거한다.

### Bucket B. Canonical State Reduction

- closeout state의 authoritative owner를 하나로 줄인다.
- README / acceptance / PR body / tracked status의 projection 규칙을 명시한다.
- recovery history surface를 별도로 둔다.

### Bucket C. Supervisor Contract Reset

- stage-result를 stage type별로 더 작고 엄격한 contract로 재정의한다.
- implementation stage는 full checklist snapshot을 필수로 한다.
- authority precheck 같은 subphase는 delta-only evidence를 허용하되 supervisor가 prior snapshot을 deterministic merge 하게 한다.

### Bucket D. Runtime / Observability Reset

- `running` 단일 상태를 더 이상 쓰지 않는다.
- heartbeat, live process, transcript freshness, stale lock, retry due, current subphase를 상태에 직접 노출한다.
- operator용 `tail`/summary surface를 만든다.

### Bucket E. PR / CI Integration Reset

- PR body evidence를 canonical closeout state에서 projection한다.
- current-head 재평가와 stale `pr_checks_failed` snapshot 폐기를 자동화한다.
- body-only change, rerun, no-op commit recovery 같은 awkward path를 줄인다.

### Bucket F. Auditor / Promotion Reset

- auditor는 recent slice, in-flight slice, incident corpus, runtime anomaly를 기본 입력으로 읽는다.
- promotion readiness는 "문서가 맞다"보다 "incident가 줄고 replay가 통과한다"를 기준으로 다시 정의한다.

### Bucket G. Session / Cost Reset

- 장수 session reuse를 기본값이 아니라 opt-in optimization으로 내린다.
- stage-local context rebase, session rollover, compaction-aware resume를 넣는다.

## Execution Plan

### Phase 0. Freeze, Downgrade, Retrospective

목적:

- 더 많은 patch를 쌓기 전에 OMO를 "개선 중인 candidate system"으로 다시 선언한다.
- slice07 failure log를 시작점으로 삼되, prior slice에서 수동 복구했던 failure까지 retrospective corpus로 끌어온다.

작업:

- `OMO Supervisor Reset Plan` 잠금
- slice03~slice07 + OMO pilot PR retrospective
- slice07 failure log를 incident registry의 seed corpus로 승격
- promotion readiness를 `ready` 전제에서 다시 점검하는 별도 backlog 생성

산출물:

- reset plan doc
- incident taxonomy / registry (`omo-incident-registry.md`)
- reset 동안의 freeze rule

완료 기준:

- "무엇이 OMO bug이고 무엇이 product bug인지" 분류 표가 생긴다.
- failure corpus가 slice07 한 건에만 묶여 있지 않다.

### Phase 1. Rule Surface Reduction

목적:

- stage actor와 operator가 읽는 core rule set을 줄인다.

작업:

- governing docs별 단일 책임 재정의
- repeated rule text 제거
- stage actor required reads 상한 정의
- prose-heavy rule을 machine-checkable contract 우선으로 대체

산출물:

- doc responsibility map
- `omo-governance-surface-map.md`
- slimmed reading order
- duplicate-to-projection cleanup list

완료 기준:

- 같은 규칙이 여러 문서에 장문으로 반복되지 않는다.
- stage actor core reads가 현재보다 눈에 띄게 줄어든다.

### Phase 2. Canonical Closeout State Reset

목적:

- closeout truth surface를 줄인다.

작업:

- canonical closeout snapshot 정의
- README / acceptance / PR body / `.workflow-v2/status.json` projection mapping 정의
- supervisor writable scope 축소
- recovery history schema 추가

산출물:

- `omo-canonical-closeout-state.md`

완료 기준:

- closeout drift의 source가 하나로 수렴한다.
- manual markdown patch 없이 projection 재생성이 가능하다.

### Phase 3. Supervisor Contract Reset

목적:

- stage-result와 review artifact contract를 작고 명확하게 다시 잠근다.

작업:

- implementation / review / authority subphase contract 분리
- semantic incomplete result의 early rejection
- full snapshot vs delta evidence merge 규칙 문서화
- stage-owned checklist handling deterministic path 도입

완료 기준:

- `result=done`인데 checklist가 비어 있는 상태를 finalize 직전이 아니라 artifact ingest 시점에 막는다.
- authority precheck가 prior implementation snapshot을 deterministic하게 계승한다.

### Phase 4. Runtime and Observability Reset

목적:

- operator가 지금 시스템이 실제로 살아 있는지 즉시 판단할 수 있게 한다.

작업:

- status vocabulary 세분화
- heartbeat / transcript freshness / live process / lock owner 노출
- stale lock recovery policy 재정의
- `omo:tail` 또는 동등 표면 도입

완료 기준:

- `stage_running`과 stale residue를 구분할 수 있다.
- `skip_locked -> none` dead-end가 operator blind spot으로 남지 않는다.

### Phase 5. PR / CI Recovery Reset

목적:

- current-head 기준 PR/CI 상태를 runtime이 놓치지 않게 한다.

작업:

- PR body evidence projection
- policy rerun semantics 정리
- head SHA drift 재평가
- stale `pr_checks_failed` snapshot automatic invalidation

완료 기준:

- `gh pr checks`는 green인데 runtime은 failed 상태로 남는 mismatch가 자동 복구된다.
- PR body evidence 누락 때문에 no-op commit recovery를 강제하지 않는다.

### Phase 6. Auditor Reset

목적:

- auditor가 현실 incident를 읽도록 바꾼다.

작업:

- default sample에 recent/in-flight slice 포함
- incident corpus ingestion
- runtime anomaly / manual patch / recovery count finding 추가
- promotion readiness 판단 기준을 incident-aware로 수정

완료 기준:

- slice07 급의 failure family가 findings 0으로 묻히지 않는다.
- `ready` verdict는 replay evidence 없이는 나오지 않는다.

### Phase 7. Session / Cost Reset

목적:

- context explosion과 cost spike를 구조적으로 줄인다.

작업:

- session rollover policy
- stage-local context rebasing
- compaction-aware resume
- cost telemetry를 runtime summary에 연결

완료 기준:

- Stage 4/5 장수 세션 비용이 운영 가능한 수준으로 내려간다.
- context 유지가 필요할 때와 잘라야 할 때가 contract로 잠긴다.

### Phase 8. Replay Acceptance

목적:

- patch가 아니라 reset이었는지 검증한다.

대상:

- `06-recipe-to-planner`
- `07-meal-manage`
- bugfix lane 1건
- control-plane smoke lane 1건

합격 기준:

- manual runtime JSON edit 없이 완료
- stale lock 수동 해제 없이 완료
- stale CI snapshot 수동 보정 없이 완료
- canonical closeout projection이 validator를 통과
- auditor가 unresolved runtime smell을 그대로 적발

## Success Metrics

reset이 성공했다는 의미는 아래를 동시에 만족하는 것이다.

- stage actor required reads가 줄었다.
- supervisor state vocabulary는 더 적고 더 명확해졌다.
- canonical truth surface 수가 줄었다.
- merged slice에 recovery history가 남는다.
- 최근 representative slice replay에서 manual patch가 사라진다.
- auditor가 현실과 반대로 "all green"을 말하지 않는다.

## Failure Signals

아래 중 하나라도 남으면 reset이 아니라 patch accumulation으로 본다.

- 새 예외 상태를 추가했는데 기존 상태는 줄지 않았다.
- PR body / README / acceptance / tracked status가 여전히 같은 사실을 각자 소유한다.
- stage actor가 읽어야 하는 prose 양이 오히려 늘어난다.
- supervisor가 semantic reviewer 역할을 계속 확장한다.
- replay 없이 ledger만 맞춰 `ready`를 복구한다.

## Immediate Next Actions

1. slice03 residual artifact backfill + slice06 local evidence preservation rule 정리
2. OMO/product incident boundary 표 정교화
3. canonical closeout state owner 선택(work item embed vs dedicated closeout file)
4. auditor reset 요구사항 정의
5. promotion `candidate/not-ready -> ready/default` cutover replay 기준 초안 작성

## Decision Rule

이 문서 이후의 OMO 개선 PR은 기본적으로 아래 질문을 먼저 통과해야 한다.

> 이 변경은 supervisor를 더 많이 알게 만드는가, 아니면 덜 하게 만드는가?

전자라면 기본값은 보류다.
후자라면 reset 후보로 검토한다.
