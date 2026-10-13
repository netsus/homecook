begin;

-- Saved YouTube results keep their evidence-preserving editable document, but
-- every result also needs a public canonical recipe identity so recipe books,
-- discovery, planner meals, and immutable meal snapshots can reference it.
alter table public.youtube_saved_recipe_results
  add column canonical_recipe_id uuid
    references public.recipes(id) on delete cascade;

create unique index youtube_saved_recipe_results_canonical_recipe_idx
  on public.youtube_saved_recipe_results (canonical_recipe_id)
  where canonical_recipe_id is not null;

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

drop trigger if exists youtube_saved_recipe_canonical_bridge
  on public.youtube_saved_recipe_results;
create trigger youtube_saved_recipe_canonical_bridge
before insert or update of editable_content_json
on public.youtube_saved_recipe_results
for each row execute function private.sync_youtube_saved_recipe_canonical();

-- Permit the one-time null -> canonical assignment made by the bridge while
-- keeping that identity immutable after it exists.
create or replace function private.guard_youtube_saved_recipe_source_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    or new.account_generation is distinct from old.account_generation
    or new.extraction_session_id is distinct from old.extraction_session_id
    or new.source_snapshot_json is distinct from old.source_snapshot_json
    or new.created_at is distinct from old.created_at
    or (
      old.canonical_recipe_id is not null
      and new.canonical_recipe_id is distinct from old.canonical_recipe_id
    ) then
    raise exception 'youtube saved recipe source snapshot is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

-- Existing rows pass through the same trigger as new writes. There was no
-- saved-result visibility choice before this bridge, so the same public
-- contract applies without mutating saved content or its revision.
do $backfill_writer_marker$
declare
  v_cutover_attempt_id uuid;
begin
  select capability.current_cutover_attempt_id
    into v_cutover_attempt_id
  from public.account_generation_capability_state as capability
  where capability.singleton
    and capability.state = 'generation_active';

  if v_cutover_attempt_id is not null then
    perform public.set_account_generation_internal_writer_marker(
      v_cutover_attempt_id,
      true
    );
  end if;
end;
$backfill_writer_marker$;

update public.youtube_saved_recipe_results
set editable_content_json = editable_content_json
where canonical_recipe_id is null;

do $backfill_writer_marker$
declare
  v_cutover_attempt_id uuid;
begin
  select capability.current_cutover_attempt_id
    into v_cutover_attempt_id
  from public.account_generation_capability_state as capability
  where capability.singleton
    and capability.state = 'generation_active';

  if v_cutover_attempt_id is not null then
    perform public.set_account_generation_internal_writer_marker(
      v_cutover_attempt_id,
      false
    );
  end if;
end;
$backfill_writer_marker$;

alter table public.youtube_saved_recipe_results
  alter column canonical_recipe_id set not null;

-- Account deletion removes the private saved document. Public manual recipes
-- are otherwise anonymized and preserved, but a bridge recipe cannot render
-- without that document. Retire only the bridge's public discovery/book
-- surface while keeping the recipe tombstone and immutable meal snapshots for
-- other users' existing planner history.
create or replace function private.retire_youtube_saved_canonical_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if current_setting('homecook.account_delete_user_id', true)
    is distinct from old.owner_user_id::text then
    return old;
  end if;

  delete from public.recipe_book_items
  where recipe_id = old.canonical_recipe_id;

  delete from public.recipe_likes
  where recipe_id = old.canonical_recipe_id;

  update public.recipes
  set deleted_at = coalesce(deleted_at, clock_timestamp()),
      save_count = 0,
      like_count = 0,
      updated_at = clock_timestamp()
  where id = old.canonical_recipe_id
    and source_type = 'youtube';

  return old;
end;
$function$;

drop trigger if exists retire_youtube_saved_canonical_on_account_delete
  on public.youtube_saved_recipe_results;
create trigger retire_youtube_saved_canonical_on_account_delete
before delete on public.youtube_saved_recipe_results
for each row execute function private.retire_youtube_saved_canonical_on_account_delete();

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
  );
$function$;

