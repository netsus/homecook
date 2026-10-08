select set_config('request.jwt.claim.role','service_role',false);
select public.ensure_youtube_saved_recipe_result(
  binding.owner_uuid,binding.auth_identity_created_at_snapshot,
  binding.session_key_hash,binding.hmac_key_version,binding.session_issued_at,
  '22000000-0000-4000-8000-000000000001',:'idempotency_key'::uuid,clock_timestamp()
)->'data'->>'draft_id'
from public.user_session_generation_bindings binding
where binding.revoked_at is null and binding.binding_state='active'
  and binding.binding_expires_at>clock_timestamp()
order by binding.bound_at desc limit 1;
