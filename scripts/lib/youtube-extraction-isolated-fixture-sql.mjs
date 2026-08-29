const hex = (value, name) => { if (!/^[a-f0-9]{64}$/u.test(value ?? "")) throw new Error(`${name} must be 64-hex`); return value; };
/** Builds parameterized local-only fixture SQL for existing worker guard tables. */
export function buildIsolatedYoutubeWorkerSyntheticFixtureSql({ runIdentity, userId, jobId, releaseSha, schemaIdentity, allowedSnapshotDigest, jtiHash, policyVersion = 1, nowEpoch }) {
  if (!/^[a-f0-9-]{16,}$/u.test(runIdentity ?? "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(userId ?? "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(jobId ?? "") || !/^[a-f0-9]{40}$/u.test(releaseSha ?? "") || !schemaIdentity || !Number.isSafeInteger(nowEpoch)) throw new Error("isolated fixture identity is invalid");
  hex(allowedSnapshotDigest, "allowedSnapshotDigest"); hex(jtiHash, "jtiHash");
  return Object.freeze({
    sql: [
      "insert into private.youtube_extraction_current_policy(policy_key,policy_version,extractor_mode,pipeline_identity,result_affecting_options,fingerprint_key_version,enabled) values ('primary',$1,'isolated_rehearsal','isolated_rehearsal','{}'::jsonb,'r2',true);",
      "insert into private.youtube_extraction_worker_credentials(credential_name,current_generation,current_jti_hash,expires_at,release_sha,schema_identity,allowed_snapshot_digest) values ('primary',1,$2,to_timestamp($3)+interval '2 hours',$4,$5,$6);",
      "insert into public.youtube_extractor_permits(permit_key,permit_generation) values ('primary',0);",
      "insert into public.users(id,nickname,social_provider,social_id) values ($7,$8,'google',$9);",
      "insert into public.youtube_extraction_jobs(id,user_id,youtube_video_id,request_fingerprint,request_fingerprint_key_version,release_policy_key,policy_version,policy_snapshot_digest,extractor_mode,pipeline_identity,result_affecting_options,submission_mode,status,attempt_count,max_attempts,available_at) values ($10,$7,'synthetic01',$11,'r2','primary',$1,$6,'isolated_rehearsal','isolated_rehearsal','{}'::jsonb,'background_notify','queued',0,3,to_timestamp($3));",
    ].join("\n"),
    values: [policyVersion, jtiHash, nowEpoch, releaseSha, schemaIdentity, allowedSnapshotDigest, userId, `r2-${runIdentity.slice(0, 8)}`, `r2-${runIdentity}`, jobId, allowedSnapshotDigest],
  });
}
