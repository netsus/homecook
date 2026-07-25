# OMO Efficiency Report: prepared-food-search-relevance

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| 최종 상태 | merged / dual_approved / required checks passed |
| external smokes | read-only subset passed; original apply provenance pending Manual Only |
| 최종 product PR | #1105 |
| 후속 contract consistency PR | #1108 |
| 측정 구간 | 2026-07-23 07:36 KST 시작, 2026-07-26 closeout session까지의 분리된 작업 구간 |
| 달력상 총 구간 | closeout 진행 중이어서 고정 합계로 사용하지 않음 |
| 순수 진행 누적시간 | trace 부재로 복원 불가 |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex 자동 수정 오류 | 8회 |
| post-merge stale | 3회 |
| evidence_source | GitHub PR/CI, git history, retained workpack evidence, canonical closeout |

> backfilled 보고서다. 이 slice는 OMO dispatch runner가 아니라 역할이 분리된 Codex 세션으로 진행되어 자동 보고서의 `0.0분`을 그대로 사용하지 않았다. PR #1074/#1097/#1099/#1100/#1101/#1103/#1104/#1105/#1108 시각, git history, current-head checks, retained frontend evidence와 production read-only smoke로 사건 순서만 복원했다. active time은 trace 부재로 복원하지 않는다.

## Measurement Basis

| 근거 | 사용 방식 |
| --- | --- |
| GitHub PR #1074 | Stage 1 docs author, internal 1.5 review, merge 구간 확인 |
| GitHub PR #1097/#1099/#1100/#1101 | backend TDD, incremental checkpoint, index, ranked typed-union 구현 구간 확인 |
| GitHub PR #1103/#1104 | merged-exact remote verifier와 production transaction-read-only smoke 확인 |
| GitHub PR #1105 | Stage 4 TDD, independent review repairs, Stage 6 current-head merge 확인 |
| GitHub PR #1108 | official tuple/query-empty contract consistency repair와 독립 리뷰/current-head merge 확인 |
| git history | exact heads와 merge ancestry 확인 |
| retained workpack evidence | PostgreSQL/performance/security 및 frontend 320/390/1280, IME, stale-generation 결과 확인 |
| retained closeout evidence | GitHub merge metadata, production read-only record, independent review와 current-head check snapshot 확인 |
| canonical work-item closeout | 최종 status, approval, verification, recovery projection 확인 |

> PR/merge 시각은 사건 순서 확인용 calendar window다. 독립 review, 테스트, CI 대기와 구현이 겹치므로 active-time 효율 수치로 환산하지 않는다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| GitHub PR/CI | 9 PRs + latest current-head check sets | 1~6 |
| git history | docs/backend/verifier/frontend/contract-repair commits와 9 merge commits | 1~6 |
| backend/release evidence | 287,041-row quality/performance, existing/fresh/replay, production read-only smoke | 2, 3, 6 |
| Stage 4 frontend evidence | 1 retained report, focused unit/E2E, 320/390/1280 viewports | 4~6 |
| workpack / workflow-v2 closeout | canonical state + roadmap/README/acceptance projections | 6 |

## Stage Time

| Stage | 순수 진행시간 | 실행/repair 횟수 | 결과 |
| --- | ---: | ---: | --- |
| 1 docs + internal 1.5 | 복원 불가 | 2 | PR #1074 merged; five core artifacts와 exact plan lock 승인 |
| 2 backend/data TDD | 복원 불가 | 4 | normalizer, indexes, ranked RPC/route, cursor, 287,041-row gates 구현 |
| 3 security/performance/five-axis | 복원 불가 | 3 | ACL, replay, performance, production release gate P0-P3 0 |
| production remote verification | 복원 불가 | 2 | merged post-apply transaction-read-only state 확인 |
| 4 frontend TDD + deterministic QA | 복원 불가 | 3 | debounce, Korean IME, stale generation, legacy compatibility, HOME exclusion |
| 5 independent frontend review | 복원 불가 | 3 | quality/security/test review와 3개 bounded repair, P0-P3 0 |
| 6 readiness / current-head merge | 복원 불가 | 3 | policy/body repair 후 latest checks green/normal skip, PR #1105 merge |
| post-merge closeout | 복원 불가 | 3 | canonical projection, retained evidence와 report 일관성 복구 |
| official contract consistency repair | 복원 불가 | 1 | requirements/DB/API exact tuple과 query-empty authority 재정렬, PR #1108 merge |
| **Total** | **복원 불가** | **24** | - |

## Timeline Reconstruction

| 구간 | 시각(KST) | 산정 |
| --- | --- | ---: |
| Stage 1 docs author/review/merge | 07-23 07:36 → 07:57 | GitHub PR/merge calendar window |
| Stage 2/3 backend incremental delivery | 07-25 20:03 → 07-26 01:38 | interleaved PR calendar window; active time 복원 불가 |
| production verifier/release smoke | 07-26 02:11 → 02:45 | verifier PR calendar window; original apply log 미보존 |
| Stage 4/5 frontend implementation/review | 07-26 03:27 이전 구현 구간 → 04:11 | 시작 시각과 active time 복원 불가 |
| Stage 6 readiness/current-head merge | 07-26 04:11 → 04:16 | PR event window; CI wait 포함 여부 분리 불가 |
| post-merge projection/report | 07-26 04:16 이후 closeout session | 진행 중 backfill; 고정 duration 미사용 |
| official contract consistency repair | 07-26 05:22 → 06:12 | 독립 review/CI 대기 포함 calendar window; active time 복원 불가 |

