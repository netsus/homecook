# OMO Governance Surface Map

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 목적: OMO reset Phase 1에서 "누가 어떤 문서를 반드시 읽어야 하는지"를 줄이기 위한 책임 경계 맵

## Why This Document Exists

현재 Homecook OMO 규칙 표면은 넓다.

- `AGENTS.md`: 137 lines
- `agent-workflow-overview.md`: 295 lines
- `slice-workflow.md`: 691 lines
- `workflow-v2/README.md`: 202 lines
- `.opencode/README.md`: 175 lines
- `omo-autonomous-supervisor.md`: 490 lines
- `omo-lite-supervisor-spec.md`: 411 lines

즉 stage actor와 operator가 "무엇을 알아야 하는지"가 명확히 분리되지 않으면, 문서 길이보다 문서 진입 비용이 더 큰 문제가 된다.

이 문서의 목표는 새 규칙을 추가하는 것이 아니라 아래를 자르는 것이다.

1. stage actor 필수 읽기
2. operator 필수 읽기
3. implementation maintainer 필수 읽기
4. projection 또는 링크로 대체 가능한 중복 설명

## Current Problem

현재는 아래 현상이 동시에 있다.

- `AGENTS.md`가 공통 원칙과 문서 레이어를 설명한다.
- `agent-workflow-overview.md`도 문서 레이어와 gate를 설명한다.
- `slice-workflow.md`는 stage owner와 절차를 상세히 설명한다.
- `workflow-v2/README.md`와 `.opencode/README.md`는 runtime/OMO 경로를 다시 설명한다.
- supervisor spec 문서들이 operator-facing entry doc처럼 읽히지만 실제로는 implementation maintainer 문서에 가깝다.

결과적으로 "모두 중요해 보이는" 상태가 된다.

## Role Buckets

### 1. Stage Actor

정의:

- 실제 slice 작업을 수행하는 Claude/Codex
- 목표는 제품 stage를 수행하는 것이지 OMO internals를 유지보수하는 것이 아니다

필수 읽기 target:

- `AGENTS.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- 해당 `docs/workpacks/<slice>/README.md` + `acceptance.md`
- `docs/engineering/slice-workflow.md` 중 현재 stage section
- `docs/engineering/agent-workflow-overview.md` 중 현재 change type gate

원칙:

- stage actor는 `workflow-v2` implementation spec 전체를 기본 읽기로 요구받지 않는다.
- product stage actor 기본 읽기 경로에는 `workflow-v2` maintainer spec을 넣지 않는다.
- stage actor는 conditional doc만 trigger 기반으로 읽는다.
  - 예: authority-required면 `product-design-authority.md`
  - 예: QA 작업이면 `qa-system.md`

### 2. Codex Orchestrator

정의:

- OMO run 전체에서 현재 blocker를 분류하고 repair/retry/escalation route를 결정하는 Codex
- product stage actor와 OMO maintainer 사이에서 운영 판단을 맡지만, OMO internals를 직접 모두 유지보수하지는 않는다

필수 읽기 target:

- `docs/engineering/workflow-v2/README.md`
- `docs/engineering/workflow-v2/omo-codex-orchestrated-rail.md`
- `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`
- `docs/engineering/workflow-v2/omo-incident-registry.md`
- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`
- 필요 시 해당 maintainer spec 또는 runtime/test code

원칙:

- Codex orchestrator는 stage actor ownership과 orchestration ownership을 섞지 않는다.
- `codex_repairable`, `claude_repairable`, `ci_wait`, `blocked_on_external`, `manual_decision_required`를 먼저 분류한 뒤 route를 고른다.
- `human_escalation`은 실제 사람 결정이 필요할 때만 사용한다.
- OMO maintainer spec은 runtime/report/tooling 변경이 필요할 때만 읽는다.

### 3. OMO Operator

정의:

- supervisor reset, runtime recovery, promotion gate, retrospective를 다루는 사람/에이전트

필수 읽기 target:

- `docs/engineering/workflow-v2/README.md`
- `.opencode/README.md`
- `docs/engineering/workflow-v2/omo-supervisor-reset-plan.md`
- `docs/engineering/workflow-v2/omo-incident-registry.md`
- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`
- 필요 시 `docs/engineering/workflow-v2/promotion-readiness.md`

원칙:

- operator는 product slice SOP 전체를 stage actor처럼 반복해서 읽지 않는다.
- operator는 source-of-truth보다 runtime/recovery/promotion 경계를 우선 읽는다.

### 4. OMO Implementation Maintainer

정의:

- supervisor/runtime/validator/code를 직접 수정하는 사람/에이전트

필수 읽기 target:

- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`
- `docs/engineering/workflow-v2/omo-autonomous-supervisor.md`
- `docs/engineering/workflow-v2/omo-lite-supervisor-spec.md`
- `docs/engineering/workflow-v2/omo-evaluator.md`
- 관련 `scripts/lib/*`, `tests/omo-*`

