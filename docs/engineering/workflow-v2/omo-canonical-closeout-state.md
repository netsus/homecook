# OMO Canonical Closeout State

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 목적: OMO reset Phase 2에서 closeout truth를 한 surface로 줄이고, 관련 규칙 markdown을 projection 중심으로 축소하기 위한 canonical owner 결정을 잠그는 문서
- 현재 baseline: `work-item closeout schema + repair_summary projection + tracked status projection helper + human-facing projection payload helper + validator guard`까지 구현됐다. PR body의 `Closeout Sync` / `Merge Gate` 기본 section generation, README / acceptance doc-surface drift check, current-vocabulary closeout repair consumer는 연결됐고, README / acceptance markdown rewrite와 `Actual Verification` full projection은 아직 후속 단계다.

## Why This Document Exists

현재 closeout 관련 사실은 여러 surface에 나뉘어 남는다.

- `docs/workpacks/README.md` row
- `docs/workpacks/<slice>/README.md`
- `docs/workpacks/<slice>/acceptance.md`
- `docs/workpacks/<slice>/automation-spec.json` closeout metadata
- `.workflow-v2/status.json`
- PR body closeout evidence

이 구조는 두 문제를 만든다.

1. 같은 사실을 여러 문서가 각자 소유한다고 느끼게 만든다.
2. closeout 규칙이 `AGENTS.md`, `slice-workflow.md`, `.opencode/README.md`, workflow-v2 문서에 반복 서술되게 만든다.

따라서 Phase 2의 목표는 새 closeout 절차를 더하는 것이 아니라, authoritative closeout state를 한 군데로 줄여 나머지를 projection으로 내리는 것이다.

## Relationship To Rule Markdown Reduction

이 문서는 단순 bookkeeping 문서가 아니다.
reset의 `Shorter Rules, Smaller Reads` 목표와 직접 연결된다.

closeout truth가 하나로 줄어들면 아래 문서도 같이 얇아질 수 있다.

- `AGENTS.md`: 공통 원칙과 guardrail만 남기고, closeout sync 세부는 제거
- `slice-workflow.md`: stage actor가 내야 할 output만 남기고 downstream sync semantics는 제거
- `agent-workflow-overview.md`: change-type gate만 유지하고 closeout ownership 재서술은 제거
- `.opencode/README.md`: runtime/operator note만 유지하고 closeout authority 설명은 제거

즉 규칙 md 파일을 줄이는 계획은 reset의 부수효과가 아니라, canonical closeout state 설계의 직접 목표다.

## Current Mismatch

현재 전환 문서인 [bookkeeping-authority-matrix.md](../bookkeeping-authority-matrix.md)는
이제 authoritative ownership matrix가 아니라
closeout docs branch의 temporary writable surface를 기록하는 compatibility note다.
즉 ownership / projection semantics의 기준은 이 문서로 이동했고,
matrix는 transition-period write scope만 남긴다.

그 결과:

- OMO supervisor가 bookkeeping drift를 많이 이해해야 한다.
- closeout repair가 markdown patch 중심으로 흐른다.
- merged/passed 이후 recovery history가 요약 note에 묻힌다.
- stage actor가 "무엇을 최종적으로 맞춰야 하는지"를 prose로 많이 기억해야 한다.

Phase 2에서는 이 matrix를 부정하는 것이 아니라,
"과도기 ownership matrix"에서 "단일 canonical snapshot + projection rules"로 이동하는 후보를 정의한다.

## Decision

closeout의 canonical owner는 `.workflow-v2/work-items/<id>.json#closeout`으로 확정한다.

이 문서 이후:

- closeout truth는 work item `closeout` snapshot이 authoritative owner다.
- `.workflow-v2/status.json`, workpack markdown, PR body는 projection 또는 evidence carrier로만 본다.
- `bookkeeping-authority-matrix.md`는 ownership 정의 문서가 아니라 transition-period writable surface compatibility note로만 유지한다.

## Canonical Owner

선택된 owner는 `.workflow-v2/work-items/<id>.json`의 `closeout` object다.

이 선택을 확정한 이유:

- 이미 slice 단위 machine-readable contract가 존재한다.
- `.workflow-v2/status.json`보다 slice-local detail을 담기 쉽다.
- PR body나 markdown 문서보다 deterministic projection이 쉽다.
- 새 디렉터리/새 파일 family를 추가하지 않고도 authority를 모을 수 있다.

반대로 아래 후보는 기본 canonical owner로 두지 않는다.

- `docs/workpacks/<slice>/README.md`
  - human-facing closeout summary로는 좋지만 machine merge/projection 기준으로는 약하다.
- `acceptance.md`
  - stage evidence 확인에는 좋지만 runtime-tracked merge state와 recovery history까지 담기 어렵다.
