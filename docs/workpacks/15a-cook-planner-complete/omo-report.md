# OMO Efficiency Report: 15a-cook-planner-complete

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | generated + post-merge backfilled |
| 최종 상태 | merged / dual_approved / passed |
| 최종 PR | PR #290 (`10935d4c11d2cf1e55ccbecc4f13a41f2d945059`) |
| 측정 구간 | 2026-04-29 16:07 ~ 2026-04-29 18:47 KST |
| 벽시계 총 시간 | 159.2분 |
| 순수 진행 누적시간 | 0.0분 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex/Claude 자동 수정 오류 | 4회 |
| post-merge stale | 0회 |
| evidence_source | .omx/artifacts, GitHub PR/CI, git history |

> 자동 생성된 보고서다. 순수 진행 누적시간은 OMO dispatch 산출물 기준으로 계산했고 human_escalation/CI/대기 시간은 제외했다. `.omx/artifacts`는 event/evidence source로 반영하되 markdown semantic parsing에는 의존하지 않는다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| .omx/artifacts | 12 | 1, 3, 4, 5, 6 |

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
| 1 | 1회 | 2026-04-29 16:28 | Stage 1 Repair 1 Complete | claude repair evidence: .omx/artifacts/claude-delegate-15a-cook-planner-complete-stage1-repair1-response-20260429T072838Z.md |
| 1 | 1회 | 2026-04-29 16:31 | Claude Delegate Summary: 15a Stage 1 Repair 1 | claude repair evidence: .omx/artifacts/claude-delegate-15a-cook-planner-complete-stage1-repair1-summary-20260429T073132Z.md |
| 4 | 1회 | 2026-04-29 17:46 | claude-delegate-15a-cook-planner-complete-stage4-repair-swipe-response-20260429T084624Z.md | claude repair evidence: .omx/artifacts/claude-delegate-15a-cook-planner-complete-stage4-repair-swipe-response-20260429T084624Z.md |
| 4 | 1회 | 2026-04-29 17:56 | claude-delegate-15a-cook-planner-complete-stage4-repair-conflict-response-20260429T085641Z.md | claude repair evidence: .omx/artifacts/claude-delegate-15a-cook-planner-complete-stage4-repair-conflict-response-20260429T085641Z.md |

## Efficiency Notes

- 순수 진행시간은 0.0분이다.
- 이번 slice는 Codex/Claude manual orchestration과 GitHub PR/CI evidence를 중심으로 진행되어 OMO dispatch 순수 진행시간이 0.0분으로 계산됐다.
- 최종 merge evidence는 PR #290, merge commit `10935d4c11d2cf1e55ccbecc4f13a41f2d945059`, PR #290 current-head checks green 기록이다.
- 가장 오래 걸린 stage는 1 docs이다.
- human_escalation은 0회 기록됐다.
- manual_decision_required는 0회 기록됐다.
- post-merge stale은 0회 기록됐다.
- human_escalation 외 Codex/Claude가 자동 수정한 오류는 4회 기록됐다.
