# Codex-Orchestrated OMO Rail

## Status

- 상태: `draft`
- 변경 유형: `docs-governance`
- 범위: OMO supervisor reset Phase 0 / Codex orchestration 전환 기준
- 이 문서는 OMO를 폐기하지 않고, Codex가 판단/복구/실행 오케스트레이션을 맡는 운영 모델을 먼저 고정한다.

## Decision

Homecook OMO의 다음 기본 운영 모델은 `Codex-orchestrated OMO rail`이다.

- Codex는 slice 진행의 orchestration owner다.
- OMO는 상태 저장, stage 전이, deterministic validator, current-head gate, closeout/report projection을 맡는 rail이다.
- Claude는 Stage 1/3/4, authority-required final gate, 독립 review가 필요한 lane의 specialized actor로 남는다.
- 기존 `pnpm omo:*` entrypoint 이름은 유지한다.
- stage actor ownership과 orchestration ownership은 분리해서 설명한다. 즉 Stage 1/3/4가 Claude-owned일 수 있어도, 전체 진행 판단과 repair routing은 Codex가 맡는다.

이 결정은 새 거대 supervisor를 추가한다는 뜻이 아니다. semantic 판단과 복구 판단은 Codex/Claude stage artifact에 남기고, OMO는 그 결과를 검증 가능한 상태와 report로 투영한다.

## Baseline Evidence

최근 slice report는 10a 이전 모델과 10b 이후 Codex-orchestrated 운영의 차이를 보여준다.

| Slice | Evidence source | 순수 진행시간 | human_escalation | 자동 수정 오류 | stale escalation |
| --- | --- | ---: | ---: | ---: | ---: |
| `10a-shopping-detail-interact` | `.artifacts/omo-lite-dispatch` 중심 | 75.9분 | 5회 | 10회 | 3회 |
| `10b-shopping-share-text` | `.omx/artifacts` + PR timestamp backfill | 52.4분 | 0회 | 4회 | 0회 |
| `11-shopping-reorder` | `.omx/artifacts` + PR timestamp backfill | 111.6분 | 0회 | 7회 | 0회 |
| `12a-shopping-complete` | `.omx/artifacts` + PR timestamp backfill | 116.7분 | 0회 | 6회 | 0회 |

해석:

- 핵심 개선 신호는 "작업 시간이 항상 짧아졌다"가 아니라, 자동 repair가 evidence로 남고 사람 escalation이 실제 사람 결정으로 좁아졌다는 점이다.
- 10b/11/12a는 OMO dispatch JSON이 없어도 Codex/Claude repair loop evidence가 `.omx/artifacts`에 남았기 때문에 report가 이를 읽을 수 있어야 한다.
- 10a의 stale escalation은 이후 전환에서 `codex_repairable`, `ci_wait`, `manual_decision_required`로 재분류해야 할 대표 baseline이다.

## Responsibility Boundary

### Codex

- 현재 blocker 판단
- OMO failure와 product failure 분류
- Codex-repairable drift의 bounded repair
- PR body/check/closeout sync 확인
- human escalation 전 마지막 자동 복구 시도
- report/backfill evidence가 빠졌는지 확인

### OMO

- work item/stage 상태 저장
- scheduler/tick/retry 관리
- deterministic validators 실행
- GitHub current-head check 수집
- closeout canonical snapshot과 projection 관리
- artifact/event/report 생성

### Claude

- Stage 1 docs authoring
- Stage 3 backend review
- Stage 4 implementation 또는 authority-required lane
- Codex repair에 대해 독립 review가 필요한 경우의 reviewer

## Reason Code Taxonomy

`human_escalation`은 catch-all reason이 아니다. runtime/report는 가능한 한 아래 reason code를 먼저 사용한다.

| Reason code | 의미 | 기본 처리 |
| --- | --- | --- |
| `codex_repairable` | repo-local reversible edit와 validator 재실행으로 복구 가능한 OMO/report/closeout/PR body drift | Codex bounded repair 1회 이상 시도 후 recheck |
| `claude_repairable` | Claude-owned stage artifact, authority evidence, reviewer 판단 누락처럼 해당 lane actor가 고쳐야 하는 drift | Claude owner lane으로 bounded repair dispatch 후 recheck |
| `product_defect` | slice 제품 구현/계약 버그 | 담당 stage로 route back. OMO incident와 섞지 않음 |
| `omo_defect` | supervisor/runtime/report/validator 자체 결함 | incident registry에 남기고 tooling/docs-governance PR로 분리 |
| `ci_wait` | current head check pending/rerun/stale snapshot 등 기다릴 수 있는 CI 상태 | scheduled resume 또는 current-head refresh |
| `blocked_on_external` | provider unavailable, GitHub/network/auth 환경 문제처럼 agent가 즉시 고칠 수 없는 외부 조건 | retry timer와 operator-visible blocker 기록 |
| `manual_decision_required` | destructive, credential, external production, public contract change, scope-changing, ambiguous authority decision | human escalation 허용 |

