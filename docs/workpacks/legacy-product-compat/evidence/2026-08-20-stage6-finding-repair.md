# Stage 6 finding repair — 2026-08-20

## Review input

- Draft PR: [#1371](https://github.com/netsus/homecook/pull/1371)
- Stage 6 reviewer task: `01a01e68-fb28-7841-8815-c7685d56cc35`
- verdict: `REQUEST_CHANGES`
- P0/P1/P2: `0/2/1`
- repair author task: `01a01e01-0a0e-7f70-97dd-2e6c8f0012af`
- starting head/tree: `45ae210e3cf0d9852497cc0c11e4ecd6003359d8` / `cc2c610b63cf4aeab06083d40a1db824c1610366`
- runtime repair commit/tree/parent: `a9f4288aa9607f90a37de91e2d0158a187c13d3d` / `f68bd0283eb45e976cc73c140cb6399243839267` / `45ae210e3cf0d9852497cc0c11e4ecd6003359d8`

## P1 — canonical legacy completion retry

- server durable payload authority uses distinct consumed ingredient IDs sorted by UUID text `COLLATE "C"`.
- prior planner/standalone stores fingerprinted raw arrays, so reorder/duplicates rotated a key that the server considered the same payload.
- one shared `canonicalizeLegacyConsumedIngredientIds()` now runs before both store fingerprints and API request serialization.
- actual request body stays on the existing `consumed_ingredient_ids` field and sends sorted, unique IDs.
- different canonical payload rotates; different planner session or standalone recipe+servings target clears the prior attempt.

### RED → GREEN

- RED: client/store `4 failed / 12 passed` — two raw request bodies and two key rotations.
- GREEN: client/store `16/16`.
- focused client/store/cook screens/routes: `5 files / 97 tests`.
- exact legacy Playwright: `14/14`, including in-test `390x844`, `320x693`, `1280x900`.
- lint/typecheck: pass.

## P1 — non-Manual acceptance reconciliation

The following 30 previously unchecked IDs are satisfied by retained Stage 2/3 evidence and are now checked:

1. `accept-legacy-compat-cursor-server`
2. `accept-legacy-compat-no-key-server`
3. `accept-legacy-compat-no-key-intermediate-server`
4. `accept-legacy-compat-required-key-server`
5. `accept-legacy-compat-no-expiry`
6. `accept-legacy-compat-removal-prerequisites`
7. `accept-legacy-compat-invalid-key`
8. `accept-legacy-compat-idempotent-replay`
9. `accept-legacy-compat-key-mismatch`
10. `accept-legacy-compat-atomic-v1-rpc`
11. `accept-legacy-compat-rpc-boundary`
12. `accept-legacy-compat-legacy-overload-cutover`
13. `accept-legacy-compat-existing-errors-only`
14. `accept-legacy-compat-owner-boundary`
15. `accept-legacy-compat-pinned-version`
16. `accept-legacy-compat-planner-separation`
17. `accept-legacy-compat-version-server`
18. `accept-legacy-compat-strict-v1-and-v2-drain`
19. `accept-legacy-compat-telemetry-fail-closed`
20. `accept-legacy-compat-no-invention`
21. `accept-legacy-compat-owner-fixtures`
22. `accept-legacy-compat-key-fixtures`
23. `accept-legacy-compat-concurrent-key-fixtures`
24. `accept-legacy-compat-no-key-rollback-fixtures`
25. `accept-legacy-compat-v2-fixtures`
26. `accept-legacy-compat-telemetry-fixtures`
27. `accept-legacy-compat-local-only-fixtures`
28. `accept-legacy-compat-runtime-predecessors`
29. `accept-legacy-compat-vitest-server`
30. `accept-legacy-compat-local-smoke-split`

### Retained evidence mapping

- cursor/idempotency/version/telemetry/tombstone/routes: Stage 2 focused `10 files / 76 tests` and `docs/workpacks/legacy-product-compat/evidence/2026-08-15-stage2-backend-implementation.md`.
- atomic RPC/ACL/authority/owner/concurrency/rollback/progress counters: isolated PostgreSQL `13/13`, authority `3 files / 34`, security function contract `6` functions.
- pinned row/read-model/separation/predecessors: planner compatibility tests plus #10 PR #1331 and #12 PR #1361 merged runtime records.
- local-only fixtures/owner bootstrap/v2 drain: isolated Supabase Data API `200`, prepared-food owner PostgreSQL `11/11`, production/staging/remote writes `0/0/0`.
- independent review and merge: exact Stage 3 APPROVE pair and PR #1369 merge `50e31293e6740b3fdc56d022e12d3b9fe8be4cf7`, retained in `docs/workpacks/legacy-product-compat/omo-report.md`.

Manual Only `7` items remain unchecked. No cutover, revoke/drop, server-Mac/OAuth, device/AT, activation, or tombstone authority is claimed.

## Canonical closeout snapshot

- owner: `.workflow-v2/work-items/legacy-product-compat.json#closeout`
- phase: `collecting`
- docs: roadmap `in_progress`, Design `confirmed`, delivery/acceptance complete, authority not required, automation synced
- verification: required checks pending until repaired full gate; external smokes pending
- merge gate: Stage 6 `needs_revision`, all checks green false
- overall tracked status remains `in_progress / not_started / pending / not_started`, auto-merge false

## P2 — PR body

PR Design/Accessibility is aligned with independent Stage 5 APPROVE and Design confirmed. Test Plan and Actual Verification must reference the repaired current-head full gate before Stage 6 re-review. Stage 6, Ready/merge and Manual remain pending.

## Pending

- projection tests and canonical closeout validators
- repaired current-head `verify:frontend:pr` and full `verify:frontend`
- successor Draft PR checks
- fresh independent Stage 6 re-review
- Ready/merge/Discord and every Manual/cutover/activation obligation
