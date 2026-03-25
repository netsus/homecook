# Codex-Claude Plan Loop

문서 보완, 개발 계획 수립, 문제점 찾기 같은 `계획 단계`에서 Codex와 Claude를 무한 핑퐁시키지 않고, 역할과 종료 조건을 고정한 자동화 루프를 정의한다.
이 문서는 `권장 자동화`를 설명하며, 모든 계획 작업의 의무 게이트는 아니다.

## Why

- 수동 복붙 핑퐁은 시간이 많이 든다.
- 두 모델이 서로의 출력에만 반응하면 계획의 방향이 드리프트할 수 있다.
- 최종 계획이 왜 승인되었는지 추적이 어렵다.

이 루프는 `공식 문서 고정 -> Claude 비판적 리뷰 -> Codex 수정 -> 둘 다 approve 시 종료` 순서로 수렴시킨다.

## Fixed Roles

- `Codex`: 계획 초안 작성자, 수정 반영자, 최종 실행 전 sanity reviewer
- `Claude`: 비판적 리뷰어. 전체 재작성보다 `필수 수정 사항`과 `숨은 리스크`를 찾는다.

둘을 대등한 자유 토론자로 두지 않는다. 계획 편집 권한은 Codex에만 둬서 방향 드리프트를 줄인다.

## Convergence Rules

루프는 아래 조건 중 하나를 만족하면 멈춘다.

1. `Claude approve` + `Codex approve` + `required_changes=[]`
2. `blocker_status=blocker` 또는 `decision=block`
3. 같은 필수 수정 이슈만 반복되어 `stalled` 상태가 된 경우
4. `max_rounds`에 도달한 경우

`required_changes`는 구조화된 JSON으로 받고, 이슈 시그니처가 이전 라운드와 동일하면 재수정 대신 중단 후 사람이 판단한다.
같은 이슈만 반복되는 마지막 라운드라면 `max_rounds_reached`보다 `stalled`를 우선 기록한다.

## Output Contract

### Plan JSON

- `title`
- `summary`
- `plan_markdown`
- `change_log`
- `assumptions`
- `open_questions`
- `out_of_scope`
- `sources_used`

### Review JSON

- `decision`: `approve | revise | block`
- `summary`
- `blocker_status`: `blocker | non-blocker`
- `required_changes[]`
- `recommended_changes[]`
- `unresolved_questions[]`

각 변경 항목은 `id`, `title`, `details`, `source_refs[]`를 가진다.

## CLI Usage

```bash
pnpm agent:plan-loop -- \
  --goal "03-recipe-like 슬라이스 구현 계획을 문서 기준으로 검토하고 확정해줘" \
  --workpack 03-recipe-like \
  --max-rounds 3
```

### Optional Flags

- `--goal-file <path>`: 긴 요청을 파일로 전달
- `--context-file <path>`: 추가 문서나 메모를 컨텍스트에 포함
- `--output-dir <path>`: 산출물 위치 고정
- `--codex-model <model>`
- `--codex-effort <level>`: Codex 추론 강도 조정
- `--claude-model <model>`
- `--claude-effort <level>`: Claude 추론 강도 조정

## Included Context

기본으로 아래 문서를 읽는다.

- `AGENTS.md`
- `CLAUDE.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/subagents.md`
- `docs/engineering/agent-workflow-overview.md`

`--workpack <slice>`가 주어지면 `docs/workpacks/<slice>/README.md`와 `acceptance.md` (존재 시) 도 자동 포함한다.

## Artifacts

기본 산출물은 `.artifacts/agent-plan-loop/<timestamp>/` 아래에 저장된다.

- `goal.md`
- `context-files.txt`
- `context-bundle.md`
- `prompts/*.txt`
- `plans/*.json`
- `plans/*.md`
- `reviews/*.json`
- `reviews/*.md`
- `pingpong-log.md`
- `final-summary.json`
- `final-summary.md`

이 구조로 어떤 프롬프트와 어떤 피드백으로 최종 계획이 확정됐는지 나중에 다시 볼 수 있다.
특히 `pingpong-log.md`는 라운드별 흐름을 한 파일에서 시간순으로 읽기 위한 타임라인 로그다.
각 step에는 타임스탬프를 남기고, agent config는 가능한 경우 resolved model을 기록한다.
effort가 CLI에서 실제 resolved 값으로 확인되지 않으면 configured/requested 값으로 표시한다.

## Recommended Operating Pattern

1. 새 슬라이스 시작 전 `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 먼저 만든다.
2. 위 CLI로 계획 루프를 돌린다.
3. `final-summary.md`에서 승인 상태, 남은 `required_changes`, `open_questions`를 확인한다.
4. `approved`가 아닐 경우 사람이 `stalled` 또는 `blocker` 원인을 정리한다.
5. `approved`일 때만 구현 단계로 넘긴다.

공식 문서에 없는 더 나은 계약 후보가 `open_questions`나 `unresolved_questions`로 올라오면:

1. 현재 공식 문서 기준 구현은 계속 보수적으로 유지한다.
2. 사용자에게 현재 계약 / 제안 계약 / 기대 사용자 가치 / 영향 범위를 짧게 설명하고 승인 여부를 묻는다.
3. 승인되면 별도 `contract-evolution` docs PR로 공식 문서와 `CURRENT_SOURCE_OF_TRUTH`를 먼저 갱신한다.
4. 그 뒤에 workpack 또는 계획을 새 공식 문서 기준으로 다시 잠그고, 필요하면 plan loop를 재실행한다.

## When To Use

- 새 슬라이스 착수 전 합의가 필요한 경우
- 여러 governing doc이 충돌할 수 있는 engineering governance 변경
- open question이 남아 사람에게 바로 handoff하기 어려운 계획 문서

## When You Can Skip

- low-risk docs/config 정리
- 이미 합의된 작은 문서 보강
- 구조적 논쟁보다 기록 보강이 중심인 작업

## Guardrails

- 공식 문서에 없는 필드, API, 상태 전이는 승인된 계획에 추가하지 않는다.
- 사용자 가치가 있는 미문서 계약 후보를 발견하면 추정 구현으로 밀어붙이지 말고 `open_questions` 또는 `unresolved_questions`에 `user approval required`로 남긴다.
- 문서 충돌이 보이면 추정하지 말고 `open_questions`로 남긴다.
- Claude는 전체 재작성보다 `필수 수정` 위주로 리뷰한다.
- Codex는 Claude의 요구가 공식 문서와 충돌하면 그대로 따르지 않고 충돌 사실을 명시한다.
