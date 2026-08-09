# meal-log-core Stage 1 HOLD repair evidence

## Identity and exact lineage

- repair author task ID: `019fe746-8d84-7cd2-9f12-9c22560e914f`
- source coordinator task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- independent reviewer task ID: `019fe738-2551-7be0-993a-deea4bf83de4`
- branch: `docs/meal-log-core-stage1-repair`
- governing master base: `c16102a3072e929e45bb24a69464cd3110d03db5`
- repair parent / immutable HOLD report commit: `076c5b22ec91dd600eb387be4930a2582054ac15`
- repair start tree: `f89f56be65e142f0c5693ec42a3d63e596317721`
- validated repair content commit: `f950353979ca61ca55ed2a301656fcbc254feb76`
- validated repair content tree: `454ff0ba541bdb6e59010310a88aec6030a2c965`
- HOLD report: `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-internal1-5-review.md` (read-only)
- self-approval: forbidden
- fresh independent internal 1.5 rereview required

The final branch head after this evidence-only record commit is intentionally reported in the task handoff rather than embedded here because a commit cannot contain its own SHA.

The current external plan file is a later local-first revision. The approved #9 Cooking Plan / Meal Log lineage is instead the repo-portable authority in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines.

## TDD RED

Command:

```text
pnpm exec vitest run tests/meal-log-core-stage1-repair.test.ts
```

Result before repair: `1 failed file / 4 failed tests`. The failures independently exposed the stale official tuple/plan lineage, missing malformed-key exact error and zero-write contract, missing repair lineage evidence/status projection, and missing #9/#11 parallel ownership lock.

The first attempted RED command before dependency installation returned `vitest not found` and is not counted as behavior evidence. `pnpm install --frozen-lockfile` completed without lockfile changes, then the valid RED above was recorded.

## Finding closure map

| Finding | Repair projection | Status |
| --- | --- | --- |
| P1-01 | README official tuple/no-contract-invention, approved `d4d0...`/1,018-line plan, automation/work-item refs and assertions, exact repair lineage, planned/not-started/pending status | author repair complete; fresh independent rereview pending |
| P1-02 | README exact `400 INVALID_IDEMPOTENCY_KEY`, three route-specific acceptance items with OMO metadata, seven-surface zero-write automation/test/artifact/handoff contract | author repair complete; fresh independent rereview pending |

No official requirement, screen, flow, DB, API, migration, public endpoint, field, status, error, action or product code changed.

## GREEN and validators

| Command / evidence | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile unchanged |
| dedicated repair regression | PASS; 1 file / 4 tests |
| focused Stage 1 suite | PASS; 6 files / 53 tests |
| `pnpm validate:source-of-truth-sync` | PASS |
| `BRANCH_NAME=docs/meal-log-core pnpm validate:workpack -- --slice meal-log-core` | PASS |
| `node scripts/validate-automation-spec.mjs --slice meal-log-core` | PASS |
| `pnpm validate:workflow-v2` | PASS |
| `pnpm validate:omo-bookkeeping` | PASS |
| `pnpm validate:closeout-sync -- --slice meal-log-core` | PASS |
| JSON parse for automation/work item/status | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm audit --audit-level high` | PASS, exit 0; low 1 / moderate 1 / high 0 |
| `git diff --check` | PASS |

Focused Stage 1 command:

```text
pnpm exec vitest run tests/meal-log-core-stage1-repair.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts tests/omo-doc-gate.test.ts tests/source-of-truth-sync.test.ts
```

Runtime/PostgreSQL/route/E2E/server-Mac/OAuth/capability/R/R+1/R+2 checks remain future or Manual Only and are not claimed here.

## Changed files

- `docs/workpacks/meal-log-core/README.md`
- `docs/workpacks/meal-log-core/acceptance.md`
- `docs/workpacks/meal-log-core/automation-spec.json`
- `.workflow-v2/work-items/meal-log-core.json`
- `.workflow-v2/status.json`
- `tests/meal-log-core-stage1-repair.test.ts`
- `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-repair.md`

`docs/workpacks/README.md` remains unchanged because its existing #9 `docs` projection and #1+#2+#4+#8 dependency row are already exact. Broader lifecycle, Manual Only evidence and activation are not promoted.

## Parallel ownership handoff

#9 Stage 2 owns the meal-log schema/RLS/RPC/routes/types/tests. #11 may proceed in parallel only as the existing #8 mutation consumer for COOK_MODE/LEFTOVERS presentation and must not create or modify #9 table/event/pointer/API semantics. #10 continues to own Planner shell and #12 continues to own MEAL_LOG screen, sheets, consumed UI/CTA and design authority. Shared roadmap/status projections require one branch owner and sequential integration.
