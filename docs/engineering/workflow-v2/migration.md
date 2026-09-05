# Workflow V2 Migration Receipt

상태: **완료된 역사 기록**

이 경로는 기존 링크와 감사 추적을 보존하기 위해 남긴다. 현재 운영 규칙이나 다음 작업을
정하는 문서가 아니다.

## Retained Milestones

- foundation 시작: commit `2cd535a6429012c64f279d50ed0024d4a823b376`
- promotion evidence 도입: commit `59051df7bb42126bf943f94b137aa9836735bbd1`
- Claude Stage를 독립 Codex 작업으로 전환: commit
  `6dcb5bd9dbc2e1f41ee11583f8d1395daf1e8e52`

초기 계획은 foundation 문서와 schema, validator, CI 연동, docs/product pilot,
promotion 판단의 6단계였다. 해당 계획은 Git 이력의 foundation commit에서 복원할 수 있다.

## Current Authority

- 운영 entry point: `docs/engineering/workflow-v2/README.md`
- product Stage 절차: `docs/engineering/slice-workflow.md`
- 변경 유형별 gate: `docs/engineering/agent-workflow-overview.md`
- Codex 작업 인수인계: `docs/engineering/codex-task-handoff.md`
- promotion 판정: `docs/engineering/workflow-v2/promotion-readiness.md`와
  `.workflow-v2/promotion-evidence.json`

이 문서의 과거 단계나 문장을 현재 운영 근거로 사용하지 않는다.