- `.workflow-v2/status.json`
  - board summary에 가깝고 slice-local closeout detail을 담기엔 얕다.
- PR body
  - reviewer-facing evidence일 뿐 repo-local canonical state가 아니다.

## Candidate Snapshot Shape

아래는 schema proposal이 아니라 authority boundary를 설명하기 위한 개념 모델이다.

```json
{
  "closeout": {
    "phase": "collecting",
    "docs_projection": {
      "roadmap_lifecycle": "merged",
      "design_status": "approved",
      "delivery_checklist": "complete",
      "design_authority": "passed",
      "acceptance": "complete",
      "automation_spec_metadata": "synced"
    },
    "verification_projection": {
      "required_checks": "passed",
      "external_smokes": "passed",
      "authority_reports": [
        ".artifacts/..."
      ],
      "actual_verification_refs": [
        "PR Actual Verification"
      ]
    },
    "merge_gate_projection": {
      "current_head_sha": "abc123",
      "approval_state": "dual_approved",
      "all_checks_green": true
    },
    "recovery_summary": {
      "manual_patch_count": 1,
      "stale_lock_count": 2,
      "ci_resync_count": 1,
      "last_recovery_at": "2026-04-20T00:00:00Z"
    },
    "repair_summary": {
      "codex_repairable_count": 3,
      "claude_repairable_count": 1,
      "manual_decision_required_count": 0,
      "evidence_sources": ["dispatch", ".omx/artifacts"]
    },
    "projection_state": {
      "docs_synced_at": "2026-04-20T00:00:00Z",
      "status_synced_at": "2026-04-20T00:00:00Z",
      "pr_body_synced_at": "2026-04-20T00:00:00Z"
    }
  }
}
```

핵심은 field 이름보다 책임 경계다.

- closeout의 authoritative mutable state는 work item에 둔다.
- detailed logs와 raw artifacts는 기존 `.artifacts/**`에 남긴다.
- README / acceptance / PR body / status board는 closeout의 projection이다.

## Projection Rules

## Projection Mode Matrix

Phase 4 정리에서는 각 surface를 "projection"이라고만 뭉뚱그려 부르지 않고,
현재 baseline에서 어떤 방식으로 다뤄지는지까지 구분한다.

| Surface | 역할 | 현재 모드 | 비고 |
| --- | --- | --- | --- |
| `.workflow-v2/work-items/<id>.json#closeout` | canonical owner | authoritative | closeout truth의 유일한 authoritative mutable state |
| `.workflow-v2/status.json` | board summary | generated projection | lifecycle / approval / verification / recovery note fragment만 요약 투영 |
| `docs/workpacks/README.md` | human-facing roadmap/status | semi-generated sync target | canonical snapshot 기준 drift 검사/repair 대상이지만 markdown 전체를 source로 보지 않음 |
| `docs/workpacks/<slice>/README.md` | human-facing slice closeout view | semi-generated sync target | `Design Status`, `Delivery Checklist`, `Design Authority` 같은 declared surface만 sync |
| `docs/workpacks/<slice>/acceptance.md` | reviewer completion view | semi-generated sync target | acceptance status는 projection 대상이지만 reviewer-readable 문맥은 그대로 둠 |
| `docs/workpacks/<slice>/automation-spec.json` | stage contract + closeout metadata | declared metadata projection | closeout metadata만 projection 대상으로 보고 파일 전체를 재생성하지 않음 |
| PR body `## Closeout Sync` | reviewer-facing closeout summary | generated projection | canonical snapshot에서 다시 계산 가능해야 함 |
| PR body `## Merge Gate` | reviewer-facing merge snapshot | generated projection | canonical snapshot이 소유한 값만 투영하고 GitHub live checks 목록 자체는 소유하지 않음 |
| PR body `## Actual Verification` | reviewer-facing evidence summary | preserved/manual evidence carrier | 현재 baseline은 full regeneration이 아니라 source PR/manual evidence 우선 보존 |

핵심은 "전부 자동 생성"이 아니라,
surface별로 generated / semi-generated / preserved가 다르다는 점이다.
이 구분을 흐리면 closeout drift와 PR body drift가 다시 같은 문제로 섞인다.

### 1. `.workflow-v2/work-items/<id>.json`

- slice-local canonical closeout snapshot의 유일한 authoritative owner
- supervisor writable scope는 `status`와 `closeout`으로 제한
- stage actor는 free-form markdown patch 대신 structured artifact를 제출
- sibling `status` object는 canonical closeout truth가 아니라 terminal projection이다. Stage 6 approve 뒤 internal 6.5에서 `lifecycle=merged`, `approval_state=dual_approved`, `verification_status=passed`로 `.workflow-v2/status.json` item과 함께 맞춘다.

