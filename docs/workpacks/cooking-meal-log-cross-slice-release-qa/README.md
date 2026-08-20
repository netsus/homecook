# cooking-meal-log-cross-slice-release-qa

## Goal

F0와 #1~#13에서 병합된 계정 세대, 제품 검색·재료 연결, 개인 레시피·snapshot, cooked batch, meal log, Planner/COOK_MODE와 legacy runtime을 하나의 verification-only 최종 release gate에서 재검증한다. exact repaired head에서 pinned isolated local gate와 권한이 있는 controlled full-local read-only evidence를 모으고, 결함은 이 slice에서 고치지 않고 separate failing-test-first TDD repair PR 뒤 전체 증거를 다시 만든다.

## Branches

- Stage 1 relock: `docs/cooking-meal-log-cross-slice-relock`
- Stage 2/3 verification: 별도 fresh Codex task와 verification branch
- Stage 4~6 browser/authority/closeout: 역할별 별도 fresh Codex task와 branch

## In Scope

- 화면: 기존 `ACCOUNT_QUARANTINE`, `HOME`, `RECIPE_DETAIL`, `MANUAL_RECIPE_CREATE`, `PLANNER_WEEK`, `COOK_MODE`, `LEFTOVERS`, `MEAL_LOG`의 exact-head 검증만 수행한다.
- API: 공식 `docs/api문서-v1.2.39.md`의 F0/#1~#13 기존 endpoint와 `{ success, data, error }` 계약을 그대로 검증한다.
- 상태 전이: 기존 account generation, personal recipe/snapshot, v1/v2 cooking, batch ledger, meal-log event, legacy rollback 상태를 변경 없이 재검증한다.
- DB 영향: Stage 2 기본 경로는 pinned isolated local replay와 controlled full-local read-only/checksum verification이다.
- Schema Change: 없음. 이 slice는 migration과 runtime repair를 소유하지 않는다.

## Out of Scope

- no endpoint, field, status, error, action, screen, migration, or dependency를 추가하거나 변경하지 않는다.
- inline runtime repair, 공식 문서 Contract Evolution, capability/R/R+1/R+2/required-key/activation을 수행하지 않는다.
- Cloud/linked/remote Supabase is forbidden/N/A이며 verifier, credential, fallback 또는 target으로 요구하지 않는다.
- 권한 없는 local-production mutation, server-Mac 설치·secret rotation, destructive tombstone·legacy orphan delete를 수행하지 않는다.

## Dependencies

기준은 `origin/master@c5b213152b4a6554f4eaa8714b2292ec2e074e0d`, tree `6e09dfa998c999ab27a8f84faeb42e40b7c7e636`이다. 아래 merge는 retained README/status/work-item/OMO evidence와 git/GitHub object로 확인한 non-Manual automated/runtime delivery다.

| Order | Slice | automated/runtime merge | broader state |
| --- | --- | --- | --- |
| F0 | `account-session-generation-foundation` | PR #1090 `a10293e0cf17c4c19204e870024e8fe745e362e3` | Manual/activation pending |
| #1 | `prepared-food-search-relevance` | PR #1105 `19f25aae4806d2de584f4508bce88643c176705a` | original apply provenance Manual pending |
| #2 | `product-ingredient-link-foundation` | PR #1256 `5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0` | full-local/query-plan/activation pending |
| #3 | `recipe-visibility-read-hardening` | PR #1228 `8085914cb26e9b927fc973c99318c15d9dee86ce` | server-Mac/activation/old-path delete pending |
| #4 | `recipe-snapshot-authority-foundation` | PR #1267 `5413b6adc42d0e8c45dc55cafad2b076b9bd61a0` | overall lifecycle `in_progress` |
| #5 | `personal-recipe-editor-decoupling` | PR #1272 `bb870dd0cba5ac52b6d9ad223db2a2935c00bcb9` | overall lifecycle `in_progress` |
| #6 | `personal-recipe-customization-write-core` | PR #1274 `05683e4d1cf95c4cc3b9a41eb3fa7857b58a3d2d` | terminal release/activation pending |
| #7 | `recipe-content-snapshot-future-propagation` | PR #1281 `2173737e8ea2eec2297e1cc0227ce4f2c27c50b9` | overall lifecycle `in_progress` |
| #8 | `cooked-batch-weight-ledger` | PR #1311 `c16102a3072e929e45bb24a69464cd3110d03db5` | OMO runtime merged-green; broader pending |
| #9 | `meal-log-core` | PR #1319 `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` | backend checkpoint merged; broader pending |
| #10 | `planner-shell` | PR #1331 `2185b59d1b460dac916aa4a4a4a5e061c8b795f0` | OMO runtime merged-green; broader pending |
| #11 | `cooked-batch-weight-ui` | PR #1323 `7c7d25a1d4deb930ddcf85611bb57f5fe14f00a0` | runtime merged-green; broader pending |
| #12 | `meal-log-ui` | repair PR #1364 `358450e44da691256b0eeb51d8ae131a520b6cbd` | OMO runtime merged-green; broader pending |
| #13 | `legacy-product-compat` | PR #1371 `da52e64d84eef7593bd60898018c2b65acad0f46` | OMO runtime merged-green; broader pending |

