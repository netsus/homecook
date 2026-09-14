# Workflow V2 Approval And Loops

## Goal

작성·구현 작업과 독립 검토 작업을 서로 다른 Codex task ID로 분리하고, 무한 핑퐁 없이 구조화된 수렴 루프로 종료한다.
Claude는 사용하지 않는다.

## Fixed Roles

- `coordinator task`: handoff, round, 상태, evidence 관리
- `author/fixer task`: authoritative artifact 작성·수정
- `independent reviewer task`: author와 다른 task ID로 review/approve
- `Workers`: bounded 보조 작업. 독립 reviewer를 대신하지 않는다

편집 권한은 한 시점에 한 작성 작업만 가진다.
reviewer는 finding을 반환하고 author의 artifact를 직접 덮어쓰지 않는다.

## Independent Approval Contract

최종 승인 조건:

`author_task_id != reviewer_task_id && reviewer_approve && required_changes=[] && verification_status=passed && omitted_targets=[]`

위 조건 중 하나라도 빠지면 최종 상태는 `approved`가 될 수 없다.
task가 끝났거나 commentary가 긍정적이라는 사실은 approval evidence가 아니다.

## Plan Loop

`docs/engineering/agent-plan-loop.md`를 따른다.

1. Codex author 새 작업이 초안을 작성한다.
2. 다른 Codex reviewer 새 작업이 구조화 리뷰한다.
3. author가 required finding을 수정한다.
4. reviewer가 최신 artifact를 재검토한다.
5. 최대 3회 안에 approve 또는 stalled/block으로 종료한다.

medium/high risk, infra-governance, 여러 source of truth가 얽힌 작업에 권장한다.

## Review Loop

`docs/engineering/agent-review-loop.md`를 따른다.
product slice 기본 경로에는 generic review loop를 넣지 않고 Stage 3/5/6을 사용한다.

Stage 1 docs gate는 아래 순서를 고정한다.

1. Codex `stage1-docs-author` 새 작업
2. deterministic `doc_gate_check`
3. 다른 task ID의 Codex `docs-gate-reviewer`
4. author repair/rebuttal
5. reviewer recheck
6. approve 또는 `human_escalation`

## Convergence Rules

- `max_rounds`: 기본 3
- 같은 required finding set 반복: `stalled`
- 공식 계약 변경, 권한 부족, destructive decision: `blocked`
- verification 실패: `needs_revision`

## Worker Orchestration Rules

- worker는 disjoint scope만 맡는다.
- 같은 authoritative 파일을 여러 worker가 동시에 수정하지 않는다.
- worker 결과 통합은 author task가 맡는다.
- 같은 task 안 worker review는 independent Stage approval이 아니다.

## External Smoke Gate

외부 서비스가 포함된 작업은 테스트 green 외에 실제 smoke evidence를 남긴다.
credential, external production authority, destructive operation은 자동으로 가정하지 않는다.

## Artifact Requirements

- author/reviewer task ID
- reviewed commit SHA
- required/recommended findings
- verification result
- unresolved questions / out-of-scope
- final verdict

과거 machine-readable vocabulary의 `claude_approved`, `claude_repairable`은 역사적 호환값이다.
새 실행의 actor 의미나 provider 호출 근거로 사용하지 않는다.
