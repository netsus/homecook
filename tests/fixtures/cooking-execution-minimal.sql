create schema private;create schema extensions;create extension pgcrypto with schema extensions;
do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role;end if;end;$$;
create table public.users(id uuid primary key);
create table public.recipe_content_snapshots(id uuid primary key,base_servings numeric,ingredients_json jsonb,steps_json jsonb);
create table public.cooking_sessions(id uuid primary key,user_id uuid,recipe_id uuid,contract_version text,status text,recipe_content_snapshot_id uuid,cooking_servings numeric);
create table public.leftover_dishes(id uuid primary key,user_id uuid,recipe_content_snapshot_id uuid,cooking_servings numeric,finished_weight_g numeric);
create table public.mutation_idempotency_keys(id uuid primary key default extensions.gen_random_uuid(),owner_uuid uuid,account_generation bigint,operation_scope text,key_hash text,payload_hash text,state text,attempt_token uuid,lease_expires_at timestamptz,created_at timestamptz,updated_at timestamptz,terminal_result text,durable_result jsonb,result_reference uuid,unique(owner_uuid,account_generation,operation_scope,key_hash));
create table public.nutrition_sources(provider_code text,dataset_name text,source_version text,data_basis_date date,license_name text,source_url text,review_status text,freshness_status text,is_active boolean);
create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb language plpgsql as $$begin if $3<>'synthetic-fixture' then raise exception 'ACCOUNT_SESSION_STALE' using errcode='55000';end if;return '{"account_generation":1}';end;$$;
create function public.lock_personal_recipe_ids(uuid[]) returns void language plpgsql as $$begin perform pg_advisory_xact_lock(hashtext($1::text));end;$$;
create function private.verify_full_local_internal_scope() returns void language plpgsql as $$begin raise exception 'wrong scope' using errcode='42501';end;$$;
create function private.resolve_cooked_batch_nutrition(p_batch_id uuid,p_owner_uuid uuid) returns jsonb language plpgsql as $$declare v_batch public.leftover_dishes%rowtype;begin
  select batch.* into v_batch from public.leftover_dishes batch where id=p_batch_id and user_id=p_owner_uuid;
 return '{"legacy":true}';end;$$;
create function public.complete_snapshot_v2_cooking_session(p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,p_session_id uuid,p_idempotency_key uuid,p_consumed_pantry_item_ids uuid[],p_weight_action text,p_finished_weight_g numeric,p_now timestamptz) returns jsonb language plpgsql as $$declare v_requested integer;v_session public.cooking_sessions%rowtype;begin
 select * into v_session from public.cooking_sessions where id=p_session_id and user_id=p_owner_uuid for update;
 if v_session.status is distinct from 'in_progress' then raise exception 'CONFLICT' using errcode='55000';end if;
 v_requested := cardinality(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[]));
 insert into public.leftover_dishes values(p_session_id,p_owner_uuid,v_session.recipe_content_snapshot_id,v_session.cooking_servings,p_finished_weight_g);
 update public.cooking_sessions set status='completed' where id=p_session_id;
 return jsonb_build_object('weight_g',p_finished_weight_g,'nutrition',private.resolve_cooked_batch_nutrition(p_session_id,p_owner_uuid));end;$$;
create function public.complete_snapshot_v2_cooking_session_with_weight_evidence(p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,p_session_id uuid,p_idempotency_key uuid,p_consumed_pantry_item_ids uuid[],p_weight_action text,p_finished_weight_g numeric,p_weight_input_source text,p_prediction jsonb,p_write_enabled boolean,p_now timestamptz) returns jsonb language plpgsql as $$begin
 return public.complete_snapshot_v2_cooking_session(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_session_id,p_idempotency_key,p_consumed_pantry_item_ids,p_weight_action,case when p_weight_action='weigh_later' then (p_prediction->'prediction'->>'totalGrams')::numeric else p_finished_weight_g end,p_now);end;$$;
