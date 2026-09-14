# 과거 OpenCode / OMO 설정

2026-09-14부터 OMO runtime, provider, supervise, tick, scheduler, reconcile, closeout/report는 신규 작업에서 사용하지 않는다. 현재 작업 절차는 `AGENTS.md`가 우선한다.

## 보존 범위

- `opencode.json`은 프로젝트 플러그인을 추가하지 않고 현재 기본 규칙만 명시한다. OpenCode가 전역 플러그인을 상속할 수 있으므로 빈 `plugin` 배열을 전체 비활성화로 해석하지 않는다.
- `.opencode/oh-my-openagent.json`은 전역 OpenAgent 플러그인이 있을 때 사용하는 현재 프로젝트 설정이다. 기존 반복 실행 비활성화 옵션을 유지하고 옛 역할 설명을 포함하지 않는다. 설치된 로더는 이 정식 이름을 아래 과거 이름보다 우선한다.
- `.opencode/oh-my-opencode.json`과 `.opencode/omo-provider.json`은 과거 설정 기록이다. 정식 설정 파일을 삭제하거나 과거 설정으로 되돌려 신규 작업에 적용하지 않는다.
- `.workflow-v2/`의 work item, 상태, 승인 필드는 당시 실행 기록이다.
- `scripts/omo-*.mjs`와 관련 라이브러리는 과거 구현으로 보존한다. 파일 존재가 실행 권한이나 필수 절차를 뜻하지 않는다.
- 옛 PR·하네스 검사 스크립트도 보존하지만 `validate:pr`, `harness:audit`, `harness:fix` package 명령은 제거됐다. 신규 PR은 현재 양식을 사용하며 Workpack·Closeout·Merge Gate 항목을 요구하지 않는다.
- 과거 기록과 상태를 신규 작업에 맞춰 갱신하거나 검증하지 않는다. 기록 검토는 사용자가 과거 실행 조사를 요청한 경우에 한정한다.

현재 개발은 `docs/engineering/agent-workflow-overview.md`를 따른다. Claude 로그인이나 provider 활성화, OMO scheduler 설치·실행은 필요하지 않다. 실제 운영 데이터·배포·비밀정보 보호는 계속 `AGENTS.md`를 따른다.
