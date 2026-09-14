begin;

do $migration$
begin
  if to_regprocedure('private.verify_full_local_internal_scope_pre_recipe_save()') is null then
    alter function private.verify_full_local_internal_scope()
      rename to verify_full_local_internal_scope_pre_recipe_save;
  end if;
end;
$migration$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_method text := upper(coalesce(current_setting('request.method',true),''));
  v_path text := coalesce(current_setting('request.path',true),'');
  v_scope text := coalesce(v_headers->>'x-homecook-internal-scope','');
begin
  if (v_scope='recipe-save' and v_method='POST' and v_path='/rpc/save_recipe_to_books')
    or (v_scope='recipe-meal-weight' and v_method='GET' and v_path in (
      '/ingredient_conversion_assignments',
      '/ingredient_nutrition_profiles',
      '/piece_unit_weights'
    )) then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_recipe_save();
end;
$function$;

alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;

drop function if exists public.save_recipe_to_books(uuid,uuid[]);

create or replace function public.save_recipe_to_books(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_recipe_id uuid,
  p_book_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_owner uuid := p_owner_uuid;
  v_authority jsonb;
  v_existing_book_ids uuid[] := '{}'::uuid[];
  v_created_book_ids uuid[] := '{}'::uuid[];
  v_created_item_ids uuid[] := '{}'::uuid[];
  v_save_count integer := 0;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,
    p_hmac_key_version,p_session_issued_at
  );
  if p_recipe_id is null or p_book_ids is null or cardinality(p_book_ids) not between 1 and 50
    or array_position(p_book_ids,null) is not null
    or cardinality(p_book_ids) <> (select count(distinct book_id) from unnest(p_book_ids) book_id) then
    return jsonb_build_object('success',false,'data',null,'error',jsonb_build_object('code','RESOURCE_NOT_FOUND','message','레시피북을 찾을 수 없어요.','fields','[]'::jsonb));
  end if;

  if not exists (
    select 1 from public.recipes recipe
    where recipe.id=p_recipe_id and recipe.deleted_at is null
      and (recipe.visibility='public' or recipe.created_by=v_owner)
  ) then
    return jsonb_build_object('success',false,'data',null,'error',jsonb_build_object('code','RESOURCE_NOT_FOUND','message','레시피를 찾을 수 없어요.','fields','[]'::jsonb));
  end if;
  if (select count(*) from public.recipe_books book where book.id=any(p_book_ids)) <> cardinality(p_book_ids) then
    return jsonb_build_object('success',false,'data',null,'error',jsonb_build_object('code','RESOURCE_NOT_FOUND','message','레시피북을 찾을 수 없어요.','fields','[]'::jsonb));
  end if;
  if exists (select 1 from public.recipe_books book where book.id=any(p_book_ids) and book.user_id<>v_owner) then
    return jsonb_build_object('success',false,'data',null,'error',jsonb_build_object('code','FORBIDDEN','message','내 레시피북만 선택할 수 있어요.','fields','[]'::jsonb));
  end if;
  if exists (select 1 from public.recipe_books book where book.id=any(p_book_ids) and book.book_type not in ('saved','custom')) then
    return jsonb_build_object('success',false,'data',null,'error',jsonb_build_object('code','CONFLICT','message','저장 가능한 레시피북이 아니에요.','fields','[]'::jsonb));
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-recipe-save:'||p_recipe_id::text,0)
  );

  select coalesce(array_agg(requested.book_id order by requested.ordinality),'{}'::uuid[])
    into v_existing_book_ids
  from unnest(p_book_ids) with ordinality requested(book_id,ordinality)
  join public.recipe_book_items item
    on item.book_id=requested.book_id and item.recipe_id=p_recipe_id;

  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,
    true
  );

  with requested as (
    select book_id,ordinality from unnest(p_book_ids) with ordinality value(book_id,ordinality)
  ), inserted as (
    insert into public.recipe_book_items(book_id,recipe_id)
    select requested.book_id,p_recipe_id from requested
    on conflict(book_id,recipe_id) do nothing
    returning id,book_id
  )
  select
    coalesce(array_agg(inserted.book_id order by requested.ordinality),'{}'::uuid[]),
    coalesce(array_agg(inserted.id order by requested.ordinality),'{}'::uuid[])
    into v_created_book_ids,v_created_item_ids
  from inserted join requested using(book_id);

  select count(*)::integer into v_save_count
  from public.recipe_book_items item where item.recipe_id=p_recipe_id;
  update public.recipes set save_count=v_save_count where id=p_recipe_id;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority->>'cutover_attempt_id')::uuid,
    false
  );

  return jsonb_build_object(
    'success',true,
    'data',jsonb_build_object(
      'saved',true,
      'save_count',v_save_count,
      'book_ids',to_jsonb(p_book_ids),
      'created_book_ids',to_jsonb(v_created_book_ids),
      'already_saved_book_ids',to_jsonb(v_existing_book_ids),
      'created_item_ids',to_jsonb(v_created_item_ids)
    ),
    'error',null
  );
end;
$function$;

alter function public.save_recipe_to_books(uuid,timestamptz,text,integer,timestamptz,uuid,uuid[]) owner to postgres;
revoke all on function public.save_recipe_to_books(uuid,timestamptz,text,integer,timestamptz,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.save_recipe_to_books(uuid,timestamptz,text,integer,timestamptz,uuid,uuid[]) to service_role;

commit;
