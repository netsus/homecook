# Workflow V2

## Status

- 현재 기본 운영 경로:
  - product slice: `docs/engineering/slice-workflow.md`
  - change-type gate: `docs/engineering/agent-workflow-overview.md`
- 이 디렉터리의 역할:
  - reusable workflow v2 설계와 파일럿
  - 현재 v1을 즉시 대체하지 않는 next-generation path
- 현재 executable pilot baseline:
  - `pnpm omo:supervise`, `pnpm omo:tick`, `pnpm omo:tick:watch`, `pnpm omo:reconcile`, `pnpm omo:status`
  - `pnpm validate:workflow-v2`, `pnpm validate:omo-bookkeeping`
- 새로 잠그는 범위:
  - `generic OMO session-orchestrated runner` 설계
  - per-work-item session reuse
  - repo-local runtime state + scheduled resume policy
- 승격 전 규칙:
  - v2 문서는 `workflow-v2`를 명시적으로 대상으로 한 engineering 작업에서만 직접적인 source of truth다.
  - 일반 product slice 구현은 계속 v1 절차를 따른다.

## Why

v1은 문서 정합성, 계약 안정성, PR 추적성을 크게 개선했다.
반면 handoff 비용, 상태 관리 중복, GitHub 상태와 review 의미의 불일치, 다른 프로젝트로의 재사용 어려움이 남아 있다.

v2는 이 문제를 풀기 위해 다음을 추가한다.

- workflow core와 project profile 분리
- preset 기반 경로 선택
- Claude-Codex dual-approval loop의 공식화
- machine-readable 상태 파일
- external dependency smoke check의 명시화

## Reading Order

1. [charter.md](./charter.md)
2. [core.md](./core.md)
3. [presets.md](./presets.md)
4. [approval-and-loops.md](./approval-and-loops.md)
5. [../bookkeeping-authority-matrix.md](../bookkeeping-authority-matrix.md)
6. [promotion-readiness.md](./promotion-readiness.md)
7. [omo-lite-architecture.md](./omo-lite-architecture.md)
8. [omo-session-orchestrator.md](./omo-session-orchestrator.md)
9. [omo-claude-cli-provider.md](./omo-claude-cli-provider.md)
10. [omo-autonomous-supervisor.md](./omo-autonomous-supervisor.md)
11. [omo-lite-supervisor-spec.md](./omo-lite-supervisor-spec.md)
12. [omo-lite-dispatch-contract.md](./omo-lite-dispatch-contract.md)
13. [TEMPLATE.md](./profiles/TEMPLATE.md)
14. [homecook.md](./profiles/homecook.md)
15. [migration.md](./migration.md)

## Directory Map

