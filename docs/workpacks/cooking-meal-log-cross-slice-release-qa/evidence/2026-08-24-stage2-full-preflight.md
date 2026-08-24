# Stage 2 full preflight evidence — 2026-08-24

## Scope and identity

- Workpack/Stage: `cooking-meal-log-cross-slice-release-qa` (#14), Stage 2 verification-only.
- Attempt: `stage2-full-master-60da67d2-20260824`.
- Profile: `full`.
- Branch: `docs/cml14-stage2-full-preflight-closeout`.
- Exact head: `60da67d2e01932c39abf7242bc4e335bb24afcd4` (`origin/master` / `master`).
- Validator artifact count: `5`.
- This file records a non-final preflight. It does not claim Stage 4/final evidence, controlled full-local authority, browser authority, Manual/activation, or release closeout.

## Verified preflight facts

- DB lane: `639/639` passed; skipped `0`, pending `0`, failed `0`.
- Security lane: `8/8` passed; skipped `0`, pending `0`, failed `0`.
- Performance lane: `54/54` passed; skipped `0`, pending `0`, failed `0`.
- Query-count lane: `1/1` passed; skipped `0`, pending `0`, failed `0`.
- Rollback lane: `32/32` passed; skipped `0`, pending `0`, failed `0`.
- Raw skip partition: `270` retained separately.
- Performance denominator: `287041`.
- Performance metrics: Recall@20 `1`, Precision@20 `0.9210526316`, DB p95 `40.439917ms`, route p95 `15.53ms`.
- External boundary: `0/0`.
- Query-count metrics: `list1=1`, `list20=1`, item-level `N+1=0`.
- Security classification: `classified=213`, `data negatives=4`, `remote=0`.
- SHA-256 prefixes:
  - manifest `eb88b324…`
  - db `d9ac27ce…`
  - security `f28e8a2d…`
  - performance `32994ddc…`
  - query `fa8244f1…`
  - rollback `a7b4a4b…`

## Repair lineage note

- Repair PRs `#1395`–`#1401` are consumed here only as Codex-resolved preflight repairs.
- This preflight does not assert Stage 4/final evidence or a terminal release gate.

## Status projection

- Stage 2 overall remains `in_progress / green-on-owned-lanes`; fresh Stage 3 review of this preflight, Stage 4 `FINAL_EVIDENCE_SHA` same-head rerun/browser bundle, controlled full-local, Stage 4~6, Manual and activation remain pending.
- Design remains `temporary`.
- `auto_merge` remains `false`.
- Manual/activation and Stage 3~6 remain pending.
