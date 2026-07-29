# 독립 Codex 작업 Plan Loop

계획 초안과 비판적 검토를 서로 다른 Codex 작업으로 분리해 최대 3회 안에 수렴시키는 절차다.
Claude는 사용하지 않는다.

## 실행 중지된 이전 경로

`pnpm agent:plan-loop`는 Claude CLI 호출을 포함한 legacy 자동화이므로 신규 계획에 실행하지 않는다.
기존 `.artifacts/agent-plan-loop/**`는 과거 감사 기록으로만 보존한다.

## 역할

- `plan-author`: 공식 문서를 읽고 계획 초안을 작성·수정하는 Codex 새 작업
- `plan-reviewer`: author와 다른 task ID를 가진 Codex 새 작업. 필수 수정, 숨은 위험, 공식 문서 충돌을 찾는다
- `coordinator`: 두 작업의 handoff와 종료 조건을 관리한다

작성 권한은 `plan-author`에만 둔다.
`plan-reviewer`는 계획을 직접 덮어쓰지 않고 finding을 반환한다.

## 기본 순서

1. coordinator가 `docs/engineering/codex-task-handoff.md` 형식으로 `plan-author` 작업을 연다.
2. 초안 artifact와 source refs를 고정한다.
3. 다른 task ID의 `plan-reviewer` 작업을 열어 구조화 리뷰를 받는다.
4. required finding이 있으면 author 작업으로 되돌려 수정한다.
5. reviewer가 같은 source와 최신 artifact를 다시 확인한다.
6. approve + required finding 0이면 종료한다.

## 종료 조건

- `approve` + `required_changes=[]`
- 공식 계약 변경에 사용자 승인이 필요한 `block`
- 같은 finding set 반복으로 `stalled`
- 최대 3회 도달

`stalled` 또는 `block`이면 구현하지 않고 사용자 결정이 필요한 항목만 전달한다.

## 산출물

계획 artifact에는 아래를 남긴다.

- `title`
- `summary`
- `plan_markdown`
- `assumptions`
- `open_questions`
- `out_of_scope`
- `sources_used`
- author/reviewer task ID
- reviewed commit 또는 document SHA
- `required_changes[]`
- final verdict

각 finding은 `id`, `title`, `details`, `source_refs[]`를 가진다.

## Contract Evolution

공식 문서에 없는 계약 후보가 나오면 계획에 확정 사실로 넣지 않는다.

1. 현재 계약과 제안 계약을 분리한다.
2. 기대 사용자 가치와 영향 문서를 적는다.
3. `user approval required` open question으로 남긴다.
4. 승인되면 별도 `contract-evolution` docs PR을 먼저 merge한다.
5. 새 공식 문서 기준으로 plan loop를 다시 잠근다.

## 사용 시점

- 새 슬라이스 착수 전 계획 합의
- 여러 governing doc이 얽힌 engineering 변경
- open question과 tradeoff가 남은 작업

low-risk docs/config 보강이나 명백한 단일 파일 수정은 생략할 수 있다.