## Escalation Rule

`human_escalation`은 아래 경우에만 생성한다.

1. reason code가 `manual_decision_required`인 경우
2. bounded repair budget을 소진했고 같은 finding이 validator recheck에서 남은 경우
3. required credential, external production authority, destructive operation 권한이 필요한 경우
4. 공식 product contract 변경이 필요하지만 사용자 승인 또는 contract-evolution PR이 없는 경우
5. source가 모호해 Codex/Claude가 안전하게 판단하면 안 되는 경우

`codex_repairable`, `claude_repairable`, `ci_wait`, `blocked_on_external`은 바로 `human_escalation`으로 올리지 않는다. 먼저 repair attempt, scheduled retry, current-head refresh, 또는 owner-lane recheck 중 하나를 남겨야 한다.

## Event Shape

Phase 1 report adapter와 Phase 2 runtime classification은 아래 최소 event shape를 공유한다.

```json
{
  "work_item_id": "10b-shopping-share-text",
  "stage": 4,
  "subphase": "frontend_repair",
  "actor": "codex",
  "source": ".omx/artifacts",
  "kind": "repair_attempt",
  "reason_code": "codex_repairable",
  "started_at": "2026-04-27T08:06:00Z",
  "ended_at": "2026-04-27T08:12:00Z",
  "outcome": "resolved",
  "evidence_refs": [".omx/artifacts/...md"],
  "changed_files": [],
  "verification_refs": ["pnpm verify:frontend"]
}
```

초기 adapter는 markdown 본문 전체를 해석하지 않는다. 파일명, timestamp, heading, known review artifact path, PR metadata처럼 안정적인 표면만 event로 정규화한다.

## Report Evidence Sources

Report generator는 source를 아래처럼 구분한다.

- `dispatch`: `.artifacts/omo-lite-dispatch/**`
- `supervisor`: `.artifacts/omo-supervisor/**`
- `.omx/artifacts`: Claude/Codex delegation, repair, review artifact
- `manual/backfill`: 사람이 작성한 report 또는 PR timestamp 기반 재구성

Report는 새 truth surface가 아니다. canonical closeout과 runtime/event artifact를 사람이 읽기 좋게 투영한 결과다.

## Delivery Slices

전환은 한 PR에 몰지 않는다.

1. Docs/Taxonomy PR
   - 이 문서, reset plan, governance map, closeout/report semantics, 10a/10b/11/12a baseline report를 잠근다.
2. Report Adapter PR
   - `omo-report`가 `.omx/artifacts` evidence를 source adapter로 읽게 한다.
3. Runtime Classification PR
   - wait reason과 `human_escalation` semantics를 reason code 기반으로 세분화한다.
4. Repair Dispatcher PR
   - allowed files, failing validator, max attempts를 입력으로 받는 bounded Codex repair lane을 붙인다.
5. Replay/Promotion PR
   - 10a는 escalation-heavy baseline, 10b/11/12a는 Codex-repair baseline으로 replay corpus에 등록한다.

## No-Go Gates

- `.omx/artifacts` adapter가 markdown semantic parsing에 의존하기 시작하면 중단한다.
- repair dispatcher가 allowed files 없이 임의 수정하게 되면 중단한다.
- `human_escalation` 감소 대신 silent failure가 늘면 rollout을 멈춘다.
- OMO maintainer spec이 product stage actor 기본 읽기 경로에 다시 들어오면 governance phase로 되돌린다.
- public contract 변경, credential, external production, destructive operation은 Codex repair lane에서 제외한다.

## Acceptance Criteria

- `human_escalation`은 manual decision required reason에서만 생성된다.
- Codex-repairable OMO failure는 최소 1회 Codex repair attempt 후에만 escalation 가능하다.
- `omo-report`는 dispatch JSON이 없는 10b/11/12a형 evidence도 누락하지 않는다.
- report에는 evidence source가 `dispatch`, `supervisor`, `.omx/artifacts`, `manual/backfill` 중 하나 이상으로 표시된다.
- canonical closeout 또는 equivalent projection에 repair summary가 남는다.
- replay corpus에서 10a는 escalation-heavy baseline, 10b/11/12a는 Codex-repair baseline으로 구분된다.
