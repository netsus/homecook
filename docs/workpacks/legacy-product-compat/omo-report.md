# OMO Efficiency Report: legacy-product-compat

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| #13 backend runtime checkpoint | Stage 2/3 merged-green; PR #1369 merged |
| broader workpack lifecycle | `in_progress / not_started / pending / not_started` |
| auto_merge_eligible | `false` |
| source PR | #1369 |
| reviewed source head | `233bd68cdca29426a7df822cb17abadc39e2ebdb` |
| source/merge tree | `498d76f3f528f7481b15751026e3017b7afce1e1` |
| merge commit | `50e31293e6740b3fdc56d022e12d3b9fe8be4cf7` |
| 측정 구간 | 2026-08-15 06:46 ~ 2026-08-20 15:26 KST |
| 벽시계 총 시간 | 7720.0분 |
| 순수 진행 누적시간 | 572.6분 (estimate) |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| Codex bounded repair wave | 6묶음 |
| non-human orchestration event | 2회 (usage limit 1, approval wait 1) |
| post-merge stale | 0회 |
| production/staging/remote application writes | `0/0/0` |
| Claude usage | 0회 |
| report author task | `01a01de9-7a9f-7e42-b4e5-ff0ffaba8b1e` |
| evidence_source | Codex task/session lineage, PR #1369 body/timestamps, git objects, Ready/post-merge checks, retained workpack evidence |

> estimated backfilled 보고서다. `pnpm omo:report -- --work-item legacy-product-compat`는 actor를 호출하지 않는 rail로 정상 실행됐지만 dispatch artifact가 없어 순수 진행 누적시간을 `0.0분`으로 생성했다. 아래 수치는 역할이 분리된 Codex task/session 구간, authored commit과 PR timestamp, exact-head review, GitHub Ready/post-merge checks, source PR body와 repo-local Stage 2 evidence를 교차 검증해 OMO 운영 효율 비교용으로 복원한 estimate다. CI/check 대기, 단순 PR watch, approval wait와 5일 handoff 공백은 제외했다.

> PR #1369 merge는 #13의 **Stage 2 backend 구현과 Stage 3 독립 리뷰 runtime checkpoint**를 merged-green으로 닫은 것이다. 전체 `legacy-product-compat` workpack이 merged/complete라는 뜻이 아니다. canonical work-item/status의 `in_progress / not_started / pending / not_started`, `auto_merge_eligible=false`를 유지하며 Stage 4~6 frontend, Manual/server-Mac/OAuth, controlled deploy/drain/fence/revoke, capability와 `R/R+1/R+2`, production/activation은 pending이다. 이 report는 lifecycle projection이나 acceptance checkbox를 수정하지 않는다.

## Measurement Basis

| 근거 | 사용 방식 |
| --- | --- |
| Codex source task/session | Stage 2 author task `019ff12c-dc8b-7752-9319-398a68cacb6e`의 source-PR active windows를 복원 |
| independent review tasks | frozen-head, interrupted successor, exact-head review/re-review의 실제 시작·종료와 역할 독립성 확인 |
| PR #1369 | create/Ready/body projection/merge 시각과 최종 source evidence 확인 |
| git object lineage | base, reviewed head/tree/parent, merge parent/tree 동일성 확인 |
| GitHub check-runs | Ready unique 14/14와 merge SHA post-merge raw 13/13 terminal success 확인 |
| retained workpack evidence | expanded Vitest, disposable PostgreSQL, full/product/security 검증과 Manual 경계 확인 |
| work-item/status projection | backend checkpoint와 broader lifecycle pending 상태를 분리 |

순수 진행시간은 초 단위 time tracking이 아니라 재현 가능한 보수적 estimate다. Stage 2 source task의 두 authored window에서 연속 session event 간격을 최대 10분까지만 active time으로 반영하고, 첫 retained RED 이전 준비를 30분 baseline으로 배정했다. 결과는 initial implementation/repair `383.1분` + successor repair `49.6분` = `432.7분`이다.

