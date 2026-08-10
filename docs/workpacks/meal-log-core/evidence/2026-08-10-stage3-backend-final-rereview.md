# meal-log-core Stage 3 backend final rereview

## Review identity and exact target

- review date: `2026-08-10`
- role: fresh independent Ready-state Stage 3 backend final rereviewer
- reviewer task ID: `019fea32-93a4-70e0-bf54-8e8909ef340d`
- pull request: `#1319`, `master` <- `feature/be-meal-log-core`
- reviewed head: `5656931514821701739c9328088601e2df069710`
- reviewed tree: `3691e2ec6d5f09eedc862addbb5f3c495c625656`
- reviewed base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- reviewed files: `31`
- initial PR state: `OPEN`, Ready (`isDraft=false`), `CLEAN`, `MERGEABLE`
- initial current-head checks: `21 = 20 success + 1 intended skip`; pending/failure/cancel `0`
- prior HOLD report: commit `736e37c9`, `docs/workpacks/meal-log-core/evidence/2026-08-10-stage3-backend-review.md`

The local checkout was first matched to the exact remote head and tree. Review work then continued on the review-only local branch `docs/review-pr1319-stage3-final`. No author, repair, integration, Ready-supervisor, precheck, or prior-review task was reused. No implementation repair, Ready-state change, merge, force push, amend, rebase, reset, production mutation, activation, OAuth, server-Mac action, Discord action, or Claude surface was used.

## Verdict

**HOLD**

- P0: `0`
- P1: `5`
- P2: `0`
- Stage 3 entry-gate blockers: `0`
- Stage 3 required unresolved: `5`
- required IDs: `ML3-FINAL-001`, `ML3-FINAL-002`, `ML3-FINAL-003`, `ML3-FINAL-004`, `ML3-FINAL-005`
- deferred full-lifecycle merge/activation gate: `1` (`ML3-LIFECYCLE-001`, not counted as a Stage 3 code finding)

The Ready-state entry gate and deterministic repository gates pass, but five backend correctness/contract findings remain. APPROVE is therefore prohibited.

## Prior required-finding revalidation

| Prior required item | Final rereview result |
| --- | --- |
| `ML3-BE-001` batch nutrition scaling / compact response | closed for the originally reported path; fresh PostgreSQL proves the three source types use the compact six-key nutrition object and batch scale uses consumed/original-finished-weight |
| `ML3-BE-002` exact piece evidence | **reopened by `ML3-FINAL-003`**; piece create and same-unit PATCH work, but PATCH across conversion classes rejects a valid newly requested exact evidence path |
| `ML3-BE-003` #8 integrity preflight | **reopened by `ML3-FINAL-001`**; the preflight exists, but a successful same-batch PATCH immediately leaves the #8 revision invariant invalid |
| `ML3-BE-004` canonical lock order / deadlock | canonical UUID lock order and A↔B concurrency test pass; **same-batch replacement bounds remain unresolved as `ML3-FINAL-002`** |
| `ML3-BE-005` aggregate status fold | closed; complete/partial/unavailable slot and day folds pass in real PostgreSQL |
| `ML3-BE-006` TypeScript/runtime response equivalence | **reopened by `ML3-FINAL-005`**; only nested nutrition is validated, while required entry/section/recent fields are accepted without runtime proof |
| `ML3-BE-007` canonical payload | closed; UUID case, timestamp spelling, and unit whitespace normalize to the same RPC payload; the internal writer marker is excluded |
| `ML3-BE-008` real PostgreSQL evidence | expanded to fresh `10/10`, but not sufficient to close the three missed transaction boundaries in `ML3-FINAL-001`~`003` |
| `ML3-BE-009` current-head/body inventory | closed at the reviewed target; PR body, exact head/tree/base, changed-file count, and raw check inventory agree |
| `ML3-GATE-001` Draft/Ready/base checklist | closed; PR is Ready and both Ready-mode closeout and full backend PR-ready validation pass |

## P0 findings

None.

## P1 findings

### ML3-FINAL-001 — a successful same-batch PATCH corrupts the #8 cached-projection revision invariant

Evidence:

- `supabase/migrations/20260810120000_meal_log_core.sql:418-424` appends a reversal, and `564-568` appends the replacement consumed event. The same batch is replayed only once at `571-578`.
- #8 replay increments the batch revision once per replay at `supabase/migrations/20260809120000_cooked_batch_weight_ledger.sql:580-598`, while its integrity assertion requires `revision = 1 + event_count + set_weight_count` at `660-700`.
- The fresh PostgreSQL `10/10` test leaves the same-batch fixture at remaining `650`, revision `4`, and event count `4`; the next normal mutation fails in `assert_cooked_batch_cached_projection` with `CONFLICT` because the expected revision is `5`.
- `tests/meal-log-core-postgres.integration.test.ts:424-430` checks remaining weight and active consumed-event count only. It does not assert the cached projection after the PATCH or attempt the next valid mutation.

