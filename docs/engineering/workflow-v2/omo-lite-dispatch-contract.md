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
- `open_questions`
- `external_smoke_needed`

## Output Contract

dispatch 결과는 아래를 포함한다.

- `actor`: `claude | codex | codex-worker | human`
- `goal`
- `required_reads[]`
- `deliverables[]`
- `verify_commands[]`
- `status_patch`
- `success_condition`
- `escalation_if_blocked`
- `artifact_dir` (stage run 시)

## Dispatch Matrix

| Stage | Actor | Goal | Required Reads | Deliverables |
|------|-------|------|----------------|--------------|
| 1 | Claude | workpack 문서 작성 | AGENTS, current source, template, official docs | README, acceptance, docs PR |
| 2 | Codex | backend contract-first 구현 | AGENTS, slice workflow, workpack, acceptance, API/DB docs | tests, backend impl, Draft PR |
| 3 | Claude | backend PR review | workpack, PR diff, CI, acceptance | review summary, requested changes or approve |
| 4 | Codex | frontend 구현 | AGENTS, slice workflow, workpack, acceptance, design refs | tests, FE impl, Draft PR |
| 5 | Claude | design review | FE PR diff, design tokens, workpack UI scope | design findings or approve |
| 6 | Claude | frontend PR review | FE PR diff, CI, acceptance | review summary, requested changes or approve |

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
  - status `planned -> docs`
  - docs PR merge 준비

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
  - Draft PR + required checks green

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
  - Draft PR + green CI

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

현재 규칙:

- `actor == codex`인 Stage 2/4만 `pnpm omo:run-stage -- --mode execute` 대상이다.
- Stage 1/3/5/6은 reviewer stage이므로 실행 대신 handoff artifact만 만든다.
- 모든 run은 `.artifacts/omo-lite-dispatch/<timestamp>-<slice>-stage-<n>/` 아래에 `dispatch.json`, `prompt.md`, `run-metadata.json`을 남긴다.
- executable run이면 같은 경로에 `opencode.stdout.log`, `opencode.stderr.log`도 남긴다.
- direct execution은 merge automation을 포함하지 않는다.

## Fallback Routing

### Claude Available

- normal route 사용
- stage approval은 Claude가 담당

### Claude Constrained

- 가능한 한 Stage 1 / 3 / 5 / 6만 Claude에 배정
- Stage 2 / 4 전후의 planning, verification, recovery는 Codex가 흡수

### Claude Unavailable

- Stage 1 / 3 / 5 / 6 자동 진행 금지
- Codex supervisor는 provisional summary만 생성 가능
- `approval_state = awaiting_claude_or_human`
- next actor는 `claude` 또는 `human`

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
- Claude unavailable: `approval_state = awaiting_claude_or_human`
- merge: `lifecycle = merged`, `approval_state = dual_approved`

## Repo-Local OMO Binding

이 contract는 다음 설정과 함께 동작한다.

- [opencode.json](../../../opencode.json)
- [.opencode/README.md](../../../.opencode/README.md)
- [.opencode/oh-my-opencode.json](../../../.opencode/oh-my-opencode.json)

현재 repo-local 기본값은:

- default run agent = `hephaestus`
- Codex 중심 supervisor 실행
- `ralph-loop` / `ulw-loop` 비활성화
- comment-checker 비활성화

이 기본값은 direct agent execution까지는 아직 연결되지 않았기 때문에 보수적으로 잡아둔 것이다.
