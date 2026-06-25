# Launch Ingredient Candidate Review - 2026-06-24

## Source Fetch

- Source: RDA 농식품 국가표준식품성분정보
- Groups: A, B, C, D, E, F, G, H, I, J, K, L, M, N, R
- Provider success: 15/15
- Source rows: 2,549
- Production DB writes during fetch: 0
- Primary key env: `DATA_GO_KR_API_KEY`
- Failover key env used after quota: `DATA_GO_KR_API_KEY1`

## Reviewed Promotion Set

- Decision artifact: `review-decisions-launch-2026-06-24.json`
- Source decisions: 1,805
- Ingredient values in migration: 789
- Synonym values in migration: 410
- Existing ingredient references: 60
- Excluded decisions: 602

## Validation

| Check | Count |
| --- | ---: |
| Duplicate standard names | 0 |
| Missing synonym targets | 0 |
| Ambiguous synonyms | 0 |
| Invalid categories | 0 |

## Local Supabase Transaction Check

Executed against local Supabase PostgreSQL on `127.0.0.1:54322` inside `BEGIN ... ROLLBACK`.

- Applied `supabase/migrations/20260625090000_28_external_ingredient_full_seed.sql` twice.
- New row insert counts on current local DB: ingredients 697, synonyms 403.
- Lower insert counts are expected because existing rows are skipped by `on conflict do nothing`.
- Final expected ingredient names: 789 / missing 0.
- Final expected synonym pairs: 410 / missing 0.
- New-row category mismatch: 0.
- Spot checks passed:
  - `연시` <- `청도반시`
  - `열무 김치` <- `열무 물김치`

## Rollback

- Rollback SQL: `rollback-20260625090000_28_external_ingredient_full_seed.sql`
- Rollback deletes only deterministic IDs generated for this launch batch.
- Existing rows skipped by conflict are not deleted by rollback.

## Deferred

- `ingredient_bundles` and `ingredient_bundle_items` promotion stays deferred until after ingredient/synonym promotion is applied and smoked.
- Remote DB apply and API/search smoke are not performed by this PR.
