# Workflow V2 Pilot State

이 디렉터리는 workflow v2의 machine-readable pilot 상태를 저장한다.

## Files

- `work-items/*.json`: 개별 작업 메타데이터
- `status.json`: 현재 추적 중인 작업 상태 보드
- `promotion-evidence.json`: 승격 gate / pilot lane ledger
- `replay-acceptance.json`: representative replay acceptance ledger

## Rules

- authoritative source는 JSON 파일이다.
- 문서 요약은 `docs/engineering/workflow-v2/*`에 둔다.
- status board의 각 item은 대응되는 work item JSON을 가져야 한다.
- replay acceptance와 promotion gate는 별도 ledger로 기록한다.
- v2 pilot이 아닌 작업은 이 디렉터리를 수정할 필요가 없다.
