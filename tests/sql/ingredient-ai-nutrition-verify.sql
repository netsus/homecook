-- Read-only contract/authorization checks for a fully replayed isolated DB.
-- Run before the operator enables AI generation. Does not call a provider.
\set ON_ERROR_STOP on
begin;
do $verify$
declare v_role text; v_rpc text; v_result jsonb;
begin
  if (select enabled from private.ingredient_ai_nutrition_settings where singleton) then
    raise exception 'fixture expects initial disabled rollout';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'private.ingredient_ai_nutrition_jobs','SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege(v_role,'private.ingredient_ai_nutrition_settings','SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'direct AI metadata access unexpectedly granted to %', v_role;
    end if;
  end loop;
  foreach v_rpc in array array[
    'public.enqueue_ingredient_ai_nutrition(uuid[])',
    'public.claim_ingredient_ai_nutrition_job(text,integer)',
    'public.get_ingredient_ai_nutrition_context(uuid,uuid)',
    'public.complete_ingredient_ai_nutrition_job(uuid,uuid,jsonb)',
    'public.fail_ingredient_ai_nutrition_job(uuid,uuid,text,boolean)',
    'public.list_ingredient_ai_nutrition_refresh_jobs(integer)',
    'public.acknowledge_ingredient_ai_nutrition_refresh(uuid,uuid[])'
  ] loop
    if has_function_privilege('anon',v_rpc,'EXECUTE')
      or has_function_privilege('authenticated',v_rpc,'EXECUTE')
      or not has_function_privilege('service_role',v_rpc,'EXECUTE') then
      raise exception 'invalid AI RPC ACL: %', v_rpc;
    end if;
  end loop;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.role','anon',true);
  perform set_config('request.headers','{"x-homecook-internal-scope":"ingredient-ai-nutrition"}',true);
  perform set_config('request.method','POST',true);
  perform set_config('request.path','/rpc/claim_ingredient_ai_nutrition_job',true);
  begin
    perform public.claim_ingredient_ai_nutrition_job('verify',180);
    raise exception 'anon unexpectedly claimed work';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  v_result := public.claim_ingredient_ai_nutrition_job('verify',180);
  if v_result ->> 'status' <> 'disabled' then raise exception 'disabled worker did not stop'; end if;
  if exists (select 1 from private.ingredient_ai_nutrition_jobs where status='processing') then
    raise exception 'disabled claim created a processing job';
  end if;
  perform set_config('request.path','/rpc/enqueue_ingredient_ai_nutrition',true);
  begin
    perform public.claim_ingredient_ai_nutrition_job('verify',180);
    raise exception 'wrong RPC path unexpectedly accepted';
  exception when insufficient_privilege then null; end;
end;
$verify$;
rollback;
