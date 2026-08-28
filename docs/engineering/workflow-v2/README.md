# Workflow V2

## Status

- 현재 기본 운영 경로:
  - workflow-v2 / OMO entry docs: 이 디렉터리
  - product slice stage contract: `docs/engineering/slice-workflow.md`
  - change-type gate: `docs/engineering/agent-workflow-overview.md`
- 이 디렉터리의 역할:
  - reusable workflow v2 설계와 기본 운영 기준
  - Homecook OMO default path의 entry docs
- 현재 executable baseline:
  - actor를 호출하지 않는 `pnpm omo:reconcile`, `pnpm omo:status`, `pnpm omo:tail`, `pnpm omo:report`
  - `pnpm validate:workflow-v2`, `pnpm validate:omo-bookkeeping`
- 새로 잠그는 범위:
  - `docs/engineering/codex-task-handoff.md` 기반 별도 Codex 작업 handoff
  - task ID / commit SHA / evidence 기반 독립 Stage 검토
  - 기존 OMO 상태·validator·closeout projection의 model-neutral migration 경계
- 현재 운영 규칙:
  - workflow-v2 entry docs가 OMO 기본 운영 경로를 설명한다.
  - product slice 구현의 stage-by-stage mechanics는 계속 `slice-workflow.md`와 `agent-workflow-overview.md`가 담당한다.
- 현재 전환 방향:
  - Codex는 conductor, OMO는 rail이다.
  - Homecook OMO는 Codex가 orchestration owner이고 OMO가 deterministic rail인 `Codex-orchestrated OMO rail`로 전환한다.
  - Claude는 사용하지 않는다. 모든 Stage actor는 역할별 별도 Codex 작업이다.
  - Claude provider를 호출하는 `omo:supervise`, `omo:run-stage`, `omo:tick`, live-provider smoke, scheduler execute 경로는 신규 작업에서 사용 중지한다.
- 현재 readiness 경계:
  - 과거 `.workflow-v2/promotion-evidence.json`의 `ready`는 Claude provider baseline에 대한 역사적 판정이며 GPT-only actor dispatch readiness가 아니다.
  - `Codex-orchestrated OMO rail`은 상태 조회, validator, current-head gate, closeout/report projection에만 사용할 수 있다.
  - product Stage 실행은 `codex-task-handoff.md`를 사용한다.
  - slice `12b-shopping-pantry-reflect` 시작 전에는 [omo-codex-orchestrated-rail.md](./omo-codex-orchestrated-rail.md)의 `Slice 12b Preflight Lock`을 먼저 확인한다.
- 서버 Mac release rehearsal은 product stage나 OMO actor-dispatch 범위가 아니다. untagged exact-SHA candidate, isolated rehearsal, repeatability receipt와 mixed-state classification은 `docs/engineering/local-mac-production-release-rehearsal.md`를 따르는 별도 engineering docs-governance/implementation 경로다.

## Why

v1은 문서 정합성, 계약 안정성, PR 추적성을 크게 개선했다.
반면 handoff 비용, 상태 관리 중복, GitHub 상태와 review 의미의 불일치, 다른 프로젝트로의 재사용 어려움이 남아 있다.

v2는 이 문제를 풀기 위해 다음을 추가한다.

- workflow core와 project profile 분리
- preset 기반 경로 선택
- 서로 다른 Codex task ID를 사용하는 independent approval loop의 공식화
- machine-readable 상태 파일
- external dependency smoke check의 명시화

최근 10b/11/12a 운영에서는 Codex가 OMO supervise run 옆에서 blocker를 분류하고 바로 repair하면서 `human_escalation` 없이 slice를 닫는 패턴이 확인됐다.
따라서 v2 reset의 다음 단계는 OMO를 제거하는 것이 아니라, OMO를 상태/검증/증거 projection rail로 줄이고 Codex를 orchestration owner로 명시하는 것이다.

## Audience Split

- product stage actor: workflow-v2 spec 전체를 기본 읽기 세트로 삼지 않는다. `AGENTS.md` → workpack → `slice-workflow.md` → `agent-workflow-overview.md`를 우선하고, 여기서는 operator 경로가 필요할 때만 들어온다.
- OMO operator: 이 README를 entry로 읽고 `.opencode/README.md`, reset docs, 필요한 runtime note만 추가로 본다.
- workflow maintainer: 이 README를 시작점으로 삼되, `omo-*spec.md`와 runtime/validator/test 코드를 필요한 범위만 읽는다.