원칙:

- 이 문서들은 product stage actor 기본 읽기가 아니다.
- implementation detail은 maintainer surface로 격리한다.

## Proposed Target Surface

### Stage Actor Core Set

- `AGENTS.md`
- `CURRENT_SOURCE_OF_TRUTH.md`
- workpack README + acceptance
- `slice-workflow.md`의 현재 stage section
- `agent-workflow-overview.md`의 current change type / gate section

### Codex Orchestrator Core Set

- `workflow-v2/README.md`
- `omo-codex-orchestrated-rail.md`
- `omo-supervisor-reset-plan.md`
- `omo-incident-registry.md`
- `omo-canonical-closeout-state.md`

### Operator Core Set

- `workflow-v2/README.md`
- `.opencode/README.md`
- `omo-codex-orchestrated-rail.md`
- `omo-supervisor-reset-plan.md`
- `omo-incident-registry.md`

### Maintainer Core Set

- `omo-autonomous-supervisor.md`
- `omo-lite-supervisor-spec.md`
- `omo-evaluator.md`
- runtime / validator / test code

## Keep / Slim / Project / Retire Map

| Doc | Current Role | Target Role | Action |
|-----|--------------|-------------|--------|
| `AGENTS.md` | 공통 원칙 + read-first + 레이어 설명 | 공통 원칙 / 가드레일만 유지 | `slim` |
| `CLAUDE.md` | Claude entry | Claude 전용 entry 유지 | `keep` |
| `agent-workflow-overview.md` | change type / gate / 일부 문서 레이어 | change type / required checks / loop gate만 유지 | `slim` |
| `slice-workflow.md` | stage SOP + closeout contract + 공통 규칙 일부 재서술 | stage SOP 중심 유지 | `slim` |
| `workflow-v2/README.md` | operator entry + spec index | operator entry 유지 | `keep` |
| `omo-codex-orchestrated-rail.md` | 없음 | Codex orchestration owner / reason code / baseline decision | `keep (temporary)` |
| `.opencode/README.md` | runtime/provider/operator note | operator runtime note 유지 | `keep` |
| `omo-autonomous-supervisor.md` | operator도 읽는 듯한 spec | maintainer spec로 명확히 격리 | `project` |
| `omo-lite-supervisor-spec.md` | operator도 읽는 듯한 spec | maintainer spec로 명확히 격리 | `project` |
| `omo-supervisor-reset-plan.md` | reset strategy | Phase 0~8 동안 유지 | `keep (temporary)` |
| `omo-incident-registry.md` | incident corpus | replay acceptance 전까지 유지 | `keep (temporary)` |

## Immediate Duplicate Cleanup Candidates

### Candidate 1. 문서 레이어 설명 중복

현재 위치:

- `AGENTS.md`
- `agent-workflow-overview.md`

목표:

- 원칙적 hierarchy는 `AGENTS.md`에 남기고
- `agent-workflow-overview.md`는 gate semantics만 남긴다.

### Candidate 2. 브랜치/closeout 규칙의 장문 재서술

현재 위치:

- `AGENTS.md`
- `slice-workflow.md`
- `.opencode/README.md`

목표:

- actor-facing 규칙은 `AGENTS.md` + `slice-workflow.md`
- runtime/operator 설명은 `.opencode/README.md`
- 같은 의미의 장문 재서술은 projection/link로 전환

### Candidate 3. supervisor spec의 entry-doc 오인

현재 위치:

- `workflow-v2/README.md`
- `omo-autonomous-supervisor.md`
- `omo-lite-supervisor-spec.md`

목표:

- `workflow-v2/README.md`는 entry
- 나머지는 maintainer spec
- stage actor reading path에서는 제외

## Reading Path Proposal

### Product Slice Stage Actor

1. `AGENTS.md`
2. `CURRENT_SOURCE_OF_TRUTH.md`
3. workpack README + acceptance
4. 현재 stage section of `slice-workflow.md`
5. current change type section of `agent-workflow-overview.md`
6. trigger docs only

### OMO Reset Operator

1. `workflow-v2/README.md`
2. `.opencode/README.md`
3. `omo-codex-orchestrated-rail.md`
4. `omo-supervisor-reset-plan.md`
5. `omo-incident-registry.md`
6. relevant runtime/spec docs only when implementing

## Success Criteria

이 문서가 가치 있으려면 이후 실제 정리에서 아래가 보여야 한다.

- stage actor 기본 읽기 세트가 지금보다 짧아진다.
- implementation maintainer 문서가 product actor 기본 읽기에서 빠진다.
- 같은 규칙의 설명이 여러 문서에서 장문으로 반복되지 않는다.
- reset 이후에는 이 문서 자체도 더 작은 governance map이나 README section으로 흡수 가능하다.
