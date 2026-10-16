import { createHash } from "node:crypto";
// Exact metadata handoff for the reviewed v74 release; no credential or DB writes.
import { isDeepStrictEqual } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

export const V74_RELEASE = "3e58467499c63ba20c3b3191d9dd7dec77a7aa44";
export const V74_WEB_PREDECESSOR = "0ae67d66c5ab330cf3f7ef7aff3a7ba40e99b1d7";
export function v74Paths(home = homedir()) {
  const artifact = join(home, ".homecook/youtube-extraction-releases/3e58467499c6-v74");
  const secrets = join(home, ".homecook/youtube-extraction");
  return { artifact, secrets, descriptor: join(secrets, "app-descriptor-v74-gen49.json"),
    manifest: join(artifact, "artifact.json"), schema: join(artifact, "scripts/manifests/youtube-extraction-expected-schema.json"),
    config: join(secrets, "worker-v74-gen49.env"), credential: join(secrets, "worker-credential-v74-gen49.json"),
    token: join(secrets, "worker-v74-gen49.jwt"), policy: join(secrets, "current-policy-v74-gen49.json") };
}
export function v74MetadataPatch(home = homedir()) {
  const paths = v74Paths(home);
  return { HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH: paths.descriptor,
    HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH: paths.schema,
    HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH: paths.manifest };
}
export function assertV74MetadataHandoff({ options, liveRef, patch, previous, next, home = homedir() }) {
  if (options.refOption !== "--reviewed-ref" || options.ref !== V74_RELEASE || liveRef !== V74_WEB_PREDECESSOR
    || options.alreadyAppliedDb !== true || !options.dbConfig || !options.envFile
    || options.dbBaseline || options.dbCompatible || options.skipAutomatedTests || options.verifyScript
    || Object.entries(options).some(([key, value]) => key.startsWith("reviewed") && value)
    || !isDeepStrictEqual(patch, v74MetadataPatch(home))) throw new Error("v74 exact source/three metadata paths required");
  if (previous && next) {
    const expected = { ...previous, WorkingDirectory: next.WorkingDirectory,
      EnvironmentVariables: { ...previous.EnvironmentVariables, ...patch } };
    // Existing retargetPlist also retargets only its working-directory argument.
    expected.ProgramArguments = [previous.ProgramArguments[0], join(next.WorkingDirectory, "scripts/start-production.mjs"), ...previous.ProgramArguments.slice(2)];
    if (!isDeepStrictEqual(expected, next)) throw new Error("v74 handoff changed unrelated launcher/environment");
  }
  return { ...options, envFile: undefined };
}

export const V74_ACTIVATION_SHA256 = "f9fbccad6e8a18cfd4b33e9cd6e92a21b27c0e98d6557f76c303f859cae6672d"; // Filled only from the immutable actual activation receipt.
export const V74_OPERATION_DIRECTORY = join(homedir(), '.homecook/operations/youtube-v74-gen49-20261016');
const hashPattern = /^[a-f0-9]{64}$/u;
const workerFields = ['credentialGeneration', 'credentialRowSha256', 'policyRowSha256', 'policyStableSha256',
  'schemaIdentity', 'snapshotDigest', 'workerPolicyEnabled', 'workerReleaseSha'];
export function assertV74WorkerSuccessor({ proof, baseline, approvedPolicy, origin }) {
  const check = (ok, message) => { if (!ok) throw new Error(`v74 successor: ${message}`); };
  check(proof?.schema === 'homecook.youtube-v74-activation.v1' && proof.releaseSha === V74_RELEASE
    && isDeepStrictEqual(proof.origin, origin), 'immutable original authority binding');
  for (const key of workerFields) {
    const expected = ['policyRowSha256', 'workerPolicyEnabled'].includes(key) ? approvedPolicy[key] : baseline[key];
    check(proof.before.worker[key] === expected, `predecessor ${key}`);
  }
  const after = proof.after.worker;
  check(after.credentialGeneration === 49 && after.workerReleaseSha === V74_RELEASE && after.workerPolicyEnabled === true
    && after.schemaIdentity === 'youtube-extraction-worker-schema-v2'
    && after.snapshotDigest === '6ad984e1ff856c009698bb15d1c2afb72116264b29120390204cc6af32aef121'
    && after.catalogFingerprint === 'de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05'
    && ['credentialRowSha256','policyRowSha256','policyStableSha256'].every(key => hashPattern.test(after[key])), 'fixed49 after-state');
  check(proof.before.worker.credentialGeneration === 48 && proof.before.worker.workerPolicyEnabled === true
    && proof.before.worker.workerReleaseSha === '6b610eb012da42b5d151b058531815dc12a8ca45', 'fixed48 predecessor');
  const beforePolicy = proof.before.policy, afterPolicy = proof.after.policy;
  check(beforePolicy.pipelineIdentity === '85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd'
    && afterPolicy.pipelineIdentity === '0d81a76c8df4b3f0c8ec05f1a0ad9aeab5477b9cb7fa4b64e299ce83452b7583'
    && isDeepStrictEqual({ ...beforePolicy, pipelineIdentity: afterPolicy.pipelineIdentity }, afterPolicy), 'policy/fingerprint preservation');
  for (const key of ['targetSha256', 'normalDataSha256', 'controlsSha256', 'catalogSha256', 'immutableSha256', 'authoritySha256'])
    check(hashPattern.test(proof.before[key]) && proof.before[key] === proof.after[key], `preserved ${key}`);
  check(proof.web.releaseSha === V74_RELEASE && hashPattern.test(proof.web.plistSha256)
    && hashPattern.test(proof.registrationSha256) && hashPattern.test(proof.verificationSha256)
    && proof.health.authenticatedStatus === 200 && proof.health.emptyClaimDenied === true
    && proof.health.ready === true && proof.health.pid > 0 && proof.health.pid === proof.health.secondPid
    && hashPattern.test(proof.service.plistSha256), 'web/registration/actual service verification');
  return after;
}

