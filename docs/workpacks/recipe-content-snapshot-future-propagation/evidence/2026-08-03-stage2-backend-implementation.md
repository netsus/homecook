# Stage 2 backend implementation evidence — 2026-08-03

## Scope and role

- Role: Stage 2 backend implementer/orchestrator. This task does not self-approve formal Stage 3.
- Original base: `origin/master` exact `487847419319c61cf2f53f025741a5782357ef86`.
- Integrated base-governance repairs: PR `#1279`, merge commit `c4f969fb20b91348b5a94b19e52f277e453475ed`; PR `#1280`, merge commit `53ebcc325665da1d7f0c2c304d4b3e73c0d7612c`.
- Branch: `feature/be-recipe-content-snapshot-future-propagation`.
- Draft PR: `#1278`.
- Current code/test evidence head before this evidence projection: `1a1d38b9a9675ba66e68ea713c24e37df0683150`.
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
- A full-suite rerun exposed one existing HOME loading race under parallel load; the assertion now waits for its asynchronous theme heading. After the verifier regression was added, final local `pnpm test`: `499 files passed / 28 intended skip`, `5,126 tests passed / 318 intended skip`.

## Base-governance repair integration

- Ready validation exposed an invalid Stage 2/4 shared-review checklist shape already present on the base branch. Separate docs PR `#1279` split backend and frontend obligations without changing the public product contract and merged as `c4f969fb20b91348b5a94b19e52f277e453475ed`.
- Merge commit `9160152129d9676dedba2804a00bdc6e8d1dcbd0` preserves only evidenced Stage 2 backend completion and leaves the new Stage 4 component, navigation, E2E and frontend-review items unchecked.
- Post-integration verification: checklist contract `96` valid items; focused CI-repair suite `6 files / 73 tests`; final full Vitest `499 files passed / 28 intended skip`, `5,126 tests passed / 318 intended skip`; `pnpm verify:backend` product tests `205 files`, `2,589 pass / 139 intended skip`, production build and security Playwright `12/12`; source/workflow/workpack/bookkeeping/closeout validators and `git diff --check` passed.
- A second Ready attempt exposed full-lifecycle Stage 4 visual and Stage 6 merged-exact smoke requirements in the Stage 2 automation gate. Docs PR `#1280` retained exact current-head backend/local-rehearsal evidence for Stage 2 while preserving the later evidence in the workflow-v2 work item; it merged as `53ebcc325665da1d7f0c2c304d4b3e73c0d7612c` after exact-head checks and independent P0/P1/P2 `0/0/0` reviews.

## Independent auxiliary reviews

- Code/quality reviewer `/root/slice7_stage2_code_review` approved the implementation plus the one-serving snapshot-group regression with P0/P1/P2 `0/0/0`.
- Security reviewer `/root/slice7_stage2_security_review` approved exact code head `2378ec6b869fe2e4408345c720374cf899e7ad29` with P0/P1/P2 `0/0/0` after authentication-first repairs. The later `b4af7c35` commit changes tests only.
- These role-separated reviews are implementation feedback, not the separate-task formal Stage 3 approval required by `AGENTS.md` and the slice workflow.

## Full-local composite verifier repair

- Actual RED: with the #7 target migration selected, `HOMECOOK_RECIPE_SNAPSHOT_FOLLOWUP_TARGET_MIGRATION=supabase/migrations/20260802210000_recipe_content_snapshot_future_propagation.sql pnpm test:recipe-content-snapshot-future-propagation:postgres` failed the active full-local Auth/DB foundation subtest because the snapshot verifier did not include the personal recipe function contract in both its generated inventory and its result assertion.
- GREEN: the verifier now applies `HOMECOOK_PERSONAL_RECIPE_SECURITY_FUNCTIONS=1` symmetrically to inventory build and assertion. Focused verifier tests passed `2 files / 35 tests`; the composite PostgreSQL fresh/replay runner passed #7 `10/10` and active full-local inventory `30 pass / 16 intended skip` in each cycle.
- Independent code and security reviews of this two-file runtime/test repair approved with P0/P1/P2 `0/0/0`. The change widens only the read-only fail-closed inventory under an existing explicit opt-in; loopback, credential filtering and production/staging/remote write boundaries are unchanged.

