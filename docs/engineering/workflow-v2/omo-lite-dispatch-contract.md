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

review stage 결과 schema는 아래 필드를 포함한다.

- `decision`
- `body_markdown`
- `route_back_stage`
- `approved_head_sha`

## Dispatch Matrix

| Stage | Actor | Goal | Required Reads | Deliverables |
|------|-------|------|----------------|--------------|
| 1 | Claude | workpack 문서 작성 | AGENTS, current source, template, official docs | README, acceptance, valid stage result |
| 2 | Codex | backend contract-first 구현 | AGENTS, slice workflow, workpack, acceptance, API/DB docs | tests, backend impl, valid stage result |
| 3 | Claude | backend PR review | workpack, PR diff, CI, acceptance | review summary, requested changes or approve |
| 4 | Codex | frontend 구현 | AGENTS, slice workflow, workpack, acceptance, design refs | tests, FE impl, valid stage result |
| 5 | Claude | design review | FE PR diff, design tokens, workpack UI scope | design findings or approve |
| 6 | Claude | frontend PR review | FE PR diff, CI, acceptance | review summary, requested changes or approve |

## Session Binding Contract

session binding은 dispatch 전에 계산한다.

기본 매핑:

- Stage `1 / 3 / 5 / 6` -> `claude_primary`
- Stage `2 / 4` -> `codex_primary`

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
  - 공식 문서 해당 섹션
- success:
  - README + acceptance 작성
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
  - 관련 공식 API / DB 문서
- success:
  - contract-first test
  - backend implementation
  - valid `stage-result.json`
  - in-scope 파일만 수정
  - verify command 실행
  - supervisor handoff용 commit subject/body 제안 작성
  - GitHub PR 생성/merge는 하지 않음

### Stage 3 → Claude

- goal: `슬라이스 <id> 3단계 리뷰`
- must read:
  - workpack
  - backend PR diff
  - failing or passing CI context
- success:
  - `approve | revise`
  - blocking / non-blocking 분리

### Stage 4 → Codex

- goal: `슬라이스 <id> 4단계 진행`
- must read:
  - workpack
  - acceptance
  - merged backend contract
  - design token references
- success:
  - FE implementation
  - state UI
  - valid `stage-result.json`
  - in-scope 파일만 수정
  - verify command 실행
  - supervisor handoff용 commit subject/body 제안 작성
  - GitHub PR 생성/merge는 하지 않음

### Stage 5 → Claude

- goal: `슬라이스 <id> 5단계 디자인 리뷰`
- must read:
  - FE PR diff
  - design token docs
  - relevant screen definition
- success:
  - visual / interaction findings
  - `confirmed` or fix request

### Stage 6 → Claude

- goal: `슬라이스 <id> 6단계 코드 리뷰`
- must read:
  - FE PR diff
  - acceptance
  - CI context
- success:
  - code-quality findings
  - `approve | revise`

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

## Direct Execution Binding

Phase 5부터 Codex supervisor는 dispatch 결과를 repo-local OpenCode/OMO 실행에 연결할 수 있다.

target 규칙:

- `actor == codex`인 Stage 2/4는 `codex_primary` session으로 실행한다.
- `actor == claude`인 Stage 1/3/5/6은 `claude_primary` session으로 실행한다.
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

## Fallback Routing

### Claude Available

- normal route 사용
- stage approval은 Claude가 담당

### Claude Constrained

- 가능한 한 Stage 1 / 3 / 5 / 6만 Claude에 배정
- Stage 2 / 4 전후의 planning, verification, recovery는 Codex가 흡수

### Claude Unavailable

- Claude-owned stage는 시작하지 않고 `scheduled_retry`로 전환한다.
- `status_patch.lifecycle = blocked`
- `status_patch.approval_state = awaiting_claude_or_human`
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
- verify green + PR ready: `lifecycle = ready_for_review`, `approval_state = codex_approved`
- Claude unavailable: `lifecycle = blocked`, `approval_state = awaiting_claude_or_human`
- merge: `lifecycle = merged`, `approval_state = dual_approved`

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
- `ralph-loop` / `ulw-loop` 비활성화
- comment-checker 비활성화
- Claude budget override file은 `.opencode/claude-budget-state.json`이며 Git에는 커밋하지 않는다.
- session runtime state는 `.opencode/omo-runtime/` 아래에 두고 Git에는 커밋하지 않는다.
