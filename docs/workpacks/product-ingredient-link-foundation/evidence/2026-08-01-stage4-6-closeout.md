# product-ingredient-link-foundation Stage 4–6 closeout evidence

## Scope

- PR: `#1256`
- final exact head: `27fc07c48e61f9f8c252949e598ef5c67fc00068`
- protected-base merge SHA: `5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0`
- frontend scope: existing HOME/PANTRY product-identity consumers only
- production/staging writes: `0`
- Manual Only: existing-schema/function/grant/data digest, production-equivalent query plan, server-Mac full-local Auth/RLS/delete-recreate rehearsal and production activation

## TDD and deterministic verification

- Stage 4 initial RED failed 3/5 locked consumer cases: product-only HOME cleanout, additive PANTRY product rows and exact product/version submission.
- Subsequent RED/GREEN rounds locked exact product+nutrition-version pair comparison, latest-search response ownership, sheet-cycle mutation ownership, cached-theme error precedence and Auth-transition pantry response ownership.
- Final focused HOME/PANTRY/product consumer set passed `103/103` after the cross-session stale-response repair.
- Isolated PostgreSQL fresh and replay suites passed `20/20` each after the date-stable fixture repair.
- `pnpm verify:frontend:pr` passed 2,429 product tests with 128 normal skips, production build, smoke 59/10 skip, accessibility 8/1 skip and visual 12/12.
- `CI=1 pnpm verify:frontend` passed Lighthouse, regression 924/144 skip, accessibility 18/15 skip, visual 23/22 skip and security 12/12.
- Source-of-truth, workflow-v2, workpack, automation-spec and OMO bookkeeping validators, lint, typecheck and `git diff --check` passed on the implementation branch.

## Independent Codex reviews

The implementation owner did not perform these approval roles.

### Code review

- exact implementation head: `fd82fd200d7a5da17032388be8ebdd0b9f2f93a8`
- result: `APPROVE`
- findings: `P0/P1/P2=0/0/0`
- final exact head `27fc07c48e61f9f8c252949e598ef5c67fc00068` has the identical tree and received a fresh read-only re-approval with `P0/P1/P2=0/0/0`.

### Security review

- exact implementation head: `fd82fd200d7a5da17032388be8ebdd0b9f2f93a8`
- result: `APPROVE`
- findings: `P0/P1/P2=0/0/0`
- verified boundaries include authenticated-self reader ownership, Auth-transition stale-response invalidation, no user-path service-token fallback, product/version provenance preservation and owner-private cleanup isolation.
- final tree-identical exact head received a fresh security re-approval with `P0/P1/P2=0/0/0`.

### Exact-head Stage 6 verification

- exact remote head: `27fc07c48e61f9f8c252949e598ef5c67fc00068`
- result: `MERGE-READY YES`
- GitHub evidence: all latest check contexts succeeded, with one intended `full-regression` skip and pending/fail/cancel/rerun-in-progress `0`.
- PR #1256 squash-merged at `2026-08-01T12:10:39Z` as `5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0`.

## Closeout boundary

- Contract Evolution PR #1254 and Stage 2/3 PR #1255 remain the official contract/backend predecessors.
- Product-link Stage 4–6 implementation closeout is complete.
- `external_smokes` remains `pending` for the Manual Only server-Mac evidence listed above.
- This evidence does not authorize production/staging writes, account-generation/account-delete activation, candidate promotion or irreversible deletion.
