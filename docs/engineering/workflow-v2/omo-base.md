# OMO Base

> `2026-07-30` 이후 Claude actor 설명은 역사적 baseline이다. 신규 actor contract는 `docs/engineering/codex-task-handoff.md`를 따른다.

## OMO란?

OMO는 `Oh My OpenCode`다. 현재는 `work item` 상태, deterministic validator, current-head gate, closeout/report projection을 관리하는 rail로 쓴다. 실제 Stage 의미 작업은 역할별 Codex 새 작업이 수행한다.

## 어떻게 돌아가나?

핵심은 세 파일 묶음이다. `.workflow-v2/work-items/<id>.json`에는 작업 정의를, `.workflow-v2/status.json`에는 공식 진행 상태를, `.opencode/omo-runtime/`에는 legacy runtime 상태를 둔다. 조정 작업은 Codex task handoff 결과를 이 상태와 closeout evidence에 투영한다.

## 자주 쓰는 명령어

- `pnpm omo:status:brief`: repo-local runtime 전체의 현재 stage, blocker reason code, 다음 액션 요약 확인
- `pnpm omo:status:brief -- --work-item <id>`: 특정 work item만 요약 확인
- `pnpm omo:tail -- --work-item <id>`: status + scheduler + 최근 tick 로그를 한 번에 확인
- `pnpm omo:reconcile -- --work-item <id>`: actor를 호출하지 않고 closeout projection 정합성 확인/복구
- `pnpm omo:report -- --work-item <id>`: Stage evidence 기반 report 생성

`omo:start`, `omo:run-stage`, `omo:supervise`, `omo:tick`, provider budget/resume, scheduler execute 명령은 legacy provider를 호출할 수 있으므로 신규 Stage에 사용하지 않는다.

## 예시

```bash
pnpm omo:status:brief
pnpm omo:tail -- --work-item 05-planner-week-core --lines 10
pnpm omo:reconcile -- --work-item 05-planner-week-core
pnpm omo:report -- --work-item 05-planner-week-core
```

위 순서는 "현재 위치 확인 -> closeout 정합성 확인 -> report 생성"을 뜻한다. Stage 실행은 `docs/engineering/codex-task-handoff.md`를 따른다.

`pnpm omo:status -- --work-item <id>`는 operator-facing 진단도 함께 보여 준다. 대표적으로 `reason code`, 마지막 실패 validator, failure path, artifact path, 다음 추천 액션과 함께 `runtime signal`, `last activity`, `session freshness`를 표준 형식으로 출력하므로 "왜 막혔는지"와 "지금도 살아 있는지"를 runtime JSON 없이도 바로 확인할 수 있다.

`pnpm omo:tail -- --work-item <id>`는 여기서 한 걸음 더 나아가 scheduler snapshot과 최근 `omo:tick` stdout/stderr tail까지 같이 묶어 보여 준다. 즉 `status`로도 애매할 때 operator가 log path를 다시 찾아 들어가지 않고 한 화면에서 freshness와 최근 tick 흔적을 같이 읽을 수 있게 한다.

## 기억할 점

OMO가 있어도 공식 제품 계약 우선순위는 바뀌지 않는다. 제품 계약은 계속 공식 문서와 `AGENTS.md`를 따른다. OMO / workflow-v2는 그 계약을 기본 운영 경로로 집행하고 다시 이어서 실행하게 해 주는 시스템이다.
