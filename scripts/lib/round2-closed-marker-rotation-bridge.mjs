import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { assertRound2EightKeyFence, preserveRound2RotationState, ROUND2_ROTATION_NAMES } from './round2-eight-key-rotation-fence.mjs';

export const ROTATION_BRIDGE = Object.freeze({
  web: '06a3369f5c5e1c3ca49045f370f0ce12f049c805',
  target: '15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9',
  capsule: 'cf5a80513d4e532c2319344af8d72c23375d2fc24fdabc2864dee318dfe11ad5',
  build: 'prelaunch-06a3369f5c5e-EWuEsS',
});
const toolFiles=new Set(['scripts/deploy-prelaunch-web.mjs','scripts/lib/prelaunch-web-deploy.mjs',
  'scripts/lib/round2-closed-marker-rotation-bridge.mjs','tests/round2-closed-marker-rotation-bridge.test.mjs',
  'scripts/lib/youtube-v85-cutover.mjs','tests/youtube-v85-cutover.test.ts',
  'tests/prelaunch-protected-rollout.test.ts','tests/prelaunch-closed-r2-maintenance.test.ts',
  'docs/engineering/youtube-v85-rotation-marker-bridge-20261017.md','docs/sync/CURRENT_SOURCE_OF_TRUTH.md']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = ok => { if (!ok) throw new Error('R2_ROTATION_CLOSED_MARKER_BRIDGE_INVALID'); };
export const ROTATION_EVIDENCE_PIN=Object.freeze({
  journalSha256:'6ddf4e4b76772b0654fa8a3da84bb097c651a04286ffbb521680c64eea0108b4',
  beforeSha256:'0fd3ed269fa9a1b0917956db8f3f26fc4fdc7ee0faa03107c0fef083147015a5',
  afterSha256:'2703ca7a444bae6015c80664ef859b35858cf039e22a3c7f4668d30ad7437b6f',
});
export function assertRotationEvidenceDigests(digests){check(same(digests,ROTATION_EVIDENCE_PIN));}
export function assertPinnedRound2ClosedMarkerRotationBridge(input){
  try{assertRotationEvidenceDigests({journalSha256:hash(input.journalBytes),beforeSha256:hash(input.beforeBytes),afterSha256:hash(input.afterBytes)});
    return assertRound2ClosedMarkerRotationBridge(input);
  }catch{throw new Error('R2_ROTATION_CLOSED_MARKER_BRIDGE_INVALID');}
}

export function assertRotationBridgeToolBinding({toolRef,requestedToolRef,targetRef,capsuleSha256,clean,ownRepository,digests,untrackedPaths}) {
  check(/^[a-f0-9]{40}$/u.test(toolRef)&&toolRef!==ROTATION_BRIDGE.target&&requestedToolRef===toolRef
    &&targetRef===ROTATION_BRIDGE.target&&capsuleSha256===ROTATION_BRIDGE.capsule&&clean===true&&ownRepository===true
    &&Array.isArray(untrackedPaths)&&untrackedPaths.length===0);
  const paths=Object.keys(digests);
  check(paths.length>=4&&paths.every(path=>toolFiles.has(path))
    &&['scripts/deploy-prelaunch-web.mjs','scripts/lib/prelaunch-web-deploy.mjs','scripts/lib/round2-closed-marker-rotation-bridge.mjs','tests/round2-closed-marker-rotation-bridge.test.mjs'].every(path=>paths.includes(path)));
  for(const pair of Object.values(digests))check(Array.isArray(pair)&&pair.length===2&&pair[1]!==null&&pair[0]!==pair[1]
    &&pair.every(value=>value===null||/^[a-f0-9]{64}$/u.test(value)));
  return {toolRef,targetRef,capsuleSha256,sourceDeltaSha256:hash(JSON.stringify(digests)),operatingChanged:false};
}

export async function confirmRotationBridgeTool(review,boundary,display,confirm) {
  check(boundary.platform==='darwin'&&boundary.stdinTTY&&boundary.stdoutTTY&&boundary.stderrTTY);
  display({...review,userExecutionRequired:true,keysRemainNew:true,collectionAndLeadRemainOff:true,credentialIssued:false});
  check(await confirm()==='V85-BRIDGE');
}

// This proves one historical->actual transition. It never substitutes the live hash.
export function assertRound2ClosedMarkerRotationBridge({ state, marker, live, authority, stateBytes, beforeBytes, afterBytes,
  receiptBytes, journalBytes, fenceBytes, controlBytes, armExists, beforePlistBytes, beforePlist }) {
  try {
    const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes),receipt=JSON.parse(receiptBytes),journal=JSON.parse(journalBytes);
    const binding=authority?.plan?.round2Binding,rotation=preserveRound2RotationState(state,{}).round2EightKeyRotation;
    check(authority?.planSha256===ROTATION_BRIDGE.capsule&&authority.plan.webRef===ROTATION_BRIDGE.target
      &&same(binding?.marker,rotation)&&binding.fenceSha256===hash(fenceBytes)&&binding.controlSha256===hash(controlBytes));
    check(state.ref===ROTATION_BRIDGE.web&&state.buildId===ROTATION_BRIDGE.build&&live.ref===state.ref
      &&live.buildId===state.buildId&&live.cwd===state.checkout&&same(state,after)
      &&same(JSON.parse(stateBytes),state)&&hash(stateBytes)===hash(afterBytes));
    check(journal.version===1&&journal.phase==='committed'&&journal.startup_eight_match===true
      &&journal.collector_disabled_verified===true&&journal.reactivation_ready===false
      &&journal.state_before_sha256===hash(beforeBytes)&&journal.state_after_sha256===hash(afterBytes)
      &&journal.stage_receipt_sha256===hash(receiptBytes)&&journal.source_sha256===receipt.source_plist_sha256
      &&journal.candidate_sha256===receipt.candidate_plist_sha256&&journal.fence_sha256===hash(fenceBytes));
    check(receipt.version===1&&receipt.status==='staged_not_applied'&&receipt.collection_enabled===false&&receipt.lead_enabled===false
      &&receipt.control_sha256===hash(controlBytes)&&rotation.stageReceiptSha256===hash(receiptBytes)
      &&rotation.fenceSha256===hash(fenceBytes)&&rotation.candidatePlistSha256===receipt.candidate_plist_sha256);
    check(before.round2EightKeyRotation===undefined&&before.targetPlistHash===receipt.source_plist_sha256
      &&marker.targetPlistSha256===receipt.source_plist_sha256&&hash(beforePlistBytes)===receipt.source_plist_sha256
      &&state.targetPlistHash===receipt.candidate_plist_sha256&&live.plistHash===receipt.candidate_plist_sha256
      &&receipt.source_plist_sha256!==receipt.candidate_plist_sha256);
    check(same({...before,targetPlistHash:state.targetPlistHash,round2EightKeyRotation:rotation},state));
    const fence=JSON.parse(fenceBytes),control=JSON.parse(controlBytes),next=live.plist.EnvironmentVariables;
    assertRound2EightKeyFence(next,fence);
    check(control.collection_enabled===false&&control.lead_enabled===false&&!armExists);
    const expected=structuredClone(beforePlist);
    for(const name of ROUND2_ROTATION_NAMES){
      check(hash(expected.EnvironmentVariables[name])===fence.denied_fingerprints[name]);
      expected.EnvironmentVariables[name]=next[name];
    }
    check(same(expected,live.plist)); // Every non-eight setting stays byte-decoded equal.
    return {historicalPlistSha256:receipt.source_plist_sha256,actualPlistSha256:receipt.candidate_plist_sha256};
  }catch{throw new Error('R2_ROTATION_CLOSED_MARKER_BRIDGE_INVALID');}
}
