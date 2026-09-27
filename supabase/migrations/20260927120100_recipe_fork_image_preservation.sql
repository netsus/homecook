-- Preserve only an authorized source's public image when creating a personal copy.
-- Private managed objects remain bound to their existing owner/generation/consumer.
begin;

create or replace function private.inherit_personal_recipe_source_image(
  p_owner_uuid uuid,
  p_source_recipe_id uuid,
  p_target_recipe_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_source public.recipes%rowtype;
  v_object public.recipe_image_objects%rowtype;
begin
  select recipe.* into v_source from public.recipes recipe
  where recipe.id = p_source_recipe_id and recipe.deleted_at is null;
  if v_source.id is null
    or not (
      (v_source.visibility = 'public'
        and recipe_visibility_guard.is_owner_publicly_visible(v_source.created_by) is true)
      or (v_source.visibility = 'private' and v_source.created_by = p_owner_uuid)
    )
    or not exists (
      select 1 from public.recipes target
      where target.id = p_target_recipe_id and target.created_by = p_owner_uuid
        and target.visibility = 'private' and target.deleted_at is null
    )
  then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Shared public objects can have several consumers. Never copy a private object
  -- reference or a temporary signed URL into another recipe's legacy thumbnail.
  select image_object.* into v_object
  from public.recipe_image_object_references reference
  join public.recipe_image_objects image_object on image_object.id = reference.image_object_id
  where reference.reference_type = 'recipe_thumbnail'
    and reference.consumer_id = p_source_recipe_id
    and image_object.bucket_id = 'recipe-images'
    and image_object.visibility = 'public_shared'
    and image_object.state = 'attached_public_shared'
    and image_object.owner_uuid is null and image_object.account_generation is null
    and image_object.object_path ~ ('^shared/' || image_object.id::text || '\.(jpg|jpeg|png|webp)$')
  for key share of image_object;

  if v_object.id is not null then
    insert into public.recipe_image_object_references (
      image_object_id, reference_type, consumer_id, created_at
    ) values (v_object.id, 'recipe_thumbnail', p_target_recipe_id, p_now);
  elsif not exists (
    select 1 from public.recipe_image_object_references reference
    where reference.reference_type = 'recipe_thumbnail'
      and reference.consumer_id = p_source_recipe_id
  ) and v_source.thumbnail_url ~ '^https?://'
    and v_source.thumbnail_url !~ '/storage/v1/object/(sign|authenticated)/'
  then
    update public.recipes set thumbnail_url = v_source.thumbnail_url
    where id = p_target_recipe_id;
  end if;
end
$function$;

alter function private.inherit_personal_recipe_source_image(uuid,uuid,uuid,timestamptz) owner to postgres;
revoke all on function private.inherit_personal_recipe_source_image(uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated, service_role;

-- Existing copies with no image can read a currently visible public origin.
-- This is a read projection, not a rewrite/backfill of historical recipes.
create or replace function public.read_recipe_image_projections(p_recipe_ids uuid[])
returns table (
  recipe_id uuid, legacy_thumbnail_url text, image_object_id uuid,
  bucket_id text, object_path text, owner_uuid uuid, account_generation bigint,
  visibility text, state text, reference_type text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if p_recipe_ids is null or cardinality(p_recipe_ids) not between 1 and 100
    or array_position(p_recipe_ids,null) is not null
    or (select count(distinct id) from unnest(p_recipe_ids) ids(id)) <> cardinality(p_recipe_ids)
  then
    raise exception 'recipe image projection input is invalid' using errcode = '22023';
  end if;
  return query
  select input.id,
    coalesce(nullif(btrim(recipe.thumbnail_url),''), case
      when reference.id is null and origin_reference.id is null
        and origin.thumbnail_url ~ '^https?://'
        and origin.thumbnail_url !~ '/storage/v1/object/(sign|authenticated)/'
      then origin.thumbnail_url else null end),
    coalesce(reference.image_object_id, origin_image.id),
    coalesce(image.bucket_id, origin_image.bucket_id),
    coalesce(image.object_path, origin_image.object_path),
    image.owner_uuid,
    image.account_generation,
    coalesce(image.visibility, origin_image.visibility),
    coalesce(image.state, origin_image.state),
    coalesce(reference.reference_type, case when origin_image.id is not null then 'recipe_thumbnail' end)
  from unnest(p_recipe_ids) with ordinality input(id,ordinality)
  join public.recipes recipe on recipe.id = input.id
  left join public.recipe_image_object_references reference
    on reference.reference_type = 'recipe_thumbnail' and reference.consumer_id = recipe.id
  left join public.recipe_image_objects image on image.id = reference.image_object_id
  left join public.recipes origin
    on reference.id is null and nullif(btrim(recipe.thumbnail_url),'') is null
    and recipe.visibility = 'private' and recipe.deleted_at is null
    and origin.id = recipe.origin_recipe_id
    and origin.visibility = 'public' and origin.deleted_at is null
    and recipe_visibility_guard.is_owner_publicly_visible(origin.created_by) is true
  left join public.recipe_image_object_references origin_reference
    on origin_reference.reference_type = 'recipe_thumbnail' and origin_reference.consumer_id = origin.id
  left join public.recipe_image_objects origin_image
    on origin_image.id = origin_reference.image_object_id
    and origin_image.visibility = 'public_shared' and origin_image.state = 'attached_public_shared'
    and origin_image.bucket_id = 'recipe-images'
    and origin_image.owner_uuid is null and origin_image.account_generation is null
    and origin_image.object_path ~ ('^shared/' || origin_image.id::text || '\.(jpg|jpeg|png|webp)$')
  order by input.ordinality;
end
$function$;
revoke all on function public.read_recipe_image_projections(uuid[]) from public, anon, authenticated;
grant execute on function public.read_recipe_image_projections(uuid[]) to service_role;

do $migration$
declare
  v_signature regprocedure := 'public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_old text;
  v_new text;
begin
  -- The edit context intentionally does not expose public object IDs as upload
  -- identities. Its null means retain an inherited public image during editing.
  v_old := $old$    if v_existing_image_object_id is not null
      and v_existing_image_object_id is distinct from p_image_object_id then$old$;
  v_new := $new$    if v_existing_image_object_id is not null
      and v_existing_image_object_id is distinct from p_image_object_id
      and not (
        p_image_object_id is null and exists (
          select 1 from public.recipe_image_objects inherited_image
          where inherited_image.id = v_existing_image_object_id
            and inherited_image.bucket_id = 'recipe-images'
            and inherited_image.visibility = 'public_shared'
            and inherited_image.state = 'attached_public_shared'
            and inherited_image.owner_uuid is null
            and inherited_image.account_generation is null
        )
      ) then$new$;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
    raise exception 'Unexpected personal recipe image replacement guard';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  -- Replacing an inherited public image removes just this consumer's reference;
  -- it must not enqueue a private-owner deletion for a public shared object.
  v_old := $old$      select public.enqueue_recipe_image_cleanup(
        object.id,$old$;
  v_new := $new$      if not exists (
        select 1 from public.recipe_image_objects replaced_image
        where replaced_image.id = v_existing_image_object_id
          and replaced_image.bucket_id = 'recipe-images'
          and replaced_image.visibility = 'public_shared'
          and replaced_image.state = 'attached_public_shared'
          and replaced_image.owner_uuid is null
          and replaced_image.account_generation is null
      ) then
      select public.enqueue_recipe_image_cleanup(
        object.id,$new$;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
    raise exception 'Unexpected personal recipe image cleanup call';
  end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := $old$      if v_image_outbox_id is null then
        raise exception 'IMAGE_EXPIRED' using errcode = '55000';
      end if;
    end if;$old$;
  v_new := $new$      if v_image_outbox_id is null then
        raise exception 'IMAGE_EXPIRED' using errcode = '55000';
      end if;
      end if;
    end if;$new$;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
    raise exception 'Unexpected personal recipe image cleanup result';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = v_result_recipe_id;

    v_result := jsonb_build_object($old$;
  v_new := $new$    if v_effective_operation in ('fork', 'save_as_new')
      and p_image_object_id is null then
      perform private.inherit_personal_recipe_source_image(
        p_owner_uuid, p_source_recipe_id, v_result_recipe_id, p_now
      );
    end if;

    select recipe.* into v_recipe
    from public.recipes as recipe
    where recipe.id = v_result_recipe_id;

    v_result := jsonb_build_object($new$;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
    raise exception 'Unexpected personal recipe result read';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$migration$;

notify pgrst, 'reload schema';
commit;
