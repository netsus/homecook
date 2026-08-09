# Stage 4 frontend implementation evidence — 2026-08-09

## Scope and lineage

- Workpack: `cooked-batch-weight-ledger` (#8)
- Role: fresh Stage 4 frontend author; not the Stage 1/2/3 author or reviewer
- Exact source: `origin/master` `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1` (merged PR #1291)
- Branch: `feature/cooked-batch-weight-ledger-stage4-frontend-current`
- Draft PR: [#1311](https://github.com/netsus/homecook/pull/1311); #1310 was superseded because its already-pushed Lore subjects lacked the repository's Conventional Commits prefix, and no force-push was used
- Feature commit: `f0fca765`
- Public contract/schema/status/error/action expansion: none
- Runtime or capability mutation: none

This implementation consumes the official snapshot-v2 complete body and exact success/error projection. It adds only the #8-owned COOK_MODE completion surface. It does not add delayed-weight, unrecoverable, discard, adjustment, LEFTOVERS final design, meal-log linkage, or R/R+1/R+2 activation owned by successor/release work.

## TDD RED → GREEN

The Stage 4 author locked API types, state, permission/read-only behavior, loading/empty/error and replay before implementation:

1. RED: the focused component suite failed because the completion sheet and COOK_MODE completion opener did not exist.
2. RED: the no-guess guidance assertion failed before the actual-row explanation was added.
3. RED: invalid known/missing/unrecoverable weight correlation cases were accepted before the client projection validator was tightened.
4. GREEN: focused Stage 4/API contract suite passes `5 files / 23 tests`.

The finished UI keeps initial pantry selection empty, allows explicit `[]`, exposes exact-one original food-only grams or weigh-later, reuses the idempotency key only for the same payload, creates a new key after payload changes, dedupes in-flight submit, preserves selection/focus on 409/422, and consumes a stored terminal result once.

## Runtime design and accessibility evidence

| Evidence | Original size | SHA-256 |
| --- | ---: | --- |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-desktop-1280.png` | `1280x900` | `e3e4c2b15253f4bb547ecfa4383bb3825dd374e14610654c9047cf6435c6a539` |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-default-390.png` | `390x844` | `3ad8e8239426d9e735219e9aa62aaa8e1425584e814beda5c9608e72b677fcb9` |
| `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-narrow-320.png` | `320x568` | `c6cc60b23a9c2ebbe6553ab2ba460c4729b1b283f44fba4b426ad78666e6985b` |

The runtime comparison is recorded in `design-qa.md`. It is an author-only implementation QA artifact, not final product-design authority. Playwright proves 44px controls, 16px horizontal spacing, focus trap/restore, keyboard Escape behavior, narrow internal scrolling, no horizontal overflow, zero console errors, and zero serious/critical axe violations for the #8 sheet.

Internal visual review found and repaired:

- P1: 12px guidance contrast `3.53:1` → darker existing token; post-fix axe serious/critical `0`
- P2: missing actual-row no-guess guidance → explicit product/pantry-row instruction
- P2: 20px runtime horizontal padding → #8-scoped 16px padding
- P3: programmatic title focus outline → noninteractive heading keeps focus announcement without browser outline

Final author-only actionable findings are `P0/P1/P2=0/0/0`. Separate Stage 5, final authority and Stage 6 remain required.

## Verification

- `pnpm exec vitest run tests/cooking-snapshot-v2-api.test.ts tests/cooked-batch-completion-sheet.test.tsx tests/cooked-batch-pantry-row-selection.test.tsx tests/cooked-batch-completion-replay.test.tsx tests/cooked-batch-api-contract-v1-2-36.test.ts` — `5 files / 23 tests` pass
- `pnpm test` — `529 files passed / 28 skipped`, `5,402 tests passed / 372 intended skipped`
- `pnpm verify:frontend:pr` — pass; lint, typecheck, product `222 files / 2,685 tests`, build, smoke `59 pass / 10 skip`, core a11y `8 pass / 1 skip`, core visual `12 pass`
- `pnpm test:e2e:regression:ci --grep cooked-batch-weight-ledger` — `5 pass / 1 intended skip`
- `pnpm verify:frontend` — pass; Lighthouse `2 URLs × 3 runs`, regression `941 pass / 166 skip`, a11y `18 pass / 15 skip`, visual `23 pass / 22 skip`, security `12 pass`
- `pnpm qa:eval -- --checklist .artifacts/qa/cooked-batch-weight-ledger/latest/exploratory-checklist.json --report .artifacts/qa/cooked-batch-weight-ledger/latest/exploratory-report.json` — score `94`, validation errors `0`, covered `62/74`, blocked `12/74`
- `pnpm validate:exploratory-qa-evidence -- --slice cooked-batch-weight-ledger` — pass
- `pnpm audit --audit-level high` — exit `0`; high/critical `0/0`, residual low/moderate `1/1`
- `git diff --check` — pass

The full frontend run is real local Next/Playwright fixture evidence. It is not production, physical iOS Safari, server-Mac, Supabase migration, capability activation, or merged-exact-SHA remote evidence.

## Evidence boundaries

### Fresh Stage 4 evidence

- COOK_MODE code, component/API tests and exact tagged Playwright regression
- local production build, Lighthouse, regression, accessibility, visual and security gates
- actual runtime screenshots at desktop/390/320 and original-size inspection
- exploratory QA/eval with blocked release/manual items preserved

### Retained predecessor evidence

- Stage 2 PostgreSQL/real-DB/RLS/ACL/ledger/reader evidence remains in `2026-08-09-stage2-backend-implementation.md`
- Stage 2/3 merge source is exact `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1`
- pre-Stage-4 independent critic and authority artifacts remain separate from runtime screenshots

### Pending and not claimed

- current-head Draft PR checks until every started check is terminal
- separate Stage 5, final product-design authority and Stage 6
- Ready transition and merge
- physical iOS Safari/manual browser session
- merged-exact-SHA server-production/local-rehearsal read-only verification
- Manual/server-Mac/OAuth evidence
- full v1 compatibility plus seeded R/R+1 drain E2E matrix
- R+2 service-owner activation and rollback gate
- Discord notification

## Contract Evolution Candidate

The Stage 1 static examples contain `냉장고`/`냉동실` storage context, but official `pantry_candidates` exposes no storage/location field. Stage 4 therefore renders real product/brand identity and a within-group row ordinal, hides raw UUIDs, and does not guess a location. If storage location becomes required, it needs a separate approved contract evolution; this implementation does not add it.

## Status projection

- lifecycle: `in_progress`
- approval: `not_started`
- verification: `pending`
- evaluation: `not_started`
- Design Status: `pending-review`
- Draft PR: yes
- Stage 5/final authority/Stage 6 self-approval: no
- Ready/merge/activation/Discord: not performed
