# Homecook OMO-Lite Dispatch Contract

## Purpose

이 문서는 Codex supervisor가 stage별로 어떤 입력을 읽고, 어떤 actor에게 어떤 요청을 만들며, 어떤 산출물을 요구하는지 정의한다.

dispatch contract가 고정되면:

- prompt drift를 줄일 수 있고
- stage handoff를 재현 가능하게 만들 수 있으며
- 이후 dispatcher script 구현도 같은 contract를 사용할 수 있다.

현재 이 contract의 최소 구현은:

- `scripts/omo-lite-dispatch-stage.mjs`
- `scripts/omo-lite-sync-status.mjs`
- `scripts/omo-lite-run-stage.mjs`

## Input Contract

각 dispatch는 최소한 아래 정보를 입력으로 가진다.

- `work_item_id`
- `preset`
- `change_type`
- `risk`
- `surface`
- `stage`
- `docs_refs`
- `branch`
- `pr_path` 또는 `pending`
- `required_checks`
- `verification_status`
- `approval_state`
- `claude_budget_state`: `available | constrained | unavailable`
- `session_role`: `claude_primary | codex_primary`
- `session_id` 또는 `missing`
- `resume_mode`: `fresh | continue | scheduled_retry`
- `retry_at`
- `attempt_count`
- `reason_code`: `codex_repairable | claude_repairable | product_defect | omo_defect | ci_wait | blocked_on_external | manual_decision_required` 중 하나
- `reason_detail_code`: 선택 필드. 예: `pr_body_section_drift`, `checklist_evidence_drift`, `stale_ci_snapshot`, `public_contract_change`
- `open_questions`
- `external_smoke_needed`
- `workspace_path`
- `workspace_branch`
- `active_pr`
- `active_pr_head_sha`

`claude_budget_state`는 아래 우선순위로 해석한다.

1. `--claude-budget-state`
2. `OMO_CLAUDE_BUDGET_STATE`
3. `.opencode/claude-budget-state.json`
4. provider-aware local auth / health hint

## Output Contract

dispatch 결과는 아래를 포함한다.

- `actor`: `claude | codex | codex-worker | human`
- `goal`
- `required_reads[]`
- `deliverables[]`
- `verify_commands[]`
- `status_patch`
- `runtime_patch`
- `session_binding`
- `retry_decision`
- `repair_decision`
- `success_condition`
- `escalation_if_blocked`
- `artifact_dir` (stage run 시)
- `stage_result_schema`

code stage 결과 schema는 아래 필드를 포함한다.

- `result`
- `summary_markdown`
- `pr.title`
- `pr.body_markdown`
- `commit.subject`
- `commit.body_markdown` optional
- `checks_run`
- `next_route`

사람이 읽는 필드(`summary_markdown`, `pr.title`, `pr.body_markdown`)는 기본적으로 한국어로 작성한다.

code stage supervisor-owned bookkeeping:

- Stage 2 finalize 시 `docs/workpacks/README.md` Slice Status `docs -> in-progress`
- Stage 4 finalize 시 `docs/workpacks/<slice>/README.md` Design Status `temporary -> pending-review`

final closeout supervisor-owned bookkeeping:

- Stage 6 approve 뒤 `merge_pending`으로 들어가기 전 supervisor가 같은 frontend PR branch에 final closeout projection을 commit/push한다.
- final closeout projection은 `docs/workpacks/README.md` Slice Status `merged`, `.workflow-v2/work-items/<slice>.json#status`의 `lifecycle=merged / approval_state=dual_approved / verification_status=passed`, `.workflow-v2/status.json` item의 같은 terminal status를 포함한다.
- 위 projection을 deterministic하게 만들 수 있으면 supervisor가 직접 고친다.
- deterministic projection을 넘어서 stage-owned evidence 판단이 필요하면 supervisor가 owner agent에게 bounded closeout repair를 dispatch한 뒤 recheck한다.
- owner agent repair 뒤에도 모호하거나 권한 밖이면 merge하지 않고 `human_escalation`으로 fail-closed 한다.
- `human_escalation`은 `manual_decision_required` 또는 repair budget 소진 뒤 같은 finding이 남은 경우에만 사용한다.

