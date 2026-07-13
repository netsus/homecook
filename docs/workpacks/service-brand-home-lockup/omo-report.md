# OMO Efficiency Report: service-brand-home-lockup

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| 최종 상태 | merged / dual_approved / passed |
| docs PR | #990 (`b54188f79db4ea632ebf8397ec145277a71fb59e`) |
| frontend PR | #991 (`30b9ac51d7e762bf82aea215515fecce006762a1`) |
| 측정 구간 | 2026-07-13 16:08 ~ 2026-07-13 19:22 KST |
| 벽시계 총 시간 | 193.9분 |
| 순수 진행 누적시간 | 201.6분 |
| Claude 진행시간 | 0.0분 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex 자동 수리 | 6회 |
| CI resync | 4회 |
| post-merge stale | 0회 |
| evidence_source | Codex session logs, GitHub PR/CI, git history, QA/authority evidence, canonical closeout |

> estimated backfilled 보고서다. `pnpm omo:report -- --work-item service-brand-home-lockup`를 먼저 실행했지만 OMO dispatch event가 없어 `report_mode=generated`, 순수 진행 누적시간 `0.0분`, evidence 0건으로 생성됐다. 실제 슬라이스는 역할이 분리된 Codex 앱 작업과 서브에이전트로 진행됐으므로, Codex session timestamp, PR #990/#991 metadata와 body, git commit history, GitHub current-head checks, QA/authority evidence, canonical closeout을 대조해 재구성했다. Claude는 사용하지 않았다.

## Measurement Basis

| 근거 | 사용 방식 |
| --- | --- |
| Codex session timestamp | docs owner, docs reviewer, Stage 4 구현/재시도, design authority, code review, CI visual 진단, final closeout review의 시작·종료 시각으로 actor별 직접 작업비용 계산 |
| GitHub PR timestamp | PR #990/#991 생성·merge 시각으로 stage 경계와 wall clock 보정 |
| git commit time | 구현, visual baseline, Ready metadata, authority metadata, base sync, closeout의 진행 순서 확인 |
| GitHub current-head checks | 구현 검증 head `066ee6c5`와 closeout head `69f55273`의 full-regression, Lighthouse, visual, accessibility, smoke 결과를 확인하고 CI 대기 구간 분리 |
| PR body / canonical closeout | 실제 검증 명령, 독립 Codex 승인, repair summary, Manual Only 잔여 범위 확인 |
| QA / authority evidence | exploratory QA 97/pass, visual verdict 98/pass, authority blocker 0과 390/320/1280 evidence 확인 |

> 이 수치는 초 단위 타임트래킹이 아니라 OMO 운영 효율 비교용 estimate다. 단순 CI/check watch 시간은 제외했고, 원인 분석·snapshot 수리·검증 재실행 같은 직접 작업은 포함했다. 병렬 Codex actor의 비용을 각각 보존하므로 순수 진행 누적시간은 wall clock보다 클 수 있다.

## Evidence Sources

| Source | 보존 증거 | Stages |
| --- | --- | --- |
| local Codex session logs | 역할 분리된 주요 session 8개와 timestamp | 1, 4, 5, 6 |
| GitHub PR #990 | created `2026-07-13T07:27:01Z`, merged `2026-07-13T07:30:42Z`, merge `b54188f7` | 1, internal 1.5 |
| GitHub PR #991 | created `2026-07-13T09:00:01Z`, merged `2026-07-13T10:21:58Z`, reviewed head `066ee6c5`, closeout head `69f55273`, merge `30b9ac51` | 4, 5, 6, 6.5 |
| QA evidence | `.artifacts/qa/service-brand-home-lockup/2026-07-13T07-51-24-163Z/`, eval 97/pass, findings 0 | 4, 5 |
| authority evidence | `ui/designs/authority/HOME-service-brand-home-lockup-authority.md`, 6 screenshots, geometry/accessibility audit, `visual-verdict.json` 98/pass | 4, 5 |
| canonical closeout | `.workflow-v2/work-items/service-brand-home-lockup.json#closeout`, `.workflow-v2/status.json`, workpack projection | 6, 6.5 |

