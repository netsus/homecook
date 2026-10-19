begin;

-- Forward-only owner selection. Existing RPC/session/CAS/receipts, immutable
-- extraction snapshots and historical meal/cooking pins are unchanged.
-- CREATE OR REPLACE preserves function OIDs, owners and ACLs.
create or replace function private.validate_youtube_saved_recipe_editable_content(p_content jsonb,p_source_snapshot jsonb)
returns jsonb language plpgsql stable
set search_path=pg_catalog,public,private,pg_temp as $function$
declare v_base jsonb; v_content jsonb; v_items jsonb:='[]'; v_item jsonb; v_client jsonb; v_source jsonb; v_current jsonb;
  v_trusted jsonb; v_quantity jsonb; v_context jsonb; v_runtime jsonb; v_existing jsonb; v_origin jsonb;
  v_catalog jsonb; v_catalog_present boolean; v_catalog_replay boolean; v_catalog_changed boolean;
  v_index bigint; v_id text; v_same boolean; v_replay boolean:=false;
begin
  if jsonb_typeof(p_content->'ingredients') is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_content->'ingredients') row
    where jsonb_typeof(row) is distinct from 'object' or exists(select 1 from jsonb_object_keys(row) key
      where key not in ('row_id','source_draft_ingredient_id','standard_name','quantity_mode','amount','unit','display_text','component_label',
        'quantity_input','quantity_context_fingerprint','catalog_ingredient_id'))) then
    raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_base:=jsonb_set(p_content,'{ingredients}',coalesce((select jsonb_agg(row-'quantity_input'-'quantity_context_fingerprint'-'catalog_ingredient_id' order by ordinality)
    from jsonb_array_elements(p_content->'ingredients') with ordinality rows(row,ordinality)),'[]'));
  -- JavaScript's JSON number is a transport view of the stored numeric.
  -- Restore only the exact same binary float view, never an epsilon range.
  -- Explicit new raw text still determines its own canonical quantity below.
  v_existing:=coalesce(p_source_snapshot->'_quantity_current_content','{}');
  v_items:='[]';
  for v_item in select row from jsonb_array_elements(v_base->'ingredients') row loop
    v_current:=null; v_source:=null;
    select row into v_current from jsonb_array_elements(coalesce(v_existing->'ingredients','[]')) row
      where row->>'row_id'=v_item->>'row_id';
    if v_current is null then
      select row into v_source from jsonb_array_elements(coalesce(p_source_snapshot#>'{draft_json,ingredients}','[]')) row
        where row->>'draft_ingredient_id'=v_item->>'source_draft_ingredient_id';
      v_current:=v_source;
    end if;
    if v_current ? 'quantity_input' and v_current->>'standard_name'=btrim(v_item->>'standard_name')
      and v_current->'unit'=v_item->'unit' and v_item->>'quantity_mode'='quantity'
      and (v_source is not null or v_current->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id')
      and (v_current->>'amount')::double precision=(v_item->>'amount')::double precision then
      v_item:=jsonb_set(v_item,'{amount}',v_current->'amount');
    end if;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  v_base:=jsonb_set(v_base,'{ingredients}',v_items); v_items:='[]';
  v_content:=private.validate_youtube_saved_quantity_legacy(v_base,p_source_snapshot);
  v_existing:=coalesce(p_source_snapshot->'_quantity_current_content','{}');
  for v_item,v_index in select row,ordinality from jsonb_array_elements(v_content->'ingredients') with ordinality rows(row,ordinality) loop
    v_client:=p_content->'ingredients'->(v_index::integer-1);
    v_source:=null; v_current:=null; v_trusted:=null; v_quantity:=null; v_context:=null; v_replay:=false;
    select row into v_source from jsonb_array_elements(coalesce(p_source_snapshot#>'{draft_json,ingredients}','[]')) row
      where row->>'draft_ingredient_id'=v_item->>'source_draft_ingredient_id';
    select row into v_current from jsonb_array_elements(coalesce(v_existing->'ingredients','[]')) row
      where row->>'row_id'=v_item->>'row_id';
    -- Omitted keys remain absent on legacy rows. Older editors preserve an
    -- existing explicit choice; receipts normalize their own history first.
    select row into v_origin from jsonb_array_elements(coalesce(p_source_snapshot#>'{_quantity_replay_content,ingredients}','[]')) row
      where row->>'row_id'=v_item->>'row_id' and row->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id'
        and row->>'standard_name'=v_item->>'standard_name' and row->'amount'=v_item->'amount'
        and row->'unit'=v_item->'unit' and row->'quantity_mode'=v_item->'quantity_mode';
    v_catalog_replay:=v_origin is not null and (not (v_client ? 'catalog_ingredient_id')
      or v_client->'catalog_ingredient_id'=v_origin->'catalog_ingredient_id');
    v_catalog_present:=v_client ? 'catalog_ingredient_id';
    v_catalog:=v_client->'catalog_ingredient_id';
    if not v_catalog_present then
      if v_catalog_replay then
        v_catalog_present:=v_origin ? 'catalog_ingredient_id'; v_catalog:=v_origin->'catalog_ingredient_id';
      elsif v_current ? 'catalog_ingredient_id' then
        v_catalog_present:=true;
        v_catalog:=case when v_current->>'standard_name'=v_item->>'standard_name'
          then v_current->'catalog_ingredient_id' else 'null'::jsonb end;
      end if;
    end if;
    if v_catalog_present then
      if v_catalog <> 'null'::jsonb and (jsonb_typeof(v_catalog)<>'string'
        or (v_catalog#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
        raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
      if v_catalog <> 'null'::jsonb and v_client ? 'catalog_ingredient_id' and not v_catalog_replay
        and not exists(select 1 from public.ingredients ingredient
          where ingredient.id=(v_catalog#>>'{}')::uuid and public.is_selectable_catalog_ingredient(ingredient.id)) then
        raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
      v_item:=v_item||jsonb_build_object('catalog_ingredient_id',v_catalog);
    end if;
    v_catalog_changed:=not v_catalog_replay and v_catalog_present
      and v_catalog is distinct from v_current->'catalog_ingredient_id';
    v_same:=v_current is not null and v_current->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id'
      and v_current->>'standard_name'=v_item->>'standard_name' and v_current->'amount'=v_item->'amount'
      and v_current->'unit'=v_item->'unit' and v_current->'quantity_mode'=v_item->'quantity_mode';
    if v_same and v_current ? 'quantity_input' then v_trusted:=v_current;
    elsif v_current is null and v_source ? 'quantity_input'
      and v_source->>'standard_name'=v_item->>'standard_name' and v_source->'amount'=v_item->'amount'
      and v_source->'unit'=v_item->'unit' and v_item->>'quantity_mode'='quantity' then
      v_trusted:=jsonb_build_object('quantity_input',v_source->'quantity_input');
      if v_source ? 'quantity_context_fingerprint' then
        v_trusted:=v_trusted||jsonb_build_object('quantity_context_fingerprint',v_source->'quantity_context_fingerprint'); end if;
    end if;
    -- A receipt is server-held history, not new conversion authority. Exact
    -- raw/tuple echoes can normalize to that original result before replay.
    if v_client#>>'{quantity_input,expected_context_fingerprint}' is not null then
      select row into v_origin from jsonb_array_elements(coalesce(p_source_snapshot#>'{_quantity_replay_content,ingredients}','[]')) row
        where row->>'row_id'=v_item->>'row_id' and row->'source_draft_ingredient_id'=v_item->'source_draft_ingredient_id'
          and row->>'standard_name'=v_item->>'standard_name' and row->'amount'=v_item->'amount' and row->'unit'=v_item->'unit'
          and row->'quantity_mode'=v_item->'quantity_mode'
          and row#>>'{quantity_input,raw_value}'=v_client#>>'{quantity_input,raw_value}'
          and row#>>'{quantity_input,raw_unit}'=v_client#>>'{quantity_input,raw_unit}'
          and row->>'quantity_context_fingerprint'=v_client#>>'{quantity_input,expected_context_fingerprint}';
      if v_origin is not null then v_trusted:=v_origin; v_replay:=true; end if;
    end if;
    if v_catalog_replay and v_origin ? 'quantity_input' then v_trusted:=v_origin; end if;
    -- Food-dependent estimates belong to their frozen identity. A metadata
    -- relink must not silently reinterpret spoon/count/density evidence.
    if v_catalog_changed and v_trusted ? 'quantity_input' and not coalesce((
      v_trusted#>>'{quantity_input,quality}'='direct'
      and v_trusted#>'{quantity_input,reason}'='null'::jsonb
      and v_trusted#>'{quantity_input,batch_basis}'='null'::jsonb
      and ((v_trusted#>>'{quantity_input,raw_unit}' in ('g','kg') and v_item->>'unit' in ('g','kg')
        and v_trusted#>>'{quantity_input,normalized,unit}'='g')
        or (v_trusted#>>'{quantity_input,raw_unit}' in ('ml','mL','l','L') and v_item->>'unit' in ('ml','mL','l','L')
          and v_trusted#>>'{quantity_input,normalized,unit}'='ml'))
    ),false) then raise exception 'QUANTITY_INPUT_REQUIRED' using errcode='55000'; end if;
    if v_client ? 'quantity_input' then
      if v_client->'quantity_input'='null'::jsonb then
        if not private.quantity_input_v4_enabled() then raise exception 'UNIT_POLICY_INACTIVE' using errcode='55000'; end if;
        -- Explicit clear is different from an older editor's missing key.
        v_trusted:=null;
      elsif v_client#>>'{quantity_input,expected_context_fingerprint}' is not null then
        if jsonb_typeof(v_client->'quantity_input') is distinct from 'object'
          or (select count(*) from jsonb_object_keys(v_client->'quantity_input'))<>4 then
          raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
        if not v_replay and v_same and v_trusted is not null
          and v_trusted#>>'{quantity_input,raw_value}'=v_client#>>'{quantity_input,raw_value}'
          and v_trusted#>>'{quantity_input,raw_unit}'=v_client#>>'{quantity_input,raw_unit}'
          and v_trusted->>'quantity_context_fingerprint'=v_client#>>'{quantity_input,expected_context_fingerprint}' then
          v_replay:=true; -- unchanged quantity, including an OFF title edit
        end if;
        if not v_replay then
          if v_item->>'quantity_mode'<>'quantity' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
          v_id:=case when v_catalog_present then v_catalog#>>'{}' when v_source->>'standard_name'=v_item->>'standard_name' and v_source->>'resolution_status'='resolved'
            then nullif(v_source->>'ingredient_id','') else null end;
          v_runtime:=jsonb_build_object('_quantity_owner_action','edit','amount',v_client#>>'{quantity_input,raw_value}',
            'unit',v_client#>>'{quantity_input,raw_unit}','quantity_input',(v_client->'quantity_input')-'expected_context_fingerprint',
            'expected_context_fingerprint',v_client#>>'{quantity_input,expected_context_fingerprint}');
          v_context:=private.youtube_worker_quantity_input_v4(v_runtime,jsonb_build_object('ingredient_id',v_id,'amount',v_item->'amount','unit',v_item->'unit'));
          v_trusted:=jsonb_build_object('quantity_input',v_context->'snapshot','quantity_context_fingerprint',v_context->'context_fingerprint');
          v_item:=jsonb_set(v_item,'{amount}',v_context#>'{snapshot,display_quantity,amount}');
        end if;
      elsif v_trusted is null or v_client->'quantity_input' is distinct from v_trusted->'quantity_input' then
        raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    elsif v_current ? 'quantity_input' and not v_same then
      raise exception '%',case when private.quantity_input_v4_enabled() then 'QUANTITY_INPUT_REQUIRED' else 'UNIT_POLICY_INACTIVE' end using errcode='55000';
    end if;
    if v_client ? 'quantity_context_fingerprint' and (v_trusted is null
      or v_client->'quantity_context_fingerprint' is distinct from v_trusted->'quantity_context_fingerprint') then
      raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if v_trusted is not null then
      v_item:=v_item||jsonb_build_object('quantity_input',v_trusted->'quantity_input');
      if v_trusted ? 'quantity_context_fingerprint' then v_item:=v_item||jsonb_build_object(
        'quantity_context_fingerprint',v_trusted->'quantity_context_fingerprint'); end if;
    end if;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  return jsonb_set(v_content,'{ingredients}',v_items);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'VALIDATION_ERROR' using errcode='22023';
end;
$function$;

create or replace function private.project_youtube_saved_recipe_ingredient_links(
  p_result public.youtube_saved_recipe_results
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_links jsonb := '{}'::jsonb;
  v_editable jsonb;
  v_source jsonb;
  v_link jsonb;
  v_candidates jsonb;
  v_row_id text;
  v_source_id text;
  v_current_name text;
  v_source_name text;
  v_source_status text;
  v_source_ingredient_id text;
  v_occurrence_raw_text text;
  v_match_count integer;
  v_match_id uuid;
begin
  for v_editable in
    select item
    from jsonb_array_elements(
      coalesce(p_result.editable_content_json -> 'ingredients', '[]'::jsonb)
    ) rows(item)
  loop
    v_row_id := v_editable ->> 'row_id';
    v_source_id := v_editable ->> 'source_draft_ingredient_id';
    v_current_name := btrim(coalesce(v_editable ->> 'standard_name', ''));
    v_link := jsonb_build_object(
      'ingredient_id', null,
      'resolution_status', 'unresolved',
      'candidates', '[]'::jsonb
    );
    v_source := null;

    if v_editable ? 'catalog_ingredient_id' then
      if v_editable->>'catalog_ingredient_id' is not null and exists (
        select 1 from public.ingredients ingredient
        where ingredient.id=(v_editable->>'catalog_ingredient_id')::uuid
          and public.is_selectable_catalog_ingredient(ingredient.id)
      ) then
        v_link:=jsonb_build_object('ingredient_id',v_editable->>'catalog_ingredient_id',
          'catalog_name',(select standard_name from public.ingredients where id=(v_editable->>'catalog_ingredient_id')::uuid),
          'resolution_status','resolved','candidates','[]'::jsonb);
      end if;
      v_links:=v_links||jsonb_build_object(v_row_id,v_link);
      continue;
    end if;

    if nullif(v_source_id, '') is not null then
      select source_item
        into v_source
      from jsonb_array_elements(
        coalesce(
          p_result.source_snapshot_json -> 'draft_json' -> 'ingredients',
          '[]'::jsonb
        )
      ) source_rows(source_item)
      where source_item ->> 'draft_ingredient_id' = v_source_id
      limit 1;
    end if;

    v_source_name := btrim(coalesce(
      v_source ->> 'standard_name',
      v_source ->> 'raw_text',
      ''
    ));

    -- A missing source pointer or any source/current name mismatch means the
    -- user changed identity. Never revive the old source id in that case.
    if v_source is not null
      and v_current_name <> ''
      and v_current_name = v_source_name then
      v_source_status := v_source ->> 'resolution_status';
      v_source_ingredient_id := v_source ->> 'ingredient_id';

      if v_source_status = 'resolved'
        and coalesce(v_source_ingredient_id, '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.ingredients ingredient
          where ingredient.id = v_source_ingredient_id::uuid
            and public.is_selectable_catalog_ingredient(ingredient.id)
        ) then
        v_link := jsonb_build_object(
          'ingredient_id', v_source_ingredient_id,
          'resolution_status', 'resolved',
          'candidates', '[]'::jsonb
        );
      elsif v_source_status = 'needs_review' then
        select coalesce(jsonb_agg(jsonb_build_object(
          'ingredient_id', ingredient.id,
          'standard_name', ingredient.standard_name,
          'confidence', case
            when jsonb_typeof(candidate -> 'confidence') = 'number'
              then candidate -> 'confidence'
            else '1'::jsonb
          end
        ) order by candidate_rows.ordinality), '[]'::jsonb)
          into v_candidates
        from jsonb_array_elements(coalesce(v_source -> 'candidates', '[]'::jsonb))
          with ordinality candidate_rows(candidate, ordinality)
        join public.ingredients ingredient
          on ingredient.id = case
            when coalesce(candidate ->> 'ingredient_id', '')
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (candidate ->> 'ingredient_id')::uuid
            else null
          end
        where public.is_selectable_catalog_ingredient(ingredient.id);
        v_link := jsonb_build_object(
          'ingredient_id', null,
          'resolution_status', 'needs_review',
          'candidates', coalesce(v_candidates, '[]'::jsonb)
        );
      elsif v_source_status is null or v_source_status = 'unresolved' then
        -- Older rows may predate resolver metadata, while cached unresolved
        -- rows can gain a newly warranted exact match under the hardened
        -- catalog helper. Reconstruct only occurrence-owned context: original
        -- name plus this row's own amount and unit. Never use display text or
        -- another row, and never run this path for renamed/detached rows.
        v_occurrence_raw_text := case
          when nullif(btrim(v_source ->> 'original_name'), '') is null then null
          else concat_ws(' ',
            btrim(v_source ->> 'original_name'),
            nullif(btrim(v_source ->> 'amount'), ''),
            nullif(btrim(v_source ->> 'unit'), '')
          )
        end;
        select count(*)::integer,
          (array_agg(matched.id order by matched.standard_name, matched.id))[1],
          coalesce(jsonb_agg(jsonb_build_object(
            'ingredient_id', matched.id,
            'standard_name', matched.standard_name,
            'confidence', 1
          ) order by matched.standard_name, matched.id), '[]'::jsonb)
          into v_match_count, v_match_id, v_candidates
        from public.match_ingredient_name_exact_with_context(
          v_current_name,
          nullif(btrim(v_source ->> 'unit'), ''),
          v_occurrence_raw_text
        ) matched;

        if v_match_count = 1 then
          v_link := jsonb_build_object(
            'ingredient_id', v_match_id,
            'resolution_status', 'resolved',
            'candidates', '[]'::jsonb
          );
        elsif v_match_count > 1 then
          v_link := jsonb_build_object(
            'ingredient_id', null,
            'resolution_status', 'needs_review',
            'candidates', v_candidates
          );
        end if;
      end if;
    end if;

    v_links := v_links || jsonb_build_object(v_row_id, v_link);
  end loop;

  return v_links;
end;
$function$;


create or replace function private.project_youtube_saved_recipe_result(
  p_result public.youtube_saved_recipe_results
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'draft_id', p_result.id,
    'recipe_id', p_result.canonical_recipe_id,
    'canonical_content_hash', (select content_hash from public.build_recipe_content_snapshot_input(p_result.canonical_recipe_id)),
    'revision', p_result.revision,
    'created_at', p_result.created_at,
    'updated_at', p_result.updated_at,
    'content', p_result.editable_content_json,
    'ingredient_links', private.project_youtube_saved_recipe_ingredient_links(p_result),
    'source', jsonb_build_object(
      'extraction_id', p_result.extraction_session_id,
      'youtube_url', p_result.source_snapshot_json ->> 'youtube_url',
      'youtube_video_id', p_result.source_snapshot_json ->> 'youtube_video_id',
      'thumbnail_url', p_result.source_snapshot_json -> 'thumbnail_url'
    )
  )||case when private.quantity_input_v4_enabled() or exists(
    select 1 from jsonb_array_elements(p_result.editable_content_json->'ingredients') row where row ? 'quantity_input') then
    jsonb_build_object('quantity_policy',case when private.quantity_input_v4_enabled() then 'quantity-v4' else null end,
      'quantity_contexts',coalesce((select jsonb_object_agg(row->>'row_id',private.youtube_worker_quantity_input_v4(
        jsonb_build_object('_quantity_owner_action','context'),jsonb_build_object('ingredient_id',
          private.project_youtube_saved_recipe_ingredient_links(p_result)#>>array[row->>'row_id','ingredient_id'])))
        from jsonb_array_elements(p_result.editable_content_json->'ingredients') row),'{}'::jsonb)) else '{}'::jsonb end;
$function$;


create or replace function public.read_public_youtube_saved_recipe_detail(
  p_recipe_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_snapshot record;
  v_ingredients jsonb;
  v_steps jsonb;
begin
  perform private.verify_full_local_internal_scope();

  if not exists (
    select 1
    from public.youtube_saved_recipe_results as saved
    join public.recipes as recipe
      on recipe.id = saved.canonical_recipe_id
    where saved.canonical_recipe_id = p_recipe_id
      and recipe.source_type = 'youtube'
      and recipe.visibility = 'public'
      and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
      and recipe.deleted_at is null
  ) then
    return null;
  end if;

  select * into strict v_snapshot
  from public.build_recipe_content_snapshot_input(p_recipe_id);

  select coalesce(
    jsonb_agg(
      (item
        - 'catalog_resolution_status'
        - 'food_product_id'
        - 'food_product_nutrition_version_id'
        - 'food_product_name'
        - 'food_product_brand')
      || jsonb_build_object(
        'id', p_recipe_id::text || ':ingredient:' || (item ->> 'sort_order')
      )
      order by (item ->> 'sort_order')::integer
    ),
    '[]'::jsonb
  ) into v_ingredients
  from jsonb_array_elements(v_snapshot.ingredients_json) as rows(item);

  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'id', p_recipe_id::text || ':step:' || (item ->> 'step_number')
      )
      order by (item ->> 'step_number')::integer
    ),
    '[]'::jsonb
  ) into v_steps
  from jsonb_array_elements(v_snapshot.steps_json) as rows(item);

  return jsonb_build_object(
    'catalog_selection_present', exists(select 1 from public.youtube_saved_recipe_results saved,
      lateral jsonb_array_elements(saved.editable_content_json->'ingredients') row
      where saved.canonical_recipe_id=p_recipe_id and row ? 'catalog_ingredient_id'),
    'ingredients', v_ingredients,
    'steps', v_steps
  );
end;
$function$;


create or replace function private.sync_youtube_saved_recipe_canonical()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_recipe_id uuid;
  v_tags text[];
  v_extraction_meta jsonb;
  v_capability_state text;
  v_cutover_attempt_id uuid;
  v_existing_writer_txid text;
  v_acquired_writer_marker boolean := false;
  v_nutrition_writer text;
begin
  if new.id is null then
    new.id := extensions.gen_random_uuid();
  end if;

  select coalesce(array_agg(tag.value order by tag.ordinality), '{}'::text[])
    into v_tags
  from jsonb_array_elements_text(
    coalesce(new.editable_content_json -> 'tags', '[]'::jsonb)
  ) with ordinality tag(value, ordinality);

  -- recipe_sources is readable with a public parent recipe. Keep only a
  -- non-sensitive bridge discriminator there: never copy the private saved
  -- draft id, extraction evidence, or mutation metadata into the public row.
  v_extraction_meta := jsonb_build_object(
    'youtube_saved_canonical_bridge', true
  );

  select capability.state, capability.current_cutover_attempt_id
    into v_capability_state, v_cutover_attempt_id
  from public.account_generation_capability_state as capability
  where capability.singleton;

  if v_capability_state = 'generation_active' then
    select attempt.result_json ->> '_internal_generation_writer_txid'
      into v_existing_writer_txid
    from public.account_generation_cutover_attempts as attempt
    where attempt.id = v_cutover_attempt_id;

    if v_existing_writer_txid is distinct from pg_catalog.txid_current()::text then
      perform public.set_account_generation_internal_writer_marker(
        v_cutover_attempt_id,
        true
      );
      v_acquired_writer_marker := true;
    end if;
  end if;

  if new.canonical_recipe_id is null then
    new.canonical_recipe_id := extensions.gen_random_uuid();

    insert into public.recipes (
      id,
      title,
      thumbnail_url,
      base_servings,
      tags,
      source_type,
      created_by,
      visibility,
      revision,
      created_at,
      updated_at
    ) values (
      new.canonical_recipe_id,
      new.editable_content_json ->> 'title',
      nullif(new.source_snapshot_json ->> 'thumbnail_url', ''),
      (new.editable_content_json ->> 'base_servings')::integer,
      v_tags,
      'youtube',
      new.owner_user_id,
      'public',
      new.revision,
      new.created_at,
      new.updated_at
    );

    insert into public.recipe_sources (
      recipe_id,
      youtube_url,
      youtube_video_id,
      extraction_methods,
      extraction_meta_json
    ) values (
      new.canonical_recipe_id,
      new.source_snapshot_json ->> 'youtube_url',
      new.source_snapshot_json ->> 'youtube_video_id',
      coalesce(
        array(
          select method.value
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(new.source_snapshot_json -> 'extraction_methods') = 'array'
                then new.source_snapshot_json -> 'extraction_methods'
              else '[]'::jsonb
            end
          ) as method(value)
          where method.value = any (array['description', 'comment', 'caption']::text[])
        ),
        '{}'::text[]
      ),
      v_extraction_meta
    );

    -- Keep public discovery aligned with the established reviewed-tag model.
    -- Known system tags become searchable; unknown labels remain pending and
    -- private in recipe_tags and therefore never enter the public projection.
    perform public.set_recipe_tags(
      new.canonical_recipe_id,
      public.build_recipe_tag_payload(v_tags, 'system_suggested'),
      new.owner_user_id,
      'system_suggested'
    );
    update public.recipes
    set revision = new.revision,
        updated_at = new.updated_at
    where id = new.canonical_recipe_id;

    if v_acquired_writer_marker then
      perform public.set_account_generation_internal_writer_marker(
        v_cutover_attempt_id,
        false
      );
    end if;

    return new;
  end if;

  update public.recipes as recipe
  set title = new.editable_content_json ->> 'title',
      thumbnail_url = nullif(new.source_snapshot_json ->> 'thumbnail_url', ''),
      base_servings = (new.editable_content_json ->> 'base_servings')::integer,
      tags = v_tags,
      revision = new.revision,
      updated_at = new.updated_at
  where recipe.id = new.canonical_recipe_id
    and recipe.created_by = new.owner_user_id
    and recipe.source_type = 'youtube'
    and recipe.visibility = 'public'
    and recipe.deleted_at is null
  returning recipe.id into v_recipe_id;

  if v_recipe_id is null then
    raise exception 'youtube saved recipe canonical ownership mismatch'
      using errcode = '23514';
  end if;

  -- Every content-hash field participates, even if the nutrients are unchanged.
  -- Retire only the current marker; immutable payloads and existing pins stay.
  -- Otherwise the future-meal trigger may reuse an old title/steps content pin.
  if (old.editable_content_json->'ingredients' is distinct from new.editable_content_json->'ingredients'
      or old.editable_content_json->'base_servings' is distinct from new.editable_content_json->'base_servings'
      or old.editable_content_json->'title' is distinct from new.editable_content_json->'title'
      or old.editable_content_json->'steps' is distinct from new.editable_content_json->'steps')
    and exists(select 1 from jsonb_array_elements(
      (old.editable_content_json->'ingredients')||(new.editable_content_json->'ingredients')) row
      where row ? 'catalog_ingredient_id') then
    v_nutrition_writer:=current_setting('homecook.recipe_nutrition_writer',true);
    perform set_config('homecook.recipe_nutrition_writer','on',true);
    update public.recipe_nutrition_snapshots set is_current=false
      where recipe_id=new.canonical_recipe_id and is_current;
    perform set_config('homecook.recipe_nutrition_writer',coalesce(v_nutrition_writer,''),true);
  end if;

  update public.recipe_sources as source
  set youtube_url = new.source_snapshot_json ->> 'youtube_url',
      youtube_video_id = new.source_snapshot_json ->> 'youtube_video_id',
      extraction_methods = coalesce(
        array(
          select method.value
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(new.source_snapshot_json -> 'extraction_methods') = 'array'
                then new.source_snapshot_json -> 'extraction_methods'
              else '[]'::jsonb
            end
          ) as method(value)
          where method.value = any (array['description', 'comment', 'caption']::text[])
        ),
        '{}'::text[]
      ),
      extraction_meta_json = v_extraction_meta
  where source.recipe_id = new.canonical_recipe_id;

  perform public.set_recipe_tags(
    new.canonical_recipe_id,
    public.build_recipe_tag_payload(v_tags, 'system_suggested'),
    new.owner_user_id,
    'system_suggested'
  );
  update public.recipes
  set revision = new.revision,
      updated_at = new.updated_at
  where id = new.canonical_recipe_id;

  if v_acquired_writer_marker then
    perform public.set_account_generation_internal_writer_marker(
      v_cutover_attempt_id,
      false
    );
  end if;

  return new;
end;
$function$;


commit;
