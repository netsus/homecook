# 독립 Codex 작업 Review Loop

구현 작업과 독립 검토 작업을 분리해 pre-PR diff 또는 지정 PR head를 구조화 리뷰하는 절차다.
Claude는 사용하지 않는다.

이 generic loop는 docs-governance, workflow/tooling, cross-cutting diff, exceptional recovery에 사용한다.
product slice의 기본 경로는 `docs/engineering/slice-workflow.md`의 Stage 3/5/6을 따른다.

## 실행 중지된 이전 경로

`pnpm agent:review-loop`는 Claude CLI 호출을 포함한 legacy 자동화이므로 신규 리뷰에 실행하지 않는다.
기존 `.artifacts/agent-review-loop/**`와 `claude_*` summary fields는 과거 감사 기록으로만 보존한다.

## 역할

- `change-author`: 코드를 작성하고 finding을 수정하는 Codex 작업
- `independent-reviewer`: author와 다른 task ID의 Codex 새 작업
- `coordinator`: review target, verification, round, artifact를 관리하는 작업

reviewer는 원칙적으로 코드를 직접 고치지 않는다.
수정이 필요하면 finding ID와 근거를 author에게 돌려보낸다.

## Review Target

- working tree diff
- `<base>...<head>` commit range
- PR URL + current head SHA

검토 시작 시 target SHA를 고정한다.
최종 verdict 전 target SHA가 바뀌면 최신 diff와 verification을 다시 확인한다.
binary 또는 너무 큰 파일이 빠지면 `omitted_review_targets[]`에 남기고 자동 approve하지 않는다.

## 기본 순서

1. coordinator가 target SHA, 공식 문서, workpack, verification evidence를 고정한다.
2. `docs/engineering/codex-task-handoff.md` 형식으로 independent reviewer 새 작업을 연다.
3. reviewer가 `required_changes[]`, `recommended_changes[]`, verdict를 반환한다.
4. author가 required finding만 수정하고 검증한다.
5. 같은 reviewer 또는 다른 독립 reviewer가 최신 SHA를 재검토한다.
6. approve + required finding 0 + verification pass + omitted target 0이면 종료한다.

최대 3회 안에 수렴하지 못하거나 같은 finding set이 반복되면 `stalled`로 종료한다.

## Review Output

- `decision`: `approve | revise | block`
- `summary`
- `blocker_status`: `blocker | non-blocker`
- `required_changes[]`
- `recommended_changes[]`
- `unresolved_questions[]`
- reviewed task ID
- reviewed commit SHA
- verification refs
- omitted review targets

각 finding은 `id`, `title`, `details`, `file_path`, `line`, `source_refs[]`를 가진다.

## 승인 조건

다음을 모두 만족해야 `approved`다.

- author와 reviewer task ID가 다름
- reviewer `approve`
- `required_changes=[]`
- 최신 target SHA 기준 verification pass
- `omitted_review_targets=[]`
- 공식 문서 또는 workpack과 충돌 없음

verification command가 없는 docs-only 변경은 `skipped`를 허용하지만, tests green을 주장하지 않는다.

## Guardrails

- loop는 commit, push, PR 생성 권한을 자동으로 넓히지 않는다.
- unrelated user edits를 되돌리지 않는다.
- 공식 계약 변경은 사용자 승인과 contract-evolution 없이 반영하지 않는다.
- review task 종료만으로 승인하지 않고 최종 verdict와 evidence를 읽는다.
