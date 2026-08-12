# OMO Efficiency Report: 33-youtube-i031-direct-extraction

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| 최종 상태 | merged / dual_approved / passed |
| 최종 PR | #1341 |
| merge commit | `39c29f3fe66936fc1cfd02bbe204a77da5d13d52` |
| 측정 구간 | 2026-07-26 05:26 ~ 07:39 KST, 2026-08-12 17:53 ~ 19:23 KST |
| active delivery window 합계 | 222.3분 |
| 순수 진행 누적시간 추정 | 196.0분 |
| CI/check 대기·stage overlap 제외 추정 | 26.3분 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| post-merge stale | 0회 |

> estimated backfilled 보고서다. 이 slice는 OMO dispatch 산출물이 없어 자동 report가 `0.0분`으로 생성됐다. 아래 값은 PR timestamp, git commit history, GitHub current-head checks, source PR body, workpack evidence를 사용한 운영 효율 비교용 estimate다. 장기 휴지 기간과 단순 CI/watch 시간은 제외했고, stage가 겹친 구간은 중복 계산하지 않았다.

## Measurement Basis

- Stage 1/2/3은 PR #1107과 #1110의 생성·commit·merge timestamp를 기준으로 복원했다.
- Stage 4/6은 PR #1341의 생성 시각, 구현·evidence·reviewer commit, Ready 전환 후 check run, merge 시각을 사용했다.
- PR #1110의 arbitrary-public-URL 실행은 retained real smoke다. Stage 6 reviewer가 새 provider run을 수행한 것으로 계산하지 않았다.
- Stage 5는 `low-risk`이고 authority가 `not_required`이므로 별도 authority actor 시간 대신 기존 화면 screenshot 검토 시간만 반영했다.
- `Manual Only` 3건은 수행시간과 완료 범위에서 제외했다.

## Evidence Sources

| Source | 사용 근거 |
| --- | --- |
| PR #1107 | Stage 1 contract docs, 2026-07-26 05:26~05:37 KST |
| PR #1110 | Stage 2 implementation, portable gates, retained real smoke, 07:20~07:39 KST |
| PR #1341 | Stage 4 UI reliability repairs, Stage 6 review, final-head checks, 2026-08-12 17:53~19:23 KST |
| git history | `2cdb9033`, `516005ea`, `44d7e297`, `db0b838a`, `020bfbb5`, `277f2161`, `dbcf48f2`, `2e199fbb`, `d33a085a` |
| workpack evidence | Stage 4/6 closeout report, nine screenshots, independent Stage 6 report |
| GitHub checks | reviewed Ready head full regression/Lighthouse success; final head 23 success + 1 justified docs-only skip |

## Stage Time

| Stage | 순수 진행시간 추정 | 실행 단위 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs | 15.0분 | 1 PR | contract-evolution docs와 internal doc gate merge |
| 2 backend | 95.0분 | 1 PR | exact i031 service path, guards, tests, retained live smoke |
| 3 backend review | 8.0분 | 1 merge gate | portable gate repair와 current-head merge 확인 |
| 4 frontend | 33.0분 | 2 commits | duplicate submit, retry, 320px repair와 browser evidence |
| 5 design review | 7.0분 | 1 low-risk review | 기존 YT_IMPORT 1280/390/320 screenshot 회귀 확인 |
| 6 independent closeout | 22.0분 | 1 reviewer task | exact-head code/test/docs/provenance 검토, Findings 0 |
| 6.5 final projection / policy repair | 16.0분 | 2 closeout commits | canonical projection, structured QA/real-smoke body, clean head 재생성 |
| **Total** | **196.0분** | **8 units** | PASS |

## Timeline Reconstruction

| 구간 | 근거 | active estimate |
| --- | --- | ---: |
| 2026-07-26 05:26~05:37 KST | PR #1107 create/commit/merge | 15.0분 |
| 2026-07-26 05:37~07:26 KST | docs merge 뒤 PR #1110 implementation commit까지 | 95.0분 |
| 2026-07-26 07:26~07:39 KST | PR #1110 evidence/portable gate/merge | 8.0분 |
| 2026-08-12 17:53~18:26 KST | PR #1341 author repair와 closeout evidence commits | 33.0분 |
| 2026-08-12 18:26~18:43 KST | independent code/provenance/visual review, 일부 병렬 | 22.0분 |
| 2026-08-12 18:43~19:15 KST | Ready checks와 final projection/policy repair, CI wait 제외 | 16.0분 |
| 2026-08-12 19:15~19:23 KST | clean final-head check/merge watch | 0.0분 active; watch 제외 |

