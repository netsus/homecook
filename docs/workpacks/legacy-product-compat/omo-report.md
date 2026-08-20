# OMO Efficiency Report: legacy-product-compat

## Summary

| 항목 | 값 |
| --- | ---: |
| report_mode | backfilled |
| #13 non-Manual automated/runtime delivery | Stage 2~6, internal 6.5, Ready, merge, post-merge checks completed/merged-green |
| broader lifecycle | `in_progress / codex_approved / passed / passed`; `auto_merge_eligible=false` |
| acceptance | non-Manual `40/40`; Manual Only `0/7` |
| backend source PR | #1369; merge `50e31293e6740b3fdc56d022e12d3b9fe8be4cf7` |
| frontend/final runtime PR | #1371; merge `da52e64d84eef7593bd60898018c2b65acad0f46` |
| final reviewed source head | `4d93e33ae078f897255429f0403de37b18f6d5af` |
| final source/merge tree | `02ac2ae15c4a636fb0766e9f2f845cf6cb9d7b15` |
| 측정 구간 | 2026-08-15 06:46 ~ 2026-08-20 20:27 KST |
| 벽시계 총 시간 | 8021.7분 |
| 순수 진행 누적시간 | 935.0분 (estimate) |
| human_escalation | 0회 |
| manual_decision_required | 0회 |
| frontend closeout codex_repairable | 7회 |
| canonical recovery | `manual_patch=0 / stale_lock=0 / ci_resync=1 / artifact_missing=false` |
| post-merge stale | 0회 |
| production/staging/remote application writes | `0/0/0` |
| Claude usage | 0회 |
| report author task | `01a01efb-423f-7ad3-892b-0435a9803132` |
| evidence_source | Codex task/session lineage, PR #1369/#1371, git objects, GitHub Ready/post-merge checks, repo-retained Stage evidence |

> estimated backfilled 보고서다. `pnpm omo:report -- --work-item legacy-product-compat --report-mode backfilled`는 actor를 호출하지 않는 rail로 정상 실행됐지만 dispatch artifact가 없어 벽시계와 순수 진행 누적시간을 `0.0분`으로 생성했다. 아래 수치는 역할이 분리된 Codex task/session 구간, authored commit과 PR timestamp, exact-head review, GitHub Ready/post-merge checks, source PR body와 repo-local Stage evidence를 교차 검증해 OMO 운영 효율 비교용으로 복원한 estimate다. CI/check 대기, 단순 PR watch, reviewer가 author repair를 기다린 긴 공백은 제외했다.

> PR #1369와 #1371의 병합은 #13의 **non-Manual automated/runtime delivery가 merged-green**이라는 뜻이다. 전체 `legacy-product-compat` lifecycle 완료나 production activation을 뜻하지 않는다. canonical overall lifecycle은 `in_progress`, approval은 `codex_approved`, verification/evaluation은 `passed / passed`, external smokes는 `pending`, `auto_merge_eligible=false`다. Manual Only `0/7`, server-Mac/OAuth, physical device/AT/full WCAG, controlled deploy/drain/fence/revoke, capability, `R/R+1/R+2`, required-key/production activation과 destructive tombstone authority는 계속 pending이다.

## Canonical Projection Boundary

이 보고서는 `.workflow-v2/work-items/legacy-product-compat.json#closeout`을 대체하는 새 truth surface가 아니다. source PR에 보존된 canonical snapshot은 pre-merge `phase=projecting`, lifecycle `in_progress`, required checks `passed`, external smokes `pending`, recovery `ci_resync_count=1`을 기록한다. 이 파일은 그 snapshot을 수정하지 않고 이후 Ready, merge, exact post-merge checks를 immutable historical evidence로 덧붙인다.

자동화/runtime 완료와 overall lifecycle은 다음처럼 분리한다.

| 구분 | 상태 | 근거 |
| --- | --- | --- |
| Stage 2/3 backend runtime | merged-green | PR #1369 merge와 exact-head independent APPROVE pair |
| Stage 4 frontend runtime | merged-green | PR #1371 implementation/recovery lineage, retained local full gate |
| Stage 5/6/6.5 | approved | Stage 5 `APPROVE 0/0/0`, Stage 6 `APPROVE 0/0/0`, internal 6.5 `MERGE-PENDING 0/0/0`, drift 0 |
| Ready/merge/post-merge | terminal green | Ready latest unique `13 success + 1 intended skip`; merge SHA raw `12 success + 1 intended skip` |
| overall lifecycle | `in_progress` | Manual `0/7`, external smokes/cutover/capability/activation pending |