## Codex-Resolved Non-Human Errors

| Stage | 발생 | 원인 | 해결 |
| --- | ---: | --- | --- |
| 4/5 | 1회 | composition end 뒤 같은 최종 change가 중복 요청을 만들 수 있음 | React value tracker RED를 추가하고 composition-end query ref로 단일 요청 보장 |
| 4/5 | 1회 | query/source 변경 뒤 edit-return restore ID가 남아 pagination을 추적할 수 있음 | parameterized RED 후 새 intent에서 restore ref 초기화 |
| 4/5 | 1회 | create/edit return context가 sessionStorage에 남을 수 있음 | security RED 후 query/source intent에서 저장 context 제거 |
| 6 | 1회 | Design Status의 자유형 `N/A`가 closeout parser checkbox 형식과 불일치 | behavior-only 근거를 유지한 `[x] N/A` 형식으로 정렬 |
| 6 | 1회 | PR Actual Verification이 이미 완료된 #1104 production smoke를 식별하지 못함 | #1104의 cursor/current nutrition/moderation/owner/legacy/write-zero 근거를 source PR body에 연결 |
| post-merge closeout | 1회 | 완료 근거가 GitHub PR 본문에만 남아 저장소 내부 보존성이 부족함 | immutable merge/check/production/review snapshot을 `evidence/2026-07-25-closeout.md`로 백필 |
| post-merge closeout | 1회 | Stage Time과 Timeline Reconstruction이 근거 없는 active-time 합계를 만들었음 | calendar event 순서만 유지하고 active time을 복원 불가로 정정 |
| post-merge closeout | 1회 | 요구사항/DB의 검색 정렬 문구가 API exact tuple 및 query-empty authority와 충돌했음 | versioned requirements v1.7.24, DB v1.3.25, API v1.2.29와 SOT/workpack을 먼저 정렬하고 PR #1108로 병합 |

## Merge Gate Evidence

| Gate | Evidence |
| --- | --- |
| Stage 1 docs | PR #1074 exact head `e64000cf` merged as `7d1c1b7e` after separate Codex internal 1.5 review |
| Stage 2 backend | PR #1097/#1099/#1100/#1101 merged; final backend merge `4b92b53f` |
| production release | PR #1103/#1104 merged; production Supabase transaction-read-only verifier covered cursor v1/v2, current nutrition, moderation, owner-private, legacy compatibility, ACL, write/provider-request zero |
| Stage 4 frontend | exact head `0bcdc998f79905cfbe601c67d97a769a4524f455`; related Vitest 30, full Vitest 3,605, focused Playwright 3 pass/1 normal skip |
| Stage 5/6 review | three independent Codex reviews P0-P3 0; current-head build, quality, security, smoke, accessibility, visual, Vercel, policy and template passed |
| Merge | PR #1105 merged as `19f25aae4806d2de584f4508bce88643c176705a`; full-regression/Lighthouse were documented path-filter normal skips |
| Contract consistency | PR #1108 exact head `ec285403` passed internal1.5, security/DB, five-axis P0-P3 0 and latest current-head checks before merge `07e041ad` |

## Verification Snapshot

| 검증 | 결과 |
| --- | --- |
| backend unit/product | full backend product 1,670/1,670 at release verifier checkpoint |
| PostgreSQL | existing/fresh/replay, function checksum, ACL and indexed candidate gates passed |
| relevance/performance | 287,041-row denominator, Recall@20≥90%, Precision@20≥75%, DB/route p95 and mandatory EXPLAIN gates passed |
| production read-only | cursor v1/v2, current nutrition, moderation, owner-private, legacy compatibility, exact principal ACL true; writes/provider requests 0 |
| frontend Vitest | related 3 files/30 passed; full 359 files/3,605 passed with 123 normal skips |
| frontend browser | focused 3 passed/1 normal skip; 320/390/1280 behavior evidence retained |
| frontend full gates | lint, typecheck, product 1,668, build 74 pages, smoke, a11y, visual, security passed |
| independent review | quality/security/tests P0-P3 0, unresolved 0 |
| physical-device IME | Manual Only supplementary evidence로 유지 |

## Efficiency Notes

- 순수 진행시간은 trace가 없어 복원할 수 없으며, PR event window를 active time으로 대체하지 않는다.
- 달력 구간에는 작업이 없던 간격, CI/check 대기, 단순 watch, 독립 reviewer 대기와 stage overlap이 섞여 있어 효율 수치로 사용하지 않는다.
- incremental backend PR은 normalization, truthful checkpoint, ranked search, safe remote verifier를 작게 분리해 rollback과 검토 범위를 제한했다.
- frontend는 기존 planner picker 계약을 유지하고 official typed-union client를 dark-ship해 client-side merge나 공식 계약 확장을 피했다.
- human escalation과 manual decision required는 0이며, post-merge stale 3건은 retained evidence 누락, 근거 없는 active-time 합계, official search authority drift를 각각 복구한 기록이다.
- 물리 기기별 한국어 IME 감각은 Manual Only이며 자동화·보안·성능·production read-only 완료 판정을 되돌리지 않는다.
