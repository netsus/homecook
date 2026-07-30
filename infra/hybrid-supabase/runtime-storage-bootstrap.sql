insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'runtime-private',
  'runtime-private',
  false,
  1048576,
  array['text/plain']
)
on conflict (id) do update
set public = false,
    file_size_limit = 1048576,
    allowed_mime_types = array['text/plain'];

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'recipe-images-private',
  'recipe-images-private',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function private.hybrid_runtime_storage_request_authorized()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  perform private.verify_hybrid_request_authority();
  return true;
end;
$function$;

revoke all on function private.hybrid_runtime_storage_request_authorized()
  from public, anon, service_role;
grant execute on function private.hybrid_runtime_storage_request_authorized()
  to authenticated;

grant select on storage.objects to authenticated;
revoke insert, update, delete on storage.objects from authenticated;

drop policy if exists hybrid_runtime_storage_owner_select on storage.objects;
create policy hybrid_runtime_storage_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'runtime-private'
    and owner_id = auth.uid()::text
    and private.hybrid_runtime_storage_request_authorized()
  );

drop policy if exists hybrid_runtime_storage_owner_insert on storage.objects;
drop policy if exists hybrid_runtime_storage_owner_update on storage.objects;
drop policy if exists hybrid_runtime_storage_owner_delete on storage.objects;