automated/runtime predecessor gate: satisfied at the frozen base above. This does not close the overall release: overall lifecycle is not complete while Manual/server-Mac/OAuth/device/AT/full-WCAG, local-production/rehearsal/backup-restore/cutover, and capability/R/R+1/R+2/required-key/activation evidence remains pending.

Stage 2 entry still requires this relock PR merge and the documented post-merge preflight. The four separate Stage 1 review gates are approved on the exact reviewed head below, but a later predecessor repair or evidence invalidation fails the gate closed and requires this table to be relocked again.

## Stage 1 Historical Gate

- Draft PR: `https://github.com/netsus/homecook/pull/1373`
- exact reviewed identity: head `2c33b38cf9f3badb72d610ad7a47abe70bf8907f`, tree `23fab93ab372174b9f531cf3414b348b1a724894`.
- internal1.5 `01a01f2e-ae07-7f42-88be-87727228702a`: `APPROVE 0/0/0`, drift `0`.
- security/DB/operations `01a01f2e-b2ed-7f32-bbaf-204b58613435`: `APPROVE 0/0/0`, drift `0`.
- five-axis `01a01f2e-ba20-7022-8b3b-5b90d15572d0`: `APPROVE 0/0/0`, drift `0`.
- design-authority-plan `01a01f2e-bf69-7f23-9c7c-7982855195bc`: `APPROVE 0/0/0`, drift `0`.
- retained machine-readable evidence: `docs/workpacks/cooking-meal-log-cross-slice-release-qa/evidence/2026-08-21-stage1-final-independent-approvals.json`.
- Stage 1 historical approval/verification/evaluation은 `codex_approved / passed / passed`다. 이 값은 PR #1373의 과거 승인 증거이며 활성 Stage 2/3 승인 상태가 아니다.
- 이 projection successor는 네 reviewer의 exact-head verdict를 기록할 뿐 새 리뷰나 자기 승인을 만들지 않는다. successor current-head CI와 final drift confirmation은 별도 reviewer 확인 대상이다.
- repair budget: docs repair budget max 3; backend/frontend inline repair rounds `0/0`. Runtime defect는 separate failing-test-first TDD repair PR로 이동하고 full rerun after its merge가 필요하다.

## Active Stage 2/3 Gate

- 활성 lifecycle/approval/verification/evaluation은 `in_progress / needs_revision / passed / fixable`이다.
- 활성 Draft PR은 `https://github.com/netsus/homecook/pull/1377`이고 repair successor head는 `25802dc7242ead54a758c167c0ed86470b147957`이다. current-head checks는 `8 success + 5 intended skip`, bad/pending `0`이다.
- fresh Stage 3 re-review task `01a02129-5945-7381-8aca-ff7673d0b5f3`가 `CML14-S3-P1-002`를 요청했으며, human-facing projection repair 뒤 re-review가 pending이다.
- complete owning DB lanes, actual performance thresholds, Stage 4 `FINAL_EVIDENCE_SHA`/full profile, controlled full-local, Stage 4~6, Manual and activation remain pending.

## Backend First Contract

