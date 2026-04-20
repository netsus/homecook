# OMO Canonical Closeout State

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 목적: OMO reset Phase 2에서 closeout truth를 한 surface로 줄이고, 관련 규칙 markdown을 projection 중심으로 축소하기 위한 후보 설계

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

현재 기준 문서인 [bookkeeping-authority-matrix.md](../bookkeeping-authority-matrix.md)는
어떤 surface가 authoritative인지 잠그는 데는 유용하다.
하지만 여전히 closeout truth가 여러 surface에 분산되어 있다는 전제를 유지한다.

그 결과:

- OMO supervisor가 bookkeeping drift를 많이 이해해야 한다.
- closeout repair가 markdown patch 중심으로 흐른다.
- merged/passed 이후 recovery history가 요약 note에 묻힌다.
- stage actor가 "무엇을 최종적으로 맞춰야 하는지"를 prose로 많이 기억해야 한다.

Phase 2에서는 이 matrix를 부정하는 것이 아니라,
"과도기 ownership matrix"에서 "단일 canonical snapshot + projection rules"로 이동하는 후보를 정의한다.

## Proposed Canonical Owner

권장 후보는 `.workflow-v2/work-items/<id>.json`의 새 `closeout` object다.

이 선택을 우선 추천하는 이유:

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

### 1. `.workflow-v2/work-items/<id>.json`

- slice-local canonical closeout snapshot의 유일한 authoritative owner
- supervisor writable scope는 `status`와 `closeout`으로 제한
- stage actor는 free-form markdown patch 대신 structured artifact를 제출

### 2. `.workflow-v2/status.json`

- board summary만 유지
- `lifecycle`, `approval_state`, `verification_status`, 짧은 operator note만 projection
- recovery detail이나 closeout checklist truth는 소유하지 않음

### 3. `docs/workpacks/README.md`

- roadmap row는 canonical closeout snapshot에서 projection
- merged/backfilled 사실을 사람이 보기 좋게 보여주되, authoritative write surface로 취급하지 않음

### 4. `docs/workpacks/<slice>/README.md`

- `Design Status`, `Delivery Checklist`, `Design Authority`는 human-facing projection
- closeout repair branch가 직접 사실을 발명하지 않고 canonical state를 반영

### 5. `docs/workpacks/<slice>/acceptance.md`

- reviewer-readable completion view
- stage actor가 stage artifact를 제출하면 supervisor가 canonical closeout state를 갱신하고, acceptance는 projection/sync target으로 본다

### 6. `docs/workpacks/<slice>/automation-spec.json`

- Stage 1 execution contract는 계속 담당
- closeout metadata는 canonical closeout snapshot에서 필요한 최소 evidence만 projection

### 7. PR Body

- `Actual Verification`, `Closeout Sync`, `Merge Gate`는 generated evidence
- upstream projection source를 다시 계산해서 재생성 가능해야 함
- body 수정만으로 closeout truth가 바뀌면 안 됨

## Recovery History Rule

reset 이후에는 "merged"만 남기지 않고, closeout canonical state에 최소 recovery summary를 남긴다.

남겨야 하는 항목:

- `manual_patch_count`
- `manual_handoff`
- `stale_lock_count`
- `ci_resync_count`
- `artifact_missing`
- `last_recovery_at`

상세 조사와 긴 narrative는 incident registry와 artifact bundle에 남기고,
canonical closeout state에는 운영 품질 판단에 필요한 최소 summary만 유지한다.

## Writer Boundaries

### Stage Actor

- structured stage-result / review artifact 제출
- canonical closeout snapshot을 직접 prose로 편집하지 않음

### Supervisor

- stage artifact ingest
- deterministic merge
- projection sync trigger
- recovery summary update

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

### Step 3. Projection Helper

- canonical closeout snapshot -> README / acceptance / PR body / status projection helper를 추가한다.
- sync helper가 있으면 markdown rule은 projection 설명으로 줄인다.

### Step 4. Rule Surface Slimming

- `AGENTS.md`, `slice-workflow.md`, `agent-workflow-overview.md`, `.opencode/README.md`에서 closeout ownership 중복을 제거한다.
- 사람에게 필요한 설명은 "무엇을 제출해야 하는가" 중심으로 남기고, "어디를 어떻게 맞춘다"는 projection contract로 이동한다.

### Step 5. Matrix Downgrade

- `bookkeeping-authority-matrix.md`를 compatibility note 또는 migration appendix 수준으로 축소한다.

## Open Questions

1. `closeout`을 work item에 넣을지, 별도 `.workflow-v2/closeouts/<id>.json`으로 분리할지
2. acceptance projection을 완전 자동 생성으로 볼지, semi-generated sync target으로 볼지
3. recovery summary의 최소 필드 집합을 어디까지 둘지
4. operator exceptional edit 권한을 어떤 validator로 제한할지

## Success Criteria

이 후보 설계가 맞다면 이후 변화는 아래처럼 보여야 한다.

- closeout drift 설명이 여러 markdown 문서에 반복되지 않는다.
- stage actor는 closeout markdown patch 규칙보다 artifact contract를 더 많이 본다.
- PR body/README/acceptance/status가 같은 사실을 각자 소유하지 않는다.
- slice replay에서 closeout repair가 projection 재생성에 가까워진다.