## PostgreSQL 15 catalog compatibility repair

- Other-Mac isolated local smoke at exact head `ace8d98674265190ebc0f026223f2c3b555e1a5b` stopped before the behavioral matrix because the central full-local inventory directly referenced PostgreSQL 16+ `pg_auth_members.inherit_option` and `set_option`; production/staging/remote application writes remained `0/0/0`.
- Local PostgreSQL `15.18` reproduced the RED exactly: both catalog columns were absent and the direct select failed with `column membership.inherit_option does not exist`.
- The inventory now detects the catalog shape without directly referencing absent columns. PostgreSQL 16+ reads the per-membership options through `to_jsonb`; PostgreSQL 15 maps its equivalent semantics to the member role's `rolinherit` value and membership `SET ROLE=true`. The expected `admin=false, inherit=false, set=true` contract remains unchanged.
- The generated full-local inventory SQL executed successfully against the disposable PostgreSQL 15 fixture. Focused verifier tests passed `21/21`; the composite fresh/replay runner again passed predecessor `15 pass / 1 intended skip` then `16/16`, #7 `10/10` twice, and full-local inventory `30 pass / 16 intended skip` twice.
- Fresh `pnpm verify:backend` passed lint, typecheck, product tests `205 files / 2,591 pass / 139 intended skip`, production build and security Playwright `12/12`; full Vitest passed `499 files / 5,127 tests` with `28 files / 318 tests` intentionally skipped. Source/workflow/workpack/automation/bookkeeping/closeout/branch validators, audit (high/critical `0`, one pre-existing low) and `git diff --check` also passed. The failed other-Mac behavioral matrix is not retroactively claimed green and must rerun on the repaired exact head.

## PostgreSQL 15 membership-drift mutation repair

- The other-Mac rerun at exact head `dbd4656652432fc9e0ce6da0c09749adafa7dc65` proved that the catalog compatibility repair worked, but the active negative test still injected membership drift with PostgreSQL 16+ syntax: `revoke set option for authenticated from authenticator`. PostgreSQL `15.15` therefore stopped the full-local verifier at `29 pass / 1 fail / 16 intended skip` before the behavioral matrix. Production/staging/remote application writes remained `0/0/0`.
- The mutation helper is now version-gated. PostgreSQL 16+ continues to revoke the per-membership `SET` option; PostgreSQL 15 changes `authenticator` from `NOINHERIT` to `INHERIT`, which violates the same expected `inherit=false` membership contract. The negative security assertion remains active on both versions and is not skipped or weakened.
- A disposable PostgreSQL `15.18` fixture proved that the fallback changes `authenticator.rolinherit` to `true`. The focused helper test passed `1/1`; the composite fresh/replay runner passed predecessor `15 pass / 1 intended skip` then `16/16`, #7 `10/10` twice, and full-local inventory `31 pass / 16 intended skip` twice.
- Fresh `pnpm verify:backend` passed lint, typecheck, product tests `205 files / 2,591 pass / 139 intended skip`, production build and security Playwright `12/12`. Full Vitest passed `500 files / 5,128 tests` with `27 files / 318 tests` intentionally skipped.
- The other-Mac behavioral matrix remains pending and must rerun on the new exact head produced by this repair. No blocked item from the earlier result is claimed green by local inference.

## Official isolated full-local and release compatibility fixture