- request/query/path, response wrapper, status, error, ownership, idempotency and state transitions remain exactly those in official API v1.2.39 and predecessor workpacks.
- Stage 2 is verification-only. It starts with deterministic tests and pinned isolated local Supabase, and may use controlled full-local read-only transactions only after exact target identity, backup freshness and authority are recorded.
- Stage 2 must not execute Manual Only or local-production mutations. A necessary mutation becomes an explicit blocker until separately authorized.
- any defect stops release verification, opens a separate failing-test-first TDD repair PR, merges it with independent review/current-head green, and reruns affected plus final evidence on the repaired exact head.

### Final Evidence SHA Contract

- Stage 4의 8-screen runtime artifacts가 commit된 clean head를 하나의 `FINAL_EVIDENCE_SHA`로 고정한다. producer는 broad path를 지우지 않고 create-only `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/`를 새로 만든다.
- `pnpm verify:cooking-meal-log-release:produce -- --attempt-id "$HOMECOOK_CML14_ATTEMPT_ID" --head-sha "$FINAL_EVIDENCE_SHA" --profile full`이 pinned isolated local owning runner, security, performance, query-count, rollback을 실행한다.
- `pnpm verify:cooking-meal-log-release:validate -- --attempt-dir ".artifacts/cooking-meal-log-cross-slice-release-qa/attempts/$HOMECOOK_CML14_ATTEMPT_ID" --attempt-id "$HOMECOOK_CML14_ATTEMPT_ID" --expected-head "$FINAL_EVIDENCE_SHA" --profile full`이 Stage 6 final bundle을 fail closed한다.
- attempt evidence paths:
  - manifest: `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/manifest.json`
  - DB: `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/db-security.json`
  - security: `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/security.json`
  - performance: `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/performance.json`
  - query count: `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/query-count.json`
  - rollback: `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/<attempt_id>/rollback.json`
- 모든 JSON은 같은 `attempt_id`, `head_sha == FINAL_EVIDENCE_SHA`, ISO `generated_at`, profile을 갖고 `passed > 0`, `skipped = 0`, `pending = 0`, `failed = 0`이어야 한다. manifest는 exact artifact byte count/SHA-256을 pin한다.
- timestamp model은 attempt 시작 시각 하나를 모든 artifact와 manifest에 쓰는 `single shared generated_at`이다. artifact별 다른 시각은 hash가 맞아도 거부한다.
- DB payload는 `pinned_isolated_local=true`, `remote_linked_cloud_access=0`; security payload는 `isolated_local=true`, `remote_access=0`, nonempty `mutation_inventory`, classified authorization/Data API negative count를 요구한다. rollback payload는 `current_and_previous=true`, `seeded_v2_drain=true`, `tombstone_fail_closed=true`를 모두 요구한다.
- owning runner child process는 `lane-specific allowlist` 환경만 받는다. ambient migration replacement, integration skip/filter/testNamePattern, PG/DATABASE_URL, Supabase cloud/link/token/credential 값은 전달하지 않는다.
- validator는 explicit attempt만 읽고 `latest` fallback을 사용하지 않는다. 과거 head의 stale artifact, partial/missing attempt, existing attempt overwrite, symlink/path traversal은 final gate를 통과할 수 없다.
- final validator 자체가 repository 안에서 `git rev-parse HEAD`를 실행하고 `--expected-head`/artifact head와 비교하며 `git status --porcelain --untracked-files=all`의 clean worktree를 요구한다. canonical attempt root 밖 `/tmp` evidence, stale expected head, tracked/untracked dirty state는 거부한다.
- `--profile proof`는 Stage 1에서 대표 pinned isolated runner와 모든 artifact/validator 안전장치를 검증하기 위한 비최종 profile이다. Stage 6 `--profile full` validator는 proof artifact를 거부한다.
- performance thresholds: Recall@20 >= 0.90, Precision@20 >= 0.75, DB p95 <= 300ms, route p95 <= 600ms.
- N+1 ceiling: `list20_query_count <= list1_query_count + 1`, `item-level N+1 = 0`; input item 수에 비례하는 SQL/HTTP fan-out은 blocker다.
- query evidence는 source-string count가 아니라 `actual-route-service-boundary` instrumentation이다. production `GET /food-catalog/search` control flow를 1-item/20-item 입력으로 각각 실행해 DB/RPC callback을 측정하고 growth에서 `item_level_n_plus_one`을 계산한다. loop/callback negative fixture는 1→20 growth를 만들어 validator가 fail closed하는지 고정한다.
- complete backend/isolated/security/performance/rollback + browser/design bundle must be terminal green on `FINAL_EVIDENCE_SHA` before Stage 6. 이후 repair가 필요하면 별도 TDD PR merge 뒤 새 SHA를 고정하고 전체를 다시 실행한다.