review stage 결과 schema는 아래 필드를 포함한다.

- `decision`
- `body_markdown`
- `route_back_stage`
- `approved_head_sha`

review stage의 `body_markdown`도 기본적으로 한국어로 작성한다.

review feedback는 runtime `last_review.<role>.body_markdown`에 저장되고, Stage 2/4 재실행 시 prompt에 다시 주입된다.
Codex rebuttal bundle은 runtime `last_rebuttal.<role>`에 저장되고, 다음 Stage 3/5/6 review prompt에 다시 주입된다.

internal 1.5 subphase:

- `doc_gate_repair`는 `stage=2`, `subphase=doc_gate_repair`로 dispatch한다.
- `doc_gate_review`는 `stage=2`, `subphase=doc_gate_review`로 dispatch한다.
- 둘 다 public stage number를 바꾸지 않는다.
- `doc_gate_repair`는 `docs/<slice>` 단일 브랜치에서 Stage 1 artifact 범위만 변경한다.
- `doc_gate_review approve` 뒤에만 docs PR merge와 Stage 2 implementation handoff가 가능하다.

internal 6.5 subphase:

- `closeout_reconcile_repair`는 `stage=6`, `subphase=closeout_reconcile_repair`로 dispatch할 수 있다.
- actor는 finding owner에 따라 `codex` 또는 `claude`다. Stage 6 review/closeout checklist drift는 Codex, Claude-owned authority/evidence drift는 Claude로 route back 한다.
- deliverable은 bounded repair patch, repaired finding ids, verify command output, remaining blocker summary다.
- success condition은 final closeout projection recheck pass이며, product contract 변경이나 authority verdict 변경이 필요하면 `human_escalation`으로 반환한다.

Stage 4 authority subphase:

- `authority_precheck`는 `stage=4`, `subphase=authority_precheck`로 dispatch한다.
- actor는 Codex다.
- 이 subphase는 mobile UX evidence, authority report draft, blocker/major/minor 구조화를 담당한다.
- `product-design-authority` final authority 판정은 Stage 5 `final_authority_gate`의 Claude가 담당한다.

Stage 5 authority subphase:

- `final_authority_gate`는 `stage=5`, `subphase=final_authority_gate`로 dispatch한다.
- actor는 Claude다.
- public Stage 5 Codex review가 authority-required slice를 통과시킨 뒤에만 실행한다.

## Dispatch Matrix

| Stage | Actor | Goal | Required Reads | Deliverables |
|------|-------|------|----------------|--------------|
| 1 | Claude | workpack 문서 작성 | AGENTS, current source, workpack roadmap, slice workflow, official docs, workflow status | README, acceptance, automation-spec, workflow-v2 work item, workflow-v2 status item, valid stage result |
| 2 | Codex | backend contract-first 구현 | AGENTS, slice workflow, workpack, acceptance, automation-spec, API/DB docs, 이전 backend review feedback(있으면) | internal 1.5 `pass` 뒤 `$ralph`-driven backend impl, roadmap status `in-progress`, checklist updates/rebuttals, valid stage result |
| 3 | Claude | backend PR review | workpack, acceptance, PR diff, CI | review summary, reviewed checklist ids, requested changes or approve |
| 4 | Claude | frontend 구현 | AGENTS, slice workflow, workpack, acceptance, automation-spec, design refs, mobile UX / anchor / authority docs, 이전 frontend review feedback(있으면) | FE implementation, authority-required면 Codex `authority_precheck`, Design Status `pending-review`, checklist updates/rebuttals, valid stage result |
| 5 | Codex | design review | FE PR diff, workpack UI scope, acceptance FE checklist, design tokens, authority report, mobile UX / anchor docs | design findings or approve, reviewed checklist ids, authority-required면 Claude `final_authority_gate`로 handoff, non-authority slice의 Design Status `confirmed` 근거 |
| 6 | Codex | frontend PR review | FE PR diff, CI, acceptance, merged bookkeeping 포함 최종 PR diff | review summary, closeout checklist coverage, requested changes or approve, approve 뒤 supervisor final projection commit과 merge 또는 manual merge handoff |