## Reading Order

### Operator Core

1. [charter.md](./charter.md)
2. [core.md](./core.md)
3. [presets.md](./presets.md)
4. [approval-and-loops.md](./approval-and-loops.md)
5. [../bookkeeping-authority-matrix.md](../bookkeeping-authority-matrix.md)
6. [promotion-readiness.md](./promotion-readiness.md)

### Reset Track

1. [omo-codex-orchestrated-rail.md](./omo-codex-orchestrated-rail.md)
2. [omo-supervisor-reset-plan.md](./omo-supervisor-reset-plan.md)
3. [omo-incident-registry.md](./omo-incident-registry.md)
4. [omo-governance-surface-map.md](./omo-governance-surface-map.md)
5. [omo-canonical-closeout-state.md](./omo-canonical-closeout-state.md)
6. [omo-auditor-reset-requirements.md](./omo-auditor-reset-requirements.md)
7. [omo-replay-acceptance.md](./omo-replay-acceptance.md)

### Maintainer Specs

1. [omo-lite-architecture.md](./omo-lite-architecture.md)
2. [omo-session-orchestrator.md](./omo-session-orchestrator.md)
3. [omo-claude-cli-provider.md](./omo-claude-cli-provider.md) — retired legacy spec
4. [omo-autonomous-supervisor.md](./omo-autonomous-supervisor.md)
5. [omo-lite-supervisor-spec.md](./omo-lite-supervisor-spec.md)
6. [omo-lite-dispatch-contract.md](./omo-lite-dispatch-contract.md)

### Profiles / Migration

1. [TEMPLATE.md](./profiles/TEMPLATE.md)
2. [homecook.md](./profiles/homecook.md)
3. [migration.md](./migration.md)

## Directory Map

- [.workflow-v2/README.md](../../../.workflow-v2/README.md): 실제 tracked workflow 상태 저장 위치
- [.workflow-v2/promotion-evidence.json](../../../.workflow-v2/promotion-evidence.json): current promotion / lane evidence ledger
- [.workflow-v2/replay-acceptance.json](../../../.workflow-v2/replay-acceptance.json): representative replay acceptance ledger
- [charter.md](./charter.md): v2가 해결할 문제, 유지할 원칙, 비범위
- [core.md](./core.md): 공통 개념, 책임, lifecycle
- [presets.md](./presets.md): 작업 유형별 기본 경로
- [approval-and-loops.md](./approval-and-loops.md): plan/review loop와 dual-approval 규칙
- [promotion-readiness.md](./promotion-readiness.md): OMO 기본 운영 readiness / lane evidence gate
- [../bookkeeping-authority-matrix.md](../bookkeeping-authority-matrix.md): transition-period writable closeout surface compatibility note
- [omo-lite-architecture.md](./omo-lite-architecture.md): maintainer spec. Codex supervisor 기반 Homecook OMO-lite 설계안
- [omo-session-orchestrator.md](./omo-session-orchestrator.md): maintainer spec. generic session reuse / runtime state / scheduled resume 규격
- [omo-claude-cli-provider.md](./omo-claude-cli-provider.md): retired legacy spec. 과거 raw Claude CLI provider 기록이며 신규 실행 금지
- [omo-autonomous-supervisor.md](./omo-autonomous-supervisor.md): maintainer spec. local worktree / PR / CI / merge / scheduler supervisor 규격
- [omo-supervisor-reset-plan.md](./omo-supervisor-reset-plan.md): slice07 이후 OMO를 patch accumulation이 아니라 supervisor reset 관점에서 다시 축소/재잠그기 위한 계획 문서
- [omo-codex-orchestrated-rail.md](./omo-codex-orchestrated-rail.md): Codex를 orchestration owner로 두고 OMO를 deterministic rail로 줄이는 전환 결정, reason code, baseline evidence
- [omo-incident-registry.md](./omo-incident-registry.md): slice07 failure log와 early-run 흔적을 reset input corpus로 관리하는 incident registry
- [omo-governance-surface-map.md](./omo-governance-surface-map.md): stage actor / operator / maintainer가 읽어야 할 문서 표면을 다시 자르기 위한 책임 경계 맵
- [omo-canonical-closeout-state.md](./omo-canonical-closeout-state.md): closeout truth를 한 surface로 줄이고 README / acceptance / PR body / status를 projection으로 내리기 위한 Phase 2 후보 설계
- [omo-auditor-reset-requirements.md](./omo-auditor-reset-requirements.md): meta-harness-auditor가 incident corpus, runtime anomaly, promotion drift를 기본 입력으로 읽도록 다시 잠그는 Phase 6 요구사항
- [omo-replay-acceptance.md](./omo-replay-acceptance.md): Phase 8 representative replay lane과 replay evidence ledger 기준
- [omo-lite-supervisor-spec.md](./omo-lite-supervisor-spec.md): maintainer spec. supervisor 책임, 상태, stage state machine
- [omo-lite-dispatch-contract.md](./omo-lite-dispatch-contract.md): maintainer spec. stage별 actor dispatch 입출력 계약
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
- [.opencode/omo-provider.json](../../../.opencode/omo-provider.json): legacy provider compatibility snapshot. 신규 Stage dispatch source로 사용 금지
- [.opencode/oh-my-opencode.json](../../../.opencode/oh-my-opencode.json): Homecook agent/hook compatibility snapshot

