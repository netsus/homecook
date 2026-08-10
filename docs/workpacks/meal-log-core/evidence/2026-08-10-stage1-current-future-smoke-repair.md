# meal-log-core current/future external-smoke Stage 1 repair evidence

## Identity and HOLD

- evidence date: `2026-08-10 KST`
- repair task ID: `019feb23-97f4-7641-89d9-65d9fdc1eb74`
- coordinator task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- pull request: `#1319`, Draft, `master` <- `feature/be-meal-log-core`
- repair parent head/tree: `bba461f538146559e6b3f41e438f4a69de048201` / `3113f2bb4d8cedefd045108d2f87b30911fc0027`
- PR base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- live master observed by the delegating merge supervisor: `df96c2113f60f1c3efcdb1080e3490d414c73200`
- fresh Stage 3 reviewer task `019feb0c-9ad1-78a1-8be7-3c41cde5ddd6` approved exact parent head with `P0/P1/P2 = 0/0/0`; that approval is preserved and is not authored or repeated by this repair task.
- merge supervisor task `019feb18-fdec-79c3-a830-c18e3a0531c9` correctly returned **HOLD** because backend PR-Ready validation required an impossible pre-merge full-lifecycle smoke claim.

This task is a fresh Stage 1 docs/bookkeeping repair author. It does not perform internal 1.5 or Stage 3 self-approval, Ready transition, merge, post-merge activation, Discord, remote Supabase, production, server-Mac, OAuth, capability, R/R+1/R+2, or migration apply.

## Exact incompatibility

Before this repair, both current and future surfaces contained eight items. The current `docs/workpacks/meal-log-core/automation-spec.json#external_smokes` list began with a merged-exact-SHA server-production/local-rehearsal read-only inventory. A non-draft backend Ready check treats every current automation entry as evidence required in the source PR `Actual Verification` section.

That first item cannot exist before the first backend implementation merge, and the task boundary prohibits manufacturing it with a production/server-Mac/remote write or a false PR-body claim. Therefore the old tuple made honest backend Ready impossible:

```text
(current automation external_smokes = 8,
 future work-item external_smokes = 8,
 first current item = merged-exact-SHA evidence,
 PR state target = non-draft backend Ready)
=> PR_BODY real-smoke evidence failure
```

The validator, allowlists, public contract, migration, product implementation, and recorded Stage 2 evidence are not defective and are not weakened by this repair.

## Official current/future semantics

Commit `d3e4238cb122cd988bae07daa75a45b0d845cf72` introduced the repository-wide contract after a RED/GREEN regression: `automation-spec.json#external_smokes` is the current executable Ready gate, while `.workflow-v2/work-items/<slice>.json#workflow.external_smokes` preserves the full-lifecycle future gate. `tests/pr-ready-validator.test.ts` proves both sides:

- backend Ready is allowed when the current list is empty and the future work-item list remains populated;
- frontend Ready fails until the current list is relocked from the preserved future list.

#9 has `Design Status: N/A` and is backend-only, so there is no #9 frontend Ready event to perform that relock. This does not create a waiver. The first backend merge closes only the independently reviewed implementation gate. A fresh post-merge/release closeout actor must relock the current list from the preserved work-item array before it may claim `ML3-LIFECYCLE-001`, full-lifecycle verification, or merged lifecycle projection. The canonical work-item future list remains the durable handoff to that actor and to cross-slice release QA.

## Exact before/after tuples

### Before

```json
{
  "automation_spec.external_smokes": [
    "merged-exact-SHA server-production/local-rehearsal read-only meal-log schema function ACL RLS constraint and capability inventory",
    "two-owner three-source nondisclosure and before-after multi-table digests",
    "same-key replay and different-payload zero-effect",
    "POST PATCH DELETE malformed UUID key exact 400 INVALID_IDEMPOTENCY_KEY and seven-surface zero-write",
    "interleaved batch entries own-event reversal and full-replay checksum",
    "IANA timezone DST null-instant and historical no-regroup",
    "product-version ingredient-profile conversion provenance and aggregate state",
    "account-cleanup pointer-event-entry order with public-shared source preservation"
  ],
  "work_item.workflow.external_smokes_count": 8,
  "status": ["planned", "not_started", "pending"],
  "pr_is_draft": true
}
```