- [.workflow-v2/README.md](../../../.workflow-v2/README.md): 실제 pilot 상태 저장 위치
- [.workflow-v2/promotion-evidence.json](../../../.workflow-v2/promotion-evidence.json): current promotion checklist / pilot lane evidence ledger
- [charter.md](./charter.md): v2가 해결할 문제, 유지할 원칙, 비범위
- [core.md](./core.md): 공통 개념, 책임, lifecycle
- [presets.md](./presets.md): 작업 유형별 기본 경로
- [approval-and-loops.md](./approval-and-loops.md): plan/review loop와 dual-approval 규칙
- [promotion-readiness.md](./promotion-readiness.md): OMO 기본 승격 checklist와 pilot evidence gate
- [../bookkeeping-authority-matrix.md](../bookkeeping-authority-matrix.md): closeout docs / tracked state / PR evidence ownership matrix
- [omo-lite-architecture.md](./omo-lite-architecture.md): Codex supervisor 기반 Homecook OMO-lite 설계안
- [omo-session-orchestrator.md](./omo-session-orchestrator.md): generic session reuse / runtime state / scheduled resume 규격
- [omo-claude-cli-provider.md](./omo-claude-cli-provider.md): raw `claude` CLI provider, session extraction, deterministic resume 규격
- [omo-autonomous-supervisor.md](./omo-autonomous-supervisor.md): local worktree / PR / CI / merge / scheduler supervisor 규격
- [omo-lite-supervisor-spec.md](./omo-lite-supervisor-spec.md): supervisor 책임, 상태, stage state machine
- [omo-lite-dispatch-contract.md](./omo-lite-dispatch-contract.md): stage별 actor dispatch 입출력 계약
- [profiles/TEMPLATE.md](./profiles/TEMPLATE.md): 다른 프로젝트용 profile template
- [profiles/homecook.md](./profiles/homecook.md): 현재 저장소에 적용되는 profile
- [schemas/work-item.schema.json](./schemas/work-item.schema.json): work item 메타데이터 스키마
- [schemas/workflow-status.schema.json](./schemas/workflow-status.schema.json): 상태 보드 스키마
- [schemas/promotion-evidence.schema.json](./schemas/promotion-evidence.schema.json): 승격 evidence ledger 스키마
- [templates/work-item.example.json](./templates/work-item.example.json): 예시 work item
- [templates/workflow-status.example.json](./templates/workflow-status.example.json): 예시 상태 보드
- [templates/promotion-evidence.example.json](./templates/promotion-evidence.example.json): 예시 승격 evidence ledger
- [migration.md](./migration.md): v1 -> v2 점진 전환 경로
- [opencode.json](../../../opencode.json): repo-local OpenCode instructions + direct agent/default bindings
- [.opencode/README.md](../../../.opencode/README.md): repo-local OMO 운영 메모
- [.opencode/omo-provider.json](../../../.opencode/omo-provider.json): Claude/Codex provider defaults for OMO
- [.opencode/oh-my-opencode.json](../../../.opencode/oh-my-opencode.json): Homecook agent/hook compatibility snapshot

## Adoption Rules

- v2는 big bang 전환이 아니라 파일럿으로 도입한다.
- `workflow-v2` 관련 첫 단계는 문서와 schema를 고정하는 것이다.
- 실제 pilot 운영 상태는 저장소 루트의 `.workflow-v2/` 아래 JSON으로 기록한다.
- OMO 기본 승격 판단은 `docs/engineering/workflow-v2/promotion-readiness.md`와 `.workflow-v2/promotion-evidence.json`을 함께 기준으로 삼는다.
- closeout docs, `.workflow-v2/status.json`, OMO runtime, PR evidence의 authoritative ownership은 `docs/engineering/bookkeeping-authority-matrix.md`를 따른다.
- machine-readable 파일이 들어와도 README 표를 즉시 제거하지 않는다.
- v2 승격 전까지는 product slice merge gate를 v1 기준으로 계속 유지한다.
- Phase 4부터는 최소 executable helper(`pnpm omo:dispatch-stage`, `pnpm omo:sync-status`)를 함께 관리한다.
- Phase 5부터는 `pnpm omo:run-stage`로 Codex/Claude stage를 repo-local OpenCode/OMO 실행과 artifact bundle에 직접 연결한다.
- Phase 7부터는 `pnpm omo:claude-budget`과 repo-local override를 통해 Claude reviewer availability를 자동 해석하고, 필요 시 blocked retry를 기록한다.
- Phase 8 pilot baseline은 `omo:supervise`, `omo:tick`, `omo:tick:watch`, `omo:reconcile`, `validate:omo-bookkeeping`까지 포함한다.
- fullauto v1의 의미는 low/medium autonomous slice에 대해 Stage 1~6 무인 merge까지 포함한다.
- session-orchestrated runner 규격은 구현보다 먼저 문서로 잠근다.
- 구현 baseline과 상위 문서가 다시 어긋나면 `pnpm validate:workflow-v2`가 fail한다.

## Immediate Scope