## Frontend Delivery Mode

- no new UI composition is delivered. Existing predecessor UI and canonical design artifacts are reused.
- required states remain `loading / empty / error / read-only / unauthorized` plus partial/unavailable/conflict/replay/quarantine/legacy compatibility where already contracted.
- fresh real Chrome evidence at 390px, 320px and desktop is Stage 4 evidence, not Stage 1 evidence.
- fixture screenshots never substitute for authorized real local stack evidence.

### Per-screen exact state matrix

| Screen | Required exact states |
| --- | --- |
| `ACCOUNT_QUARANTINE` | loading, error, unauthorized, maintenance, cleanup_pending, pending, replay, conflict, auth-absent support-only |
| `HOME` | loading, empty, error, recipe-only, private/quarantined/deleted nondisclosure |
| `RECIPE_DETAIL` | loading, error, unauthorized, public read-only, owner edit/delete, future-impact conflict |
| `MANUAL_RECIPE_CREATE` | loading, error, unauthorized, validation, dirty-state, managed-image pending/cancel/error |
| `PLANNER_WEEK` | loading, empty, error, unauthorized, completed-shopping read-only, legacy-product read-only/delete |
| `COOK_MODE` | loading, error, unauthorized, maintenance, cancelled read-only, completed read-only, missing, unrecoverable |
| `LEFTOVERS` | loading, empty, error, unauthorized, pending, replay, conflict, missing, unrecoverable, depleted read-only |
| `MEAL_LOG` | loading, empty, error, unauthorized, partial, unavailable, deleted-column, missing, unrecoverable, pending, replay, conflict |

## Design Authority

