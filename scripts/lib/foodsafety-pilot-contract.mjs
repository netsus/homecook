import { IngredientNutritionImportError } from "./ingredient-nutrition-import.mjs";

const RECIPE_MARKER = "create temp table tmp_foodsafety_pilot_recipes";
const INGREDIENT_MARKER = "create temp table tmp_foodsafety_pilot_ingredients";
const STEP_MARKER = "create temp table tmp_foodsafety_pilot_steps";

function invalid() {
  throw new IngredientNutritionImportError("PINNED_PILOT_CONTRACT_INVALID");
}

export function parseFoodsafetyPinnedSeed(seed) {
  if (typeof seed !== "string") invalid();
  const recipeStart = seed.indexOf(RECIPE_MARKER);
  const ingredientStart = seed.indexOf(INGREDIENT_MARKER, recipeStart + 1);
  const stepStart = seed.indexOf(STEP_MARKER, ingredientStart + 1);
  if (recipeStart < 0 || ingredientStart < 0 || stepStart < 0) invalid();
  const recipeSection = seed.slice(recipeStart, ingredientStart);
  const ingredientSection = seed.slice(ingredientStart, stepStart);
  const recipeIds = [...recipeSection.matchAll(/\('([0-9a-f-]{36})'::uuid,/gi)]
    .map((match) => match[1]);
  const ingredientNames = [...ingredientSection.matchAll(
    /\('[0-9a-f-]{36}'::uuid,\s*\d+::integer,\s*'((?:''|[^'])+)'::text/gi,
  )].map((match) => match[1].replaceAll("''", "'"));
  const uniqueRecipeIds = [...new Set(recipeIds)].sort();
  const uniqueIngredientNames = [...new Set(ingredientNames)].sort();
  if (uniqueRecipeIds.length !== 30 || uniqueIngredientNames.length !== 130) invalid();
  return {
    recipe_ids: uniqueRecipeIds,
    ingredient_names: uniqueIngredientNames,
  };
}

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function buildFoodsafetyScopeSql(contract) {
  if (
    !Array.isArray(contract?.recipe_ids) ||
    contract.recipe_ids.length !== 30 ||
    !Array.isArray(contract?.ingredient_names) ||
    contract.ingredient_names.length !== 130
  ) {
    invalid();
  }
  const recipeIds = encodedJson(contract.recipe_ids);
  const expectedRecipeCte = `
expected_recipe_ids as (
  select value::uuid as recipe_id
  from jsonb_array_elements_text(
    convert_from(decode('${recipeIds}', 'base64'), 'UTF8')::jsonb
  )
)`;
  const actual = `
with ${expectedRecipeCte}, pilot_recipes as (
  select source.recipe_id
  from public.recipe_sources source
  join expected_recipe_ids expected on expected.recipe_id = source.recipe_id
  where source.extraction_meta_json ->> 'reviewed_scope' in (
      'pilot_30_quality_corrected',
      'pilot_30_quality_corrected_replacement'
    )
    and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
), pilot_ingredients as (
  select distinct ingredient.ingredient_id
  from public.recipe_ingredients ingredient
  join pilot_recipes recipe on recipe.recipe_id = ingredient.recipe_id
), canonical_ingredients as (
  select canonical.id,
    jsonb_agg(name order by name) as normalized_names
  from public.ingredients canonical
  join pilot_ingredients pilot on pilot.ingredient_id = canonical.id
  cross join lateral (
    select canonical.standard_name as name
    union
    select synonym.synonym
    from public.ingredient_synonyms synonym
    where synonym.ingredient_id = canonical.id
  ) names
  group by canonical.id
)
select jsonb_build_object(
  'recipe_ids', (select jsonb_agg(recipe_id order by recipe_id) from pilot_recipes),
  'ingredient_ids', (select jsonb_agg(ingredient_id order by ingredient_id) from pilot_ingredients),
  'canonical_ingredients', (
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'normalized_names', normalized_names
    ) order by id)
    from canonical_ingredients
  )
)::text;
`;
  const expected = `
with ${expectedRecipeCte}, expected_ingredients as (
  select distinct ingredient.ingredient_id
  from public.recipe_ingredients ingredient
  join expected_recipe_ids recipe on recipe.recipe_id = ingredient.recipe_id
)
select jsonb_build_object(
  'recipe_ids', (
    select jsonb_agg(recipe_id order by recipe_id) from expected_recipe_ids
  ),
  'ingredient_ids', (
    select jsonb_agg(ingredient_id order by ingredient_id) from expected_ingredients
  )
)::text;
`;
  return { actual, expected };
}
