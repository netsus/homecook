import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createC05OwnedSchemaHarness } from "./fixtures/c05-owned-schema-harness.mjs";
import { assertWeightImprovementParticipationSourceFunctionInventoryResult, buildWeightImprovementParticipationSourceFunctionInventorySql,
  assertRecipeProductSourceFunctionInventoryResult, buildRecipeProductSourceFunctionInventorySql,
  buildFullLocalSecurityInventoryExpression } from "@/scripts/lib/full-local-security-inventory.mjs";

const enabled = process.env.HOMECOOK_C05_NATIVE_SCHEMA_ONLY === "1";
const joined = true;
const harness = createC05OwnedSchemaHarness();
const owner = "c1000000-0000-4000-8000-000000000001";
const other = "c1000000-0000-4000-8000-000000000002";
const cutover = "c5000000-0000-4000-8000-000000000001";
const epoch = "2026-08-08T00:00:00Z";
const issued = "2026-08-08T01:00:00Z";
const args = `'${owner}','${epoch}',repeat('b',64),1,'${issued}'`;
const read = `public.read_weight_improvement_participation(${args})`;
const key = () => randomUUID();
const mutation = (action: string, revision: number, uuid = key(), generation = 1, documentHash = "h", checked = action === "opt_in") =>
  `public.mutate_weight_improvement_participation(${args},${generation},'${action}',${revision},'settings_desktop','${uuid}',
    ${action === "opt_in" ? "'native-fixture-v1'" : "null"},${action === "opt_in" ? documentHash : "null"},${checked})`;
const predecessor = { includeCookedBatchPolicyCutover: true, includeSnapshotTables: true, includePersonalRecipeFunctions: true, includeRecipeFuturePropagationFunctions: true,
  includeRecipeProductFunctions: true, includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: joined, includeCookedWeightAttestationFunctions: true };
const combined = { includeCookedWeightEvidenceFunctions: true, includeWeightImprovementParticipationFunctions: true,
  includeQuantityInputV4Functions: joined, includeCookedWeightAttestationFunctions: true, includeWeightImprovementSourceReadFunctions: joined };
const participationOptions = {includeWeightImprovementSourceReadFunctions:joined};
const product = JSON.parse(readFileSync("docs/security/recipe-product-source-function-postimages.json", "utf8"));
const cooked = JSON.parse(readFileSync("docs/security/cooked-weight-evidence-source-function-postimages.json", "utf8"));
const manifest = JSON.parse(readFileSync("docs/security/weight-improvement-participation-source-function-postimages.json", "utf8"));
const c01Signatures: string[] = cooked.functions.map((entry: { postimage: { lookupSignature: string } }) => entry.postimage.lookupSignature);
const previousSignatures: string[] = [...new Map<string, string>([...product.functions, ...cooked.functions]
  .map((entry: { postimage: { lookupSignature: string; signature: string } }) => [entry.postimage.signature, entry.postimage.lookupSignature])).values()];
const authoritySignatures = ["public.assert_recipe_future_session_authority(uuid,timestamp with time zone,text,integer,timestamp with time zone)",
  "public.verify_full_local_postgrest_request_authority()"];
let sourceBefore: Record<string, object> = {};
let authorityBefore: Record<string, object> = {};
let roleConfigBefore: Record<string, object> = {};
let wholeBefore: Record<string, unknown> = {};
let wholeAfter: Record<string, unknown> = {};
let preRequestInvoked = false;

