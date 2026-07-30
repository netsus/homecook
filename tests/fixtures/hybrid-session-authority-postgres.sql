\set ON_ERROR_STOP on

begin;

do $acl$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role']
  loop
    if not has_schema_privilege(v_role, 'private', 'USAGE')
      or not has_function_privilege(
        v_role,
        'private.verify_hybrid_request_authority()',
        'EXECUTE'
      ) then
      raise exception 'hybrid pre-request ACL missing for %', v_role;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'private.decode_base64url_jsonb(text)',
    'EXECUTE'
  ) then
    raise exception 'private decoder leaked to authenticated';
  end if;
end;
$acl$;

do $test$
declare
  v_issuer constant text := 'https://remote.example.supabase.co/auth/v1';
  v_secret constant text := 'integration-attestation-secret-32-bytes';
  v_owner uuid;
  v_session uuid := '22222222-2222-4222-8222-222222222222';
  v_identity_created_at timestamptz := clock_timestamp() - interval '1 day';
  v_verified_at timestamptz := clock_timestamp();
  v_now bigint := extract(epoch from clock_timestamp())::bigint;
  v_session_key_hash text := repeat('a', 64);
  v_payload text;
  v_signature text;
begin
  select id
    into strict v_owner
  from public.users
  order by id
  limit 1;

  perform set_config('app.settings.auth_expected_issuer', v_issuer, true);
  perform set_config(
    'app.settings.homecook_session_attestation_hmac_key_v1',
    v_secret,
    true
  );
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);

  perform public.record_hybrid_remote_session_authority(
    v_issuer,
    v_owner,
    v_identity_created_at,
    v_now,
    repeat('b', 64),
    v_verified_at,
    v_now,
    v_session_key_hash,
    1,
    v_verified_at + interval '600 seconds',
    v_verified_at + interval '600 seconds'
  );

  if not exists (
    select 1
    from public.user_session_generation_bindings as binding
    where binding.session_key_hash = v_session_key_hash
      and binding.binding_expires_at > v_verified_at + interval '120 seconds'
      and binding.binding_expires_at <= v_verified_at + interval '600 seconds'
  ) then
    raise exception 'binding TTL did not follow the access-token expiry';
  end if;

  v_payload := translate(
    rtrim(
      replace(
        encode(
          convert_to(
            jsonb_build_object(
              'version', 1,
              'method', 'POST',
              'path', '/meals',
              'issuer', v_issuer,
              'owner_uuid', v_owner,
              'identity_created_at', v_identity_created_at,
              'session_key_hash', v_session_key_hash,
              'issued_at', v_now,
              'expires_at', v_now + 30
            )::text,
            'UTF8'
          ),
          'base64'
        ),
        E'\n',
        ''
      ),
      '='
    ),
    '+/',
    '-_'
  );
  v_signature := encode(
    extensions.hmac(
      convert_to(v_payload, 'UTF8'),
      convert_to(v_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'iss', v_issuer,
      'aud', 'authenticated',
      'role', 'authenticated',
      'sub', v_owner,
      'session_id', v_session,
      'iat', v_now,
      'nbf', v_now,
      'exp', v_now + 600
    )::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.headers',
    jsonb_build_object(
      'x-homecook-session-attestation', v_payload,
      'x-homecook-session-attestation-signature', v_signature
    )::text,
    true
  );
  perform set_config('request.method', 'POST', true);
  perform set_config('request.path', '/meals', true);
  perform private.verify_hybrid_request_authority();

  begin
    perform set_config('request.path', '/other-owner', true);
    perform private.verify_hybrid_request_authority();
    raise exception 'method/path attestation mismatch was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.revoke_hybrid_remote_session_authority(
    v_session_key_hash,
    1
  );

  begin
    perform public.record_hybrid_remote_session_authority(
      v_issuer,
      v_owner,
      v_identity_created_at,
      v_now,
      repeat('b', 64),
      v_verified_at,
      v_now,
      v_session_key_hash,
      1,
      v_verified_at + interval '600 seconds',
      v_verified_at + interval '600 seconds'
    );
    raise exception 'revoked binding was reactivated';
  exception
    when sqlstate '55000' then
      null;
  end;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'iss', v_issuer,
      'aud', 'authenticated',
      'role', 'authenticated',
      'sub', v_owner,
      'session_id', v_session,
      'iat', v_now,
      'nbf', v_now,
      'exp', v_now + 600
    )::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.path', '/meals', true);

  begin
    perform private.verify_hybrid_request_authority();
    raise exception 'revoked binding was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text,
    true
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);

  begin
    perform public.assert_hybrid_remote_session_authority(
      v_issuer,
      v_owner,
      v_identity_created_at,
      v_session_key_hash,
      1
    );
    raise exception 'revoked binding assert accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  raise notice 'HYBRID_SESSION_AUTHORITY_TRANSACTION_PASS';
end;
$test$;

select 'HYBRID_SESSION_AUTHORITY_TRANSACTION_PASS';

rollback;
