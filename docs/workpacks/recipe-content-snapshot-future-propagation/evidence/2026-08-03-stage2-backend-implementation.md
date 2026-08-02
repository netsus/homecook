# Stage 2 backend implementation evidence — 2026-08-03

## Scope and role

- Role: Stage 2 backend implementer/orchestrator. This task does not self-approve formal Stage 3.
- Original base: `origin/master` exact `487847419319c61cf2f53f025741a5782357ef86`.
- Integrated base-governance repairs: PR `#1279`, merge commit `c4f969fb20b91348b5a94b19e52f277e453475ed`; PR `#1280`, merge commit `53ebcc325665da1d7f0c2c304d4b3e73c0d7612c`.
- Branch: `feature/be-recipe-content-snapshot-future-propagation`.
- Draft PR: `#1278`.
- Current implementation/test head before this final evidence projection: `ea7766fbff2fb9ae894b636336fa6eb4e2537d64`.
- Production/staging/remote application writes: `0/0/0`.
- Claude, capability activation, provider mutation and server-production migration were not used.

## TDD RED → GREEN

The locked Stage 2 tests were committed before production implementation.

- RED commit after history normalization: `0e5f89aa127762fc87904f027a35acd3498d54e3`.
- Initial RED: four focused files recorded 13 expected failures; the PostgreSQL runner failed because the dedicated migration did not exist.
- The route/security and PostgreSQL suites were expanded before implementation in `c044cd41` and `b87d15bb` to lock official response shapes, non-disclosure, idempotency, atomic rollback, lock order, shopping reconciliation and snapshot-v2 start/read/cancel behavior.
- Final locked GREEN: `4 files / 40 tests`.
- Focused consumer/serving regression: `3 files / 44 tests`.

Locked command:

`pnpm exec vitest run tests/recipe-content-snapshot-future-propagation.test.ts tests/recipe-future-impact-security.test.ts tests/snapshot-v2-session-attempts.test.ts tests/recipe-shopping-reconciliation.test.ts`

## Implemented dormant authority

- `POST /recipes/{id}/future-plan-impact` and owner PATCH/DELETE routes authenticate before body/path validation, use the official wrapper/error surface and delegate final authority to transaction RPCs.
- Preview binds owner, generation, exact session, recipe revision, canonical draft, target Meal revisions and active claim/session state without mutating domain rows.
- PATCH `keep` and `replace_all`, stale/claim failure, replay/conflict, incomplete shopping reconciliation and historical/completed immutability are handled under the common DB lock order.
- Meal create/update/delete and shopping create no longer use a lock-only RPC followed by REST mutation on the converted path.
- Snapshot-v2 planner/standalone start, immutable read and idempotent cancel are deployed dormant. Creation-off remains mutation-free while an existing seeded v2 session can still read/cancel and replay.
- Planning/shopping groups use `(recipe_id, recipe_content_snapshot_id)`. Recipe-level serving totals are allocated as deterministic integers only after Meal selection, so a one-serving request selects one content group and never produces a zero-serving RPC row.
- Exact-pantry completion and R/R+1→R+2 activation remain owned by #8; v1 tombstone/cutover remains owned by #13.

## Disposable PostgreSQL evidence

Command: `pnpm test:recipe-content-snapshot-future-propagation:postgres`

- Fresh: predecessor snapshot authority `15 pass / 1 intended skip`; #7 `10/10`; central full-local security inventory `30 pass / 16 inactive skip`.
- Replay: predecessor snapshot authority `16/16`; #7 `10/10`; central full-local security inventory `30 pass / 16 inactive skip`.
- #7 proves preview DML denial/no-write, keep/replace-all eligibility, completed-shopping/history stability, stale/target/predecessor/claim rollback, PATCH idempotency, capability-off zero-write, start replay after claim and flag-off, immutable v2 read with exact product/version provenance, cancel/replay claim release and one concurrent planner-start winner.
- The runner uses repository-owned disposable PostgreSQL clusters and cleans them up. It applies no production/staging/remote migration.

## Repository verification

- `pnpm verify:backend`: lint and typecheck passed; product tests `205 files`, `2,589 pass / 139 intended skip`; production build passed; security Playwright `12/12` passed.
- Focused shopping/snapshot consumer/session-attempt tests: `44/44` passed.
- `pnpm audit --audit-level high`: high/critical `0`; one pre-existing low advisory.
- Frozen-lockfile install, source/workflow/workpack/automation/bookkeeping validators, security-function contract classification and `git diff --check` passed before the evidence projection; they are rerun on its final head.

