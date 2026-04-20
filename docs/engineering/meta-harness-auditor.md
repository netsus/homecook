# Meta Harness Auditor Spec

## Status

- 상태: `draft`
- 단계: `C4 fix-one-finding baseline 구현 완료`
- 변경 유형: `docs-governance`
- 이 문서는 `meta-harness-auditor`를 별도 에이전트로 분리하기 위한 초안이다.
- 아직 저장소의 강제 운영 규칙은 아니다. 승인 전까지는 참고 설계로만 사용한다.

## Purpose

`meta-harness-auditor`는 Homecook의 **개발 하네스 전체**를 정기적으로 감사하고,
구조적 허점과 승격 blocker를 찾아 우선순위화하는 전용 에이전트다.

여기서 말하는 하네스는 아래를 모두 포함한다.

- `AGENTS.md`, `CLAUDE.md`, `docs/engineering/*`의 정책 문서
- `docs/workpacks/*` 기반 slice delivery contract
- `.github/workflows/*` CI / policy / QA gate
- `scripts/validate-*.mjs`와 `scripts/lib/*` validator / bookkeeping / OMO helper
- `.workflow-v2/*` tracked state
- `.opencode/*` OMO provider / runtime 운영 규칙
- `docs/engineering/workflow-v2/promotion-readiness.md` + `.workflow-v2/promotion-evidence.json` 승격 evidence gate

이 에이전트의 기본 역할은 "실행"이 아니라 "감사"다.

## Why Separate Agent

현재 저장소의 workflow/validator/OMO 시스템은 단순 보조 스크립트 수준을 넘었다.

- machine-readable 상태를 가진다
- 별도 validator와 테스트를 가진다
- CI / PR / closeout / smoke / authority evidence를 집행한다
- product slice 운영과 독립적인 meta-layer drift를 만들 수 있다

따라서 아래를 분리한다.

- `OMO`: workflow 실행기 / supervisor / runtime control plane
- `meta-harness-auditor`: 감사자 / 평가자 / 우선순위 관리자

즉 OMO가 "일을 진행"한다면, auditor는 "시스템이 건강한지 평가"한다.

## Relationship To Current Workflow Stack

현재 Homecook stack은 아래 4개 레이어로 본다.

1. `v1 policy`
- `AGENTS.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`

2. `v2 orchestration spec`
- `docs/engineering/workflow-v2/*`
- `profiles`, `presets`, `work item` schema

3. `OMO runtime / execution`
- `.workflow-v2/*`
- `.opencode/*`
- `pnpm omo:*`

4. `meta-harness-auditor`
- 위 1~3 레이어를 읽고 점수화 / finding / 보강 계획을 만드는 감사 레이어

`meta-harness-auditor`는 위 레이어를 **대체하지 않는다**.
대신 drift, 누락, promotion risk를 구조적으로 드러낸다.

## Goals

- 전체 하네스의 현재 건강도를 반복 가능한 rubric으로 점수화한다.
- 정책 문서와 실제 executable harness의 불일치를 찾는다.
- recurring issue를 stable finding ID로 추적한다.
- low-risk governance / validator / CI 보강 후보를 분리한다.
- `OMO v2 promotion-ready` 여부를 독립적으로 평가한다.
- 사람이 승인한 finding에 한해 좁은 범위의 remediation entrypoint를 제공한다.

## Non-Goals

- product slice를 직접 구현하지 않는다.
- 공식 product contract를 바꾸지 않는다.
- 사용자 승인 없이 source-of-truth 문서를 바꾸지 않는다.
- stage ownership을 임의 변경하지 않는다.
- high-risk workflow 전환을 자동 적용하지 않는다.
- merge-ready 또는 production-ready를 단독 선언하지 않는다.

## Core Responsibilities

### 1. Periodic Audit

- 전체 하네스를 읽고 현재 상태를 감사한다.
- 문서, validator, workflow, runtime 사이의 mismatch를 수집한다.

### 2. Scorecard

- 아래 축별 점수를 남긴다.
  - governance
  - contract discipline
  - frontend harness
  - backend harness
  - design authority
  - testing / QA
  - review / closeout
  - automation / OMO runtime

### 3. Findings

- 각 허점을 stable finding ID로 기록한다.
- severity, priority, ownership, autofix 가능 여부를 함께 남긴다.

### 4. Remediation Planning

- finding을 아래 bucket으로 분류한다.
  - `docs-governance`
  - `validator`
  - `workflow`
  - `CI`
  - `shared-tooling`
  - `slice-policy`
  - `promotion-blocker`

### 5. Promotion Readiness Review

- OMO v2가 기본 운영 경로로 승격 가능한지 별도 기준으로 평가한다.
- 승격 불가 시 blocker와 prerequisite를 분리한다.