- The other-Mac rerun at exact head `8c9be695e03044c1cd7634383759413d5e1dc94b` passed the composite PostgreSQL prerequisite and every PostgreSQL behavioral row, but correctly left two gates blocked because the repository had no official real-Auth two-owner fixture and no executable current/immediate-previous release fixture.
- The repository now owns an opt-in local collector, full-local adapter and verifier. It allocates loopback-only ports, boots disposable PostgreSQL/Auth/Data plus current and immediate-previous app checkouts, writes a mode `0600` sanitized report, and cleans the isolated resources in `finally`. It refuses execution without explicit full SHAs, opt-in and exact current checkout identity.
- Exact current-head execution passed at `1a1d38b9a9675ba66e68ea713c24e37df0683150` against immediate previous `53ebcc325665da1d7f0c2c304d4b3e73c0d7612c`. The collector report was `2060` bytes with mode `0600`; its compose project had no surviving container after completion.
- Real local Auth calls used two distinct owners. Missing-recipe and other-owner preview/PATCH each returned the same `404 RESOURCE_NOT_FOUND`; recipe, content, Meal, shopping, session and claim digests were unchanged (`6/6`).
- Both current and immediate-previous release apps preserved the locked legacy-v1 validation wrapper while personal-recipe-v2 and snapshot-v2 creation flags remained off. Private manual personal-recipe rows, distinct personal-recipe owners, preview/session/claim deltas and personal-v2 idempotency deltas were independently `0` for both releases. Production, staging and remote application writes were `0`.
- The current local integration test passed `1/1`; the exact-head command-line collector and independent report verifier also passed. This closes the missing two-owner non-disclosure and current/immediate-previous compatibility fixture gaps without claiming server-production evidence or capability activation.

## Exact privileged-client inventory alignment

- Future propagation preview/PATCH now use the dedicated `createRecipeFuturePropagationInternalClient`; they no longer appear in the generic service-role inventory. The exact generic verified-session count is therefore `7` and the public generic count is `0`. A separate fail-closed internal-operation inventory counts the dedicated factory at exactly the preview and recipe routes; generic and scoped-internal violations both remain `0`.
- RED was observed in the full suite where the old `8`-entry hybrid expectation and route mock remained locked. The verifier, generated inventory and tests were updated together; focused authority/security tests passed `31/31`.
- Fresh independent code review then found that the scoped client was not yet represented in the separate exact internal-operation inventory and that `personal_entry_count` duplicated the idempotency query instead of measuring domain rows. Two focused RED failures were recorded. The internal allowlist/generated artifact now counts both scoped route calls, and the release collector reads private manual recipe rows/distinct owners independently from the one personal idempotency query. Focused tests passed `46/46`; the real isolated local integration passed `1/1` in `103.55s`; the final exact-head collector/verifier passed again.
- Fresh `pnpm verify:backend` passed lint, typecheck, product tests `209 files / 2,605 pass / 140 intended skip`, production build and security Playwright `12/12`. Fresh full Vitest passed `504 files / 5,152 tests` with `28 files / 320 tests` intentionally skipped.
- The composite PostgreSQL fresh/replay runner passed predecessor `15 pass / 1 intended skip` then `16/16`, #7 `10/10` twice, and active full-local inventory `31 pass / 17 intended skip` twice on the active ordered migration chain.

## Explicit pending gates

- Draft PR #1278 has not yet run GitHub checks for code evidence head `1a1d38b9a9675ba66e68ea713c24e37df0683150`; prior-head CI is not reused as current-head evidence. A prior policy failure was commit-title format only; all affected subjects now use Conventional Commits while preserving their Lore bodies and TDD order.
- Formal Stage 3 must run in a different Codex task ID; this Stage 2 task cannot self-approve or merge.
- A slice-named browser E2E spec does not yet exist; the grep returns “No tests found” and is not claimed green. Stage 4 owns component/E2E/design evidence.
- The real local two-owner fixture proves the denied non-disclosure paths. The broader acceptance row that also requires real-local stale and active-claim paths remains unchecked because those behaviors are currently proven in disposable PostgreSQL rather than through real local Auth/Data calls.
- Merged-exact-SHA server-production read-only inventory, Manual Only evidence and #8 R/R+1 drain/activation remain pending.
- Personal recipe and snapshot-v2 creation capabilities remain off. Contract Evolution Candidate: none.
