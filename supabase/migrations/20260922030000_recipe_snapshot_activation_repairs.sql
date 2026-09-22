begin;

-- Restore the already-reviewed public fork projection only from the exact old
-- private-only definition observed during the beta rollout. Cook-mode content is
-- already canonical; it needs VOLATILE because its authority verifier locks rows.
-- Do not relax session, source-owner visibility, image, or product-version rules.
do $restore_snapshot_readers$
declare
  v_fork regprocedure := 'public.read_recipe_snapshot_entrypoint_context(uuid,timestamptz,text,integer,timestamptz,uuid)'::regprocedure;
  v_cook regprocedure := 'public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)'::regprocedure;
  v_core regprocedure := 'public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)'::regprocedure;
  v_guard regprocedure := 'public.build_recipe_nutrition_input_guard(uuid)'::regprocedure;
  v_core_source_hash text;
  v_core_definition text;
  v_old text;
  v_new text;
  v_fork_source_hash text;
  v_cook_source_hash text;
  v_fork_definition text := $canonical_fork$
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
$canonical_fork$;
begin
  select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') into v_fork_source_hash
  from pg_proc where oid = v_fork;
  select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') into v_cook_source_hash
  from pg_proc where oid = v_cook;

  if v_fork_source_hash not in (
      'ea8000094fdbc7ac3c8e1053735455fda17b23acfd878fac0f801b4dde827209',
      '61d721c881d3b864f7a8e8a1c2f44afd22c90a1f44050fcf634282301c3acb34'
    ) or v_cook_source_hash is distinct from
      'a60e7778548d50898e79ded38ba6c42c1a4785273fca44cec78862f4ff163c6f'
    or exists (
      select 1 from pg_proc p
      where p.oid in (v_fork, v_cook)
        and (p.proowner <> 'postgres'::regrole
          or p.proacl is distinct from array['postgres=X/postgres','service_role=X/postgres']::aclitem[]
          or p.prosecdef is distinct from true
          or p.proretset or p.prorettype <> 'jsonb'::regtype
          or p.prokind <> 'f' or p.prolang <> (select oid from pg_language where lanname='plpgsql')
          or p.proconfig is distinct from case when p.oid=v_fork
            then array['search_path=pg_catalog, public, private, pg_temp']
            else array['search_path=pg_catalog, public, pg_temp'] end
          or (p.oid=v_fork and p.provolatile <> 'v')
          or (p.oid=v_cook and p.provolatile not in ('s','v')))
    ) then
    raise exception 'SNAPSHOT_ACTIVATION_CATALOG_DRIFT';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_core_source_hash from pg_proc where oid=v_core;
  if v_core_source_hash not in ('a0cad60b1858a534443865aced96c7ce78772c24da1b29780bf7e16bd7221293','18c1b5c135d0f5b64cd8fbde722399a86abf79b31bd6b23011e876580448c4d8')
    or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=v_guard) is distinct from '6f6eadac334f88168cc5ff58d0f7880f51cdd9f0277cb331ebe8b3d49873977e'
    or exists (select 1 from pg_proc p where p.oid in (v_core,v_guard) and (
      p.proowner <> 'postgres'::regrole or p.prosecdef is distinct from true or p.proretset
      or p.prorettype <> 'jsonb'::regtype or p.prokind <> 'f'
      or p.prolang <> (select oid from pg_language where lanname=case when p.oid=v_core then 'plpgsql' else 'sql' end)
      or p.proconfig is distinct from case when p.oid=v_core
        then array['search_path=pg_catalog, public, extensions, pg_temp'] else array['search_path=pg_catalog, public, private, pg_temp'] end
      or (p.oid=v_core and (p.provolatile <> 'v' or p.proacl is distinct from array['postgres=X/postgres','service_role=X/postgres']::aclitem[]))
      or (p.oid=v_guard and (p.provolatile <> 's' or (
        p.proacl is distinct from array['postgres=X/postgres']::aclitem[]
        and p.proacl is distinct from array['postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres']::aclitem[]))))
    ) then raise exception 'SNAPSHOT_ACTIVATION_CATALOG_DRIFT'; end if;

  if v_core_source_hash = 'a0cad60b1858a534443865aced96c7ce78772c24da1b29780bf7e16bd7221293' then
    v_core_definition := pg_get_functiondef(v_core);
    -- Only the missing 8/22 derived-create blocks change. Preserve current
    -- product identity/version checks from the complete 182-migration replay.
    v_old := $core_old_0$  v_source public.recipes%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_operation_scope text;
  v_key_hash text;
