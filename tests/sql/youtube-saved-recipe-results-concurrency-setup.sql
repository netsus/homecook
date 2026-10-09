select set_config('request.jwt.claim.role','service_role',false);
set session_replication_role = replica;
insert into public.youtube_extraction_sessions(
  id,user_id,youtube_url,youtube_video_id,classification_status,draft_json,
  extraction_meta_json,expires_at,status,created_at,updated_at
)
select
  '22000000-0000-4000-8000-000000000001',binding.owner_uuid,
  'https://www.youtube.com/watch?v=concurrent1','concurrent1','recipe',
  '{"title":"동시 자동 저장","base_servings":1,"tags":[],"ingredients":[],"steps":[{"instruction":"확인한다"}]}'::jsonb,'{"concurrency_fixture":true}'::jsonb,
  clock_timestamp()+interval '1 hour','draft',clock_timestamp(),clock_timestamp()
from public.user_session_generation_bindings binding
where binding.revoked_at is null and binding.binding_state='active'
  and binding.binding_expires_at>clock_timestamp()
order by binding.bound_at desc limit 1;
set session_replication_role = origin;
