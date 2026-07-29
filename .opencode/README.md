# Repo-Local OpenCode / OMO Configuration

이 디렉터리는 Homecook 저장소의 OpenCode 호환 설정과 legacy OMO runtime 상태 경로를 둔다.

## Current Policy

- Claude는 사용하지 않는다.
- 모든 primary agent model은 OpenAI GPT 계열을 사용한다.
- Stage 실행은 `docs/engineering/codex-task-handoff.md`에 따라 역할별 Codex 새 작업이 맡는다.
- 작성·구현 작업과 독립 검토 작업은 다른 task ID를 사용한다.
- OMO는 actor를 호출하지 않는 status, validator, reconcile, closeout/report projection에만 사용한다.

## Config Files

- `opencode.json`: repo-local OpenCode agent와 instruction entry
- `.opencode/oh-my-opencode.json`: hook/agent compatibility snapshot
- `.opencode/omo-provider.json`: legacy provider config
  - `claude` key는 기존 runtime parser 호환을 위해 남아 있지만 `provider=retired`, `bin=disabled`로 잠근다.
  - 이 key를 활성 provider로 바꾸지 않는다.

## Branch Intent

- 새 Codex 작업은 파일 수정 전에 `pnpm branch:start -- --branch <name>` 또는 slice shortcut을 실행한다.
- 새 user prompt 뒤에는 같은 명령으로 branch intent를 재확인한다.
- 현재 상태는 `pnpm branch:status`, 초기화는 `pnpm branch:clear`로 확인한다.
- `.claude/settings.json` 경로에 남은 hook는 legacy 호환 자산이며 현재 actor 정책을 뜻하지 않는다.

## Authentication

Codex/OpenCode 경로가 필요한 경우에만 로컬에서 아래를 사용한다.

```bash
opencode auth login
```

인증 상태와 secret은 Git에 커밋하지 않는다.
Claude login 또는 Claude credential은 필요하지 않다.

## Allowed OMO Commands

신규 작업에서는 actor를 호출하지 않는 아래 범위만 사용한다.

```bash
pnpm omo:status:brief
pnpm omo:status -- --work-item <id>
pnpm omo:tail -- --work-item <id>
pnpm omo:reconcile -- --work-item <id>
pnpm omo:report -- --work-item <id>
pnpm validate:workflow-v2
pnpm validate:omo-bookkeeping
```

## Suspended Commands

아래 명령은 legacy Claude provider 또는 session resume를 호출할 수 있어 GPT-only runtime migration 전까지 실행하지 않는다.

- `pnpm omo:start`
- `pnpm omo:continue`
- `pnpm omo:resume-pending`
- `pnpm omo:run-stage`
- `pnpm omo:supervise`
- `pnpm omo:tick`
- `pnpm omo:tick:watch`
- `pnpm omo:claude-budget`
- `pnpm omo:smoke:control-plane -- --live-providers`
- `pnpm omo:smoke:providers`
- scheduler install/execute 경로

실수로 actor command를 실행하면 `.opencode/omo-provider.json`의 retired provider 값 때문에 fail-fast해야 한다.

## Runtime And Historical Records

- `.opencode/omo-runtime/`의 session ID, retry, lock은 과거 실행 호환 자료다.
- `.workflow-v2/**`의 `claude`, `claude_approved`, `claude_repairable` 필드는 역사적 기록 호환값이다.
- 신규 Stage의 actor evidence는 Codex task ID, 입력/검토 commit SHA, PR URL, stage-result 경로로 남긴다.
- 과거 work item과 artifact를 일괄 재작성하지 않는다.

## Closeout

- product contract 우선순위는 `AGENTS.md`와 공식 문서를 따른다.
- Stage/검토 절차는 `docs/engineering/slice-workflow.md`를 따른다.
- task 생성·handoff는 `docs/engineering/codex-task-handoff.md`를 따른다.
- canonical closeout projection은 `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`를 따른다.