## Measurement Basis

| 근거 | 사용 방식 |
| --- | --- |
| backend checkpoint report | 기존 Stage 2/3 active-time backfill `572.6분`을 그대로 보존 |
| Stage 4 task | `01a01e01-0a0e-7f70-97dd-2e6c8f0012af`의 implementation/repair/verification session event 구간 복원 |
| Stage 5 task | `01a01e3b-663e-7252-9c3c-0c7b30251c0e`의 initial finding과 exact repaired-head approval 구간 복원 |
| Stage 6 task | `01a01e68-fb28-7841-8815-c7685d56cc35`의 finding, repair re-review, projection successor re-approval 구간 복원 |
| internal 6.5 task | `01a01ebb-fa27-7933-8eae-57203bde9367`의 recovery/Ready-only projection review 구간 복원 |
| PR #1369/#1371 | create/Ready/body projection/merge 시각과 source evidence 확인 |
| git object lineage | base, reviewed head/tree/parent, merge parents/tree 동일성 확인 |
| GitHub check-runs | Ready latest unique contexts와 merge SHA raw post-merge terminal 결과 확인 |
| retained workpack evidence | Stage 2/4/5/6 테스트·review·recovery와 Manual 경계 확인 |

순수 진행시간은 초 단위 time tracking이 아니라 재현 가능한 보수적 estimate다. 기존 backend checkpoint `572.6분`은 Stage 2 `432.7`, Stage 3 `134.9`, backend Ready/merge active supervision `5.0`을 보존한다. frontend 구간은 각 task의 연속 session event 간격을 최대 10분까지만 active time으로 반영해 Stage 4 `223.1`, Stage 5 `26.7`, Stage 6 `72.0`, internal 6.5 `35.6`으로 계산했고 final Ready/merge active supervision `5.0`을 더했다. 합계는 `572.6 + 223.1 + 26.7 + 72.0 + 35.6 + 5.0 = 935.0분`이다.

Stage actor/reviewer가 겹친 구간은 서로 다른 역할이 실제 수행한 비용이므로 각각 보존했다. CI/check watch, post-merge wait, report author 시간, reviewer가 successor repair를 기다린 10분 초과 gap은 제외했다.

## Evidence Sources

| Source | Events | Stages |
| --- | ---: | --- |
| Codex task/session lineage | backend author/reviewer 7 + frontend author 1 + Stage 5/6/6.5 reviewer 3 | 2~6.5 |
| GitHub PR/CI | source PR 2 + final Ready latest unique 14 + final post-merge raw 13 | 2~6.5, merge gate |
| git history | PR #1369 source range + PR #1371 17 normal commits + merge objects | 2~6.5 |
| retained implementation/review evidence | workpack README/acceptance/automation + Stage 2/4/5/6 evidence 7 files | 2~6.5 |
| workflow projection | work-item/status canonical closeout snapshot | closeout boundary |

핵심 frontend lineage는 Stage 4 author `01a01e01-0a0e-7f70-97dd-2e6c8f0012af`, independent Stage 5 `01a01e3b-663e-7252-9c3c-0c7b30251c0e`, independent Stage 6 `01a01e68-fb28-7841-8815-c7685d56cc35`, fresh internal 6.5 `01a01ebb-fa27-7933-8eae-57203bde9367`이다. report author는 이들과 다른 `01a01efb-423f-7ad3-892b-0435a9803132`다.

## Stage Time

