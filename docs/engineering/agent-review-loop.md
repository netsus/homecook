# Codex-Claude Review Loop

구현 후 로컬 pre-PR 단계에서 현재 워크트리의 변경분을 Claude와 Codex가 구조화된 리뷰/수정 루프로 수렴시키는 자동화다.

이 문서는 제품 기능 workpack이 아니라 `docs/engineering/` 아래의 repo-engineering automation 설계 문서다.
- governance 기준은 `AGENTS.md`, `CLAUDE.md`, `docs/workpacks/README.md`에 정의된 engineering 예외 규칙을 따른다.
- `docs/workpacks/<slice>/README.md`와 `acceptance.md`는 product slice를 `--workpack`으로 함께 검토할 때만 추가 컨텍스트로 요구된다.

이 자동 local review loop는 `CLAUDE.md`의 일반 PR-ready 게이트에 대한 좁은 예외다.
- 범위는 구조화된 diff 리뷰 자동화에 한정한다.
- 사람이 수행하는 일반 PR 리뷰 규칙은 계속 `CLAUDE.md`를 따른다.
- `--workpack`으로 slice 범위를 명시한 실행은 해당 `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 컨텍스트에 포함해야 한다.

## Why

- 수동으로 Claude 리뷰 결과를 Codex에 전달하고 다시 재검토시키는 비용이 크다.
- 리뷰 코멘트가 반복될 때 어떤 이슈가 남았는지 추적하기 어렵다.
- 로컬 diff 기준으로 merge 전 품질 점검을 더 일관되게 만들고 싶다.

## Fixed Roles

- `Claude`: 현재 `HEAD` 대비 diff를 리뷰하는 primary reviewer
- `Codex`: 리뷰를 반영해 실제 코드를 수정하는 fixer, 마지막 sanity reviewer

최종 `approved`는 아래 authoritative gate를 모두 만족할 때만 가능하다.
- `Claude approve`
- `Codex approve`
- 양쪽 `required_changes=[]`
- `--verify-cmd`가 하나라도 있으면 `verification_status=passed`
- `omitted_review_targets=[]`

위 조건 중 하나라도 빠지면 최종 상태는 `approved`가 아니라 기존 vocabulary 안의 `needs_revision`, `blocked`, `stalled`, `max_rounds_reached` 중 하나여야 한다.

## Convergence Rules

루프는 아래 조건 중 하나를 만족하면 멈춘다.

1. `Claude approve` + `Codex approve` + `required_changes=[]`
2. `blocker_status=blocker` 또는 `decision=block`
3. 같은 필수 수정 이슈만 반복되어 `stalled` 상태가 된 경우
4. `max_rounds`에 도달한 경우

같은 이슈만 반복되는 마지막 라운드라면 `max_rounds_reached`보다 `stalled`를 우선 기록한다.

## Review Target

- 기본 대상은 현재 `HEAD` 대비 작업 트리 diff다.
- tracked staged/unstaged 변경을 포함한다.
- untracked non-ignored text file도 포함한다.
- binary 또는 `50,000` byte보다 큰 파일은 본문 대신 `review target omitted` 메모를 남긴다.
- 이 omission rule은 working tree에 남아 있는 파일뿐 아니라 deleted tracked file의 `HEAD` blob에도 동일하게 적용한다.
- `50,000` byte inline threshold는 V1 고정값이다. 설정 가능화는 V1 범위 밖이다.
- diff가 비어 있으면 루프는 즉시 실패한다.
- diff는 있지만 모든 review target이 omitted이면 루프는 즉시 실패한다.
- all-omitted 실패는 사람이 직접 확인해야 하는 `human-review-required` 성격의 실패로 기록한다.
- omitted target이 하나라도 남아 있는 run은 `final-summary.json.omitted_review_targets[]`에 남겨야 한다.
- `omitted_review_targets[]`는 loop 종료 시점의 latest/current diff 기준으로 아직 inline review에서 빠진 target만 기록한다.
- `omitted_review_targets[]`가 비어 있지 않으면 최종 approval은 사람이 omission을 해소하거나 별도 판단할 때까지 완료된 것으로 간주하지 않는다.
- 종료 시 다른 blocker/stalled/max-rounds 조건이 없고 `omitted_review_targets[]`만 남아 있으면 `final-summary.json.status`는 `approved`가 아니라 `needs_revision`이어야 한다.
- 종료 시 latest/current diff 재수집에서는 explicit empty-diff만 `targets/current.diff` placeholder로 기록하고, 다른 git/filesystem 오류는 fatal failure artifact로 남긴다.

## CLI Usage

```bash
pnpm agent:review-loop -- \
  --goal "현재 diff를 리뷰하고 필수 수정이 없을 때까지 수렴시켜줘" \
  --verify-cmd "pnpm test -- agent-review-loop" \
  --max-rounds 3
