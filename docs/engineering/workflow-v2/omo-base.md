# OMO Base

## OMO란?

OMO는 `Oh My OpenCode`다. 이 저장소에서는 AI가 `work item` 단위로 문서를 읽고 현재 단계(stage)를 판단한 뒤 다음 작업을 이어서 실행하게 만드는 운영 레이어로 쓴다. 즉, `AGENTS.md`와 `docs/engineering/*` 규칙을 실제 실행 흐름에 연결하는 도구다.

## 어떻게 돌아가나?

핵심은 세 파일 묶음이다. `.workflow-v2/work-items/<id>.json`에는 작업 정의를, `.workflow-v2/status.json`에는 공식 진행 상태를, `.opencode/omo-runtime/`에는 세션 ID와 active stage 같은 실행 중 상태를 둔다. 예를 들어 `05-planner-week-core`를 시작하면 OMO는 work item을 읽고 stage를 확인한 뒤, Codex 구현인지 Claude 리뷰인지 판단하고 결과물을 `.artifacts/` 아래에 남긴다.

## 자주 쓰는 명령어

- `pnpm omo:start -- --work-item <id>`: 작업 시작
- `pnpm omo:status:brief -- --work-item <id>`: 현재 stage, blocker reason code, 다음 액션 요약 확인
- `pnpm omo:run-stage -- --slice <id> --stage <n>`: 특정 stage만 직접 실행
- `pnpm omo:supervise -- --work-item <id>`: 가능한 단계까지 자동 전진
- `pnpm omo:tick -- --all`: 대기 중 runtime 재개
- `pnpm omo:claude-budget -- --status`: Claude 사용 가능 상태 확인

## 예시

```bash
pnpm omo:start -- --work-item 05-planner-week-core
pnpm omo:status:brief -- --work-item 05-planner-week-core
pnpm omo:run-stage -- --slice 05-planner-week-core --stage 2 --mode execute
pnpm omo:tick -- --all
```

위 순서는 "작업 시작 -> 현재 위치 확인 -> 2단계 실행 -> 대기 중 작업 재개"를 뜻한다. 초보자는 `status:brief`로 위치를 읽고 `run-stage`로 필요한 단계만 돌려보면 구조를 빨리 이해할 수 있다.

`pnpm omo:status -- --work-item <id>`는 operator-facing 진단도 함께 보여 준다. 대표적으로 `reason code`, 마지막 실패 validator, failure path, artifact path, 다음 추천 액션을 표준 형식으로 출력하므로 "왜 막혔는지"를 runtime JSON 없이도 바로 확인할 수 있다.

## 기억할 점

OMO가 있어도 공식 제품 계약 우선순위는 바뀌지 않는다. 제품 계약은 계속 공식 문서와 `AGENTS.md`를 따른다. OMO / workflow-v2는 그 계약을 기본 운영 경로로 집행하고 다시 이어서 실행하게 해 주는 시스템이다.