Impact:

- A request can return success while leaving the batch unable to accept its next normal mutation.
- This violates the workpack requirement that every batch entry mutation full-replay and validate revision/checksum, and reopens the #8 integrity boundary.

Required closure:

- Make the reversal/replacement operation preserve the #8 revision authority without weakening the assertion.
- Add a real PostgreSQL regression that asserts the full cached projection immediately after same-batch PATCH and proves a subsequent valid mutation succeeds.

### ML3-FINAL-002 — same-batch replacement checks the new amount against pre-reversal remaining weight

Evidence:

- The old event reversal is appended at `supabase/migrations/20260810120000_meal_log_core.sql:418-424`, but the cached `v_batch.remaining_weight_g` is not replayed or adjusted before `v_amount > v_batch.remaining_weight_g` at `437-445`.
- In a rollback-only probe, the post-test fixture had `650g` remaining and the patched entry owned `150g`; replacing it with `700g` is valid because the transaction can restore the owned `150g`, giving `800g` available. After temporarily restoring the revision invariant inside the transaction, the RPC still returned `CONFLICT` at the amount bound.
- The named same-batch test only changes `100g → 150g` while the pre-reversal cache is `700g`, so it cannot detect this false rejection.

Impact:

- Valid same-batch quantity increases are rejected whenever `cached_remaining < new_amount <= cached_remaining + old_entry_amount`.
- The PATCH contract says old reversal and replacement are one atomic transaction; capacity must be evaluated against that transaction's effective state.

Required closure:

- Evaluate replacement capacity after crediting only the entry's own reversed active event, under the already locked batch.
- Add boundary tests for equality, valid increase, true overdraw, multiple entries, rollback, and replay.

### ML3-FINAL-003 — ingredient PATCH cannot move between exact piece and volume evidence classes

Evidence:

- For a same-source ingredient, `supabase/migrations/20260810120000_meal_log_core.sql:467-475` reuses the entry's prior `conversion_evidence_id` before inspecting the newly requested unit.
- The volume branch at `478-497` queries that old ID only as `volume_weight`; the piece branch at `499-539` queries it only as `piece_weight`. If the unit class changed, the lookup clears the value and raises `UNIT_CONVERSION_MISSING` instead of resolving the newly requested approved exact evidence.
- A rollback-only PostgreSQL probe added a current approved exact volume assignment for the same ingredient/profile, then patched the existing piece entry from `3 piece` to `1 tbsp`. The RPC returned `UNIT_CONVERSION_MISSING` even though the exact requested volume path existed.
- The current PostgreSQL test at `tests/meal-log-core-postgres.integration.test.ts:308-317` covers only piece→piece amount change.

Impact:

- The official PATCH contract permits source/quantity/unit changes and requires newly requested exact evidence to be pinned. Valid unit-class changes fail.

Required closure:

- Reuse old evidence only when it matches the newly requested conversion class and exact profile/preparation constraints; otherwise resolve one current approved exact candidate.
- Add piece↔volume and piece/volume→mass real PostgreSQL tests, including missing/ambiguous/rollback cases.

### ML3-FINAL-004 — meal-log product conversion accepts an ambiguous direct basis pair

Evidence:

- `private.resolve_meal_log_product_nutrition` selects the first matching relation with `limit 1` at `supabase/migrations/20260810120000_meal_log_core.sql:176-200` and never proves exactly one direct candidate.
- The existing shared product validator rejects only identical JSON duplicates, so two different ratios for the same unit pair pass `public.validate_food_product_basis_relations`.
- A direct PostgreSQL probe supplied both `1 serving = 50g` and `1 serving = 80g`. The validator returned `true`, and the meal-log resolver silently selected the first relation and returned `100 kcal`.
- The predecessor planner resolver already counts matching candidates and fails unless the count is exactly one (`supabase/migrations/20260716150000_prepared_food_planner_entries.sql`).

Impact:

- An allowed immutable version can yield order-dependent historical nutrition instead of failing closed on a non-exact relation.

Required closure:

- Require exactly one matching direct relation, consistent with the predecessor product authority, and return the official conversion error with zero writes otherwise.
- Add real PostgreSQL tests for forward, reverse, missing, and duplicate-pair relations.