| Stage | 순수 진행시간 | 실행/검토 단위 | 결과 |
| --- | ---: | ---: | --- |
| 2 backend implementation/repair | 432.7분 (estimate) | author active window 2 + bounded repair | exact RPC/routes/fixtures/activation guard merged |
| 3 backend independent review | 134.9분 (estimate) | 6 independent reviewer task sessions | final source head `233bd68c…` dual APPROVE `0/0/0`, drift 0 |
| backend Ready/merge | 5.0분 (estimate) | active supervision only | PR #1369 merged-green |
| 4 frontend implementation/repair | 223.1분 (estimate) | author task 1, TDD/Playwright/full gate/projection repair | stable retry, stored-version dispatch, delete/focus states merged |
| 5 independent review | 26.7분 (estimate) | reviewer task 1 | exact repaired projection APPROVE `0/0/0`, drift 0 |
| 6 independent closeout review | 72.0분 (estimate) | reviewer task 1 with bounded successor re-reviews | final exact-head APPROVE `0/0/0`, drift 0 |
| 6.5 closeout reconcile | 35.6분 (estimate) | fresh reviewer task 1 | final `MERGE-PENDING 0/0/0`, projection drift 0 |
| final Ready/merge | 5.0분 (estimate) | active supervision only | PR #1371 normally merged after latest Ready contexts terminal |
| **Total** | **935.0분 (estimate)** | **role-separated Codex task handoff** | **non-Manual automated/runtime delivery merged-green; overall lifecycle in_progress** |

## Timeline Reconstruction

| 구간 | 시각(KST) | 산정 |
| --- | --- | ---: |
| Stage 2/3 backend RED → review → merge | 08-15 06:46 → 08-20 15:26 | 기존 checkpoint `572.6분`; 약 5일 handoff gap과 CI watch 제외 |
| Stage 4 author implementation/repair | 08-20 16:09 → 20:10 | `223.1분`; stable key, exact browser matrix, Stage 5/6 repair와 projection 포함 |
| Stage 5 review/re-review | 08-20 17:13 → 17:50 | `26.7분`; author repair wait의 긴 gap cap |
| Stage 6 review/re-review | 08-20 18:03 → 20:11 | `72.0분`; initial `0/2/1`에서 final `0/0/0`까지 successor 검증 |
| internal 6.5 review/re-review | 08-20 19:33 → 20:14 | `35.6분`; `ci_resync=1`과 Ready-only authority projection 확인 |
| Ready checks/merge | 08-20 20:14 → 20:27 | `5.0분` active supervision; check watch 제외 |
| post-merge checks | 08-20 20:28 → 20:42 | `0.0분` active; raw 13 terminal 결과만 evidence로 사용 |

벽시계 `8021.7분`은 첫 retained RED commit `e0b5bca9…`부터 final runtime merge `da52e64d…`까지 `5일 13시간 41분 39초`다. 순수 진행 `935.0분`과의 차이는 주로 5일 handoff gap, CI/check wait, PR watch와 역할 간 대기다.

## Human Escalations

| Stage | 발생 | 원인 | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | 없음 | 역할 분리된 Codex handoff와 bounded repair로 automated/runtime delivery 종료 |

## Manual Decision Required

| Stage | 발생 | reason_code | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | - | 작업 중 새 제품/계약 결정 없음; 기존 Manual Only는 pending obligation으로 유지 |

Manual Only `0/7`이 남았다는 사실은 이 작업에서 새 manual decision 요청이 발생했다는 뜻이 아니다. 이미 잠긴 외부 운영·기기·activation obligation을 실행하거나 완료로 올리지 않았다는 뜻이다.

## Codex-Resolved Non-Human Errors

| 구간 | 발생 | 근거 | 해결 |
| --- | ---: | --- | --- |
| backend checkpoint | 6 bounded wave | authority inventory, owner/lifecycle concurrency, actual route/fixture, workflow projection | normal successor commits와 fresh exact-head Stage 3 approval |
| frontend/closeout canonical projection | 7 codex_repairable | current work-item `repair_summary.codex_repairable_count` | Stage 4/5/6 TDD repair, evidence/PR projection recheck, internal 6.5 |
| pre-Ready CI recovery | 1 ci_resync | run `32358383620` attempt 1 port `54322` collision | same-SHA attempt 2 success; canonical `ci_resync_count=1` |
| Ready-only policy finding | 1 deterministic projection repair | README Authority parser mismatch | exact two-file successor `4d93e33a…`; 새 CI rerun 없이 Ready bundle 재검증 |

pre-Ready runner port collision은 제품 defect나 사람 escalation이 아니다. canonical recovery는 `manual_patch_count=0`, `stale_lock_count=0`, `ci_resync_count=1`, `artifact_missing=false`, `last_recovery_at=2026-08-20T10:28:03Z`로 정확히 남았다. 이후 Ready-only policy finding은 code/runtime이 아닌 projection 문구 문제였고 successor commit으로 고쳤으므로 `ci_resync_count`를 늘리지 않았다.

