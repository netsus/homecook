begin;

create table public.meal_log_entries (
  id uuid primary key,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null check (account_generation > 0),
  revision bigint not null default 1 check (revision > 0),
  consumed_at timestamptz,
  consumed_local_date date not null,
  timezone_name_snapshot text not null check (length(timezone_name_snapshot) between 1 and 100),
  meal_plan_column_id uuid references public.meal_plan_columns(id) on delete set null,
  slot_name_snapshot text not null check (nullif(btrim(slot_name_snapshot), '') is not null),
  source_type text not null check (source_type in ('cooked_batch','food_product','ingredient')),
  cooked_batch_id uuid references public.leftover_dishes(id) on delete restrict,
  food_product_id uuid references public.food_products(id) on delete restrict,
  food_product_nutrition_version_id uuid references public.food_product_nutrition_versions(id) on delete restrict,
  ingredient_id uuid references public.ingredients(id) on delete restrict,
  ingredient_nutrition_profile_id uuid references public.ingredient_nutrition_profiles(id) on delete restrict,
  conversion_evidence_id uuid references public.measurement_source_evidence(id) on delete restrict,
  actual_amount numeric not null check (actual_amount > 0),
  actual_unit text not null check (nullif(btrim(actual_unit), '') is not null),
  display_name_snapshot text not null check (nullif(btrim(display_name_snapshot), '') is not null),
  display_brand_snapshot text,
  nutrition_evidence_json jsonb not null check (
    jsonb_typeof(nutrition_evidence_json) = 'object'
    and nutrition_evidence_json->>'calculation_status' in ('complete','partial','unavailable')
  ),
  active_consumption_event_id uuid references public.cooked_batch_quantity_events(id) on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint meal_log_entries_source_exact_one_check check (
    (source_type = 'cooked_batch' and cooked_batch_id is not null
      and food_product_id is null and food_product_nutrition_version_id is null
      and ingredient_id is null and ingredient_nutrition_profile_id is null and conversion_evidence_id is null)
    or
    (source_type = 'food_product' and cooked_batch_id is null
      and food_product_id is not null and food_product_nutrition_version_id is not null
      and ingredient_id is null and ingredient_nutrition_profile_id is null and conversion_evidence_id is null)
    or
    (source_type = 'ingredient' and cooked_batch_id is null
      and food_product_id is null and food_product_nutrition_version_id is null
      and ingredient_id is not null and ingredient_nutrition_profile_id is not null)
  ),
  constraint meal_log_entries_pointer_shape_check check (
    (source_type = 'cooked_batch' and deleted_at is null)
    or active_consumption_event_id is null
  )
);

alter table public.cooked_batch_quantity_events
  add constraint cooked_batch_quantity_events_meal_log_entry_fk
  foreign key (meal_log_entry_id) references public.meal_log_entries(id) on delete restrict
  deferrable initially deferred;

create index meal_log_entries_owner_day_idx
  on public.meal_log_entries (owner_user_id, account_generation, consumed_local_date, created_at, id)
  where deleted_at is null;
create index meal_log_entries_owner_recent_idx
  on public.meal_log_entries (owner_user_id, account_generation, consumed_local_date desc, created_at desc, id desc)
  where deleted_at is null;
create index meal_log_entries_column_idx on public.meal_log_entries (meal_plan_column_id)
  where deleted_at is null;
create unique index meal_log_entries_active_event_unique
  on public.meal_log_entries (active_consumption_event_id)
  where active_consumption_event_id is not null;

alter table public.meal_log_entries enable row level security;
revoke all on public.meal_log_entries from public, anon, authenticated, service_role;

create policy meal_log_entries_owner_generation_read
on public.meal_log_entries for select to authenticated
using (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.user_account_lifecycles lifecycle
    where lifecycle.owner_uuid = auth.uid()
      and lifecycle.account_generation = meal_log_entries.account_generation
      and lifecycle.status = 'active'
  )
);
grant select (
  id, revision, consumed_at, consumed_local_date, timezone_name_snapshot,
  meal_plan_column_id, slot_name_snapshot, source_type, cooked_batch_id,
  food_product_id, ingredient_id, actual_amount, actual_unit,
  display_name_snapshot, display_brand_snapshot, nutrition_evidence_json,
  created_at, updated_at
) on public.meal_log_entries to authenticated;