```

### Optional Flags

- `--goal-file <path>`
- `--workpack <slice>`
- `--context-file <path>`
- `--output-dir <path>`
- `--verify-cmd <command>`: 각 Codex 수정 라운드 뒤 순서대로 실행한다.
- `--codex-model <model>`
- `--codex-effort <level>`
- `--claude-model <model>`
- `--claude-effort <level>`

## Included Context

기본 컨텍스트는 아래 파일을 항상 포함한다.
- `AGENTS.md`
- `CLAUDE.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/agent-review-loop.md`
- `docs/engineering/subagents.md`
- `docs/engineering/agent-workflow-overview.md`
- `scripts/agent-review-loop.mjs`
- `scripts/lib/agent-review-loop.mjs`
- `scripts/lib/agent-loop-core.mjs`
- `scripts/schemas/agent-plan-review.schema.json`
- `scripts/schemas/agent-review-fix.schema.json`
- `tests/agent-review-loop.test.ts`

추가 규칙:
- repo-engineering automation 설계/구현 검토에서는 위 companion wrapper/schema/test 파일까지 자동 포함하는 것이 기본 동작이다.
- 즉, engineering 예외 작업의 핵심 설계 문서와 직접 연결된 implementation/test context는 operator가 임의로 기억해 추가하는 선택 문맥이 아니다.
- `--workpack <slice>`가 있으면 `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 반드시 포함한다. (미존재 시 오류)
- `--context-file <path>`는 반복 지정 가능하며, 지정된 파일을 그대로 추가한다.
- 각 라운드 프롬프트에는 최신 review target diff, 최신 verification context, 위 컨텍스트 번들이 함께 들어간다.

## Output Contract

### Review JSON

- `decision`
- `summary`
- `blocker_status`
- `required_changes[]`
- `recommended_changes[]`
- `unresolved_questions[]`

각 변경 항목은 `id`, `title`, `details`, `file_path`, `line`, `source_refs[]`를 가진다.
- `file_path`, `line`은 key 자체는 항상 존재하는 nullable 필드다.
- 실제 실행 계약의 기준은 `scripts/schemas/agent-plan-review.schema.json`이다.

### Fix JSON

- `summary`
- `files_changed[]`
- `tests_run[]`
- `verification_status`
- `remaining_risks[]`

`verification_status`는 Codex가 응답에 채우더라도 wrapper가 실제 `--verify-cmd` 결과로 덮어쓴다.
- 실제 실행 계약의 기준은 `scripts/schemas/agent-review-fix.schema.json`이다.

### Stable Machine-Readable Artifacts

- `final-summary.json`
  - field set:
    - `goal`
    - `status`
    - `rounds_completed`
    - `current_target_path`
    - `omitted_review_targets`
    - `claude_last_decision`
    - `codex_last_decision`
    - `claude_required_changes`
    - `codex_required_changes`
    - `unresolved_questions`
    - `verification_status`
    - `verification_commands`
    - `last_fix`
    - `pingpong_log_path`
    - `resolved_agent_config`
  - `status` vocabulary: `approved`, `blocked`, `stalled`, `max_rounds_reached`, `needs_revision`
  - path field는 run directory 기준 상대 경로를 사용한다.
  - `omitted_review_targets`는 항상 존재하는 배열이다. 각 항목은 `{ filePath, reason }` shape를 가진다.
  - `last_fix`는 항상 존재하는 nullable field다. zero-fix approval 또는 fix 없는 종료 경로에서는 반드시 `null`이다.