> July와 August 사이 장기 휴지 기간은 active delivery window에서 제외했다. Stage 2와 Stage 3, Stage 5와 Stage 6의 일부 검토가 겹쳐 합계에서 중복 시간을 제거했다.

## Merge Gate Evidence

- reviewed product/evidence head: `dbcf48f2c0fdaed8326fd7653962e19e9d2ccc17`
- final closeout head: `d33a085aaad4b3058881c52d3846114c68c491ed`
- final-head check runs: 23 success, 1 justified docs-only `full-regression` skip, pending/fail/cancel 0
- Ready reviewed-content head에서 `full-regression`과 `lighthouse`가 success였다.
- final-head skip은 마지막 변경이 reviewer evidence/docs-only였기 때문이며 제품 코드는 reviewed Ready head 이후 바뀌지 않았다.
- independent reviewer task: `019ff552-b732-7aa0-80a2-8833acd9c23e`; Verdict PASS, Findings 0
- merge: PR #1341, squash `39c29f3fe66936fc1cfd02bbe204a77da5d13d52`

## Verification Snapshot

| 검증 | 결과 |
| --- | --- |
| related Vitest | 3 files / 116 passed |
| focused Playwright | 7 passed / 2 intentional project-matrix skips |
| responsive evidence | desktop 1280, mobile 390, mobile 320 loading/error/retry/review |
| console/page/unexpected HTTP errors | 0 |
| retained real smoke | PR #1110 public single-recipe URL 3 successes, 36 frames, 8 selected, 2 model calls, temp directories 0 |
| validators | source-of-truth, workflow-v2, workpack, automation-spec, closeout-sync, OMO bookkeeping passed |

## Codex-Resolved Non-Human Errors

| 구간 | 원인 | 해결 |
| --- | --- | --- |
| Stage 4 | React state commit 전 click/Enter가 겹칠 수 있음 | synchronous in-flight ref와 request-count regression test |
| Stage 4 | retry가 같은 extraction effect를 재호출하지 않음 | attempt token과 정확히 2회 요청하는 Playwright test |
| Stage 4 | 320px progress label 줄바꿈 | progress label에만 좁은 nowrap/padding 보정 |
| Stage 6.5 | Ready policy가 final closeout projection 누락을 탐지 | canonical `merged / dual_approved / passed` projection 동기화 |
| Stage 6.5 | PR body에 structured QA/real-smoke label 누락 | skip rationale와 retained PR #1110 provenance를 분리 기록하고 clean successor head 생성 |

## Remaining Manual Only

- [ ] 사용자가 localhost에서 자신의 임의 공개 YouTube 레시피 URL 결과를 최종 확인한다.
- [ ] Holdout promotion과 preview/production i031 enablement를 별도 승인한다.
- [ ] Vercel 외 production macOS worker 설치와 운영 secret을 별도 승인한다.

이 보고서와 PR #1341 merge는 위 항목을 완료하거나 production enablement를 승인하지 않는다.

## Efficiency Notes

- 순수 진행시간은 약 196.0분으로 추정된다. 초 단위 타임트래킹이 아니라 slice 간 운영 비교용 estimate다.
- active delivery window 222.3분과의 차이 26.3분은 CI/check 대기, 단순 watch, stage overlap 보정이다.
- 가장 긴 구간은 Stage 2 backend 약 95.0분이며 exact runtime/service 경계, portable gates, retained live smoke를 함께 닫았다.
- Stage 6.5에서 policy failure를 허용한 채 merge하지 않고 새 successor head를 만들어 fail/cancel 0 조건을 회복했다.
- 다음 async contract 작업은 이 post-merge report가 master에 merge된 뒤 Stage 1 contract-evolution 문서 게이트부터 시작할 수 있다. Manual Only production 승인을 우회할 수는 없다.
