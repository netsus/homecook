-- Durable activity history, written in the same transaction as the source action.
begin;
create table public.action_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null check (account_generation > 0),
  event_type text not null check (event_type in ('meal_planned','shopping_created','shopping_completed','cooking_completed','pantry_deducted','meal_logged','leftover_consumed')),
  source_id uuid not null,
  title text not null,
  message text not null,
  target_path text not null check (target_path ~ '^/[^/]'),
  created_at timestamptz not null default clock_timestamp(),
  seen_at timestamptz,
  unique(owner_user_id,account_generation,event_type,source_id)
);
create index action_notifications_owner_order on public.action_notifications(owner_user_id,account_generation,created_at desc,id desc);
alter table public.action_notifications enable row level security;
revoke all on public.action_notifications from public,anon,authenticated,service_role;

create function private.write_action_notification(p_owner uuid,p_type text,p_source uuid,p_title text,p_message text,p_target text,p_generation bigint default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_generation bigint;
begin
  select account_generation into v_generation from public.user_account_lifecycles
  where owner_uuid=p_owner and status='active' order by account_generation desc limit 1;
  if v_generation is null or (p_generation is not null and p_generation<>v_generation) then return; end if;
  insert into public.action_notifications(owner_user_id,account_generation,event_type,source_id,title,message,target_path)
  values(p_owner,v_generation,p_type,p_source,p_title,p_message,p_target)
  on conflict(owner_user_id,account_generation,event_type,source_id) do nothing;
end $$;

create function private.capture_action_notification() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_title text;
begin
  if tg_table_name='meals' then
    select coalesce(s.title,r.title,'요리') into v_title from public.recipes r
    left join public.recipe_content_snapshots s on s.id=new.recipe_content_snapshot_id where r.id=new.recipe_id;
    perform private.write_action_notification(new.user_id,'meal_planned',new.id,'요리계획에 추가했어요',coalesce(v_title,'요리')||' '||new.planned_servings||'인분','/planner?date='||new.plan_date);
  elsif tg_table_name='product_planner_entries' then
    perform private.write_action_notification(new.user_id,'meal_planned',new.id,'요리계획에 추가했어요',new.product_name_snapshot,'/planner?date='||new.plan_date);
  elsif tg_table_name='shopping_lists' then
    if tg_op='INSERT' then
      perform private.write_action_notification(new.user_id,'shopping_created',new.id,'장보기 목록을 만들었어요',new.title,'/shopping/lists/'||new.id);
    elsif new.is_completed and not old.is_completed then
      perform private.write_action_notification(new.user_id,'shopping_completed',new.id,'장보기를 완료했어요',new.title,'/shopping/lists/'||new.id);
    end if;
  elsif tg_table_name='leftover_dishes' then
    select coalesce(s.title,r.title,'요리') into v_title from public.recipes r
    left join public.recipe_content_snapshots s on s.id=new.recipe_content_snapshot_id where r.id=new.recipe_id;
    if tg_op='INSERT' then
      perform private.write_action_notification(new.user_id,'cooking_completed',new.id,'요리를 완성했어요',coalesce(v_title,'요리')||' '||new.cooking_servings||'인분을 완성했어요','/leftovers');
    elsif new.status='eaten' and old.status<>'eaten' and (new.depleted_reason is null or new.depleted_reason in ('consumed','consumed_unweighed')) then
      perform private.write_action_notification(new.user_id,'leftover_consumed',new.id,'다 먹은 요리예요',coalesce(v_title,'요리')||'를 다 먹었어요','/leftovers');
    end if;
  elsif tg_table_name='meal_log_entries' then
    if new.deleted_at is null then
      perform private.write_action_notification(new.owner_user_id,'meal_logged',new.id,'식사를 기록했어요',new.display_name_snapshot,'/planner?segment=log&date='||new.consumed_local_date,new.account_generation);
    end if;
  end if;
  return new;
end $$;
create trigger action_notification_meal after insert on public.meals for each row execute function private.capture_action_notification();
create trigger action_notification_product_plan after insert on public.product_planner_entries for each row execute function private.capture_action_notification();
create trigger action_notification_shopping after insert or update of is_completed on public.shopping_lists for each row execute function private.capture_action_notification();
create trigger action_notification_cooked after insert or update of status on public.leftover_dishes for each row execute function private.capture_action_notification();
create trigger action_notification_meal_log after insert on public.meal_log_entries for each row execute function private.capture_action_notification();

-- Capture actual, locked pantry rows inside the authoritative completion writer;
-- any subsequent conflict rolls this notification back with the source operation.
do $migration$
declare v_definition text; v_anchor text;
begin
 select pg_get_functiondef('public.complete_snapshot_v2_cooking_session(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,uuid[],text,numeric,timestamptz)'::regprocedure) into v_definition;
 v_anchor := 'delete from public.pantry_items where user_id = p_owner_uuid and id = any(coalesce(p_consumed_pantry_item_ids, ''{}''::uuid[]));';
 if position(v_anchor in v_definition)=0 then raise exception 'pantry completion anchor missing'; end if;
 v_definition:=replace(v_definition,v_anchor,$patch$
 if v_requested>0 then
   perform private.write_action_notification(p_owner_uuid,'pantry_deducted',p_session_id,'팬트리 재료를 차감했어요',
     (select string_agg(coalesce(f.name,i.standard_name,'재료'),', ' order by p.id)
      from public.pantry_items p left join public.ingredients i on i.id=p.ingredient_id
      left join public.food_products f on f.id=p.food_product_id
      where p.user_id=p_owner_uuid and p.id=any(p_consumed_pantry_item_ids)),
     '/pantry',(v_authority->>'account_generation')::bigint);
 end if;
 $patch$||v_anchor);
 execute v_definition;
end $migration$;

-- The legacy completion adapter uses DELETE RETURNING so the message includes
-- exactly the rows removed, even if concurrent pantry edits changed candidates.
do $migration$
declare v_definition text; v_anchor text;
begin
 if to_regprocedure('private.complete_legacy_cooking_core(text,uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,uuid[],uuid,timestamptz)') is null then return; end if;
 select pg_get_functiondef('private.complete_legacy_cooking_core(text,uuid,timestamptz,text,integer,timestamptz,uuid,uuid,integer,uuid[],uuid,timestamptz)'::regprocedure) into v_definition;
 v_anchor := $old$delete from public.pantry_items as pantry
    where pantry.user_id = p_owner_uuid
      and pantry.ingredient_id = any(v_consumed)
      and pantry.ingredient_id in (
        select recipe_ingredient.ingredient_id
        from public.recipe_ingredients as recipe_ingredient
        where recipe_ingredient.recipe_id = v_recipe_id
      );
    get diagnostics v_pantry_removed = row_count;$old$;
 if position(v_anchor in v_definition)=0 then raise exception 'legacy pantry completion anchor missing'; end if;
 v_definition:=replace(v_definition,'v_pantry_removed integer := 0;', 'v_pantry_removed integer := 0; v_pantry_names text;');
 v_definition:=replace(v_definition,v_anchor,$patch$with removed as (
      delete from public.pantry_items as pantry
      where pantry.user_id=p_owner_uuid and pantry.ingredient_id=any(v_consumed)
      and pantry.ingredient_id in (select ingredient_id from public.recipe_ingredients where recipe_id=v_recipe_id)
      returning pantry.id,pantry.ingredient_id,pantry.food_product_id
    ) select count(*),string_agg(coalesce(f.name,i.standard_name,'재료'),', ' order by r.id)
      into v_pantry_removed,v_pantry_names from removed r
      left join public.ingredients i on i.id=r.ingredient_id
      left join public.food_products f on f.id=r.food_product_id;
    if v_pantry_removed>0 then
      perform private.write_action_notification(p_owner_uuid,'pantry_deducted',v_leftover_dish_id,'팬트리 재료를 차감했어요',v_pantry_names,'/pantry',(v_authority->>'account_generation')::bigint);
    end if;$patch$);
 execute v_definition;
end $migration$;

-- Deployed pre-adapter legacy entrypoints retain their original authorization.
do $migration$
declare v_name text; v_definition text; v_anchor text; v_recipe text; v_source text;
begin
 foreach v_name in array array['public.complete_cooking_session(uuid,uuid,uuid[])','public.complete_standalone_cooking(uuid,uuid,integer,uuid[])'] loop
   if to_regprocedure(v_name) is null then continue; end if;
   select pg_get_functiondef(to_regprocedure(v_name)) into v_definition;
   if position('private.complete_legacy_cooking_core' in v_definition)>0 then continue; end if;
   v_recipe:=case when v_name like '%standalone%' then 'p_recipe_id' else 'v_recipe_id' end;
   v_source:=case when v_name like '%standalone%' then 'v_leftover_dish_id' else 'p_session_id' end;
   v_anchor := 'delete from public.pantry_items
    where user_id = p_user_id
      and ingredient_id = any(coalesce(p_consumed_ingredient_ids, ''{}''))
      and ingredient_id in (
        select ingredient_id
        from public.recipe_ingredients
        where recipe_id = '||v_recipe||'
      );
  get diagnostics v_pantry_removed = row_count;';
   if position(v_anchor in v_definition)=0 then raise exception 'pre-adapter pantry completion anchor missing: %',v_name; end if;
   v_definition:=replace(v_definition,'v_pantry_removed integer := 0;','v_pantry_removed integer := 0; v_pantry_names text;');
   v_definition:=replace(v_definition,v_anchor,'with removed as (
     delete from public.pantry_items where user_id=p_user_id
       and ingredient_id=any(coalesce(p_consumed_ingredient_ids,''{}''))
       and ingredient_id in (select ingredient_id from public.recipe_ingredients where recipe_id='||v_recipe||')
       returning id,ingredient_id,food_product_id
     ) select count(*),string_agg(coalesce(f.name,i.standard_name,''재료''),'', '' order by r.id)
       into v_pantry_removed,v_pantry_names from removed r
       left join public.ingredients i on i.id=r.ingredient_id left join public.food_products f on f.id=r.food_product_id;
     if v_pantry_removed>0 then perform private.write_action_notification(p_user_id,''pantry_deducted'','||v_source||',''팬트리 재료를 차감했어요'',v_pantry_names,''/pantry''); end if;');
   execute v_definition;
 end loop;
end $migration$;

create function private.clear_action_notifications_on_lifecycle_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
begin
 if new.status in ('deleting','cleanup_pending','complete') then
   delete from public.action_notifications where owner_user_id=new.owner_uuid and account_generation=new.account_generation;
 end if;
 return new;
end $$;
create trigger action_notification_cleanup after update of status on public.user_account_lifecycles
for each row when (old.status is distinct from new.status) execute function private.clear_action_notifications_on_lifecycle_change();

create function public.list_action_notifications(
 p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
 p_view text default 'unseen',p_limit integer default 20,p_cursor_created_at timestamptz default null,p_cursor_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_auth jsonb; v_generation bigint; v_items jsonb; v_unread bigint;
begin
 if p_view is null or p_view not in ('unseen','archive') or p_limit is null or p_limit<1 or p_limit>50
 or (p_cursor_created_at is null)<>(p_cursor_id is null) then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
 v_auth:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
 v_generation:=(v_auth->>'account_generation')::bigint;
 select count(*) into v_unread from public.action_notifications where owner_user_id=p_owner_uuid and account_generation=v_generation and seen_at is null;
 select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc),'[]'::jsonb) into v_items from (
 select id,event_type,title,message,target_path,created_at,seen_at from public.action_notifications
 where owner_user_id=p_owner_uuid and account_generation=v_generation
 and ((p_view='unseen' and seen_at is null) or (p_view='archive' and seen_at is not null))
 and (p_cursor_created_at is null or (created_at,id)<(p_cursor_created_at,p_cursor_id))
 order by created_at desc,id desc limit p_limit+1) n;
 return jsonb_build_object('items',v_items,'unread_count',v_unread);
