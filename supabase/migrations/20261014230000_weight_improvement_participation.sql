begin;

-- D1/D2 preparation only. No document, retention period, collection or model is activated.
create table private.weight_improvement_documents (
  version text primary key check (length(version) between 1 and 80),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  document_json jsonb not null check (jsonb_typeof(document_json)='object'),
  created_at timestamptz not null default clock_timestamp(),
  check (document_hash=encode(extensions.digest(convert_to(document_json::text,'UTF8'),'sha256'),'hex')),
  check (document_json ?& array['notice_version','title','purpose','data_items','excluded_items','sample_retention','evidence_retention','withdrawal','personal_service','body']),
  check (jsonb_typeof(document_json->'data_items')='array' and jsonb_array_length(document_json->'data_items')>0),
  check (jsonb_typeof(document_json->'excluded_items')='array'),
  check (nullif(btrim(document_json->>'sample_retention'),'') is not null and nullif(btrim(document_json->>'evidence_retention'),'') is not null)
);
create table private.weight_improvement_control (
  singleton boolean primary key default true check(singleton),
  participation_enabled boolean not null default false,
  collection_enabled boolean not null default false check(not collection_enabled),
  current_document_version text references private.weight_improvement_documents(version),
  check(not participation_enabled or current_document_version is not null)
);
insert into private.weight_improvement_control(singleton) values(true);

