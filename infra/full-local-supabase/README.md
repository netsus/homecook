# Full-local Supabase runtime

This directory defines the isolated self-hosted Supabase foundation for the current Mac. It is feature-off until the later DB restore, OAuth provider, application adapter, backup, and Manual Only cutover gates pass.

## Safety boundary

- PostgreSQL, GoTrue, PostgREST, and Storage have no host ports.
- The internal Kong gateway is published only on `127.0.0.1` for the same-Mac Next.js server and S3 migration tools.
- The second loopback port is an Auth-only proxy. Every path outside `/auth/v1/*` returns `404`.
- Production secrets are generated into macOS Keychain, materialized outside the repository with directory mode `0700` and file mode `0600`, then mounted read-only under `/run/secrets`.
- `docker inspect .Config.Env`, Compose output, application logs, and repository files must contain no secret value.
- Named PostgreSQL and Storage volumes are preserved by the normal stop command.

## Operator sequence

The first two commands create non-secret config and the initial Keychain bundle. `bootstrap-secrets` refuses existing items unless `--replace` is explicitly supplied. Replacement is allowed only before the persistent PostgreSQL volume exists; live password rotation requires the later audited rotation runbook so Keychain and database roles cannot diverge.

```sh
pnpm full-local-production:init-config
pnpm full-local-production:bootstrap-secrets
pnpm full-local-production:validate
pnpm full-local-production:start
pnpm full-local-production:status
```

Stop containers without deleting data:

```sh
pnpm full-local-production:stop
```

Create or inventory a production backup only through the exact mode-0600 runtime config. The command verifies the Compose project/service labels, reviewed PostgreSQL image digest, healthy container, and labeled PostgreSQL/Storage named volumes before any read. It never falls back to the Supabase CLI development stack:

```bash
pnpm full-local-production:platform-inventory -- --config /absolute/path/.env.production.local
pnpm full-local-production:platform-backup -- --config /absolute/path/.env.production.local --output /absolute/off-mac/platform.tar.gz.enc
pnpm full-local-production:platform-backup:verify -- --archive /absolute/off-mac/platform.tar.gz.enc
```

Backup pauses only the exact production writer services for one bounded consistent cut, runs `pg_dump` inside the verified production PostgreSQL container, and snapshots the exact labeled Storage volume. A partial stop failure restarts every writer that was actually stopped. It never resets or removes an operating volume.

`FULL_LOCAL_BACKUP_READINESS_PATH` must be an absolute path in an external mode-0700 directory. After copying both the archive and its `.auth.json` sidecar to a distinct off-Mac filesystem device and completing a clean isolated restore verification manifest for that exact archive, record immutable readiness evidence:

```bash
pnpm full-local-production:backup-readiness:record -- \
  --config /absolute/path/.env.production.local \
  --archive /absolute/primary/platform.tar.gz.enc \
  --off-mac-copy /absolute/off-mac/platform.tar.gz.enc \
  --restore-manifest /absolute/evidence/restore-manifest.json \
  --output /absolute/state/full-local-backup-readiness.json \
  --confirm-off-mac-copy OFF_MAC_COPY_VERIFIED
```

`validate`, `start`, and `status` reject missing, stale (>24h), mismatched, symlinked, non-0600, incomplete-Storage, or wrong-production readiness evidence. Every gate re-authenticates and decrypts both archive copies with their sidecars and the Keychain key, verifies the restore manifest's own HMAC sidecar, and re-inventories the live Compose labels/image/health. Only `restore-platform` on fresh empty volumes can issue eligible clean-restore evidence; it binds the source roles/schema/data digests plus DB/Auth relation and Storage payload digests/counts. `stop` and isolated recovery commands remain available so a blocked runtime can be recovered without resetting operating data.

Do not start the persistent production volumes before the restore/cutover runbook says the same-maintenance Auth, application DB, and Storage snapshot is ready. The Docker integration test always uses disposable names and removes its volumes:

```sh
pnpm test:full-local-production:runtime
```

## Session lifecycle canary

Session refresh hotfix의 production T+65분/24시간/7일 검증은
`docs/engineering/full-local-session-lifecycle-runbook.md`를 따른다. 실제 로그인과 최소 planner write는 Manual Only이며, write 성공은 같은 run의 cleanup 성공까지 포함한다.

```sh
pnpm verify:full-local-session-refresh-lifecycle
pnpm verify:full-local-session-refresh-lifecycle:json
FULL_LOCAL_SESSION_CANARY_ADAPTER=/absolute/operator/path/session-canary-adapter.mjs \
  pnpm verify:full-local-session-production-canary -- --json --phase milestone-a-t65
```

adapter는 저장소 밖 canonical absolute path의 현재 사용자 소유 `0600` regular file이어야 한다. immediate parent도 현재 사용자 소유 canonical real directory이며 exact `0700`이어야 한다. child에는 최소 runtime allowlist만 전달하고 ambient token/app secret은 전달하지 않는다. adapter는 token/cookie/session/user ID를 반환하거나 출력하면 안 된다. 운영 stale count는 전체 로그 누적값이 아니라 deploy 시작 이후 delta로만 입력한다. post-deploy evidence는 `com.homecook.production` LaunchAgent가 exact implementation checkout을 실행 중일 때만 기록된다.
배포 관찰 시작 전 생성된 binding은 거부한다. `milestone-a-t65`/`milestone-a-24h`/`milestone-b-7d`는 각각 배포 후 binding부터 65분, deploy 관찰 시작부터 24시간, 7일 경계를 runner가 검증하며 adapter 무응답은 최대 20분 안에 fail closed한다.
후속 24h/7d phase는 같은 implementation root의 exact `milestone-a-t65.json`이 같은 implementation SHA와 T+65/canary PASS를 증명해야 한다. symlink·alias·missing·invalid prior evidence는 거부한다. `milestone-b-7d`는 Stage 5 policy merge 전 `verify:full-local-gotrue-session-policy`가 의도적으로 없어서 실행 불가/fail closed가 정상이다.