## Draft PR quality-gate repair

- Draft PR #1278 exact head `c8057fc878f4a8ad7d34072aa1c617eef455a4c0` initially had `12` successful checks, `2` intended skips and one failed `CI / quality` check. The failure was confined to predecessor static/inventory locks that still required zero PATCH/DELETE and zero service-role entries.
- Local RED reproduced `7` failures across the hybrid, predecessor and permission suites. A following full `pnpm test` exposed the same missing account-session route classifications.
- The repair reuses the full-local verifier's exact allowlist: eight verified-session user routes and one public compatibility route are allowed by exact file/count, with unapproved or missing entries remaining fail-closed. The account-session inventory now classifies the five Stage 2 mutation/preview routes explicitly.
- Focused repair verification passed `6 files / 73 tests`; generated hybrid and account-session inventories validate cleanly.
- A full-suite rerun exposed one existing HOME loading race under parallel load; the assertion now waits for its asynchronous theme heading. Final local `pnpm test`: `499 files passed / 28 intended skip`, `5,125 tests passed / 318 intended skip`.

## Base-governance repair integration

- Ready validation exposed an invalid Stage 2/4 shared-review checklist shape already present on the base branch. Separate docs PR `#1279` split backend and frontend obligations without changing the public product contract and merged as `c4f969fb20b91348b5a94b19e52f277e453475ed`.
- Merge commit `9160152129d9676dedba2804a00bdc6e8d1dcbd0` preserves only evidenced Stage 2 backend completion and leaves the new Stage 4 component, navigation, E2E and frontend-review items unchecked.
- Post-integration verification: checklist contract `96` valid items; focused CI-repair suite `6 files / 73 tests`; full Vitest `499 files passed / 28 intended skip`, `5,125 tests passed / 318 intended skip`; `pnpm verify:backend` product tests `205 files`, `2,589 pass / 139 intended skip`, production build and security Playwright `12/12`; source/workflow/workpack/bookkeeping/closeout validators and `git diff --check` passed.
- A second Ready attempt exposed full-lifecycle Stage 4 visual and Stage 6 merged-exact smoke requirements in the Stage 2 automation gate. Docs PR `#1280` retained exact current-head backend/local-rehearsal evidence for Stage 2 while preserving the later evidence in the workflow-v2 work item; it merged as `53ebcc325665da1d7f0c2c304d4b3e73c0d7612c` after exact-head checks and independent P0/P1/P2 `0/0/0` reviews.

## Independent auxiliary reviews

- Code/quality reviewer `/root/slice7_stage2_code_review` approved the implementation plus the one-serving snapshot-group regression with P0/P1/P2 `0/0/0`.
- Security reviewer `/root/slice7_stage2_security_review` approved exact code head `2378ec6b869fe2e4408345c720374cf899e7ad29` with P0/P1/P2 `0/0/0` after authentication-first repairs. The later `b4af7c35` commit changes tests only.
- These role-separated reviews are implementation feedback, not the separate-task formal Stage 3 approval required by `AGENTS.md` and the slice workflow.

## Full-local composite verifier repair

- Actual RED: with the #7 target migration selected, `HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION=supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql pnpm test:recipe-content-snapshot-future-propagation:postgres` failed the active full-local Auth/DB foundation subtest because the snapshot verifier did not include the personal recipe function contract in both its generated inventory and its result assertion.
- GREEN: the verifier now applies `HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS=1` symmetrically to inventory build and assertion. Focused verifier tests passed `2 files / 35 tests`; the composite PostgreSQL fresh/replay runner passed #7 `10/10` and active full-local inventory `30 pass / 16 intended skip` in each cycle.
- Independent code and security reviews of this two-file runtime/test repair approved with P0/P1/P2 `0/0/0`. The change widens only the read-only fail-closed inventory under an existing explicit opt-in; loopback, credential filtering and production/staging/remote write boundaries are unchanged.

## Explicit pending gates

- Draft PR #1278 current-head GitHub checks are pending.
- Formal Stage 3 must run in a different Codex task ID; this Stage 2 task cannot self-approve or merge.
- A slice-named browser E2E spec does not yet exist; the grep returns “No tests found” and is not claimed green. Stage 4 owns component/E2E/design evidence.
- Real local Supabase two-owner evidence, merged-exact-SHA server-production/local-rehearsal read-only inventory, Manual Only evidence and #8 R/R+1 compatibility/activation remain pending.
- Personal recipe and snapshot-v2 creation capabilities remain off. Contract Evolution Candidate: none.
