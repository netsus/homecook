# YouTube extraction worker runbook

Status: Stage 2 runnable artifact; production activation Manual Only
Last updated: 2026-08-13

## Scope

This runbook covers deterministic standalone artifact build, runnable worker preflight, launchd plist rendering, credential metadata rehearsal, and dry-run lifecycle plans for `com.homecook.youtube-extraction-worker`. The artifact can poll the restricted loopback PostgREST endpoint and execute i031, but this document does not authorize installing or starting it on a production host.

It does not authorize:

- production or staging install
- DB migration apply
- policy enable
- credential issuance
- launchctl execution on a real production host
- queue mutation or rollback execution

## Inputs

The flow uses six attested file types.

1. `worker artifact manifest`
   - schema: `homecook.youtube-extraction-worker-artifact`
   - source: `scripts/youtube-extraction-worker-artifact.mjs build`
2. `app descriptor`
   - schema: `homecook.youtube-extraction-app-descriptor`
   - source: same build command sidecar output
3. `current policy snapshot`
   - schema: `homecook.youtube-extraction-current-policy`
   - operator-owned evidence file
4. `credential metadata`
   - schema: `homecook.youtube-extraction-worker-credential`
   - generated from a pre-created `0600` token file
5. `queue state`
   - schema: `homecook.youtube-extraction-queue-state`
   - operator-owned drain evidence file
6. `expected schema`
   - schema: `homecook.youtube-extraction-expected-schema`
   - immutable copy: `<artifact-dir>/scripts/manifests/youtube-extraction-expected-schema.json`

All secret-bearing files stay outside git and must use mode `0600`.

## Deterministic artifact build

Why: the worker and app must attest the same `release_sha`, `schema_identity`, and `allowed_snapshot_digest`.

```bash
node scripts/youtube-extraction-worker-artifact.mjs build \
  --release-sha 0123456789abcdef0123456789abcdef01234567 \
  --allowed-snapshot-digest 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  --artifact-dir /absolute/private/worker-release \
  --app-descriptor-output /absolute/private/app-descriptor.json
```

The manifest is deterministic:

- no timestamps
- stable sorted file list
- stable `artifact_sha256`
- no secrets
- read-only materialized files and directories
- entrypoint that runs from the artifact directory without the repository cwd

## Credential bootstrap and rotation dry-run

Why: the repo must validate file provenance without issuing a JWT.

Bootstrap:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs credential-bootstrap \
  --dry-run \
  --token-file /absolute/private/youtube-worker.jwt \
  --generation 1 \
  --jti-hash 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  --expires-at 2026-08-19T00:00:00.000Z \
  --release-sha 0123456789abcdef0123456789abcdef01234567 \
  --schema-identity youtube-extraction-worker-schema-v1 \
  --allowed-snapshot-digest 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  --output /absolute/private/worker-credential.json
```

Rotate:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs credential-rotate \
  --dry-run \
  --token-file /absolute/private/youtube-worker.jwt \
  --expected-generation 1 \
  --next-generation 2 \
  --jti-hash abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd \
  --expires-at 2026-08-26T00:00:00.000Z \
  --release-sha 0123456789abcdef0123456789abcdef01234567 \
  --schema-identity youtube-extraction-worker-schema-v1 \
  --allowed-snapshot-digest 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  --output /absolute/private/worker-credential-v2.json
```

The metadata stores:

- generation
- JTI hash
- expiry
- release attestation
- token file path
- token file mode
- token file sha256

It never stores the JWT itself.

## Preflight

Why: fail closed before install or enable.

```bash
node scripts/youtube-extraction-worker-mac-production.mjs preflight \
  --app-descriptor /absolute/private/app-descriptor.json \
  --manifest /absolute/private/worker-release/artifact.json \
  --policy /absolute/private/current-policy.json \
  --credential /absolute/private/worker-credential.json \
  --expected-schema /absolute/private/worker-release/scripts/manifests/youtube-extraction-expected-schema.json \
  --queue-state /absolute/private/queue-state.json
```

Required matches:

- `release_sha`
- `schema_identity`
- `policy_version`
- `allowed_snapshot_digest`
- `extractor_mode`
- `pipeline_identity`
- unexpired credential
- token file `0600`

Common blockers:

- `release_sha_mismatch`
- `schema_identity_mismatch`
- `allowed_snapshot_digest_mismatch`
- `policy_shape_mismatch`
- `credential_expired`
- `queue_snapshot_digest_mismatch`

