# Bookkeeping Authority Matrix

## 목적

이 문서는 Homecook의 closeout / tracked-state bookkeeping에서
어떤 surface가 **원본(authoritative)** 이고,
어떤 surface가 **projection / evidence** 인지 잠그는 단일 기준이다.

대상은 아래 레이어를 함께 다룬다.

- v1 closeout docs
- v2 tracked state
- OMO runtime state
- PR body closeout evidence

## 핵심 원칙

- 하나의 field family에는 하나의 primary writer만 둔다.
- PR body의 `Actual Verification`, `Closeout Sync`, `Merge Gate`는 reviewer-facing evidence이며 source of truth가 아니다.
- `docs/omo-closeout-<slice>` branch는 matrix에 선언된 bookkeeping surface만 수정할 수 있다.
- closeout repair는 제품 계약이나 공식 source-of-truth 문서를 바꾸지 않는다.
- `.workflow-v2/status.json`과 `.opencode/omo-runtime/*.json`은 closeout docs에서 역으로 덮어쓰지 않는다.

## Surface Matrix

| Field family | Primary writer | Authoritative surface | Projection / consumer | Closeout repair policy |
| --- | --- | --- | --- | --- |
| roadmap lifecycle | slice stage owner / closeout writer | `docs/workpacks/README.md` row | `validate:closeout-sync`, `validate:omo-bookkeeping`, PR body `Closeout Sync` | `docs/omo-closeout-<slice>`에서만 수정 가능 |
| Design Status | frontend stage owner / closeout writer | `docs/workpacks/<slice>/README.md` `## Design Status` | `validate:closeout-sync`, `validate:omo-bookkeeping` | `docs/omo-closeout-<slice>`에서만 수정 가능 |
| README Delivery Checklist | stage owner / closeout writer | `docs/workpacks/<slice>/README.md` `## Delivery Checklist` | `validate:closeout-sync`, PR body `Closeout Sync` | `docs/omo-closeout-<slice>`에서만 수정 가능 |
| README Design Authority status | Claude final authority gate / closeout writer | `docs/workpacks/<slice>/README.md` `## Design Authority` | `validate:closeout-sync`, `validate:authority-evidence-presence` | `docs/omo-closeout-<slice>`에서만 수정 가능 |
| acceptance closeout | stage owner / closeout writer | `docs/workpacks/<slice>/acceptance.md` (`Manual Only` 제외) | `validate:closeout-sync`, PR body `Closeout Sync` | `docs/omo-closeout-<slice>`에서만 수정 가능 |
| automation-spec closeout metadata | Stage 1 workpack author + OMO closeout sync | `docs/workpacks/<slice>/automation-spec.json`의 closeout metadata (`authority_report_paths`, evidence refs 등) | `validate:closeout-sync`, `validate:authority-evidence-presence` | `docs/omo-closeout-<slice>`에서 closeout metadata만 수정 가능 |
| workflow-v2 tracked lifecycle / approval / verification | OMO supervisor / workflow-v2 maintainer | `.workflow-v2/status.json` | `validate:omo-bookkeeping`, `omo:status` | closeout docs에서 수정 금지 |
| workflow-v2 work item contract | workflow-v2 maintainer | `.workflow-v2/work-items/<id>.json` | `validate:workflow-v2`, OMO dispatch | closeout docs에서 수정 금지 |
| OMO runtime stage / wait / PR handles | OMO runtime | `.opencode/omo-runtime/<id>.json` | `omo:status`, `omo:reconcile` planning | closeout docs에서 수정 금지 |
| PR body closeout evidence | PR author / closeout author | 없음, projection only | GitHub PR UI, reviewers | upstream authoritative surface를 반영해서 다시 생성 |

## Closeout Branch Write Scope

`docs/omo-closeout-<slice>` branch가 수정할 수 있는 파일은 아래 4개뿐이다.

- `docs/workpacks/README.md`
- `docs/workpacks/<slice>/README.md`
- `docs/workpacks/<slice>/acceptance.md`
- `docs/workpacks/<slice>/automation-spec.json`

추가 제한:

- `automation-spec.json` 전체를 source of truth로 다시 쓰지 않는다.
- closeout repair가 만질 수 있는 범위는 authority report path, evidence ref, closeout metadata 같은 declared sync surface로 한정한다.
- 공식 요구사항/화면/API/DB 문서와 stage ownership 규칙은 이 경로에서 수정하지 않는다.

## Operational Consequences

- `validate:closeout-sync`는 workpack closeout docs가 merged-ready 상태인지 보고, work item `closeout` snapshot이 있으면 roadmap / README / acceptance surface가 canonical generated doc-surface contract와 모순되지 않는지도 함께 본다.
- `validate:omo-bookkeeping`는 tracked state / runtime state와 위 authoritative docs 사이 drift를 본다.
- `validate:workflow-v2`는 canonical closeout snapshot이 README / acceptance / PR body generated payload baseline을 계산할 수 있는지, 그리고 projecting/completed snapshot의 evidence-bearing fields가 비어 있지 않은지 함께 본다.
- `omo-github` PR body baseline은 canonical closeout snapshot으로 `Closeout Sync` / `Merge Gate` 기본 section을 생성하지만, `Actual Verification` evidence는 source PR/manual surface를 계속 우선한다.
- `omo:reconcile`는 matrix에 선언된 closeout surface만 repair 후보로 삼고, current markdown vocabulary로 표현 가능한 roadmap / README / acceptance drift는 canonical closeout repair action으로 정렬할 수 있다.
- auditor는 이 matrix와 helper import가 없으면 `H-GOV-001`을 계속 active finding으로 유지한다.

## Related References

- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/workflow-v2/README.md`
- `scripts/lib/bookkeeping-authority.mjs`