const fixture = `begin;
  set session_replication_role=replica;
  insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at)
    values(true,'local','https://auth.mumeok.kr/auth/v1',2,1,true,'${epoch}');
  insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
  insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at)
    values(true,'generation_active',2,'${cutover}','${epoch}');
  set session_replication_role=origin;
  select public.set_account_generation_internal_writer_marker('${cutover}',true);
  insert into auth.users(id,created_at,email) values('${owner}','${epoch}','c05-native-a@example.invalid'),('${other}','${epoch}','c05-native-b@example.invalid');
  insert into public.users(id,nickname,social_provider,social_id) values('${owner}','c05-native-a','google','c05-native-a'),('${other}','c05-native-b','google','c05-native-b') on conflict(id) do nothing;
  insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1),('${other}',1);
  insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
    values('${owner}',1,'${epoch}','runtime','active',now()),('${other}',1,'${epoch}','runtime','active',now());
  insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,
    binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
    values(repeat('b',64),1,'${owner}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01'),
      (repeat('c',64),1,'${other}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01');
  select public.set_account_generation_internal_writer_marker('${cutover}',false);
  set session authorization postgres;
`;
const policy = `insert into private.weight_improvement_documents(version,document_json,document_hash)
  select 'native-fixture-v1',body,encode(extensions.digest(convert_to(body::text,'UTF8'),'sha256'),'hex')
  from (select '{"notice_version":"native-fixture-notice","title":"synthetic QA only","purpose":"synthetic QA only",
    "data_items":["fixture mass"],"excluded_items":["raw text"],"sample_retention":"fixture only",
    "evidence_retention":"fixture only","withdrawal":"fixture withdrawal","personal_service":"unchanged",
    "body":"not an approved policy or retention period"}'::jsonb body) document;
  update private.weight_improvement_control set participation_enabled=true,current_document_version='native-fixture-v1';`;
const configuredPreRequest = `do $configured$ declare hook text; begin
  select substring(setting from length('pgrst.db_pre_request=')+1) into hook
  from pg_roles cross join lateral unnest(coalesce(rolconfig,'{}'::text[])) setting
  where rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if hook is distinct from 'public.verify_full_local_postgrest_request_authority' then raise exception 'Configured hook changed';end if;
  execute format('select %I.%I()',split_part(hook,'.',1),split_part(hook,'.',2));
end $configured$;`;
const service = (path = "mutate_weight_improvement_participation", scope = "weight-improvement", method = "POST") =>
  `set session authorization service_role;set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';
   set request.headers='{"x-homecook-internal-scope":"${scope}"}';set request.method='${method}';set request.path='/rpc/${path}';`;
function transaction(statement: string, withPolicy = false) {
  const result = harness.sql(`${fixture}${withPolicy ? policy : ""}${statement}\nrollback;`, { admin: true });
  if (statement.includes(configuredPreRequest)) preRequestInvoked = true;
  return result;
}
const json = (statement: string) => JSON.parse(harness.sql(statement).stdout.trim().split("\n").at(-1)!);
function functionsSnapshot(signatures: string[]) {
  return json(`with expected(signature) as (values ${signatures.map((signature) => `('${signature}')`).join(",")})
    select jsonb_object_agg(signature,jsonb_build_object('body',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,
      'configuration',p.proconfig,'security_definer',p.prosecdef,'volatility',p.provolatile,'return_type',p.prorettype::regtype::text))
    from expected left join pg_proc p on p.oid=to_regprocedure(signature);`);
}
const roleConfig = () => json(`select jsonb_object_agg(rolname,to_jsonb(rolconfig)) from pg_roles
  where rolname in('postgres','authenticator','anon','authenticated','service_role');`);

