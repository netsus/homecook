# OMO Claude CLI Provider Adapter

## Status

- 이 문서는 OMO의 Claude-owned stage를 `raw claude CLI`로 실행하는 v1 provider adapter 계약을 고정한다.
- 현재 저장소의 Codex-owned stage는 계속 `OpenCode` 경로를 사용한다.
- 구현 전 목표는 `session_id 추출 -> runtime 저장 -> deterministic resume` 규칙을 먼저 잠그는 것이다.

## Purpose

Homecook OMO는 Claude와 Codex를 섞어 쓰지만, 두 actor의 실행 표면이 반드시 같을 필요는 없다.

이 문서의 역할은 아래를 고정하는 것이다.

- Claude Stage `1 / 3 / 4`와 Stage 5 `final_authority_gate`의 기본 실행 표면은 `raw claude CLI`다.
- Codex Stage `2 / 5 / 6`와 Stage 4 `authority_precheck`는 기존 `OpenCode` provider를 유지한다.
- Claude 세션 재개는 항상 `--resume <session_id>`로만 수행한다.
- `--continue`나 silent session recreation처럼 deterministic하지 않은 경로는 자동화에서 금지한다.

## Canonical CLI Contract

Claude provider의 표준 fresh-session 실행:

```bash
claude -p \
  --output-format json \
  --input-format text \
  --permission-mode bypassPermissions \
  --effort high \
  --model <repo-default-or-cli-override>
```

Claude provider의 표준 resumed-session 실행:

```bash
claude -p \
  --output-format json \
  --input-format text \
  --permission-mode bypassPermissions \
  --effort high \
  --model <repo-default-or-cli-override> \
  --resume <session_id>
```

자동화 규칙:

1. prompt는 항상 stdin으로 전달한다.
2. JSON stdout은 artifact로 그대로 저장한다.
3. 기본 permission mode는 `bypassPermissions`다.
4. 기본 effort는 `high`다.
5. `--continue`는 directory-local recent conversation에 의존하므로 자동화에서 금지한다.
6. `--fork-session`은 기본 경로가 아니라 명시적 operator recovery에서만 허용한다.
7. `--session-id`는 manual recovery/test 전용이며 기본 supervisor 경로에서는 사용하지 않는다.

## Session ID Contract

Claude session ID는 아래 우선순위로 추출한다.

1. Claude JSON stdout의 `session_id`
2. `~/.claude/projects/**/<session_id>.jsonl` 파일명
3. legacy `~/.claude/transcripts/<session_id>.jsonl` 파일명

규칙:

- JSON stdout에 `session_id`가 있으면 그것이 authoritative source다.
- stdout에 `session_id`가 없을 때만 local transcript filename fallback을 사용한다.
- fallback은 프로젝트별 `~/.claude/projects/**` 저장 구조를 먼저 보고, legacy `~/.claude/transcripts`는 보조 경로로만 본다.
- 저장된 session ID로 `--resume`이 실패하면 조용히 새 세션을 만들지 않는다.
- transcript가 없거나 resume 대상 session이 invalid하면 `human_escalation`으로 끝낸다.

## Runtime State Contract

repo-local runtime state는 provider identity를 세션과 함께 저장해야 한다.

필수 예시:

- `sessions.claude_primary.provider = "claude-cli"`
- `sessions.claude_primary.session_id = "<claude-session-id>"`
- `sessions.codex_primary.provider = "opencode"`
- `sessions.codex_primary.session_id = "<opencode-session-id>"`

규칙:

1. provider와 session ID는 한 쌍으로 저장한다.
2. 기존 runtime에 같은 역할의 session ID가 있어도 provider mismatch면 재사용하지 않는다.
3. provider mismatch가 이미 진행 중인 work item에서 발생하면 `human_escalation(session_provider_mismatch)`로 막는다.
4. 기존 OpenCode Claude session을 새 `claude-cli` provider로 자동 migration하지 않는다.

## Availability And Retry Contract

`claudeBudgetState`라는 이름은 유지하지만, `claude-cli` provider에서는 API balance가 아니라 availability hint로 해석한다.

preflight 우선순위:

1. repo-local override
2. provider-aware local auth / health hint
3. default `available`

runtime error classification:

- temporary auth/session/server overload류 -> `scheduled-retry`
- explicit session not found / transcript missing / invalid resume -> `human_escalation`
- malformed stdout / stage-result missing / contract violation -> `human_escalation`

retry 규칙:

1. `scheduled-retry`일 때는 같은 Claude session ID를 runtime에 유지한다.
2. `resume-pending`과 supervisor `blocked_retry`는 반드시 `claude --resume <session_id>`로만 재시도한다.
3. `--continue`를 fallback으로 사용하지 않는다.

## Repo-Local Config

Claude/Codex provider 기본값은 tracked repo-local config에 둔다.

경로:

- `.opencode/omo-provider.json`

기본값:

- `claude.provider = "claude-cli"`
- `claude.bin = "claude"`
- `claude.model = "sonnet"`
- `claude.effort = "high"`
- `claude.permission_mode = "bypassPermissions"`
- `codex.provider = "opencode"`
- `codex.bin = "opencode"`
- `codex.agent = "hephaestus"`

CLI override 허용 범위:

- `--claude-provider claude-cli`
- `--claude-bin <path>`
- `--claude-model <model>`
- `--claude-effort low|medium|high`

원칙:

- 기본 supervisor 경로는 `claude-cli`를 사용한다.
- Homecook OMO는 Claude-owned stage provider로 `opencode`를 지원하지 않는다.
- top-level OMO 명령에서 `--claude-provider opencode`를 주면 fail-fast로 막는다.
- CLI override가 repo-local default보다 우선한다.

## Non-Goals

- `oh-my-claudecode` wrapper adapter 도입
- `--continue` 기반 자동 resume
- provider mismatch 자동 migration
- Codex/OpenAI stage의 실행 표면 교체