$core_old_0$;
    v_new := $core_new_0$  v_source public.recipes%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_effective_operation text;
  v_operation_scope text;
  v_key_hash text;
$core_new_0$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_1$  end if;

  v_operation_scope := 'personal_recipe_' || p_operation;
  v_key_hash := encode(
    extensions.digest(convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'),
$core_old_1$;
    v_new := $core_new_1$  end if;

  v_effective_operation := coalesce(v_effective_operation, p_operation);
  v_operation_scope := 'personal_recipe_' || v_effective_operation;
  v_key_hash := encode(
    extensions.digest(convert_to(p_idempotency_key::text, 'UTF8'), 'sha256'),
$core_new_1$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_2$      convert_to(
        (
          case p_operation
            when 'delete' then jsonb_build_object(
              'operation', p_operation,
              'recipe_id', p_recipe_id
            )
            when 'update' then jsonb_build_object(
              'operation', p_operation,
              'recipe_id', p_recipe_id,
              'base_recipe_revision', p_base_recipe_revision
            )
            when 'fork' then jsonb_build_object(
              'operation', p_operation,
              'source_recipe_id', p_source_recipe_id
            )
            when 'save_as_new' then jsonb_build_object(
              'operation', p_operation,
              'source_recipe_id', p_source_recipe_id
            )
            else jsonb_build_object('operation', p_operation)
          end
          || case when p_operation = 'delete' then '{}'::jsonb else
            jsonb_build_object(
              'draft', v_canonical_draft,
$core_old_2$;
    v_new := $core_new_2$      convert_to(
        (
          case v_effective_operation
            when 'delete' then jsonb_build_object(
              'operation', v_effective_operation,
              'recipe_id', p_recipe_id
            )
            when 'update' then jsonb_build_object(
              'operation', v_effective_operation,
              'recipe_id', p_recipe_id,
              'base_recipe_revision', p_base_recipe_revision
            )
            when 'fork' then jsonb_build_object(
              'operation', v_effective_operation,
              'source_recipe_id', p_source_recipe_id
            )
            when 'save_as_new' then jsonb_build_object(
              'operation', v_effective_operation,
              'source_recipe_id', p_source_recipe_id
            )
            else jsonb_build_object('operation', v_effective_operation)
          end
          || case when v_effective_operation = 'delete' then '{}'::jsonb else
            jsonb_build_object(
              'draft', v_canonical_draft,
$core_new_2$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_3$  end if;

  if p_operation = 'fork' then
    if v_source.id is null
      or v_source.visibility is distinct from 'public'
      or v_source.deleted_at is not null
      or recipe_visibility_guard.is_owner_publicly_visible(v_source.created_by)
        is not true
    then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  elsif p_operation = 'save_as_new' then
$core_old_3$;
    v_new := $core_new_3$  end if;

  v_effective_operation := p_operation;

  if p_operation = 'fork' then
    if v_source.id is null or v_source.deleted_at is not null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_source.visibility = 'public'
      and recipe_visibility_guard.is_owner_publicly_visible(v_source.created_by)
        is true
    then
      v_effective_operation := 'fork';
    elsif v_source.created_by = p_owner_uuid
      and v_source.visibility = 'private'
    then
      v_effective_operation := 'save_as_new';
    else
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_base_recipe_revision is null
      or v_source.revision is distinct from p_base_recipe_revision
    then
      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
  elsif p_operation = 'save_as_new' then
$core_new_3$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_4$      or v_source.deleted_at is not null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  elsif p_operation in ('update', 'delete') then
$core_old_4$;
    v_new := $core_new_4$      or v_source.deleted_at is not null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_base_recipe_revision is null
      or v_source.revision is distinct from p_base_recipe_revision
    then
      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
  elsif p_operation in ('update', 'delete') then
$core_new_4$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_5$      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
  end if;

$core_old_5$;
    v_new := $core_new_5$      raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
    end if;
  end if;

  if p_tags is null and v_effective_operation in ('fork', 'save_as_new') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'normalized_key', tag.normalized_key,
      'label', tag.label,
      'kind', tag.kind,
      'is_system', tag.is_system,
      'theme_eligible', tag.theme_eligible,
      'source', recipe_tag.source,
      'confidence', recipe_tag.confidence,
      'visibility', recipe_tag.visibility,
      'review_status', recipe_tag.review_status
    ) order by recipe_tag.sort_order, tag.normalized_key collate "C"), '[]'::jsonb)
      into v_canonical_tags
    from public.recipe_tags as recipe_tag
    join public.tags as tag
      on tag.id = recipe_tag.tag_id
    where recipe_tag.recipe_id = p_source_recipe_id;
  end if;

$core_new_5$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_6$    end if;

    if p_operation in ('create', 'fork', 'save_as_new') then
      insert into public.recipes (
        id,
$core_old_6$;
    v_new := $core_new_6$    end if;

    if v_effective_operation in ('create', 'fork', 'save_as_new') then
      insert into public.recipes (
        id,
$core_new_6$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_7$        p_owner_uuid,
        'private',
        case when p_operation = 'fork' then p_source_recipe_id else null end,
        1,
        p_now,
$core_old_7$;
    v_new := $core_new_7$        p_owner_uuid,
        'private',
        case
          when v_effective_operation = 'fork' then p_source_recipe_id
          when v_effective_operation = 'save_as_new' then v_source.origin_recipe_id
          else null
        end,
        1,
        p_now,
$core_new_7$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    v_old := $core_old_8$    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
      'normalized_key', tag ->> 'normalized_key',
      'label', tag ->> 'label',
      'kind', 'user',
      'is_system', false,
      'theme_eligible', false,
      'source', 'user_selected',
      'visibility', 'private',
      'review_status', 'approved'
    ) order by ordinality), '[]'::jsonb)
      into v_canonical_tags
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
      with ordinality as tag_rows(tag, ordinality);

    perform public.set_recipe_tags(
$core_old_8$;
    v_new := $core_new_8$    end loop;

    if p_tags is not null or v_effective_operation not in ('fork', 'save_as_new') then
      select coalesce(jsonb_agg(jsonb_build_object(
        'normalized_key', tag ->> 'normalized_key',
        'label', tag ->> 'label',
        'kind', 'user',
        'is_system', false,
        'theme_eligible', false,
        'source', 'user_selected',
        'visibility', 'private',
        'review_status', 'approved'
      ) order by ordinality), '[]'::jsonb)
        into v_canonical_tags
      from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
        with ordinality as tag_rows(tag, ordinality);
    end if;

    perform public.set_recipe_tags(
$core_new_8$;
    if (length(v_core_definition)-length(replace(v_core_definition,v_old,'')))/length(v_old) <> 1 then
      raise exception 'SNAPSHOT_ACTIVATION_CORE_SHAPE_CHANGED';
    end if;
    v_core_definition := replace(v_core_definition,v_old,v_new);
    execute v_core_definition;
  end if;

  if v_fork_source_hash = 'ea8000094fdbc7ac3c8e1053735455fda17b23acfd878fac0f801b4dde827209' then
    execute v_fork_definition;
  end if;
  alter function public.read_snapshot_v2_cook_mode(
    uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz
  ) volatile;

  revoke all on function public.build_recipe_nutrition_input_guard(uuid) from public,anon,authenticated,service_role;

  if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=v_core)
      is distinct from '18c1b5c135d0f5b64cd8fbde722399a86abf79b31bd6b23011e876580448c4d8'
    or (select proacl from pg_proc where oid=v_guard) is distinct from array['postgres=X/postgres']::aclitem[]
    or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=v_fork)
      is distinct from '61d721c881d3b864f7a8e8a1c2f44afd22c90a1f44050fcf634282301c3acb34'
    or (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=v_cook)
      is distinct from 'a60e7778548d50898e79ded38ba6c42c1a4785273fca44cec78862f4ff163c6f'
    or exists (select 1 from pg_proc where oid in (v_fork,v_cook) and provolatile <> 'v') then
    raise exception 'SNAPSHOT_ACTIVATION_REPAIR_MISMATCH';
  end if;
end;
$restore_snapshot_readers$;

notify pgrst, 'reload schema';
commit;