Stage 3은 독립 reviewer session을 별도 actor 비용으로 계산했다. frozen-head review `24.2분`, interrupted successor review `44.2분`, final exact-head review/re-review `66.5분` = `134.9분`이다. command approval로 멈춘 `22.2분`은 approval wait로 제외했고, final paired reviewer는 author repair를 기다린 긴 gap을 5분 cap으로 제외했다. Ready/merge는 check watch를 제외한 active supervision `5.0분`만 반영했다. 따라서 `432.7 + 134.9 + 5.0 = 572.6분`이다. Stage 2 author와 Stage 3 reviewers의 일부 시간은 병렬로 겹치며, 서로 다른 actor가 직접 수행한 구현/리뷰 비용이므로 합계에 각각 보존했다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| Codex task/session lineage | author 1 + independent reviewer 6 task sessions | 2, 3 |
| GitHub PR/CI | source PR 1 + Ready unique 14 + post-merge raw 13 | 2, 3, merge gate |
| git history | source range 20 commits + merge commit | 2, 3, merge gate |
| retained implementation evidence | workpack README/acceptance/automation + Stage 2 evidence | 2, 3 |
| workflow projection | work-item/status broader lifecycle snapshot | post-merge boundary |

핵심 task lineage는 Stage 2 author `019ff12c-dc8b-7752-9319-398a68cacb6e`, first frozen-head code/quality `01a003ae-1569-7091-b087-3a55e5ccc8fb`, security/DB `01a003ae-1566-7f73-996d-52c44ffecd14`, interrupted successor code/quality `01a003ca-fc74-7103-ba18-0997f8a61c92`, resumed security/DB `01a003ca-fc72-7c22-943e-bda5b4d47cdf`, final exact-head code/quality `01a01d94-6124-7eb1-bd0f-bdbda74d3f5b`, security/DB `01a01d94-6623-7130-a6c5-b71a39edbd08`이다. report author task는 이들과 다른 `01a01de9-7a9f-7e42-b4e5-ff0ffaba8b1e`다.

## Stage Time

| Stage | 순수 진행시간 | 실행/검토 단위 | 결과 |
| --- | ---: | ---: | --- |
| 2 backend implementation/repair | 432.7분 (estimate) | author active window 2 + 6 bounded repair wave | exact RPC/routes/fixtures/activation guard와 local evidence merged |
| 3 backend independent review | 134.9분 (estimate) | 6 independent reviewer task sessions | final exact head `233bd68c…` code/quality + security/DB APPROVE `0/0/0`, drift 0 |
| Ready/merge gate | 5.0분 (estimate) | active supervision only | unique 14/14 success 뒤 PR #1369 merge |
| 4 frontend | 0.0분 | not started | pending |
| 5 design review | 0.0분 | not started | pending |
| 6 frontend closeout | 0.0분 | not started | pending |
| **Backend checkpoint total** | **572.6분 (estimate)** | **role-separated Codex task handoff** | **Stage 2/3 merged-green; overall workpack 미완료 유지** |

## Timeline Reconstruction

| 구간 | 시각(KST) | 산정 |
| --- | --- | ---: |
| Stage 2 RED/base integration/implementation | 08-15 06:46 → 13:24 | authority-first RPC/routes와 initial local verification; long local test work 포함 |
| frozen-head Stage 3 review + first repairs | 08-15 13:28 → 13:58 | two independent REQUEST_CHANGES와 inventory/private-recipe/PostgreSQL repairs |
| interrupted successor review + candidate repairs | 08-15 14:00 → 14:59 | usage-limit task과 approval-wait resume를 분리; wait 자체는 active time 제외 |
| orchestration/handoff gap | 08-15 14:59 → 08-20 14:09 | 0.0분 active; account usage-limit 이후 약 5일 공백 제외 |
| exact-head review/re-review + successor repairs | 08-20 14:09 → 15:03 | b6c/74f/final-head rounds, author/reviewer overlap 보존 |
| Ready checks/merge | 08-20 14:59 → 15:26 | 5.0분 active supervision; full-regression/Lighthouse 포함 check watch 제외 |
| post-merge checks | 08-20 15:26 → 15:42 | 0.0분 active; raw 13 terminal 결과만 evidence로 사용 |

벽시계 `7720.0분`은 첫 retained RED commit부터 merge까지 `5일 8시간 40분`이다. 순수 진행 `572.6분`과의 차이는 주로 5일 orchestration gap, CI/check wait, PR watch, approval wait다. 서로 다른 author/reviewer가 동시에 활동한 구간은 actor 합계와 단일 벽시계 구간이 1:1로 대응하지 않는다.

