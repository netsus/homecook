# meal-log-core Stage 1 repair fresh independent internal 1.5 rereview

## Verdict

- review date: `2026-08-10 KST`
- reviewer task ID: `019fe756-5573-7533-9a0a-90fd2d427746`
- source coordinator task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- repair author task ID: `019fe746-8d84-7cd2-9f12-9c22560e914f`
- prior HOLD reviewer task ID: `019fe738-2551-7be0-993a-deea4bf83de4`
- review role: fresh independent Stage 1 internal 1.5 repair rereviewer
- actor constraint: GPT-5.6-Sol high; Claude was not used
- verdict: **APPROVE**
- findings: **P0 0 / P1 0 / P2 0**
- unresolved required findings: **0**
- Contract Evolution Candidate: **none**

The repair author, prior HOLD reviewer, and this rereviewer are different Codex tasks. This task did not author the repaired Stage 1 contract and does not approve its own product or contract changes. The only write made by this task is this independent report.

## Exact reviewed identity and lineage

| item | exact value |
| --- | --- |
| reviewed head | `f3cd1db5ba3801f425fb0c2c462ffd5a56ba6286` |
| reviewed tree | `ec0b22c049ed7f659d210f832105fd69c12acb98` |
| validated repair content commit | `f950353979ca61ca55ed2a301656fcbc254feb76` |
| validated repair content tree | `454ff0ba541bdb6e59010310a88aec6030a2c965` |
| repair parent / immutable HOLD report | `076c5b22ec91dd600eb387be4930a2582054ac15` |
| governing master base | `c16102a3072e929e45bb24a69464cd3110d03db5` |
| governing base tree | `674bc7bb5979f06759c3653ff4b5bf23fbe1cb1a` |
| report branch | `docs/meal-log-core-stage1-repair-rereview` |
| report commit parent | `f3cd1db5ba3801f425fb0c2c462ffd5a56ba6286` |

Lineage checks passed: `c16102a...` is an ancestor of the reviewed head, `076c5b22...` is the direct parent of `f950353...`, and `f950353...` is the direct parent of the reviewed head. The reviewed head differs from the validated content commit only by four lines that bind the repair evidence to the content commit/tree. The report commit/tree are returned in the final handoff because a commit cannot embed its own identity.

## Reviewed scope and diff audit

The governing-base-to-reviewed-head diff contains only the following expected Stage 1 and evidence surfaces:

- `docs/workpacks/meal-log-core/README.md`
- `docs/workpacks/meal-log-core/acceptance.md`
- `docs/workpacks/meal-log-core/automation-spec.json`
- `.workflow-v2/work-items/meal-log-core.json`
- `.workflow-v2/status.json`
- `tests/meal-log-core-stage1-repair.test.ts`
- `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-internal1-5-review.md`
- `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-repair.md`

`docs/workpacks/README.md`, the current five official documents, product/runtime code, migrations, scripts, `package.json`, and `pnpm-lock.yaml` are unchanged from the governing base. No endpoint, field, enum, status, error code, migration, product behavior, production flag, or capability was added.

## P1 closure

### P1-01 — current tuple and approved cooking-plan lineage

**Closed.** The owned README, acceptance, automation spec, work item, repair evidence, and regression test consistently bind #9 to the current authority:

- requirements `v1.7.30`
- screens `v1.5.34`
- user flow `v1.3.32`
- DB `v1.3.32`
- API `v1.2.37`
- approved Cooking Plan / Meal Log SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, `1,018` lines

The repair does not use the later local-first plan SHA `45f020...` or its `1,056`-line lock as #9 authority. Historical mentions of that incorrect lock remain only inside the immutable HOLD report and negative regression assertions. The current external plan pathname contains a later local-first revision, so the repository-portable approved lineage in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` remains the authority; the work item hash fragment and all active #9 assertions use `d4d0...`.

### P1-02 — malformed UUID idempotency key

**Closed.** POST, PATCH, and DELETE are each locked to exact `400 INVALID_IDEMPOTENCY_KEY` for a malformed UUID `Idempotency-Key`. README, acceptance OMO items, automation invariants/blocked condition/test target/artifact assertion, work-item smoke/assertion, and the regression test all require whole-operation zero-write across:

`mutation / operation / entry / event / pointer / projection / aggregate`

This consumes the existing API v1.2.37 public error contract. It does not create a new status or error code.

## Contract, state, and ownership review