### After

```json
{
  "automation_spec.external_smokes": [],
  "work_item.workflow.external_smokes": [
    "merged-exact-SHA server-production/local-rehearsal read-only meal-log schema function ACL RLS constraint capability inventory",
    "two-owner three-source nondisclosure and multi-table digest smoke",
    "idempotent create patch delete and different-payload zero-effect smoke",
    "POST PATCH DELETE malformed UUID key exact 400 INVALID_IDEMPOTENCY_KEY and seven-surface zero-write smoke",
    "interleaved batch own-event reversal and full replay checksum smoke",
    "timezone DST null-instant and historical no-regroup smoke",
    "exact product ingredient evidence and aggregate-state smoke",
    "account cleanup pointer event entry order smoke"
  ],
  "status": ["planned", "not_started", "pending"],
  "pr_is_draft": true
}
```

The successor commit/head/tree cannot be embedded in its own content. They are recorded in the updated PR body and final handoff together with the normal fast-forward push and successor current-head check inventory.

## Verification commands

The exact pre-repair backend Ready validation fails at real-smoke presence. After the current list becomes empty, the same backend command must pass without adding smoke claims to the PR body. The future list is independently compared before and after and must remain byte-for-byte identical.

```text
pnpm exec vitest run tests/pr-ready-validator.test.ts tests/real-smoke-presence.test.ts
pnpm exec vitest run tests/meal-log-core-stage1-repair.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts tests/omo-doc-gate.test.ts tests/source-of-truth-sync.test.ts
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
BRANCH_NAME=feature/be-meal-log-core pnpm validate:workpack -- --slice meal-log-core
node scripts/validate-automation-spec.mjs --slice meal-log-core
pnpm validate:omo-bookkeeping
PR_IS_DRAFT=true pnpm validate:closeout-sync -- --slice meal-log-core
pnpm validate:pr-ready -- --slice meal-log-core --mode backend --pr-body <current PR body file>
git diff --check
```

## Verification results

- The first focused Vitest attempt stopped before test execution with `vitest not found`; it is not counted. `pnpm install --frozen-lockfile` then restored 668 packages without changing `package.json` or `pnpm-lock.yaml`.
- focused docs/workflow/Ready regression: **PASS**, `8 files / 65 tests`.
- source-of-truth, workflow-v2, workpack, automation-spec, OMO bookkeeping, Draft closeout-sync, and real-smoke-presence validators: **PASS**.
- actual PR #1319 body + `--mode backend`: **PASS**, `PR ready validation passed` with no new real-smoke claim.
- the same body + `--mode frontend`: expected **HOLD**, `frontend-smoke-relock`; this proves the preserved work-item list still guards a later relock rather than disappearing.
- work-item future-array canonical SHA-256 before/after: `478bee3eb38655b41e86fa99fb8dd11eef152eaec8eec6d1f4a583a919d93d27` / same; exact preservation confirmed.
- automation current-array count before/after: `8 / 0`.
- lint and typecheck: **PASS**.
- dependency audit at high threshold: **PASS**, `1 low / 1 moderate / 0 high / 0 critical`; dependency files unchanged.
- `git diff --check`: **PASS**.

## Preserved pending boundary

- Stage 2 implementation, PostgreSQL, focused/backend verification, and prior repair evidence remain unchanged.
- The independent Stage 3 code verdict remains a separate task artifact; this repair does not approve itself.
- The eight future external-smoke obligations remain pending and unclaimed.
- merged-exact-SHA server-production/local-rehearsal, Manual, server-Mac/OAuth, capability, R/R+1/R+2, activation, merge, and post-merge evidence remain pending.
- #10/#11/#12/#14 ownership, public contract, dormant capability, and unapplied migration boundary remain unchanged.