## Adoption Rules

- workflow-v2는 현재 Homecook의 OMO 기본 운영 경로다.
- Homecook의 Supabase target과 external/local gate는 `../supabase-local-only-operations.md`를 따른다. Cloud/linked/remote Supabase evidence는 forbidden/N/A이며 promotion·closeout prerequisite가 될 수 없다.
- 현재 기본 운영 모델은 `Codex task orchestration + OMO deterministic rail`이다. Codex 새 작업들이 Stage를 수행하고, OMO는 actor를 호출하지 않는 state validation / current-head gate / closeout-report projection만 맡는다.
- `Codex-orchestrated OMO rail`이 usable하다는 말은 promotion gate가 ready라는 뜻이 아니다. promotion readiness는 `.workflow-v2/promotion-evidence.json`과 `promotion-readiness.md`가 정한 별도 gate로 판단한다.
- 12b 이후 product slice는 시작 전에 해당 slice의 report/evidence 체크리스트와 escalation 기준을 명시하고, `human_escalation`은 manual decision 또는 repair budget exhaustion으로만 남긴다.
- 이 README는 operator entry다. product stage actor는 workflow-v2 spec 전체를 기본 읽기 세트로 삼지 않고, `slice-workflow.md`와 `agent-workflow-overview.md`를 우선한다.
- product stage actor 기본 읽기에는 `workflow-v2` maintainer spec을 넣지 않는다. maintainer spec은 runtime/report/tooling 변경 때만 읽는다.
- `workflow-v2` 관련 첫 단계는 문서와 schema를 고정하는 것이다.
- 실제 tracked 운영 상태는 저장소 루트의 `.workflow-v2/` 아래 JSON으로 기록한다.
- OMO 기본 운영 건강성 판단은 `docs/engineering/workflow-v2/promotion-readiness.md`와 `.workflow-v2/promotion-evidence.json`을 함께 기준으로 삼는다.
- replay acceptance tracked evidence는 `.workflow-v2/replay-acceptance.json`을 기준으로 삼는다.
- canonical closeout projection / repair semantics의 기준은 `omo-canonical-closeout-state.md`를 따른다. `bookkeeping-authority-matrix.md`는 전환이 끝날 때까지 writable closeout surface compatibility note로 유지한다.
- `work-item`은 optional `closeout` snapshot을 가질 수 있고, 현재 baseline에서는 `.workflow-v2/status.json`의 `lifecycle / approval_state / verification_status / recovery note`가 그 projection과 모순되지 않아야 한다.
- 현재 executable baseline은 `.workflow-v2/status.json` summary projection consistency, `validate:closeout-sync`의 doc-surface drift check, PR body `Closeout Sync` / `Merge Gate` generated section, `omo:reconcile` current-vocabulary repair consumer를 포함한다.
- `Actual Verification` evidence는 source PR/manual surface를 계속 우선하고, markdown 전체 rewrite/sync patcher는 아직 포함하지 않는다.
- machine-readable 파일이 들어와도 README 표를 즉시 제거하지 않는다.
- product slice merge gate는 `slice-workflow.md`와 `agent-workflow-overview.md`가 정한 current-head 기준을 계속 따른다.
- Phase 4부터는 최소 executable helper(`pnpm omo:dispatch-stage`, `pnpm omo:sync-status`)를 함께 관리한다.
- 과거 Phase 5 `omo:run-stage`와 Phase 7 Claude budget 경로는 retired compatibility surface다.
- 현재 허용 baseline은 actor를 호출하지 않는 `omo:reconcile`, `omo:status`, `omo:tail`, `omo:report`, validation 명령이다.
- fullauto v1과 `pnpm omo:supervise -- --work-item <slice>` actor dispatch는 GPT-only migration 완료 전 중지한다.
- Stage 1 docs PR은 즉시 merge하지 않고, 같은 run 안에서 `internal 1.5 docs gate`를 mandatory로 거친다.
- session-orchestrated runner 규격은 구현보다 먼저 문서로 잠근다.
- 구현 baseline과 상위 문서가 다시 어긋나면 `pnpm validate:workflow-v2`가 fail한다.

