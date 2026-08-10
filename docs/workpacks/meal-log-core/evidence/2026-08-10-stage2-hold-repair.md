# Meal Log Core Stage 2 HOLD Repair Evidence

## Identity and scope

- Role: fresh Stage 2 HOLD repair author; this task does not approve Stage 3.
- Reviewed head/tree/base: `40f454f31956ff06ff81863c08ab5ea249173325` / `008ffd9dcc5d33e641ba18a593a12f42a20e193d` / `8b1a4cce57e05d282c2a01fc54557ffc129fae1d`.
- Repair implementation head/tree: `5b34af6f4a3f8d7019e1837d66b2f4db681862e5` / `6760952ed9cc8e1940a4432d20f4442d8cd53efb`.
- Current base and merge-base: `11883fb790dbe4664ed5f409fd0b5cf55ee02f41`.
- Branch: `feature/be-meal-log-core-stage3-repair-v2`; final delivery target remains `feature/be-meal-log-core`.
- The latest base was merged without conflict. Its Cloudflare monitoring-only changes do not overlap the meal-log contract.
- A local commit with an invalid Conventional subject remains preserved on `feature/be-meal-log-core-stage3-repair`. The final branch was recreated from its parent with `cherry-pick --no-commit`; no amend, rebase, reset, force push, or remote history rewrite occurred.
- Public contract, capability state, remote database, production, staging, Vercel, OAuth, server-Mac and activation state were not changed.

## TDD evidence

- RED static/unit commit `72b594266195e91b9e5853b65460da85b720d3c7`: 16 tests, 7 expected failures and 9 passes.
- RED PostgreSQL commit `cadda7c05f764a5750b7fc7589d1bb622a53a6d5`: fresh schema reached the real mutation RPC; 10 tests, 1 ACL pass and 9 expected failures.
- Compact projection RED: malformed nested/extra nutrition shape was accepted before the runtime guard.
- Semantic retry RED: UUID case, equivalent timestamp representations and trimmed units produced different RPC payloads before canonicalization.
- GREEN focused: 3 files / 17 tests.
- GREEN fresh PostgreSQL: 1 file / 10 tests against `public.mutate_meal_log_entry` and `public.get_meal_log_day`.

## Finding closure matrix

| ID | Repair evidence | Repair status |
| --- | --- | --- |
| `ML3-BE-001` | batch nutrition uses `actual_amount / finished_weight_g`; source 3종 share six-key compact JSON; complete/partial/unavailable and mixed-source numeric totals execute in PostgreSQL | code/test closed |
| `ML3-BE-002` | approved active exact piece+evidence+source match, size/preparation equality, pinned `conversion_evidence_id`, missing/rejected/stale rejection and same-source PATCH preservation execute in PostgreSQL | code/test closed |
| `ML3-BE-003` | old/new batch UUIDs are locked canonically, then #8 cached projection assertion runs before event writes; remaining/revision/checksum/status drift each proves zero write | code/test closed |
| `ML3-BE-004` | old/new replay shares canonical UUID order; A↔B concurrent PATCH and same-batch multi-entry remainder pass; `40P01` maps to official `409 CONFLICT` | code/test closed |
| `ML3-BE-005` | slot subtotal and day total share the complete/partial/unavailable fold; deleted column, soft-deleted row exclusion and mixed-source totals are checked from the real response | code/test closed |
| `ML3-BE-006` | SQL entry/subtotal/day projections and `MealLogNutritionEvidence` use one compact shape; route projection rejects nested or extra nutrition keys; no public field was added | code/test closed |
| `ML3-BE-007` | POST/PATCH pass the parsed canonical payload; UUIDs and timestamps normalize and units trim before RPC/idempotency hashing; semantic retry test passes | code/test closed |
| `ML3-BE-008` | PostgreSQL coverage now executes service-role ACL plus real create/patch/delete/day RPC, all three sources, drift, evidence and concurrency paths | evidence closed for HOLD; broader Stage 4 remains pending |
| `ML3-BE-009` | pre-push raw inventory is 28 files and reviewed-head checks are terminal `SUCCESS 16 / SKIPPED 2`; successor PR body/current-head inventory is a delivery action after push | pending delivery gate |
| `ML3-GATE-001` | local repair is ready for current-head CI; Draft→Ready is allowed only after successor checks are all terminal success/intended skip | pending delivery gate |

## Verification

- `pnpm verify:backend`: lint/typecheck passed; product `2,713` passed / `160` intended skipped; production build passed; security E2E `12/12` passed.
- fresh `pnpm exec supabase db reset --local`: all migrations applied through `20260810120000_meal_log_core.sql`.
- `pnpm test:meal-log-core:postgres`: `10/10` passed after the fresh reset.
- focused Vitest: `17/17` passed.
- security function contract-only validator: meal-log `11` functions classified and passed.
- source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, closeout, branch and commit validators passed.
- `pnpm audit --audit-level high`: high/critical `0`; residual low `1`, moderate `1`.
- `git diff --check`: passed.
- Full local security environment comparison remains limited by the existing `graphql.get_schema_version()` baseline drift. The broad security PostgreSQL denial suite also terminated its local connection, matching the previously recorded environment limitation; neither is counted green.

## Remaining boundaries

- This repair does not claim Stage 3 approval or Stage 4 completion. A fresh independent Stage 3 rereview must use the delivered successor exact head.
- Broader Stage 4 DST, cleanup, malformed-route zero-write and #12 UI E2E evidence remains pending.
- Manual/server-Mac/OAuth/capability/R/R+1/R+2/activation, merged-exact-SHA release evidence and production writes remain prohibited/pending.
- #10/#11/#12/#14 UI, Planner and analysis ownership was not changed.
- Discord/merge/Stage completion notification was not performed.