## Human Escalations

| Stage | 발생 | 원인 | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | 없음 | Codex task handoff와 bounded repair로 backend checkpoint 종료 |

## Manual Decision Required

| Stage | 발생 | reason_code | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | - | 새 제품/계약 결정 없음; 기존 Manual Only는 pending obligation으로 유지 |

## Non-Human Orchestration Events

| 구분 | 발생 | task/evidence | 처리 |
| --- | ---: | --- | --- |
| model usage limit | 1회 | code/quality `01a003ca-fc74-7103-ba18-0997f8a61c92` | verdict 전 종료; partial candidates만 repair input으로 사용하고 approval로 계산하지 않음 |
| command approval wait | 1회 | security/DB `01a003ca-fc72-7c22-943e-bda5b4d47cdf` | resume 후 frozen-head 검증 완료; `22.2분` wait를 active time에서 제외 |

두 사건은 사람의 제품/계약 결정이 아니므로 `human_escalation`이나 `manual_decision_required`로 계산하지 않았다. interrupted task의 긍정적 분석도 approval evidence로 승격하지 않았고, 최종 exact-head tasks의 명시적 APPROVE만 merge 근거로 사용했다.

## Post-Merge Stale Events

| Stage | 발생 | reason_code | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | - | merge SHA exact post-merge raw 13/13 terminal success; rerun 0 |

## Codex-Resolved Non-Human Errors

| Wave | head/근거 | finding | 해결 |
| --- | --- | --- | --- |
| 1 | frozen `ad795cbc…` | authority inventory, planner/standalone PostgreSQL matrix, private/deleted recipe authority | `59cc07ac`, `07cdc639`, `8ad430ce`와 expanded local evidence |
| 2 | first successor attempts | mixed-method inventory와 concurrent progress counter 후보 | `636fc330`, `836f6390`; usage-limit task 결과는 verdict로 사용하지 않음 |
| 3 | frozen `be65e6df…` security review | runtime/security finding 0; roadmap/PR projection P2 1 | `b6c5be31` projection repair; approval-wait task는 current-head approval 아님 |
| 4 | exact `b6c5be31…` | inactive recipe-owner visibility, actual seeded-v2/required-key route evidence, terminal projection | `ae517053`, `d6032a59`, `74f148e1` |
| 5 | exact `74f148e1…` | source-owner lifecycle concurrency와 workflow rail drift | `09c579b0`, `c320c157`, `052a7db9`; PostgreSQL 13/13 concurrency proof |
| 6 | successor projection | retained PostgreSQL count drift | `233bd68c`; final exact-head pair APPROVE `0/0/0`, drift 0 |

6묶음은 서로 독립된 사용자-facing defect 수가 아니라 review/commit lineage에서 구분한 bounded repair wave다. failed finding을 단순 rerun으로 덮지 않고 successor commit과 fresh exact-head re-review로 닫았다. Claude는 어떤 wave에도 사용하지 않았다.

## Merge Gate Evidence

| Gate | Evidence |
| --- | --- |
| base | `d4f134c76660ebd2c58e49289a77abe36b8530e1` |
| final reviewed source head | `233bd68cdca29426a7df822cb17abadc39e2ebdb`; tree `498d76f3f528f7481b15751026e3017b7afce1e1`; direct parent `052a7db913c6b7062d95ec9689eadbc27fbda8c2` |
| exact-head code/quality | task `01a01d94-6124-7eb1-bd0f-bdbda74d3f5b`, APPROVE P0/P1/P2 `0/0/0` |
| exact-head security/DB | task `01a01d94-6623-7130-a6c5-b71a39edbd08`, APPROVE P0/P1/P2 `0/0/0` |
| drift | reviewed head/tree drift `0` for both final reviewers |
| Ready checks | final source head unique names `14`: success `14`, intended skip/pending/fail/rerun `0/0/0/0`; `full-regression`과 `lighthouse` success 포함 |
| merge | PR #1369 merged at `2026-08-20T06:26:19Z` as `50e31293e6740b3fdc56d022e12d3b9fe8be4cf7` |
| merge object | parents `d4f134c76660ebd2c58e49289a77abe36b8530e1` + `233bd68cdca29426a7df822cb17abadc39e2ebdb`; tree `498d76f3f528f7481b15751026e3017b7afce1e1` |
| post-merge master | merge SHA raw `13`: success `13`, bad/pending/rerun `0/0/0`; `full-regression`과 `lighthouse` success |