## Legacy Baseline (감사 기록, 신규 실행 금지)

- v2 charter/core/profile/preset/loop 문서화
- OMO-lite architecture / supervisor / dispatch spec 고정
- generic session orchestrator spec 고정
- repo-local OpenCode / OMO config bootstrap
- minimal `omo:dispatch-stage` / `omo:sync-status` helper 도입
- direct `omo:run-stage` execution binding + `.artifacts/omo-lite-dispatch/` artifact bundle
- 과거 Stage 1 author / internal 1.5 repair provider 경로
- 과거 Stage 4 implementation / final authority provider 경로
- 과거 provider budget resolution + repo-local override
- JSON schema와 예시 파일 추가
- promotion checklist와 lane evidence ledger 추가
- `validate:workflow-v2` 최소 validator 추가
- `validate:workflow-v2` bundle에 source-of-truth reference drift 검사 추가
- `validate:omo-bookkeeping` official docs drift validator 추가
- `omo:reconcile` docs-only closeout PR repair path 추가
  - merged slice의 roadmap/workpack README bookkeeping뿐 아니라 safe slice-local closeout metadata(`acceptance.md`, `automation-spec.json`, closeout evidence refs)까지 repair 가능
- `internal 6.5 closeout_reconcile` subphase를 supervisor state machine에 정식 승격
  - Stage 6 approve 뒤 `closeout_reconcile_check -> repair -> recheck`를 거쳐 merged bookkeeping과 safe slice-local closeout drift를 정렬한 뒤에만 merge gate로 진입
- executable supervisor baseline: `omo:supervise`, `omo:tick`, `omo:tick:watch`, `omo:status`, `omo:tail`
- live smoke entrypoints: `omo:smoke:control-plane`, `omo:smoke:providers`
- `omo:smoke:control-plane -- --live-providers` 같은 live-provider smoke는 신규 작업에서 실행하지 않는다.
- macOS repo-managed scheduler entrypoints: `omo:scheduler:install`, `omo:scheduler:uninstall`, `omo:scheduler:verify`
- macOS scheduler execute 경로는 legacy provider를 호출할 수 있으므로 신규 작업에서 실행하지 않는다.
- 현재 entry-point 문서에서 workflow-v2 default 경로를 발견 가능하게 연결

## 현재 사용 가능한 OMO 범위

- actor를 호출하지 않는 상태·projection 명령:
  - `pnpm omo:reconcile`
  - `pnpm omo:promotion:update`
  - `pnpm omo:replay:update`
  - `pnpm omo:status`
  - `pnpm omo:status:brief`
  - `pnpm omo:tail`
- validation 명령:
  - `pnpm validate:workflow-v2`
  - `pnpm validate:omo-bookkeeping`
  - `pnpm validate:authority-evidence-presence`
  - `pnpm validate:real-smoke-presence`
