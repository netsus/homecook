# Bookkeeping Authority Matrix

## Purpose

이 문서는 canonical closeout ownership / projection semantics를 정의하는 문서가 아니다.
그 기준은 `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`를 따른다.

이 문서는 전환 기간 동안 `docs/omo-closeout-<slice>` branch가 만질 수 있는
writable closeout surface만 기록하는 compatibility note다.

## Temporary Writable Surfaces

closeout repair는 아래 4개 surface 안에서만 docs-side sync를 수행한다.

- `docs/workpacks/README.md`
- `docs/workpacks/<slice>/README.md`
- `docs/workpacks/<slice>/acceptance.md`
- `docs/workpacks/<slice>/automation-spec.json`의 declared closeout metadata

추가 제한:

- `automation-spec.json` 전체를 source of truth로 다시 쓰지 않는다.
- authority report path, evidence ref, closeout metadata처럼 declared closeout surface만 수정한다.
- 공식 요구사항/화면/API/DB 문서와 stage ownership 규칙은 이 경로에서 수정하지 않는다.

## Non-Writable Surfaces

아래 surface는 closeout docs branch에서 수정하지 않는다.

- `.workflow-v2/status.json`
- `.workflow-v2/work-items/<id>.json`
- `.opencode/omo-runtime/<id>.json`
- PR body raw text

PR body의 `Actual Verification`, `Closeout Sync`, `Merge Gate`는 reviewer-facing evidence surface이며,
body 자체가 authoritative owner는 아니다.

## Operational Consequences

- `validate:closeout-sync`와 `omo:reconcile`는 canonical closeout snapshot을 기준으로 이 note의 writable surface 범위 안에서만 doc-side drift를 검사/수리한다.
- `validate:omo-bookkeeping`는 tracked state / runtime state와 docs-side writable surface drift를 본다.
- `validate:workflow-v2`와 `omo-github` PR body baseline은 canonical closeout snapshot 기준 generated payload를 다루며, 이 note는 body semantics를 정의하지 않는다.
- auditor는 canonical closeout 문서와 이 compatibility note가 함께 존재해야 closeout authority transition이 잠겼다고 본다.

## Related References

- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`
- `docs/engineering/workflow-v2/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `scripts/lib/bookkeeping-authority.mjs`
