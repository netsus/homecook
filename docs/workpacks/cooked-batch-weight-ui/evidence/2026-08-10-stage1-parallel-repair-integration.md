# cooked-batch-weight-ui Stage 1 parallel repair integration

## Role / independence

- role: Homecook #11 `cooked-batch-weight-ui` Stage 1 parallel repair integration author
- integration Codex task ID: `019fe771-88ef-73f1-b787-64522aee3d10`
- design repair task ID: `019fe75f-aa5e-7e33-b940-3b4d486c10fa`
- docs/automation repair task ID: `019fe75f-aa5e-7e33-b940-3b64df4d9015`
- model/effort: GPT-5.6-Sol / high
- Claude CLI/app/API: 사용하지 않음
- integration branch: `docs/cooked-batch-weight-ui-stage1-repair-integration`
- self-approval, fresh critic, fresh internal 1.5, authority, Stage 4/5/6, activation, PR, merge, Discord: 수행하지 않음

이 task는 서로 독립적으로 작성된 두 repair commit을 결합하고 그 결합 상태를 감사하는 author다. 기존 HOLD report를 승인으로 바꾸거나 자기 통합을 승인하지 않는다.

## Exact author objects and file ownership

두 author commit은 exact same parent `ec1f1d816089bdb8973972107f7f0fedd7dbe033`에서 갈라졌고 변경 경로 교집합은 0개였다.

### A. Design findings repair

- task: `019fe75f-aa5e-7e33-b940-3b4d486c10fa`
- branch: `docs/cooked-batch-weight-ui-stage1-design-findings-repair`
- commit: `23356ffc2ad03d136076a91d7e5a677a1dfcf98a`
- tree: `f7e522b0e16c76eafa4f4fa7fcaad6af41fa96ff`
- parent: `ec1f1d816089bdb8973972107f7f0fedd7dbe033`
- owned files:
  - `ui/designs/COOK_MODE.md`
  - `ui/designs/LEFTOVERS.md`
  - `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage1-design-findings-repair.md`

### B. Docs / automation repair

- task: `019fe75f-aa5e-7e33-b940-3b64df4d9015`
- branch: `fix/cooked-batch-weight-ui-stage1-docs-automation-repair`
- original commit: `d75ad5171dbc6971724d98e8bf60047275d8e6e8`
- original tree: `f42387d023c18e5f064ba3701a4cb54e2712eee7`
- original parent: `ec1f1d816089bdb8973972107f7f0fedd7dbe033`
- owned files:
  - `.workflow-v2/status.json`
  - `.workflow-v2/work-items/cooked-batch-weight-ui.json`
  - `docs/workpacks/cooked-batch-weight-ui/README.md`
  - `docs/workpacks/cooked-batch-weight-ui/acceptance.md`
  - `docs/workpacks/cooked-batch-weight-ui/automation-spec.json`
  - `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-stage1-docs-automation-repair.md`
  - `tests/cooked-batch-weight-ui-stage1-repair.test.ts`

## Cherry-pick and combined object

Integration started from exact detached design commit `23356ffc2ad03d136076a91d7e5a677a1dfcf98a`, then created the integration branch and declared branch intent before edits.

`d75ad5171dbc6971724d98e8bf60047275d8e6e8` was applied with ordinary `git cherry-pick`. It produced no conflict and required no manual conflict resolution.

- cherry-picked commit: `5be80d22682cbcee9e256027304710cc6c0c851a`
- cherry-picked tree / two-commit combined tree: `b99051c9a6917f84678667d5d6ee455e97517be0`
- cherry-picked parent: `23356ffc2ad03d136076a91d7e5a677a1dfcf98a`
- original/cherry-picked stable patch ID: `0999b2cddef220faa31d82ade5b8f61f88249e08`
- pre-evidence combined lineage: `ec1f1d816089bdb8973972107f7f0fedd7dbe033` → `23356ffc2ad03d136076a91d7e5a677a1dfcf98a` → `5be80d22682cbcee9e256027304710cc6c0c851a`

이 evidence의 별도 commit은 위 두 author commit 뒤 세 번째 commit으로만 추가한다. 최종 evidence commit/tree는 자기참조를 피하기 위해 commit 후 task handoff에서 보고한다.

## Combined semantic audit

### Current contract and lifecycle locks

