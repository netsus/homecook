#!/usr/bin/env node
// Isolated PostgreSQL17 credential CAS contract. No production mounts, ports or keys.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { strict as assert } from 'node:assert';
import { buildV74RegistrationSql } from './youtube-v74-controlled-cutover.mjs';
import { V74_TRANSITION as V } from './lib/youtube-v74-cutover-preparation.mjs';
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS as OPTIONS } from './lib/youtube-extraction-worker-artifact.mjs';
const IMAGE='public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a';
const name=`hc-v74-native-${randomUUID().slice(0,8)}`;
const run=(args,input)=>spawnSync('docker',args,{encoding:'utf8',input,maxBuffer:4*1024*1024});
const required=(args,input)=>{const r=run(args,input);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
let id;let passed=0;
try {
  id=required(['run','--platform','linux/arm64','--pull','never','--detach','--rm','--name',name,'--label','homecook.task=v74-native-20261016','--network','none','--user','postgres','--tmpfs','/tmp:rw,mode=1777','--entrypoint','/bin/sh',IMAGE,'-c',
    'initdb -D /tmp/v74-data -A trust -U postgres >/tmp/init.log && exec postgres -D /tmp/v74-data -k /tmp -c listen_addresses=']);
  const psql=(sql)=>required(['exec','-i',id,'psql','-h','/tmp','-U','postgres','-d','postgres','-XAtq','-v','ON_ERROR_STOP=1'],sql);
  for(let i=0;i<100;i++){const r=run(['exec',id,'pg_isready','-h','/tmp','-U','postgres']);if(r.status===0)break;assert.ok(i<99,'isolated postgres startup');await delay(200);}
  const migration=readFileSync('supabase/migrations/20260812160000_youtube_async_extraction_notification.sql','utf8');
  const table=(n)=>{const start=migration.indexOf(`create table if not exists private.${n} (`);assert.ok(start>0);return migration.slice(start,migration.indexOf('\n);',start)+4);};
  const fn=(n)=>{const start=migration.indexOf(`create or replace function ${n}(`);assert.ok(start>0);return migration.slice(start,migration.indexOf('$function$;',migration.indexOf('as $function$',start))+11);};
  psql(`CREATE SCHEMA private; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE youtube_extraction_credential_manager NOLOGIN; CREATE ROLE youtube_extraction_credential_manager_rpc_owner NOLOGIN;
${table('youtube_extraction_current_policy')}\n${table('youtube_extraction_worker_credentials')}
${fn('private.youtube_extraction_policy_snapshot_digest')}\n${fn('public.rotate_youtube_extraction_worker_credential')}
ALTER FUNCTION public.rotate_youtube_extraction_worker_credential(bigint,bigint,text,timestamptz,text,text,text) OWNER TO youtube_extraction_credential_manager_rpc_owner;
GRANT USAGE ON SCHEMA private,extensions TO youtube_extraction_credential_manager_rpc_owner;
GRANT SELECT ON private.youtube_extraction_current_policy TO youtube_extraction_credential_manager_rpc_owner;
GRANT SELECT,UPDATE ON private.youtube_extraction_worker_credentials TO youtube_extraction_credential_manager_rpc_owner;
REVOKE ALL ON FUNCTION public.rotate_youtube_extraction_worker_credential(bigint,bigint,text,timestamptz,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.rotate_youtube_extraction_worker_credential(bigint,bigint,text,timestamptz,text,text,text) TO youtube_extraction_credential_manager;
INSERT INTO private.youtube_extraction_current_policy(policy_key,policy_version,extractor_mode,pipeline_identity,result_affecting_options,fingerprint_key_version,previous_fingerprint_key_version,previous_fingerprint_valid_until,enabled)
 VALUES('primary',3,'i031_codex_vision','${V.predecessorPipelineIdentity}','${JSON.stringify(OPTIONS)}','kept-key','kept-previous',now()+interval '1 day',false);
INSERT INTO private.youtube_extraction_worker_credentials VALUES('primary',48,repeat('a',64),now()+interval '2 days','${V.predecessorReleaseSha}','${V.schemaIdentity}','${V.predecessorSnapshotDigest}',now());`);
  const now=new Date(),iat=Math.floor(now.getTime()/1000);
  const manager={role:'youtube_extraction_credential_manager',scope:'youtube-extraction-credential-manager',iss:'https://worker.mumeok.kr',aud:'youtube-extraction',jti_hash:'c'.repeat(64),iat,exp:iat+300};
  const metadata={generation:49,jti_sha256:'b'.repeat(64),expires_at:new Date((iat+V.workerLifetimeSeconds)*1000).toISOString(),release_sha:V.releaseSha,schema_identity:V.schemaIdentity,allowed_snapshot_digest:V.snapshotDigest};
  const sql=buildV74RegistrationSql({managerClaims:manager,metadata},now);
  const before=psql("SELECT (to_jsonb(t)-'enabled'-'updated_at'-'pipeline_identity')::text FROM private.youtube_extraction_current_policy t;");
  const result=psql(`BEGIN;${sql}SELECT current_generation FROM private.youtube_extraction_worker_credentials;ROLLBACK;`);
  assert.match(result,/"rotated": true/u);assert.match(result,/49/u);passed++;
  assert.equal(psql('SELECT current_generation FROM private.youtube_extraction_worker_credentials;'),'48');passed++;
  psql(`BEGIN;${sql}COMMIT;`);
  assert.equal(psql('SELECT current_generation FROM private.youtube_extraction_worker_credentials;'),'49');passed++;
  assert.equal(psql("SELECT (to_jsonb(t)-'enabled'-'updated_at'-'pipeline_identity')::text FROM private.youtube_extraction_current_policy t;"),before);passed++;
  assert.equal(psql("SELECT private.youtube_extraction_policy_snapshot_digest(extractor_mode,pipeline_identity,result_affecting_options,policy_version) FROM private.youtube_extraction_current_policy;"),V.snapshotDigest);passed++;
  const duplicate=psql(`BEGIN;${sql}COMMIT;`);assert.match(duplicate,/"rotated": false/u);passed++;
  assert.equal(psql('SELECT current_generation FROM private.youtube_extraction_worker_credentials;'),'49');passed++;
  const wrong=sql.replace(V.snapshotDigest,'f'.repeat(64));
  const rejected=run(['exec','-i',id,'psql','-h','/tmp','-U','postgres','-d','postgres','-XAtq','-v','ON_ERROR_STOP=1'],`BEGIN;${wrong}COMMIT;`);
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/POLICY_CHANGED/u);passed++;
  const denied=run(['exec','-i',id,'psql','-h','/tmp','-U','postgres','-d','postgres','-XAtq','-v','ON_ERROR_STOP=1'],`BEGIN;SET LOCAL ROLE youtube_extraction_credential_manager;UPDATE private.youtube_extraction_worker_credentials SET current_generation=50;`);
  assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/u);passed++;
  process.stdout.write(JSON.stringify({nativePostgresMajor:17,passed,failed:0,productionTouched:false,modelCalls:0})+'\n');
} finally {if(id) required(['rm','--force',id]);}