- v2 charter/core/profile/preset/loop 문서화
- OMO-lite architecture / supervisor / dispatch spec 고정
- generic session orchestrator spec 고정
- repo-local OpenCode / OMO config bootstrap
- minimal `omo:dispatch-stage` / `omo:sync-status` helper 도입
- direct `omo:run-stage` execution binding + `.artifacts/omo-lite-dispatch/` artifact bundle
- Stage 4 Claude implementation + Codex `authority_precheck` + Stage 5 Codex public review + Claude `final_authority_gate` 흐름
- automatic Claude budget resolution + repo-local override
- JSON schema와 예시 파일 추가
- promotion checklist와 pilot evidence ledger 추가
- `validate:workflow-v2` 최소 validator 추가
- `validate:workflow-v2` bundle에 source-of-truth reference drift 검사 추가
- `validate:omo-bookkeeping` official docs drift validator 추가
- `omo:reconcile` docs-only closeout PR repair path 추가
  - merged slice의 roadmap/workpack README bookkeeping뿐 아니라 safe slice-local closeout metadata(`acceptance.md`, `automation-spec.json`, closeout evidence refs)까지 repair 가능
- `internal 6.5 closeout_reconcile` subphase를 supervisor state machine에 정식 승격
  - Stage 6 approve 뒤 `closeout_reconcile_check -> repair -> recheck`를 거쳐 merged bookkeeping과 safe slice-local closeout drift를 정렬한 뒤에만 merge gate로 진입
- executable supervisor baseline: `omo:supervise`, `omo:tick`, `omo:tick:watch`, `omo:status`
- live smoke entrypoints: `omo:smoke:control-plane`, `omo:smoke:providers`
- `omo:smoke:control-plane -- --live-providers`는 backend Stage 2/3만 실제 Claude/Codex를 사용하고, 나머지 단계는 deterministic smoke로 유지한 채 최소 확인용 프롬프트로 review loop(`request_changes -> Codex 반영 -> 추가 review -> 추가 반영`)를 검증한다.
- macOS repo-managed scheduler entrypoints: `omo:scheduler:install`, `omo:scheduler:uninstall`, `omo:scheduler:verify`
- 현재 entry-point 문서에서 v2 pilot 경로를 발견 가능하게 연결

## Executable Pilot Baseline

- 현재 구현된 supervisor/control-plane 명령:
  - `pnpm omo:supervise`
  - `pnpm omo:tick`
  - `pnpm omo:tick:watch`
  - `pnpm omo:reconcile`
  - `pnpm omo:promotion:update`
  - `pnpm omo:status`
  - `pnpm omo:status:brief`
- 현재 구현된 validation/smoke/scheduler 명령:
  - `pnpm validate:workflow-v2`
  - `pnpm validate:omo-bookkeeping`
  - `pnpm validate:authority-evidence-presence`
  - `pnpm validate:real-smoke-presence`
  - `pnpm omo:smoke:control-plane`
  - `pnpm omo:smoke:providers`
  - `pnpm omo:scheduler:install`
  - `pnpm omo:scheduler:uninstall`
  - `pnpm omo:scheduler:verify`
- 현재 baseline의 해석:
  - `fullauto v1`은 low/medium autonomous slice의 무인 merge까지 자동화한다.
  - merge authority는 GitHub formal approval이 아니라 stage owner review artifact + authority gate pass(해당 시) + 전체 PR checks + external smoke다.
  - authority-required UI는 Claude Stage 4 구현 뒤 Codex `authority_precheck`, Codex Stage 5 public review, Claude `final_authority_gate`를 거친다.
  - Stage 6 approve 뒤 supervisor는 `validate:closeout-sync`, `validate:source-of-truth-sync`, `validate:exploratory-qa-evidence`, `validate:authority-evidence-presence`, `validate:real-smoke-presence` bundle을 `internal 6.5`로 실행하고, fixable slice-local drift만 같은 frontend PR branch에서 auto-repair한다.
  - manual handoff는 `high-risk` / `anchor-extension` / `exceptional recovery`에 한정된 예외 경로다.
  - provider wait와 budget issue는 기본적으로 `pause + scheduled resume`를 사용한다.
  - `high-risk` / `anchor-extension` slice는 stage execution은 지원하지만 automatic merge는 금지하고 manual merge handoff bundle로 종료한다.
  - live smoke는 일반 PR CI 전체 강제가 아니라 `external_smokes[]`가 선언된 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.
  - live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.
  - scheduler standard는 team-shared default를 `macOS launchd`로 고정하고, non-macOS 환경은 `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending` fallback으로 다룬다.
  - scheduler install/config 변경 뒤와 최소 `slice-batch-review`마다 1회 `pnpm omo:scheduler:verify -- --work-item <id>`와 `pnpm omo:tick:watch -- --work-item <id>`를 함께 확인한다.