- official tuple: requirements `v1.7.30`, screens `v1.5.34`, Flow `v1.3.32`, DB `v1.3.32`, API `v1.2.37`
- Stage 1 master/base: `c16102a3072e929e45bb24a69464cd3110d03db5`; tree `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a`
- approved cooking plan: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines
- API lineage: API v1.2.37 preserves #8 API v1.2.36 section `0-CBW`
- #8 Stage 2/3/4 delivery: PR #1311 head `2a2cd6fb81265ffa1f49e1c34ee68a26e1ddc49d`, merge `c16102a3072e929e45bb24a69464cd3110d03db5`, merged/green
- `cook-mode-whole-board`: PR #711 head `55b93ad7d29cfa8cba19e7942b18e6275fdc986a`, merge `2f8569cb56a53e9508d8d9571b94b260ec0bce73`, merged/green
- broader lifecycle: Manual/server-Mac/OAuth, R/R+1/R+2 drain/rollback and capability activation remain pending
- #11 Stage 2/3: N/A; #11 product implementation: Stage 4 frontend UI only
- #9 owns meal-log DB/API/write/events/pointers; #11 consumes existing #8 client/API contracts; #12 owns consumed-amount add/edit/delete UI
- shared projection integration remains sequential; #11 does not preclaim #9 or #12 surfaces

### Exact Stage 1 artifact index

| Role | Exact path | Combined classification |
| --- | --- | --- |
| COOK_MODE design | `ui/designs/COOK_MODE.md` | repaired generator output; fresh critic pending |
| LEFTOVERS design | `ui/designs/LEFTOVERS.md` | repaired generator output; fresh critic pending |
| COOK_MODE critic | `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md` | historical HOLD input; approval 아님 |
| LEFTOVERS critic | `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md` | historical HOLD input; approval 아님 |

`automation-spec.json`의 supported `frontend.artifact_assertions`와 `tests/cooked-batch-weight-ui-stage1-repair.test.ts`가 위 네 경로를 순서대로 잠근다. 기존 critic 파일은 finding provenance를 보존하기 위해 수정하지 않았으며, repaired combined head를 승인하는 report로 재해석하지 않는다.

### Internal 1.5 closure matrix

| Finding | Combined repair evidence | Integration disposition |
| --- | --- | --- |
| P1-01 current tuple / exact base / lineage | README, acceptance, automation, work item이 current tuple, master/tree, plan hash, v1.2.37 → v1.2.36 `0-CBW`를 잠금 | required repair present; fresh internal 1.5 pending |
| P1-02 #8 delivery와 lifecycle 혼합 | exact PR/head/merge를 merged/green으로 기록하고 Manual/server-Mac/OAuth/R/R+1/R+2/activation을 별도 pending으로 유지 | required repair present; fresh internal 1.5 pending |
| P1-03 Stage 1 구조/metadata 누락 | Dependencies, Schema Change, Backend First Contract, Frontend Delivery Mode, QA plan, Primary User Path, Data Preconditions, Stage 4 metadata 추가 | required repair present; fresh internal 1.5 pending |
| P1-04 two-design/two-critic lock | exact four-path index와 누락/generic-path 회귀 테스트 추가 | required repair present; fresh internal 1.5 pending |
| P1-05 UI-only ownership 불명확 | backend arrays/commands empty, backend fix round 0, Stage 2/3 N/A, Stage 4 UI, #9/#12 경계 고정 | required repair present; fresh internal 1.5 pending |
| P1-06 mobile/accessibility/manual 경계 | 390/320, bottom sheet, 44px/16px, scroll/fixed CTA/safe area, focus/keyboard/overflow/screen reader/WCAG와 Manual 분리 | required repair present; fresh internal 1.5 pending |

### Design critic closure matrix

두 critic의 중복을 합친 unique starting findings는 `P0/P1/P2 = 0/4/3`이다.

