begin;
set local lock_timeout='5s';

-- Local draft: approval and an exact controlled rollout are required before production apply.
-- Existing rows, historical snapshots and product versions are deliberately not backfilled.
create table private.recipe_product_only_write_control (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
alter table private.recipe_product_only_write_control owner to postgres;
revoke all on table private.recipe_product_only_write_control from public,anon,authenticated,service_role;
insert into private.recipe_product_only_write_control(singleton,enabled) values(true,false);

create function private.recipe_product_only_writes_enabled()
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,private,pg_temp
as $function$
declare v_enabled boolean;
begin
  -- Hold the shared control lock until commit. OFF waits for in-flight new
  -- format writes and prevents an old-reader rollback from racing a writer.
  select enabled into v_enabled from private.recipe_product_only_write_control where singleton for share;
  return coalesce(v_enabled,false);
end;
$function$;
alter function private.recipe_product_only_writes_enabled() owner to postgres;
revoke all on function private.recipe_product_only_writes_enabled() from public,anon,authenticated,service_role;

create function private.guard_recipe_product_only_writes()
returns trigger language plpgsql security definer
set search_path=pg_catalog,private,pg_temp
as $function$
begin
  if (new.ingredient_id is null or new.source_kind is not null) and not private.recipe_product_only_writes_enabled() then
    raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023';
  end if;
  return new;
end;
$function$;
alter function private.guard_recipe_product_only_writes() owner to postgres;
revoke all on function private.guard_recipe_product_only_writes() from public,anon,authenticated,service_role;
create trigger recipe_ingredients_product_only_write_guard
  before insert or update on public.recipe_ingredients
  for each row execute function private.guard_recipe_product_only_writes();

-- Step row references are another new shape, including on generic rows.
create function private.guard_recipe_step_source_writes()
returns trigger language plpgsql security definer
set search_path=pg_catalog,private,pg_temp
as $function$
begin
  if jsonb_typeof(new.ingredients_used)='array' and exists(
    select 1 from jsonb_array_elements(new.ingredients_used) item where item ? 'row_key'
  ) and not private.recipe_product_only_writes_enabled() then
    raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023';
  end if;
  return new;
end;
$function$;
alter function private.guard_recipe_step_source_writes() owner to postgres;
revoke all on function private.guard_recipe_step_source_writes() from public,anon,authenticated,service_role;
create trigger recipe_steps_source_write_guard before insert or update of ingredients_used on public.recipe_steps
for each row execute function private.guard_recipe_step_source_writes();

alter table public.recipe_ingredients add column source_kind text;
alter table public.recipe_ingredients alter column ingredient_id drop not null;
-- Keep the stored numeric datum/scale; removing typemod avoids rounding 0.125 to 0.13.
-- The former magnitude bound and finite positive quantities remain explicit.
alter table public.recipe_ingredients alter column amount type numeric;
alter table public.recipe_ingredients add constraint recipe_ingredients_amount_domain_check check (
  amount is null or (amount::text not in ('NaN','Infinity','-Infinity') and amount>0 and amount<=99999999.99)
);
alter table public.recipe_ingredients add constraint recipe_ingredients_source_identity_check check (
  ((food_product_id is null and food_product_nutrition_version_id is null and ingredient_id is not null)
    or (food_product_id is not null and food_product_nutrition_version_id is not null))
  and (source_kind is null or source_kind=case when food_product_id is null then 'ingredient' else 'food_product' end)
  and (ingredient_id is not null or coalesce(source_kind='food_product',false))
);

create function private.require_recipe_product_identity(
  p_owner uuid, p_visibility text, p_product uuid, p_version uuid,
  p_ingredient uuid, p_original_ingredients jsonb
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_product public.food_products%rowtype;
  v_version public.food_product_nutrition_versions%rowtype;
  v_profile public.nutrition_profiles%rowtype;
begin
  if p_ingredient is null and not private.recipe_product_only_writes_enabled() then
    raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023';
  end if;
  select * into v_product from public.food_products where id=p_product for share;
  select * into v_version from public.food_product_nutrition_versions
    where id=p_version and product_id=p_product for share;
  select * into v_profile from public.nutrition_profiles
    where id=v_version.nutrition_profile_id for share;
  if v_product.id is null or v_version.id is null or v_profile.id is null
    or v_product.deleted_at is not null or v_product.moderation_status <> 'visible'
    or not recipe_visibility_guard.is_owner_publicly_visible(v_product.owner_user_id)
    or not (v_product.visibility='public' or (v_product.visibility='private' and v_product.owner_user_id=p_owner))
    or (p_visibility='public' and v_product.visibility <> 'public')
    or nullif(btrim(v_product.name),'') is null
    or v_profile.basis_amount is null or v_profile.basis_amount <= 0
    or v_profile.basis_amount::text in ('NaN','Infinity','-Infinity')
    or v_profile.basis_unit not in ('g','ml','serving','package') then
    raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023';
  end if;
  if v_product.source_type <> 'public_dataset' or v_product.visibility <> 'public' then
    -- Manual/private products retain their existing representative-link eligibility.
    perform 1 from public.food_product_ingredient_links link
      join public.ingredients ingredient on ingredient.id=link.ingredient_id
      where link.product_id=p_product and link.ingredient_id=p_ingredient
        and link.relation='represents' and link.review_status='approved'
        and link.is_primary and link.is_active
        and public.is_selectable_catalog_ingredient(link.ingredient_id)
      for share of link,ingredient;
    if not found then raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023'; end if;
  elsif p_ingredient is not null and not exists (
    select 1 from jsonb_array_elements(coalesce(p_original_ingredients,'[]'::jsonb)) original
    where (original->>'ingredient_id')::uuid=p_ingredient
      and (original->>'food_product_id')::uuid=p_product
      and (original->>'food_product_nutrition_version_id')::uuid=p_version
  ) and not exists (
    select 1 from public.food_product_ingredient_links link
    where link.product_id=p_product and link.ingredient_id=p_ingredient
      and link.relation='represents' and link.review_status='approved' and link.is_primary and link.is_active
  ) then
    raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023';
  end if;
  return jsonb_build_object('food_product_name',v_product.name,'food_product_brand',v_product.brand);
end;
$function$;

create or replace function public.enforce_recipe_ingredient_product_link()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp
as $function$
begin
  if new.food_product_id is null then return new; end if;
  if exists (
    select 1 from public.food_products product
    join public.food_product_nutrition_versions version
      on version.product_id=product.id and version.id=new.food_product_nutrition_version_id
    where product.id=new.food_product_id and product.source_type='public_dataset' and product.visibility='public'
  ) then
    if new.ingredient_id is null then return new;end if;
    -- Preserve an existing public source only on the same physical row. New
    -- rows, forks and different pairs still require the approved link below.
    if tg_op='UPDATE' and old.recipe_id=new.recipe_id and old.id=new.id
      and old.ingredient_id is not distinct from new.ingredient_id
      and old.food_product_id is not distinct from new.food_product_id
      and old.food_product_nutrition_version_id is not distinct from new.food_product_nutrition_version_id then return new;end if;
  end if;
  if not exists (
    select 1 from public.food_product_ingredient_links link
    where link.product_id=new.food_product_id and link.ingredient_id=new.ingredient_id
      and link.relation='represents' and link.review_status='approved' and link.is_primary and link.is_active
  ) then raise exception 'recipe_ingredient_product_link_guard' using errcode='23514'; end if;
  return new;
end;
$function$;

-- Include physical identity moves, so changing only id/recipe_id cannot bypass
-- the same-row representative guard above.
drop trigger recipe_ingredient_product_link_guard on public.recipe_ingredients;
create trigger recipe_ingredient_product_link_guard before insert or update of id,recipe_id,ingredient_id,food_product_id,food_product_nutrition_version_id
on public.recipe_ingredients for each row execute function public.enforce_recipe_ingredient_product_link();

create function private.write_recipe_source_rows(
  p_recipe uuid, p_owner uuid, p_ingredients jsonb, p_original_ingredients jsonb, p_reuse_ids boolean
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare
  v_item jsonb; v_original jsonb; v_label jsonb;
  v_product uuid; v_version uuid; v_ingredient uuid; v_row uuid; v_key uuid;
  v_kind text; v_marker text; v_group text; v_groups text[] := '{}'; v_keys uuid[] := '{}';
  v_order integer := 0; v_visibility text;
  v_rows jsonb := '[]';
  v_amount numeric; v_unit text; v_quantity numeric; v_quantity_unit text;v_live_original jsonb;v_written_ids uuid[]:='{}';
begin
  select visibility into v_visibility from public.recipes where id=p_recipe and created_by=p_owner;
  if not found or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients)>200 then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  if p_reuse_ids then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order,item.id),'[]'::jsonb) into v_live_original
      from public.recipe_ingredients item where item.recipe_id=p_recipe;
    if v_live_original is distinct from coalesce(p_original_ingredients,'[]'::jsonb) then
      raise exception 'VALIDATION_ERROR' using errcode='22023';
    end if;
  end if;
  -- A legacy serializer must not drop an existing marker or nullable row.
  -- Require the explicit source-row contract, not an inferred kind.
  if exists(select 1 from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) original
    where nullif(original->>'source_kind','') is not null
      or (original->>'ingredient_id' is null and nullif(original->>'food_product_id','') is not null
        and nullif(original->>'food_product_nutrition_version_id','') is not null))
    and (jsonb_array_length(p_ingredients)=0 or exists(
      select 1 from jsonb_array_elements(p_ingredients) item
      where nullif(item->>'source_kind','') is null or nullif(item->>'row_key','') is null
        or item->>'row_key' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )) then raise exception 'RECIPE_SOURCE_CONTRACT_REQUIRED' using errcode='22023';end if;
  for v_item in select value from jsonb_array_elements(p_ingredients) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    v_product:=nullif(v_item->>'food_product_id','')::uuid;
    v_version:=nullif(v_item->>'food_product_nutrition_version_id','')::uuid;
    v_ingredient:=nullif(v_item->>'ingredient_id','')::uuid;
    v_key:=nullif(v_item->>'row_key','')::uuid;
    v_kind:=case when v_product is null then 'ingredient' else 'food_product' end;
    -- Generic rows keep their established shape. Linked legacy requests also
    -- remain unmarked; only an explicit product contract uses the new reader.
    v_marker:=case when v_product is not null and private.recipe_product_only_writes_enabled()
      and (v_item ? 'source_kind' or v_key is not null or v_ingredient is null) then 'food_product' else null end;
    if (v_product is null) <> (v_version is null) or (v_product is null and v_ingredient is null)
      or (v_item ? 'source_kind' and v_item->>'source_kind' is distinct from v_kind)
      or (v_key is not null and v_key=any(v_keys)) then
      raise exception 'VALIDATION_ERROR' using errcode='22023';
    end if;
    if v_key is not null then v_keys:=array_append(v_keys,v_key); end if;
    v_group:=jsonb_build_array(v_kind,coalesce(v_product,v_ingredient),nullif(btrim(v_item->>'component_label'),''))::text;
    if v_group=any(v_groups) then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    v_groups:=array_append(v_groups,v_group);
    v_label:='{}';
    if v_product is not null then
      v_label:=private.require_recipe_product_identity(p_owner,v_visibility,v_product,v_version,v_ingredient,case when p_reuse_ids then p_original_ingredients else '[]'::jsonb end);
    end if;
    v_amount:=nullif(v_item->>'amount','')::numeric;
    v_unit:=nullif(v_item->>'unit','');
    if v_amount is not null and (v_amount<=0 or v_amount::text in ('NaN','Infinity','-Infinity')) then
      raise exception 'VALIDATION_ERROR' using errcode='22023';
    end if;
    -- Existing linked sources retain their raw count units; nutrition remains
    -- unknown without pinned evidence. Nullable product-only inputs need evidence.
    if v_product is not null and v_ingredient is null and coalesce(v_item->>'ingredient_type','QUANT')='QUANT' then
      v_quantity:=v_amount;
      v_quantity_unit:=case v_unit when 'T' then 'tbsp' when 't' then 'tsp' else public.normalize_recipe_nutrition_unit(v_unit) end;
      if v_quantity_unit='kg' then v_quantity:=v_amount*1000;v_quantity_unit:='g';
      elsif v_quantity_unit='l' then v_quantity:=v_amount*1000;v_quantity_unit:='ml';
      elsif v_quantity_unit='tbsp' then v_quantity:=v_amount*15;v_quantity_unit:='ml';
      elsif v_quantity_unit='tsp' then v_quantity:=v_amount*5;v_quantity_unit:='ml';
      elsif v_quantity_unit='cup' then v_quantity:=v_amount*200;v_quantity_unit:='ml'; end if;
      if private.convert_recipe_product_quantity(v_quantity,v_quantity_unit,
        private.recipe_product_quantity_context(v_product,v_version,p_owner)->'basis'->>'unit',
        private.recipe_product_quantity_context(v_product,v_version,p_owner)->'basis_relations') is null then
        raise exception 'VALIDATION_ERROR' using errcode='22023';
      end if;
    end if;
    v_row:=null;
    if p_reuse_ids and v_key is not null then
      select original into v_original from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) original
      where (original->>'id')::uuid=v_key
        and (original->>'ingredient_id')::uuid is not distinct from v_ingredient
        and (original->>'food_product_id')::uuid is not distinct from v_product
        and (original->>'food_product_nutrition_version_id')::uuid is not distinct from v_version;
      if found then v_row:=v_key; end if;
    end if;
    if p_reuse_ids then
      select original into v_original from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) original
        where (original->>'ingredient_id')::uuid is not distinct from v_ingredient
          and (original->>'food_product_id')::uuid is not distinct from v_product
          and (original->>'food_product_nutrition_version_id')::uuid is not distinct from v_version
          and ((v_key is not null and (original->>'id')::uuid=v_key)
            or (v_key is null and nullif(btrim(original->>'component_label'),'') is not distinct from nullif(btrim(v_item->>'component_label'),'')));
      if found then
        if (select count(*) from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) original
          where (original->>'ingredient_id')::uuid is not distinct from v_ingredient
            and (original->>'food_product_id')::uuid is not distinct from v_product
            and (original->>'food_product_nutrition_version_id')::uuid is not distinct from v_version
            and ((v_key is not null and (original->>'id')::uuid=v_key)
              or (v_key is null and nullif(btrim(original->>'component_label'),'') is not distinct from nullif(btrim(v_item->>'component_label'),''))))<>1 then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
        -- The complete captured originals were compared with the live owned
        -- recipe above. A legacy request can reuse its unique exact row too.
        v_row:=(v_original->>'id')::uuid;
        if (v_original->>'amount')::numeric is not distinct from v_amount then v_amount:=(v_original->>'amount')::numeric;end if;
      end if;
    end if;
    if v_row is not null then
      -- Existing format is not downgraded by a serializer or an OFF writer.
      if nullif(v_original->>'source_kind','') is not null then v_marker:=v_original->>'source_kind';end if;
      update public.recipe_ingredients set ingredient_id=v_ingredient,amount=v_amount,unit=v_unit,
        ingredient_type=coalesce(nullif(v_item->>'ingredient_type',''),'QUANT')::public.recipe_ingredient_type,
        display_text=nullif(v_item->>'display_text',''),component_label=nullif(v_item->>'component_label',''),
        scalable=coalesce((v_item->>'scalable')::boolean,true),sort_order=coalesce((v_item->>'sort_order')::integer,v_order),
        food_product_id=v_product,food_product_nutrition_version_id=v_version,source_kind=v_marker
      where id=v_row and recipe_id=p_recipe;
      if not found then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
    else
      v_row:=gen_random_uuid();
      insert into public.recipe_ingredients(id,recipe_id,ingredient_id,amount,unit,ingredient_type,display_text,component_label,scalable,sort_order,food_product_id,food_product_nutrition_version_id,source_kind)
      values(v_row,p_recipe,v_ingredient,v_amount,v_unit,coalesce(nullif(v_item->>'ingredient_type',''),'QUANT')::public.recipe_ingredient_type,
        nullif(v_item->>'display_text',''),nullif(v_item->>'component_label',''),coalesce((v_item->>'scalable')::boolean,true),coalesce((v_item->>'sort_order')::integer,v_order),v_product,v_version,v_marker);
    end if;
    v_written_ids:=array_append(v_written_ids,v_row);
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'row_key',v_row,'source_kind',v_marker,'ingredient_id',v_ingredient,'amount',v_amount,'unit',v_unit,
      'ingredient_type',coalesce(nullif(v_item->>'ingredient_type',''),'QUANT'),'display_text',nullif(v_item->>'display_text',''),
      'component_label',nullif(v_item->>'component_label',''),'scalable',coalesce((v_item->>'scalable')::boolean,true),'sort_order',coalesce((v_item->>'sort_order')::integer,v_order),
      'food_product_id',v_product,'food_product_nutrition_version_id',v_version)||v_label);
    v_order:=v_order+1;
  end loop;
  if p_reuse_ids then delete from public.recipe_ingredients where recipe_id=p_recipe and not(id=any(v_written_ids));end if;
  return jsonb_build_object('ingredients',v_rows);