## Next Locked Scope

- non-macOS scheduler automation의 추가 승격 여부 판단
- multi-project reusable promotion 기준과 profile extraction
- optional GitHub Actions 기반 smoke orchestration 여부 판단

## Pilot Usage

1. `.workflow-v2/work-items/<id>.json`을 만든다.
2. `.workflow-v2/status.json`에 같은 `id`의 status item을 추가한다.
3. 승격 상태를 관리 중이면 `.workflow-v2/promotion-evidence.json`도 같이 갱신한다.
4. 작업 브랜치와 preset, required checks를 status에 기록한다.
   merge gate는 required subset이 아니라 current head 기준 시작된 PR checks 전체 green 여부로 판단한다.
5. PR 본문의 `## Workpack / Slice`에 `workflow v2 work item` 경로를 적는다.
6. `pnpm validate:workflow-v2`를 통과시킨다.
7. medium/high risk 작업이면 plan loop summary artifact를 남긴다.
8. review loop summary artifact는 docs-governance, workflow/tooling 변경, 또는 exceptional recovery일 때만 남긴다.
9. OMO-lite supervised execution이 필요하면 `pnpm omo:run-stage -- --slice <id> --stage <n>`으로 dispatch artifact를 만들고, public code stage 실행이 필요할 때 `--mode execute`를 사용한다.
   slice6 기준 public Stage 4는 Claude execute path를 사용할 수 있고, Stage 5 `final_authority_gate`는 review gate이므로 execute 대상이 아니라 review artifact 경로로 다룬다.
10. Claude reviewer availability를 로컬에서 강제로 조정해야 하면 `pnpm omo:claude-budget -- --set unavailable --reason "<reason>"` 또는 `--clear`를 사용한다.
11. reviewer fallback도 tracked state에 같이 남기려면 `pnpm omo:run-stage -- --slice <id> --stage <n> --sync-status`를 사용한다.
12. sandbox GitHub repo에서 supervisor control plane을 점검할 때는 `pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name>`를 사용한다.
13. 실제 Claude 첫 리뷰가 반드시 `request_changes`를 내고 Codex가 그 피드백 토큰을 반영하는지까지 최소 프롬프트로 보려면 `pnpm omo:smoke:control-plane -- --sandbox-repo <owner/name> --live-providers`를 사용한다. 이 모드는 backend Stage 2/3만 실제 provider를 사용한다.
14. 실제 Claude/Codex provider 경로, session reuse, stage-result 생성을 분리 검증할 때는 `pnpm omo:smoke:providers`를 사용한다.
15. slice06 또는 parallel pilot checkpoint 결과를 ledger에 남길 때는 `pnpm omo:promotion:update -- --section pilot-lane --id <lane>`를 사용한다.
16. macOS scheduler는 `pnpm omo:scheduler:install -- --work-item <id>`로 설치하고 `pnpm omo:scheduler:verify -- --work-item <id>`로 확인한다.
17. `pnpm validate:workflow-v2`는 schema/example뿐 아니라 상위 workflow-v2 entry docs drift와 official source-of-truth reference drift도 함께 검사한다.

## Not Yet Included

- GitHub Actions의 전면 재구성
- README 자동 생성
- v1 slice status 표의 완전 자동 동기화
- preset 기반 branch/PR gate의 강제 실행
- merge queue 우회