create or replace function public.read_youtube_saved_recipe_results(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_result_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_generation bigint;
  v_result public.youtube_saved_recipe_results%rowtype;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version,
    p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;

  if p_result_id is not null then
    select * into v_result
    from public.youtube_saved_recipe_results
    where id = p_result_id
      and owner_user_id = p_owner_uuid
      and account_generation = v_generation;

    -- Owner-facing editor links use the canonical id so the private saved
    -- draft id never has to be stored in recipe_sources. Existing URLs
    -- with the saved-result id keep taking precedence and remain compatible.
    if v_result.id is null then
      select * into v_result
      from public.youtube_saved_recipe_results
      where canonical_recipe_id = p_result_id
        and owner_user_id = p_owner_uuid
        and account_generation = v_generation;
    end if;

    if v_result.id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
      'success', true,
      'data', private.project_youtube_saved_recipe_result(v_result),
      'error', null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'drafts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'draft_id', result.id,
          'recipe_id', result.canonical_recipe_id,
          'revision', result.revision,
          'title', result.editable_content_json ->> 'title',
          'thumbnail_url', result.source_snapshot_json -> 'thumbnail_url',
          'created_at', result.created_at,
          'updated_at', result.updated_at
        ) order by result.updated_at desc, result.id)
        from public.youtube_saved_recipe_results as result
        where result.owner_user_id = p_owner_uuid
          and result.account_generation = v_generation
      ), '[]'::jsonb)
    ),
    'error', null
  );
end;
$function$;

-- Old idempotency receipts may be replayed after this migration. Give those
-- durable responses the same canonical identity as fresh responses.
update private.youtube_saved_recipe_result_mutations as mutation
set durable_result = jsonb_set(
  mutation.durable_result,
  '{data,recipe_id}',
  to_jsonb(result.canonical_recipe_id),
  true
)
from public.youtube_saved_recipe_results as result
where mutation.durable_result is not null
  and mutation.durable_result #>> '{data,draft_id}' = result.id::text;

-- Unresolved editable row IDs are user-controlled identifiers, not catalog
-- identities. Derive a stable UUID for immutable snapshots and explicitly
-- avoid every current catalog ID so shopping cannot promote an unresolved row
-- merely because its row UUID happens to equal a catalog ingredient UUID.
create or replace function private.youtube_saved_snapshot_ingredient_id(
  p_recipe_id uuid,
  p_row_id uuid,
  p_linked_ingredient_id uuid
)
returns uuid
language plpgsql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_candidate uuid;
  v_hash text;
  v_salt integer := 0;
begin
  if p_linked_ingredient_id is not null then
    return p_linked_ingredient_id;
  end if;

  loop
    v_hash := md5(concat_ws(':', p_recipe_id::text, p_row_id::text, v_salt::text));
    v_candidate := (
      substr(v_hash, 1, 8) || '-' ||
      substr(v_hash, 9, 4) || '-5' ||
      substr(v_hash, 14, 3) || '-a' ||
      substr(v_hash, 18, 3) || '-' ||
      substr(v_hash, 21, 12)
    )::uuid;

    exit when not exists (
      select 1 from public.ingredients as ingredient
      where ingredient.id = v_candidate
    );
    v_salt := v_salt + 1;
  end loop;

  return v_candidate;
end;
$function$;

-- Keep legacy recipe snapshot behavior intact behind a wrapper and source
-- saved YouTube snapshots from their editable document instead of requiring
-- incomplete drafts to fabricate catalog rows.
alter function public.build_recipe_content_snapshot_input(uuid)
  rename to build_recipe_content_snapshot_before_yt_saved_20261012;

create or replace function public.build_recipe_content_snapshot_input(
  p_recipe_id uuid
)
returns table (
  owner_user_id uuid,
  title varchar(200),
  base_servings numeric(8,2),
  ingredients_json jsonb,
  steps_json jsonb,
  content_hash text
)
language plpgsql
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_result public.youtube_saved_recipe_results%rowtype;
  v_ingredient_links jsonb;
  v_ingredients jsonb;
  v_steps jsonb;