- UI risk: `high-risk` final cross-slice verification
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`
- Visual artifact: `ui/designs/evidence/cooking-meal-log-cross-slice-release-qa/manifest.json` plus 390/320/desktop PNG paths declared in `automation-spec.json`
- New generator/critic composition: 없음. `generator_required=false`, `critic_required=false`는 아래 merged predecessor artifacts를 재사용한다는 뜻이며 artifact가 N/A라는 뜻이 아니다.
- schema의 단일 `generator_artifact`/`critic_artifact`는 index primary pointer인 `ACCOUNT_QUARANTINE` design/critique를 가리키고, complete 8-screen index는 `frontend.artifact_assertions`와 아래 표가 소유한다.
- HOME의 기존 의미는 `ui/designs/HOME.md`의 Empty/Error `--brand CTA`, rail `overflow-x: auto`, page overflow `0`, `document.documentElement.scrollWidth === clientWidth` 규칙을 재사용한다. `required_screens` 복원 시 `omo-doc-gate`가 exact `primary CTA`/`scroll containment` vocabulary를 강제함을 재현한 뒤, 같은 파일에 semantic-no-op discoverability addendum만 추가했다.
- HOME addendum은 새 composition, behavior, interaction, screenshot 또는 authority verdict를 만들지 않는다. `ui/designs/HOME.md`는 요청 범위의 explicit extra file이며 design-authority-plan task `01a01f2e-bf69-7f23-9c7c-7982855195bc`의 fresh exact-head re-review 대상이다.

| Screen | Merged design | Current critique | Final authority |
| --- | --- | --- | --- |
| `ACCOUNT_QUARANTINE` | `ui/designs/ACCOUNT_QUARANTINE.md` | `ui/designs/critiques/ACCOUNT_QUARANTINE-critique.md` | `ui/designs/authority/ACCOUNT_QUARANTINE-authority.md` |
| `HOME` | `ui/designs/HOME.md` | `ui/designs/critiques/HOME-service-about-guide-critique.md` | `ui/designs/authority/HOME-service-brand-image-assets-authority.md` |
| `RECIPE_DETAIL` | `ui/designs/RECIPE_DETAIL.md` | `ui/designs/critiques/recipe-content-snapshot-future-propagation-design-critic.md` | `ui/designs/authority/recipe-content-snapshot-future-propagation-authority.md` |
| `MANUAL_RECIPE_CREATE` | `ui/designs/MANUAL_RECIPE_CREATE.md` | `ui/designs/critiques/MANUAL_RECIPE_CREATE-critique.md` | `ui/designs/authority/DESIGN_POLISH_SLICE5_MANUAL_YOUTUBE-authority.md` |
| `PLANNER_WEEK` | `ui/designs/PLANNER_WEEK.md` | `ui/designs/critiques/PLANNER_WEEK-critique.md` | `ui/designs/authority/PLANNER_WEEK-authority.md` |
| `COOK_MODE` | `ui/designs/COOK_MODE.md` | `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md` | `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md` |
| `LEFTOVERS` | `ui/designs/LEFTOVERS.md` | `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md` | `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md` |
| `MEAL_LOG` | `ui/designs/MEAL_LOG.md` | `ui/designs/critiques/MEAL_LOG-critique.md` | `ui/designs/authority/MEAL_LOG-authority.md` |

- #12 status: MEAL_LOG design, critique, authority, runtime and OMO evidence are merged; they are no longer future reservations.
- Authority status: fresh #14 exact-head screenshots and a separate final authority report remain required; this author does not approve them.

## Design Status

- [x] 임시 UI (temporary) — #14 fresh exact-head evidence/authority가 아직 없음
- [ ] 리뷰 대기 (pending-review) — Stage 4 evidence 생성 후
- [ ] 확정 (confirmed) — independent Stage 5/final authority blocker 0 후
- [ ] N/A — 이 slice는 high-risk UI 검증을 포함하므로 적용하지 않음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.32.md`
- `docs/화면정의서-v1.5.36.md`
- `docs/유저flow맵-v1.3.34.md`
- `docs/db설계-v1.3.34.md`
- `docs/api문서-v1.2.39.md`
- `docs/engineering/supabase-local-only-operations.md`
- `docs/engineering/workflow-v2/omo-canonical-closeout-state.md`
- approved plan: `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`, SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## QA / Test Data Plan

- Stage 1: exact-six projection test, SOT/workflow/workpack/automation/OMO/closeout validators, lint, typecheck, audit and diff only.
- Stage 2 deterministic: existing focused F0/#1~#13 tests and `pnpm verify:local-supabase-runtime:isolated`; production volume/port/env/secret must not be shared.
- owning focused map은 `automation-spec.json.backend.required_test_targets`에서 F0/#1~#13 exact merge SHA와 한 개 이상의 실제 regression target을 1:1로 연결한다. 특히 #3 visibility, #4 snapshot authority, #5 editor decoupling, #6 customization write core를 별도 command로 실행한다.
- controlled full-local: read-only transaction, target identity, backup freshness and before/after checksum equality only after authority. Mutation, reset, volume delete and migration-history rewrite are prohibited.
- Stage 4: real local stack + real Chrome, owner A/B and the eight screens at 390/320/desktop; unavailable runtime or authority is a blocker rather than a fixture substitution.
- bootstrap expectations remain predecessor-owned (`users`, `recipe_books`, `meal_plan_columns`, account generation/session binding). Missing schema/seed/bootstrap blocks verification.

## Stage 2 Current Evidence