end;
$function$;

create function private.map_recipe_step_source_rows(
  p_steps jsonb, p_requested jsonb, p_written jsonb, p_original_ingredients jsonb, p_original_steps jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare
  v_step jsonb; v_ref jsonb; v_refs jsonb; v_result jsonb:='[]';
  v_key uuid; v_id uuid; v_indices integer[]; v_index integer; v_original jsonb;
  v_row jsonb; v_old_refs jsonb; v_unchanged boolean; v_legacy_count integer;
begin
  if jsonb_typeof(p_steps)<>'array' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    v_refs:='[]';
    for v_ref in select value from jsonb_array_elements(coalesce(v_step->'ingredients_used','[]')) loop
      if jsonb_typeof(v_ref)<>'object' or exists(select 1 from jsonb_object_keys(v_ref) key where key not in ('ingredient_id','row_key','amount','unit','cut_size')) then
        raise exception 'VALIDATION_ERROR' using errcode='22023';
      end if;
      v_key:=nullif(v_ref->>'row_key','')::uuid;v_id:=nullif(v_ref->>'ingredient_id','')::uuid;
      select array_agg((ordinality-1)::integer order by ordinality) into v_indices
      from jsonb_array_elements(p_requested) with ordinality requested(item,ordinality)
      where case when v_key is not null then nullif(item->>'row_key','')::uuid=v_key
        else v_id is not null and nullif(item->>'ingredient_id','')::uuid=v_id
          and (nullif(btrim(v_step->>'component_label'),'') is null
            or nullif(btrim(item->>'component_label'),'')=nullif(btrim(v_step->>'component_label'),'')) end;
      if cardinality(v_indices)=1 then
        v_index:=v_indices[1];v_row:=p_written->'ingredients'->v_index;
        if v_key is not null and v_id is not null and v_id is distinct from (v_row->>'ingredient_id')::uuid then
          raise exception 'VALIDATION_ERROR' using errcode='22023';
        end if;
        select count(*) into v_legacy_count from jsonb_array_elements(p_requested) item
          where nullif(item->>'ingredient_id','')::uuid=nullif(v_row->>'ingredient_id','')::uuid
            and (nullif(btrim(v_step->>'component_label'),'') is null
              or nullif(btrim(item->>'component_label'),'')=nullif(btrim(v_step->>'component_label'),''));
        if v_row->>'source_kind' is null and v_legacy_count=1 and not exists (
          select 1 from jsonb_array_elements(coalesce(p_original_steps,'[]')) step
          cross join jsonb_array_elements(coalesce(step->'ingredients_used','[]')) ref
          where nullif(ref->>'row_key','') in (v_key::text,v_row->>'row_key')
        ) then
          v_refs:=v_refs||jsonb_build_array((v_ref-'row_key')||jsonb_build_object('ingredient_id',v_row->'ingredient_id'));
        else
          if not private.recipe_product_only_writes_enabled() then raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode='22023';end if;
          if v_row->>'source_kind' is null then
            update public.recipe_ingredients set source_kind=case when food_product_id is null then 'ingredient' else 'food_product' end
              where id=(v_row->>'row_key')::uuid;
          end if;
          v_refs:=v_refs||jsonb_build_array((v_ref-'row_key')||jsonb_build_object('row_key',v_row->'row_key','ingredient_id',v_row->'ingredient_id'));
        end if;
      elsif v_key is null and cardinality(v_indices)>1 then
        -- Preserve only an existing unresolved reference with the same source candidates.
        select item into v_original from jsonb_array_elements(coalesce(p_original_steps,'[]')) item
          where item->>'step_number'=v_step->>'step_number'
            and nullif(btrim(item->>'component_label'),'') is not distinct from nullif(btrim(v_step->>'component_label'),'');
        select coalesce(jsonb_agg(jsonb_build_object('ingredient_id',ref->'ingredient_id','amount',ref->'amount','unit',ref->'unit','cut_size',ref->'cut_size')
          ||case when nullif(ref->>'row_key','') is null then '{}'::jsonb else jsonb_build_object('row_key',ref->'row_key') end order by ordinality),'[]') into v_old_refs
          from jsonb_array_elements(coalesce(v_original->'ingredients_used','[]')) with ordinality refs(ref,ordinality);
        v_unchanged:=v_old_refs=coalesce(v_step->'ingredients_used','[]');
        if not coalesce(v_unchanged,false) and exists(select 1 from jsonb_array_elements(coalesce(v_original->'ingredients_used','[]')) ref where nullif(ref->>'row_key','') is not null) then
          raise exception 'RECIPE_SOURCE_CONTRACT_REQUIRED' using errcode='22023';
        end if;
        if v_unchanged then
          select not exists (
            (select jsonb_build_array(item->'ingredient_id',item->'food_product_id',item->'food_product_nutrition_version_id',nullif(btrim(item->>'component_label'),''))
               from jsonb_array_elements(p_requested) item where nullif(item->>'ingredient_id','')::uuid=v_id
             except all
             select jsonb_build_array(item->'ingredient_id',item->'food_product_id',item->'food_product_nutrition_version_id',nullif(btrim(item->>'component_label'),''))
               from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) item where nullif(item->>'ingredient_id','')::uuid=v_id)
            union all
            (select jsonb_build_array(item->'ingredient_id',item->'food_product_id',item->'food_product_nutrition_version_id',nullif(btrim(item->>'component_label'),''))
               from jsonb_array_elements(coalesce(p_original_ingredients,'[]')) item where nullif(item->>'ingredient_id','')::uuid=v_id
             except all
             select jsonb_build_array(item->'ingredient_id',item->'food_product_id',item->'food_product_nutrition_version_id',nullif(btrim(item->>'component_label'),''))
               from jsonb_array_elements(p_requested) item where nullif(item->>'ingredient_id','')::uuid=v_id)
          ) into v_unchanged;
        end if;
        if not coalesce(v_unchanged,false) then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
        v_refs:=v_refs||jsonb_build_array(v_ref);
      else raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    end loop;
    v_result:=v_result||jsonb_build_array(v_step||jsonb_build_object('ingredients_used',v_refs));
  end loop;
  return v_result;
