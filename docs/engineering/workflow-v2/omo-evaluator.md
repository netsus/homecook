# OMO Evaluator

## Status

- 이 문서는 `omo:supervise`가 사용하는 machine-checkable evaluator contract를 고정한다.
- 현재 executable baseline은 `pnpm omo:evaluate -- --work-item <id> --stage <backend|frontend>`다.
- 대상은 우선 `low/medium risk` product slice의 autonomous path다.
- `high/critical`, `external-integration`, `contract-evolution`, ambiguous requirement는 계속 human escalation path로 남긴다.

## Purpose

evaluator는 LLM judge가 아니라 `deterministic merge gate aggregator`다.

역할:

- Stage 1에서 잠근 `automation-spec.json`을 읽는다.
- README `Delivery Checklist`와 acceptance checkbox metadata contract를 읽는다.
- stage-result contract가 완전한지 검사한다.
- Stage 1 bootstrap + docs gate가 잠근 tracked contract를 전제로 Stage 2/4 implementation artifact를 평가한다.
- required test target, verify command, external smoke, artifact evidence를 실행/검증한다.
- 결과를 `pass | fixable | blocked`로 정규화한다.
- `fixable`이면 Codex remediation loop 입력 번들을 생성한다.
- `blocked`면 supervisor가 fail-closed 하도록 reason code와 evidence를 남긴다.

즉, evaluator는 “코드가 좋아 보이는가”가 아니라 “이 slice가 machine-checkable acceptance를 만족했는가”를 판단한다.

## Public Interface

- `pnpm omo:evaluate -- --work-item <id> --stage backend`
- `pnpm omo:evaluate -- --work-item <id> --stage frontend`
- `pnpm validate:automation-spec`

원칙:

1. evaluator는 work item, automation spec, runtime state, stage-result artifact를 함께 읽는다.
2. `backend`와 `frontend`만 지원한다. 숫자 stage는 내부 호환용으로만 허용한다.
3. runtime에 worktree path가 없으면 실행하지 않는다.
4. automation spec이 없거나 invalid면 autonomous path를 열지 않는다.

## Automation Spec Contract

Stage 1 docs PR은 markdown 2개만으로 끝나지 않는다. 아래 tracked artifact도 같이 잠겨야 한다.

- `docs/workpacks/<slice>/automation-spec.json`
- `.workflow-v2/work-items/<id>.json`
- `.workflow-v2/status.json` matching item

`internal 1.5` doc gate는 Stage 1 author 뒤, docs PR merge 전에 아래 Stage 1 artifact 범위만을 대상으로 repair/rebuttal을 허용한다.

- `docs/workpacks/README.md`
- `docs/workpacks/<slice>/README.md`
- `docs/workpacks/<slice>/acceptance.md`
- `docs/workpacks/<slice>/automation-spec.json`
- `.workflow-v2/work-items/<id>.json`
- `.workflow-v2/status.json`

새 contract slice는 아래 markdown metadata도 같이 만족해야 한다.

- README `Delivery Checklist`와 acceptance 각 checkbox 끝의 `<!-- omo:id=...;stage=...;scope=...;review=... -->`

필수 필드:

- `slice_id`
- `execution_mode`
- `risk_class`
- `merge_policy`
- `backend.required_endpoints[]`
- `backend.invariants[]`
- `backend.verify_commands[]`
- `backend.required_test_targets[]`
- `frontend.required_routes[]`
- `frontend.required_states[]`
- `frontend.playwright_projects[]`
- `frontend.artifact_assertions[]`
- `external_smokes[]`
- `blocked_conditions[]`
- `max_fix_rounds.backend`
- `max_fix_rounds.frontend`

해석 규칙:

1. `execution_mode=autonomous`만으로 auto-merge를 열지 않는다.
2. `merge_policy=conditional-auto`와 `risk_class in [low, medium]`가 함께 있어야 한다.
3. work item preset이 product vertical slice가 아니면 evaluator는 merge signal을 내지 않는다.

## Stage Result Contract

code stage의 `stage-result.json`은 아래 추가 필드를 포함해야 한다.

- `claimed_scope`
- `changed_files`
- `tests_touched`
- `artifacts_written`
- `checklist_updates[]`
- `contested_fix_ids[]`
- `rebuttals[]`

