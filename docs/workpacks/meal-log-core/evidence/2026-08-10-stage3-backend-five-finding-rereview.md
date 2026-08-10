# Meal Log Core Stage 3 Backend Five-Finding Rereview

## Verdict

**HOLD** — the five inherited `ML3-FINAL-001`~`005` findings are closed at the reviewed exact head, but fresh source review and rollback-only PostgreSQL probes found one new required P1, `ML3-FINAL-006`. Required unresolved is therefore `1`, so this task does not approve Stage 3.

| Severity | Stage 3 code findings |
| --- | ---: |
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |
| required unresolved | 1 |

The later lifecycle work listed below is not counted as a Stage 3 code finding and does not weaken this HOLD.

## Review identity and scope

- fresh independent reviewer task: `019fea7d-f2e4-79f2-b7e2-13d6ce4324e9`
- repair task: `019fea4d-6962-7ca1-b099-9a82415bfbc1`
- prior immutable HOLD report: `docs/workpacks/meal-log-core/evidence/2026-08-10-stage3-backend-final-rereview.md`
- review mode: report-only; no implementation, PR body, Ready state, merge, remote/production DB, server-Mac, OAuth, capability, activation, Discord, or Claude action
- method: `code-review-and-quality` five-axis source review plus TDD regression-shape review; passing tests were treated as necessary but not sufficient

## Exact input guard

| Field | Reviewed value |
| --- | --- |
| PR | `#1319`, `OPEN`, Ready (`isDraft=false`), `CLEAN`, `MERGEABLE` |
| branch | `feature/be-meal-log-core` |
| base | `b2bfd818dc26f2f2539d3f88128b16759b91656d` |
| head | `bba5302f29a3f310e78469831d56a1a0cb3ed734` |
| tree | `619945e8a33bb91ea21bf56d85f89d54096b30e5` |
| changed files | `33` |
| latest Ready event | `2026-08-10T06:48:50Z` |

The local commit/tree, remote branch, PR head/base, merge-base, body tuple, and file count matched before review. A final pre-publication query again returned the same head/base and the REST merge state `clean`/`mergeable=true`.

Ready-state rollup was independently counted as `15 SUCCESS`, other `0`. The raw current-head check-run inventory was also counted directly rather than inferred from that rollup: `25 total = 23 success + 2 intended skipped` (`lighthouse`, `full-regression`). Of those raw runs, the latest Ready event started `7`, all `success`; raw status contexts were `0`.

The PR body accurately separates local deterministic evidence from the unclaimed Manual/server-Mac/OAuth/capability/R/R+1/R+2/activation and merged-exact lifecycle work. It does not claim Stage 3 approval, merge, production write, or activation.

## Inherited finding closure

| ID | Independent result | Source and executable evidence |
| --- | --- | --- |
| `ML3-FINAL-001` | closed | same-batch PATCH replays after its reversal and after replacement, preserving event-count revision authority; the full #8 assertion and a subsequent valid mutation pass, ending at `640g` |
| `ML3-FINAL-002` | closed | capacity is read after replay credits only the patched entry's reversal; valid increase, exact equality, true overdraw, a second entry, rollback, and same-key replay/event stability pass |
| `ML3-FINAL-003` | closed | piece↔volume and volume→mass use the requested class with the pinned profile/preparation; reuse/reselection, missing, ambiguity, rollback, and evidence IDs pass |
| `ML3-FINAL-004` | closed | product direct relation requires exactly one matching forward or reverse relation; missing/duplicate return `UNIT_CONVERSION_MISSING` with zero writes |
| `ML3-FINAL-005` | closed | shared runtime projectors validate and rebuild every public mutation/day/column/section/entry/total/recent field; negative missing/wrong/extra-type cases pass |

## New P1 finding

### ML3-FINAL-006 — normal profile supersession blocks same-source PATCH from its pinned immutable version

The mutation correctly chooses the entry's already pinned product nutrition version for a same-source product PATCH at `supabase/migrations/20260810120000_meal_log_core.sql:455-465`, and the entry's pinned ingredient profile at `:467-477` and `:565-566`. Both paths then call `private.resolve_meal_log_profile_nutrition`.

That shared resolver rejects the pinned profile when it is no longer `is_active` or its status is no longer `approved|self_reported` at `supabase/migrations/20260810120000_meal_log_core.sql:142-156`. A normal immutable profile replacement changes the prior profile to `is_active=false, review_status='superseded'`; its immutable basis and nutrition values remain available by design. Consequently, a same-source quantity edit cannot recompute from the version/profile that the entry is expressly retaining.

Fresh PostgreSQL 14 probes reproduced both public source types:

1. A product entry created successfully from the forward direct relation at `1 serving` with `100 kcal` and its exact product version pin.
2. In a rollback-only transaction, the pinned nutrition profile was moved through the valid superseded state and the same product was patched to `2 serving` at revision `1`.
3. The RPC raised `RESOURCE_NOT_FOUND` from `resolve_meal_log_profile_nutrition` instead of recalculating from the pinned immutable version. After rollback, the entry digest remained `94ba0b4cb48105bcbd96433a4d6b1835`, revision/amount remained `1/1`, the profile remained `active/approved`, and the failed idempotency key had `0` receipts.
4. The equivalent ingredient probe created `10g` with `10 kcal`, superseded its pinned underlying nutrition profile, and failed a same-source `20g` PATCH with the same `RESOURCE_NOT_FOUND`. Rollback preserved revision/amount `1/10`, restored the profile to `active/approved`, and left `0` receipts for the failed key.

Impact: a routine append-only nutrition correction can make existing product and ingredient entries impossible to edit for quantity while the implementation simultaneously refuses to silently upgrade them to mutable current evidence. This contradicts the workpack's pinned exact-version/profile PATCH boundary and turns a valid same-source edit into a not-found failure.

Required closure:

- separate new-source/profile selection eligibility from recalculation using an entry's already pinned immutable, superseded profile/version;
- preserve the exact pinned product version and ingredient profile/conversion identities for same-source edits without selecting the mutable current replacement;
- keep revoked/invalid evidence semantics fail-closed rather than broadly relaxing all historical statuses;
- add RED→GREEN PostgreSQL regressions for product and ingredient same-source quantity/unit PATCH after a valid profile supersession, including exact pins, nutrition, rollback, and idempotency zero-effect;
- rerun the five inherited regressions and the complete backend/security/policy inventory, then obtain a new fresh independent Stage 3 rereview.

## Confirmed common boundaries

- owner/account-generation RLS, owner filters, direct DML denial, and service-role-only public RPC execution remain intact.
- exact-one source/pinned evidence checks and deferred entry↔active-event owner/batch/pointer constraints remain intact.
- generation-scoped canonical idempotency returns the stored result on exact replay and rejects a reused key with a different canonical payload.
- old/new batch locks use canonical UUID order; the A↔B regression completes without deadlock.
- batch aggregates use the #8 full active-event replay, compact six-field nutrition, original finished weight, exact event checksum, and unweakened checksum/revision/status/remaining assertion.
- slot/day folds preserve complete/partial/unavailable and do not coalesce missing nutrition to zero.
- exercised exception paths roll back entry, event, pointer, projection, and receipt writes.

## Verification evidence

| Verification | Result |
| --- | --- |
| frozen dependency install | PASS |
| fresh local Supabase reset / PostgreSQL 14 migration replay | PASS through `20260810120000_meal_log_core.sql` |
| focused meal-log suite | PASS — `4 files / 21 tests` |
| fresh meal-log PostgreSQL integration | PASS — `1 file / 14 tests` |
| current-vs-future validators | PASS — `4 files / 36 tests` |
| authority evidence validator | PASS — `1 file / 29 tests` |
| same-source superseded-profile PostgreSQL probes | FAIL as `ML3-FINAL-006`; product and ingredient both return `RESOURCE_NOT_FOUND`, with rollback/receipt zero-effect confirmed |
| `pnpm verify:backend` | PASS — lint, typecheck, product `2716 pass / 164 intended skip`, build `81/81`, security E2E `12/12` |
| security-function authorization, contract-only | PASS — meal-log `11` functions classified |
| source/workflow/workpack/automation/bookkeeping/closeout/full PR-ready validators | PASS |
| branch and reviewed commit policy / exact-target diff check | PASS — branch valid, `19` reviewed commits valid, `git diff --check` clean |
| dependency audit at high threshold | PASS — high/critical `0`; existing moderate `1`, low `1` |

The first PostgreSQL test invocation failed before collection because this worktree initially lacked `node_modules` (`vitest not found`). `pnpm install --frozen-lockfile` restored the locked dependencies; the unchanged command then passed `14/14`. This setup failure is not counted as a product test failure.

## Gate and lifecycle handoff

### Stage 3 code gate

`ML3-FINAL-001`~`005` are closed, but new required `ML3-FINAL-006` remains open. Verdict is **HOLD**. The next owner is a separate repair task that adds RED→GREEN coverage and implementation for this one pinned-supersession boundary without changing the public contract or weakening new-source approval checks. A different fresh task must then rereview the exact repair successor.

### Deferred lifecycle gate — ML3-LIFECYCLE-001

The four manual external smokes, merged-exact-SHA server-production/local-rehearsal inventory, Manual/server-Mac/OAuth, capability, R/R+1/R+2, activation, merge, and post-merge evidence remain pending and unclaimed. They are not converted into local code evidence and are not counted in P0/P1/P2, but they remain required at their owning later stages even after a future Stage 3 approval.

## Publication boundary

This report is the only repository change. It is intended for one additive Lore commit and a normal fast-forward push to `feature/be-meal-log-core`. The publication successor head/tree and every check started for that successor are recorded in the task's final handoff after reaching terminal success or intended skip. The report commit does not alter the implementation, PR body, Ready state, merge state, or lifecycle authority.