| area | result | evidence-backed conclusion |
| --- | --- | --- |
| API/DB authority | PASS | exact-one source, pinned evidence, entry-event pointer, soft delete, replay and wrapper/error contracts remain aligned with current API/DB |
| runtime predecessor | PASS | #1 + #2 + #4 + #8 runtime/consumer predecessors are merged-green at the governing base as recorded by the immutable HOLD review |
| broader lifecycle | PASS, still pending | runtime availability is not promoted into Manual/server-Mac/OAuth, capability, R/R+1/R+2 or cross-slice activation completion |
| workflow projection | PASS | roadmap remains `docs`; work item and status remain `planned / not_started / pending`, evaluation `not_started`, auto merge false |
| current/future commands | PASS | Stage 1 validators/tests/lint/typecheck/audit/diff are current; PostgreSQL/routes/E2E/server-production/local-rehearsal are future or Manual Only |
| #9 ownership | PASS | meal-log schema/RLS/RPC/read-write routes/types/tests; #8 RPC remains sole batch-event/projection authority |
| #10/#12 exclusion | PASS | Planner shell belongs to #10; MEAL_LOG screen/sheets/consumed CTA/design authority belong to #12 |
| #11 boundary | PASS | #11 is limited to COOK_MODE/LEFTOVERS presentation as an existing #8 mutation consumer and cannot create #9 table/event/pointer/API semantics |
| new contract | none | no unofficial product/API/DB contract was introduced |

## TDD regression quality

The new regression suite is suitable for this docs repair gate:

- it has four descriptive behavior groups for tuple/plan authority, malformed-key zero-write, repair lineage/status, and #9/#11 ownership;
- assertions target exact machine-readable arrays, exact public error wording, route-specific OMO metadata, and explicit negative stale-plan locks;
- running the same test against the immutable HOLD parent produced `1 failed file / 4 failed tests`;
- running it at the reviewed head produced GREEN as part of the focused `6 files / 53 tests` suite;
- the tests are deterministic, use repository-local files only, make no network calls, and contain no timing/sleep dependency.

The suite intentionally locks Stage 1 documentation and projections rather than claiming future runtime behavior. Runtime malformed-key zero-write requires the future Stage 2 route/PostgreSQL tests declared by the workpack.

## Verification

| command / check | result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile unchanged |
| repair-parent RED | PASS as negative evidence; 1 file / 4 tests failed for the four intended repair axes |
| `pnpm validate:source-of-truth-sync` | PASS |
| `BRANCH_NAME=docs/meal-log-core pnpm validate:workpack -- --slice meal-log-core` | PASS |
| `node scripts/validate-automation-spec.mjs --slice meal-log-core` | PASS |
| `pnpm validate:workflow-v2` | PASS |
| `pnpm validate:omo-bookkeeping` | PASS |
| `pnpm validate:closeout-sync -- --slice meal-log-core` | PASS |
| focused Stage 1 Vitest suite | PASS; 6 files / 53 tests |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm audit --audit-level high` | PASS exit 0; low 1 / moderate 1 / high 0 |
| governing-base-to-head and worktree `git diff --check` | PASS |
| official docs / roadmap / product / migration / dependency diff audit | PASS; unchanged |

Runtime/PostgreSQL/route/E2E/server-Mac/OAuth/capability/R/R+1/R+2 and production/staging/external environment checks were not run and are not claimed by this Stage 1 docs rereview.

## Merge readiness and #11 parallel verdict

**Stage 1 repair is merge-ready from the fresh internal 1.5 docs-gate perspective.** P1-01 and P1-02 are closed with P0/P1/P2 `0/0/0` and unresolved required `0`. The report-only commit must be integrated into the repair branch/PR, and that resulting current head must still satisfy the repository's normal review and all-started-checks-green merge gate. This approval does not start Stage 2 or activate any runtime capability.

**#11 parallel verdict: allowed.** After the #9 Stage 1 docs gate is merged and each workpack's own entry conditions are satisfied, #9 Stage 2 backend work and #11 COOK_MODE/LEFTOVERS UI work may proceed in parallel. #11 does not depend on #9 runtime and must remain an existing #8 consumer. Shared projection files such as `docs/workpacks/README.md` and `.workflow-v2/status.json` require one declared branch owner and sequential integration.

No PR was created or reviewed, no merge was performed, no Discord message was sent, no Stage 2 implementation was started, and no activation or external environment mutation occurred.