### 2. `.workflow-v2/status.json`

- board summary만 유지
- `lifecycle`, `approval_state`, `verification_status`, 짧은 operator note만 projection
- recovery detail이나 closeout checklist truth는 소유하지 않음
- generated projection이며 operator summary를 위한 얕은 보드 surface다.

### 3. `docs/workpacks/README.md`

- roadmap row는 canonical closeout snapshot에서 projection
- merged/backfilled 사실을 사람이 보기 좋게 보여주되, authoritative write surface로 취급하지 않음
- semi-generated sync target이다. canonical snapshot 기준 drift는 잡되 markdown 전체를 재생성 대상으로 보지 않는다.

### 4. `docs/workpacks/<slice>/README.md`

- `Design Status`, `Delivery Checklist`, `Design Authority`는 human-facing projection
- closeout repair branch가 직접 사실을 발명하지 않고 canonical state를 반영
- semi-generated sync target이다. declared closeout fields만 sync하고 주변 설명 문단은 human-authored note로 남는다.

### 5. `docs/workpacks/<slice>/acceptance.md`

- reviewer-readable completion view
- stage actor가 stage artifact를 제출하면 supervisor가 canonical closeout state를 갱신하고, acceptance는 projection/sync target으로 본다
- semi-generated sync target이다. acceptance status는 projection 대상이지만 전체 문서를 기계적으로 갈아엎지는 않는다.

### 6. `docs/workpacks/<slice>/automation-spec.json`

- Stage 1 execution contract는 계속 담당
- closeout metadata는 canonical closeout snapshot에서 필요한 최소 evidence만 projection
- declared metadata projection만 허용한다. automation-spec 전체를 closeout engine이 다시 쓰지 않는다.

### 7. PR Body

- `Actual Verification`, `Closeout Sync`, `Merge Gate`는 generated evidence
- upstream projection source를 다시 계산해서 재생성 가능해야 함
- body 수정만으로 closeout truth가 바뀌면 안 됨
- 현재 executable baseline은 `Closeout Sync` / `Merge Gate` 기본 section만 canonical closeout snapshot에서 생성한다.
- `Actual Verification`은 source PR/manual evidence를 우선 보존하며, 현재 snapshot만으로는 full 본문을 재구성하지 않는다.
- 즉 `Closeout Sync` / `Merge Gate`는 generated projection이고, `Actual Verification`은 preserved/manual evidence carrier다.

## Artifact Retention Rule

closeout / promotion / replay 판단에서 "현재도 다시 읽을 수 있는 retained evidence"와
"과거 실행 흔적을 설명하는 historical breadcrumb"를 구분한다.

### Canonical Retained Evidence

아래처럼 repo 안에 남아 있는 경로만 current canonical evidence로 본다.

- `.artifacts/**`
- `.workflow-v2/**`
- `docs/**`
- `ui/designs/**`

### Historical Breadcrumb Only

아래는 historical breadcrumb로는 남길 수 있지만,
current canonical closeout proof를 단독으로 구성하면 안 된다.

- `/private/tmp/**` 같은 ephemeral 경로
- 다른 machine의 절대 경로
- 현재 저장소에서 더 이상 열 수 없는 off-repo artifact 경로

즉 tmp/off-repo ref는 "예전에 이런 실행이 있었다"를 설명할 수는 있어도,
현재 closeout snapshot, promotion ledger, replay pass의 유일한 근거가 될 수는 없다.

### Missing Artifact Disposition

원래 artifact를 회수할 수 없고 repo-local substitute evidence만 남아 있다면,
incident/backfill 문서에는 `artifact-missing accepted` disposition을 명시하고
현재 canonical retained evidence를 함께 적는다.

예:

- historical path: 과거 tmp evaluator result
- current retained evidence: replay bundle / replay ledger / repo-local audit report

slice06 같은 lane에서는 post-reset replay bundle이 historical tmp/stage6 ref를 대체하는
current retained evidence 역할을 한다.

## Recovery History Rule

reset 이후에는 "merged"만 남기지 않고, closeout canonical state에 최소 recovery summary를 남긴다.

남겨야 하는 항목:

- `manual_patch_count`
- `manual_handoff`
- `stale_lock_count`
- `ci_resync_count`
- `artifact_missing`
- `last_recovery_at`
- `codex_repairable_count`
- `claude_repairable_count`
- `manual_decision_required_count`
- `evidence_sources[]`

상세 조사와 긴 narrative는 incident registry와 artifact bundle에 남기고,
canonical closeout state에는 운영 품질 판단에 필요한 최소 summary만 유지한다.

## Repair Summary Projection

