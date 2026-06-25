# Launch 28 Ingredient DB Quality Report - 2026-06-25

## Scope

This report checks the remote Supabase DB after the launch 28 ingredient load and follow-up bundle/synonym migrations.

Checked migrations:

- `20260625090000_28_external_ingredient_full_seed.sql`
- `20260625102000_28_external_ingredient_bundle_promotion.sql`
- `20260625190000_28_expand_pantry_bundle_seed.sql`
- `20260625201000_28_external_ingredient_synonym_followup.sql`

Read path: Supabase REST with `apikey` header only. No production data was mutated.

## Current Counts

| Table | Count |
| --- | ---: |
| `ingredients` | 869 |
| `ingredient_synonyms` | 595 |
| `ingredient_bundles` | 13 |
| `ingredient_bundle_items` | 222 |
| `recipe_ingredients` | 104 |
| `pantry_items` | 27 |
| `shopping_list_items` | 32 |

## Ingredient Category Counts

| Category | Count |
| --- | ---: |
| 곡류 | 131 |
| 과일 | 120 |
| 기타 | 22 |
| 양념 | 155 |
| 유제품 | 29 |
| 육류 | 89 |
| 채소 | 240 |
| 해산물 | 83 |

Launch 28 full seed migration contained 789 ingredient value rows. Remote DB has 694 of those deterministic IDs. The remaining 95 are expected `on conflict do nothing` cases where the standard name already existed under an older ID. Standard-name presence check found 0 missing names.

## Integrity Checks

| Check | Result |
| --- | ---: |
| Duplicate normalized `ingredients.standard_name` | 0 |
| Duplicate `(ingredient_id, synonym)` | 0 |
| Same synonym mapped to multiple ingredients | 0 |
| Orphan `ingredient_synonyms.ingredient_id` | 0 |
| Synonym equal to canonical ingredient name | 0 |
| Invalid category outside v1 canonical labels | 0 |
| Empty ingredient name | 0 |
| Orphan bundle item | 0 |
| Duplicate bundle item pair | 0 |
| Launch ingredient references in `recipe_ingredients` | 0 |
| Launch ingredient references in `pantry_items` | 0 |
| Launch ingredient references in `shopping_list_items` | 0 |

## Search Mapping Smoke

| Input synonym | Expected target | Result |
| --- | --- | --- |
| 청도반시 | 연시 | PASS |
| 국수 | 소면 | PASS |
| 레몬착즙 | 레몬즙 | PASS |
| 레몬 착즙 | 레몬즙 | PASS |
| 멥쌀밥 | 쌀밥 | PASS |
| 라임주스 | 라임즙 | PASS |
| 라임 주스 | 라임즙 | PASS |

## Bundle Counts

| Bundle | Item count |
| --- | ---: |
| 과일/견과 | 14 |
| 국/찌개 기본 | 20 |
| 면/떡/밥 기본 | 11 |
| 베이킹/디저트 | 22 |
| 볶음/반찬 기본 | 19 |
| 브런치/간편식 | 12 |
| 소스/드레싱 | 10 |
| 유제품/계란 | 18 |
| 육류 기본 | 20 |
| 채소 기본 | 22 |
| 통조림/냉동 간편 | 10 |
| 한식 기본 양념 | 20 |
| 해산물/해조 | 24 |

## Rollback Status

Rollback SQL is maintained at:

- `docs/workpacks/28-external-ingredient-data-ingest-gate/rollback-20260625090000_28_external_ingredient_full_seed.sql`

The rollback script now covers all launch 28 ingredient DB migrations listed above. It includes a runtime guard that blocks ingredient deletion if launch ingredient IDs are referenced by recipes, pantry items, or shopping list items. Current remote DB check found 0 such references.

Bundle rollback behavior:

- Bundle IDs `501-508` existed before launch 28, so rollback restores their previous names and items from `20260620073000_19_korean_home_pantry_bundles.sql`.
- Bundle IDs `509-513` were created by launch 28, so rollback deletes them.

## Remaining Risk

- The quality check used REST reads because `supabase db query --linked` timed out and `psql` lacked a pooler password. REST reads succeeded with no access errors.
- The rollback SQL was generated and structurally inspected, but it was not executed against production.
- If launch ingredient rows become referenced by user data later, the rollback guard will block full ingredient deletion. In that case, rollback should be handled as a forward correction or a targeted synonym/bundle rollback instead of deleting ingredients.
