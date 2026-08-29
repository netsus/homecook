const hex = (value, name) => { if (!/^[a-f0-9]{64}$/u.test(value ?? "")) throw new Error(`${name} must be 64-hex`); return value; };
/** Builds parameterized local-only fixture SQL for existing worker guard tables. */
export function buildIsolatedYoutubeWorkerSyntheticFixtureSql({ runIdentity, releaseSha, schemaIdentity, allowedSnapshotDigest, jtiHash, policyVersion = 1, nowEpoch }) {
  if (!/^[a-f0-9-]{16,}$/u.test(runIdentity ?? "") || !/^[a-f0-9]{40}$/u.test(releaseSha ?? "") || !schemaIdentity || !Number.isSafeInteger(nowEpoch)) throw new Error("isolated fixture identity is invalid");
  hex(allowedSnapshotDigest, "allowedSnapshotDigest"); hex(jtiHash, "jtiHash");
  return Object.freeze({
    sql: [
      "insert into private.youtube_extraction_current_policy(policy_key,policy_version,extractor_mode,pipeline_identity,result_affecting_options,fingerprint_key_version,enabled) values ('primary',$1,'isolated_rehearsal','isolated_rehearsal','{}'::jsonb,'r2',true);",
      "insert into private.youtube_extraction_worker_credentials(credential_name,current_generation,current_jti_hash,expires_at,release_sha,schema_identity,allowed_snapshot_digest) values ('primary',1,$2,to_timestamp($3)+interval '2 hours',$4,$5,$6);",
      "insert into public.youtube_extractor_permits(permit_key,permit_generation) values ('primary',0);",
    ].join("\n"),
    values: [policyVersion, jtiHash, nowEpoch, releaseSha, schemaIdentity, allowedSnapshotDigest],
  });
}
