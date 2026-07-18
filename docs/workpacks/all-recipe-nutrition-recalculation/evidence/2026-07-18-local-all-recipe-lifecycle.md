# 2026-07-18 Local All-Recipe Nutrition Lifecycle Evidence

## Scope and safety

- Target: loopback-only local Supabase; production/staging writes `0`
- Flow: inventory export -> dry-run -> apply -> same-input replay -> rollback
- Artifact handling: owner-only temporary directory and files; removed after verification
- Recorded evidence contains aggregate counts only. No recipe IDs, provider rows, secrets, tokens, or private artifact paths are retained.

## Aggregate result

- inventory denominator: `34`
- dry-run: `complete=8`, `partial=23`, `unavailable=3`
- accounting: `8 + 23 + 3 = 34`, `unclassified=0`
- conflict gates: `conflict=0`, `multiple_current=0`
- report safety: `secret=0`
- predecessor report taxonomy: missing-reason categories `5`, warning categories `4`

## Apply, replay, and rollback

- first apply: `writes_committed=34`
- same-input replay with a new empty checkpoint: `writes_committed=0`
- rollback: `processed_count=34`
- current snapshot aggregate count and deterministic state hash matched their pre-run values after rollback.
- Meal nutrition snapshot ID/origin aggregate hash matched before apply, after apply, and after rollback.
- Historical snapshot rows were not deleted.

## Focused missing/conflict verification

The local schema prevents an invalid duplicate current snapshot from being inserted directly. The isolated fixtures were therefore rerun for the unsafe states instead of weakening the constraint:

- zero eligible candidate remains missing/partial-or-unavailable
- multiple exact eligible predecessors fail closed
- canonical `missing_reasons` / `warnings_json` aggregation
- rollback restores only an unchanged current and does not delete history

Focused result: `4 passed`, `6 skipped` by test-name selection.

## Conclusion

The local operator lifecycle closed with denominator accounting, replay zero-write behavior, rollback restoration, Meal pin immutability, and secret/conflict gates all passing. Production/staging promotion remains intentionally withheld and requires a separate approval artifact.