## Session Binding Contract

session binding은 dispatch 전에 계산한다.

기본 매핑:

- Stage `1 / 3 / 4` -> `claude_primary`
- Stage `2 / 5 / 6` -> `codex_primary`
- Stage 4 `authority_precheck` -> `codex_primary`
- Stage 5 `final_authority_gate` -> `claude_primary`
- Stage 2 `doc_gate_review` -> `codex_primary`
- Stage 2 `doc_gate_repair` -> `claude_primary`

규칙:

1. `session_id`가 없으면 해당 역할의 첫 실행으로 간주한다.
2. `resume_mode = fresh`이면 새 세션을 만들고 저장한다.
3. `resume_mode = continue`이면 저장된 session ID로 이어간다.
4. `resume_mode = scheduled_retry`이면 같은 stage를 같은 session ID로 다시 시도한다.
5. 저장된 session ID가 유효하지 않으면 `actor=human`으로 즉시 바꾸지 않고, 먼저 `human_escalation` 상태와 함께 blocker를 남긴다.
6. silent session recreation은 금지한다.

provider별 resume 규칙:

- `claude-cli` -> `claude --resume <session_id>`
- `opencode` -> `opencode run --session <session_id>`
- `--continue`는 deterministic하지 않으므로 자동화에서 사용하지 않는다.

## Stage Prompt Skeletons

### Stage 1 → Claude

- goal: `슬라이스 <id> 1단계 진행`
- must read:
  - `AGENTS.md`
  - `docs/workpacks/README.md`
  - `docs/engineering/slice-workflow.md`
  - `.workflow-v2/status.json`
  - 공식 문서 해당 섹션
- success:
  - README + acceptance + automation-spec 작성
  - `.workflow-v2/work-items/<slice>.json` + `.workflow-v2/status.json` item 작성
  - valid `stage-result.json`
  - in-scope docs 변경만 반영
  - verify command 실행
  - supervisor handoff용 commit subject/body 제안 작성
  - GitHub PR 생성/merge는 하지 않음

### Stage 2 → Codex

- goal: `슬라이스 <id> 2단계 진행`
- must read:
  - `AGENTS.md`
  - `docs/engineering/slice-workflow.md`
  - `docs/workpacks/<slice>/README.md`
  - `docs/workpacks/<slice>/acceptance.md`
  - `docs/workpacks/<slice>/automation-spec.json`
  - 관련 공식 API / DB 문서
- success:
  - 내부 `doc_gate_check`가 이미 `pass`
  - contract-first test
  - backend implementation
  - strict slice에서는 `$ralph` skill loop로 실행
  - valid `stage-result.json`
  - `checklist_updates[]`에 Stage 2 소유 checklist id 기록
  - 필요 시 `contested_fix_ids[]`, `rebuttals[]` 작성
  - `docs/workpacks/README.md` Slice Status `docs -> in-progress`는 supervisor finalize에 포함됨
  - in-scope 파일만 수정
  - verify command 실행
  - supervisor handoff용 commit subject/body 제안 작성
  - GitHub PR 생성/merge는 하지 않음

### Internal 1.5 → Claude (`stage=2`, `subphase=doc_gate_repair`)

- goal: `슬라이스 <id> internal 1.5 docs repair`
- must read:
  - `AGENTS.md`
  - `docs/workpacks/<slice>/README.md`
  - `docs/workpacks/<slice>/acceptance.md`
  - `docs/workpacks/<slice>/automation-spec.json`
  - `.workflow-v2/work-items/<slice>.json`
  - `.workflow-v2/status.json`
  - current unresolved doc gate findings
  - latest doc gate rebuttal bundle