begin
  select saved.*
    into v_result
  from public.youtube_saved_recipe_results as saved
  where saved.canonical_recipe_id = p_recipe_id;

  if v_result.id is null then
    return query
    select legacy.owner_user_id,
           legacy.title,
           legacy.base_servings,
           legacy.ingredients_json,
           legacy.steps_json,
           legacy.content_hash
    from public.build_recipe_content_snapshot_before_yt_saved_20261012(
      p_recipe_id
    ) as legacy;
    return;
  end if;

  v_ingredient_links := private.project_youtube_saved_recipe_ingredient_links(v_result);

  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', private.youtube_saved_snapshot_ingredient_id(
      p_recipe_id,
      (item ->> 'row_id')::uuid,
      nullif(
        v_ingredient_links -> (item ->> 'row_id') ->> 'ingredient_id',
        ''
      )::uuid
    ),
    'standard_name', item ->> 'standard_name',
    'amount', case
      when item ->> 'quantity_mode' = 'quantity' then (item ->> 'amount')::numeric
      else null
    end,
    'unit', case
      when item ->> 'quantity_mode' = 'quantity' then item ->> 'unit'
      else null
    end,
    'ingredient_type', case
      when item ->> 'quantity_mode' = 'to_taste' then 'TO_TASTE'
      else 'QUANT'
    end,
    'display_text', coalesce(item ->> 'display_text', item ->> 'standard_name'),
    'component_label', item -> 'component_label',
    'sort_order', ordinality - 1,
    'scalable', item ->> 'quantity_mode' = 'quantity',
    'food_product_id', null,
    'food_product_nutrition_version_id', null,
    'food_product_name', null,
    'food_product_brand', null,
    'catalog_resolution_status', coalesce(
      v_ingredient_links -> (item ->> 'row_id') ->> 'resolution_status',
      'unresolved'
    )
  ) order by ordinality), '[]'::jsonb)
    into v_ingredients
  from jsonb_array_elements(
    coalesce(v_result.editable_content_json -> 'ingredients', '[]'::jsonb)
  ) with ordinality rows(item, ordinality);

  select coalesce(jsonb_agg(jsonb_build_object(
    'step_number', ordinality,
    'instruction', item ->> 'instruction',
    'component_label', item -> 'component_label',
    'ingredients_used', '[]'::jsonb,
    'heat_level', null,
    'duration_seconds', null,
    'duration_text', item -> 'duration_text',
    'cooking_methods', '[]'::jsonb
  ) order by ordinality), '[]'::jsonb)
    into v_steps
  from jsonb_array_elements(
    coalesce(v_result.editable_content_json -> 'steps', '[]'::jsonb)
  ) with ordinality rows(item, ordinality);

  -- Public recipe snapshots are owner-neutral so another signed-in user can
  -- safely pin this recipe to their own planner without crossing ownership.
  owner_user_id := null;
  title := v_result.editable_content_json ->> 'title';
  base_servings := (v_result.editable_content_json ->> 'base_servings')::numeric(8,2);
  ingredients_json := v_ingredients;
  steps_json := v_steps;
  content_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array(title, base_servings, v_ingredients, v_steps)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return next;
end;
$function$;

-- Public detail/cook-mode readers need the evidence-preserving document
-- because unresolved ingredients deliberately do not create catalog rows.
-- Return only the display contract: no owner, saved draft id, extraction
-- evidence, source snapshot, ingredient link state, or mutation metadata.
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
    'ingredients', v_ingredients,
    'steps', v_steps
  );
end;
$function$;

-- Keep the service-role RPC behind the existing exact internal transport.
alter function private.verify_full_local_internal_scope()
  rename to verify_internal_scope_before_youtube_public_detail_20261012;

create function private.verify_full_local_internal_scope()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope = 'recipe-future-propagation'
    and v_method = 'POST'
    and v_path = '/rpc/read_public_youtube_saved_recipe_detail' then
    return;
  end if;

  perform private.verify_internal_scope_before_youtube_public_detail_20261012();
end;
$function$;

alter function private.sync_youtube_saved_recipe_canonical() owner to postgres;
alter function private.guard_youtube_saved_recipe_source_snapshot() owner to postgres;
alter function private.project_youtube_saved_recipe_result(
  public.youtube_saved_recipe_results
) owner to postgres;
alter function private.retire_youtube_saved_canonical_on_account_delete()
  owner to postgres;
alter function public.read_youtube_saved_recipe_results(
  uuid, timestamptz, text, integer, timestamptz, uuid
) owner to postgres;
alter function private.youtube_saved_snapshot_ingredient_id(uuid, uuid, uuid)
  owner to postgres;
alter function public.build_recipe_content_snapshot_before_yt_saved_20261012(
  uuid
) owner to postgres;
alter function public.build_recipe_content_snapshot_input(uuid) owner to postgres;
alter function public.read_public_youtube_saved_recipe_detail(uuid) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
alter function private.verify_internal_scope_before_youtube_public_detail_20261012()
  owner to postgres;

revoke all on function private.sync_youtube_saved_recipe_canonical()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_youtube_saved_recipe_source_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function private.project_youtube_saved_recipe_result(
  public.youtube_saved_recipe_results
) from public, anon, authenticated, service_role;
revoke all on function private.retire_youtube_saved_canonical_on_account_delete()
  from public, anon, authenticated, service_role;
revoke all on function public.read_youtube_saved_recipe_results(
  uuid, timestamptz, text, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.read_youtube_saved_recipe_results(
  uuid, timestamptz, text, integer, timestamptz, uuid
) to service_role;
revoke all on function private.youtube_saved_snapshot_ingredient_id(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.build_recipe_content_snapshot_before_yt_saved_20261012(
  uuid
) from public, anon, authenticated, service_role;
revoke all on function public.build_recipe_content_snapshot_input(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.read_public_youtube_saved_recipe_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.read_public_youtube_saved_recipe_detail(uuid)
  to service_role;
revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;
revoke all on function private.verify_internal_scope_before_youtube_public_detail_20261012()
  from public, anon, authenticated, service_role;

commit;
