# OMO Efficiency Report: desktop-mypage-parity

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | generated |
| 최종 상태 | merged / codex_approved / passed |
| 최종 PR | #348 |
| 측정 구간 | 2026-05-08 01:51 ~ 2026-05-08 02:20 KST |
| 벽시계 총 시간 | 29.0분 |
| 순수 진행 누적시간 | 20.0분 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex/Claude 자동 수정 오류 | 1회 |
| post-merge stale | 0회 |
| evidence_source | .omx/artifacts |

> 자동 생성된 보고서다. 순수 진행 누적시간은 OMO dispatch 산출물 기준으로 계산했고 human_escalation/CI/대기 시간은 제외했다. `.omx/artifacts`는 event/evidence source로 반영하되 markdown semantic parsing에는 의존하지 않는다.

> Codex 보정: 이번 슬라이스는 Claude CLI delegation과 Codex 직접 검증/PR loop가 섞여 OMO dispatch stage duration이 자동 집계되지 않았다. 아래 Stage Time은 `.omx/artifacts`, 로컬 검증 로그, PR #347/#348 타임라인을 근거로 수동 보정했다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| .omx/artifacts | 3 | 1, 4 |
| GitHub PR/CI | 2 | 1, 6 |
| Codex local verification | 5 | 5, 6 |

## Stage Time

| Stage | 순수 진행시간 | 실행 횟수 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs | 7.0분 | 2 | passed |
| 2 backend | 0.0분 | 0 | - |
| 3 backend review | 0.0분 | 0 | - |
| 4 frontend | 5.0분 | 1 | passed |
| 5 design review | 2.0분 | 1 | passed |
| 6 closeout | 6.0분 | 5 | passed |
| **Total** | **20.0분** | **9** | passed |

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
| 1 | 1회 | 2026-05-08 01:58 | Stage 1 수리 완료: desktop-mypage-parity Design Status | claude repair evidence: .omx/artifacts/claude-delegate-desktop-mypage-parity-stage1-repair-design-status-response-20260507T165800Z.md |

## Efficiency Notes

- 순수 진행시간은 수동 보정 기준 20.0분이다.
- 가장 오래 걸린 stage는 1 docs이다.
- human_escalation은 0회 기록됐다.
- manual_decision_required는 0회 기록됐다.
- post-merge stale은 0회 기록됐다.
- human_escalation 외 Codex/Claude가 자동 수정한 오류는 1회 기록됐다.