- success:
  - Stage 1 artifact 범위의 docs remediation 또는 false-positive rebuttal
  - valid doc gate repair stage result
  - 필요 시 `contested_doc_fix_ids[]`, `rebuttals[]` 작성
  - GitHub PR 생성/merge는 하지 않음

### Internal 1.5 → Codex (`stage=2`, `subphase=doc_gate_review`)

- goal: `슬라이스 <id> internal 1.5 docs review`
- must read:
  - Stage 1 docs PR diff
  - current unresolved doc gate findings
  - latest doc gate rebuttal bundle
- success:
  - `approve | request_changes | blocked`
  - `reviewed_doc_finding_ids[]`, `required_doc_fix_ids[]`, `waived_doc_fix_ids[]`
  - 승인 시 docs PR merge handoff, 이후 `doc_gate_recheck`

### Stage 3 → Claude

- goal: `슬라이스 <id> 3단계 리뷰`
- must read:
  - workpack
  - acceptance checklist metadata
  - backend PR diff
  - failing or passing CI context
- success:
  - `approve | revise`
  - `review_scope`, `reviewed_checklist_ids`, `required_fix_ids`, `waived_fix_ids` 작성
  - blocking / non-blocking 분리

### Stage 4 → Claude

- goal: `슬라이스 <id> 4단계 진행`
- must read:
  - workpack
  - acceptance
  - `docs/workpacks/<slice>/automation-spec.json`
  - merged backend contract
  - design token references
  - `docs/design/mobile-ux-rules.md`
  - `docs/design/anchor-screens.md`
  - `docs/engineering/product-design-authority.md`
- success:
  - FE implementation
  - state UI
  - authority-required면 mobile UX evidence + authority report draft
  - strict slice여도 Stage 4는 현재 `single_pass`로 실행
  - valid `stage-result.json`
  - `checklist_updates[]`에 Stage 4 소유 checklist id 기록
  - 필요 시 `contested_fix_ids[]`, `rebuttals[]` 작성
  - Design Status `temporary -> pending-review`는 supervisor finalize에 포함됨
  - in-scope 파일만 수정
  - verify command 실행
  - supervisor handoff용 commit subject/body 제안 작성
  - GitHub PR 생성/merge는 하지 않음

### Stage 4 → Codex (`subphase=authority_precheck`)

- goal: `슬라이스 <id> authority precheck`
- must read:
  - `docs/workpacks/<slice>/README.md`
  - `docs/workpacks/<slice>/acceptance.md`
  - `docs/workpacks/<slice>/automation-spec.json`
  - `docs/design/mobile-ux-rules.md`
  - `docs/design/anchor-screens.md`
  - `docs/engineering/product-design-authority.md`
- success:
  - mobile UX evidence bundle
  - authority report draft
  - `authority_verdict`, `reviewed_screen_ids`, `authority_report_paths`, `evidence_artifact_refs`, `blocker_count`, `major_count`, `minor_count`가 포함된 valid stage-result
  - `checklist_updates[]`는 delta-only로 기록할 수 있다. supervisor는 직전 Stage 4 implementation `stage-result`의 checklist snapshot을 deterministic merge해서 full snapshot으로 finalize한다.
  - blocker가 남으면 Stage 4로 route back

### Stage 5 → Codex

- goal: `슬라이스 <id> 5단계 디자인 리뷰`
- must read:
  - `docs/workpacks/<slice>/README.md`
  - `docs/workpacks/<slice>/acceptance.md`
  - FE PR diff
  - design token docs
  - `docs/design/mobile-ux-rules.md`
  - `docs/design/anchor-screens.md`
  - `docs/engineering/product-design-authority.md`
  - authority report
  - relevant screen definition
