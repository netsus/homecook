# Repo-Local OpenCode / OMO Configuration

이 디렉터리는 Homecook 저장소에서만 적용되는 OpenCode / Oh My OpenCode 설정을 둔다.

## Rules

- 이 저장소 루트에서 OpenCode `/init`를 실행하지 않는다.
- 이유: 저장소에는 이미 공식 운영 규칙인 `AGENTS.md`가 있고, 자동 생성된 `AGENTS.md`로 덮어쓰면 안 된다.
- authoritative policy는 계속 `AGENTS.md`, `docs/engineering/slice-workflow.md`, `docs/engineering/agent-workflow-overview.md`다.
- `.opencode/oh-my-opencode.json`은 그 규칙을 따르는 `Codex supervisor 기본값`만 추가한다.

## Current Homecook Defaults

- 기본 실행 에이전트: `hephaestus`
- 의도:
  - Codex 중심 supervisor / execution
  - Claude는 sparse approval checkpoint에서만 사용
- `ralph-loop`와 `ulw-loop`는 아직 Homecook stage dispatcher와 연결되지 않았으므로 project 레벨에서 비활성화한다.
- `comment-checker` hook는 현재 로컬 설치 상태 차이로 false positive가 날 수 있어 project 레벨에서 비활성화한다.
- `comment-checker`는 영구 제거가 아니라 known issue다. 바이너리 링크 이슈가 해결되면 re-enable 여부를 다시 판단한다.

## Local Auth

- provider 인증은 사용자 로컬 상태다.
- 필요 시 아래 명령으로 로그인한다.

```bash
opencode auth login
```

- 이 인증 상태는 Git에 커밋하지 않는다.

## Claude Budget Override

- reviewer stage에서 Claude 사용 가능 여부는 기본적으로 OpenCode auth 상태를 보고 해석한다.
- 강제로 상태를 바꿔야 하면 아래 명령을 사용한다.

```bash
pnpm omo:claude-budget -- --status
pnpm omo:claude-budget -- --set unavailable --reason "Claude Pro budget exhausted"
pnpm omo:claude-budget -- --clear
```

- override 파일은 `.opencode/claude-budget-state.json`이며 Git에 커밋하지 않는다.

## Phase 5 Runner

- `pnpm omo:run-stage -- --slice <id> --stage <n>`은 stage dispatch artifact를 `.artifacts/omo-lite-dispatch/` 아래에 만든다.
- `--mode execute`는 현재 `Codex executable stage`에만 적용된다.
- reviewer stage는 실행 대신 handoff artifact만 남긴다.
- `--sync-status`를 함께 주면 artifact 경로와 fallback approval patch를 `.workflow-v2/status.json`에 같이 기록한다.
