# Slice06 Pilot Checklist

## 목적

이 문서는 `06-recipe-to-planner`를 `authority-required-ui` 파일럿 lane으로 운영할 때
checkpoint별로 무엇을 확인하고, 어떤 evidence를 남기고, 누가 ledger를 갱신해야 하는지
실무적으로 정리한 실행 체크리스트다.

이 체크리스트의 목적은 slice06 기능 자체의 제품 품질 승인 대신
`OMO v2` 승격에 필요한 pilot evidence를 안정적으로 누적하는 데 있다.

## 적용 범위

- 대상 slice: `docs/workpacks/06-recipe-to-planner/README.md`
- 대상 lane: `authority-required-ui`
- 권장 checkpoint:
  - `stage2-complete`
  - `stage4-ready-for-review`
  - `stage6-closeout`

## 먼저 확인할 것

1. slice06 브랜치/기기에 `meta-harness-auditor`와 `pnpm omo:promotion:update`가 들어와 있어야 한다.
   - 아직 `main`에 없는 경우 현재 OMO 승격 브랜치 변경을 먼저 가져온다.
2. `.workflow-v2/promotion-evidence.json`이 branch 기준 최신이어야 한다.
3. 이 체크리스트는 checkpoint마다 실행하는 것이 좋다.
   - 최소 권장: `stage4-ready-for-review`, `stage6-closeout`
   - 권장 기본: `stage2-complete`, `stage4-ready-for-review`, `stage6-closeout`

## 역할 분리

- slice06 운영자:
  - checkpoint 사실을 가장 잘 아는 사람/에이전트
  - audit 실행
  - notes 정리
  - `pnpm omo:promotion:update`로 ledger 기록
- `meta-harness-auditor`:
  - 현재 repo/harness 상태를 읽고 blocker를 보고
  - scorecard / findings / promotion-readiness bundle을 생성
  - ledger를 자동 수정하지는 않음

즉 `auditor`는 판정자이고, `promotion-evidence.json` 기록 책임은
slice06를 실제로 진행 중인 운영자에게 있다.

## 공통 수집 항목

checkpoint마다 아래를 최소 공통 evidence로 남긴다.

- `pilot-lane=authority-required-ui`
- `checkpoint-ref=<current checkpoint>`
- workpack ref: `docs/workpacks/06-recipe-to-planner/README.md`
- audit bundle 경로
- authority evidence 경로가 있으면 notes에 함께 기록
- blocked retry / manual handoff / scheduler resume 이슈가 있으면 notes에 기록

권장 notes 형식 예시:

```text
slice06 Stage 4 ready; audit bundle: .artifacts/meta-harness-auditor/slice06-stage4/report.md; authority evidence: .artifacts/.../authority-report.md; blocked retry: none
```

## Stage 2 Complete

### 확인

- work item / `.workflow-v2/status.json` 상태가 현재 checkpoint와 크게 어긋나지 않는지 본다.
- Stage 2 산출물 또는 dispatch artifact가 남아 있는지 확인한다.
- 현재 시점에 bookkeeping drift가 이미 생기지 않았는지 본다.

### 실행

```bash
pnpm harness:audit -- --cadence-event slice-checkpoint --in-flight-slice 06-recipe-to-planner --checkpoint stage2-complete --reason "slice06 Stage 2 checkpoint" --output-dir .artifacts/meta-harness-auditor/slice06-stage2

pnpm omo:promotion:update -- --section pilot-lane --id authority-required-ui --status in_progress --checkpoint-ref stage2-complete --workpack-ref docs/workpacks/06-recipe-to-planner/README.md --note "slice06 Stage 2 complete; audit bundle: .artifacts/meta-harness-auditor/slice06-stage2/report.md"

pnpm omo:promotion:update -- --section promotion-gate --status not-ready --clear-blockers --blocker "authority-required-ui lane still in progress" --blocker "external-smoke lane evidence missing" --blocker "bugfix-patch lane evidence missing" --next-review-trigger "After slice06 Stage 4 checkpoint"
```

### 기대 결과

- `authority-required-ui` lane 상태는 계속 `in_progress`
- `stage2-complete` checkpoint가 ledger에 추가됨
- 감사 결과가 남고, 중간 drift가 있으면 Stage 4 전에 수정 가능

## Stage 4 Ready For Review

### 확인