create or replace function private.compact_meal_log_nutrition(
  p_status text,
  p_values jsonb,
  p_scale numeric default 1
) returns jsonb
language sql immutable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  with nutrient_keys(public_key, source_key) as (
    values
      ('calories_kcal','energy_kcal'),
      ('carbohydrate_g','carbohydrate_g'),
      ('protein_g','protein_g'),
      ('fat_g','fat_g'),
      ('sodium_mg','sodium_mg')
  ), projected as (
    select public_key,
      round((case jsonb_typeof(coalesce(p_values,'{}'::jsonb)->source_key)
        when 'number' then (p_values->>source_key)::numeric
        when 'object' then coalesce(
          (p_values->source_key->>'amount')::numeric,
          (p_values->source_key->>'known_amount')::numeric
        )
        else null
      end) * p_scale,6) value
    from nutrient_keys
  )
  select jsonb_build_object(
    'calculation_status',p_status,
    'calories_kcal',max(value) filter(where public_key='calories_kcal'),
    'carbohydrate_g',max(value) filter(where public_key='carbohydrate_g'),
    'protein_g',max(value) filter(where public_key='protein_g'),
    'fat_g',max(value) filter(where public_key='fat_g'),
    'sodium_mg',max(value) filter(where public_key='sodium_mg')
  ) from projected;
$function$;

create or replace function private.fold_meal_log_nutrition_status(
  p_complete bigint,
  p_partial bigint,
  p_unavailable bigint
) returns text
language sql immutable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select case
    when p_complete=0 and p_partial=0 then 'unavailable'
    when p_partial=0 and p_unavailable=0 then 'complete'
    else 'partial'
  end;
$function$;

