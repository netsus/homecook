# Workflow V2 / OMO

## 상태: 사용 중지

2026-09-14부터 Homecook의 신규 개발은 workflow-v2와 OMO를 사용하지 않는다.

- OMO supervise, tick, scheduler와 provider 실행을 사용하지 않는다.
- work item과 status JSON을 갱신하지 않는다.
- Stage dispatch, approval, closeout projection과 omo-report를 요구하지 않는다.
- `.workflow-v2/`, `.opencode/`, 이 디렉터리의 상세 문서는 과거 운영 기록으로만 보존한다.

현재 개발 흐름은 `docs/engineering/agent-workflow-overview.md`를 따른다. 한 Codex 작업에서 구현과 로컬 확인을 마친 뒤 간단한 PR로 머지할 수 있다.

고객 유입 또는 광고 집행 전 CI를 다시 도입하더라도 OMO 전체를 자동으로 복구하지 않는다. 당시 제품 규모에 필요한 최소 검사부터 새로 설계한다.