- 현재 baseline의 해석:
  - Stage 실행과 merge 판단은 `codex-task-handoff.md`와 `slice-workflow.md`를 따른다.
  - authority-required UI는 서로 다른 Codex Stage 4, design-reviewer, product-design-authority 작업을 거친다.
  - Stage 6 approve 뒤 supervisor는 `validate:closeout-sync`, `validate:source-of-truth-sync`, `validate:exploratory-qa-evidence`, `validate:authority-evidence-presence`, `validate:real-smoke-presence` bundle을 `internal 6.5`로 실행하고, fixable slice-local drift만 같은 frontend PR branch에서 auto-repair한다.
  - Stage 6/current-head merge 완료 뒤에는 `pnpm omo:report -- --work-item <slice>`로 `docs/workpacks/<slice>/omo-report.md`를 생성한다. dispatch 산출물이 없어 순수 진행시간이 0.0분으로 떨어지는 Codex-orchestrated slice는 `.omx/artifacts`, PR timestamps, git history, GitHub checks, source PR body를 근거로 backfilled estimate를 남긴다.
  - 새 Codex 작업 handoff는 모든 product Stage의 기본 경로다.
  - task가 완료되지 않으면 조정 작업은 상태를 추적하고, 사용자 입력 또는 외부 조건이 필요할 때만 handoff한다.
  - `high-risk` / `anchor-extension` slice는 stage execution은 지원하지만 automatic merge는 금지하고 manual merge handoff bundle로 종료한다.
  - live smoke는 일반 PR CI 전체 강제가 아니라 `external_smokes[]`가 선언된 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.
  - live smoke evidence의 canonical source는 source PR `Actual Verification`이고, closeout preflight는 그 evidence를 재사용한다.
  - legacy scheduler/tick은 신규 Stage actor 실행에 사용하지 않는다.

## Next Locked Scope

- non-macOS scheduler automation의 추가 승격 여부 판단
- multi-project reusable promotion 기준과 profile extraction
- optional GitHub Actions 기반 smoke orchestration 여부 판단

## Workflow Usage

1. product Stage는 `docs/engineering/codex-task-handoff.md`에 따라 역할별 Codex 새 작업으로 실행한다.
2. 조정 작업은 task ID, 입력 commit SHA, PR URL, stage-result/evidence를 handoff ledger와 PR `Actual Verification`에 기록한다.
3. 이미 tracked item이 있는 작업은 `.workflow-v2/work-items/<id>.json`과 `.workflow-v2/status.json`을 상태·closeout projection source로 사용한다.
4. 승격 상태를 관리 중이면 `.workflow-v2/promotion-evidence.json`도 같이 갱신한다. 과거 provider `ready`는 GPT-only actor dispatch readiness로 재사용하지 않는다.
5. 작업 브랜치와 preset, required checks를 status에 기록한다.
   merge gate는 required subset이 아니라 current head 기준 시작된 PR checks 전체 green 여부로 판단한다.
6. PR 본문의 `## Workpack / Slice`에 `workflow v2 work item` 경로를 적는다.
7. `pnpm validate:workflow-v2`를 통과시킨다.
8. medium/high risk 작업이면 독립 Codex plan/review artifact를 남긴다.
9. `pnpm omo:reconcile`, `pnpm omo:status`, `pnpm omo:report`처럼 actor를 호출하지 않는 명령만 사용한다.
10. `omo:supervise`, `omo:run-stage`, `omo:tick`, `omo:resume-pending`, live-provider smoke, scheduler execute 명령은 GPT-only runtime migration이 완료될 때까지 실행하지 않는다.
11. representative replay lane 결과를 replay ledger에 남길 때는 `pnpm omo:replay:update`를 사용한다. promotion ledger와 함께 과거 실행 기록과 현재 GPT-only evidence를 구분해 기록한다.
12. `pnpm validate:workflow-v2`는 schema/example뿐 아니라 상위 workflow-v2 entry docs drift와 official source-of-truth reference drift도 함께 검사한다.

## Not Yet Included

- GitHub Actions의 전면 재구성
- README 자동 생성
- v1 slice status 표의 완전 자동 동기화
- preset 기반 branch/PR gate의 강제 실행
- merge queue 우회
