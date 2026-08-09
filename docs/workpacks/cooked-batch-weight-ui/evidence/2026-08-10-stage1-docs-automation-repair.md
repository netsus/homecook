# cooked-batch-weight-ui Stage 1 docs/automation repair evidence

## Role / Independence

- role: Homecook #11 `cooked-batch-weight-ui` Stage 1 fresh docs/automation repair author
- Codex task ID: `019fe75f-aa5e-7e33-b940-3b64df4d9015`
- model/effort: GPT-5.6-Sol / high
- source coordinator task: `019fe028-be31-76f2-a5a7-986000a93374`
- internal 1.5 input task/report: `019fe738-2551-7be0-993a-df0c172c9290` / commit `337daa808971802c79698df64c70240205addba4`
- design critic input task/report: `019fe752-e4f6-7cc1-99b2-c57b438b069a` / commit `ec1f1d816089bdb8973972107f7f0fedd7dbe033`
- Claude CLI/app/API: 사용하지 않음
- self-approval/internal 1.5/critic/authority/Stage 5/6/PR/merge/Discord: 수행하지 않음

이 task는 docs/automation repair author다. 현재 변경을 승인하거나 lifecycle을 올리지 않는다. 새 exact head의 fresh independent internal 1.5와, design-generator repair 뒤 fresh design critic은 별도 task가 수행해야 한다.

## Exact Input / Branch

- requested start branch: `docs/cooked-batch-weight-ui-stage1-design-critique`
- requested start HEAD: `ec1f1d816089bdb8973972107f7f0fedd7dbe033`
- requested start tree: `7d244a636527d1530217b6b99c92b7de84fb6f22`
- independent repair branch: `fix/cooked-batch-weight-ui-stage1-docs-automation-repair`
- repair parent: `ec1f1d816089bdb8973972107f7f0fedd7dbe033`

`pnpm branch:start`는 새 branch를 기본 `origin/master`에서 만들었기 때문에, 파일 변경 전에 깨끗한 새 branch ref만 requested exact HEAD로 바로잡았다. 다른 branch/worktree나 다른 작업자의 변경은 이동·삭제·복구하지 않았다.

## Contract Locks

- current official tuple:
  - requirements `v1.7.30`
  - screens `v1.5.34`
  - Flow `v1.3.32`
  - DB `v1.3.32`
  - API `v1.2.37`
- exact master/base: `c16102a3072e929e45bb24a69464cd3110d03db5`
- exact master tree: `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a`
- approved cooking plan: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines
- API lineage: API v1.2.37 preserves #8 API v1.2.36 section `0-CBW`

## HOLD Repair Results

### Internal 1.5 P1-01 — official tuple / lineage

README, acceptance, automation/work item/status projection을 current tuple과 exact master/tree/approved-plan lock으로 맞췄다. 공식 5종 문서는 수정하지 않았다.

### Internal 1.5 P1-02 — #8 delivery vs broader lifecycle

- #8 Stage 2/3/4: PR #1311 head `2a2cd6fb81265ffa1f49e1c34ee68a26e1ddc49d`, merge `c16102a3072e929e45bb24a69464cd3110d03db5`, merged/green
- whole-board: PR #711 head `55b93ad7d29cfa8cba19e7942b18e6275fdc986a`, merge `2f8569cb56a53e9508d8d9571b94b260ec0bce73`, merged/green
- broader #8 lifecycle: Manual/server-Mac/OAuth, R/R+1/R+2 drain/rollback, capability activation pending

완료된 predecessor fact와 pending lifecycle을 별도 projection으로 잠갔고 stale whole-board dependency 표현을 제거했다.

### Internal 1.5 P1-03 — required Stage 1 structure

README에 Dependencies, Schema Change, Backend First Contract, Frontend Delivery Mode, QA/Test Data Plan, Primary User Path를 추가했다. Acceptance에는 Data Setup/Preconditions를 추가하고 모든 non-manual item을 Stage 4/review 5,6 metadata로 정렬했다. Current Stage 1, future Stage 4, Manual Only commands/evidence도 기계 분리했다.