- `failure-summary.json`
  - field set:
    - `goal`
    - `stage`
    - `code`
    - `message`
    - `artifact_paths`
    - `details`
  - `code` vocabulary: `all_review_targets_omitted`, `empty_review_target`, `missing_context_file`, `structured_output_parse_failure`, `codex_invocation_failure`, `claude_invocation_failure`, `fatal_error`
  - `artifact_paths`는 run directory 기준 상대 경로를 사용한다.
- `resolved_agent_config`
  - exact structure:
    - `codex.model`
    - `codex.modelSource`
    - `codex.effort`
    - `codex.effortSource`
    - `claude.model`
    - `claude.modelSource`
    - `claude.effort`
    - `claude.effortSource`
  - source vocabulary: `resolved`, `requested`, `configured`, `default`, `pending`
- verification result vocabulary: `passed`, `failed`, `skipped`

## Verification Policy

- `--verify-cmd`가 있으면 각 Codex 수정 라운드 뒤 순서대로 실행한다.
- `--verify-cmd`가 있으면 **최종 approval 직전에도** 최신 diff 기준으로 다시 실행한다.
- 이 규칙은 첫 라운드 zero-fix approval 경로에도 동일하게 적용한다. 즉, zero-fix approval도 verification gate를 건너뛰지 않는다.
- 명령이 없으면 verification 상태는 `skipped`다.
- verification command가 하나라도 있으면 최종 approval에는 `verification_status=passed`가 필요하다.
- verification command가 있는데 실패하면 approval 대신 필수 수정으로 되돌린다.
- `skipped`여도 review convergence는 가능하지만, loop는 tests green을 주장하지 않는다.
- 마지막 successful review라도 최신 verification이 실패 상태면 approval 대신 추가 수정이 필요하다고 기록한다.
- verification failure는 `blocked`가 아니라 `needs_revision` 계열의 required change로 분류한다.
- approval verification과 post-fix verification은 phase-scoped artifact path를 사용해 같은 round에서도 trace를 덮어쓰지 않는다.
- zero-fix approval path에서도 `Claude approve -> approval verification -> Codex final review` 순서를 유지한다.
- approval verification의 ordered path는 아래로 고정한다.
  1. 최신 diff를 수집한다.
  2. Claude가 `approve` + `required_changes=[]`인지 확인한다.
  3. `--verify-cmd`가 있으면 최신 diff 기준으로 verification을 먼저 실행한다.
  4. verification이 실패하면 `needs_revision` required change로 되돌리고 Codex final review는 건너뛴다.
  5. verification이 통과하거나 verification command가 없을 때만 Codex final review로 진행한다.
  6. Codex도 `approve` + `required_changes=[]`일 때만 최종 `approved`가 된다.

## Convergence Signature

- `stalled` 판정은 필수 수정 이슈의 signature가 반복될 때 발생한다.
- 비교 대상은 Claude와 Codex의 `required_changes[]`를 합친 combined signature set이다.
- signature는 `id`, `file_path`, `line`의 조합으로 계산한다.
- `title`, `details`, `source_refs[]`는 설명 추적용일 뿐 stalled identity에는 포함하지 않는다. 같은 이슈가 문구만 조금 바뀌거나 문서/코드 ref를 오가더라도 stalled 판정은 흔들리지 않아야 한다.
- executable rule:
  1. 현재 라운드 combined signature set이 비어 있지 않다.
  2. 현재 라운드에서 직전 라운드 대비 새 required signature가 하나도 추가되지 않았다.
  3. 현재 라운드에서 직전 라운드 대비 기존 required signature가 하나도 제거되지 않았다.
  4. 위 세 조건이 동시에 성립하면, 즉 exact same signature set이 반복될 때만 `stalled`를 기록한다.