## Post-Merge Stale Events

| Stage | 발생 | reason_code | 결과 |
| --- | ---: | --- | --- |
| - | 0회 | - | merge SHA exact post-merge raw 13 terminal; bad/pending/rerun 0 |

## Implementation And Review Lineage

| Gate | Evidence |
| --- | --- |
| backend implementation | author task `019ff12c-dc8b-7752-9319-398a68cacb6e`; RED `e0b5bca9…`; final reviewed source `233bd68c…` |
| backend Stage 3 | code/quality `01a01d94-6124-7eb1-bd0f-bdbda74d3f5b`, security/DB `01a01d94-6623-7130-a6c5-b71a39edbd08`; exact-head APPROVE `0/0/0`, drift 0 |
| backend merge | PR #1369 merge `50e31293e6740b3fdc56d022e12d3b9fe8be4cf7`; tree `498d76f3f528f7481b15751026e3017b7afce1e1`; parents `d4f134c76660ebd2c58e49289a77abe36b8530e1` + `233bd68cdca29426a7df822cb17abadc39e2ebdb` |
| frontend implementation | task `01a01e01-0a0e-7f70-97dd-2e6c8f0012af`; base `9da127e806743e78ec103292907ec42bda566338`; source range `3ca8320c…` → `4d93e33a…` |
| Stage 5 | task `01a01e3b-663e-7252-9c3c-0c7b30251c0e`; exact `387f1d688204061c28b60c415135a70e42a07042` / tree `e0d887e487ad237a87fa6b3d67238d2dac045ce7`; APPROVE `0/0/0`, drift 0 |
| Stage 6 runtime closeout | task `01a01e68-fb28-7841-8815-c7685d56cc35`; exact `6387052439623cebef90176944aa5aee7f5ca17a` / tree `4d415e7d81c1bfeada5147f034b6b4c34fd66c89`; final APPROVE `0/0/0`, drift 0 |
| Stage 6 final projection re-approval | same independent task; exact `4d93e33ae078f897255429f0403de37b18f6d5af` / tree `02ac2ae15c4a636fb0766e9f2f845cf6cb9d7b15`; APPROVE `0/0/0`, drift 0 |
| Internal 6.5 | task `01a01ebb-fa27-7933-8eae-57203bde9367`; exact `4d93e33ae078f897255429f0403de37b18f6d5af`; `MERGE-PENDING 0/0/0`, projection drift 0 |
| final merge | PR #1371 normally merged at `2026-08-20T11:27:58Z` as `da52e64d84eef7593bd60898018c2b65acad0f46` |
| merge object | tree `02ac2ae15c4a636fb0766e9f2f845cf6cb9d7b15`; parents `9da127e806743e78ec103292907ec42bda566338` + reviewed head `4d93e33ae078f897255429f0403de37b18f6d5af` |

PR #1371의 source head tree와 merge tree는 정확히 같으며 history rewrite 없이 17개 normal commit을 병합했다. report author는 구현/Stage 5/6/6.5를 자기 승인하지 않는다.

## Merge Gate Evidence

| Gate | Evidence |
| --- | --- |
| final source head | `4d93e33ae078f897255429f0403de37b18f6d5af`; tree `02ac2ae15c4a636fb0766e9f2f845cf6cb9d7b15`; parent `a1ccfad6788b705d53b88b3b2d2040d7b70cf956` |
| Stage 5 | task `01a01e3b…`, APPROVE P0/P1/P2 `0/0/0`, blocker/major/minor `0/0/0` |
| Stage 6 | task `01a01e68…`, final exact-head APPROVE P0/P1/P2 `0/0/0`, drift 0 |
| Internal 6.5 | task `01a01ebb…`, final `MERGE-PENDING P0/P1/P2 0/0/0`, drift 0 |
| Ready latest unique checks | `14`: success `13`, intended `lighthouse` skip `1`, bad/pending/rerun-in-progress `0/0/0` |
| Ready full regression | `full-regression` success; Ready-only policy repair 이후 새 failure/rerun 없음 |
| merge | PR #1371, `da52e64d84eef7593bd60898018c2b65acad0f46`, normal merge, exact two parents |
| post-merge master | raw `13`: success `12`, intended `lighthouse` skip `1`, bad/pending/rerun `0/0/0`; `full-regression` success |