// Validate root launchctl fields, never a nested child PID or a plist-only identity.
export function assertV74LoadedService({ stdout, plist, plistPath, serviceTarget, requireRunning = true }) {
  const lines=stdout.trimEnd().split('\n');
  if(lines[0]!==`${serviceTarget} = {`||lines.at(-1)!=='}')throw new Error('v74 incomplete launchctl identity');
  let depth=0;const root=[];let argsStart=-1;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(depth===1){root.push(line);if(line==='\targuments = {')argsStart=i;}
    if(/ = \{$/u.test(line))depth++;if(/^\t*\}$/u.test(line))depth--;
    if(depth<0||depth===0&&i!==lines.length-1)throw new Error('v74 ambiguous launchctl output');
  }
  const field=name=>{const prefix=`\t${name} = `,values=root.filter(line=>line.startsWith(prefix));if(values.length!==1)throw new Error('v74 missing/duplicate launchctl field');return values[0].slice(prefix.length);};
  const argsEnd=lines.indexOf('\t}',argsStart+1),args=lines.slice(argsStart+1,argsEnd);
  if(depth!==0||argsStart<0||argsEnd<0||args.some(line=>!line.startsWith('\t\t'))
    ||field('path')!==plistPath||field('type')!=='LaunchAgent'||field('program')!==plist.ProgramArguments[0]
    ||field('working directory')!==plist.WorkingDirectory||requireRunning&&field('state')!=='running'
    ||!isDeepStrictEqual(args.map(line=>line.slice(2)),plist.ProgramArguments)||field('state')==='running'&&(!/^\d+$/u.test(field('pid'))||Number(field('pid'))<=0))
    throw new Error('v74 actual loaded command differs from installed launcher');
  return {loaded:true,state:field('state'),pid:field('state')==='running'?Number(field('pid')):null};
}

// The private release history and merged master have different commit ancestry.
// Bind their complete85-file diff, including the already-applied exact232 SQL.
export const V74_SOURCE_DIFF_SHA256='08678a3ad27c71360201a6f0b7cb3a2c4c558bd8c7e7221fcabb18f3a8131bb3';
export const V74_WEB_HANDOFF_SHA256="b66db104d30beff97ae1f473115915b38263fb78ca87f0545e509d4e178e34d5";
export function assertV74SourceHandoff({from,to,digests}) {
  const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
  if(from!==V74_WEB_PREDECESSOR||to!==V74_RELEASE||Object.keys(digests??{}).length!==85
    ||hash(JSON.stringify(Object.fromEntries(Object.entries(digests).sort(([a],[b])=>a<b?-1:a>b?1:0))))!==V74_SOURCE_DIFF_SHA256)
    throw new Error('v74 complete source handoff bytes differ');
  return new Set(Object.keys(digests).filter(path=>path.startsWith('scripts/')));
}
export function assertV74WebHandoff({proof,maintenance,ledger}) {
  const s=proof?.state,w=proof?.web;
  if(proof?.schema!=='homecook.youtube-v74-web-handoff.v1'||proof.from!==V74_WEB_PREDECESSOR||proof.to!==V74_RELEASE
    ||proof.sourceDiffSha256!==V74_SOURCE_DIFF_SHA256||!isDeepStrictEqual(proof.databaseMaintenance,maintenance)
    ||!Array.isArray(ledger)||ledger.length!==232||s?.databaseVerification?.baselineRequired!==false
    ||s.databaseVerification.pending?.length!==0||!isDeepStrictEqual(s.databaseVerification.source,ledger)||!isDeepStrictEqual(s.databaseVerification.applied,ledger)
    ||s?.ref!==V74_RELEASE||s?.closedR2?.from!==V74_WEB_PREDECESSOR||s.closedR2.to!==V74_RELEASE||s.closedR2.activationAuthorized!==false
    ||s.closedR2.kind!=='continuation'||w?.releaseSha!==V74_RELEASE||w.plistSha256!==s.targetPlistHash||w.buildId!==s.buildId
    ||s.closedR2.targetPlistSha256!==w.plistSha256||!hashPattern.test(s.closedR2.previousStateSha256)
    ||!hashPattern.test(s.closedR2.previousArtifactSha256))throw new Error('v74 actual web handoff receipt differs');
  return true;
}