- successor author task `01a020fd-56ef-73a3-9aa3-7a8d44a8541c` on start head `721e562b2f62b5f3efb2fb435e9bc1126297b3e8` rechecked the predecessor/repair ancestry with drift `0`.
- deterministic F0/#1~#13 focused regressions are green: `26 files / 137 tests`; backend gate is green with product `2,757 passed / 175 intended skipped`, build and security E2E `12/12`.
- actual route query-count is `list1=1`, `list20=1`, item-level N+1 `0`; version/rollback/tombstone compatibility is `32/32`.
- successor task sandbox의 Docker preflight 두 번은 capability 경계로 실패했지만, 부모가 같은 branch/HEAD에서 `pnpm verify:local-supabase-runtime:isolated`를 exit `0`으로 재실행했다. CLI `2.110.0`, migration SHA-256 `f2f429121f32d6917e43766f7351e918bcfe40852618793ab5d6105e2735ab0d`, ephemeral project `hcg_88821_e41204`, full migrations+seed+reset, Data API `200`, cleanup을 확인했다.
- retained author evidence: `docs/workpacks/cooking-meal-log-cross-slice-release-qa/evidence/2026-08-21-stage2-verification-author.md`.
- clean head `cb775ed9d9885e7465358bc929794aa9ee90c5ec`의 create-only attempt `stage2-proof-cb775ed9-20260821`은 `profile=proof`, artifact `5`, exact head/profile/clean validator를 통과했다. `.artifacts/cooking-meal-log-cross-slice-release-qa/attempts/stage2-proof-cb775ed9-20260821/`은 retained local evidence이며 final evidence가 아니다.
- proof는 대표 DB lane `20/20`, security `24/24`, query-count `1/1`, rollback `32/32`, performance runner contract `2/2`를 기록한다. performance는 `proof_only`, DB는 대표 lane 한 개뿐이다.
- Stage 2 remains `in_progress`: complete owning DB lanes와 actual performance thresholds, controlled full-local, Stage 3~6, Manual and activation are pending.

## Key Rules

- official tuple is v1.7.32/v1.5.36/v1.3.34/DB v1.3.34/API v1.2.39; this relock is not Contract Evolution.
- full-local is the only Supabase authority. Cloud/linked/remote Supabase target, credential, verifier and fallback are forbidden/N/A.
- evidence is exact-head and time-bounded. Stale, absent, different-head or fixture-only evidence cannot close a gate.
- automated/runtime merged-green and overall lifecycle pending are separate facts; neither is promoted into the other.
- Manual Only and irreversible operations stay unchecked until their own authority and evidence exist.

## Primary User Path

1. Stage 2 verifier confirms the relock reviews/current-head gate and the frozen predecessor runtime merge map.
2. It runs deterministic and pinned isolated local verification without changing product or production state.
3. Authorized Stage 4/5/6 tasks collect exact repaired-head real browser/authority/closeout evidence; any defect leaves this slice and returns only after a separate TDD repair merge.

## Delivery Checklist

Stage 1 approval is complete (`codex_approved`); runtime Delivery Checklist and Stage 2 remain pending.

- [ ] pinned isolated local DB/API/security/performance verification is green on the exact head <!-- omo:id=delivery-cooking-cross-stage2-isolated;stage=2;scope=backend;review=3,6 -->
- [x] predecessor runtime merge map is rechecked and no retained evidence is stale <!-- omo:id=delivery-cooking-cross-stage2-predecessors;stage=2;scope=shared;review=3,6 -->
- [x] defects, if any, use a separate failing-test-first TDD repair PR and full rerun after its merge <!-- omo:id=delivery-cooking-cross-stage2-repair-boundary;stage=2;scope=shared;review=3,6 -->
- [ ] controlled full-local use stays read-only or records separate mutation authority <!-- omo:id=delivery-cooking-cross-stage2-local-authority;stage=2;scope=backend;review=3,6 -->
- [ ] eight-screen real Chrome 390/320/desktop evidence is captured on the exact repaired head <!-- omo:id=delivery-cooking-cross-stage4-browser;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/read-only/unauthorized and contracted edge states are verified <!-- omo:id=delivery-cooking-cross-stage4-states;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh exploratory QA/eval and final authority report have blocker 0 <!-- omo:id=delivery-cooking-cross-stage4-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] current-head checks and independent Stage 6 closeout are terminal green <!-- omo:id=delivery-cooking-cross-stage4-closeout;stage=4;scope=shared;review=6 -->

## Manual Only

- [ ] physical device, VoiceOver/TalkBack and full WCAG verification
- [ ] server-Mac OAuth and controlled local-production/rehearsal evidence requiring operator authority
- [ ] off-Mac encrypted backup, clean restore, RPO/RTO and reboot recovery evidence
- [ ] cutover, capability, R/R+1/R+2, required-key and production activation
- [ ] any local-production mutation, destructive tombstone or legacy orphan deletion
