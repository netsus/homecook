# Workflow V2 Migration Plan

## Strategy

v2는 `병행 운영 -> 파일럿 -> 승격` 순서로 도입한다.
v1 문서를 즉시 덮어쓰지 않고, 작은 PR 여러 개로 옮긴다.

## Recommended PR Sequence

### Phase 1. Foundation Docs And Schema

- 목표:
  - charter, core, presets, approval-and-loops, profile, migration 문서 추가
  - machine-readable schema와 example 추가
- 완료 기준:
  - v2 디렉터리와 entry-point 링크 존재
  - targeted test 통과

### Phase 2. Validation MVP

- 목표:
  - work item / status example validation script
  - schema drift를 막는 test 추가
  - preset 선택 기준을 검증 가능한 형태로 정리
- 완료 기준:
  - 로컬에서 `validate:workflow-v2` 성격의 명령 가능

### Phase 3. CI And PR Integration

- 목표:
  - PR body와 work item/status의 기본 정합성 검증
  - dual-approval artifact 존재 여부 확인
  - preset별 required checks 매핑
  - current head 기준 started PR checks merge gate 규칙 반영
- 완료 기준:
  - docs-governance 파일럿 PR에서 gate로 사용 가능
  - `.workflow-v2/work-items/*.json` + `.workflow-v2/status.json`이 저장소에 실제로 존재

### Phase 4. Docs-Governance Pilot

- 목표:
  - 실제 workflow/engineering 변경을 v2로 한 번 수행
  - handoff, stalled, verification 기록을 수집
- 완료 기준:
  - one-cycle retrospective 문서화

### Phase 5. Product-Light Pilot

- 목표:
  - small bugfix 또는 light product change를 v2 preset으로 수행
  - external smoke와 dual-approval flow 점검
- 완료 기준:
  - product-light 한 건 이상 merge

### Phase 6. Promotion Decision

- 목표:
  - v1 유지 범위와 v2 승격 범위 결정
  - 필요 시 `slice-workflow.md`와 `agent-workflow-overview.md`를 v2 기준으로 재작성
- 완료 기준:
  - 승격 공지 또는 파일럿 연장 결정

## Promotion Exit Criteria

- medium/high risk 작업에서 dual-approval artifact가 일관되게 남는다.
- work item/status 파일과 PR 상태의 해석이 크게 어긋나지 않는다.
- small bugfix의 리드타임이 v1보다 과도하게 늘지 않는다.
- stalled/blocker 처리 규칙이 실제로 작동한다.

## Current State

이 문서 추가 시점은 `Phase 1` 완료와 `Phase 2`의 최소 validator 초안까지를 포함하는 foundation 작업이다.
CI 연동과 preset 강제는 아직 후속 단계이며, 운영 기본값은 계속 v1이다.