Codex session logs는 시간 재구성의 보조 증거이고, merge와 verification 사실은 GitHub, git history, repo-local authority evidence, canonical closeout으로 교차 검증했다.

## Stage Time

| Stage | 순수 진행시간 | 실행/검토 단위 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs + internal 1.5 | 17.5분 | Codex docs owner 1 + 독립 Codex docs reviewer 1 | 공식 문서 v1.7.13/v1.5.20과 workpack 잠금, PR #990 merge |
| 4 frontend / TDD | 93.0분 | Codex implementation 1 + 역할 분리 retry 1 | HOME mobile/desktop 세로 lockup, non-HOME 경계, component/E2E/visual 자동화 구현 |
| 4 QA / visual repair | 38.3분 | 오케스트레이터 repair + 독립 Codex CI visual 진단 1 | Darwin/Linux baseline과 sticky/fixed 촬영 안정화, 허용치 완화 없이 green |
| 5 design / final authority | 5.3분 | 독립 Codex final authority 1 | APPROVE, visual 98/pass, blocker/major/minor 0/0/0 |
| 6 independent review / closeout | 45.5분 | 독립 Codex code review/재검토 1 + final closeout review 1 + projection sync | code re-review APPROVE, closeout review APPROVE, actionable finding 0 |
| 6.5 merge gate | 2.0분 | current-head 집계, PR body 동기화, merge | closeout head 전체 started check green 후 PR #991 merge |
| **Total** | **201.6분** | **8개 주요 Codex session + 오케스트레이터 repair/merge gate** | Claude 0.0분 |

Stage 2/3은 API/DB 변경이 없는 FE-only slice라 생략했다.

## Timeline Reconstruction

| 구간 | 시각(KST) | 산정 |
| --- | --- | ---: |
| Stage 1 Codex docs owner | 16:08 → 16:20 | 12.4분 |
| internal 1.5 독립 Codex docs review | 16:20 → 16:26 | 5.1분 |
| Stage 4 Codex frontend implementation | 16:31 → 17:30 | 58.2분 |
| Stage 4 역할 분리 retry | 16:37 → 17:12, implementation과 overlap | 34.8분 |
| 독립 Codex final authority | 17:12 → 17:18 | 5.3분 |
| 독립 Codex code review / 재검토 | 17:13 → 17:48, Stage 4와 일부 overlap | 35.0분 |
| visual baseline / Linux-Darwin evidence repair | 17:48 → 18:41, check watch 제외 | 25.0분 |
| 독립 Codex CI visual diagnosis | 18:06 → 18:19, repair와 overlap | 13.3분 |
| implementation head Ready full-regression | 18:42 → 18:58 | 0.0분 (CI 대기 제외) |
| base sync / canonical closeout / final closeout review | 18:58 → 19:06 | 10.5분 |
| closeout head Ready full-regression | 19:04 → 19:20 | 0.0분 (CI 대기 제외) |
| final policy / merge gate | 19:20 → 19:22 | 2.0분 |

Stage 4 implementation/retry와 Stage 4/5/6 reviewer가 병렬로 진행되어 actor 합계에는 overlap이 있다. 반대로 두 번의 Ready full-regression, Lighthouse, smoke, 단순 PR watch는 순수 진행시간에서 제외했다.

## Human Escalations

| Stage | 발생 | 원인 | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | 없음 | 역할 분리된 Codex 세션과 bounded repair로 종료 |

## Manual Decision Required

| Stage | 발생 | reason_code | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | - | 없음 |

`manual_handoff=true`는 high-risk anchor-extension의 정책상 merge authority를 오케스트레이터에 남긴 것을 뜻하며, 작업 중 새 제품 결정이나 사람 escalation이 발생했다는 뜻은 아니다.

## Codex-Resolved Non-Human Errors

| Stage | 발생 | 원인 | 해결 |
| --- | ---: | --- | --- |
| 4 | 1회 | full-page screenshot에서 sticky/fixed UI 좌표가 캡처 중 변동 | 촬영 중에만 문서 좌표로 고정하고 동일 검사를 3회 통과, 허용치·skip 유지 |
| 4 | 2회 | desktop HOME sort/default Linux snapshot이 신규 lockup을 반영하지 못함 | GitHub x86_64 artifact를 3회 byte-identical 확인 후 기준선 갱신 |
| 6 | 2회 | Ready lifecycle과 authority evidence metadata가 validator 계약과 불일치 | roadmap/PR QA 경로/automation-spec authority 목록을 canonical 형식으로 동기화 |
| 6 | 1회 | merge 직전 master에 nutrition contract가 들어와 공유 roadmap 충돌 | HOME `merged` 행과 nutrition 7개 행·dependency chain을 모두 보존해 base sync |

