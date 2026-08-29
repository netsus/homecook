const hex = (value, name) => { if (!/^[a-f0-9]{64}$/u.test(value ?? "")) throw new Error(`${name} must be 64-hex`); return value; };
/** Builds parameterized local-only fixture SQL for existing worker guard tables. */
export function buildIsolatedYoutubeWorkerSyntheticFixtureSql({ runIdentity, userId, jobId, releaseSha, schemaIdentity, allowedSnapshotDigest, jtiHash, policyVersion = 1, nowEpoch }) {
  if (!/^[a-f0-9-]{16,}$/u.test(runIdentity ?? "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(userId ?? "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(jobId ?? "") || !/^[a-f0-9]{40}$/u.test(releaseSha ?? "") || !schemaIdentity || !Number.isSafeInteger(nowEpoch)) throw new Error("isolated fixture identity is invalid");
  hex(allowedSnapshotDigest, "allowedSnapshotDigest"); hex(jtiHash, "jtiHash");
  return Object.freeze({
    sql: [
      "insert into private.youtube_extraction_current_policy(policy_key,policy_version,extractor_mode,pipeline_identity,result_affecting_options,fingerprint_key_version,enabled) values ('primary',:'policy_version','isolated_rehearsal','isolated_rehearsal','{}'::jsonb,'r2',true);",
      "insert into private.youtube_extraction_worker_credentials(credential_name,current_generation,current_jti_hash,expires_at,release_sha,schema_identity,allowed_snapshot_digest) values ('primary',1,:'jti_hash',to_timestamp(:'now_epoch')+interval '2 hours',:'release_sha',:'schema_identity',:'allowed_snapshot_digest');",
      "insert into public.youtube_extractor_permits(permit_key,permit_generation) values ('primary',0);",
      "insert into public.users(id,nickname,social_provider,social_id) values (:'user_id',:'nickname','google',:'social_id');",
      "insert into public.youtube_extraction_jobs(id,user_id,youtube_video_id,request_fingerprint,request_fingerprint_key_version,release_policy_key,policy_version,policy_snapshot_digest,extractor_mode,pipeline_identity,result_affecting_options,submission_mode,status,attempt_count,max_attempts,available_at) values (:'job_id',:'user_id','synthetic01',:'request_fingerprint','r2','primary',:'policy_version',:'allowed_snapshot_digest','isolated_rehearsal','isolated_rehearsal','{}'::jsonb,'background_notify','queued',0,3,to_timestamp(:'now_epoch'));",
    ].join("\n"),
    variables: Object.freeze({ allowed_snapshot_digest: allowedSnapshotDigest, job_id: jobId, jti_hash: jtiHash, nickname: `r2-${runIdentity.slice(0, 8)}`, now_epoch: String(nowEpoch), policy_version: String(policyVersion), release_sha: releaseSha, request_fingerprint: allowedSnapshotDigest, schema_identity: schemaIdentity, social_id: `r2-${runIdentity}`, user_id: userId }),
    allowedVariableNames: Object.freeze(["allowed_snapshot_digest", "job_id", "jti_hash", "nickname", "now_epoch", "policy_version", "release_sha", "request_fingerprint", "schema_identity", "social_id", "user_id"]),
  });
}