### ML3-FINAL-005 — runtime response projection is not semantically equivalent to the declared response types

Evidence:

- `types/meal-log.ts:33-46` requires the full `MealLogEntry` shape.
- `lib/server/meal-log.ts:226-260` accepts an entry when it is merely an object with valid `nutrition`; it does not validate ID, revision, date/timezone, column, source, quantity, labels, or timestamps. Section IDs/names/order are also not checked.
- `projectMealLogRecentData` at `lib/server/meal-log.ts:263-280` does not validate `last_amount`, `last_unit`, or `frequency` before publishing them.
- The focused test intentionally treats `{ entry: { nutrition: compact } }` as valid at `tests/meal-log-core.test.ts:135-155`, proving the runtime guard is weaker than the TypeScript contract rather than semantically equivalent to it.

Impact:

- An RPC projection drift can be returned as a successful public response with missing or wrongly typed fields. Typecheck cannot catch it because the RPC boundary is `unknown`.

Required closure:

- Validate or explicitly project every public field for mutation, day, section, total, and recent responses against one shared response contract.
- Add negative contract tests for missing/wrong fields, not only the compact nutrition subobject.

## P2 findings

None outside the required P1 findings above.

## Confirmed boundaries

- owner/account-generation RLS, owner resource checks, and service-role-only mutation RPC grants are present; direct authenticated table writes remain denied.
- exact-one source constraints and the deferred entry↔active-consumption-event owner/batch identity checks are present.
- canonical UUID/timestamp/unit payload construction and same-key replay/different-payload protection are present.
- old/new batch locks use canonical UUID order; the A↔B concurrent PostgreSQL regression completes without deadlock.
- aggregate complete/partial/unavailable fold, soft-delete exclusion, deleted-slot sections, compact six-key nutrition, and original finished-weight batch scaling pass in real PostgreSQL.
- source review confirms request-body exact-key, date/timezone, positive quantity, expected revision, UUID entry/key, malformed JSON, and shared error-wrapper handling; focused parser tests exercise the key/date/revision/canonicalization branches.
- exceptions roll back entry/event/pointer/receipt changes in the exercised failure paths. No partial write was observed in the rollback probes.

## Verification evidence

| Verification | Result |
| --- | --- |
| exact local/remote/PR target and initial raw checks | PASS — exact head/tree/base; `OPEN`, Ready, `CLEAN`, `MERGEABLE`; `20 success + 1 intended skip` |
| frozen install | PASS |
| focused meal-log suite | PASS — `3 files / 17 tests` |
| current-vs-future validators | PASS — `4 files / 36 tests` |
| authority evidence validator | PASS — `1 file / 29 tests` |
| fresh `supabase db reset --local` | PASS |
| fresh meal-log PostgreSQL integration | PASS — `1 file / 10 tests` |
| manual rollback-only PostgreSQL probes | FAIL as findings — subsequent same-batch mutation `CONFLICT`; valid `700g` replacement `CONFLICT`; valid piece→volume PATCH `UNIT_CONVERSION_MISSING`; duplicate product relation silently selected |
| `verify:backend` | PASS — lint, typecheck, product `2713 pass / 160 intended skip`, build 81 routes, security E2E `12/12` |
| security-function contract-only, meal-log scope | PASS — 11 scoped functions classified |
| source-of-truth/workflow-v2/workpack/automation/bookkeeping/Ready closeout/full PR-ready | PASS |
| branch and existing commit policy / exact-target diff check | PASS — branch valid, 20 reviewed commits valid, `git diff --check` clean |
| dependency audit | PASS at high threshold — high/critical `0`; existing moderate `1`, low `1` |

## Gate impact and handoff

### Stage 3 code gate

`ML3-FINAL-001`~`005` are required. The backend Stage 3 verdict remains HOLD until a repair successor contains RED→GREEN regression evidence and a different fresh independent reviewer reports required unresolved `0`.

### Deferred full-lifecycle gate — ML3-LIFECYCLE-001

The following are still explicitly unclaimed: the four manual external smokes (two-owner/three-source nondisclosure and digests; same-key replay/different-payload zero-effect; IANA DST/null-instant/no-regroup; cleanup pointer→event→entry with public-source preservation), merged-exact server-Mac/local-rehearsal inventory, OAuth, capability, R/R+1/R+2, and activation.

These are not counted as Stage 3 code findings and did not change this HOLD verdict. They remain a separate governing merge/release/activation gate: even after a future Stage 3 code APPROVE, the PR must not be represented as full-lifecycle merge/activation complete until the owning later stages record their required evidence and all current-head checks are terminal green or intended skip.