### Internal 1.5 P1-04 / critic P1-CM-02 / P1-LO-02 — artifact lock

`automation-spec.json`의 supported `frontend.artifact_assertions` index와 dedicated regression이 다음 four exact paths를 순서대로 잠근다.

1. `ui/designs/COOK_MODE.md`
2. `ui/designs/LEFTOVERS.md`
3. `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
4. `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`

README/acceptance/automation canonical paths를 통일했다. 단일 screen, 단일 critic 또는 `COOK_MODE-critique.md` / `LEFTOVERS-critique.md` legacy generic path는 regression failure다.

### Internal 1.5 P1-05 — UI-only ownership

- #11 Stage 2/3: N/A
- #11 implementation: Stage 4 frontend only
- automation backend endpoints/invariants/tests/commands: empty; backend fix rounds: 0
- #9: meal-log DB/API/write/events/pointers owner
- #12: consumed-amount UI owner
- #11: existing #8 client/UI consumer only
- migration, Route Handler, RPC, server helper, backend transaction, public contract extension, direct DML: forbidden
- shared projection integration: sequential

### Internal 1.5 P1-06 — mobile/accessibility/manual contract

README, acceptance, automation이 390px/320px, familiar bottom sheet, 44px target, 16px numeric input, internal scroll/fixed CTA/safe area, focus order/trap/restore/Escape, virtual keyboard, overflow, screen-reader/live error, automated WCAG boundary와 legacy-null/depleted truth를 잠근다.

Stage 4 runtime evidence와 Manual physical keyboard, VoiceOver/TalkBack, real device, server-Mac/OAuth, R/R+1/R+2/activation은 pending이다. Static Markdown/PNG가 이를 증명한다고 주장하지 않는다.

## TDD RED → GREEN

### Environment bootstrap

첫 test runner 호출은 `vitest`가 없는 clean worktree라 exit했다. `pnpm install --frozen-lockfile`을 실행했고 package/lockfile 변경 없이 668 package를 기존 lock에서 설치했다. 이 환경 실패는 semantic RED evidence로 세지 않았다.

### RED

Command:

```text
pnpm exec vitest run tests/cooked-batch-weight-ui-stage1-repair.test.ts
```

Result before docs/automation repair:

- test files: `1 failed`
- tests: `6 failed / 6`
- observed failures: stale tuple, missing PR #1311 dependency truth, `change_type/surface` ownership mismatch, missing four-path artifact index, missing current/future/manual command split, missing required Stage 1/mobile structure

### GREEN

Same focused command after the minimal repair:

- test files: `1 passed`
- tests: `6 passed / 6`

Expanded focused suite:

- test files: `8 passed / 8`
- tests: `78 passed / 78`
- files: new #11 regression plus workflow-v2 docs, automation spec, bookkeeping, doc gate, SOT sync, #8 relock, authority evidence tests

## Validators / Static Verification

| Check | Result |
| --- | --- |
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

`git diff --check`, branch validation, exact file scope and final tree/parent are re-run immediately before the single delivery commit. Delivery commit/tree are reported in the final task handoff to avoid self-referential evidence.

## Lifecycle Projection

- lifecycle: `planned`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- auto-merge eligible: `false`

No `docs`, `complete`, `merged`, approved or activation projection was introduced.

## Remaining Design-Generator-Owned Dependencies

The automation-path finding is repaired here, but design source/report content was intentionally not edited. Current critic HOLD findings that remain design-generator/fresh-critic owned are:

- `P1-CM-01` / `P1-LO-01`: exact design source/review lineage fields
- `P2-CM-01`: COOK_MODE legacy-null/depleted reachability and existing binding
- `P1-LO-03`: required legacy planner-add/done-eating/ATE_LIST/stale-review integration hierarchy and identity boundary
- `P1-LO-04`: cursor pagination UX and accessibility behavior
- `P2-LO-01`: unsupported legacy `[상세 확인]` binding
- `P2-LO-02`: undefined `--border` token reference

After design-generator repair, a fresh independent design critic must review the new exact head/tree. Until then the design gate and overall Stage 1 remain HOLD/not approved.