The app enqueue process must point to the same installed evidence before the async flag is enabled:

```text
HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH=/absolute/private/app-descriptor.json
HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH=/absolute/private/worker-release/scripts/manifests/youtube-extraction-expected-schema.json
HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH=/absolute/private/worker-release/artifact.json
HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V1=<server-only secret>
```

Missing or mismatched descriptor, schema, manifest, policy snapshot, release SHA, credential expiry, or key version makes enqueue return `503 QUEUE_UNAVAILABLE` before the write RPC. Rotation adds the previous version secret by its versioned name; it never mixes a null version with a digest.

## launchd dry-run lifecycle

Why: rehearse the exact install/start/stop/restart/status/uninstall contract without touching production.

Install:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs install \
  --dry-run \
  --config /absolute/private/.env.production.local \
  --manifest /absolute/private/worker-release/artifact.json \
  --credential /absolute/private/worker-credential.json \
  --app-descriptor /absolute/private/app-descriptor.json \
  --policy /absolute/private/current-policy.json \
  --expected-schema /absolute/private/worker-release/scripts/manifests/youtube-extraction-expected-schema.json \
  --home-dir /Users/operator \
  --root-dir /absolute/private/worker-release
```

Other lifecycle commands:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs start --dry-run --home-dir /Users/operator
node scripts/youtube-extraction-worker-mac-production.mjs stop --dry-run --home-dir /Users/operator
node scripts/youtube-extraction-worker-mac-production.mjs restart --dry-run --home-dir /Users/operator
node scripts/youtube-extraction-worker-mac-production.mjs uninstall --dry-run --home-dir /Users/operator
```

`status` can parse a captured `launchctl print` output file:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs status \
  --launchctl-output /absolute/private/launchctl-print.txt \
  --user-id 501
```

Worker/manager JWT, signing/service-role key, user token, cookie, and fingerprint HMAC key are forbidden in:

- plist contents
- launchd `ProgramArguments`
- launchd environment and runner environment
- stdout / stderr logs

Only file paths are allowed.

The runner reads the restricted worker JWT from its `0600` credential token file. Provider credentials use a separate `0600` file referenced by `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE`; only the exact provider allowlist is passed to the isolated i031 child and values are never written to argv, plist, artifact, or logs.

## Drain and rollback rehearsal

Why: a rollback cannot begin while jobs or provider permits remain active.

Drain:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs drain \
  --app-descriptor /absolute/private/app-descriptor.json \
  --manifest /absolute/private/worker-release/artifact.json \
  --policy /absolute/private/current-policy.json \
  --credential /absolute/private/worker-credential.json \
  --queue-state /absolute/private/queue-state.json
```

`queue-state.json` must report:

- `queued_jobs = 0`
- `processing_jobs = 0`
- `permit_held = false`
- `maintenance_mode = true`

Rollback rehearsal:

```bash
node scripts/youtube-extraction-worker-mac-production.mjs rollback \
  --dry-run \
  --app-descriptor /absolute/private/previous-app-descriptor.json \
  --manifest /absolute/private/worker-release/artifact.json \
  --policy /absolute/private/current-policy.json \
  --credential /absolute/private/worker-credential.json \
  --queue-state /absolute/private/queue-state.json
```

The dry-run sequence is:

1. freeze enqueue publish
2. verify drain and permit release
3. boot out the worker service
4. reinstall the previous app release without rewinding additive schema
5. run the legacy sync endpoint smoke before re-opening the UI

## Health snapshot

Why: produce one redacted summary from status + preflight + drain evidence.

```bash
node scripts/youtube-extraction-worker-mac-production.mjs health \
  --app-descriptor /absolute/private/app-descriptor.json \
  --manifest /absolute/private/worker-release/artifact.json \
  --policy /absolute/private/current-policy.json \
  --credential /absolute/private/worker-credential.json \
  --queue-state /absolute/private/queue-state.json \
  --launchctl-output /absolute/private/launchctl-print.txt \
  --user-id 501
```

Health is only `ok=true` when:

- launchd is loaded
- state is `running` or `waiting`
- preflight is ready

## Manual-only boundary

Every non-dry-run install, launchd mutation, credential issuance, policy enable, queue mutation, and rollback execution remains manual only.

If a command is called without `--dry-run`, the script must fail closed instead of trying a live operation.
