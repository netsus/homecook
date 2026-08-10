# Stage 3 current/future smoke re-review — HOLD

- Task: `019feb35-2eff-7a80-9ac0-ae1a4884a466`
- Role: fresh independent docs-gate and Stage 3 re-reviewer
- Reviewed head: `3da3c147b535fb279b32bd98cff7daccca23e13d`
- Reviewed tree: `8ca26d89cdfd47bedf518cf4642d9b608be569fa`
- PR base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- Live master: `df96c2113f60f1c3efcdb1080e3490d414c73200`
- Prior product/docs head: `bba461f538146559e6b3f41e438f4a69de048201`
- Prior product/docs tree: `3113f2bb4d8cedefd045108d2f87b30911fc0027`
- Verdict: **HOLD**
- Findings: `P0/P1/P2 = 0/1/0`
- Unresolved required findings: `1`

This report is the only reviewer-owned change. Its publication commit is a successor to the reviewed head, so the report-publication head must not be represented as the product head reviewed above. The publication SHA is recorded in the final handoff because a commit cannot contain its own SHA.

## Required finding

### ML3-SMOKE-REREVIEW-001 — P1 — current-head PR evidence understates the reviewed diff

PR #1319 `Actual Verification` places the current/future smoke successor `3da3c147...` immediately before `repair changed files 3; PR total changed files 36`. At the reviewed head, both GitHub and the local base diff report `39` PR files, and `bba461f5...3da3c147` changes exactly these five files:

1. `.workflow-v2/status.json`
2. `docs/workpacks/meal-log-core/README.md`
3. `docs/workpacks/meal-log-core/acceptance.md`
4. `docs/workpacks/meal-log-core/automation-spec.json`
5. `docs/workpacks/meal-log-core/evidence/2026-08-10-stage1-current-future-smoke-repair.md`

The stale `3 / 36` statement is therefore not exact-current-head verification evidence. It is merge-gate material, not a cosmetic history note, because the Stage 3 handoff and merge supervisor use the PR body to identify the reviewed scope and successor tuple. The backend Ready validator still passes because it validates the current/future smoke contract, not these inventory numbers.

Required closure belongs to a separate repair actor: update the PR body against the then-current successor, distinguish the five-file `bba461f5...3da3c147` docs/bookkeeping repair from earlier three-file product repair history, recompute the full PR file count after this report publication, and rerun exact-current-head validation/check inventory. This reviewer did not repair the body.

## Docs gate

- `bba461f5...3da3c147` is exactly the five-file docs/bookkeeping diff listed above. No product, migration, validator, or test file changed.
- `.workflow-v2/work-items/meal-log-core.json` is byte-preserved: blob `654c5fb34122c99d05102e75085718a0cbafb279` at both heads.
- `automation-spec.external_smokes` is the current pre-merge list and is exactly `[]`.
- `work-item.workflow.external_smokes` remains the future list of eight obligations. Canonical `jq -cS` SHA-256 is `478bee3eb38655b41e86fa99fb8dd11eef152eaec8eec6d1f4a583a919d93d27`.
- The eight future obligations remain: merged-exact/server-production/local-rehearsal inventory; two-owner/three-source nondisclosure and digests; idempotent create/patch/delete and different-payload zero effect; malformed UUID exact 400 and seven-surface zero-write; interleaved batch reversal/replay checksum; timezone DST/null-instant/no-regroup; exact product/ingredient evidence and aggregate state; account-cleanup pointer/event/entry order.
- Acceptance checkboxes and Stage 2 evidence were not weakened. The repair adds the current/future gate explanation without waiving any obligation.
- Status remains `lifecycle=planned`, `approval_state=not_started`, `verification_status=pending`, `evaluation_status=not_started`, `auto_merge_eligible=false`. Draft state is preserved; there is no lifecycle over-promotion.
- Actual PR-body Ready validation: backend mode **PASS**; frontend mode intentionally **HOLD** with `frontend-smoke-relock`. This proves the future list remains a durable relock gate and is not circular pre-merge evidence.

## Independent product, migration, security, and concurrency re-review

The current routes, runtime parsers/projectors, migration, PostgreSQL coverage, and prior Stage 2/Stage 3 evidence were re-read rather than accepted by citation alone. No new product finding was identified.

- Public request/response/error shapes remain within the official meal-log contract. Strict key validation, UUID/date/IANA parsing, canonical idempotency payloads, and runtime response projection remain locked by focused tests.
- RPC entry points remain `SECURITY DEFINER` with fixed search paths, revoked from public/anon/authenticated, and executable only by `service_role`. Owner UUID, verified session authority, account generation, and resource-owner filters remain enforced.
- `meal_log_entries` keeps exact-one source constraints, soft-delete aggregation exclusion, RLS read isolation, and deferred entry/event pointer integrity.
- Mutations retain operation-scope idempotency, expected revision checks, stable sorted batch lock ordering, append-only reversal/consumption events, full replay/bounds/checksum validation, and transaction-scoped rollback.
- Same-source product/ingredient edits retain pinned evidence only after validating the entire pinned authority chain. Revoked/rejected/stale/missing evidence remains a zero-write `RESOURCE_NOT_FOUND`; allowed superseded evidence is limited to the same-source historical path. Create/source-change continues to require current approved authority.
- Account cleanup order and protected direct DML boundaries remain unchanged. The migration is still unmerged and unapplied by this task.

## Verification evidence

- Docs/workflow/Ready regression: **PASS**, `8 files / 65 tests`.
- Product focused regression: **PASS**, `5 files / 25 tests`.
- `pnpm lint`: **PASS**.
- `pnpm typecheck`: **PASS**.
- Source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, Draft closeout-sync, real-smoke-presence, branch, commit-message, and `git diff --check` validation: **PASS**.
- Commit policy: **PASS**, all `24` PR commits accepted by the repository validator.
- PostgreSQL command was attempted without applying migrations. It stopped in `beforeAll` because the shared local database already contained fixture user `93000000-0000-4000-8000-000000000001`; all 25 assertions were skipped. This is environment contamination, not a product assertion failure. The documented prerequisite is a fresh local reset, but migration apply/DB cleanup was outside this review's authority and was not performed. Prior fresh-reset PostgreSQL evidence was consumed only after the SQL and all 25 test cases were independently inspected.

At the reviewed head, raw GitHub check-runs are terminal: `18` total = `16 SUCCESS + 2 intended SKIPPED`, `15` unique names = `13 SUCCESS + 2 SKIPPED`, and `0` failure/pending/cancelled/neutral/rerun. The skipped checks are `lighthouse` and `full-regression`. PR #1319 was `OPEN`, `Draft`, `CLEAN`, and `MERGEABLE`.

## Live-master projection and pending boundary

The reviewed head projects onto live master without conflicts using `git merge-tree --write-tree`. Live master is two commits ahead of the PR base, and the projected tree is `f6185aa9a1ca4afcc9c6fe3a0efb55346cfe2743`. No merge, rebase, cherry-pick, migration apply, activation, or worktree product mutation was performed.

BE-only Stage 3 does not close the future lifecycle. Merged-exact-SHA server-production/local-rehearsal, Manual, server-Mac/OAuth, capability/activation, and R/R+1/R+2 evidence all remain pending. They cannot be used as circular pre-merge Ready evidence. A fresh repair/merge-supervisor path must first close `ML3-SMOKE-REREVIEW-001`, preserve Draft while required work remains, verify the report-publication successor and its complete terminal check inventory, and only then make a new gate decision.
