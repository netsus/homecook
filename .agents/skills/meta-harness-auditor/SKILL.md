---
name: meta-harness-auditor
description: Inspect historical Homecook OMO, workflow, and audit records when the user asks about past harness behavior. Not a current development gate or automatic repair workflow.
---

# 과거 하네스 기록 검토

2026-09-14부터 OMO 승격, Stage, CI gate, closeout 감사는 신규 개발 절차가 아니다. 작업 절차와 검증 범위는 저장소 루트의 `AGENTS.md`를 우선한다.

과거 실행 조사를 요청받은 경우에만 관련 `docs/engineering/workflow-v2/`, `.workflow-v2/`, `.opencode/` 기록을 읽고 사실과 추정을 구분해서 보고한다. 현재 개발 방식의 감사라면 현재 규칙과 실제 실행 연결을 기준으로 확인한다.

과거 하네스 도구의 package 명령은 제거됐다. 보존된 스크립트를 자동 실행하지 않고, 옛 도구가 보고한 폐지된 gate의 누락을 결함으로 간주하거나 복구하지 않는다. 당시 상태나 보고서를 신규 작업에 맞춰 갱신하지 않는다.
