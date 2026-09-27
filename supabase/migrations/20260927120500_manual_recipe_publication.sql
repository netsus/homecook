-- Commit the owner-approved public asset identity before any public Storage PUT.
-- A durable pending journal hides its image until copy verification finishes.
begin;
create table private.manual_recipe_publication_images (
  recipe_id uuid primary key,
  owner_uuid uuid not null,
  account_generation bigint not null,
  source_object_id uuid not null,
  target_object_id uuid not null unique default gen_random_uuid(),
  copy_plan jsonb,
  publication_committed boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
alter table private.manual_recipe_publication_images owner to postgres;
alter table private.manual_recipe_publication_images enable row level security;
revoke all on private.manual_recipe_publication_images from public, anon, authenticated, service_role;

create or replace function public.publish_manual_recipe(
  p_owner_uuid uuid, p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text, p_hmac_key_version integer, p_session_issued_at timestamptz,
  p_idempotency_key uuid, p_recipe_id uuid, p_expected_updated_at timestamptz,
  p_nutrition_snapshot jsonb, p_input_guard jsonb, p_verified_image jsonb default null
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_recipe public.recipes%rowtype;
  v_image public.recipe_image_objects%rowtype;
  v_plan private.manual_recipe_publication_images%rowtype;
  v_receipt private.manual_recipe_create_receipts%rowtype;
  v_generation bigint;
  v_path text;
  v_response jsonb;
  v_current_content record;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;
  select * into v_receipt from private.manual_recipe_create_receipts
  where owner_uuid = p_owner_uuid and account_generation = v_generation
    and idempotency_key = p_idempotency_key for update;
  if not found or (v_receipt.response_body ->> 'id')::uuid is distinct from p_recipe_id then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_recipe from public.recipes
  where id = p_recipe_id and created_by = p_owner_uuid and deleted_at is null
    and source_type = 'manual' and origin_recipe_id is null for update;
  if not found then raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_recipe.visibility = 'public' then
    select * into strict v_current_content from public.build_recipe_content_snapshot_input(p_recipe_id);
    if not exists (
      select 1 from public.recipe_content_snapshots content
      join public.recipe_nutrition_snapshots nutrition on nutrition.id=content.recipe_nutrition_snapshot_id
      where content.recipe_id=p_recipe_id and nutrition.recipe_id=p_recipe_id
        and content.owner_user_id is null and nutrition.owner_user_id is null and nutrition.is_current
        and content.content_hash=v_current_content.content_hash and content.schema_version=1
    ) then
      perform public.set_account_generation_internal_writer_marker((v_authority ->> 'cutover_attempt_id')::uuid,true);
      perform private.complete_manual_recipe_runtime(p_owner_uuid,p_recipe_id,p_expected_updated_at,p_nutrition_snapshot,p_input_guard);
      perform public.set_account_generation_internal_writer_marker((v_authority ->> 'cutover_attempt_id')::uuid,false);
    end if;
    select * into v_plan from private.manual_recipe_publication_images where recipe_id=p_recipe_id for update;
    if found then
      if not v_plan.publication_committed or v_plan.owner_uuid is distinct from p_owner_uuid
        or v_plan.account_generation is distinct from v_generation
        or not exists(select 1 from public.recipe_image_objects image
          join public.recipe_image_object_references ref on ref.image_object_id=image.id
          where image.id=v_plan.target_object_id and image.visibility='public_shared'
            and ref.reference_type='recipe_thumbnail' and ref.consumer_id=p_recipe_id)
      then raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED' using errcode='55000'; end if;
      if p_verified_image is not null and p_verified_image->>'copy_verified'='true' then
        if p_verified_image is distinct from jsonb_build_object('target_object_id',v_plan.target_object_id,
          'raw_sha256',v_plan.copy_plan->>'raw_sha256','byte_size',(v_plan.copy_plan->>'byte_size')::bigint,
          'actual_mime_type',v_plan.copy_plan->>'actual_mime_type','copy_verified',true)
        then raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED' using errcode='55000'; end if;
        if not exists(select 1 from public.recipe_image_object_references where image_object_id=v_plan.source_object_id) then
          update public.recipe_image_objects set state='uploaded_unlinked',unlinked_cleanup_after=clock_timestamp()+interval '24 hours',updated_at=clock_timestamp()
          where id=v_plan.source_object_id and visibility='private' and state='attached_private';
        end if;
        delete from private.manual_recipe_publication_images where recipe_id=p_recipe_id;
      else
        return v_plan.copy_plan || jsonb_build_object('phase','upload');
      end if;
    end if;
    return jsonb_build_object('status','published','recipe',v_receipt.response_body || jsonb_build_object('visibility','public'));
  end if;
  if v_recipe.updated_at is distinct from p_expected_updated_at then
    raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if v_recipe.visibility <> 'private' then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  select image.* into v_image from public.recipe_image_object_references ref
  join public.recipe_image_objects image on image.id = ref.image_object_id
  where ref.reference_type = 'recipe_thumbnail' and ref.consumer_id = p_recipe_id
  for update of image;
  if found then
    if v_image.visibility <> 'private' or v_image.state <> 'attached_private'
      or v_image.owner_uuid is distinct from p_owner_uuid
      or v_image.account_generation is distinct from v_generation
      or v_image.bucket_id <> 'recipe-images-private'
      or v_image.object_path !~ ('^' || p_owner_uuid::text || '/' || v_generation::text || '/' || v_image.id::text || '\.(jpg|jpeg|png|webp)$')
    then raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED' using errcode = '55000'; end if;
    insert into private.manual_recipe_publication_images(recipe_id,owner_uuid,account_generation,source_object_id)
    values(p_recipe_id,p_owner_uuid,v_generation,v_image.id) on conflict(recipe_id) do nothing;
    select * into v_plan from private.manual_recipe_publication_images where recipe_id = p_recipe_id for update;
    if v_plan.owner_uuid is distinct from p_owner_uuid or v_plan.account_generation is distinct from v_generation
      or v_plan.publication_committed
    then raise exception 'RECIPE_REVISION_CONFLICT' using errcode = '40001'; end if;
    if v_plan.source_object_id is distinct from v_image.id then
      if p_verified_image is not null then raise exception 'RECIPE_REVISION_CONFLICT' using errcode='40001'; end if;
      -- No public PUT is allowed before commit, so this uncommitted target has no external object.
      update private.manual_recipe_publication_images set source_object_id=v_image.id,
        target_object_id=gen_random_uuid(),copy_plan=null,created_at=clock_timestamp()
      where recipe_id=p_recipe_id returning * into v_plan;
    end if;
    v_path := 'shared/' || v_plan.target_object_id::text || substring(v_image.object_path from '\.[^.]+$');
    v_plan.copy_plan := jsonb_build_object('status','copy_required','source_object_id',v_image.id,
      'source_bucket_id',v_image.bucket_id,'source_object_path',v_image.object_path,
      'target_object_id',v_plan.target_object_id,'target_bucket_id','recipe-images','target_object_path',v_path,
      'raw_sha256',v_image.raw_sha256,'byte_size',v_image.byte_size,'actual_mime_type',v_image.actual_mime_type);
    update private.manual_recipe_publication_images set copy_plan=v_plan.copy_plan where recipe_id=p_recipe_id;
    if p_verified_image is null then
      return v_plan.copy_plan || jsonb_build_object('phase','prepare');
    end if;
    if p_verified_image is distinct from jsonb_build_object('target_object_id',v_plan.target_object_id,
      'raw_sha256',v_image.raw_sha256,'byte_size',v_image.byte_size,'actual_mime_type',v_image.actual_mime_type)
    then raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED' using errcode = '55000'; end if;
    insert into public.recipe_image_objects(id,bucket_id,object_path,raw_sha256,byte_size,actual_mime_type,visibility,state)
    values(v_plan.target_object_id,'recipe-images',v_path,v_image.raw_sha256,v_image.byte_size,v_image.actual_mime_type,'public_shared','attached_public_shared');
    update public.recipe_image_object_references set image_object_id = v_plan.target_object_id
    where reference_type = 'recipe_thumbnail' and consumer_id = p_recipe_id and image_object_id = v_image.id;
  elsif p_verified_image is not null then
    raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED' using errcode = '55000';
  else
    -- Removing the photo after a failed pre-commit attempt leaves no public PUT.
    delete from private.manual_recipe_publication_images where recipe_id=p_recipe_id and not publication_committed;
  end if;
  -- Legacy temporary/private URLs must never become public recipe thumbnails.
  if v_recipe.thumbnail_url ~ '/storage/v1/object/(sign|authenticated)/' then
    raise exception 'MANAGED_IMAGE_REFERENCE_REQUIRED' using errcode = '55000';
  end if;
  perform public.set_account_generation_internal_writer_marker((v_authority ->> 'cutover_attempt_id')::uuid,true);
  update public.recipe_nutrition_snapshots set is_current=false
  where recipe_id=p_recipe_id and owner_user_id=p_owner_uuid and is_current;
  update public.recipes set visibility='public' where id=p_recipe_id;
  update public.recipe_tags set visibility='public' where recipe_id=p_recipe_id and review_status='approved';
  perform private.complete_manual_recipe_runtime(p_owner_uuid,p_recipe_id,p_expected_updated_at,p_nutrition_snapshot,p_input_guard);
  perform public.set_account_generation_internal_writer_marker((v_authority ->> 'cutover_attempt_id')::uuid,false);
  v_response := v_receipt.response_body || jsonb_build_object('visibility','public');
  update private.manual_recipe_create_receipts set response_body=v_response
  where owner_uuid=p_owner_uuid and account_generation=v_generation and idempotency_key=p_idempotency_key;
  if v_plan.target_object_id is not null then
    update private.manual_recipe_publication_images set publication_committed=true where recipe_id=p_recipe_id;
    return v_plan.copy_plan || jsonb_build_object('phase','upload');
  end if;
  return jsonb_build_object('status','published','recipe',v_response);
end
$function$;
alter function public.publish_manual_recipe(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) owner to postgres;
revoke all on function public.publish_manual_recipe(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.publish_manual_recipe(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;

do $pending_image_read$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := pg_get_functiondef('public.read_recipe_image_projections(uuid[])'::regprocedure);
  v_old := 'on reference.reference_type = ''recipe_thumbnail'' and reference.consumer_id = recipe.id';
  v_new := v_old || E'\n    and not exists(select 1 from private.manual_recipe_publication_images pending where pending.publication_committed and pending.target_object_id=reference.image_object_id)';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PENDING_IMAGE_PROJECTION_DRIFT'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := 'and origin_reference.consumer_id = origin.id';
  v_new := v_old || E'\n    and not exists(select 1 from private.manual_recipe_publication_images pending where pending.publication_committed and pending.target_object_id=origin_reference.image_object_id)';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PENDING_ORIGIN_IMAGE_PROJECTION_DRIFT'; end if;
  execute replace(v_definition,v_old,v_new);
  v_definition := pg_get_functiondef('public.read_owned_manual_recipe_publication_context(uuid,timestamptz,text,integer,timestamptz,uuid)'::regprocedure);
  v_old := '''runtime_ready'',exists (';
  v_new := '''runtime_ready'',not exists(select 1 from private.manual_recipe_publication_images pending where pending.recipe_id=recipe.id and pending.publication_committed) and exists (';
  if strpos(v_definition,v_old)=0 then raise exception 'MANUAL_PENDING_RUNTIME_CONTEXT_DRIFT'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$pending_image_read$;

notify pgrst,'reload schema';
commit;