Ready unique check names는 `GitGuardian Security Checks`, `accessibility`, `build`, `changes`, `full-regression`, `labeler`, `lighthouse`, `policy`, `quality`, `security-function-authorization`, `security-smoke`, `smoke`, `template-check`, `visual`이다. post-merge raw 13은 `accessibility`, `build`, `changes`, `dependency-audit`, `full-regression`, `lighthouse`, `policy`, `quality`, `security-function-authorization`, `security-smoke`, `smoke`, `snyk`, `visual`이며 모두 success다.

## Verification Snapshot

| 검증 | 보존 결과 |
| --- | --- |
| expanded focused Vitest | 10 files / 76 tests passed |
| disposable PostgreSQL | 13/13 passed; planner/standalone concurrency, lifecycle/version/owner mutation-zero 포함 |
| internal authority | 3 files / 34 tests; 67 routes / 101 write surfaces / 3 inbound FKs |
| isolated Supabase runtime | full migration/reset replay, Data API 200, owned resources cleanup |
| prepared-food owner PostgreSQL | 11/11 passed |
| full Vitest | 6,106 passed / 416 intended skipped |
| product Vitest | 2,756 passed / 175 intended skipped |
| backend build/security | build passed; security E2E 12/12 |
| security function contract | #13 six functions exact owner/ACL/security mode/search path passed |
| audit | high/critical 0/0; residual pre-existing low/moderate 1/1 |
| source validators | source-of-truth/workflow-v2/workpack/automation/OMO/real-smoke/branch/commit, lint, typecheck, diff passed |
| Ready GitHub | unique 14/14 success; bad/pending/rerun 0 |
| post-merge GitHub | raw 13/13 success; bad/pending/rerun 0 |

## Manual And Lifecycle Boundaries

- Production/staging/remote application writes는 `0/0/0`이며 이 report task도 remote write를 실행하지 않았다.
- controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop, deployed callable inventory와 negative privilege proof는 Manual pending이다.
- merged-exact read-only rehearsal, server-Mac/OAuth, physical device/AT/full WCAG는 pending이다.
- Stage 4 frontend 구현, Stage 5 review, Stage 6 closeout은 시작하지 않았다. existing `PLANNER_WEEK`/`COOK_MODE`/`LEFTOVERS` surface의 optional-key client, pinned legacy row/detail/delete, five UI states와 responsive/focus evidence는 후속 Stage가 소유한다.
- capability, required-key activation, `R/R+1/R+2`, production activation과 destructive tombstone/removal은 pending이며 별도 승인 없이는 실행할 수 없다.
- canonical lifecycle은 `in_progress`, approval/evaluation은 `not_started`, verification은 `pending`, `auto_merge_eligible=false`다. backend PR merge나 이 report를 전체 workpack `merged/complete`로 투영하지 않는다.

## Efficiency Notes

- 순수 진행 누적시간 `572.6분`은 Codex task/session, commit/PR/check 시각과 retained evidence를 사용한 OMO 운영 비교용 estimate다. 초 단위 time tracking이 아니다.
- 가장 큰 비용은 Stage 2 구현/수리 `432.7분`이다. authority-before-writer 단일 transaction, mutation-zero PostgreSQL matrix, cross-owner lifecycle serialization, actual route evidence와 workflow rail을 successor head마다 함께 닫았다.
- Stage 3 `134.9분`에는 명시적 verdict를 낸 review뿐 아니라 finding을 남긴 interrupted review의 실제 active analysis도 포함한다. 다만 usage-limit/approval-wait 자체는 approval이나 사람 escalation으로 계산하지 않았다.
- source delivery는 backend Stage 2/3 checkpoint만 merged-green이다. broader lifecycle와 Manual/activation obligation은 그대로 pending이다.
- 다음 단계는 이 한 파일짜리 docs-only report PR에 대한 별도 fresh Codex reviewer 검토다. report author는 Ready 전환, 승인, merge, Discord, production/staging/remote write를 수행하지 않는다.