## Default Modes

### Mode A. `audit-only`

기본 모드다.

- 읽기 / 검증 / 보고까지만 수행한다.
- 코드는 수정하지 않는다.
- 이 모드가 `C2`의 첫 구현 대상이다.

### Mode B. `fix-one-finding`

후속 모드다.

- 사람이 승인한 finding ID 1개만 대상으로 한다.
- low-risk governance / validator / CI 범위만 허용한다.
- 이 모드는 `C4` 이후에만 연다.

## Recommended Packaging

초기 구현은 "별도 에이전트"를 아래 조합으로 제공하는 것을 권장한다.

- skill: 감사 절차, rubric, 읽을 것, 금지 범위 정의
- agent metadata: UI 노출용 이름 / 설명 / 기본 프롬프트
- optional scripts: scorecard / finding bundle 후처리, stable ID 정규화

즉 구현 단위는 "새로운 전용 에이전트 경험"이지만, 내부 구조는
`skill + agent metadata + optional helper scripts` 조합으로 둔다.

이유:

- 규칙은 문서로 유지하고
- 반복 계산은 script로 안정화하며
- 사용자에게는 별도 감사 에이전트처럼 노출할 수 있기 때문이다.

## Proposed Execution Surface

초기 실행 표면은 아래 2개를 상정한다.

- `audit`
  - 전체 하네스를 읽고 artifact bundle을 생성한다
- `fix --finding <id>`
  - 승인된 finding 1개만 대상으로 low-risk 보강을 수행한다

`C2`에서는 우선 `audit`만 연다.
`fix --finding <id>`는 `C4` 이후에만 연다.

현재 `C2` baseline execution surface:

- skill: `.agents/skills/meta-harness-auditor/SKILL.md`
- CLI: `pnpm harness:audit`
- C4 CLI: `pnpm harness:fix -- --finding <id>`
- artifact schema:
  - `docs/engineering/meta-harness-auditor/audit-context.schema.json`
  - `docs/engineering/meta-harness-auditor/cadence.schema.json`
  - `docs/engineering/meta-harness-auditor/fix-result.schema.json`
  - `docs/engineering/meta-harness-auditor/finding-registry.schema.json`
  - `docs/engineering/meta-harness-auditor/scorecard.schema.json`
  - `docs/engineering/meta-harness-auditor/findings.schema.json`
  - `docs/engineering/meta-harness-auditor/remediation-plan.schema.json`
  - `docs/engineering/meta-harness-auditor/promotion-readiness.schema.json`

## Inputs

### Required Inputs