- success:
  - visual / interaction findings
  - `review_scope`, `reviewed_checklist_ids`, `required_fix_ids`, `waived_fix_ids` 작성
  - authority-required면 Claude `final_authority_gate`로 handoff하거나 fix request
  - non-authority slice는 `confirmed` or fix request
  - 승인 시 Stage 6 또는 `final_authority_gate` 진행 근거 제시

### Stage 5 → Claude (`subphase=final_authority_gate`)

- goal: `슬라이스 <id> final authority gate`
- must read:
  - `docs/workpacks/<slice>/README.md`
  - `docs/workpacks/<slice>/acceptance.md`
  - authority report
  - FE PR diff
  - mobile UX / anchor docs
- success:
  - `authority_verdict`, `reviewed_screen_ids`, `authority_report_paths`, `blocker_count`, `major_count`, `minor_count`
  - `pass`면 `confirmed` 가능, 그 외는 Stage 4로 route back

### Stage 6 → Codex

- goal: `슬라이스 <id> 6단계 코드 리뷰`
- must read:
  - `docs/workpacks/<slice>/README.md`
  - FE PR diff
  - acceptance
  - CI context
- success:
  - code-quality findings
  - `review_scope`, `reviewed_checklist_ids`, `required_fix_ids`, `waived_fix_ids` 작성
  - `approve | revise`
  - supervisor가 Stage 6 approve 뒤 최종 PR branch에 final closeout projection을 반영한다.
  - final closeout projection에는 roadmap `merged`, `.workflow-v2/work-items/<slice>.json#status`의 `merged / dual_approved / passed`, `.workflow-v2/status.json` item의 `merged / dual_approved / passed`가 포함된다.
  - projection drift가 deterministic하면 supervisor가 직접 repair한다. stage-owned evidence 판단이 필요하면 `closeout_reconcile_repair`로 owner agent에게 bounded repair를 맡긴다.
  - internal 6.5 recheck와 해당 CI가 끝나면 auto-merge 또는 manual verification/merge handoff로 진행한다.

## Loop Dispatch Rules

### Plan Loop

Codex supervisor는 아래 중 하나면 plan loop dispatch를 만든다.

- `risk in {medium, high, critical}`
- `preset == infra-governance`
- `open_questions.length > 0`
- external contract ambiguity

plan loop output에서 `required_changes`가 비어야 구현 단계로 간다.

### Review Loop

Codex supervisor는 아래에서만 review loop dispatch를 만든다.

- `preset == infra-governance`
- `change_type == docs-only` 이지만 cross-cutting docs sync가 큰 경우
- exceptional recovery로 정식 Stage 리뷰 이후 반복 수정이 길어질 때

product slice 기본 경로에서는 review loop dispatch를 만들지 않는다.
단, Stage 1 docs gate는 예외가 아니라 supervisor 기본 경로다.

## Direct Execution Binding

Phase 5부터 Codex supervisor는 dispatch 결과를 repo-local OpenCode/OMO 실행에 연결할 수 있다.

target 규칙:

- `actor == codex`인 dispatch는 `codex_primary` session으로 실행한다.
- `actor == claude`인 dispatch는 `claude_primary` session으로 실행한다.
- 각 역할의 첫 실행만 새 세션 생성 대상이다.
- 후속 stage는 반드시 저장된 session ID로 이어간다.
- 모든 run은 `.artifacts/omo-lite-dispatch/<timestamp>-<slice>-stage-<n>/` 아래에 `dispatch.json`, `prompt.md`, `run-metadata.json`을 남긴다.
- executable run이면 같은 경로에 provider-specific stdout/stderr log도 남긴다.
- `claude-cli` run은 JSON stdout에서 `session_id`, `modelUsage`, `usage`, `total_cost_usd`를 파싱해 metadata에 남긴다.
- stage agent는 supervisor가 읽을 수 있는 structured stage result를 artifact에 남긴다.
- stage agent는 GitHub PR 생성/Ready/merge를 직접 수행하지 않는다.
- code stage의 git commit/push ownership도 supervisor가 가진다.
- `--sync-status`를 함께 주면 dispatch의 `status_patch`와 artifact 경로가 `.workflow-v2/status.json`에 같이 반영된다.
- direct execution은 merge automation 자체를 수행하지 않지만, autonomous supervisor가 이어서 읽을 수 있는 stage result를 남겨야 한다.
- supervisor lifecycle에서 code stage는 `stage_result_ready -> verify_pending -> commit_pending -> push_pending -> pr_pending -> wait` 순서로 auto-finalize될 수 있다.
- autonomous product review stage approve 후에는 current head 전체 PR checks와 external smoke가 green이면 바로 merge할 수 있다.