- review/handoff 직전 상태가 closeout/bookkeeping 관점에서 깨지지 않았는지 본다.
- authority-required slice라면 authority evidence 경로를 notes에 남길 준비를 한다.
- manual handoff가 필요한 이유와 현재 품질을 notes에 간단히 남긴다.

### 실행

```bash
pnpm harness:audit -- --cadence-event slice-checkpoint --in-flight-slice 06-recipe-to-planner --checkpoint stage4-ready-for-review --reason "slice06 Stage 4 checkpoint" --output-dir .artifacts/meta-harness-auditor/slice06-stage4

pnpm omo:promotion:update -- --section pilot-lane --id authority-required-ui --status in_progress --checkpoint-ref stage4-ready-for-review --workpack-ref docs/workpacks/06-recipe-to-planner/README.md --note "slice06 Stage 4 ready; audit bundle: .artifacts/meta-harness-auditor/slice06-stage4/report.md"

pnpm omo:promotion:update -- --section promotion-gate --status not-ready --clear-blockers --blocker "authority-required-ui lane still in progress" --blocker "external-smoke lane evidence missing" --blocker "bugfix-patch lane evidence missing" --next-review-trigger "After slice06 Stage 6 closeout"
```

### 권장 추가 확인

- 필요 시 `pnpm validate:authority-evidence-presence`
- 필요 시 authority report 경로를 notes에 추가

## Stage 6 Closeout

### 확인

- closeout 관련 validator가 통과하는지 본다.
- slice06가 authority-required-ui lane 기준으로 “끝까지 운영해본 사례”가 됐는지 판단한다.
- 이 시점의 audit bundle이 최종 lane pass 근거가 된다.

### 실행

```bash
pnpm validate:closeout-sync
pnpm validate:omo-bookkeeping
pnpm validate:authority-evidence-presence
pnpm harness:audit -- --cadence-event slice-checkpoint --in-flight-slice 06-recipe-to-planner --checkpoint stage6-closeout --reason "slice06 Stage 6 checkpoint" --output-dir .artifacts/meta-harness-auditor/slice06-stage6

pnpm omo:promotion:update -- --section pilot-lane --id authority-required-ui --status pass --checkpoint-ref stage6-closeout --workpack-ref docs/workpacks/06-recipe-to-planner/README.md --note "slice06 authority-required pilot passed; audit bundle: .artifacts/meta-harness-auditor/slice06-stage6/report.md"

pnpm omo:promotion:update -- --section promotion-gate --status not-ready --clear-blockers --blocker "external-smoke lane evidence missing" --blocker "bugfix-patch lane evidence missing" --next-review-trigger "After one external-smoke pilot and one bugfix-patch pilot"
```

### lane를 `pass`로 올리기 전에 확인할 것

- Stage 2 / 4 / 6 checkpoint가 모두 ledger에 남았는지
- authority-required closeout evidence가 notes 또는 관련 artifact로 추적 가능한지
- manual handoff가 “기본 종료 경로”가 아니라 “해당 lane의 현재 운영 사실”로 설명 가능한지

## 다른 기기에서 진행 중일 때

- checkpoint audit는 그 slice를 실제로 돌리고 있는 기기에서 실행하는 것이 가장 좋다.
- 이유:
  - 그 기기만 로컬 runtime / artifact / handoff 메모를 가장 정확히 알고 있기 때문이다.
- 다른 기기에서 auditor를 나중에 돌리는 것도 가능하지만,
  - 그 경우는 `사후 감사`에 가깝다.
  - checkpoint별 drift 조기 발견에는 불리하다.

## 최소 운영 원칙

- slice06을 `H-OMO-001` 해제 근거로 쓰려면 checkpoint 3개를 권장한다.
- 정말 바쁘면 `stage4-ready-for-review`, `stage6-closeout` 최소 2개라도 남긴다.
- 하지만 `stage2-complete`까지 있어야 “초기 운영 품질” evidence가 생긴다.

## 완료 후 해석

slice06이 끝나면 닫히는 것은 `authority-required-ui` lane 하나다.
이것만으로 `H-OMO-001` 전체가 닫히지는 않는다.

추가로 남는 것:

- `external-smoke` lane 1건
- `bugfix-patch` lane 1건
- `manual-handoff-policy` pass
- `live-smoke-standard` pass
- `scheduler-standard` pass

즉 slice06은 핵심 canary이지만, OMO 승격의 전부는 아니다.
