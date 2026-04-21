# OMO Replay Acceptance

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 목적: OMO reset `Phase 8. Replay Acceptance`에서 representative replay lane과 evidence ledger를 machine-readable하게 잠그기 위한 기준 문서

## Why This Document Exists

reset plan은 replay acceptance를 "있으면 좋은 후속 확인"이 아니라
"patch가 아니라 reset이었는지 증명하는 마지막 gate"로 둔다.

그런데 replay가 prose notes나 incident registry의 `closed-by-replay` 문장에만 남으면
다시 ambiguity가 생긴다.

그래서 Phase 8에서는 replay evidence도 tracked JSON으로 남긴다.

## Canonical Replay Surface

- tracked evidence ledger: `.workflow-v2/replay-acceptance.json`
- schema: `docs/engineering/workflow-v2/schemas/replay-acceptance.schema.json`
- example: `docs/engineering/workflow-v2/templates/replay-acceptance.example.json`

`promotion-evidence.json`은 lane/gate 승격 상태를 기록한다.
`replay-acceptance.json`은 representative replay lane이 실제로 어떤 기준을 통과했는지 기록한다.

즉:

- `promotion-evidence.json` = 승격 gate ledger
- `replay-acceptance.json` = replay pass/fail ledger

## Required Replay Lanes

reset plan의 Phase 8 기준으로 아래 4개 lane을 기본 required set으로 둔다.

1. `slice06-authority-replay`
2. `slice07-fullstack-replay`
3. `bugfix-patch-replay`
4. `control-plane-smoke-replay`

lane ID는 향후 wording이 조금 바뀌더라도 stable identifier로 유지한다.

## Per-Lane Pass Criteria

각 lane은 최소 아래 criteria를 기록한다.

- `manual_runtime_json_edit_free`
- `stale_lock_manual_clear_free`
- `stale_ci_snapshot_manual_fix_free`
- `canonical_closeout_validated`
- `auditor_result_recorded`

의미:

- replay 중 runtime JSON을 사람이 직접 수정하지 않았다.
- stale lock을 사람이 강제로 지우지 않았다.
- stale CI snapshot을 수동 patch/no-op commit으로 보정하지 않았다.
- canonical closeout projection validator가 통과했다.
- auditor 결과 bundle 또는 equivalent report가 evidence로 남아 있다.

required lane이 `status=pass`가 되려면 위 criteria가 모두 `true`여야 한다.

## Summary Verdict

`replay-acceptance.json.summary.status`는 아래 중 하나다.

- `not-started`
- `in_progress`
- `pass`
- `blocked`

`summary.status=pass`가 되려면 required lane이 모두 `pass`여야 한다.

## Relationship To Other Docs

- `omo-supervisor-reset-plan.md`는 왜 replay acceptance가 필요한지 설명한다.
- `promotion-readiness.md`는 replay acceptance가 승격 판단에 어떻게 반영되는지 설명한다.
- `omo-auditor-reset-requirements.md`는 auditor가 replay ledger를 어떻게 읽어야 하는지 설명한다.

## Non-Goals

- 이 문서는 replay 실행 절차 전체를 단계별 SOP로 쓰지 않는다.
- product correctness 자체를 승인하는 문서가 아니다.
- incident registry를 대체하지 않는다.

## Success Criteria

이 문서가 반영되면 아래가 가능해야 한다.

- replay evidence 유무를 prose 검색이 아니라 tracked JSON으로 판단한다.
- auditor가 replay evidence missing을 heuristics보다 explicit ledger로 판정한다.
- Phase 8 lane이 pass인지 blocked인지 stable IDs로 보고할 수 있다.
