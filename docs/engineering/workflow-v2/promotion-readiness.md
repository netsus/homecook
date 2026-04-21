# OMO Promotion Readiness

## 목적

이 문서는 `OMO v2`의 기본 운영 경로 승격 이후에도
어떤 checklist와 lane evidence가 유지돼야 하는지 잠그는 기준이다.

지금 단계의 목표는 "추가 승격 준비"가 아니라
"기본 운영 경로를 유지할 수 있는지 판단 가능한 gate를 계속 유지하는 것"이다.

## Current Mode

- 현재 모드: `default`
- canonical policy: workflow-v2 entry docs + `AGENTS.md` + `docs/engineering/slice-workflow.md` + `docs/engineering/agent-workflow-overview.md`
- OMO 역할: default runtime / supervisor / control plane
- high-risk 또는 anchor-extension slice의 automatic merge를 열지 않는다.

## Required Gates

승격 판단 전 아래 2개 축이 모두 필요하다.

1. 문서 / 운영 기준이 잠겨 있어야 한다.
2. representative pilot evidence가 누적돼 있어야 한다.

### Documentation Gates

- `omo-canonical-closeout-state`가 closeout ownership / projection semantics를 잠그고, `bookkeeping-authority-matrix`는 transition-period writable closeout surface만 기록한다.
- 현재 canonical owner는 `.workflow-v2/work-items/<id>.json#closeout`이다.
- `promotion-readiness` 문서와 `.workflow-v2/promotion-evidence.json`이 같은 gate vocabulary를 사용한다.
- promotion / pilot lane evidence는 repo-local retained artifact를 current canonical evidence로 사용해야 하며, tmp/off-repo path는 historical breadcrumb로만 남긴다.
- live smoke required 조건이 문서와 validator에서 같은 의미로 해석된다.
- manual handoff가 "예외 상황"으로만 남는지, 어떤 slice가 수동 handoff 대상인지 문서로 잠긴다.
- scheduler 운영 기준이 최소한 현재 지원 플랫폼과 fallback policy를 설명한다.

### Operational Gate Standards

#### `manual-handoff-policy`

`pass` 기준:

- manual handoff는 `high-risk`, `anchor-extension`, `exceptional recovery`에서만 허용한다.
- provider wait, Claude budget unavailable, 일반 CI polling 지연은 기본적으로 human handoff가 아니라 `pause + scheduled resume`를 사용한다.
- handoff가 발생하면 latest `stage-result.json`, authority/final gate artifact 경로(해당 시), 남은 blocker, 다음 권장 명령을 handoff bundle 또는 notes에 남긴다.

#### `live-smoke-standard`

`pass` 기준:

- live smoke는 `external_smokes[]`가 비어 있지 않은 slice, provider/scheduler control-plane 변경, `promotion-gate` 직전 rehearsal에서 required다.
- canonical evidence는 source PR의 `Actual Verification`이며, closeout preflight는 같은 evidence를 재사용한다.
- rehearsal cadence는 최소 `slice-batch-review`마다 1회 또는 주 1회 sandbox rehearsal 중 더 이른 쪽을 따른다.

#### `scheduler-standard`

`pass` 기준:

- team-shared default scheduler는 현재 `macOS launchd`로 고정한다.
- non-macOS 환경은 persistent daemon parity를 요구하지 않고, `pnpm omo:tick -- --all` 또는 operator-driven `omo:resume-pending`을 fallback으로 사용한다.
- scheduler install 뒤와 scheduler config/provider path 변경 뒤에는 `pnpm omo:scheduler:verify -- --work-item <id>`를 실행한다.
- 운영 확인은 `pnpm omo:tick:watch -- --work-item <id>`로 하고, 최소 `slice-batch-review`마다 1회 verify/watch 상태를 재점검한다.

### Pilot Gates

아래 3개 lane은 승격 전 필수다.

1. `authority-required-ui`
- 대표 예시: `06-recipe-to-planner`
- 목적: anchor-extension / authority-required closeout, final authority gate, manual handoff quality 검증
- 체크포인트:
  - Stage 2 complete
  - Stage 4 ready-for-review
  - Stage 6 closeout

2. `external-smoke`
- 실제 smoke evidence가 필요한 slice를 1건 이상 수행한다.
- 목적: live smoke required 조건, source PR `Actual Verification`, closeout preflight 재검증 경로 확인

3. `bugfix-patch`
- small bugfix 또는 post-merge patch를 1건 이상 수행한다.
- 목적: low-friction pilot lane에서 lead time / blocked retry / human escalation 빈도 확인

## Slice06 Checkpoint Rule

실행용 단계 체크리스트는 [slice06-pilot-checklist.md](./slice06-pilot-checklist.md)를 따른다.

