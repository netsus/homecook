# OMO Efficiency Report: recipe-visibility-read-hardening

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| 최종 상태 | merged / dual_approved / passed |
| 최종 PR | #1228 |
| 측정 구간 | 2026-07-23 09:28 ~ 2026-07-30 14:51 KST |
| 벽시계 총 시간 | 10482.8분 |
| 순수 진행 누적시간 | 182.4분 (PR/git 시각 기반 추정) |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex/Claude 자동 수정 오류 | 6회 |
| post-merge stale | 0회 |
| evidence_source | PR #1077/#1206/#1208/#1224/#1228, git history, canonical closeout, Stage 4–6 evidence |

> `omo:report --report-mode backfilled`로 생성한 뒤, 이 slice에는 OMO dispatch 산출물이 없으므로 공식 workflow-v2 지침에 따라 GitHub PR 시각과 git 이력으로 시간을 보정했다. 아래 순수 진행시간은 실제 집중 작업시간 측정값이 아니라 PR 창과 커밋 경계를 이용한 재현 가능한 추정치다. production/staging write와 Manual Only 운영 증거는 이 보고서 생성 과정에서 실행하지 않았다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| GitHub PR #1077 | 1 | 1 |
| GitHub PR #1206, #1208 | 2 | 2 |
| GitHub PR #1224 | 1 | 3 |
| GitHub PR #1228 | 1 | 4, 5, 6 |
| `49ea2be0`, `9a2154bd`, `06269ce4`, `39c7a36c`, merge `8085914c` | 5 | 4, 6 |
| `docs/workpacks/recipe-visibility-read-hardening/evidence/2026-07-30-stage4-6-closeout.md` | 3 | 4, 5, 6 |
| `.workflow-v2/work-items/recipe-visibility-read-hardening.json#closeout` | 1 | 6 |

## Stage Time

| Stage | 순수 진행시간 | 실행 횟수 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs | 13.7분 | 1 | PR #1077 merged |
| 2 backend | 67.2분 | 2 | PR #1206/#1208 merged; local-only closeout |
| 3 backend review | 23.6분 | 1 | PR #1224 independently approved and merged |
| 4 frontend | 49.1분 | 1 | TDD implementation and repair through `06269ce4` |
| 5 design review | 5.0분 | 1 | lightweight review approved; no visual change |
| 6 closeout | 23.8분 | 1 | exact-head review, durable projection, CI and merge |
| **Total** | **182.4분** | **7** | merged / dual_approved / passed |

## Human Escalations

| Stage | 발생 | 첫 발생 시점 | 직전 순수 진행 | 원인 | 해결 |
| --- | ---: | --- | ---: | --- | --- |
| - | 0회 | - | 0.0분 | 없음 | 자동 진행 |

## Manual Decision Required

| Stage | 발생 | 첫 발생 시점 | reason_code | 원인 |
| --- | ---: | --- | --- | --- |
| - | 0회 | - | - | Manual Only 경계는 미완료 증거로 유지했고 사용자 결정을 요청하지 않음 |

## Post-Merge Stale Events

| Stage | 발생 | 첫 발생 시점 | reason_code | 원인 |
| --- | ---: | --- | --- | --- |
| - | 0회 | - | - | 없음 |

## Codex/Claude-Resolved Non-Human Errors

| Stage | 발생 | 첫 발생 시점 | 원인 | 해결 |
| --- | ---: | --- | --- | --- |
| 4 | 3회 | 2026-07-30 | limited retry key, remove/retry stale completion, expired signed-read cancel race | RED 추가 후 same-intent replay와 owner-cancel 경계 수정 |
| 6 | 3회 | 2026-07-30 | closeout parser/scope projection, rebase 뒤 static gate, durable reviewer evidence 누락 | checklist 범위 정리, zero-mutation gate 갱신, reviewer evidence 파일 추가 |

## Efficiency Notes

- 순수 진행시간 추정은 182.4분이며 전체 벽시계 10482.8분 중 CI 대기와 단계 사이의 유휴 시간을 제외한 PR/git 경계 합산값이다.
- 가장 오래 걸린 stage 추정은 Stage 2의 67.2분이다.
- human_escalation은 0회 기록됐다.
- manual_decision_required는 0회 기록됐다.
- post-merge stale은 0회 기록됐다.
- human_escalation 없이 Codex가 자동 수정한 오류는 canonical closeout 기준 6회이며 Claude 수정은 0회다.
- `external_smokes=pending`은 production power/login/sleep, external heartbeat, activation과 irreversible legacy deletion이 Manual Only이기 때문이며 완료로 과장하지 않았다.