- `AGENTS.md`
- `CLAUDE.md` if present
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/engineering/*`
- `docs/workpacks/README.md`
- 대표 workpack 샘플
- `.github/workflows/*`
- `package.json`
- `scripts/validate-*.mjs`
- `scripts/lib/*` 중 harness 관련 파일
- `.workflow-v2/*`
- `.opencode/README.md`

### Optional Inputs

- 최근 merged slice 3~5개
- 현재 in-progress OMO work item
- 현재 in-flight slice의 checkpoint context
- authority-required slice artifact
- 최근 audit artifact
- PR body sample / closeout evidence sample

### Sampling Rule

매번 모든 workpack을 전부 읽지 않는다.

기본 샘플은 아래를 사용한다.

- roadmap / template / current policy 문서
- 최근 merged slice 2~3개
- authority-required slice 1개
- OMO pilot 관련 work item 1~2개

## Outputs

기본 output bundle 경로:

- `.artifacts/meta-harness-auditor/<timestamp>/`

필수 산출물:

- `report.md`
- `audit-context.json`
- `scorecard.json`
- `findings.json`
- `remediation-plan.json`

선택 산출물:

- `promotion-readiness.json`
- `fix-result.json`
- `diff-candidates.json`
- `compatibility-note.md`

## C3 Baseline Operations

`C3`부터는 "스펙 문서"만이 아니라 반복 가능한 baseline audit 운영 절차를 같이 둔다.

기본 실행 예시는 아래와 같다.

```bash
pnpm harness:audit
pnpm harness:audit -- --cadence-event weekly-baseline
pnpm harness:audit -- --in-flight-slice 06-planner-weekly-notes --cadence-event slice-checkpoint --checkpoint stage4-ready-for-review
pnpm harness:audit -- --in-flight-slice 06-planner-weekly-notes --cadence-event slice-checkpoint --checkpoint stage6-closeout --reason "slice06 checkpoint audit"
```

artifact bundle에는 아래 컨텍스트를 같이 남긴다.

- 어떤 모드로 실행했는지
- 어떤 cadence event로 실행했는지
- 어떤 slice를 샘플링했는지
- checkpoint 이름이 있었는지
- in-flight slice가 무엇인지
- 어떤 required/optional input이 존재했는지

## Finding ID Stability

finding ID는 `docs/engineering/meta-harness-auditor/finding-registry.json`을 기준으로 관리한다.

원칙:

- 한번 배정된 stable ID는 다른 의미로 재사용하지 않는다.
- 탐지 로직이 바뀌어도 같은 구조적 문제면 기존 ID를 유지한다.
- 더 이상 쓰지 않는 ID는 삭제하지 않고 `deprecated`로 남긴다.
- `fix-one-finding` 모드는 registry에 없는 ID를 받지 않는다.

현재 stable set:

- `H-CI-001`
- `H-GOV-001`
- `H-OMO-001`
- `H-OMO-002`
- `H-OMO-003`
- `H-OMO-004`
- `H-OMO-005`
- `H-OMO-006`

메모:

- stable ID 배정이 곧 detector 구현 완료를 뜻하지는 않는다.
- reset 기간에는 registry 선확장 후 detector/bundle/report가 순차적으로 따라온다.

## Operating Cadence

운영 cadence의 단일 기준은 `docs/engineering/meta-harness-auditor/cadence.json`이다.

초기 이벤트는 아래 4개로 잠근다.

- `weekly-baseline`
- `slice-batch-review`
- `slice-checkpoint`
- `promotion-gate`

실무 해석:

- 매주 1회 baseline audit
- slice 3~5개마다 1회 batch review
- OMO pilot slice는 Stage 2 / 4 / 6 checkpoint마다 1회
- OMO 기본 승격 전에는 반드시 promotion-gate 1회

## C4 Safety Gates

`fix-one-finding`은 아래를 모두 만족해야만 실행한다.

1. finding ID가 registry에 존재해야 한다.
2. registry entry가 `stable`이어야 한다.
3. registry entry가 `safe_to_autofix=true`여야 한다.
4. registry entry가 `approval_required=false`여야 한다.
5. 현재 audit에서 해당 finding이 실제 active 상태여야 한다.
6. 구현된 low-risk fixer가 존재해야 한다.

`C4` baseline에서는 위 조건을 만족하는 finding 중 `H-CI-001`만 지원한다.
새로 추가된 `H-OMO-002`~`H-OMO-006`은 reset 기간 stable tracking ID이며, autofix 대상은 아니다.

예시:

```bash
pnpm harness:fix -- --finding H-CI-001
pnpm harness:fix -- --finding H-CI-001 --output-dir .artifacts/meta-harness-auditor/fixes/ci-fix
```

## Slice Checkpoint Integration

slice checkpoint 연동은 "slice06 기능 구현이 맞는지"를 직접 채점하는 뜻이 아니다.

여기서 auditor가 보는 것은 아래다.

- 해당 시점의 workpack / acceptance / closeout evidence
- `.workflow-v2/status.json`와 OMO runtime bookkeeping
- authority / QA / smoke evidence 존재 여부
- manual handoff, promotion blocker, workflow drift

즉 slice06이 진행 중일 때도 아래는 감사할 수 있다.

- OMO가 어떤 runtime artifact를 남기고 있는지
- checkpoint 시점에 closeout/bookkeeping drift가 생기는지
- authority-required lane evidence가 빠지지 않았는지
- 현재 시스템이 승격 후보로서 어떤 blocker를 갖는지

반대로 아래는 현재 `meta-harness-auditor`의 범위가 아니다.

- slice06 제품 기능의 correctness 자체
- UI/상태 전이의 동작 품질 판정
- merged 되지 않은 구현 diff의 상세 제품 리뷰

그 부분은 기존 slice workflow, deterministic QA, exploratory QA, authority review가 담당한다.

## Scorecard Contract

각 축은 `0~5` 점수로 기록한다.

- `5`: 기준이 문서/validator/실행 증거까지 안정적으로 잠김
- `4`: 전반적으로 안정적이지만 일부 운영 보강 필요
- `3`: 기능은 있으나 drift 또는 수동 의존이 큼
- `2`: 설계는 있으나 실행 정합성이 약함
- `1`: 문서만 있고 집행력이 낮음
- `0`: 기준 부재 또는 실패 상태

추가 필드:

- `confidence`
- `rationale`
- `evidence_refs`
- `trend` (`up | flat | down | unknown`)

## Finding Contract

각 finding은 아래 필드를 가진다.

```json
{
  "id": "H-CI-001",
  "title": "Playwright workflow path coverage gap",
  "severity": "important",
  "priority": "P0",
  "bucket": "CI",
  "owner": "docs-governance",
  "safe_to_autofix": true,
  "approval_required": false,
  "why_it_matters": "Nested lib changes can bypass QA workflows.",
  "evidence_refs": [
    ".github/workflows/playwright.yml",
    "lib/api/planner.ts"
  ],
  "recommended_validation": [
    "targeted workflow coverage test"
  ],
  "suggested_next_step": "Expand path filters to lib/** and add a regression check."
}
```

## Priority Model

- `P0`: QA/security/policy bypass, merge gate hole, destructive drift
- `P1`: source-of-truth / closeout integrity risk, authoritative ownership ambiguity
- `P2`: promotion blocker, repeated human-only workaround, unstable runtime semantics
- `P3`: maintainability debt, duplicated policy, stale docs/test mismatch
- `P4`: polish, naming, reporting ergonomics

## Audit Procedure

1. current workflow stack version과 active policy 문서를 확인한다.
2. 문서 레이어와 실제 executable harness 범위를 매핑한다.
3. validator / workflow / 테스트의 집행 가능성을 확인한다.
4. representative sample로 drift와 omission을 찾는다.
5. scorecard를 작성한다.
6. finding을 stable ID로 기록한다.
7. remediation bucket과 priority를 붙인다.
8. OMO promotion readiness를 별도 판정한다.

## Approval Boundaries

기본 rule:

- `audit-only`는 승인 없이 실행 가능
- `fix-one-finding`은 finding ID와 범위 승인이 필요

무조건 승인 필요한 항목:

- product contract 변경
- 공식 source-of-truth 문서 수정
- stage ownership 변경
- authority 기준 완화
- OMO merge policy 변경
- v1 -> v2 승격 선언

## Slice06 Parallel Pilot Rules

slice06을 OMO 실전 파일럿으로 병렬 진행하는 동안 auditor는 아래를 따른다.

- active slice06 execution surface를 깨는 breaking change를 제안하지 않는다.
- additive validator / reporting / documentation change를 우선한다.
- audit 결과에는 반드시 `slice06 compatibility note`를 포함한다.
- slice06 checkpoint에서 아래를 재평가한다.
  - Stage 2 완료 후
  - Stage 4 Ready for Review 직전
  - Stage 6 closeout 직전

## OMO Promotion Readiness Gate

`meta-harness-auditor`는 아래를 OMO 승격 평가 기준으로 본다.

- `promotion-readiness.md`와 `.workflow-v2/promotion-evidence.json`이 현재 gate / lane 상태를 같은 vocabulary로 설명하는가
- authority-required slice에서 evidence / handoff / closeout이 안정적인가
- external smoke required lane이 문서와 validator에 잠겼는가
- bookkeeping drift가 지속적으로 줄고 있는가
- manual handoff가 예외로 제한되는가
- scheduler / runtime 운영 규칙이 문서와 실제 helper에 반영됐는가
- v1 policy와 v2/OMO runtime 관계가 혼동 없이 설명되는가

이 에이전트는 승격 여부를 **권고**할 수는 있지만, 최종 결정권자는 아니다.

## Implementation Roadmap

### `C1` Spec Draft

- 역할, 경계, input/output, scoring, finding schema를 문서로 잠근다.

### `C2` Audit-Only Implementation

- 별도 에이전트 또는 skill 형태로 구현한다.
- report / scorecard / findings bundle을 생성한다.

### `C3` Baseline Audit

- 현재 저장소에 대해 최초 baseline 감사를 실행한다.
- 기존에 이미 발견된 주요 이슈를 finding으로 안정적으로 재생성해야 한다.

### `C4` Fix-One-Finding Mode

- 승인된 low-risk finding 1개를 좁은 범위로 수정한다.
- docs-governance / validator / CI 보강만 허용한다.

### `C5` Cadence Integration

- 주 1회 또는 slice 3~5개마다 1회 실행한다.
- workflow/tooling 변경 후에는 임시 추가 실행한다.

## Success Criteria

- 같은 저장소 상태에서 finding ID와 score trend가 크게 흔들리지 않는다.
- 첫 평가에서 잡힌 구조적 이슈를 반복 감지할 수 있다.
- 시스템 보강 PR이 finding ID 기준으로 추적된다.
- OMO 승격 판단에 필요한 risk / blocker / prerequisite가 정리된다.

## Open Questions

- 별도 "에이전트"로 먼저 만들지, "skill + 문서 + validator" 조합으로 먼저 만들지
- baseline audit에서 읽을 workpack 샘플 수를 몇 개로 고정할지
- `fix-one-finding` 모드의 허용 범위를 validator 변경까지 열지, CI/workflow까지만 열지
- scorecard 축별 weight를 둘지, 단순 동등 가중치로 둘지

## Immediate Next Step

다음 단계는 `C2`다.

- `meta-harness-auditor`의 audit-only 실행 surface를 정한다.
- artifact directory와 JSON schema를 잠근다.
- baseline audit 한 번을 돌려 현재 known issue 3개가 모두 finding으로 잡히는지 확인한다.