end $$;
create function public.mark_action_notifications_seen(
 p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,p_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_auth jsonb; v_ids jsonb; v_unread bigint;
begin
 if p_ids is null or cardinality(p_ids)<1 or cardinality(p_ids)>50 or array_position(p_ids,null) is not null then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
 v_auth:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
 with changed as (update public.action_notifications set seen_at=coalesce(seen_at,clock_timestamp())
 where owner_user_id=p_owner_uuid and account_generation=(v_auth->>'account_generation')::bigint and id=any(p_ids) returning id)
 select coalesce(jsonb_agg(id),'[]'::jsonb) into v_ids from changed;
 select count(*) into v_unread from public.action_notifications where owner_user_id=p_owner_uuid and account_generation=(v_auth->>'account_generation')::bigint and seen_at is null;
 return jsonb_build_object('seen_ids',v_ids,'unread_count',v_unread);
end $$;
revoke all on function private.write_action_notification(uuid,text,uuid,text,text,text,bigint),private.capture_action_notification(),private.clear_action_notifications_on_lifecycle_change() from public,anon,authenticated,service_role;
revoke all on function public.list_action_notifications(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid),public.mark_action_notifications_seen(uuid,timestamptz,text,integer,timestamptz,uuid[]) from public,anon,authenticated;
grant execute on function public.list_action_notifications(uuid,timestamptz,text,integer,timestamptz,text,integer,timestamptz,uuid),public.mark_action_notifications_seen(uuid,timestamptz,text,integer,timestamptz,uuid[]) to service_role;
alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_action_notifications_20260928;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
begin
 if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='action-notifications'
 and upper(coalesce(current_setting('request.method',true),''))='POST'
 and current_setting('request.path',true) in ('/rpc/list_action_notifications','/rpc/mark_action_notifications_seen') then return; end if;
 perform private.verify_scope_pre_action_notifications_20260928();
end $$;
revoke all on function private.verify_full_local_internal_scope(),private.verify_scope_pre_action_notifications_20260928() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
