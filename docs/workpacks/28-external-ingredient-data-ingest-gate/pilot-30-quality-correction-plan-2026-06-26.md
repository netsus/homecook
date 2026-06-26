# Pilot 30 Recipe Quality Correction Plan - 2026-06-26

## Decision

Pilot 30 recipes should be corrected before expanding the recipe DB beyond the pilot set.

The pilot set is the quality gate for later 100-200 recipe loads. If method labels, tags, images, and ingredient ordering are corrected only after a larger load, the same defects will be duplicated across future batches.

## Current Issues

1. Step cooking methods still have many wrong matches.
   - The previous follow-up migration fixed the source-level single-method copy problem.
   - It did not replace human review for each step.
   - Next review must allow step-level method override.

2. User-visible tags are too noisy.
   - Current pilot recipes commonly include `공공레시피`, `식약처레시피`, and broad recommendation/source tags.
   - Source/provenance tags are useful for audit and internal filtering, but not always useful on recipe cards.
   - Next correction should separate internal source metadata from user-facing semantic tags.

3. Images are sometimes blurry, poorly centered, or over-zoomed.
   - FoodSafety source rows expose `ATT_FILE_NO_MAIN`, `ATT_FILE_NO_MK`, and per-step `MANUAL_IMGxx` fields.
   - Current seed stores one `thumbnail_url` and keeps one alternate source image URL in `recipe_sources.extraction_meta_json.source_image_url`.
   - This was not primarily a Supabase fee decision. It was the conservative mapping used by the pilot seed.
   - Storing more image URLs in metadata is cheap. Adding a full multi-image user-facing gallery is a schema/product change and should be a separate decision.

4. Ingredient order feels disconnected from the making steps.
   - Current `recipe_ingredients.sort_order` mostly follows source ingredient text order.
   - For cooking UX, ingredients first used in step 1 should usually appear earlier in the ingredient list.
   - Next correction should calculate or review ingredient order by first step mention, while preserving section labels such as sauce, dressing, garnish, broth, batter, and filling.

## Recommended Approach

Use a correction review pack and migration, not manual DB edits.

### Option Comparison

| Option | Summary | Assessment |
| --- | --- | --- |
| Manual DB edits | Change rows directly in Supabase table editor | Fast, but not repeatable, hard to rollback, and future batch logic remains broken. Reject. |
| One-off SQL patch only | Create SQL updates from currently known issues | Safer than direct edits, but still misses user review and does not improve review tooling. Use only after review decisions exist. |
| Review-pack driven correction | Generate pilot 30 review UI, export decisions, generate idempotent migration and rollback | Best fit. Preserves audit trail, supports rollback, and improves the process before the next recipe batch. |

## Correction Scope

### A. Step Cooking Methods

- Add step-level method control to the review HTML.
- Default value can use current DB value, but reviewer can override each step.
- Generated migration updates `recipe_steps.cooking_method_id`.
- Keep existing `cooking_methods`; do not add new method rows unless a repeated gap is proven.

### B. Tags

- Add tag review controls per recipe:
  - `visible_tags`: user-facing card/detail tags.
  - `internal_source_tags`: source/provenance tags kept only in `recipe_sources.extraction_meta_json`.
- Remove `공공레시피` and `식약처레시피` from visible recipe card tags by default.
- Keep 2-4 meaningful user-facing tags per recipe where possible.
- Examples:
  - visible: `한식`, `국물요리`, `면요리`, `샐러드`, `고단백`, `다이어트`
  - internal only: `공공레시피`, `식약처레시피`

### C. Images

- Show all available source image candidates in review:
  - `ATT_FILE_NO_MAIN`
  - `ATT_FILE_NO_MK`
  - non-empty `MANUAL_IMG01`-`MANUAL_IMG20`
- Reviewer chooses one primary `thumbnail_url`.
- Store all source image candidates in `recipe_sources.extraction_meta_json.image_candidates`.
- Do not create a new gallery table in this pass.
- If many recipes need multiple visible images later, open a separate schema/product decision for `recipe_media` reuse or a public recipe image gallery.

### D. Ingredient Order

- Generate an automatic suggested order:
  1. Ingredients mentioned earliest in steps.
  2. Ingredients in the same component/section kept near each other when possible.
  3. Unmentioned ingredients keep source order after mentioned ingredients.
- Review UI allows per-row order override.
- Generated migration updates `recipe_ingredients.sort_order`.

### E. Ingredient and Section Corrections

- Keep existing controls for parsed name, target ingredient, amount, and component label.
- Explicitly support completed component references such as sauce/dressing/batter when a step says “made sauce 5g”.
- For component references, do not incorrectly create a pantry ingredient unless the component should exist as a real ingredient.

## Execution Plan

1. Export current remote pilot 30 data and original source metadata into a correction artifact.
2. Build `pilot-30-quality-review.html` with recipe-level and step-level controls:
   - cooking method per step
   - visible tags vs internal tags
   - image candidate preview and thumbnail choice
   - ingredient order and section label
   - existing ingredient mapping corrections
3. Reviewer exports `pilot-30-quality-decisions.json`.
4. Generate migration and rollback SQL from decisions:
   - `recipes.thumbnail_url`
   - `recipes.tags`
   - `recipe_tags`
   - `recipe_sources.extraction_meta_json`
   - `recipe_steps.cooking_method_id`
   - `recipe_ingredients.sort_order`
   - approved ingredient/amount/section fixes only if included in the decisions.
5. Run local dry-run and data smoke:
   - pilot recipe count remains 30.
   - no recipe loses all visible tags.
   - source/provenance is still present in metadata.
   - every step has a valid cooking method.
   - ingredient order is deterministic.
6. Apply to remote after PR merge, then run deployed smoke on a few sample detail pages.

## Acceptance Criteria

- Pilot 30 recipes no longer show source-only tags as prominent visible tags.
- Each pilot recipe has a reviewed primary image chosen from available source image candidates.
- Step method labels are reviewed per step, not inferred only from recipe-level source method.
- Ingredients display in a cooking-friendly order, especially matching early step usage.
- All corrections are reproducible through JSON decisions plus migration/rollback SQL.
- No direct manual production DB edits are required.

## Open Decisions

- Whether source/provenance tags should remain searchable in public tag search after being hidden from visible cards.
- Whether step images should be exposed in the UI later. This pass should preserve URLs in metadata only.
- Whether `recipe_media` should be reused for public source images in a later product/schema pass.