| Unique finding | Source IDs | Combined repair evidence | Integration disposition |
| --- | --- | --- | --- |
| lineage evidence role 혼합 | P1-CM-01, P1-LO-01 | 두 design header가 reviewed design input, internal HOLD, critic HOLD/repair base를 exact object와 비승인 역할로 분리 | repair present; fresh critic pending |
| two-design/two-critic 기계 lock 부재 | P1-CM-02, P1-LO-02 | design-side four-artifact index + automation `artifact_assertions` + regression test가 함께 존재 | repair present; fresh critic pending |
| legacy LEFTOVERS 기능 소실 | P1-LO-03 | legacy `/leftovers`와 v2 `/cooked-batches`를 독립 section/read model로 분리하고 planner-add/다먹음/ATE_LIST/덜먹음/stale-review를 보존 | repair present; fresh critic pending |
| cursor pagination UX 부재 | P1-LO-04 | `더 보기`, has-next/cursor, pending/error/retry/422 refresh, stable append, duplicate protection, focus/live announce를 정의 | repair present; fresh critic pending |
| COOK_MODE unreachable legacy/depleted | P2-CM-01 | `N/A — LEFTOVERS read-model only`, hidden GET/new field/guessed state 금지, COOK_MODE runtime evidence 제외 | repair present; fresh critic pending |
| unsupported `[상세 확인]` | P2-LO-01 | action 제거; exact 15-field list card 자체로 read-only legacy-null truth 완결 | repair present; fresh critic pending |
| nonexistent `--border` | P2-LO-02 | canonical `--line`과 existing `--danger-border` 사용, 새 token/hex 금지 | repair present; fresh critic pending |

이 표의 `repair present`는 결합 bytes에 요구 보수가 존재한다는 author-side 감사 결과일 뿐 독립 승인 verdict가 아니다. 전체 Stage 1은 fresh critic과 fresh internal 1.5가 새 exact head/tree를 검토해 unresolved required finding 0을 확인할 때까지 HOLD/not approved다.

## No-new-contract and unchanged-surface audit

- 새 endpoint, request/response field, HTTP status, public error code, action enum, mutation, DB/RPC/migration, Route Handler, server helper, backend write transaction 또는 direct DML을 추가하지 않았다.
- official 5 docs, `docs/workpacks/README.md` roadmap, product code under `app/`, `components/`, `lib/`, `types/`, `supabase/migrations/`, `package.json`, `pnpm-lock.yaml`은 repair base `ec1f1d816089bdb8973972107f7f0fedd7dbe033` 대비 변경 0이다.
- 변경은 A의 design 3개 경로, B의 #11 docs/automation/status/test 7개 경로, 이 integration evidence 한 경로에만 한정한다.

## Verification

환경 bootstrap 전 첫 focused Vitest 시도는 `vitest` 미설치로 exit 254였다. 이는 semantic test failure가 아니다. `pnpm install --frozen-lockfile`로 668 packages를 기존 lockfile에서 복원했고 `package.json`/`pnpm-lock.yaml` 변경은 0이다.

| Check | Result |
| --- | --- |
| combined focused Vitest: new #11 regression + workflow/OMO/SOT/authority + #8 API contract/compatibility + LEFTOVERS frontend | `11 files / 129 tests` pass |
| `pnpm validate:source-of-truth-sync` | pass |
| `pnpm validate:workflow-v2` | pass |
| `BRANCH_NAME=docs/cooked-batch-weight-ui pnpm validate:workpack -- --slice cooked-batch-weight-ui` | pass |
| `node scripts/validate-automation-spec.mjs --slice cooked-batch-weight-ui` | pass |
| `pnpm validate:omo-bookkeeping` | pass |
| `pnpm validate:authority-evidence-presence -- --slice cooked-batch-weight-ui` | pass |
| `pnpm validate:closeout-sync -- --slice cooked-batch-weight-ui` | pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm audit --audit-level high` | exit 0; high/critical 0, residual low 1 / moderate 1 |
| original/cherry-picked stable patch identity | same patch ID `0999b2cddef220faa31d82ade5b8f61f88249e08` |
| author path intersection / cherry-pick conflict | 0 paths / no conflict |
| `git diff --check` | pass |

최종 evidence commit 뒤 branch, commit-message, diff, exact lineage/tree/parent, clean worktree와 같은 focused/validator set을 다시 확인하고 task handoff에 최종 값을 기록한다.

## Remaining gates and manual limits

- fresh independent design critic: required on the final integration head/tree
- fresh independent internal 1.5: required on the final integration head/tree
- Stage 4 runtime implementation/evidence, Stage 5, final product-design-authority and Stage 6: pending
- physical keyboard focus order/trap/restore/Escape, VoiceOver/TalkBack, real 390px/320px device safe area and virtual keyboard: Manual pending
- server-Mac/OAuth, R/R+1/R+2 drain/rollback and capability activation: broader lifecycle pending; not performed here
- PR, merge, Discord, authority, activation: prohibited and not performed by this task

따라서 현재 결합 상태는 **두 repair lane의 required changes가 함께 존재하고 deterministic checks가 green인 integration author output**이며, Stage 1 APPROVE 또는 lifecycle promotion은 아니다.