## Fallback Routing

### Claude Available

- normal route 사용
- public review/approval은 stage owner가 담당하고, authority-required 추가 gate는 Claude가 담당한다

### Claude Constrained

- 가능한 한 Stage 1 / 3 / 4와 Stage 5 `final_authority_gate`만 Claude에 배정
- Stage 2 / 5 / 6과 Stage 4 `authority_precheck` 전후의 planning, verification, recovery는 Codex가 흡수

### Claude Unavailable

- Claude-owned stage는 시작하지 않고 `scheduled_retry`로 전환한다.
- `status_patch.lifecycle = blocked`
- blocked retry 중 `status_patch`는 approval_state를 덮어쓰지 않는다.
- `runtime_patch.retry.at = now + 5h`가 기본값이다.
- next actor는 계속 `claude`이며, due 시점이 되면 같은 session ID로 재개한다.
- session loss 또는 retry exhaustion일 때만 `human` escalation을 계산한다.
- repo-local override를 강제로 두고 싶으면 `pnpm omo:claude-budget -- --set unavailable --reason "<reason>"`를 사용한다.

## Status Patch Contract

dispatch가 끝나면 supervisor는 최소한 아래 patch를 계산한다.

- `branch`
- `lifecycle`
- `approval_state`
- `verification_status`
- `required_checks`
- `notes`

예:

- Stage 2 시작: `lifecycle = in_progress`
- verify green + PR ready: public code stage owner에 따라 `approval_state = claude_approved` 또는 `codex_approved`
- Claude unavailable: `lifecycle = blocked`, approval_state는 이전 값을 유지
- merge projection: `lifecycle = merged`, `approval_state = dual_approved`, `verification_status = passed`

merge projection 규칙:

- `.workflow-v2/status.json` item과 `.workflow-v2/work-items/<id>.json#status`는 같은 terminal triplet(`merged / dual_approved / passed`)을 가져야 한다.
- 이 status patch는 closeout truth 자체가 아니라 `.workflow-v2/work-items/<id>.json#closeout` canonical snapshot에서 나온 board/work-item projection이다.

## Repo-Local OMO Binding

이 contract는 다음 설정과 함께 동작한다.

- [opencode.json](../../../opencode.json)
- [.opencode/README.md](../../../.opencode/README.md)
- [.opencode/omo-provider.json](../../../.opencode/omo-provider.json)
- [.opencode/oh-my-opencode.json](../../../.opencode/oh-my-opencode.json)

현재 repo-local 기본값은:

- default run agent = `hephaestus`
- `opencode.json`의 direct `agent` / `default_agent` 설정을 우선 사용
- Claude provider 기본값은 `.opencode/omo-provider.json`의 `claude-cli` 설정을 따른다.
- Codex 중심 supervisor 실행
- `ralph-loop` command는 전역 허용
- OMO actual execution은 Stage 2에서 `$ralph` skill-only
- Stage 4 actual execution은 현재 `single_pass`
- `ralph-loop` hook와 `ulw-loop`는 계속 비활성화
- comment-checker 비활성화
- Claude budget override file은 `.opencode/claude-budget-state.json`이며 Git에는 커밋하지 않는다.
- session runtime state는 `.opencode/omo-runtime/` 아래에 두고 Git에는 커밋하지 않는다.