create function private.is_weight_improvement_document_complete(p_document jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,private,pg_temp as $$
declare v_key text; v_item jsonb;
begin
  if jsonb_typeof(p_document) is distinct from 'object' then return false; end if;
  foreach v_key in array array['notice_version','title','purpose','sample_retention','evidence_retention','withdrawal','personal_service','body'] loop
    if jsonb_typeof(p_document->v_key) is distinct from 'string' or nullif(btrim(p_document->>v_key),'') is null then return false; end if;
  end loop;
  foreach v_key in array array['data_items','excluded_items'] loop
    if jsonb_typeof(p_document->v_key) is distinct from 'array' then return false; end if;
    for v_item in select value from jsonb_array_elements(p_document->v_key) loop
      if jsonb_typeof(v_item) is distinct from 'string' or nullif(btrim(v_item#>>'{}'),'') is null then return false; end if;
    end loop;
  end loop;
  return jsonb_array_length(p_document->'data_items')>0;
end;
$$;
alter table private.weight_improvement_documents add constraint weight_improvement_document_complete
  check(private.is_weight_improvement_document_complete(document_json));

create table private.weight_improvement_participation (
  owner_uuid uuid not null,
  account_generation bigint not null check(account_generation>0),
  purpose text not null default 'cooked_weight_estimation_improvement' check(purpose='cooked_weight_estimation_improvement'),
  decision text not null default 'unanswered' check(decision in ('unanswered','declined','opted_in','withdrawn')),
  revision bigint not null default 0 check(revision>=0),
  notice_seen_at timestamptz,
  notice_version_seen text,
  opted_in_at timestamptz,
  withdrawn_at timestamptz,
  consent_document_version text references private.weight_improvement_documents(version),
  consent_document_hash text,
  cleanup_status text not null default 'none' check(cleanup_status in ('none','pending','retrying','completed')),
  primary key(owner_uuid,account_generation,purpose),
  check(decision<>'opted_in' or (opted_in_at is not null and consent_document_version is not null and consent_document_hash is not null)),
  check(decision<>'withdrawn' or withdrawn_at is not null)
);
create table private.weight_improvement_consent_events (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_uuid uuid not null,
  account_generation bigint not null check(account_generation>0),
  purpose text not null check(purpose='cooked_weight_estimation_improvement'),
  action text not null check(action in ('decline','opt_in','withdraw')),
  revision bigint not null check(revision>0),
  document_version text references private.weight_improvement_documents(version),
  document_hash text,
  surface text not null check(surface in ('mobile_web','mobile_pwa','settings_mobile','settings_desktop')),
  request_receipt_id uuid not null unique,
  occurred_at timestamptz not null default clock_timestamp(),
  unique(owner_uuid,account_generation,purpose,revision),
  check(action<>'opt_in' or (document_version is not null and document_hash is not null))
);

create function private.protect_weight_improvement_evidence() returns trigger
language plpgsql security invoker set search_path=pg_catalog,private,pg_temp as $$
begin raise exception 'WEIGHT_IMPROVEMENT_EVIDENCE_IMMUTABLE' using errcode='55000'; end;
$$;
create trigger weight_improvement_documents_immutable before update or delete on private.weight_improvement_documents
for each row execute function private.protect_weight_improvement_evidence();
create trigger weight_improvement_consent_events_immutable before update or delete on private.weight_improvement_consent_events
for each row execute function private.protect_weight_improvement_evidence();

alter table private.weight_improvement_documents owner to postgres;
alter table private.weight_improvement_control owner to postgres;
alter table private.weight_improvement_participation owner to postgres;
alter table private.weight_improvement_consent_events owner to postgres;
alter table private.weight_improvement_documents enable row level security;
alter table private.weight_improvement_control enable row level security;
alter table private.weight_improvement_participation enable row level security;
alter table private.weight_improvement_consent_events enable row level security;
revoke all on private.weight_improvement_documents,private.weight_improvement_control,
  private.weight_improvement_participation,private.weight_improvement_consent_events from public,anon,authenticated,service_role;

create function private.require_weight_improvement_scope(p_rpc_name text) returns void
language plpgsql security invoker set search_path=pg_catalog,public,private,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role'
    or coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope' is distinct from 'weight-improvement'
    or upper(coalesce(current_setting('request.method',true),''))<>'POST'
    or current_setting('request.path',true) is distinct from '/rpc/'||p_rpc_name then
    raise exception 'PARTICIPATION_UNAUTHORIZED' using errcode='42501';
  end if;
  perform private.verify_full_local_internal_scope();
end;
$$;

create function private.project_weight_improvement_participation(p_owner_uuid uuid,p_generation bigint) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public,private,pg_temp as $$
declare v_row private.weight_improvement_participation%rowtype; v_control private.weight_improvement_control%rowtype; v_document jsonb;
begin
  select * into v_row from private.weight_improvement_participation where owner_uuid=p_owner_uuid and account_generation=p_generation
    and purpose='cooked_weight_estimation_improvement';
  select * into v_control from private.weight_improvement_control where singleton;
  if v_control.participation_enabled then
    select document_json||jsonb_build_object('version',version,'hash',document_hash) into v_document
      from private.weight_improvement_documents where version=v_control.current_document_version;
  end if;
  return jsonb_build_object('purpose','cooked_weight_estimation_improvement',
    'subject',jsonb_build_object('owner_uuid',p_owner_uuid,'account_generation',p_generation),
    'decision',coalesce(v_row.decision,'unanswered'),'revision',coalesce(v_row.revision,0),
    'notice_seen_at',v_row.notice_seen_at,'notice_version_seen',v_row.notice_version_seen,
    'opted_in_at',v_row.opted_in_at,'withdrawn_at',v_row.withdrawn_at,
    'consent_document_version',v_row.consent_document_version,'consent_document_hash',v_row.consent_document_hash,
    'cleanup_status',coalesce(v_row.cleanup_status,'none'),'participation_enabled',coalesce(v_control.participation_enabled,false),
    'collection_enabled',false,'document',v_document);
end;
$$;

create function public.read_weight_improvement_participation(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_authority jsonb;
begin
  perform private.require_weight_improvement_scope('read_weight_improvement_participation');
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  return private.project_weight_improvement_participation(p_owner_uuid,(v_authority->>'account_generation')::bigint);
end;
$$;

create function public.mutate_weight_improvement_participation(
  p_owner_uuid uuid,p_auth_identity_created_at_snapshot timestamptz,p_session_key_hash text,p_hmac_key_version integer,p_session_issued_at timestamptz,
  p_expected_account_generation bigint,p_action text,p_expected_revision bigint,p_surface text,p_idempotency_key uuid,
  p_document_version text,p_document_hash text,p_consent_checked boolean
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare
  v_authority jsonb; v_generation bigint; v_row private.weight_improvement_participation%rowtype;
  v_control private.weight_improvement_control%rowtype; v_doc private.weight_improvement_documents%rowtype;
  v_claim jsonb; v_receipt uuid; v_now timestamptz:=clock_timestamp(); v_changed boolean:=false; v_event uuid;
begin
  perform private.require_weight_improvement_scope('mutate_weight_improvement_participation');
  if p_expected_account_generation is null or p_expected_account_generation<=0
    or p_action is null or p_action not in ('notice_seen','decline','opt_in','withdraw') or p_expected_revision is null or p_expected_revision<0
    or p_surface is null or p_surface not in ('mobile_web','mobile_pwa','settings_mobile','settings_desktop') or p_idempotency_key is null
    or (p_action='opt_in' and (p_consent_checked is distinct from true or p_document_version is null or p_document_hash is null))
    or (p_action<>'opt_in' and (p_consent_checked is distinct from false or p_document_version is not null or p_document_hash is not null)) then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  v_authority:=public.assert_recipe_future_session_authority(p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  v_generation:=(v_authority->>'account_generation')::bigint;
  -- Displayed subject is a precondition, never the source of owner/generation authority.
  -- Check before receipt lookup so an old-generation request cannot replay into a new generation.
  if v_generation is distinct from p_expected_account_generation then
    raise exception 'PARTICIPATION_SUBJECT_CHANGED' using errcode='55000';
  end if;
  -- Account serialization is shared with existing lifecycle writers; this adds no auth permission.
  v_claim:=private.claim_cooked_batch_operation(p_owner_uuid,v_generation,'weight_improvement_participation',p_idempotency_key,
    jsonb_build_object('expected_account_generation',p_expected_account_generation,'action',p_action,'expected_revision',p_expected_revision,'surface',p_surface,
      'document_version',p_document_version,'document_hash',p_document_hash,'consent_checked',p_consent_checked),v_now);
  if v_claim ? 'replay' then
    -- The receipt proves the original operation; replay projects CURRENT choice, never a stale ON snapshot.
    return private.project_weight_improvement_participation(p_owner_uuid,v_generation);
  end if;
  v_receipt:=(v_claim->>'receipt_id')::uuid;
  select * into v_control from private.weight_improvement_control where singleton for share;
  if p_action<>'withdraw' then
    if not coalesce(v_control.participation_enabled,false) then raise exception 'PARTICIPATION_DISABLED' using errcode='55000'; end if;
    select * into v_doc from private.weight_improvement_documents where version=v_control.current_document_version;
    if v_doc.version is null then raise exception 'PARTICIPATION_DISABLED' using errcode='55000'; end if;
  end if;
  insert into private.weight_improvement_participation(owner_uuid,account_generation) values(p_owner_uuid,v_generation)
    on conflict(owner_uuid,account_generation,purpose) do nothing;
  select * into v_row from private.weight_improvement_participation where owner_uuid=p_owner_uuid and account_generation=v_generation
    and purpose='cooked_weight_estimation_improvement' for update;
  if v_row.revision<>p_expected_revision then raise exception 'PARTICIPATION_REVISION_CONFLICT' using errcode='55000'; end if;
  if p_action='opt_in' and (v_doc.version is distinct from p_document_version or v_doc.document_hash is distinct from p_document_hash) then
    raise exception 'PARTICIPATION_DOCUMENT_CHANGED' using errcode='55000';
  end if;
  if p_action='notice_seen' then
    if v_row.notice_seen_at is null then
      v_row.notice_seen_at:=v_now; v_row.notice_version_seen:=v_doc.document_json->>'notice_version'; v_changed:=true;
    end if;
  elsif p_action='decline' then
    if v_row.decision='opted_in' then raise exception 'VALIDATION_ERROR' using errcode='22023'; end if;
    if v_row.decision not in ('declined','withdrawn') then v_row.decision:='declined'; v_changed:=true; end if;
  elsif p_action='opt_in' then
    if v_row.decision<>'opted_in' or v_row.consent_document_version is distinct from v_doc.version or v_row.consent_document_hash is distinct from v_doc.document_hash then
      v_row.decision:='opted_in'; v_row.opted_in_at:=v_now; v_row.withdrawn_at:=null;
      v_row.consent_document_version:=v_doc.version; v_row.consent_document_hash:=v_doc.document_hash; v_changed:=true;
    end if;
  elsif p_action='withdraw' and v_row.decision='opted_in' then
    v_row.decision:='withdrawn'; v_row.withdrawn_at:=v_now; v_row.cleanup_status:='pending'; v_changed:=true;
    -- D3 deletion/model exclusion is not implemented here. No completion or zero-sample assumption.
  end if;
  if v_changed then
    v_row.revision:=v_row.revision+1;
    if p_action in ('decline','opt_in') then
      v_row.notice_seen_at:=coalesce(v_row.notice_seen_at,v_now);
      v_row.notice_version_seen:=coalesce(v_row.notice_version_seen,v_doc.document_json->>'notice_version');
    end if;
    update private.weight_improvement_participation set decision=v_row.decision,revision=v_row.revision,
      notice_seen_at=v_row.notice_seen_at,notice_version_seen=v_row.notice_version_seen,opted_in_at=v_row.opted_in_at,
      withdrawn_at=v_row.withdrawn_at,consent_document_version=v_row.consent_document_version,
      consent_document_hash=v_row.consent_document_hash,cleanup_status=v_row.cleanup_status
      where owner_uuid=p_owner_uuid and account_generation=v_generation and purpose=v_row.purpose;
    if p_action<>'notice_seen' then
      insert into private.weight_improvement_consent_events(owner_uuid,account_generation,purpose,action,revision,
        document_version,document_hash,surface,request_receipt_id,occurred_at)
        values(p_owner_uuid,v_generation,v_row.purpose,p_action,v_row.revision,
          case when p_action='withdraw' then v_row.consent_document_version else v_doc.version end,
          case when p_action='withdraw' then v_row.consent_document_hash else v_doc.document_hash end,p_surface,v_receipt,v_now) returning id into v_event;
    end if;
  end if;
  perform private.finish_cooked_batch_operation(v_receipt,jsonb_build_object('applied_revision',v_row.revision,'event_id',v_event),v_event,v_now);
  return private.project_weight_improvement_participation(p_owner_uuid,v_generation);
end;
$$;

alter function private.verify_full_local_internal_scope() rename to verify_scope_pre_weight_participation_20261014;
create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp as $$
begin
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='weight-improvement' then
    if upper(coalesce(current_setting('request.method',true),''))='POST' and current_setting('request.path',true)=any(array[
      '/rpc/read_weight_improvement_participation','/rpc/mutate_weight_improvement_participation']) then return; end if;
    raise exception 'PARTICIPATION_UNAUTHORIZED' using errcode='42501';
  end if;
  perform private.verify_scope_pre_weight_participation_20261014();
end;
$$;

alter function private.protect_weight_improvement_evidence() owner to postgres;
alter function private.is_weight_improvement_document_complete(jsonb) owner to postgres;
alter function private.require_weight_improvement_scope(text) owner to postgres;
alter function private.project_weight_improvement_participation(uuid,bigint) owner to postgres;
alter function private.verify_scope_pre_weight_participation_20261014() owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
alter function public.read_weight_improvement_participation(uuid,timestamptz,text,integer,timestamptz) owner to postgres;
alter function public.mutate_weight_improvement_participation(uuid,timestamptz,text,integer,timestamptz,bigint,text,bigint,text,uuid,text,text,boolean) owner to postgres;
revoke all on function private.protect_weight_improvement_evidence(),private.is_weight_improvement_document_complete(jsonb),private.require_weight_improvement_scope(text),
  private.project_weight_improvement_participation(uuid,bigint),private.verify_scope_pre_weight_participation_20261014(),
  private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
revoke all on function public.read_weight_improvement_participation(uuid,timestamptz,text,integer,timestamptz),
  public.mutate_weight_improvement_participation(uuid,timestamptz,text,integer,timestamptz,bigint,text,bigint,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.read_weight_improvement_participation(uuid,timestamptz,text,integer,timestamptz),
  public.mutate_weight_improvement_participation(uuid,timestamptz,text,integer,timestamptz,bigint,text,bigint,text,uuid,text,text,boolean) to service_role;

commit;