- 마지막 라운드에서 같은 signature만 반복되면 `max_rounds_reached`보다 `stalled`를 우선 기록한다.

## Artifacts

기본 산출물은 `.artifacts/agent-review-loop/<timestamp>/` 아래에 저장된다.

### Stable V1 Contract Artifacts

- `goal.md`
- `context-files.txt`
- `context-bundle.md`
- `pingpong-log.md`
- `final-summary.json`
- `final-summary.md`

### Debug / Trace Artifacts

- `targets/*.diff`
- `prompts/*.txt`
- `reviews/*.json`
- `reviews/*.md`
- `fixes/*.json`
- `fixes/*.md`
- `verification/**/*.txt`

`pingpong-log.md`는 step별 timestamp와 model/effort label을 남기고, `final-summary.md`는 verification 상태와 남은 required changes를 한 번에 보여준다.
`final-summary.json`은 V1의 stable machine-readable summary artifact다.

### Failure Artifacts

- timestamped run directory는 risky operation 전에 먼저 생성한다.
- empty diff, missing context, structured output parse failure, all-targets-omitted, Claude/Codex CLI failure 같은 fatal exit는 run-local `failure-summary.json`, `failure-summary.md`를 남긴다.
- `failure-summary.json`과 `failure-summary.md`는 fatal exit에서만 생성되는 conditional artifact다. 정상 종료 run에는 없어도 계약 위반이 아니다.
- failure artifact는 최소한 `stage`, machine-readable `code`, human-readable `message`, latest known artifact path를 기록한다.
- omitted target의 historical trail은 `targets/*.diff`와 `pingpong-log.md`에 남기고, `final-summary.json.omitted_review_targets[]`는 latest/current diff snapshot만 나타낸다.
- global `.artifacts/agent-review-loop/last-error.log`는 convenience pointer일 뿐이고, run-local failure artifact를 대체하지 않는다.
- `human-review-required`는 operator action 설명이지 별도 status vocabulary가 아니다.

## Metadata Honesty

- model/effort는 실제 실행에서 관측된 경우에만 `resolved`로 표기한다.
- 그렇지 않으면 `requested`, `configured`, `default`, `pending` 중 하나로 남긴다.
- metadata source label vocabulary는 `resolved`, `requested`, `configured`, `default`, `pending`으로 고정한다.
- machine-readable `resolved_agent_config`에서는 값을 아직 관측하지 못했으면 placeholder string 대신 `null`을 사용하고, source label이 그 상태를 설명한다.
- human-readable artifact에서는 값이 아직 없을 때 `default (pending)` 같은 misleading 조합을 만들지 않는다. 예를 들어 아직 관측 전이면 `pending`, 값이 없고 truly default path만 아는 경우는 `default`, 그 외는 `unresolved (<source>)`처럼 source를 드러낸다.
- artifact path는 markdown과 machine-readable JSON 모두 run directory 기준 상대 경로를 우선 사용한다.
- Claude effort는 CLI가 실제 resolved 값을 돌려주지 않으면 `configured` 또는 `requested`로 유지한다.
- wrapper-generated verification gate, skipped final review, approval gate note 같은 synthetic trace entry는 실제 Codex/Claude invocation이 아니므로 resolved model/effort를 재사용하지 않는다.
- stable summary field인 `claude_last_decision`, `codex_last_decision`, `claude_required_changes`, `codex_required_changes`는 가장 최근의 real agent review invocation만 반영한다.

## Guardrails

- 루프는 commit, push, PR 생성은 하지 않는다.
- Codex는 unrelated user edits를 되돌리지 않는다.
- verification이 실패하면 사람 대신 조용히 승인하지 않는다.
- workpack이 주어지면 `docs/workpacks/<slice>/README.md`를 반드시 컨텍스트에 포함한다.