Claude repair count와 Claude 진행시간은 모두 0이다. canonical closeout은 `codex_repairable_count=6`, `ci_resync_count=4`, `manual_patch_count=1`을 기록한다.

## Merge Gate Evidence

| Gate | Evidence |
| --- | --- |
| Stage 1 docs | PR #990 merged as `b54188f79db4ea632ebf8397ec145277a71fb59e`; independent Codex docs review 통과 |
| Stage 4 frontend | PR #991 body: product 107 files / 1,406 tests, targeted 3 files / 51 tests, related Playwright 20 pass / 4 expected skip |
| Stage 5 authority | `HOME-service-brand-home-lockup-authority.md`: APPROVE, visual 98/pass, contrast 10.05:1, desktop first-tab delta 0px, blocker/major/minor 0/0/0 |
| Reviewed implementation head | `066ee6c5105586dd2233cb9536713c85964f0257`: QA run `29240116832`의 full-regression, Lighthouse, visual, accessibility, smoke green |
| Stage 6 | independent Codex code re-review APPROVE, actionable finding 0 |
| Final closeout review | independent Codex APPROVE, blocker/major/minor 0/0/0; roadmap HOME/nutrition 행 보존과 false green 없음 확인 |
| Closeout head | `69f55273d35ce25d715301420563095a8cb86887`: full-regression 16m2s, Lighthouse 2m32s, visual 2m28s, accessibility 3m3s, smoke 4m22s 포함 모든 started check success 또는 의도된 path-filter skip |
| Merge | PR #991 merged at `2026-07-13T10:21:58Z` as `30b9ac51d7e762bf82aea215515fecce006762a1` |

## Verification Snapshot

| 검증 | 보존 결과 |
| --- | --- |
| targeted Vitest | 3 files / 51 tests passed |
| `pnpm test:product` | 107 files / 1,406 tests passed |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | passed |
| related Playwright | 20 passed / 4 expected skipped |
| sequential smoke | 58 passed / 8 expected skipped |
| accessibility | 8 passed / 1 skipped |
| Darwin visual | web 4/4, app 8/8 passed |
| Linux visual | app 8/8 passed; GitHub full visual green |
| exploratory QA | score 97/pass, findings 0 |
| source/workflow validators | source-of-truth, workpack, automation-spec, workflow-v2, closeout, authority, exploratory QA, real smoke passed |
| reviewed head checks | full-regression 포함 all green at `066ee6c5` |
| closeout head checks | pending/fail 0, all green at `69f55273` |

## Efficiency Notes

- 순수 진행 누적시간은 `201.6분`으로 추정된다. Codex가 직접 수행한 계약 문서, 구현, 역할 분리 리뷰, 시각 기준 갱신, 검증, closeout 비용을 포함한다.
- 가장 큰 비용은 Stage 4 frontend/TDD `93.0분`과 QA/visual repair `38.3분`이다. DOM/CSS 자체보다 390/320/1280 authority evidence와 Darwin/Linux visual 안정화가 시간을 사용했다.
- HOME만 optional supporting label을 전달하는 최소 변경으로 범위를 좁혀 API, DB, dependency, asset, non-HOME 표기를 건드리지 않았다.
- 두 차례 Ready full-regression 약 32분과 단순 check watch는 순수 진행시간에 넣지 않았다. 실패 원인 분석과 기준선 수리는 포함했다.
- human_escalation, manual_decision_required, post-merge stale은 모두 0회다. Claude 진행시간과 Claude repair도 0이다.
- Manual Only는 배포 preview의 실제 시스템 font/browser zoom 200%와 사용자의 최종 브랜드 인상 확인이다. 이 보고서 PR은 docs-only 기록이며 runtime 영향이 없다.
