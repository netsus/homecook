# Workflow V2 Approval And Loops

## Goal

Claude와 Codex가 서로 보완사항을 주고받되, 무한 핑퐁이 아니라 `구조화된 수렴 루프`로 종료되게 만든다.

## Fixed Roles

- `Claude`: primary reviewer, 감독자, 승인자
- `Codex`: primary author/fixer, verification 실행자, 승인자
- `Workers`: bounded subtask 수행자

Claude와 Codex를 대등한 자유 토론자로 두지 않는다.
편집 권한은 항상 한쪽에만 있고, 기본값은 `Codex가 작성/수정`, `Claude가 리뷰/승인`이다.

## Dual-Approval Contract

최종 승인 조건:

`Claude approve && Codex approve && required_changes=[] && verification_status=passed && omitted_targets=[]`

위 조건 중 하나라도 빠지면 최종 상태는 `approved`가 될 수 없다.

Claude budget 문제로 Claude-owned stage가 pause 되면 상태는 blocked retry로 기록하고 approval_state는 이전 값을 유지한다.
기본 정책은 `pause + scheduled retry`이며, provisional Codex summary는 manual recovery에서만 사용한다.
이 상태는 provisional이며 `dual_approved`와 동일하지 않다.

## Plan Loop

기존 [agent-plan-loop.md](../agent-plan-loop.md)를 v2의 기본 planning engine으로 사용한다.

기본 순서:

1. Codex 초안 작성
2. Claude 구조화 리뷰
3. Codex 수정
4. 둘 다 approve 시 종료

필수 조건:

- medium/high risk 작업
- infra-governance
- 여러 source of truth가 엮인 작업

생략 가능:

- docs-only
- 명백한 single-file low-risk bugfix

## Review Loop

기존 [agent-review-loop.md](../agent-review-loop.md)는 v2에서 `non-slice governance / tooling / exceptional recovery`용 review engine으로 사용한다.
product slice의 기본 Stage 경로에는 넣지 않는다. 이유는 slice workflow에 이미 Stage 3, 5, 6의 정식 리뷰 단계가 있기 때문이다.

기본 순서:

1. Claude diff 리뷰
2. Codex 수정
3. verification 실행
4. Claude 재리뷰
5. Codex final sanity review
6. dual-approval이면 종료

필수 조건:

- infra-governance
- cross-cutting workflow/tooling diff
- 정식 Stage 리뷰를 대체하지 않는 exceptional recovery

생략 가능:

- 일반 product slice Stage 2/4 구현
- docs-only
- 작은 UI polish

## Convergence Rules

- `max_rounds`: 기본 3
- 같은 필수 수정 이슈가 반복되면 `stalled`
- blocker가 나오면 `blocked`
- `stalled` 또는 `blocked`는 사람이 방향을 재결정한다.

## Worker Orchestration Rules

v2는 multi-agent를 허용하지만 아래 제약을 둔다.

- worker는 disjoint scope만 맡는다.
- 같은 파일을 여러 worker가 동시에 수정하지 않는다.
- worker 산출물의 통합 책임은 Codex에 있다.
- Claude는 worker 결과를 승인 없이 merge-ready로 간주하지 않는다.

권장 worker 역할:

- security
- testing
- design-system
- ci/governance
- research/explorer

## External Smoke Gate

테스트가 모두 green이어도 외부 서비스가 포함된 작업이면 smoke check를 별도로 본다.

예:

- auth: Supabase reachable, env set, OAuth redirect URL
- payment: sandbox key, callback URL, webhook reachability
- deployment: target env, secret availability, release toggle

## Artifact Requirements

medium/high risk 작업은 최소한 아래를 남긴다.

- work item metadata
- loop final summary
- verification result
- unresolved questions or out-of-scope note

## Authority Rule

- Codex는 단독으로 구현 완료를 선언할 수 없다.
- Claude는 단독으로 구현을 완료시킬 수 없다.
- dual-approval과 verification이 함께 있어야 완료다.