end;
$function$;

alter function private.require_recipe_product_identity(uuid,text,uuid,uuid,uuid,jsonb) owner to postgres;
alter function private.write_recipe_source_rows(uuid,uuid,jsonb,jsonb,boolean) owner to postgres;
alter function private.map_recipe_step_source_rows(jsonb,jsonb,jsonb,jsonb,jsonb) owner to postgres;
revoke all on function private.require_recipe_product_identity(uuid,text,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.write_recipe_source_rows(uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function private.map_recipe_step_source_rows(jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Patch the current definitions, not an obsolete writer: session/owner/lock/image/revision
-- and recovery receipt guards stay around the existing transaction unchanged.
do $source_writers$
declare
  v_def text; v_old text; v_new text; v_signature regprocedure;
begin
  v_signature := 'public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure;
  v_def:=pg_get_functiondef(v_signature);
  v_old:='  v_requested_ingredient_id uuid;';
  if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_CORE_DECLARATION_DRIFT'; end if;
  v_def:=replace(v_def,v_old,v_old||E'
  v_row_write jsonb;
  v_mapped_steps jsonb;
  v_original_ingredients jsonb;
  v_original_steps jsonb;');
  v_def:=replace(v_def,'''ingredient_id'', ''amount'', ''unit'', ''ingredient_type'', ''display_text'',',
    '''ingredient_id'', ''row_key'', ''source_kind'', ''amount'', ''unit'', ''ingredient_type'', ''display_text'',');
  v_old:='          ''ingredient_id'', nullif(item ->> ''ingredient_id'', '''')::uuid,';
  if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_CORE_CANONICAL_DRIFT'; end if;
  v_def:=replace(v_def,v_old,v_old||E'
          ''row_key'', nullif(item ->> ''row_key'', '''')::uuid,
          ''source_kind'', item -> ''source_kind'',');
  v_old:=E'    delete from public.recipe_step_cooking_methods as link';
  if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_CORE_DELETE_DRIFT'; end if;
  v_new:=$capture$    select coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order,item.id),'[]'::jsonb) into v_original_ingredients
      from public.recipe_ingredients item where item.recipe_id=case when p_operation in ('fork','save_as_new') then p_source_recipe_id else p_recipe_id end;
    select coalesce(jsonb_agg(to_jsonb(step) order by step.step_number,step.id),'[]'::jsonb) into v_original_steps
      from public.recipe_steps step where step.recipe_id=case when p_operation in ('fork','save_as_new') then p_source_recipe_id else p_recipe_id end;
$capture$;
  v_def:=replace(v_def,v_old,v_new||v_old);
  v_old:=E'    delete from public.recipe_ingredients\n    where recipe_id = v_result_recipe_id;';
  if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_CORE_INGREDIENT_DELETE_DRIFT';end if;
  v_def:=replace(v_def,v_old,E'    if v_effective_operation<>''update'' then\n      delete from public.recipe_ingredients where recipe_id=v_result_recipe_id;\n    end if;');
  v_old:=$core_old$    for v_ingredient in
      select value
      from jsonb_array_elements(p_draft -> 'ingredients')
    loop
      v_requested_ingredient_id :=
        nullif(v_ingredient ->> 'ingredient_id', '')::uuid;
      v_ingredient_id := v_requested_ingredient_id;
      v_product_id := nullif(v_ingredient ->> 'food_product_id', '')::uuid;
      v_product_version_id :=
        nullif(v_ingredient ->> 'food_product_nutrition_version_id', '')::uuid;
      v_product_name := null;
      v_product_brand := null;

      if (v_product_id is null) <> (v_product_version_id is null) then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      if v_product_id is not null then
        select link.ingredient_id, product.name, product.brand
          into v_ingredient_id, v_product_name, v_product_brand
        from public.food_product_nutrition_versions as version
        join public.food_products as product
          on product.id = version.product_id
         and product.deleted_at is null
         and product.moderation_status = 'visible'
         and (
           product.visibility = 'public'
           or product.owner_user_id = p_owner_uuid
         )
        join public.food_product_ingredient_links as link
          on link.product_id = product.id
         and link.relation = 'represents'
         and link.review_status = 'approved'
         and link.is_primary
         and link.is_active
        where version.product_id = v_product_id
          and version.id = v_product_version_id;

        if v_ingredient_id is null
          or (
            v_requested_ingredient_id is not null
            and v_requested_ingredient_id is distinct from v_ingredient_id
          ) then
          raise exception 'VALIDATION_ERROR' using errcode = '22023';
        end if;
      end if;

      if v_ingredient_id is null then
        raise exception 'VALIDATION_ERROR' using errcode = '22023';
      end if;

      insert into public.recipe_ingredients (
        recipe_id,
        ingredient_id,
        amount,
        unit,
        ingredient_type,
        display_text,
        component_label,
        sort_order,
        scalable,
        food_product_id,
        food_product_nutrition_version_id
      ) values (
        v_result_recipe_id,
        v_ingredient_id,
        nullif(v_ingredient ->> 'amount', '')::numeric,
        nullif(v_ingredient ->> 'unit', ''),
        coalesce(nullif(v_ingredient ->> 'ingredient_type', ''), 'QUANT')::public.recipe_ingredient_type,
        nullif(v_ingredient ->> 'display_text', ''),
        nullif(v_ingredient ->> 'component_label', ''),
        v_target_ingredient_count,
        coalesce((v_ingredient ->> 'scalable')::boolean, true),
        v_product_id,
        v_product_version_id
      );
      v_canonical_ingredients := v_canonical_ingredients || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'ingredient_id', v_ingredient_id,
          'amount', nullif(v_ingredient ->> 'amount', '')::numeric,
          'unit', nullif(v_ingredient ->> 'unit', ''),
          'ingredient_type', coalesce(nullif(v_ingredient ->> 'ingredient_type', ''), 'QUANT'),
          'display_text', nullif(v_ingredient ->> 'display_text', ''),
          'component_label', nullif(v_ingredient ->> 'component_label', ''),
          'sort_order', v_target_ingredient_count,
          'scalable', coalesce((v_ingredient ->> 'scalable')::boolean, true),
          'food_product_id', v_product_id,
          'food_product_nutrition_version_id', v_product_version_id,
          'food_product_name', v_product_name,
          'food_product_brand', v_product_brand
        ))
      );
      v_target_ingredient_count := v_target_ingredient_count + 1;
    end loop;