slice06과 같은 in-flight pilot은 제품 correctness 자체를 이 문서가 판정하지 않는다.
여기서 보는 것은 아래다.

- checkpoint 시점의 closeout/bookkeeping drift
- authority evidence 존재 여부
- manual handoff artifact 품질
- scheduler / resume / blocked retry의 운영 품질

즉 slice06 체크포인트는 `OMO 승격 증거`를 쌓는 용도지,
slice06 기능 자체의 최종 제품 승인 문서가 아니다.

checkpoint 결과를 남길 때는 최소한 아래를 함께 기록한다.

- `pilot-lane=authority-required-ui`
- `checkpoint-ref=stage2-complete | stage4-ready-for-review | stage6-closeout`
- workpack ref: `docs/workpacks/06-recipe-to-planner/README.md`
- 필요하면 audit artifact / authority evidence 경로를 notes 또는 관련 gate evidence에 반영
- historical stage6/tmp artifact가 현재 machine에 없으면, retained repo-local evidence는 replay bundle과 replay ledger를 우선 사용하고 missing original artifact는 incident/backfill disposition으로 설명한다.

## Replay Acceptance Ledger

representative replay acceptance 상태는 `.workflow-v2/replay-acceptance.json`에 기록한다.

이 파일은 아래 4개 required lane을 기본으로 둔다.

- `slice06-authority-replay`
- `slice07-fullstack-replay`
- `bugfix-patch-replay`
- `control-plane-smoke-replay`

기본 갱신 명령:

```bash
pnpm omo:replay:update -- --section lane --id slice06-authority-replay --status in_progress --note "slice06 replay running"
pnpm omo:replay:update -- --section summary --status in_progress --blocking-lane-id slice07-fullstack-replay --note "representative replay in progress"
```

## Evidence Ledger

실제 누적 상태는 `.workflow-v2/promotion-evidence.json`에 기록한다.

기본 기록 명령:

```bash
pnpm omo:promotion:update -- --section pilot-lane --id authority-required-ui --status in_progress --checkpoint-ref stage4-ready-for-review --workpack-ref docs/workpacks/06-recipe-to-planner/README.md --note "slice06 Stage 4 running"
pnpm omo:promotion:update -- --section operational-gate --id live-smoke-standard --status pass --evidence-ref .opencode/README.md --evidence-ref docs/engineering/workflow-v2/promotion-readiness.md --note "required trigger matrix and rehearsal cadence locked"
pnpm omo:promotion:update -- --section promotion-gate --status not-ready --blocker "external-smoke lane evidence missing" --next-review-trigger "After slice06 Stage 6"
```

해당 파일에는 최소한 아래가 들어가야 한다.

- 문서/운영 gate 상태
- pilot lane별 상태
- slice06 checkpoint 상태
- 다음 promotion-gate 실행 조건
- 현재 blocker 목록
- replay acceptance 자체의 representative lane pass/fail은 `.workflow-v2/replay-acceptance.json`에 남긴다.
- tmp/off-repo ref가 historical breadcrumb로만 남는 경우, current note는 repo-local retained evidence를 우선 적고 필요하면 `artifact-missing accepted` 같은 disposition을 함께 남긴다.

## Ready Criteria

아래가 모두 만족될 때만 `ready` 후보로 본다.

- documentation gates가 모두 `pass`
- operational gates가 모두 `pass`
- `authority-required-ui`, `external-smoke`, `bugfix-patch` lane이 모두 `pass`
- representative replay acceptance summary가 `pass`
- `.workflow-v2/promotion-evidence.json`의 `promotion_gate.status`가 `candidate` 또는 `ready`
- workflow-v2 entry docs가 더 이상 OMO를 "pilot only"로만 설명하지 않는다.

## Not Ready Triggers

아래 중 하나라도 남아 있으면 `not-ready`다.

- authority-required lane이 아직 in-progress 또는 blocked
- external smoke lane evidence 부재
- bugfix lane evidence 부재
- replay acceptance evidence 부재 또는 required replay lane 미통과
- live smoke required 정책이 on-demand 메모 수준에 머물고 validator binding이 약함
- scheduler 운영 기준이 특정 환경 설명만 있고 team-shared 운영 기준으로 잠기지 않음
- manual handoff가 예외가 아니라 사실상 기본 종료 경로로 남아 있음

## Promotion Decision Rhythm

- `slice-checkpoint`: in-flight authority-required pilot의 Stage 2 / 4 / 6 시점
- `slice-batch-review`: slice 3~5개마다 1회
- `promotion-gate`: 승격 검토용 종합 평가

승격 결론은 auditor가 단독으로 내리지 않는다.
auditor는 gate 상태와 blocker를 보고하고,
최종 승격 결정은 별도 인간 승인과 docs-governance PR에서 잠근다.
