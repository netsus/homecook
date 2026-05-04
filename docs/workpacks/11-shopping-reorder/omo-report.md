# OMO Efficiency Report: 11-shopping-reorder

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| 최종 상태 | merged / dual_approved / passed |
| 최종 PR | #236 |
| 측정 구간 | 2026-04-27 17:25 ~ 2026-04-27 22:55 KST |
| 벽시계 총 시간 | 329.6분 |
| 순수 진행 누적시간 | 0.0분 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex/Claude 자동 수정 오류 | 3회 |
| post-merge stale | 0회 |
| evidence_source | .omx/artifacts, GitHub PR/CI, git history |

> 자동 생성된 보고서다. 순수 진행 누적시간은 OMO dispatch 산출물 기준으로 계산했고 human_escalation/CI/대기 시간은 제외했다. `.omx/artifacts`는 event/evidence source로 반영하되 markdown semantic parsing에는 의존하지 않는다.
> 2026-05-04 bookkeeping repair에서 stale 최종 상태와 PR 표기를 복구했다. PR #236은 2026-04-27T10:35:23Z에 merge됐고, 이 report의 0.0분 시간 측정 한계는 dispatch 산출물 부재 때문에 그대로 남긴다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| .omx/artifacts | 8 | 1, 3, 4, 5, 6 |
| GitHub PR/CI | PR #234 backend, PR #236 frontend | 2, 4, 6 |
| git history | `dcb301e`, `accf8ef` merge commits | 2, 4 |

## Stage Time

| Stage | 순수 진행시간 | 실행 횟수 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs | 0.0분 | 0 | - |
| 2 backend | 0.0분 | 0 | - |
| 3 backend review | 0.0분 | 0 | - |
| 4 frontend | 0.0분 | 0 | - |
| 5 design review | 0.0분 | 0 | - |
| 6 closeout | 0.0분 | 0 | - |
| **Total** | **0.0분** | **0** | - |

## Human Escalations

| Stage | 발생 | 첫 발생 시점 | 직전 순수 진행 | 원인 | 해결 |
| --- | ---: | --- | ---: | --- | --- |
| - | 0회 | - | 0.0분 | 없음 | - |

## Manual Decision Required

| Stage | 발생 | 첫 발생 시점 | reason_code | 원인 |
| --- | ---: | --- | --- | --- |
| - | 0회 | - | - | 없음 |

## Post-Merge Stale Events

| Stage | 발생 | 첫 발생 시점 | reason_code | 원인 |
| --- | ---: | --- | --- | --- |
| - | 0회 | - | - | 없음 |

## Codex/Claude-Resolved Non-Human Errors

| Stage | 발생 | 첫 발생 시점 | 원인 | 해결 |
| --- | ---: | --- | --- | --- |
| 1 | 1회 | 2026-04-27 17:35 | Stage 1 Repair 완료: 11-shopping-reorder | claude repair evidence: .omx/artifacts/claude-delegate-11-shopping-reorder-stage1-repair-response-20260427T173506KST.md |
| 4 | 1회 | 2026-04-27 18:49 | Stage 4 Repair Report: `11-shopping-reorder` | claude repair evidence: .omx/artifacts/claude-delegate-11-shopping-reorder-stage4-repair-response-20260427T184948KST.md |
| 4 | 1회 | 2026-04-27 18:55 | Stage 4 Repair Round 2 Report: `11-shopping-reorder` | claude repair evidence: .omx/artifacts/claude-delegate-11-shopping-reorder-stage4-repair2-response-20260427T185519KST.md |

## Efficiency Notes

- 순수 진행시간은 0.0분이다.
- 가장 오래 걸린 stage는 1 docs이다.
- human_escalation은 0회 기록됐다.
- manual_decision_required는 0회 기록됐다.
- post-merge stale은 0회 기록됐다.
- human_escalation 외 Codex/Claude가 자동 수정한 오류는 3회 기록됐다.
