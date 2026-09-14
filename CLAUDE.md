# Claude 진입점 폐기 안내

Homecook은 Claude를 더 이상 사용하지 않는다.
이 파일은 과거 Claude 도구가 저장소를 열더라도 신규 Stage를 실행하지 못하게 하는 tombstone(폐기 표식)으로만 남긴다.

- Claude CLI, Claude 앱, Claude API로 문서 작성, 구현, 리뷰, final authority를 수행하지 않는다.
- 모든 신규 Stage는 `AGENTS.md`, `docs/engineering/slice-workflow.md`, `docs/engineering/codex-task-handoff.md`에 따라 역할이 분리된 별도 Codex 작업이 수행한다.
- 과거 문서, work item, artifact의 Claude 표기는 당시 실행 이력을 보존하는 기록이며 신규 사용 권한이 아니다.