create or replace function private.resolve_meal_log_profile_nutrition(
  p_profile_id uuid,
  p_amount numeric,
  p_unit text
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_profile public.nutrition_profiles%rowtype; v_scale numeric; v_values jsonb; v_observed integer;
begin
  select * into v_profile from public.nutrition_profiles where id=p_profile_id;
  if v_profile.id is null or not v_profile.is_active
    or v_profile.review_status not in ('approved','self_reported') then
    raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';
  end if;
  if p_unit is distinct from v_profile.basis_unit then
    if not (p_unit in ('g','kg') and v_profile.normalization_method='mass_100g') then
      raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023';
    end if;
  end if;
  v_scale := (case when p_unit='kg' then p_amount*1000 else p_amount end) / v_profile.basis_amount;
  select jsonb_object_agg(nutrient_code,case when value_status='observed' then amount else null end),
    count(*) filter(where value_status='observed')
  into v_values,v_observed from public.nutrition_values
  where profile_id=p_profile_id
    and nutrient_code in ('energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg');
  return private.compact_meal_log_nutrition(
    case when coalesce(v_observed,0)=5 then 'complete'
      when coalesce(v_observed,0)=0 then 'unavailable' else 'partial' end,
    coalesce(v_values,'{}'::jsonb),v_scale
  );
end;
$function$;

create or replace function private.resolve_meal_log_product_nutrition(
  p_profile_id uuid,p_relations jsonb,p_amount numeric,p_unit text
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_profile public.nutrition_profiles%rowtype; v_relation jsonb; v_basis_amount numeric;
begin
  select * into v_profile from public.nutrition_profiles where id=p_profile_id;
  if v_profile.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
  if p_unit=v_profile.basis_unit or (p_unit in ('g','kg') and v_profile.normalization_method='mass_100g') then
    return private.resolve_meal_log_profile_nutrition(p_profile_id,p_amount,p_unit);
  end if;
  select relation into v_relation from jsonb_array_elements(p_relations) relation
  where (relation#>>'{from,unit}'=p_unit and relation#>>'{to,unit}'=v_profile.basis_unit)
     or (relation#>>'{to,unit}'=p_unit and relation#>>'{from,unit}'=v_profile.basis_unit)
  limit 1;
  if v_relation is null then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
  if v_relation#>>'{from,unit}'=p_unit then
    v_basis_amount:=p_amount/(v_relation#>>'{from,amount}')::numeric*(v_relation#>>'{to,amount}')::numeric;
  else
    v_basis_amount:=p_amount/(v_relation#>>'{to,amount}')::numeric*(v_relation#>>'{from,amount}')::numeric;
  end if;
  return private.resolve_meal_log_profile_nutrition(p_profile_id,v_basis_amount,v_profile.basis_unit);
end;
$function$;

create or replace function private.assert_meal_log_pointer_pair()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_entry public.meal_log_entries%rowtype; v_event public.cooked_batch_quantity_events%rowtype;
begin
  if tg_table_name='meal_log_entries' then
    v_entry:=new;
    if v_entry.active_consumption_event_id is null then return new; end if;
    select * into v_event from public.cooked_batch_quantity_events where id=v_entry.active_consumption_event_id;
  else
    v_event:=new;
    if v_event.meal_log_entry_id is null then return new; end if;
    if v_event.event_type='reversal' then
      if not exists(
        select 1 from public.cooked_batch_quantity_events target
        where target.id=v_event.reverses_event_id
          and target.meal_log_entry_id=v_event.meal_log_entry_id
          and target.owner_user_id=v_event.owner_user_id
          and target.cooked_batch_id=v_event.cooked_batch_id
          and target.event_type='consumed'
      ) then raise exception 'MEAL_LOG_EVENT_POINTER_INVALID' using errcode='23514'; end if;
      return new;
    end if;
    select * into v_entry from public.meal_log_entries where id=v_event.meal_log_entry_id;
  end if;
  if v_entry.id is null or v_event.id is null
    or v_entry.owner_user_id is distinct from v_event.owner_user_id
    or v_entry.cooked_batch_id is distinct from v_event.cooked_batch_id
    or v_event.meal_log_entry_id is distinct from v_entry.id
    or v_entry.active_consumption_event_id is distinct from v_event.id
    or v_event.event_type <> 'consumed'
    or exists(select 1 from public.cooked_batch_quantity_events r where r.reverses_event_id=v_event.id) then
    raise exception 'MEAL_LOG_EVENT_POINTER_INVALID' using errcode='23514';
  end if;
  return new;
end;
$function$;

create constraint trigger assert_meal_log_entry_pointer
after insert or update on public.meal_log_entries deferrable initially deferred
for each row execute function private.assert_meal_log_pointer_pair();
create constraint trigger assert_meal_log_event_pointer
after insert or update on public.cooked_batch_quantity_events deferrable initially deferred
for each row execute function private.assert_meal_log_pointer_pair();

create or replace function private.project_meal_log_entry(p_entry meal_log_entries)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'id',p_entry.id,'revision',p_entry.revision,'consumed_at',p_entry.consumed_at,
    'consumed_local_date',p_entry.consumed_local_date,'timezone_name_snapshot',p_entry.timezone_name_snapshot,
    'meal_plan_column_id',p_entry.meal_plan_column_id,'slot_name_snapshot',p_entry.slot_name_snapshot,
    'source',jsonb_build_object('type',p_entry.source_type,'id',case p_entry.source_type when 'cooked_batch' then p_entry.cooked_batch_id when 'food_product' then p_entry.food_product_id else p_entry.ingredient_id end),
    'quantity',jsonb_build_object('amount',p_entry.actual_amount,'unit',p_entry.actual_unit),
    'display_name',p_entry.display_name_snapshot,'display_brand',p_entry.display_brand_snapshot,
    'nutrition',p_entry.nutrition_evidence_json,'created_at',p_entry.created_at,'updated_at',p_entry.updated_at
  );
$function$;

create or replace function public.get_meal_log_day(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,
  p_hmac_key_version integer,p_session_issued_at timestamptz,p_date date
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_authority jsonb; v_generation bigint; v_columns jsonb; v_active jsonb; v_deleted jsonb; v_entries jsonb; v_total jsonb;
begin
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  v_generation:=(v_authority->>'account_generation')::bigint;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.id),'[]') into v_columns
  from public.meal_plan_columns c where c.user_id=p_owner_uuid;
  select coalesce(jsonb_agg(private.project_meal_log_entry(e) order by e.created_at,e.id),'[]') into v_entries
  from public.meal_log_entries e where e.owner_user_id=p_owner_uuid and e.account_generation=v_generation and e.consumed_local_date=p_date and e.deleted_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('meal_plan_column_id',x.meal_plan_column_id,'slot_name_snapshot',x.slot_name_snapshot,'sort_order',x.sort_order,'entries',x.entries,'subtotal',x.subtotal,'incomplete_count',x.incomplete_count) order by x.sort_order,x.meal_plan_column_id),'[]') into v_active
  from (select e.meal_plan_column_id,max(e.slot_name_snapshot) slot_name_snapshot,max(c.sort_order) sort_order,
    jsonb_agg(private.project_meal_log_entry(e) order by e.created_at,e.id) entries,
    jsonb_build_object(
      'calculation_status',private.fold_meal_log_nutrition_status(
        count(*) filter(where e.nutrition_evidence_json->>'calculation_status'='complete'),
        count(*) filter(where e.nutrition_evidence_json->>'calculation_status'='partial'),
        count(*) filter(where e.nutrition_evidence_json->>'calculation_status'='unavailable')),
      'calories_kcal',sum((e.nutrition_evidence_json->>'calories_kcal')::numeric),
      'carbohydrate_g',sum((e.nutrition_evidence_json->>'carbohydrate_g')::numeric),
      'protein_g',sum((e.nutrition_evidence_json->>'protein_g')::numeric),
      'fat_g',sum((e.nutrition_evidence_json->>'fat_g')::numeric),
      'sodium_mg',sum((e.nutrition_evidence_json->>'sodium_mg')::numeric)
    ) subtotal,count(*) filter(where e.nutrition_evidence_json->>'calculation_status'<>'complete') incomplete_count
    from public.meal_log_entries e join public.meal_plan_columns c on c.id=e.meal_plan_column_id
    where e.owner_user_id=p_owner_uuid and e.account_generation=v_generation and e.consumed_local_date=p_date and e.deleted_at is null
    group by e.meal_plan_column_id) x;
  select coalesce(jsonb_agg(jsonb_build_object('slot_name_snapshot',x.slot_name_snapshot,'entries',x.entries,'subtotal',x.subtotal,'incomplete_count',x.incomplete_count) order by x.slot_name_snapshot),'[]') into v_deleted
  from (select e.slot_name_snapshot,jsonb_agg(private.project_meal_log_entry(e) order by e.created_at,e.id) entries,
    jsonb_build_object(
      'calculation_status',private.fold_meal_log_nutrition_status(
        count(*) filter(where e.nutrition_evidence_json->>'calculation_status'='complete'),
        count(*) filter(where e.nutrition_evidence_json->>'calculation_status'='partial'),
        count(*) filter(where e.nutrition_evidence_json->>'calculation_status'='unavailable')),
      'calories_kcal',sum((e.nutrition_evidence_json->>'calories_kcal')::numeric),
      'carbohydrate_g',sum((e.nutrition_evidence_json->>'carbohydrate_g')::numeric),
      'protein_g',sum((e.nutrition_evidence_json->>'protein_g')::numeric),
      'fat_g',sum((e.nutrition_evidence_json->>'fat_g')::numeric),
      'sodium_mg',sum((e.nutrition_evidence_json->>'sodium_mg')::numeric)
    ) subtotal,
    count(*) filter(where e.nutrition_evidence_json->>'calculation_status'<>'complete') incomplete_count
    from public.meal_log_entries e
    where e.owner_user_id=p_owner_uuid and e.account_generation=v_generation and e.consumed_local_date=p_date and e.deleted_at is null and e.meal_plan_column_id is null group by e.slot_name_snapshot) x;
  select jsonb_build_object(
    'calculation_status',private.fold_meal_log_nutrition_status(
      count(*) filter(where nutrition_evidence_json->>'calculation_status'='complete'),
      count(*) filter(where nutrition_evidence_json->>'calculation_status'='partial'),
      count(*) filter(where nutrition_evidence_json->>'calculation_status'='unavailable')),
    'calories_kcal',sum((nutrition_evidence_json->>'calories_kcal')::numeric),
    'carbohydrate_g',sum((nutrition_evidence_json->>'carbohydrate_g')::numeric),
    'protein_g',sum((nutrition_evidence_json->>'protein_g')::numeric),
    'fat_g',sum((nutrition_evidence_json->>'fat_g')::numeric),
    'sodium_mg',sum((nutrition_evidence_json->>'sodium_mg')::numeric),
    'incomplete_count',count(*) filter(where nutrition_evidence_json->>'calculation_status'<>'complete')) into v_total
  from public.meal_log_entries where owner_user_id=p_owner_uuid and account_generation=v_generation and consumed_local_date=p_date and deleted_at is null;
  return jsonb_build_object('success',true,'data',jsonb_build_object('date',p_date,'active_columns',v_columns,'active_sections',v_active,'deleted_column_sections',v_deleted,'entries',v_entries,'day_total',v_total),'error',null);
end;
$function$;

create or replace function public.get_recent_meal_log_sources(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,
  p_hmac_key_version integer,p_session_issued_at timestamptz,p_limit integer,p_cursor_date date,p_cursor_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_authority jsonb; v_generation bigint; v_items jsonb;
begin
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  v_generation:=(v_authority->>'account_generation')::bigint;
  with eligible as (
    select entry.*,case entry.source_type when 'cooked_batch' then entry.cooked_batch_id when 'food_product' then entry.food_product_id else entry.ingredient_id end source_id
    from public.meal_log_entries entry
    where entry.owner_user_id=p_owner_uuid and entry.account_generation=v_generation and entry.deleted_at is null
      and case entry.source_type
        when 'cooked_batch' then exists(select 1 from public.leftover_dishes batch where batch.id=entry.cooked_batch_id and batch.user_id=p_owner_uuid)
        when 'food_product' then exists(select 1 from public.food_products product where product.id=entry.food_product_id and product.deleted_at is null and product.moderation_status='visible' and (product.visibility='public' or product.owner_user_id=p_owner_uuid))
        else exists(select 1 from public.ingredients ingredient where ingredient.id=entry.ingredient_id) end
  ), latest as (
    select distinct on (source_type,source_id) source_type,source_id,display_name_snapshot display_name,
      display_brand_snapshot display_brand,actual_amount last_amount,actual_unit last_unit,consumed_local_date last_date,id last_id
    from eligible order by source_type,source_id,consumed_local_date desc,created_at desc,id desc
  ), frequencies as (
    select source_type,source_id,count(*) frequency from eligible group by source_type,source_id
  )
  select coalesce(jsonb_agg(to_jsonb(item) order by item.last_date desc,item.last_id desc),'[]') into v_items from (
    select latest.*,frequencies.frequency from latest join frequencies using(source_type,source_id)
    where p_cursor_date is null or (latest.last_date,latest.last_id)<(p_cursor_date,p_cursor_id)
    order by latest.last_date desc,latest.last_id desc limit greatest(1,least(p_limit,50))+1
  ) item;
  return jsonb_build_object('success',true,'data',jsonb_build_object(
    'items',case when jsonb_array_length(v_items)>p_limit then v_items-p_limit else v_items end,
    'has_next',jsonb_array_length(v_items)>p_limit
  ),'error',null);
end;
$function$;

create or replace function public.mutate_meal_log_entry(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,
  p_hmac_key_version integer,p_session_issued_at timestamptz,p_action text,p_entry_id uuid,
  p_idempotency_key uuid,p_expected_revision bigint,p_payload jsonb,p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_authority jsonb; v_generation bigint; v_claim jsonb; v_receipt uuid; v_entry public.meal_log_entries%rowtype;
  v_column public.meal_plan_columns%rowtype; v_batch public.leftover_dishes%rowtype; v_old_event public.cooked_batch_quantity_events%rowtype;
  v_event_id uuid; v_reversal_id uuid; v_source_type text; v_source_id uuid; v_amount numeric; v_unit text;
  v_evidence jsonb; v_name text; v_brand text; v_product_version uuid; v_ingredient_profile uuid;
  v_conversion_evidence uuid; v_nutrition_amount numeric; v_nutrition_unit text; v_result jsonb;
  v_same_source boolean; v_same_quantity boolean; v_product_profile uuid; v_product_relations jsonb;
  v_old_batch_id uuid; v_new_batch_id uuid; v_lock_batch_id uuid; v_locked_batch public.leftover_dishes%rowtype;
  v_batch_nutrition jsonb; v_piece_count integer;
begin
  if p_action not in ('create','patch','delete') then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  v_generation:=(v_authority->>'account_generation')::bigint;
  if p_action<>'delete' then
    v_source_type:=p_payload#>>'{source,type}'; v_source_id:=(p_payload#>>'{source,id}')::uuid;
    v_amount:=(p_payload#>>'{quantity,amount}')::numeric; v_unit:=p_payload#>>'{quantity,unit}';
    v_new_batch_id:=case when v_source_type='cooked_batch' then v_source_id end;
  end if;
  v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,v_generation,'meal_log_'||p_action,p_idempotency_key,
    jsonb_build_object('entry_id',case when p_action='create' then null else p_entry_id end,'expected_revision',p_expected_revision,'payload',p_payload),p_now);
  if v_claim ? 'replay' then return v_claim->'replay'; end if;
  v_receipt:=(v_claim->>'receipt_id')::uuid;
  if p_action<>'create' then
    select * into v_entry from public.meal_log_entries where id=p_entry_id and owner_user_id=p_owner_uuid and account_generation=v_generation and deleted_at is null for update;
    if v_entry.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    if v_entry.revision is distinct from p_expected_revision then raise exception 'CONFLICT' using errcode='40001'; end if;
    v_old_batch_id:=v_entry.cooked_batch_id;
  end if;

  for v_lock_batch_id in
    select distinct candidate.v_lock_batch_id
    from unnest(array[v_old_batch_id,v_new_batch_id]) as candidate(v_lock_batch_id)
    where candidate.v_lock_batch_id is not null
    order by candidate.v_lock_batch_id
  loop
    select * into v_locked_batch from public.leftover_dishes
    where id=v_lock_batch_id and user_id=p_owner_uuid for update;
    if v_locked_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    perform private.assert_cooked_batch_cached_projection(v_lock_batch_id,p_owner_uuid);
  end loop;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,true
  );
  if p_action<>'create' and v_entry.active_consumption_event_id is not null then
    select * into v_old_event from public.cooked_batch_quantity_events where id=v_entry.active_consumption_event_id for update;
    v_reversal_id:=extensions.gen_random_uuid();
    insert into public.cooked_batch_quantity_events(id,owner_user_id,cooked_batch_id,event_type,delta_g,reason,meal_log_entry_id,reverses_event_id,operation_id,ordinal,payload_hash,created_at)
    values(v_reversal_id,p_owner_uuid,v_old_event.cooked_batch_id,'reversal',-v_old_event.delta_g,'meal_log_'||p_action,p_entry_id,v_old_event.id,p_idempotency_key,1,v_claim->>'payload_hash',p_now);
    update public.meal_log_entries set active_consumption_event_id=null where id=p_entry_id;
  end if;
  if p_action='delete' then
    update public.meal_log_entries set deleted_at=p_now,revision=revision+1,updated_at=p_now where id=p_entry_id returning * into v_entry;
  else
    v_same_source:=p_action='patch' and v_entry.source_type=v_source_type and
      case v_source_type when 'cooked_batch' then v_entry.cooked_batch_id when 'food_product' then v_entry.food_product_id else v_entry.ingredient_id end=v_source_id;
    v_same_quantity:=v_same_source and v_entry.actual_amount=v_amount and v_entry.actual_unit=v_unit;
    select * into v_column from public.meal_plan_columns where id=(p_payload->>'meal_plan_column_id')::uuid and user_id=p_owner_uuid for share;
    if v_column.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    if not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone_name_snapshot') then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if p_payload->>'consumed_at' is not null and (((p_payload->>'consumed_at')::timestamptz at time zone (p_payload->>'timezone_name_snapshot'))::date is distinct from (p_payload->>'consumed_local_date')::date) then
      raise exception 'CONSUMED_DATE_TIMEZONE_MISMATCH' using errcode='22023';
    end if;
    if v_source_type='cooked_batch' then
      if v_unit<>'g' then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
      select * into v_batch from public.leftover_dishes where id=v_source_id and user_id=p_owner_uuid;
      if v_batch.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
      if v_batch.weight_status='unrecoverable' then raise exception 'WEIGHT_UNRECOVERABLE' using errcode='55000'; end if;
      if v_batch.weight_status<>'known' or v_batch.batch_status<>'available' then raise exception 'CONFLICT' using errcode='55000'; end if;
      if v_batch.finished_weight_g is null or v_batch.finished_weight_g<=0 then raise exception 'CONFLICT' using errcode='55000'; end if;
      if v_amount>v_batch.remaining_weight_g then raise exception 'CONFLICT' using errcode='22003'; end if;
      v_batch_nutrition:=private.resolve_cooked_batch_nutrition(v_batch.id,p_owner_uuid);
      v_evidence:=private.compact_meal_log_nutrition(
        coalesce(v_batch_nutrition->>'calculation_status','unavailable'),
        coalesce(v_batch_nutrition->'values','{}'::jsonb),
        v_amount / v_batch.finished_weight_g
      );
      if v_same_source then v_name:=v_entry.display_name_snapshot; v_brand:=v_entry.display_brand_snapshot;
      else select title into v_name from public.recipes where id=v_batch.recipe_id; end if;
    elsif v_source_type='food_product' then
      select product.name,product.brand,case when v_same_source then v_entry.food_product_nutrition_version_id else product.current_nutrition_version_id end into v_name,v_brand,v_product_version
      from public.food_products product where product.id=v_source_id and product.deleted_at is null
        and product.moderation_status='visible' and (product.visibility='public' or product.owner_user_id=p_owner_uuid) for share;
      if v_product_version is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
      if v_same_source then v_name:=v_entry.display_name_snapshot; v_brand:=v_entry.display_brand_snapshot; end if;
      if v_same_quantity then v_evidence:=v_entry.nutrition_evidence_json;
      else
        select version.nutrition_profile_id,version.basis_relations_json into v_product_profile,v_product_relations
        from public.food_product_nutrition_versions version where version.id=v_product_version and version.product_id=v_source_id;
        v_evidence:=private.resolve_meal_log_product_nutrition(v_product_profile,v_product_relations,v_amount,v_unit);
      end if;
    elsif v_source_type='ingredient' then
      select ingredient.standard_name into v_name from public.ingredients ingredient where ingredient.id=v_source_id for share;
      if v_same_source then
        v_ingredient_profile:=v_entry.ingredient_nutrition_profile_id;
        v_conversion_evidence:=v_entry.conversion_evidence_id;
      else select profile.id into v_ingredient_profile from public.ingredient_nutrition_profiles profile
        where profile.ingredient_id=v_source_id and profile.is_primary and profile.is_active and profile.review_status='approved'; end if;
      if v_ingredient_profile is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
      if v_same_source then v_name:=v_entry.display_name_snapshot; v_brand:=v_entry.display_brand_snapshot; end if;
      if v_same_quantity then
        v_evidence:=v_entry.nutrition_evidence_json; v_conversion_evidence:=v_entry.conversion_evidence_id;
      else
      v_nutrition_amount:=v_amount; v_nutrition_unit:=v_unit;
      if v_unit in ('tbsp','tsp','cup') then
        if v_same_source and v_conversion_evidence is not null then
          select evidence.id,v_amount * (case v_unit when 'tbsp' then 15 when 'tsp' then 5 else 200 end) / 15 * evidence.normalized_g_per_15ml
          into v_conversion_evidence,v_nutrition_amount from public.measurement_source_evidence evidence
          where evidence.id=v_conversion_evidence and evidence.evidence_kind='volume_weight';
        else
          select evidence.id,
            v_amount * (case v_unit when 'tbsp' then 15 when 'tsp' then 5 else 200 end) / 15 * evidence.normalized_g_per_15ml
          into v_conversion_evidence,v_nutrition_amount
          from public.ingredient_nutrition_profiles profile
          join public.ingredient_conversion_assignments assignment
            on assignment.ingredient_id=profile.ingredient_id
            and assignment.preparation_state=profile.preparation_state
            and assignment.is_active and assignment.review_status='approved'
          join public.measurement_source_evidence evidence
            on evidence.id=assignment.evidence_id and evidence.evidence_kind='volume_weight'
            and evidence.is_active and evidence.review_status='approved'
          where profile.id=v_ingredient_profile;
        end if;
        if v_conversion_evidence is null then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
        v_nutrition_unit:='g';
      elsif lower(v_unit) in ('개','장','piece','pieces') then
        if v_same_source and v_conversion_evidence is not null then
          select count(*),
            (array_agg(evidence.id order by piece.id))[1],
            (array_agg(v_amount*piece.weight_g order by piece.id))[1]
          into v_piece_count,v_conversion_evidence,v_nutrition_amount
          from public.ingredient_nutrition_profiles profile
          join public.piece_unit_weights piece
            on piece.ingredient_id=profile.ingredient_id
            and piece.preparation_state=profile.preparation_state
          join public.measurement_source_evidence evidence
            on evidence.id=piece.evidence_id
            and piece.size_code=evidence.size_code
            and piece.preparation_state=evidence.preparation_state
            and evidence.evidence_kind='piece_weight'
            and lower(evidence.source_observed_unit) in ('개','장','piece','pieces')
          where profile.id=v_ingredient_profile and evidence.id=v_entry.conversion_evidence_id;
        else
          select count(*),
            (array_agg(evidence.id order by piece.id))[1],
            (array_agg(v_amount*piece.weight_g order by piece.id))[1]
          into v_piece_count,v_conversion_evidence,v_nutrition_amount
          from public.ingredient_nutrition_profiles profile
          join public.piece_unit_weights piece
            on piece.ingredient_id=profile.ingredient_id
            and piece.preparation_state=profile.preparation_state
            and piece.is_active and piece.review_status='approved'
          join public.measurement_source_evidence evidence
            on evidence.id=piece.evidence_id
            and piece.size_code=evidence.size_code
            and piece.preparation_state=evidence.preparation_state
            and evidence.evidence_kind='piece_weight'
            and evidence.is_active and evidence.review_status='approved'
            and lower(evidence.source_observed_unit) in ('개','장','piece','pieces')
          join public.nutrition_sources source
            on source.id=evidence.source_id
            and source.is_active and source.review_status='approved'
            and source.freshness_status='current'
          where profile.id=v_ingredient_profile;
        end if;
        if v_piece_count<>1 or v_conversion_evidence is null then raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023'; end if;
        v_nutrition_unit:='g';
      elsif v_unit not in ('g','kg') then
        raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023';
      else
        v_conversion_evidence:=null;
      end if;
      select private.resolve_meal_log_profile_nutrition(profile.nutrition_profile_id,v_nutrition_amount,v_nutrition_unit)
      into v_evidence from public.ingredient_nutrition_profiles profile where profile.id=v_ingredient_profile;
      end if;
    else raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if p_action='create' then
      insert into public.meal_log_entries(id,owner_user_id,account_generation,consumed_at,consumed_local_date,timezone_name_snapshot,meal_plan_column_id,slot_name_snapshot,source_type,cooked_batch_id,food_product_id,food_product_nutrition_version_id,ingredient_id,ingredient_nutrition_profile_id,actual_amount,actual_unit,display_name_snapshot,display_brand_snapshot,nutrition_evidence_json,created_at,updated_at)
      values(p_entry_id,p_owner_uuid,v_generation,nullif(p_payload->>'consumed_at','')::timestamptz,(p_payload->>'consumed_local_date')::date,p_payload->>'timezone_name_snapshot',v_column.id,v_column.name,v_source_type,
        case when v_source_type='cooked_batch' then v_source_id end,case when v_source_type='food_product' then v_source_id end,v_product_version,case when v_source_type='ingredient' then v_source_id end,v_ingredient_profile,
        v_amount,v_unit,v_name,v_brand,v_evidence,p_now,p_now) returning * into v_entry;
      if v_source_type='ingredient' and v_conversion_evidence is not null then
        update public.meal_log_entries set conversion_evidence_id=v_conversion_evidence where id=p_entry_id returning * into v_entry;
      end if;
    else
      update public.meal_log_entries set consumed_at=nullif(p_payload->>'consumed_at','')::timestamptz,consumed_local_date=(p_payload->>'consumed_local_date')::date,timezone_name_snapshot=p_payload->>'timezone_name_snapshot',meal_plan_column_id=v_column.id,slot_name_snapshot=v_column.name,source_type=v_source_type,
        cooked_batch_id=case when v_source_type='cooked_batch' then v_source_id end,food_product_id=case when v_source_type='food_product' then v_source_id end,food_product_nutrition_version_id=v_product_version,
        ingredient_id=case when v_source_type='ingredient' then v_source_id end,ingredient_nutrition_profile_id=v_ingredient_profile,conversion_evidence_id=v_conversion_evidence,actual_amount=v_amount,actual_unit=v_unit,
        display_name_snapshot=v_name,display_brand_snapshot=v_brand,nutrition_evidence_json=v_evidence,revision=revision+1,updated_at=p_now where id=p_entry_id returning * into v_entry;
    end if;
    if v_source_type='cooked_batch' then
      v_event_id:=extensions.gen_random_uuid();
      insert into public.cooked_batch_quantity_events(id,owner_user_id,cooked_batch_id,event_type,delta_g,reason,meal_log_entry_id,operation_id,ordinal,payload_hash,created_at)
      values(v_event_id,p_owner_uuid,v_source_id,'consumed',-v_amount,'meal_log',p_entry_id,p_idempotency_key,case when v_reversal_id is null then 1 else 2 end,v_claim->>'payload_hash',p_now);
      update public.meal_log_entries set active_consumption_event_id=v_event_id where id=p_entry_id returning * into v_entry;
    end if;
  end if;
  for v_lock_batch_id in
    select distinct candidate.v_lock_batch_id
    from unnest(array[v_old_batch_id,v_new_batch_id]) as candidate(v_lock_batch_id)
    where candidate.v_lock_batch_id is not null
    order by candidate.v_lock_batch_id
  loop
    perform private.replay_cooked_batch(v_lock_batch_id,p_owner_uuid,p_now);
  end loop;
  if v_new_batch_id is not null and exists(
    select 1 from public.leftover_dishes
    where id=v_new_batch_id and batch_status='depleted' and depleted_reason='consumed'
  ) then
    perform private.project_cooked_batch_progress_activity(p_owner_uuid,'leftover_eaten',v_new_batch_id,p_now);
  end if;
  v_result:=jsonb_build_object('success',true,'data',jsonb_build_object('entry',private.project_meal_log_entry(v_entry)),'error',null);
  perform private.finish_cooked_batch_operation(v_receipt,v_result,p_entry_id,p_now);
  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,false
  );
  return v_result;
end;
$function$;

create or replace function private.cleanup_meal_log_before_user_delete()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if nullif(current_setting('homecook.account_delete_user_id',true),'')::uuid is distinct from old.id then raise exception 'CONFLICT' using errcode='55000'; end if;
  update public.meal_log_entries set active_consumption_event_id=null where owner_user_id=old.id;
  delete from public.cooked_batch_quantity_events where owner_user_id=old.id;
  delete from public.meal_log_entries where owner_user_id=old.id;
  delete from public.mutation_idempotency_keys where owner_uuid=old.id and operation_scope like 'meal_log_%';
  return old;
end;
$function$;
create trigger cleanup_meal_log_before_user_delete before delete on public.users
for each row execute function private.cleanup_meal_log_before_user_delete();

create or replace function private.cleanup_meal_log_before_cooked_batch_delete()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if nullif(current_setting('homecook.account_delete_user_id',true),'')::uuid is distinct from old.user_id then raise exception 'CONFLICT' using errcode='55000'; end if;
  delete from public.meal_log_entries where cooked_batch_id=old.id;
  return old;
end;
$function$;
create trigger zz_cleanup_meal_log_before_cooked_batch_delete before delete on public.leftover_dishes
for each row execute function private.cleanup_meal_log_before_cooked_batch_delete();

alter function private.compact_meal_log_nutrition(text,jsonb,numeric) owner to postgres;
alter function private.fold_meal_log_nutrition_status(bigint,bigint,bigint) owner to postgres;
alter function private.resolve_meal_log_profile_nutrition(uuid,numeric,text) owner to postgres;
alter function private.resolve_meal_log_product_nutrition(uuid,jsonb,numeric,text) owner to postgres;
alter function private.assert_meal_log_pointer_pair() owner to postgres;
alter function private.project_meal_log_entry(meal_log_entries) owner to postgres;
alter function private.cleanup_meal_log_before_user_delete() owner to postgres;
alter function private.cleanup_meal_log_before_cooked_batch_delete() owner to postgres;
alter function public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date) owner to postgres;
alter function public.get_recent_meal_log_sources(uuid,timestamptz,text,integer,timestamptz,integer,date,uuid) owner to postgres;
alter function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) owner to postgres;
revoke all on function private.compact_meal_log_nutrition(text,jsonb,numeric) from public,anon,authenticated,service_role;
revoke all on function private.fold_meal_log_nutrition_status(bigint,bigint,bigint) from public,anon,authenticated,service_role;
revoke all on function private.resolve_meal_log_profile_nutrition(uuid,numeric,text) from public,anon,authenticated,service_role;
revoke all on function private.resolve_meal_log_product_nutrition(uuid,jsonb,numeric,text) from public,anon,authenticated,service_role;
revoke all on function private.assert_meal_log_pointer_pair() from public,anon,authenticated,service_role;
revoke all on function private.project_meal_log_entry(meal_log_entries) from public,anon,authenticated,service_role;
revoke all on function private.cleanup_meal_log_before_user_delete() from public,anon,authenticated,service_role;
revoke all on function private.cleanup_meal_log_before_cooked_batch_delete() from public,anon,authenticated,service_role;
revoke all on function public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date) from public,anon,authenticated;
revoke all on function public.get_recent_meal_log_sources(uuid,timestamptz,text,integer,timestamptz,integer,date,uuid) from public,anon,authenticated;
revoke all on function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date) to service_role;
grant execute on function public.get_recent_meal_log_sources(uuid,timestamptz,text,integer,timestamptz,integer,date,uuid) to service_role;
grant execute on function public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz) to service_role;

commit;