Codex-orchestrated OMO rail에서는 closeout/report가 "사람에게 넘겼는지"만 보여주면 부족하다.
자동 repair가 실제로 있었고 validator recheck로 해결됐는지도 projection에 남겨야 한다.

최소 projection은 아래를 구분한다.

- `codex_repairable`: Codex가 repo-local reversible edit 또는 evidence sync로 복구한 drift
- `claude_repairable`: Claude-owned stage artifact/authority evidence repair
- `manual_decision_required`: 사람 결정이 필요해 escalation이 허용된 경우
- `ci_wait`: current-head check wait/resume처럼 repair가 아니라 대기였던 경우

raw event와 긴 원인 설명은 `.artifacts/**` 또는 `.omx/artifacts/**`에 남기고,
canonical closeout에는 count, latest reason, retained evidence source만 둔다.
이렇게 해야 report는 운영 현실을 보여주되 새 truth surface가 되지 않는다.

## Writer Boundaries

### Stage Actor

- structured stage-result / review artifact 제출
- canonical closeout snapshot을 직접 prose로 편집하지 않음

### Supervisor

- stage artifact ingest
- deterministic merge
- projection sync trigger
- recovery summary update
- repair summary projection update

### Human / Operator

- exceptional recovery 시에만 canonical closeout snapshot 수정
- markdown 문서를 먼저 고치고 tracked state를 나중에 맞추는 경로는 기본 금지

## Migration Direction

### Step 1. Candidate Lock

- 이 문서로 canonical owner 후보를 잠근다.
- `bookkeeping-authority-matrix.md`는 과도기 matrix로 유지한다.

### Step 2. Schema Extension

- `work-item.schema.json`에 `closeout` object를 추가한다.
- example/work-item fixture를 같이 갱신한다.
- 현재 baseline은 `repair_summary` projection까지 포함해 이 단계까지 구현됐다.

### Step 3. Projection Helper

- canonical closeout snapshot -> README / acceptance / PR body / status projection helper를 추가한다.
- sync helper가 있으면 markdown rule은 projection 설명으로 줄인다.
- 현재 baseline은 `status` projection helper뿐 아니라 README / acceptance / PR body용 generated payload, repair summary projection, projection readiness validator를 포함한다.
- 현재 baseline의 consumer는 PR body `Closeout Sync` / `Merge Gate` 기본 section generation, `validate:closeout-sync`의 README / acceptance drift check, `omo:reconcile`의 current-vocabulary closeout repair까지 연결됐다.
- 현재 README / acceptance baseline은 current markdown surface vocabulary에 맞춘 deterministic sync contract와 repair consumer까지만 포함하고, unsupported state 전체를 rewrite하는 patcher는 아직 아니다.
- `Actual Verification` full projection과 README / acceptance markdown rewrite는 아직 남아 있다.
- markdown 전체 rewrite는 아직 남아 있다.

### Step 3.5. Projection Mode Lock

- generated projection, semi-generated sync target, preserved/manual evidence carrier를 문서와 validator 설명에서 같은 vocabulary로 부른다.
- 특히 PR body의 `Actual Verification`과 `Closeout Sync` / `Merge Gate`를 같은 모드처럼 설명하지 않는다.
- `bookkeeping-authority-matrix.md`는 writable surface compatibility note로 남기되, surface mode 해석은 이 문서를 따른다.

### Step 4. Rule Surface Slimming

- `AGENTS.md`, `slice-workflow.md`, `agent-workflow-overview.md`, `.opencode/README.md`에서 closeout ownership 중복을 제거한다.
- 사람에게 필요한 설명은 "무엇을 제출해야 하는가" 중심으로 남기고, "어디를 어떻게 맞춘다"는 projection contract로 이동한다.

### Step 5. Matrix Downgrade

- `bookkeeping-authority-matrix.md`를 compatibility note 또는 migration appendix 수준으로 축소한다.
- 현재 baseline은 compatibility note downgrade까지 반영됐고, 이후에는 appendix화 또는 제거 여부만 남는다.

## Remaining Questions

1. acceptance projection을 완전 자동 생성으로 볼지, semi-generated sync target으로 볼지
2. recovery summary의 최소 필드 집합을 어디까지 둘지
3. operator exceptional edit 권한을 어떤 validator로 제한할지

## Success Criteria

이 후보 설계가 맞다면 이후 변화는 아래처럼 보여야 한다.

- closeout drift 설명이 여러 markdown 문서에 반복되지 않는다.
- stage actor는 closeout markdown patch 규칙보다 artifact contract를 더 많이 본다.
- PR body/README/acceptance/status가 같은 사실을 각자 소유하지 않는다.
- slice replay에서 closeout repair가 projection 재생성에 가까워진다.