$core_old$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_CORE_INSERT_DRIFT'; end if;
  v_def:=replace(v_def,v_old,$core_new$    v_row_write := private.write_recipe_source_rows(v_result_recipe_id,p_owner_uuid,p_draft->'ingredients',v_original_ingredients,v_effective_operation='update');
    v_canonical_ingredients := v_row_write->'ingredients';
    v_target_ingredient_count := jsonb_array_length(v_canonical_ingredients);
    v_mapped_steps := private.map_recipe_step_source_rows(p_draft->'steps',p_draft->'ingredients',v_row_write,v_original_ingredients,v_original_steps);
$core_new$);
  v_def:=replace(v_def,'from jsonb_array_elements(p_draft -> ''steps'')
    loop', 'from jsonb_array_elements(v_mapped_steps)
    loop');
  v_def:=replace(v_def,'        and not coalesce(item ->> ''unit'' = any(array[',
    '        and nullif(item ->> ''food_product_id'', '''') is null
        and not coalesce(item ->> ''unit'' = any(array[');
  execute v_def;

  v_signature:='public.create_manual_recipe_with_managed_image(uuid,timestamptz,text,integer,uuid,bigint,text,integer,text,text[],text,jsonb,jsonb,timestamptz)'::regprocedure;
  v_def:=pg_get_functiondef(v_signature);
  v_old:='  v_item jsonb;';
  if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_MANUAL_DECLARATION_DRIFT'; end if;
  v_def:=replace(v_def,v_old,v_old||E'
  v_row_write jsonb;
  v_mapped_steps jsonb;');
  v_old:=$manual_old$  for v_item in
    select value
    from jsonb_array_elements(p_ingredients)
  loop
    declare
      v_ingredient_id uuid := nullif(v_item ->> 'ingredient_id', '')::uuid;
      v_product_id uuid := nullif(v_item ->> 'food_product_id', '')::uuid;
      v_product_version_id uuid := nullif(v_item ->> 'food_product_nutrition_version_id', '')::uuid;
      v_linked_ingredient_id uuid;
    begin
      if (v_product_id is null) <> (v_product_version_id is null) then
        raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode = '22023';
      end if;

      if v_product_id is not null then
        -- Validate the exact version and current approved canonical link while
        -- holding row locks until the recipe and recovery receipt commit.
        select link.ingredient_id into v_linked_ingredient_id
        from public.food_products as product
        join public.food_product_nutrition_versions as version
          on version.product_id = product.id
         and version.id = v_product_version_id
        join public.food_product_ingredient_links as link
          on link.product_id = product.id
         and link.relation = 'represents'
         and link.review_status = 'approved'
         and link.is_primary
         and link.is_active
        join public.ingredients as ingredient on ingredient.id = link.ingredient_id
        where product.id = v_product_id
          and product.deleted_at is null
          and product.moderation_status = 'visible'
          and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
          and (product.visibility = 'public'
            or (product.visibility = 'private' and product.owner_user_id = p_owner_uuid))
          and public.is_selectable_catalog_ingredient(ingredient.id)
        for share of product, version, link, ingredient;

        if v_linked_ingredient_id is null
          or v_linked_ingredient_id is distinct from v_ingredient_id then
          raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode = '22023';
        end if;
      end if;

      insert into public.recipe_ingredients (
        recipe_id,
        ingredient_id,
        amount,
        unit,
        ingredient_type,
        display_text,
        scalable,
        sort_order,
        food_product_id,
        food_product_nutrition_version_id
      ) values (
        v_recipe.id,
        v_ingredient_id,
        nullif(v_item ->> 'amount', '')::numeric,
        nullif(v_item ->> 'unit', ''),
        (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
        nullif(v_item ->> 'display_text', ''),
        coalesce((v_item ->> 'scalable')::boolean, true),
        coalesce((v_item ->> 'sort_order')::integer, 0),
        v_product_id,
        v_product_version_id
      );
    end;
  end loop;
$manual_old$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_MANUAL_INSERT_DRIFT'; end if;
  v_def:=replace(v_def,v_old,$manual_new$  v_row_write := private.write_recipe_source_rows(v_recipe.id,p_owner_uuid,p_ingredients,'[]'::jsonb,false);
  v_mapped_steps := private.map_recipe_step_source_rows(p_steps,p_ingredients,v_row_write,'[]'::jsonb,'[]'::jsonb);
$manual_new$);
  v_def:=replace(v_def,'from jsonb_array_elements(p_steps)
  loop', 'from jsonb_array_elements(v_mapped_steps)
  loop');
  v_def:=replace(v_def,'      and not coalesce(item ->> ''unit'' = any(array[',
    '      and nullif(item ->> ''food_product_id'', '''') is null
      and not coalesce(item ->> ''unit'' = any(array[');
  v_old:=$column_old$      duration_text
    ) values ($column_old$;
  v_new:=$column_new$      duration_text,
      component_label
    ) values ($column_new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_MANUAL_STEP_COLUMN_DRIFT'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$value_old$      nullif(v_item ->> 'duration_text', '')
    );$value_old$;
  v_new:=$value_new$      nullif(v_item ->> 'duration_text', ''),
      nullif(v_item ->> 'component_label', '')
    );$value_new$;
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_MANUAL_STEP_VALUE_DRIFT'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end;
$source_writers$;

-- The immutable label/source, not a representative ingredient, is the product predecessor.
create or replace function private.recipe_product_nutrition_predecessor(
  p_product_id uuid,p_version_id uuid,p_ingredient_id uuid
) returns jsonb language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
  select jsonb_build_object('nutrition',jsonb_build_object(
    'source_kind','food_product',
    'profile',jsonb_build_object('id',profile.id,'basis_amount',profile.basis_amount,'basis_unit',profile.basis_unit,
      'review_status',profile.review_status,'is_active',profile.is_active,'values',coalesce((
        select jsonb_object_agg(value.nutrient_code,jsonb_build_object('amount',value.amount,'value_status',value.value_status))
        from public.nutrition_values value where value.profile_id=profile.id
          and value.nutrient_code in ('energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg','sugars_g','saturated_fat_g','fiber_g')
      ),'{}'::jsonb)),
    'source',jsonb_build_object('id',source.id,'review_status',source.review_status,'freshness_status',source.freshness_status,
      'is_active',source.is_active,'provider',source.provider_code,'dataset',source.dataset_name,'source_version',source.source_version,
      'data_basis_date',source.data_basis_date,'license',source.license_name,'source_url',source.source_url)
  ),'basis_relations',version.basis_relations_json)
  from public.food_product_nutrition_versions version
  join public.food_products product on product.id=version.product_id
    and product.deleted_at is null and product.moderation_status='visible'
  join public.nutrition_profiles profile on profile.id=version.nutrition_profile_id
    and profile.profile_kind='product_label' and profile.normalization_method='as_labeled' and profile.review_status='approved'
    and profile.basis_amount>0 and profile.basis_amount::text not in ('NaN','Infinity','-Infinity')
    and profile.basis_unit in ('g','ml','serving','package')
  join public.nutrition_source_items item on item.id=version.source_item_id and item.review_status='approved'
  join public.nutrition_sources source on source.id=item.source_id
    and source.review_status='approved' and source.freshness_status='current' and source.is_active
  where version.id=p_version_id and version.product_id=p_product_id;
$function$;

-- New input keys are presentation/reference data; their authority is checked by the writer.
do $source_draft_keys$
declare
  v_def text:=pg_get_functiondef('public.canonicalize_recipe_future_draft(jsonb)'::regprocedure);
  v_old text:='        ''ingredient_id'', nullif(item ->> ''ingredient_id'', '''')::uuid,';
begin
  if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_DRAFT_CANONICAL_DRIFT'; end if;
  v_def:=replace(v_def,v_old,v_old||E'\n        ''row_key'', nullif(item ->> ''row_key'', '''')::uuid,\n        ''source_kind'', case when nullif(item ->> ''food_product_id'', '''') is null then ''ingredient'' else ''food_product'' end,');
  execute v_def;
end;
$source_draft_keys$;

-- Nullable source_kind is a format marker, not a backfill: old snapshots keep their byte hash.
-- Only rows written by the new writer add their existing row ID and source branch to content JSON.
do $source_snapshot_keys$
declare
  v_def text:=pg_get_functiondef('public.build_recipe_content_snapshot_before_yt_saved_20261012(uuid)'::regprocedure);
  v_old text:=E'      )\n      order by ingredient.sort_order asc, ingredient.id asc';
  v_new text:=$new$      ) || case when ingredient.source_kind is null then '{}'::jsonb
        else jsonb_build_object('row_key',ingredient.id,'source_kind',ingredient.source_kind) end
      order by ingredient.sort_order asc, ingredient.id asc$new$;
begin
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_CONTENT_INPUT_DRIFT'; end if;
  execute replace(v_def,v_old,v_new);
end;
$source_snapshot_keys$;

-- Preserve the same canonical content in private/manual/public snapshots after the row map.
do $source_canonical_content$
declare
  v_def text:=pg_get_functiondef('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure);
  v_old text:=$old$    if v_recipe.visibility = 'public' then
      select canonical.ingredients_json,canonical.steps_json,canonical.content_hash
        into v_canonical_ingredients,v_canonical_steps,v_content_hash
      from public.build_recipe_content_snapshot_input(v_result_recipe_id) canonical;
    end if;$old$;
  v_new text:=$new$    select canonical.ingredients_json,canonical.steps_json,canonical.content_hash
      into v_canonical_ingredients,v_canonical_steps,v_content_hash
      from public.build_recipe_content_snapshot_input(v_result_recipe_id) canonical;$new$;
begin
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_CONTENT_WRITE_DRIFT'; end if;
  execute replace(v_def,v_old,v_new);
end;
$source_canonical_content$;

-- Enrich the audited owner/fork draft projection without changing its session/visibility checks.
-- Existing old-format rows keep their exact old projection shape.
do $source_entrypoint_keys$
declare
  v_function record; v_def text; v_old text; v_new text; v_patched integer:=0;
begin
  for v_function in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname like 'read_recipe_snapshot_entrypoint_context%'
  loop
    v_def:=pg_get_functiondef(v_function.oid);
    v_old:=E'          ) order by ingredient.sort_order, ingredient.id)';
    if strpos(v_def,v_old)>0 then
      v_new:=$new$          ) || case when ingredient.source_kind is null then '{}'::jsonb
              else jsonb_build_object('row_key',ingredient.id,'source_kind',ingredient.source_kind) end
            order by ingredient.sort_order, ingredient.id)$new$;
      v_def:=replace(v_def,v_old,v_new);
      v_old:=E'              ) order by ordinality)';
      v_new:=$new$              ) || case when nullif(ingredient_used->>'row_key','') is null then '{}'::jsonb
                  else jsonb_build_object('row_key',ingredient_used->'row_key') end
                order by ordinality)$new$;
      if strpos(v_def,v_old)=0 then raise exception 'PRODUCT_SOURCE_ENTRY_STEP_DRIFT'; end if;
      v_def:=replace(v_def,v_old,v_new);
      execute v_def;v_patched:=v_patched+1;
    end if;
  end loop;
  if v_patched<>1 then raise exception 'PRODUCT_SOURCE_ENTRYPOINT_DRIFT'; end if;
end;
$source_entrypoint_keys$;

-- Source-aware v2 candidates preserve the session/owner and pantry-item contract.
do $source_cook_candidates$
declare
  v_def text:=pg_get_functiondef('public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)'::regprocedure);
  v_old text:=E'  join public.ingredients as dictionary\n    on dictionary.id';
begin
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_SOURCE_COOK_CANDIDATES_DRIFT'; end if;
  v_def:=replace(v_def,v_old,E'  left join public.ingredients as dictionary\n    on dictionary.id');
  v_def:=replace(v_def,'''standard_name'', dictionary.standard_name,',
    '''standard_name'', coalesce(dictionary.standard_name,ingredient->>''food_product_name'',product.name),');
  v_def:=replace(v_def,'(pantry.ingredient_id = (ingredient ->> ''ingredient_id'')::uuid',
    '(nullif(ingredient ->> ''food_product_id'', '''') is null and pantry.ingredient_id = (ingredient ->> ''ingredient_id'')::uuid');
  v_def:=replace(v_def,') order by pantry.id::text collate "C"',
    ') || case when nullif(ingredient->>''row_key'','''') is null then ''{}''::jsonb else jsonb_build_object(''row_key'',ingredient->''row_key'',''source_kind'',ingredient->''source_kind'') end order by pantry.id::text collate "C"');
  execute v_def;
end;
$source_cook_candidates$;

create function private.recipe_product_quantity_context(p_product uuid,p_version uuid,p_owner uuid)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
  select jsonb_build_object('basis',jsonb_build_object('amount',profile.basis_amount,'unit',profile.basis_unit),
    'basis_relations',version.basis_relations_json)
  from public.food_product_nutrition_versions version
  join public.food_products product on product.id=version.product_id and product.deleted_at is null
    and product.moderation_status='visible' and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
    and (product.visibility='public' or product.owner_user_id=p_owner)
  join public.nutrition_profiles profile on profile.id=version.nutrition_profile_id
    and profile.basis_amount>0 and profile.basis_amount::text not in ('NaN','Infinity','-Infinity')
    and profile.basis_unit in ('g','ml','serving','package')
  where version.id=p_version and version.product_id=p_product;
$function$;
alter function private.recipe_product_quantity_context(uuid,uuid,uuid) owner to postgres;
revoke all on function private.recipe_product_quantity_context(uuid,uuid,uuid) from public,anon,authenticated,service_role;

do $quantity_read$
declare
  v_def text:=pg_get_functiondef('public.read_recipe_product_nutrition_predecessors(uuid,jsonb)'::regprocedure);
  v_old text:=$old$      'id', v_pin -> 'id', 'product_predecessor', v_predecessor$old$;
  v_new text:=$new$      'id', v_pin -> 'id', 'product_predecessor', v_predecessor,
      'unit_context', private.recipe_product_quantity_context((v_pin->>'food_product_id')::uuid,
        (v_pin->>'food_product_nutrition_version_id')::uuid,p_owner_uuid)$new$;
begin
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then raise exception 'PRODUCT_QUANTITY_RPC_DRIFT'; end if;
  execute replace(v_def,v_old,v_new);
end;
$quantity_read$;

create function private.convert_recipe_product_quantity(p_amount numeric,p_unit text,p_target text,p_relations jsonb)
returns numeric language plpgsql immutable
set search_path=pg_catalog,private,pg_temp
as $function$
declare v_relation jsonb;v_second jsonb;v_from numeric;v_to numeric;v_second_from numeric;v_second_to numeric;v_mid text;v_result numeric;v_count integer:=0;v_input numeric:=p_amount;v_unit text:=p_unit;
begin
  if p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') then return null; end if;
  if v_unit='kg' then v_input:=v_input*1000;v_unit:='g';
  elsif v_unit in ('l','L') then v_input:=v_input*1000;v_unit:='ml';
  elsif v_unit='mL' then v_unit:='ml';end if;
  if v_unit=p_target then return v_input;end if;
  for v_relation in select value from jsonb_array_elements(coalesce(p_relations,'[]')) loop
    if not ((v_relation->'from'->>'unit'=v_unit and v_relation->'to'->>'unit'=p_target)
      or (v_relation->'to'->>'unit'=v_unit and v_relation->'from'->>'unit'=p_target)) then continue;end if;
    v_count:=v_count+1;v_from:=(v_relation->'from'->>'amount')::numeric;v_to:=(v_relation->'to'->>'amount')::numeric;
    if v_from is null or v_to is null or v_from<=0 or v_to<=0
      or v_from::text in ('NaN','Infinity','-Infinity') or v_to::text in ('NaN','Infinity','-Infinity') then return null;end if;
    v_result:=case when v_relation->'from'->>'unit'=v_unit then v_input*v_to/v_from else v_input*v_from/v_to end;
  end loop;
  -- Also inspect common-basis paths when a direct relation exists: multiple
  -- paths are ambiguous, and a conflicting path must not change physical quantity.
  for v_relation in select value from jsonb_array_elements(coalesce(p_relations,'[]')) loop
      if v_relation->'from'->>'unit'=v_unit then
        v_mid:=v_relation->'to'->>'unit';v_from:=(v_relation->'from'->>'amount')::numeric;v_to:=(v_relation->'to'->>'amount')::numeric;
      elsif v_relation->'to'->>'unit'=v_unit then
        v_mid:=v_relation->'from'->>'unit';v_from:=(v_relation->'to'->>'amount')::numeric;v_to:=(v_relation->'from'->>'amount')::numeric;
      else continue;end if;
      if v_mid in (v_unit,p_target) then continue;end if;
      for v_second in select value from jsonb_array_elements(coalesce(p_relations,'[]')) loop
        if v_second->'from'->>'unit'=v_mid and v_second->'to'->>'unit'=p_target then
          v_second_from:=(v_second->'from'->>'amount')::numeric;v_second_to:=(v_second->'to'->>'amount')::numeric;
        elsif v_second->'to'->>'unit'=v_mid and v_second->'from'->>'unit'=p_target then
          v_second_from:=(v_second->'to'->>'amount')::numeric;v_second_to:=(v_second->'from'->>'amount')::numeric;
        else continue;end if;
        if v_from is null or v_to is null or v_second_from is null or v_second_to is null
          or least(v_from,v_to,v_second_from,v_second_to)<=0
          or v_from::text in ('NaN','Infinity','-Infinity') or v_to::text in ('NaN','Infinity','-Infinity')
          or v_second_from::text in ('NaN','Infinity','-Infinity') or v_second_to::text in ('NaN','Infinity','-Infinity') then return null;end if;
        v_count:=v_count+1;v_result:=v_input*v_to*v_second_to/(v_from*v_second_from);
      end loop;
  end loop;
  if v_count=1 and v_result>0 and v_result::text not in ('NaN','Infinity','-Infinity') then return v_result;end if;
  return null;
exception when invalid_text_representation or division_by_zero or numeric_value_out_of_range or invalid_parameter_value then return null;
end;
$function$;
alter function private.convert_recipe_product_quantity(numeric,text,text,jsonb) owner to postgres;
revoke all on function private.convert_recipe_product_quantity(numeric,text,text,jsonb) from public,anon,authenticated,service_role;

create function private.canonical_recipe_product_amounts(p_product uuid,p_version uuid,p_owner uuid,p_amounts jsonb)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare v_context jsonb;v_item jsonb;v_amount numeric;v_unit text;v_sum jsonb:='{}';v_unknown jsonb:='[]';v_result jsonb:='[]';v_key record;
begin
  v_context:=private.recipe_product_quantity_context(p_product,p_version,p_owner);
  for v_item in select value from jsonb_array_elements(coalesce(p_amounts,'[]')) loop
    v_unit:=v_context->'basis'->>'unit';
    v_amount:=private.convert_recipe_product_quantity((v_item->>'amount')::numeric,v_item->>'unit',v_unit,v_context->'basis_relations');
    if v_amount is null and v_item->>'unit' in ('g','kg','ml','mL','l','L') then
      v_unit:=case when v_item->>'unit' in ('g','kg') then 'g' else 'ml' end;
      v_amount:=private.convert_recipe_product_quantity((v_item->>'amount')::numeric,v_item->>'unit',v_unit,'[]');
    end if;
    if v_amount is null then v_unknown:=v_unknown||jsonb_build_array(v_item);
    else v_sum:=jsonb_set(v_sum,array[v_unit],to_jsonb(coalesce((v_sum->>v_unit)::numeric,0)+v_amount),true);end if;
  end loop;
  for v_key in select key,value from jsonb_each(v_sum) order by key loop
    v_result:=v_result||jsonb_build_array(jsonb_build_object('amount',v_key.value,'unit',v_key.key));
  end loop;
  return v_result||v_unknown;
end;
$function$;
alter function private.canonical_recipe_product_amounts(uuid,uuid,uuid,jsonb) owner to postgres;
revoke all on function private.canonical_recipe_product_amounts(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Client raw quantities are validated against the owned pins before insert.
-- Canonicalise only newly written product shopping amounts; historical rows are not updated.
create function private.canonicalize_product_shopping_item_amounts()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare v_owner uuid;
begin
  if new.food_product_id is null or (tg_op='UPDATE' and new.amounts_json is not distinct from old.amounts_json) then return new;end if;
  select user_id into v_owner from public.shopping_lists where id=new.shopping_list_id;
  new.amounts_json:=private.canonical_recipe_product_amounts(new.food_product_id,new.food_product_nutrition_version_id,v_owner,new.amounts_json);
  return new;
end;
$function$;
alter function private.canonicalize_product_shopping_item_amounts() owner to postgres;
revoke all on function private.canonicalize_product_shopping_item_amounts() from public,anon,authenticated,service_role;
create trigger shopping_items_product_amount_canonicalization before insert or update of amounts_json on public.shopping_list_items
for each row execute function private.canonicalize_product_shopping_item_amounts();

-- Narrow local proposal: only product rows belonging to one visible public recipe.
-- No food_products table grant or general anonymous catalog access is introduced.
create function public.read_public_recipe_product_sources(p_recipe_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,recipe_visibility_guard,pg_temp
as $function$
begin
  -- Product pins are returned only here, never through the anonymous raw-row
  -- projection. A forbidden legacy source makes the whole public read fail.
  if exists(select 1 from public.recipes recipe
    join public.recipe_ingredients ingredient on ingredient.recipe_id=recipe.id
    left join public.food_products product on product.id=ingredient.food_product_id
      and product.visibility='public' and product.deleted_at is null and product.moderation_status='visible'
      and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
    left join public.food_product_nutrition_versions version on version.product_id=product.id
      and version.id=ingredient.food_product_nutrition_version_id
    where recipe.id=p_recipe_id and recipe.visibility='public' and recipe.deleted_at is null
      and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
      and ingredient.food_product_id is not null and version.id is null) then
    raise exception 'RECIPE_PRODUCT_READ_UNAVAILABLE' using errcode='55000';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('row_key',ingredient.id,
    'food_product_id',product.id,'food_product_nutrition_version_id',version.id,
    'food_product_name',product.name,'food_product_brand',product.brand)
    order by ingredient.sort_order,ingredient.id),'[]'::jsonb)
  from public.recipes recipe
  join public.recipe_ingredients ingredient on ingredient.recipe_id=recipe.id
  join public.food_products product on product.id=ingredient.food_product_id
    and product.visibility='public' and product.deleted_at is null and product.moderation_status='visible'
    and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
  join public.food_product_nutrition_versions version
    on version.product_id=product.id and version.id=ingredient.food_product_nutrition_version_id
  where recipe.id=p_recipe_id and recipe.visibility='public' and recipe.deleted_at is null
    and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by));
end;
$function$;
alter function public.read_public_recipe_product_sources(uuid) owner to postgres;
revoke all on function public.read_public_recipe_product_sources(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_public_recipe_product_sources(uuid) to anon,authenticated;

create function public.find_public_recipe_ids_by_product_name(p_q text)
returns table(recipe_id uuid) language sql stable security definer
set search_path=pg_catalog,public,recipe_visibility_guard,pg_temp
as $function$
  select distinct recipe.id
  from public.recipes recipe
  join public.recipe_ingredients ingredient on ingredient.recipe_id=recipe.id
  join public.food_products product on product.id=ingredient.food_product_id
    and product.visibility='public' and product.deleted_at is null and product.moderation_status='visible'
    and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
  join public.food_product_nutrition_versions version on version.product_id=product.id
    and version.id=ingredient.food_product_nutrition_version_id
  where recipe.visibility='public' and recipe.deleted_at is null
    and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
    and nullif(btrim(p_q),'') is not null and length(p_q)<=200
    and (product.name ilike '%'||p_q||'%' or product.brand ilike '%'||p_q||'%');
$function$;
alter function public.find_public_recipe_ids_by_product_name(text) owner to postgres;
revoke all on function public.find_public_recipe_ids_by_product_name(text) from public,anon,authenticated,service_role;
grant execute on function public.find_public_recipe_ids_by_product_name(text) to anon,authenticated;

create function public.read_recipe_product_ingredient_classification(p_ingredient_ids uuid[])
returns table(recipe_id uuid,ingredient_id uuid) language sql stable security definer
set search_path=pg_catalog,public,recipe_visibility_guard,pg_temp
as $function$
  select distinct recipe.id,link.ingredient_id
  from public.recipes recipe
  join public.recipe_ingredients ingredient on ingredient.recipe_id=recipe.id
  join public.food_products product on product.id=ingredient.food_product_id
    and product.deleted_at is null and product.moderation_status='visible'
    and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
    and product.visibility='public'
  join public.food_product_nutrition_versions version on version.product_id=product.id
    and version.id=ingredient.food_product_nutrition_version_id
  join public.food_product_ingredient_links link on link.product_id=product.id
    and link.relation='represents' and link.review_status='approved' and link.is_primary and link.is_active
  where recipe.deleted_at is null and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
    and recipe.visibility='public'
    and cardinality(p_ingredient_ids) between 1 and 100
    and link.ingredient_id=any(p_ingredient_ids);
$function$;
alter function public.read_recipe_product_ingredient_classification(uuid[]) owner to postgres;
revoke all on function public.read_recipe_product_ingredient_classification(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_recipe_product_ingredient_classification(uuid[]) to anon,authenticated;

alter function private.verify_full_local_anonymous_authority()
  rename to verify_full_local_anon_before_recipe_products_20261013;
create function private.verify_full_local_anonymous_authority()
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,private,pg_temp
as $function$
declare
  v_headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
  if v_headers->>'x-homecook-public-read-scope' in ('recipe-detail','recipe-cook-mode')
    and upper(coalesce(current_setting('request.method',true),''))='POST'
    and current_setting('request.path',true)='/rpc/read_public_recipe_product_sources' then return; end if;
  if v_headers->>'x-homecook-public-read-scope'='recipes'
    and upper(coalesce(current_setting('request.method',true),''))='POST'
    and current_setting('request.path',true) in ('/rpc/find_public_recipe_ids_by_product_name','/rpc/read_recipe_product_ingredient_classification') then return; end if;
  perform private.verify_full_local_anon_before_recipe_products_20261013();
end;
$function$;
alter function private.verify_full_local_anonymous_authority() owner to postgres;
revoke all on function private.verify_full_local_anonymous_authority() from public,anon,authenticated,service_role;
revoke all on function private.verify_full_local_anon_before_recipe_products_20261013() from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
