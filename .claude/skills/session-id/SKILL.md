---
name: session-id
description: "현재 Claude Code 세션 ID를 찾아서 반환한다. ~/.claude/sessions/ 디렉토리에서 가장 최근 세션 파일을 읽어 sessionId 필드를 출력한다."
---

# Session ID Finder

현재 실행 중인 Claude Code 세션 ID를 찾아서 사용자에게 알려준다.

## 실행 절차

1. `~/.claude/sessions/` 디렉토리에서 수정 시간 기준 가장 최근 파일을 찾는다.
2. 해당 JSON 파일에서 `sessionId` 필드를 읽는다.
3. 세션 ID와 함께 PID, 시작 시각, 버전 등 부가 정보도 함께 출력한다.

## 실행할 명령

```bash
ls -t ~/.claude/sessions/*.json | head -1 | xargs cat
```

위 명령 결과의 JSON에서 `sessionId` 값을 추출해 사용자에게 보고한다.

출력 형식:
- **세션 ID**: `<sessionId>`
- PID: `<pid>`
- 시작 시각: `<procStart>`
- 버전: `<version>`
- 진입점: `<entrypoint>`
