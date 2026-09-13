# 과거 OpenCode / OMO 설정

2026-09-14부터 OMO runtime, provider, supervise, tick, scheduler, reconcile, closeout/report는 신규 작업에서 사용하지 않는다. 현재 작업 절차는 `AGENTS.md`가 우선한다.

## 보존 범위

- `opencode.json`은 OMO 플러그인을 자동 로드하지 않고 현재 기본 규칙만 읽는다. 남은 선택형 에이전트 정의는 Stage 분리나 별도 승인을 요구하지 않는다.
- `.opencode/oh-my-opencode.json`과 `.opencode/omo-provider.json`은 과거 설정 기록이다.
- `.workflow-v2/`의 work item, 상태, 승인 필드는 당시 실행 기록이다.
- `scripts/omo-*.mjs`와 관련 라이브러리는 과거 구현으로 보존한다. 파일 존재가 실행 권한이나 필수 절차를 뜻하지 않는다.
- 과거 기록과 상태를 신규 작업에 맞춰 갱신하거나 검증하지 않는다. 기록 검토는 사용자가 과거 실행 조사를 요청한 경우에 한정한다.

현재 개발은 `docs/engineering/agent-workflow-overview.md`를 따른다. Claude 로그인이나 provider 활성화, OMO scheduler 설치·실행은 필요하지 않다. 실제 운영 데이터·배포·비밀정보 보호는 계속 `AGENTS.md`를 따른다.