Ready latest unique check names는 `GitGuardian Security Checks`, `accessibility`, `build`, `changes`, `full-regression`, `labeler`, `lighthouse`, `policy`, `quality`, `security-function-authorization`, `security-smoke`, `smoke`, `template-check`, `visual`이다. post-merge raw 13은 `accessibility`, `build`, `changes`, `dependency-audit`, `full-regression`, `lighthouse`, `policy`, `quality`, `security-function-authorization`, `security-smoke`, `smoke`, `snyk`, `visual`이다.

## Verification Snapshot

| 검증 | 보존 결과 |
| --- | --- |
| backend focused Vitest | 10 files / 76 tests passed |
| backend disposable PostgreSQL | 13/13 passed; owner/lifecycle/concurrency/replay/rollback mutation-zero 포함 |
| backend internal authority | 3 files / 34 tests; security manifest 6 functions |
| isolated local runtime | full migration/reset replay, Data API 200, owned resource cleanup |
| Stage 4/6 focused runtime/routes | final focused client/store/cook screens/routes 5 files / 97 tests |
| exact legacy Playwright | 14/14; `390x844`, `320x693`, `1280x900` |
| product Vitest | 2,757 passed / 175 intended skipped |
| frontend build | 81 static pages |
| Lighthouse | 2 URLs × 3 local runs |
| full regression | 963 passed / 180 intended skipped |
| accessibility | 18 passed / 15 intended skipped |
| visual | 22 passed / 23 intended skipped |
| security | 12/12 passed |
| governance/projection | source/workflow/workpack/automation/OMO/closeout/Ready/branch/commit/diff validators passed on source lineage |
| Ready GitHub | latest unique 13 success + 1 intended skip; bad/pending/rerun-in-progress 0 |
| post-merge GitHub | raw 12 success + 1 intended skip; bad/pending/rerun 0 |

Retained full product/head evidence의 authority는 Stage 6 문서에 고정된 exact `d0dfe94a3ea57260b16abd2369b9d4a719d82a55` / tree `73dc173871f448d98c236eeb6bda2766690f803e`다. 이후 projection-only successor는 runtime tree 변경 없이 independent review와 current-head CI를 다시 통과했다.

## Manual And Lifecycle Boundaries

- Production/staging/remote application writes는 `0/0/0`이며 report author task도 application, DB, provider, server-Mac 또는 activation write를 실행하지 않았다.
- physical keyboard, VoiceOver/TalkBack, real device safe-area/virtual-keyboard와 full WCAG evidence는 Manual pending이다.
- controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop과 callable inventory/negative privilege proof는 Manual pending이다.
- server-Mac/OAuth와 merged-exact server-production/local-rehearsal의 승인된 실행은 pending이다.
- capability, `R/R+1/R+2`, exact required-key transition, production activation은 pending이다.
- destructive tombstone/removal은 새 explicit user approval, official contract-evolution, retention/privacy, rollback/recovery evidence 없이는 실행할 수 없다.
- 자동화/runtime merge, `40/40` non-Manual acceptance, review approvals와 terminal checks는 위 Manual 항목을 대체하지 않는다.

## Efficiency Notes

- 순수 진행 누적시간 `935.0분`은 역할별 Codex task/session, commit/PR/check 시각과 retained evidence를 사용한 OMO 운영 비교용 estimate다.
- backend checkpoint `572.6분`은 기존 report 산정을 보존했고, frontend~internal 6.5와 final merge active supervision은 `362.4분`으로 backfill했다.
- Stage 4 author, Stage 5, Stage 6, internal 6.5가 겹친 시간은 독립 actor 비용으로 각각 포함했지만 CI 대기와 단순 watch는 제외했다.
- pre-Ready port collision은 same-SHA recovery 후 `ci_resync=1`로 남겼고, Ready-only authority projection finding은 successor commit으로 고쳐 rerun이나 recovery count를 부풀리지 않았다.
- PR #1371과 post-merge checks가 #13 automated/runtime delivery를 merged-green으로 닫았지만 broader lifecycle은 `in_progress`, external smokes `pending`, Manual `0/7`, `auto_merge_eligible=false`다.
- 다음 단계는 이 한 파일짜리 docs-only report PR에 대한 별도 fresh Codex reviewer 검토다. report author는 Ready 전환, 승인, merge, Discord, production activation을 수행하지 않는다.
