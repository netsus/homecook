---
name: meta-harness-auditor
description: Audit the Homecook workflow harness, OMO runtime, validators, CI gates, and engineering policy docs. Use when evaluating overall system health, reviewing OMO promotion readiness, generating prioritized harness findings, or producing a remediation plan for docs-governance and workflow tooling.
---

# Meta Harness Auditor

이 skill은 Homecook의 개발 하네스를 읽고 반복 가능한 기준으로 감사할 때 사용한다.
대상은 product 기능이 아니라 workflow/validator/CI/OMO/runtime/meta-layer다.

## Read First

1. `docs/engineering/meta-harness-auditor.md`
2. `AGENTS.md`
3. `CLAUDE.md` if present
4. `docs/engineering/agent-workflow-overview.md`
5. `docs/engineering/slice-workflow.md`
6. `docs/engineering/workflow-v2/README.md`
7. `.opencode/README.md`
8. `docs/engineering/workflow-v2/promotion-readiness.md`
9. `.workflow-v2/promotion-evidence.json` if present

## Default Workflow

1. `pnpm harness:audit`를 실행한다.
2. `.artifacts/meta-harness-auditor/<timestamp>/`의 bundle을 확인한다.
3. `scorecard.json`, `findings.json`, `promotion-readiness.json`, `remediation-plan.json`, `audit-context.json`을 기준으로 보고한다.
4. 사용자가 명시적으로 승인한 경우에만 `pnpm harness:fix -- --finding <id>`로 finding 하나를 고른다.
5. `fix-result.json`과 후속 검증 결과를 함께 보고한다.

## Boundaries

- 기본 모드는 `audit-only`다.
- product contract, source-of-truth 문서, stage ownership은 자동 수정하지 않는다.
- `fix-one-finding` 모드는 승인된 low-risk finding 1개에만 사용한다.
- slice06 같은 in-flight pilot과 충돌할 수 있는 breaking workflow rename은 하지 않는다.
- slice checkpoint 연동은 in-flight slice의 제품 동작 자체를 판정하는 것이 아니라, 해당 시점의 harness/closeout/runtime evidence를 감사하는 의미다.
- finding ID는 `finding-registry.json`의 stable ID를 기준으로 다루고, cadence는 `cadence.json` 이벤트를 따른다.

## Output Bundle

- `report.md`
- `scorecard.json`
- `findings.json`
- `remediation-plan.json`
- `promotion-readiness.json`
- `audit-context.json`
- `fix-result.json` (`fix-one-finding` 실행 시)
