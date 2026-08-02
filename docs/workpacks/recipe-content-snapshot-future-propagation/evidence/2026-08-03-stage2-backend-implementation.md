# Stage 2 backend implementation evidence — 2026-08-03

## Scope and role

- Role: Stage 2 backend implementer/orchestrator. This task does not self-approve formal Stage 3.
- Base: `origin/master` exact `487847419319c61cf2f53f025741a5782357ef86`.
- Branch: `feature/be-recipe-content-snapshot-future-propagation`.
- Draft PR: `#1278`.
- Current implementation/test head before this evidence projection: `b4af7c35860551056a4e41b9764e5f04e04bd6cb`.
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

## Independent auxiliary reviews

- Code/quality reviewer `/root/slice7_stage2_code_review` approved the implementation plus the one-serving snapshot-group regression with P0/P1/P2 `0/0/0`.
- Security reviewer `/root/slice7_stage2_security_review` approved exact code head `2378ec6b869fe2e4408345c720374cf899e7ad29` with P0/P1/P2 `0/0/0` after authentication-first repairs. The later `b4af7c35` commit changes tests only.
- These role-separated reviews are implementation feedback, not the separate-task formal Stage 3 approval required by `AGENTS.md` and the slice workflow.

## Explicit pending gates

- Draft PR #1278 current-head GitHub checks are pending.
- Formal Stage 3 must run in a different Codex task ID; this Stage 2 task cannot self-approve or merge.
- A slice-named browser E2E spec does not yet exist; the grep returns “No tests found” and is not claimed green. Stage 4 owns component/E2E/design evidence.
- Real local Supabase two-owner evidence, merged-exact-SHA server-production/local-rehearsal read-only inventory, Manual Only evidence and #8 R/R+1 compatibility/activation remain pending.
- Personal recipe and snapshot-v2 creation capabilities remain off. Contract Evolution Candidate: none.
