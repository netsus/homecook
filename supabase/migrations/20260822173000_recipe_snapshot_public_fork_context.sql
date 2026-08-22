begin;

create or replace function public.read_recipe_snapshot_entrypoint_context(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_recipe_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_session_authority jsonb;
  v_result jsonb;
begin
  v_session_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    p_session_issued_at
  );

  select jsonb_build_object(
    'revision', recipe.revision
  ) || jsonb_build_object(
    case
      when recipe.created_by = p_owner_uuid
        and recipe.visibility = 'private'
        then 'edit_context'
      else 'fork_context'
    end,
    jsonb_build_object(
      'base_recipe_revision', recipe.revision,
      'draft', jsonb_build_object(
        'title', recipe.title,
        'description', recipe.description,
        'base_servings', recipe.base_servings,
        'ingredients', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ingredient_id', ingredient.ingredient_id,
            'amount', ingredient.amount,
            'unit', ingredient.unit,
            'ingredient_type', ingredient.ingredient_type,
            'display_text', ingredient.display_text,
            'component_label', ingredient.component_label,
            'scalable', ingredient.scalable,
            'food_product_id', ingredient.food_product_id,
            'food_product_nutrition_version_id',
              ingredient.food_product_nutrition_version_id
          ) order by ingredient.sort_order, ingredient.id)
          from public.recipe_ingredients as ingredient
          where ingredient.recipe_id = recipe.id
        ), '[]'::jsonb),
        'steps', coalesce((
          select jsonb_agg(jsonb_build_object(
            'step_number', step.step_number,
            'instruction', step.instruction,
            'cooking_method_id', step.cooking_method_id,
            'cooking_method_ids', coalesce((
              select jsonb_agg(link.method_id order by link.position, link.method_id)
              from public.recipe_step_cooking_methods as link
              where link.step_id = step.id
            ), jsonb_build_array(step.cooking_method_id)),
            'ingredients_used', coalesce((
              select jsonb_agg(jsonb_build_object(
                'ingredient_id', ingredient_used -> 'ingredient_id',
                'amount', ingredient_used -> 'amount',
                'unit', ingredient_used -> 'unit',
                'cut_size', ingredient_used -> 'cut_size'
              ) order by ordinality)
              from jsonb_array_elements(coalesce(step.ingredients_used, '[]'::jsonb))
                with ordinality as used(ingredient_used, ordinality)
            ), '[]'::jsonb),
            'component_label', step.component_label,
            'heat_level', step.heat_level,
            'duration_seconds', step.duration_seconds,
            'duration_text', step.duration_text
          ) order by step.step_number, step.id)
          from public.recipe_steps as step
          where step.recipe_id = recipe.id
        ), '[]'::jsonb)
      ),
      'image_object_id', case
        when recipe.created_by = p_owner_uuid
          and recipe.visibility = 'private'
        then (
          select image_object.id
          from public.recipe_image_object_references as reference
          join public.recipe_image_objects as image_object
            on image_object.id = reference.image_object_id
          where reference.reference_type = 'recipe_thumbnail'
            and reference.consumer_id = recipe.id
            and image_object.owner_uuid = recipe.created_by
            and image_object.account_generation =
              (v_session_authority ->> 'account_generation')::bigint
            and image_object.visibility = 'private'
            and image_object.state = 'attached_private'
        )
        else null
      end
    )
  ) into v_result
  from public.recipes as recipe
  where recipe.id = p_recipe_id
    and recipe.deleted_at is null
    and (
      (
        recipe.created_by = p_owner_uuid
        and recipe.visibility = 'private'
      )
      or (
        current_setting('homecook.personal_recipe_v2', true) = 'on'
        and current_setting('homecook.snapshot_v2_creation', true) = 'on'
        and recipe.visibility = 'public'
        and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
          is true
      )
    );

  if v_result is null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

alter function public.read_recipe_snapshot_entrypoint_context(
  uuid, timestamp with time zone, text, integer, timestamp with time zone, uuid
) owner to postgres;

revoke all on function public.read_recipe_snapshot_entrypoint_context(
  uuid, timestamp with time zone, text, integer, timestamp with time zone, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.read_recipe_snapshot_entrypoint_context(
  uuid, timestamp with time zone, text, integer, timestamp with time zone, uuid
) to service_role;

commit;