`claimed_scope` 최소 키:

- `files`
- `endpoints`
- `routes`
- `states`
- `invariants`

`checklist_updates[]` 최소 키:

- `id`
- `status`
- `evidence_refs[]`

원칙:

1. evaluator는 runtime worktree diff와 `changed_files`를 비교한다.
2. 실제 변경 파일이 `claimed_scope.files`에 없으면 drift로 본다.
3. backend required endpoint / invariant / test target이 stage-result metadata에 없으면 fixable finding이다.
4. frontend required route / state / artifact assertion이 없으면 fixable finding이다.
5. strict checklist contract가 활성화된 slice면 current stage-owned checklist id가 모두 checked 상태인지 검사한다.
6. strict checklist contract가 활성화된 slice면 `checklist_updates[]`가 current stage-owned checklist id만 포함하는지 검사한다.
7. strict checklist contract가 활성화된 slice면 `contested_fix_ids[]`가 latest review의 `required_fix_ids[]` subset인지 검사한다.
8. strict checklist contract가 활성화된 slice면 `rebuttals[]`가 `contested_fix_ids[]`와 정확히 대응하는지 검사한다.

## Internal 1.5 Boundary

`internal 1.5`는 evaluator가 아니라 supervisor-owned deterministic doc gate가 담당한다.

원칙:

1. doc gate는 “문서가 구현을 잠갔는가”를 판단한다.
2. evaluator는 doc gate `pass` 이후의 Stage 2/4 implementation만 평가한다.
3. docs gate는 `doc_gate_review(Codex) -> doc_gate_repair(Claude) -> doc_gate_recheck` 순서를 쓰고, merge 후 recheck `pass`가 있기 전까지 Stage 2 implementation을 열지 않는다.

## Outcomes

### `pass`

- required subevaluator가 모두 green
- blocker finding 없음
- external smoke pass
- required artifact 존재

### `fixable`

- repo 안 수정으로 닫을 수 있는 실패
- remediation hint 생성 가능
- supervisor가 같은 Codex session으로 remediation rerun 가능

### `blocked`

- 환경/권한/secret/live integration/contract drift처럼 Codex loop로 닫을 수 없는 실패
- external smoke failure
- invalid or missing stage-result
- manual/high-risk policy path

## Required Subevaluators

### Backend

- schema/contract drift
- required test targets 존재/선언
- verify command exit code
- bookkeeping/status invariant
- branch/worktree hygiene
- external smoke command

### Frontend

- required routes/states declared
- artifact assertion completeness
- verify command exit code
- Playwright/screenshot/trace evidence
- bookkeeping/status invariant
- external smoke command

## Artifacts

evaluator는 아래 경로에 artifact를 남긴다.

- `.artifacts/omo-evaluator/<timestamp>-<work-item>-<stage>/result.json`

`fixable`이면 추가로:

- `remediation-input.json`
- `remediation-prompt.md`

`result.json` 필수 필드:

- `schemaVersion`
- `workItemId`
- `slice`
- `stage`
- `outcome`
- `mergeEligible`
- `summary`
- `subevaluators[]`
- `findings[]`
- `requiredCommands[]`
- `artifacts`
- `generatedAt`

`findings[]` 필수 필드:

- `id`
- `fingerprint`
- `category`
- `severity`
- `message`
- `evidence_paths[]`
- `remediation_hint`
- `owner`
- `fixable`

## Supervisor Loop Contract

`omo:supervise`는 evaluator 결과를 아래처럼 해석한다.

1. `pass`면 commit/push/PR/CI/merge path를 계속 진행한다.
2. `fixable`면 remediation context를 runtime에 저장하고 같은 Codex session으로 rerun한다.
3. 같은 `finding.fingerprint`가 연속 반복되면 `stalled`로 처리한다.
4. `blocked`면 즉시 `human_escalation`으로 fail-closed 한다.
5. `max_fix_rounds`를 넘기면 `stalled`로 종료한다.

## Non-Goals

- product correctness를 자유 형식 LLM scoring으로 판정하지 않는다.
- `high/critical` slice의 human review를 자동으로 제거하지 않는다.
- external smoke failure를 soft warning으로 낮추지 않는다.
