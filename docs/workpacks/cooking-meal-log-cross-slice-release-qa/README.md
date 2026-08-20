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

Stage 2 entry still requires this relock PR merge, separate internal 1.5/security-DB-operations/five-axis/design-authority-plan zero-finding reviews, and terminal current-head checks. A later predecessor repair or evidence invalidation fails the gate closed and requires this table to be relocked again.

## Backend First Contract

- request/query/path, response wrapper, status, error, ownership, idempotency and state transitions remain exactly those in official API v1.2.39 and predecessor workpacks.
- Stage 2 is verification-only. It starts with deterministic tests and pinned isolated local Supabase, and may use controlled full-local read-only transactions only after exact target identity, backup freshness and authority are recorded.
- Stage 2 must not execute Manual Only or local-production mutations. A necessary mutation becomes an explicit blocker until separately authorized.
- any defect stops release verification, opens a separate failing-test-first TDD repair PR, merges it with independent review/current-head green, and reruns affected plus final evidence on the repaired exact head.

## Frontend Delivery Mode

- no new UI composition is delivered. Existing predecessor UI and canonical design artifacts are reused.
- required states remain `loading / empty / error / read-only / unauthorized` plus partial/unavailable/conflict/replay/quarantine/legacy compatibility where already contracted.
- fresh real Chrome evidence at 390px, 320px and desktop is Stage 4 evidence, not Stage 1 evidence.
- fixture screenshots never substitute for authorized real local stack evidence.

## Design Authority

- UI risk: `high-risk` final cross-slice verification
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`
- Visual artifact: `ui/designs/evidence/cooking-meal-log-cross-slice-release-qa/manifest.json` plus 390/320/desktop PNG paths declared in `automation-spec.json`
- Reused artifacts: `ui/designs/ACCOUNT_QUARANTINE.md`, `ui/designs/PLANNER_WEEK.md`, `ui/designs/COOK_MODE.md`, `ui/designs/MEAL_LOG.md`, `ui/designs/critiques/MEAL_LOG-critique.md`, `ui/designs/authority/MEAL_LOG-authority.md`
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
- controlled full-local: read-only transaction, target identity, backup freshness and before/after checksum equality only after authority. Mutation, reset, volume delete and migration-history rewrite are prohibited.
- Stage 4: real local stack + real Chrome, owner A/B and the eight screens at 390/320/desktop; unavailable runtime or authority is a blocker rather than a fixture substitution.
- bootstrap expectations remain predecessor-owned (`users`, `recipe_books`, `meal_plan_columns`, account generation/session binding). Missing schema/seed/bootstrap blocks verification.

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

Stage 1 exact-six authoring is complete on this branch; approval is intentionally not started.

- [ ] pinned isolated local DB/API/security/performance verification is green on the exact head <!-- omo:id=delivery-cooking-cross-stage2-isolated;stage=2;scope=backend;review=3,6 -->
- [ ] predecessor runtime merge map is rechecked and no retained evidence is stale <!-- omo:id=delivery-cooking-cross-stage2-predecessors;stage=2;scope=shared;review=3,6 -->
- [ ] defects, if any, use a separate failing-test-first TDD repair PR and full rerun <!-- omo:id=delivery-cooking-cross-stage2-repair-boundary;stage=2;scope=shared;review=3,6 -->
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
