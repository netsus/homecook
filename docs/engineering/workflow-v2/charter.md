# Workflow V2 Charter

## Problem Statement

현재 v1 workflow는 품질과 추적성을 높였지만, 다음 비용이 남아 있다.

- handoff가 많아 작은 작업에서도 리드타임이 길다.
- README, acceptance, PR 본문, CI, review 상태가 여러 표면에 분산돼 상태 드리프트가 생긴다.
- `리뷰 통과`와 GitHub의 실제 approval 상태가 다르게 해석될 수 있다.
- 현재 구조는 홈쿡 프로젝트에는 맞지만 다른 프로젝트에 그대로 이식하기 어렵다.
- 외부 의존성 이슈는 코드/CI가 모두 green이어도 늦게 발견될 수 있다.

## Goals

1. 현재 v1의 강점을 유지한다.
2. 다른 프로젝트에도 복제 가능한 reusable workflow core를 만든다.
3. Claude와 Codex의 상호 피드백을 구조화된 loop로 공식화한다.
4. 상태와 승인 정보를 machine-readable하게 남긴다.
5. 작업 위험도에 따라 strict path와 fast path를 함께 제공한다.

## Non-Goals

- 모든 작업을 multi-agent로 강제하지 않는다.
- v1 문서를 한 번에 삭제하거나 교체하지 않는다.
- 제품 규칙, 계약, 권한, 상태 전이 안전장치를 완화하지 않는다.
- 외부 오케스트레이션 프레임워크를 저장소에 그대로 복제하지 않는다.

## Principles To Keep

- 공식 문서 우선
- contract-first
- test-first or test-with-design intent
- single writer per authoritative artifact
- explicit reviewer ownership
- blocker/stalled 시 human escalation

## Success Criteria

- medium/high risk 작업은 dual-approval artifact를 남긴다.
- work item 상태는 machine-readable source 하나로 추적 가능하다.
- v2 preset만 바꿔 다른 프로젝트에 동일 엔진을 적용할 수 있다.
- small bugfix와 large slice가 같은 의식 절차를 강제받지 않는다.
- external integration 작업은 smoke checklist를 명시적으로 가진다.

## Initial Adoption Boundary

- 1차 파일럿 대상:
  - docs-governance
  - workflow tooling
  - low/medium risk infra 작업
- 2차 파일럿 대상:
  - contract가 안정적인 small bugfix
  - full slice보다 작은 product-light 작업
- 정식 승격 전까지 high-risk product slice는 v1을 기본값으로 유지한다.