describe.runIf(enabled)("C05 on owned schema-only 219 → C03/C01/C04 → personal228 native integration", () => {
  beforeAll(async () => {
    const schemaArchive = process.env.HOMECOOK_C05_NATIVE_SCHEMA_ARCHIVE;
    const rolesArchive = process.env.HOMECOOK_C05_NATIVE_ROLES_ARCHIVE;
    if (!schemaArchive || !rolesArchive) throw new Error("Explicit authorized schema, password-free roles paths are required");
    await harness.restore({ schemaArchive, rolesArchive });
    expect(harness.evidence.application_rows_restored).toBe(0);
    expect(harness.evidence.source_ledger_sha256).toBe(manifest.source_ledger_sha256);
    harness.applyMigration(0); harness.applyMigration(1);
    expect(assertRecipeProductSourceFunctionInventoryResult(json(buildRecipeProductSourceFunctionInventorySql({ includeCookedWeightEvidenceFunctions: true })),
      { includeCookedWeightEvidenceFunctions: true })).toMatchObject({ required_functions: 38 });
    if (joined) for (let index=2;index<8;index+=1) harness.applyMigration(index);
    sourceBefore = functionsSnapshot(previousSignatures);
    authorityBefore = functionsSnapshot(authoritySignatures);
    roleConfigBefore = roleConfig();
    harness.applyMigration(8);
    wholeBefore = json(`select (${buildFullLocalSecurityInventoryExpression(predecessor)});`);
    harness.applyMigration(9);
    harness.applyMigration(10);
  }, 60000);
  afterAll(() => {
    if (!enabled) return;
    harness.close();
    writeFileSync(process.env.HOMECOOK_C05_NATIVE_REPORT ?? "/tmp/mumeok-c05-native-integration-report.json", JSON.stringify({
      ...harness.evidence, joined, whole_inventory_before: wholeBefore, whole_inventory_after: wholeAfter,
      real_authority_stubbed: false, configured_pre_request_invoked: preRequestInvoked, transport_jwt_signature_tested: false,
      application_data_restored: false, external_ai_calls: 0, collection_enabled: false, D3_D5_completed: false,
    }, null, 2) + "\n");
  });
  it("checks all eight C05 and 113 combined exact function bodies, owners, ACLs and full config", () => {
    expect(assertWeightImprovementParticipationSourceFunctionInventoryResult(json(buildWeightImprovementParticipationSourceFunctionInventorySql(participationOptions))))
      .toMatchObject({ required_functions: 8, body: 0, configuration: 0 });
    expect(assertRecipeProductSourceFunctionInventoryResult(json(buildRecipeProductSourceFunctionInventorySql(combined)), combined))
      .toMatchObject({ required_functions: 113, body: 0, acl: 0, configuration: 0 });
  });
  it("preserves the prior C03/C01 bodies and metadata, including all 15 C01 functions via the renamed outer", () => {
    const after = functionsSnapshot(previousSignatures.map((signature) => signature === "private.verify_full_local_internal_scope()"
      ? "private.verify_scope_pre_weight_attestation_20261014()" : signature));
    expect(c01Signatures).toHaveLength(15);
    for (const signature of previousSignatures) expect(after[signature === "private.verify_full_local_internal_scope()"
      ? "private.verify_scope_pre_weight_attestation_20261014()" : signature]).toEqual(sourceBefore[signature]);
    expect(functionsSnapshot(authoritySignatures)).toEqual(authorityBefore);
    expect(roleConfig()).toEqual(roleConfigBefore);
  });
  it("keeps every unrelated whole-inventory drift unchanged and does not declare that baseline safe", () => {
    wholeAfter = json(`select (${buildFullLocalSecurityInventoryExpression({ ...predecessor, includeWeightImprovementParticipationFunctions: true, includeWeightImprovementSourceReadFunctions: joined })});`);
    expect(wholeAfter.required_function_count).toBe(161);
    expect(wholeBefore.required_function_count).toBe(151);
    for (const field of Object.keys(wholeBefore)) if (field !== "required_function_count") expect(wholeAfter[field], field).toEqual(wholeBefore[field]);
    expect(wholeAfter.function_source_drift_count).not.toBe(0);
    expect(json("select count(*) from homecook_deploy.migrations;")).toBe(230);
  });
  it("detects an extra function setting even when source/search_path/ACL are unchanged", () => {
    const drift = json(`begin;alter function private.is_weight_improvement_document_complete(jsonb) set statement_timeout='123ms';
      ${buildWeightImprovementParticipationSourceFunctionInventorySql(participationOptions)}rollback;`);
    expect(drift).toMatchObject({ body: 0, search_path: 0, acl: 0, configuration: 1 });
    expect(() => assertWeightImprovementParticipationSourceFunctionInventoryResult(drift)).toThrow("failed closed");
    expect(assertWeightImprovementParticipationSourceFunctionInventoryResult(json(buildWeightImprovementParticipationSourceFunctionInventorySql(participationOptions))))
      .toMatchObject({ configuration: 0 });
  });
  it("restores OFF/null and immutable collection CHECK(false), with no API table privileges", () => {
    const tables = json(`select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'policies',
      (select count(*) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname),'api_grants',
      (select count(*) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where a.grantee=0 or a.grantee=any(array['anon'::regrole::oid,'authenticated'::regrole::oid,'service_role'::regrole::oid]))))
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
        and c.relname=any(array['weight_improvement_documents','weight_improvement_control','weight_improvement_participation','weight_improvement_consent_events']);`);
    expect(tables).toHaveLength(4);
    for (const table of tables) expect(table).toEqual({ owner: "postgres", rls: true, policies: 0, api_grants: 0 });
    expect(harness.sql("update private.weight_improvement_control set collection_enabled=true;", { succeeds: false }).stderr).toContain("check constraint");
    expect(json("select to_jsonb(c) from private.weight_improvement_control c;")).toMatchObject({ participation_enabled: false, collection_enabled: false, current_document_version: null });
    transaction(`${service("read_weight_improvement_participation")}${configuredPreRequest}
      do $off$ declare result jsonb; begin result:=${read};
        if result->>'decision'<>'unanswered' or result->>'revision'<>'0' or result->>'participation_enabled'<>'false'
          or result->>'collection_enabled'<>'false' or result->'document'<>'null'::jsonb then raise exception 'OFF contract mismatch';end if;
      end $off$;reset session authorization;
      do $rows$ begin if (select count(*) from private.weight_improvement_participation)<>0
        or (select count(*) from private.weight_improvement_consent_events)<>0 or (select count(*) from public.mutation_idempotency_keys)<>0
        then raise exception 'Read performed writes';end if;end $rows$;`);
  });
  it("uses the actual configured pre-request and real authority, rejects wrong owner, stale session and deleting lifecycle", () => {
    transaction(`${service("read_weight_improvement_participation")}${configuredPreRequest}
      do $authority$ declare result jsonb; begin
        begin perform public.read_weight_improvement_participation('${other}','${epoch}',repeat('b',64),1,'${issued}');
          raise exception 'Wrong owner accepted';exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_SESSION_STALE' then raise;end if;end;
        result:=public.read_weight_improvement_participation('${other}','${epoch}',repeat('c',64),1,'${issued}');
        if result->'subject'->>'owner_uuid'<>'${other}' or result->>'decision'<>'unanswered' then raise exception 'Account state leaked';end if;
      end $authority$;reset session authorization;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      update public.user_session_generation_bindings set binding_state='revoked' where session_key_hash=repeat('b',64);
      select public.set_account_generation_internal_writer_marker('${cutover}',false);
      ${service("read_weight_improvement_participation")}
      do $revoked$ begin begin perform ${read};raise exception 'Revoked session accepted';
        exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_SESSION_STALE' then raise;end if;end;end $revoked$;
      reset session authorization;select public.set_account_generation_internal_writer_marker('${cutover}',true);
      update public.user_session_generation_bindings set binding_state='active' where session_key_hash=repeat('b',64);
      update public.user_account_lifecycles set status='deleting' where owner_uuid='${owner}';
      select public.set_account_generation_internal_writer_marker('${cutover}',false);${service("read_weight_improvement_participation")}
      do $deleting$ begin begin perform ${read};raise exception 'Deleting owner accepted';
        exception when sqlstate '55000' then if sqlerrm<>'ACCOUNT_DELETING' then raise;end if;end;end $deleting$;`);
  });
  it("atomically rejects OFF opt-in and stale document while requiring explicit current-version consent", () => {
    transaction(`${service()}${configuredPreRequest}
      do $off$ begin begin perform ${mutation("opt_in", 0, key(), 1, "repeat('a',64)")};raise exception 'OFF accepted opt-in';
        exception when sqlstate '55000' then if sqlerrm<>'PARTICIPATION_DISABLED' then raise;end if;end;end $off$;
      reset session authorization;do $empty$ begin if (select count(*) from public.mutation_idempotency_keys)<>0 then raise exception 'Disabled receipt left behind';end if;end $empty$;`);
    transaction(`${service()}${configuredPreRequest}
      do $consent$ declare h text; begin
        begin perform ${mutation("opt_in", 0, key(), 1, "repeat('a',64)", false)};raise exception 'Unchecked accepted';
          exception when sqlstate '22023' then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
        begin perform ${mutation("opt_in", 0, key(), 1, "repeat('a',64)")};raise exception 'Old document accepted';
          exception when sqlstate '55000' then if sqlerrm<>'PARTICIPATION_DOCUMENT_CHANGED' then raise;end if;end;
      end $consent$;reset session authorization;do $empty$ begin
        if (select count(*) from private.weight_improvement_participation)<>0 or (select count(*) from private.weight_improvement_consent_events)<>0
          or (select count(*) from public.mutation_idempotency_keys)<>0 then raise exception 'Failed opt-in partially applied';end if;end $empty$;`, true);
  });
  it("records only one immutable consent event for exact opt-in replay", () => {
    const uuid = key();
    transaction(`${service()}${configuredPreRequest}
      do $on$ declare h text; result jsonb; begin
        perform set_config('request.path','/rpc/read_weight_improvement_participation',true);h:=${read}->'document'->>'hash';
        perform set_config('request.path','/rpc/mutate_weight_improvement_participation',true);
        result:=${mutation("opt_in", 0, uuid)};if result->>'decision'<>'opted_in' or result->>'revision'<>'1' or result->>'collection_enabled'<>'false' then raise exception 'Opt-in mismatch';end if;
        perform ${mutation("opt_in", 0, uuid)};
      end $on$;reset session authorization;do $evidence$ begin
        if (select count(*) from private.weight_improvement_consent_events)<>1 or (select count(*) from public.mutation_idempotency_keys)<>1
          or exists(select 1 from private.weight_improvement_consent_events e join private.weight_improvement_documents d on d.version=e.document_version
            where e.document_hash<>d.document_hash or e.action<>'opt_in' or e.surface<>'settings_desktop') then raise exception 'Consent evidence mismatch';end if;
        begin delete from private.weight_improvement_consent_events;raise exception 'Mutable consent accepted';
          exception when sqlstate '55000' then if sqlerrm<>'WEIGHT_IMPROVEMENT_EVIDENCE_IMMUTABLE' then raise;end if;end;
        begin update private.weight_improvement_documents set document_json='{}';raise exception 'Mutable document accepted';
          exception when sqlstate '55000' then if sqlerrm<>'WEIGHT_IMPROVEMENT_EVIDENCE_IMMUTABLE' then raise;end if;end;
      end $evidence$;`, true);
  });
  it("separates notice_seen and decline from explicit consent and avoids repeated events", () => {
    transaction(`${service()}${configuredPreRequest}
      do $choice$ declare result jsonb; begin
        perform ${mutation("notice_seen", 0)};result:=${mutation("notice_seen", 1)};
        if result->>'decision'<>'unanswered' or result->>'revision'<>'1' then raise exception 'Seen became consent';end if;
        perform ${mutation("decline", 1)};result:=${mutation("decline", 2)};
        if result->>'decision'<>'declined' or result->>'revision'<>'2' then raise exception 'Repeated decline changed choice';end if;
      end $choice$;reset session authorization;do $events$ begin if (select count(*) from private.weight_improvement_consent_events)<>1
        or exists(select 1 from private.weight_improvement_consent_events where action<>'decline') then raise exception 'Endless seen/decline events';end if;end $events$;`, true);
  });
  it("keeps withdrawal pending after policy OFF and projects current state on old opt-in replay", () => {
    const uuid = key();
    transaction(`${service()}${configuredPreRequest}
      do $on$ declare h text; begin perform set_config('request.path','/rpc/read_weight_improvement_participation',true);
        h:=${read}->'document'->>'hash';perform set_config('c05.fixture.document_hash',h,true);
        perform set_config('request.path','/rpc/mutate_weight_improvement_participation',true);perform ${mutation("opt_in", 0, uuid)};end $on$;
      reset session authorization;update private.weight_improvement_control set participation_enabled=false,current_document_version=null;
      ${service()}${configuredPreRequest}
      do $withdraw$ declare h text; result jsonb; begin
        result:=${mutation("withdraw", 1)};
        if result->>'decision'<>'withdrawn' or result->>'cleanup_status'<>'pending' or result->>'collection_enabled'<>'false'
          or result->'document'<>'null'::jsonb then raise exception 'OFF withdrawal mismatch';end if;
      end $withdraw$;
      do $replay$ declare h text:=current_setting('c05.fixture.document_hash'); result jsonb; begin
        result:=${mutation("opt_in", 0, uuid)};
        if result->>'decision'<>'withdrawn' or result->>'revision'<>'2' or result->>'cleanup_status'<>'pending' then raise exception 'Replay revived ON';end if;
        begin perform ${mutation("withdraw", 2, uuid)};raise exception 'Changed same key accepted';
          exception when unique_violation then if sqlerrm<>'IDEMPOTENCY_KEY_REUSED' then raise;end if;end;
      end $replay$;reset session authorization;
      update private.weight_improvement_control set participation_enabled=true,current_document_version='native-fixture-v1';
      ${service()}do $stale$ declare h text:=current_setting('c05.fixture.document_hash'); begin
        begin perform ${mutation("opt_in", 1)};raise exception 'Stale ON accepted';
          exception when sqlstate '55000' then if sqlerrm<>'PARTICIPATION_REVISION_CONFLICT' then raise;end if;end;
      end $stale$;reset session authorization;do $pending$ begin if (select count(*) from private.weight_improvement_consent_events)<>2
        or exists(select 1 from private.weight_improvement_participation where cleanup_status='completed') then raise exception 'Fabricated cleanup completion';end if;end $pending$;`, true);
  });
  it("rejects expected-generation mismatch before receipt replay and keeps old generation participation separate", () => {
    const uuid = key();
    transaction(`${service()}${configuredPreRequest}
      do $generation$ declare h text; result jsonb; begin
        perform set_config('request.path','/rpc/read_weight_improvement_participation',true);h:=${read}->'document'->>'hash';
        perform set_config('request.path','/rpc/mutate_weight_improvement_participation',true);perform ${mutation("opt_in", 0, uuid)};
        begin perform ${mutation("opt_in", 0, uuid, 2)};raise exception 'Old displayed generation accepted';
          exception when sqlstate '55000' then if sqlerrm<>'PARTICIPATION_SUBJECT_CHANGED' then raise;end if;end;
      end $generation$;reset session authorization;
      do $receipt$ begin if (select count(*) from public.mutation_idempotency_keys)<>1 then raise exception 'Generation check reached receipt write';end if;end $receipt$;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      update public.user_account_generation_watermarks set last_account_generation=2 where owner_uuid='${owner}';
      update public.user_account_lifecycles set status='quarantined',quarantine_reason='synthetic displaced generation'
        where owner_uuid='${owner}' and account_generation=1;
      insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
        values('${owner}',2,'${epoch}','runtime','active',now());
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
        values(repeat('d',64),1,'${owner}',2,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01');
      select public.set_account_generation_internal_writer_marker('${cutover}',false);
      ${service("read_weight_improvement_participation")}${configuredPreRequest}
      do $new$ declare result jsonb; begin result:=${read.replace("repeat('b',64)", "repeat('d',64)")};if result->'subject'->>'account_generation'<>'2' or result->>'decision'<>'unanswered'
        or result->>'revision'<>'0' then raise exception 'Old generation consent revived';end if;end $new$;`, true);
  });
  it("permits only exact C05 POST RPC paths for service_role and delegates existing C01 scopes", () => {
    for (const role of ["anon", "authenticated"]) transaction(`set session authorization ${role};do $denied$ begin
      begin perform ${read};raise exception 'Client role executed C05';exception when insufficient_privilege then null;end;
      begin perform 1 from private.weight_improvement_participation;raise exception 'Client role read private table';exception when insufficient_privilege then null;end;
    end $denied$;`);
    for (const [path, method] of [["read_weight_improvement_participation", "GET"], ["other_rpc", "POST"]]) {
      transaction(`${service(path, "weight-improvement", method)}do $path$ begin
        begin perform public.verify_full_local_postgrest_request_authority();raise exception 'Wrong path accepted';
          exception when insufficient_privilege then if sqlerrm<>'PARTICIPATION_UNAUTHORIZED' then raise;end if;end;
      end $path$;`);
    }
    transaction(`${service("read_weight_improvement_participation", "other-scope")}
      do $scope$ begin begin perform ${read};raise exception 'Wrong scope accepted';
        exception when insufficient_privilege then if sqlerrm<>'PARTICIPATION_UNAUTHORIZED' then raise;end if;end;
        begin perform 1 from private.weight_improvement_participation;raise exception 'Service direct table read accepted';exception when insufficient_privilege then null;end;
      end $scope$;`);
    for (const path of ["complete_snapshot_v2_cooking_session_with_weight_evidence", "mutate_cooked_batch_weight_with_evidence"]) {
      transaction(`${service(path, "snapshot-v2-session")}${configuredPreRequest}`);
    }
  });
});
